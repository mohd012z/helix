/** Persistent or bounded Telegram polling with explicit single-consumer failure. */
export async function runTelegramPolling({
  api, handleUpdate, allowedChat, answerUnauthorized = async () => {},
  continuous = false, pollWindowMs = 45000, initialOffset = 0,
  shouldStop = () => false, now = Date.now,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  diagnostic = () => {},
}) {
  if (!/^-?\d+$/.test(String(allowedChat)) || !Number.isFinite(pollWindowMs) ||
      pollWindowMs < 1 || !Number.isSafeInteger(initialOffset) || initialOffset < 0) {
    throw new Error('Invalid Telegram polling configuration');
  }
  const fatal = error => [400, 401, 403, 409].includes(error.status ?? error.telegramCode);
  const safeError = error => new Error(`Telegram configuration failure ${error.status ?? error.telegramCode}; listener stopped`);
  let webhook;
  try { webhook = await api('getWebhookInfo', {}); }
  catch (error) { if (fatal(error)) throw safeError(error); throw new Error('Telegram startup transport failure'); }
  if (webhook?.url) throw new Error('Active Telegram webhook; refusing to replace another consumer');
  const deadline = now() + Math.min(pollWindowMs, 55000);
  let offset = initialOffset, failures = 0, received = 0, handled = 0;
  while (!shouldStop() && (continuous || now() < deadline)) {
    try {
      const remaining = continuous ? 25000 : Math.max(0, deadline - now());
      const updates = await api('getUpdates', {offset,
        timeout: Math.min(25, Math.floor(remaining / 1000)), allowed_updates: ['callback_query']});
      if (!Array.isArray(updates)) throw new Error('Invalid Telegram updates');
      for (const update of updates) {
        if (shouldStop()) break;
        if (!Number.isSafeInteger(update?.update_id) || update.update_id < offset) {
          throw new Error('Invalid Telegram update ID');
        }
        received++;
        const callback = update.callback_query;
        if (String(callback?.message?.chat?.id ?? '') !== String(allowedChat)) {
          if (callback?.id) await answerUnauthorized(callback.id);
        } else {
          await handleUpdate(update);
          handled++;
        }
        // Advance only after response/denial. A failed response is retried.
        offset = update.update_id + 1;
      }
      failures = 0;
      diagnostic({event: 'poll_ok', received, handled});
    } catch (error) {
      if (fatal(error)) throw safeError(error);
      failures++;
      diagnostic({event: 'retry', failures});
      const delay = Math.min(30000, 1000 * 2 ** Math.min(failures, 5));
      await wait(continuous ? delay : Math.max(0, Math.min(delay, deadline - now())));
    }
  }
  // Confirm the last handled batch on graceful shutdown as well as bounded exit.
  // This request does not confirm any unprocessed update at/above offset.
  if (offset > initialOffset) {
    try {
      await api('getUpdates', {offset, timeout: 0, limit: 1, allowed_updates: ['callback_query']});
    } catch (error) {
      if (fatal(error)) throw safeError(error);
      throw new Error('Telegram final acknowledgement transport failure');
    }
  }
  return {offset, received, handled};
}
