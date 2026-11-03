/* Pure DI Telegram callback poll-loop core. No network, no fs, no timers
 * except what the caller injects — every transport and clock is a parameter
 * so the loop is unit-testable with fakes (see tests/js/bbma-telegram-poller-loop.test.mjs).
 *
 * The continuous local poller (scripts/poll-bbma-telegram-continuous.mjs) is a
 * thin main over this module. Invariant: getUpdates is EXCLUSIVE per token —
 * exactly one consumer process may run per bot (a second one gets 409 and
 * waits; that is the designed behavior, not an error).
 */

const DEFAULT_BACKOFF_BASE_MS = 2000;
const DEFAULT_BACKOFF_MAX_MS = 30000;

function makeNoopLog() {
  return () => {};
}

export function makeTelegramApi({fetchFn = fetch, token, log = makeNoopLog()} = {}) {
  if (!fetchFn) throw new TypeError('fetchFn is required');
  if (!token) throw new TypeError('token is required');
  return async (method, payload = {}) => {
    const r = await fetchFn(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || j?.ok !== true) {
      const e = new Error(`Telegram ${method} failed (${r.status}/${j?.error_code ?? 'unknown'})`);
      e.status = r.status;
      e.telegramCode = j?.error_code ?? (r.status === 409 ? 409 : null);
      e.description = j?.description ?? '';
      log(`api_error method=${method} status=${r.status}`);
      throw e;
    }
    return j.result;
  };
}

export function makeOffsetStore({fs, path, filePath, log = makeNoopLog()} = {}) {
  if (!fs || !path || !filePath) throw new TypeError('fs, path, filePath are required');
  return Object.freeze({
    load() {
      try {
        const o = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const n = Number(o?.offset);
        if (Number.isFinite(n) && n > 0) return n;
      } catch {
        /* no state yet */
      }
      return 0;
    },
    save(n) {
      try {
        fs.mkdirSync(path.dirname(filePath), {recursive: true});
        fs.writeFileSync(filePath, JSON.stringify({offset: n, updated_at: new Date().toISOString()}) + '\n');
        return true;
      } catch (e) {
        // A failed offset save must not kill the loop: the next getUpdates
        // (same offset) will re-deliver and the offset will advance again.
        log(`offset_save=FAIL reason=${e?.message}`);
        return false;
      }
    },
  });
}

export function makeAnswerCallback({api, log = makeNoopLog()} = {}) {
  const answer = async ({callbackQueryId, text}) => {
    try {
      await api('answerCallbackQuery', {callback_query_id: callbackQueryId, text, show_alert: false, show_checkmark: true});
      log('callback_ack=OK');
      return true;
    } catch (e) {
      // 409 = another poller answered first (or is mid-answer) — one retry is
      // enough: if we still lose, the other consumer owns the ack.
      if (e?.status === 409) return answer({callbackQueryId, text});
      // 400 STALE: Telegram keeps callback queries only ~24h. Do NOT throw —
      // the reply message itself is still worth sending.
      if (e?.status === 400) {
        log('callback_ack=STALE_400');
        return false;
      }
      throw e;
    }
  };
  return answer;
}

export function makeRespond({api, log = makeNoopLog()} = {}) {
  return async ({chatId, text, parse_mode}) => {
    const x = await api('sendMessage', {chat_id: chatId, text, parse_mode});
    log(`response_send=OK message_id=${x?.message_id ?? '?'}`);
    return x;
  };
}

/**
 * Run the getUpdates loop. Resolves after `maxCycles` cycles (tests) or runs
 * forever (production passes maxCycles=Infinity). A "cycle" is one successful
 * or failed getUpdates round-trip; 409/429/backoff rounds each count.
 */
export async function runCallbackPollLoop({
  api,
  offsetStore,
  handleUpdate,
  authorizedChat,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  log = makeNoopLog(),
  onCycle = null,
  maxCycles = Infinity,
  backoffBaseMs = DEFAULT_BACKOFF_BASE_MS,
  backoffMaxMs = DEFAULT_BACKOFF_MAX_MS,
} = {}) {
  if (typeof api !== 'function') throw new TypeError('api is required');
  if (!offsetStore || typeof offsetStore.load !== 'function' || typeof offsetStore.save !== 'function') {
    throw new TypeError('offsetStore {load,save} is required');
  }
  if (typeof handleUpdate !== 'function') throw new TypeError('handleUpdate is required');
  if (!authorizedChat) throw new TypeError('authorizedChat is required');

  const answerCallback = makeAnswerCallback({api, log});
  const respond = makeRespond({api, log});

  let offset = offsetStore.load();
  log(`start offset=${offset}`);
  let cycles = 0;
  let backoff = backoffBaseMs;

  while (cycles < maxCycles) {
    if (onCycle) {
      try {
        await onCycle();
      } catch (e) {
        log(`on_cycle_failed=${e?.message}`);
      }
    }

    let updates;
    try {
      updates = await api('getUpdates', {offset, timeout: 30, allowed_updates: ['callback_query']});
      backoff = backoffBaseMs;
    } catch (e) {
      cycles += 1;
      if (e?.status === 409) {
        // Another poller (manual GH dispatch, duplicate instance) holds the
        // queue. Wait the base interval and re-poll; NEVER crash.
        log('conflict_409 wait (another poller in-flight)');
        await sleep(backoffBaseMs);
        continue;
      }
      if (e?.status === 429) {
        const retryAfter = Math.min(30, (e?.description?.match(/retry after ([0-9]+)/i)?.[1]) | 0 || 30);
        log(`rate_limited_429 retry_after=${retryAfter}s`);
        await sleep(retryAfter * 1000);
        continue;
      }
      log(`poll_error=${e?.message}`);
      await sleep(backoff);
      backoff = Math.min(backoffMaxMs, backoff * 2);
      continue;
    }

    for (const u of updates) {
      offset = Math.max(offset, Number(u.update_id) + 1);
      offsetStore.save(offset);
      const q = u.callback_query;
      const data = String(q?.data ?? '');
      const [scope, action, ...idParts] = data.split(':');
      const alertId = idParts.join(':');
      log(`callback_received action=${action ?? 'UNKNOWN'} alert_id=${alertId.slice(0, 64)}`);

      const chat = String(q?.message?.chat?.id ?? '');
      if (chat !== authorizedChat) {
        log('authorized=false');
        if (q?.id) await answerCallback({callbackQueryId: q.id, text: 'Unauthorized chat'});
        continue;
      }
      log('authorized=true');

      try {
        await handleUpdate(u, {answerCallback, respond});
        log(`routed=${scope === 'bbma'} action=${action ?? 'UNKNOWN'}`);
      } catch (e) {
        log(`processing_failed=${e?.message}`);
      }
    }

    cycles += 1;
  }
  return {cycles, offset};
}
