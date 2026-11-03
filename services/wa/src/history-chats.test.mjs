import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HistoryChats, historyUrl, isPersonMessage, jidKind, phoneOfPn, toSeconds } from './history-chats.mjs';
import { inboundText } from './inbound.mjs';

const quiet = { info() {}, warn() {}, error() {} };

/** A timer double: callbacks run only when the test says so. */
function manualTimers() {
  const pending = [];
  return {
    setTimer: (fn, delay) => {
      const handle = { fn, delay, cancelled: false };
      pending.push(handle);
      return handle;
    },
    clearTimer: (handle) => {
      if (handle) handle.cancelled = true;
    },
    async runAll() {
      while (pending.length) {
        const next = pending.shift();
        if (!next.cancelled) await next.fn();
      }
      // Let the flush promise chain settle.
      await new Promise((resolve) => setImmediate(resolve));
    },
    get delays() {
      return pending.filter((h) => !h.cancelled).map((h) => h.delay);
    },
  };
}

function make({ send, selfPhone = () => '+201000000000', ...rest } = {}) {
  const timers = manualTimers();
  const sent = [];
  const history = new HistoryChats({
    send: send ?? (async (entries) => {
      sent.push(entries);
      return { ok: true, status: 200 };
    }),
    logger: quiet,
    selfPhone,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    ...rest,
  });
  return { history, timers, sent };
}

const msg = (remoteJid, id, { fromMe = false, at = 1_760_000_000, text = 'سر', stub, alt } = {}) => ({
  key: { remoteJid, id, fromMe, ...(alt ? { remoteJidAlt: alt } : {}) },
  messageTimestamp: at,
  ...(stub ? { messageStubType: stub } : { message: { conversation: text } }),
});

test('jid helpers', () => {
  assert.equal(jidKind('201012345678@s.whatsapp.net'), 'pn');
  assert.equal(jidKind('1234@lid'), 'lid');
  assert.equal(jidKind('1234@hosted.lid'), 'lid');
  assert.equal(jidKind('1203630@g.us'), null);
  assert.equal(jidKind('status@broadcast'), null);
  assert.equal(jidKind('123@newsletter'), null);
  assert.equal(phoneOfPn('201012345678:3@s.whatsapp.net'), '+201012345678');
  assert.equal(phoneOfPn('1234@lid'), null);
  // A protobuf Long has a decimal toString().
  assert.equal(toSeconds({ toString: () => '1760000000' }), 1_760_000_000);
  assert.equal(toSeconds(0), null);
});

test('stubs and protocol messages are not "they wrote"', () => {
  assert.equal(isPersonMessage(msg('a@s.whatsapp.net', '1')), true);
  assert.equal(isPersonMessage(msg('a@s.whatsapp.net', '1', { stub: 1 })), false);
  assert.equal(isPersonMessage({ key: {}, message: { protocolMessage: { type: 0 } } }), false);
  assert.equal(isPersonMessage({ key: {}, message: { messageContextInfo: {} } }), false);
});

test('one entry per phone: chats, inbound counts, timestamps — and never a body', async () => {
  const { history, timers, sent } = make();
  const result = await history.observe({
    chats: [
      { id: '201011111111@s.whatsapp.net', conversationTimestamp: 1_760_000_100 },
      { id: '201022222222@s.whatsapp.net', conversationTimestamp: 1_760_000_000 },
      { id: '1203630@g.us', conversationTimestamp: 1_760_000_000 },
      // Our own "message yourself" chat.
      { id: '201000000000@s.whatsapp.net' },
    ],
    messages: [
      msg('201011111111@s.whatsapp.net', 'a1', { at: 1_760_000_050 }),
      msg('201011111111@s.whatsapp.net', 'a2', { at: 1_760_000_100 }),
      msg('201011111111@s.whatsapp.net', 'a3', { fromMe: true, at: 1_760_000_090 }),
      msg('201011111111@s.whatsapp.net', 'a4', { stub: 2 }),
      // Only we ever wrote here.
      msg('201022222222@s.whatsapp.net', 'b1', { fromMe: true }),
      msg('1203630@g.us', 'g1'),
    ],
  });
  assert.deepEqual(result, { chats: 2, unresolved: 0 });

  await timers.runAll();
  assert.equal(sent.length, 1);
  const byPhone = new Map(sent[0].map((entry) => [entry.phone, entry]));
  assert.deepEqual([...byPhone.keys()].sort(), ['+201011111111', '+201022222222']);
  assert.deepEqual(byPhone.get('+201011111111'), {
    phone: '+201011111111',
    hasChat: true,
    theyWroteToUs: true,
    inboundCount: 2,
    lastMessageAt: new Date(1_760_000_100_000).toISOString(),
    lastInboundAt: new Date(1_760_000_100_000).toISOString(),
  });
  assert.equal(byPhone.get('+201022222222').theyWroteToUs, false);
  assert.equal(JSON.stringify(sent).includes('سر'), false);
});

