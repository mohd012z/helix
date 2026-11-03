import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeTelegramApi,
  makeOffsetStore,
  makeAnswerCallback,
  makeRespond,
  runCallbackPollLoop,
} from '../../macro/bbma/telegram-poller.mjs';

// ---- fakes ---------------------------------------------------------------
function fakeFetch(script) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({url, body: JSON.parse(opts?.body ?? '{}')});
    const next = script[Math.min(calls.length - 1, script.length - 1)];
    if (next.throws) {
      const e = new Error('boom');
      Object.assign(e, next.throws);
      throw e;
    }
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status ?? 200,
      json: async () => ({ok: true, result: next.result}),
    };
  };
  return {fn, calls};
}

function fakeFs(initial) {
  const store = new Map(Object.entries(initial ?? {}));
  return {
    readFileSync: (p) => {
      if (!store.has(p)) {
        const e = new Error('ENOENT');
        e.code = 'ENOENT';
        throw e;
      }
      return store.get(p);
    },
    writeFileSync: (p, s) => store.set(p, s),
    mkdirSync: () => {},
  };
}

const cb = (id, data, chatId = 30006405) => ({
  update_id: id,
  callback_query: {id: `q${id}`, data, message: {message_id: 1, chat: {id: chatId}}},
});

// ---- makeTelegramApi ------------------------------------------------------
test('makeTelegramApi returns result on ok', async () => {
  const {fn} = fakeFetch([{status: 200, result: {ok: true, foo: 1}}]);
  const api = makeTelegramApi({fetchFn: fn, token: 'TOK'});
  const r = await api('getMe');
  assert.deepEqual(r, {ok: true, foo: 1});
});

test('makeTelegramApi maps 409 to status + telegramCode 409', async () => {
  const {fn} = fakeFetch([{status: 409, result: {ok: false, error_code: 409, description: 'Conflict'}}]);
  const api = makeTelegramApi({fetchFn: fn, token: 'TOK'});
  await assert.rejects(api('getUpdates'), (e) => e.status === 409 && e.telegramCode === 409);
});

// ---- makeOffsetStore ------------------------------------------------------
test('offset store loads persisted offset and saves advancing it', () => {
  const fs = fakeFs({'/x/off.json': JSON.stringify({offset: 100})});
  const os = makeOffsetStore({fs, path: {dirname: () => '/x'}, filePath: '/x/off.json'});
  assert.equal(os.load(), 100);
  os.save(101);
  assert.equal(os.load(), 101);
});

test('offset store returns 0 when no file / malformed', () => {
  const os = makeOffsetStore({fs: fakeFs({}), path: {dirname: () => '/x'}, filePath: '/x/off.json'});
  assert.equal(os.load(), 0);
});

// ---- runCallbackPollLoop --------------------------------------------------
test('loop consumes authorized callback exactly once and advances offset', async () => {
  const {fn, calls} = fakeFetch([
    {status: 200, result: [cb(1, 'bbma:mtf:alert-1')]},           // getUpdates
    {status: 200, result: {message_id: 500}},                     // handleUpdate → respond (sendMessage)
    {status: 200, result: []},                                    // next getUpdates (empty -> stop)
  ]);
  const handled = [];
  const api = makeTelegramApi({fetchFn: fn, token: 'TOK'});
  const os = makeOffsetStore({fs: fakeFs({}), path: {dirname: () => '/x'}, filePath: '/x/off.json'});
  const {cycles, offset} = await runCallbackPollLoop({
    api,
    offsetStore: os,
    authorizedChat: '30006405',
    sleep: async () => {},
    log: () => {},
    maxCycles: 2,
    handleUpdate: async (u, {respond}) => { handled.push(u.callback_query.data); await respond({chatId: '30006405', text: 'ok'}); },
  });
  assert.deepEqual(handled, ['bbma:mtf:alert-1']);
  assert.equal(offset, 2);
  assert.equal(cycles, 2);
  // sendMessage must target the authorized chat
  const send = calls.find((c) => c.url.endsWith('/sendMessage'));
  assert.equal(send.body.chat_id, '30006405');
});

