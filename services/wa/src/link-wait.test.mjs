import assert from 'node:assert/strict';
import { test } from 'node:test';
import { waitForLinkProgress } from './link-wait.mjs';

/** A clock that only moves when the code under test sleeps. */
function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
    advance: (ms) => {
      t += ms;
    },
  };
}

test('returns immediately when a code is already on screen', async () => {
  const clock = fakeClock();
  let polls = 0;
  const result = await waitForLinkProgress(
    () => {
      polls += 1;
      return { qr: 'data:image/png;base64,x', state: 'linking' };
    },
    { now: clock.now, sleep: clock.sleep, timeoutMs: 10_000, pollMs: 250 },
  );

  assert.equal(result, 'qr');
  // Checked before the first sleep — a second click while the QR is up must
  // not sit through a wait for something it already has.
  assert.equal(polls, 1);
  assert.equal(clock.now(), 0);
});

test('waits for a code that arrives partway through, then returns', async () => {
  const clock = fakeClock();
  let reads = 0;
  const result = await waitForLinkProgress(
    () => {
      reads += 1;
      // Baileys delivers on its own schedule; here, the fifth look.
      return reads >= 5 ? { qr: 'data:…', state: 'linking' } : { qr: null, state: 'disconnected' };
    },
    { now: clock.now, sleep: clock.sleep, timeoutMs: 10_000, pollMs: 250 },
  );

  assert.equal(result, 'qr');
  assert.equal(clock.now(), 1000, 'four 250ms sleeps, not the full ceiling');
});

test('returns as soon as the handshake completes without ever showing a code', async () => {
  // The already-paired path: credentials on the volume resume a session, so
  // there is no QR to wait for and waiting the full ceiling would be a bug.
  const clock = fakeClock();
  let reads = 0;
  const result = await waitForLinkProgress(
    () => {
      reads += 1;
      return reads >= 3 ? { qr: null, state: 'connected' } : { qr: null, state: 'disconnected' };
    },
    { now: clock.now, sleep: clock.sleep, timeoutMs: 10_000, pollMs: 250 },
  );

  assert.equal(result, 'connected');
  assert.equal(clock.now(), 500);
});

test('gives up at the ceiling rather than hanging the request forever', async () => {
  const clock = fakeClock();
  const result = await waitForLinkProgress(() => ({ qr: null, state: 'disconnected' }), {
    now: clock.now,
    sleep: clock.sleep,
    timeoutMs: 1000,
    pollMs: 250,
  });

  assert.equal(result, 'timeout');
  // The ceiling is a bound, not a target: it stops AT it, never past it.
  assert.equal(clock.now(), 1000);
});

test('a zero timeout still reads state once and answers', async () => {
  // Degenerate config must not become an infinite loop or an extra sleep.
  const clock = fakeClock();
  const result = await waitForLinkProgress(() => ({ qr: null, state: 'disconnected' }), {
    now: clock.now,
    sleep: clock.sleep,
    timeoutMs: 0,
    pollMs: 250,
  });

  assert.equal(result, 'timeout');
  assert.equal(clock.now(), 0);
});
