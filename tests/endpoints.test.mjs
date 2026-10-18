import test from 'node:test';
import assert from 'node:assert/strict';
import { auditEndpoint, ENDPOINTS } from '../config/endpoints.mjs';

test('endpoint groups are centralized', () => {
  assert.deepEqual(Object.keys(ENDPOINTS).sort(), ['config','history','live','pulse']);
});

test('neutral HTTPS endpoint is accepted', () => {
  assert.deepEqual(auditEndpoint('https://api.example.test/feed'), { ok: true, reasons: [] });
});

test('remote HTTP is rejected', () => {
  assert.equal(auditEndpoint('http://example.test/feed').ok, false);
  assert.ok(auditEndpoint('http://example.test/feed').reasons.includes('https_required'));
});

test('localhost HTTP is allowed only when explicitly requested', () => {
  assert.equal(auditEndpoint('http://localhost:8080/feed').ok, false);
  assert.equal(auditEndpoint('http://localhost:8080/feed', { allowLocalhost: true }).ok, true);
});

test('embedded credentials are rejected', () => {
  const result = auditEndpoint('https://user:pass@example.test/feed');
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('embedded_credentials'));
});

test('legacy raw GitHub runtime coupling is flagged', () => {
  const result = auditEndpoint('https://raw.githubusercontent.com/mohd012z/xau-desk-daily/main/data.json');
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('legacy_repository_coupling'));
});

test('SVG namespace is ignored by scanner, but ordinary insecure HTTP is still rejected', async () => {
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const { scanEndpointFiles } = await import('../tools/endpoint-audit.mjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'helix-endpoint-'));
  try {
    await fs.writeFile(path.join(root, 'safe.js'), "const SVG = 'http://www.w3.org/2000/svg';\n");
    assert.deepEqual(await scanEndpointFiles(root), []);
    await fs.writeFile(path.join(root, 'bad.js'), "const API = 'http://insecure.example/feed';\n");
    const findings = await scanEndpointFiles(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'bad.js');
    assert.ok(findings[0].reasons.includes('https_required'));
  } finally {
    await fs.rm(root, { recursive:true, force:true });
  }
});