test('loop ignores unauthorized chat and does not send a reply', async () => {
  const {fn, calls} = fakeFetch([
    {status: 200, result: [cb(1, 'bbma:mtf:alert-1', 99999)]},   // wrong chat
    {status: 200, result: {}},                                    // answerCallbackQuery (unauthorized)
    {status: 200, result: []},
  ]);
  const api = makeTelegramApi({fetchFn: fn, token: 'TOK'});
  const os = makeOffsetStore({fs: fakeFs({}), path: {dirname: () => '/x'}, filePath: '/x/off.json'});
  let handled = 0;
  await runCallbackPollLoop({
    api, offsetStore: os, authorizedChat: '30006405',
    sleep: async () => {}, log: () => {}, maxCycles: 1,
    handleUpdate: () => { handled += 1; },
  });
  assert.equal(handled, 0);
  assert.ok(!calls.some((c) => c.url.endsWith('/sendMessage')), 'no reply to unauthorized chat');
});

test('loop waits on 409 (another poller) without crashing or advancing offset', async () => {
  let sleeps = 0;
  const {fn} = fakeFetch([
    {status: 409, result: {ok: false, error_code: 409, description: 'Conflict'}}, // 409 (cycle 1)
    {status: 200, result: [cb(5, 'bbma:news:alert-2')]},                          // cycle 2: [cb5], handler makes no api call
    {status: 200, result: []},                                                    // cycle 3
    {status: 200, result: []},                                                    // cycle 4
  ]);
  const api = makeTelegramApi({fetchFn: fn, token: 'TOK'});
  const os = makeOffsetStore({fs: fakeFs({}), path: {dirname: () => '/x'}, filePath: '/x/off.json'});
  const handled = [];
  await runCallbackPollLoop({
    api, offsetStore: os, authorizedChat: '30006405',
    sleep: async () => { sleeps += 1; }, log: () => {}, maxCycles: 4,
    handleUpdate: (u) => handled.push(u.callback_query.data),
  });
  assert.ok(sleeps >= 1, 'slept at least once for the 409');
  assert.deepEqual(handled, ['bbma:news:alert-2']);
});

test('loop resumes from a persisted offset (no reprocess / no loss)', async () => {
  const {fn, calls} = fakeFetch([
    {status: 200, result: [cb(10, 'bbma:evidence:alert-3')]}, // only updates >= persisted offset
    {status: 200, result: []},
    {status: 200, result: []},
  ]);
  const api = makeTelegramApi({fetchFn: fn, token: 'TOK'});
  const os = makeOffsetStore({fs: fakeFs({'/x/off.json': JSON.stringify({offset: 10})}), path: {dirname: () => '/x'}, filePath: '/x/off.json'});
  const handled = [];
  await runCallbackPollLoop({
    api, offsetStore: os, authorizedChat: '30006405',
    sleep: async () => {}, log: () => {}, maxCycles: 2,
    handleUpdate: (u) => handled.push(u.callback_query.data),
  });
  // getUpdates must be sent with offset=10 (the persisted value)
  const getUpdates = calls.find((c) => c.url.endsWith('/getUpdates'));
  assert.equal(getUpdates.body.offset, 10);
  assert.deepEqual(handled, ['bbma:evidence:alert-3']);
});

test('callback acknowledgment stops after one 409 retry rather than recursing forever', async () => {
  let attempts = 0;
  const answer = makeAnswerCallback({api: async () => {
    attempts += 1;
    const e = new Error('conflict');
    e.status = 409;
    throw e;
  }});
  assert.equal(await answer({callbackQueryId: 'q1', text: 'Loaded'}), false);
  assert.equal(attempts, 2);
});

test('callback acknowledgment sends only supported Bot API fields', async () => {
  let payload;
  const answer = makeAnswerCallback({api: async (method, body) => {
    assert.equal(method, 'answerCallbackQuery');
    payload = body;
    return true;
  }});
  assert.equal(await answer({callbackQueryId: 'q1', text: 'Loaded'}), true);
  assert.deepEqual(payload, {callback_query_id: 'q1', text: 'Loaded', show_alert: false});
});

test('sendMessage wraps keyboard rows in Telegram inline_keyboard object', async () => {
  let payload;
  const respond = makeRespond({api: async (method, body) => {
    assert.equal(method, 'sendMessage');
    payload = body;
    return {message_id: 11};
  }});
  const keyboard = [[{text: 'Status', callback_data: 'bbma:status:XAUUSD'}]];
  await respond({chatId: 123, text: 'Status', parse_mode: 'HTML', reply_markup: keyboard});
  assert.deepEqual(payload.reply_markup, {inline_keyboard: keyboard});
  assert.equal(payload.chat_id, 123);
});

test('sendMessage without keyboard does not add reply_markup', async () => {
  let payload;
  await makeRespond({api: async (_method, body) => {payload = body; return {message_id: 12};}})
    ({chatId: 123, text: 'No keyboard'});
  assert.equal(Object.hasOwn(payload, 'reply_markup'), false);
});
