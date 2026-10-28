import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

// Dynamic import lets RED report the missing runtime as an assertion failure.
async function runtime() {
  const module = await import('../../macro/bbma/telegram-polling.mjs').catch(() => null);
  assert.ok(module, 'persistent Telegram polling runtime must exist');
  return module.runTelegramPolling;
}

test('Actions invocation skips an externally owned bot before accessing credentials', () => {
  const env = {...process.env, GITHUB_ACTIONS: 'true', TELEGRAM_RUNTIME: 'persistent'};
  delete env.TELEGRAM_BOT_TOKEN;
  delete env.TELEGRAM_CHAT_ID;
  const result = spawnSync(process.execPath, ['scripts/poll-bbma-telegram.mjs'], {env, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /another runtime owns updates/);
});

test('continuous polling handles more than one batch and confirms final update', async () => {
  const run = await runtime();
  const requests = [], handled = [];
  let stop = false, polls = 0;
  const api = async (method, payload) => {
    requests.push([method, payload]);
    if (method === 'getWebhookInfo') return {url: ''};
    if (payload.timeout === 0) return [];
    polls++;
    return [{update_id: polls, callback_query: {message: {chat: {id: 123}}}}];
  };
  await run({api, allowedChat: '123', continuous: true,
    shouldStop: () => stop, wait: async () => {},
    handleUpdate: async update => {handled.push(update.update_id); if (handled.length === 2) stop = true;}});
  assert.deepEqual(handled, [1, 2]);
  assert.equal(requests.at(-1)[1].offset, 3);
  assert.equal(requests.at(-1)[1].timeout, 0);
});

test('active webhook fails before polling without deleting it', async () => {
  const run = await runtime();
  const methods = [];
  await assert.rejects(run({allowedChat: '123',
    api: async method => {methods.push(method); return {url: 'https://existing.example'};},
    handleUpdate: async () => {}}), /webhook/);
  assert.deepEqual(methods, ['getWebhookInfo']);
});

test('409 conflict fails immediately without an endless retry loop', async () => {
  const run = await runtime();
  let calls = 0;
  await assert.rejects(run({allowedChat: '123', continuous: true,
    api: async method => {if (method === 'getWebhookInfo') return {url: ''};
      calls++; throw Object.assign(new Error('secret URL'), {status: 409});},
    handleUpdate: async () => {}}), /409/);
  assert.equal(calls, 1);
});

test('failed callback is retried before acknowledging it', async () => {
  const run = await runtime();
  const offsets = [];
  let attempts = 0, stop = false;
  await run({allowedChat: '123', continuous: true, shouldStop: () => stop, wait: async () => {},
    api: async (method, payload) => {
      if (method === 'getWebhookInfo') return {url: ''};
      offsets.push(payload.offset);
      return payload.timeout === 0 ? [] : [{update_id: 7, callback_query: {message: {chat: {id: 123}}}}];
    },
    handleUpdate: async () => {attempts++; if (attempts === 1) throw new Error('network'); stop = true;}});
  assert.equal(attempts, 2);
  assert.deepEqual(offsets, [0, 0, 8]);
});

test('unauthorized callback is denied without routing it', async () => {
  const run = await runtime();
  let stop = false;
  const denied = [];
  await run({allowedChat: '123', continuous: true, shouldStop: () => stop,
    api: async (method, payload) => method === 'getWebhookInfo' ? {url: ''} :
      payload.timeout === 0 ? [] : [{update_id: 8, callback_query: {id: 'cb', message: {chat: {id: 999}}}}],
    answerUnauthorized: async id => {denied.push(id); stop = true;},
    handleUpdate: async () => assert.fail('unauthorized callback was routed')});
  assert.deepEqual(denied, ['cb']);
});

test('bounded mode still exits when its deadline expires', async () => {
  const run = await runtime();
  let clock = 0, calls = 0;
  await run({allowedChat: '123', pollWindowMs: 1000, now: () => clock,
    api: async method => {
      if (method === 'getWebhookInfo') return {url: ''};
      calls++; clock = 1000; return [];
    }, handleUpdate: async () => assert.fail('empty batch routed')});
  assert.equal(calls, 1);
});