test('a LID chat is resolved through the event, then through the library store', async () => {
  const { history, timers, sent } = make();
  const asked = [];
  const result = await history.observe(
    {
      chats: [
        { id: '111@lid' },
        { id: '222@lid', pnJid: '201033333333@s.whatsapp.net' },
        { id: '333@lid' },
        { id: '444@lid' },
      ],
      lidPnMappings: [{ lid: '111@lid', pn: '201044444444@s.whatsapp.net' }],
      messages: [msg('333@lid', 'c1')],
    },
    async (lid) => {
      asked.push(lid);
      return lid === '333@lid' ? '201055555555@s.whatsapp.net' : null;
    },
  );
  assert.deepEqual(result, { chats: 3, unresolved: 1 });
  assert.deepEqual(asked.sort(), ['333@lid', '444@lid']);

  await timers.runAll();
  const byPhone = new Map(sent[0].map((entry) => [entry.phone, entry]));
  assert.deepEqual([...byPhone.keys()].sort(), ['+201033333333', '+201044444444', '+201055555555']);
  assert.equal(byPhone.get('+201055555555').inboundCount, 1);
});

test('overlapping chunks are not double counted; the report is a running total', async () => {
  const { history, timers, sent } = make();
  const chunk = { chats: [{ id: '201011111111@s.whatsapp.net' }], messages: [msg('201011111111@s.whatsapp.net', 'x1')] };
  await history.observe(chunk);
  await history.observe(chunk);
  await history.observe({ messages: [msg('201011111111@s.whatsapp.net', 'x2')] });
  await timers.runAll();
  assert.equal(sent.length, 1);
  assert.equal(sent[0][0].inboundCount, 2);
});

test('posts in batches', async () => {
  const { history, timers, sent } = make({ batchSize: 2 });
  await history.observe({
    chats: ['201011111111', '201022222222', '201033333333'].map((n) => ({ id: `${n}@s.whatsapp.net` })),
  });
  await timers.runAll();
  assert.deepEqual(sent.map((batch) => batch.length), [2, 1]);
});

test('a failed post is retried with backoff and lands; a 4xx is final', async () => {
  let calls = 0;
  const landed = [];
  const { history, timers } = make({
    send: async (entries) => {
      calls += 1;
      if (calls === 1) return { ok: false, status: 503 };
      landed.push(entries);
      return { ok: true, status: 200 };
    },
    retryDelaysMs: [1000, 2000],
  });
  await history.observe({ chats: [{ id: '201011111111@s.whatsapp.net' }] });
  await timers.runAll();
  assert.equal(calls, 2);
  assert.equal(landed.length, 1);

  let refused = 0;
  const final = make({
    send: async () => {
      refused += 1;
      return { ok: false, status: 404 };
    },
  });
  await final.history.observe({ chats: [{ id: '201011111111@s.whatsapp.net' }] });
  await final.timers.runAll();
  assert.equal(refused, 1);
  assert.deepEqual(final.timers.delays, []);
});

test('reset (unlink) forgets the old number’s history and its pending posts', async () => {
  const { history, timers, sent } = make();
  await history.observe({ chats: [{ id: '201011111111@s.whatsapp.net' }] });
  history.reset();
  await timers.runAll();
  assert.equal(sent.length, 0);
});

test('the history notification itself has no text, so the inbound relay never forwards it', () => {
  // What `messages.upsert` carries for a history sync: the protocol message
  // that POINTS at the history, never the old messages themselves.
  const notification = { protocolMessage: { type: 5, historySyncNotification: { syncType: 0 } } };
  assert.equal(inboundText(notification), '');
});

test('the report URL defaults to the inbound route’s sibling', () => {
  assert.equal(
    historyUrl({ WA_INBOUND_URL: 'http://api:3300/api/marketing/wa/inbound' }), // gitleaks:allow — an internal route path, not a secret
    'http://api:3300/api/marketing/wa/history',
  );
  assert.equal(historyUrl({ WA_HISTORY_URL: 'http://x/h', WA_INBOUND_URL: 'http://api/inbound' }), 'http://x/h');
  assert.equal(historyUrl({}), '');
});
