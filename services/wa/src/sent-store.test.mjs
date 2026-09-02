import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SentStore } from './sent-store.mjs';

test('gives back what it was told to remember', () => {
  const store = new SentStore();
  store.remember('ABC', { conversation: 'أهلاً' });
  assert.deepEqual(store.get({ id: 'ABC' }), { conversation: 'أهلاً' });
});

test('an unknown id is undefined, not a guess', () => {
  const store = new SentStore();
  store.remember('ABC', { conversation: 'أهلاً' });
  assert.equal(store.get({ id: 'XYZ' }), undefined);
});

test('a key with no id at all is undefined rather than a throw', () => {
  const store = new SentStore();
  assert.equal(store.get(undefined), undefined);
  assert.equal(store.get(null), undefined);
  assert.equal(store.get({}), undefined);
});

test('refuses to store a send that has no id — it could never be looked up', () => {
  const store = new SentStore();
  store.remember(null, { conversation: 'x' });
  store.remember(undefined, { conversation: 'x' });
  store.remember('', { conversation: 'x' });
  assert.equal(store.size, 0);
});

test('refuses to store an empty body — Baileys must be told "I cannot help"', () => {
  // A malformed body is worse than none: `undefined` makes Baileys stop, a
  // broken protobuf gets delivered as a broken message.
  const store = new SentStore();
  store.remember('ABC', null);
  store.remember('DEF', undefined);
  assert.equal(store.size, 0);
});

test('evicts the oldest once full, and keeps the newest', () => {
  const store = new SentStore(3);
  for (const id of ['a', 'b', 'c', 'd']) store.remember(id, { conversation: id });
  assert.equal(store.size, 3);
  assert.equal(store.get({ id: 'a' }), undefined);
  assert.deepEqual(store.get({ id: 'd' }), { conversation: 'd' });
});

test('re-remembering an id moves it to the back of the eviction queue', () => {
  const store = new SentStore(3);
  store.remember('a', { conversation: 'a' });
  store.remember('b', { conversation: 'b' });
  store.remember('a', { conversation: 'a2' });
  store.remember('c', { conversation: 'c' });
  store.remember('d', { conversation: 'd' });

  // 'b' is now the oldest, not 'a'.
  assert.equal(store.get({ id: 'b' }), undefined);
  assert.deepEqual(store.get({ id: 'a' }), { conversation: 'a2' });
});

test('holds a full campaign at the default size', () => {
  // DEFAULT_PACING.dailyCap is 200, so the default must clear a day's sending
  // by a wide margin or a retry for this morning's message finds nothing.
  const store = new SentStore();
  for (let i = 0; i < 200; i++) store.remember(`id-${i}`, { conversation: `m${i}` });
  assert.deepEqual(store.get({ id: 'id-0' }), { conversation: 'm0' });
  assert.equal(store.size, 200);
});
