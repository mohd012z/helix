/**
 * A deliberately narrow URL validator for the official Finviz Maps embed feature.
 * No scraping, undocumented endpoint discovery, external scripts or raw HTML injection.
 * The URL must be supplied by the user via Finviz's own Maps > Embed Map dialog.
 */
const ALLOWED_ORIGINS = new Set([
  'https://finviz.com',
  'https://www.finviz.com',
  'https://elite.finviz.com',
]);
const SENSITIVE = /(?:password|passwd|token|secret|api[_-]?key|session|cookie|auth|authorization|credential|access[_-]?key)/i;

export function validateMapEmbed(input) {
  if (typeof input !== 'string' || !input.trim() || input.length > 2400) {
    throw new TypeError('Supply a Finviz Maps embed URL or iframe code (max 2,400 characters)');
  }
  let supplied = input.trim();
  if (supplied.startsWith('<')) {
    if (!/^<iframe\s/i.test(supplied)) throw new TypeError('Only official iframe code is accepted');
    const match = supplied.match(/\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)')/i);
    if (!match) throw new TypeError('The iframe must contain a quoted src URL');
    supplied = (match[1] ?? match[2]).replaceAll('&amp;', '&');
  }
  let url;
  try { url = new URL(supplied); } catch { throw new TypeError('Invalid embed URL'); }
  if (!ALLOWED_ORIGINS.has(url.origin) || url.username || url.password || url.port) {
    throw new TypeError('Only HTTPS Finviz-hosted map URLs without credentials are accepted');
  }
  // Finviz's public article documents the generator, not its exact URL syntax.
  // Support both its existing /map route and map-scoped embed routes; fail closed
  // on any other Finviz page, even if on the legitimate domain.
  const path = url.pathname.toLowerCase();
  if (!(/^\/map(?:\.ashx)?\/?$/.test(path) ||
        /^\/maps?\/embed\/?$/.test(path) ||
        /^\/embed\/maps?(?:\/[a-z0-9_-]+)?\/?$/.test(path) ||
        /^\/map\/embed\/?$/.test(path))) {
    throw new TypeError('URL must refer to a map or map embed on Finviz');
  }
  if (url.hash || url.search.length > 1600 || [...url.searchParams.keys()].some(k => SENSITIVE.test(k))) {
    throw new TypeError('Embed URL contains unsupported or sensitive parameters');
  }
  return url.href;
}
