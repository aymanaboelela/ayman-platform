import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConnectWatchdog } from './connect-watchdog.mjs';

/** A controllable clock so the watchdog's real-time behaviour is testable
 *  without waiting on real timers or a live Baileys socket. */
function fakeClock(start = 0) {
  let now = start;
  const clock = () => now;
  clock.advance = (ms) => {
    now += ms;
  };
  return clock;
}

test('is not stuck before it has ever been armed', () => {
  const watchdog = new ConnectWatchdog(30_000, fakeClock());
  assert.equal(watchdog.armed, false);
  assert.equal(watchdog.isStuck(), false);
});

test('is not stuck immediately after touch()', () => {
  const clock = fakeClock();
  const watchdog = new ConnectWatchdog(30_000, clock);
  watchdog.touch();
  assert.equal(watchdog.armed, true);
  assert.equal(watchdog.isStuck(), false);
});

test('becomes stuck once timeoutMs elapses with no further touch()', () => {
  const clock = fakeClock();
  const watchdog = new ConnectWatchdog(30_000, clock);
  watchdog.touch();

  clock.advance(29_999);
  assert.equal(watchdog.isStuck(), false);

  clock.advance(1);
  assert.equal(watchdog.isStuck(), true);
});

test('a fresh touch() (e.g. a QR refresh) pushes the deadline back', () => {
  const clock = fakeClock();
  const watchdog = new ConnectWatchdog(30_000, clock);
  watchdog.touch();

  // A long-running but healthy QR pairing: reissued every 20s, never once
  // going quiet for the full 30s timeout.
  for (let i = 0; i < 10; i += 1) {
    clock.advance(20_000);
    watchdog.touch();
    assert.equal(watchdog.isStuck(), false, `should not be stuck at tick ${i}`);
  }
});

test('disarm() clears the deadline — a completed handshake stops being watched', () => {
  const clock = fakeClock();
  const watchdog = new ConnectWatchdog(30_000, clock);
  watchdog.touch();
  watchdog.disarm();

  assert.equal(watchdog.armed, false);
  clock.advance(1_000_000);
  assert.equal(watchdog.isStuck(), false);
});

test('re-arming after disarm() starts a fresh deadline', () => {
  const clock = fakeClock();
  const watchdog = new ConnectWatchdog(30_000, clock);
  watchdog.touch();
  clock.advance(29_000);
  watchdog.disarm();

  watchdog.touch();
  clock.advance(29_000);
  assert.equal(watchdog.isStuck(), false);
  clock.advance(1_001);
  assert.equal(watchdog.isStuck(), true);
});

test('overdueBy() is false while merely stuck, true only past the extra grace', () => {
  const clock = fakeClock();
  const watchdog = new ConnectWatchdog(30_000, clock);
  watchdog.touch();

  clock.advance(30_000); // exactly at the isStuck() deadline
  assert.equal(watchdog.isStuck(), true);
  assert.equal(watchdog.overdueBy(15_000), false);

  clock.advance(14_999);
  assert.equal(watchdog.overdueBy(15_000), false);

  clock.advance(1);
  assert.equal(watchdog.overdueBy(15_000), true);
});

test('overdueBy() is false when never armed or already disarmed', () => {
  const clock = fakeClock();
  const watchdog = new ConnectWatchdog(30_000, clock);
  assert.equal(watchdog.overdueBy(15_000), false);

  watchdog.touch();
  watchdog.disarm();
  clock.advance(1_000_000);
  assert.equal(watchdog.overdueBy(15_000), false);
});
