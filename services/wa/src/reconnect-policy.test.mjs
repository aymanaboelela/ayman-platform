import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Backoff, CLOSE, classifyClose } from './reconnect-policy.mjs';

describe('classifyClose', () => {
  it('401 clears the revoked credentials and waits for a human', () => {
    assert.equal(classifyClose(CLOSE.loggedOut).action, 'clear-and-wait');
  });

  it('403 stops — a banned account must not be hammered every five seconds', () => {
    const { action, detail } = classifyClose(CLOSE.forbidden);
    assert.equal(action, 'stop');
    assert.match(detail, /403/u);
  });

  it('411 stops WITHOUT wiping: nothing revoked these credentials', () => {
    assert.equal(classifyClose(CLOSE.multideviceMismatch).action, 'stop');
  });

  it('515 after a scan reconnects at once, not after a backoff', () => {
    assert.equal(classifyClose(CLOSE.restartRequired).action, 'reconnect-now');
  });

  it('440 backs off like any transient failure — never a tug-of-war', () => {
    assert.equal(classifyClose(CLOSE.connectionReplaced).action, 'reconnect');
  });

  it('network-ish codes and an unknown close reconnect', () => {
    for (const status of [CLOSE.timedOut, CLOSE.connectionClosed, CLOSE.badSession, CLOSE.unavailableService, 499, undefined]) {
      assert.equal(classifyClose(status).action, 'reconnect', String(status));
    }
    assert.equal(classifyClose(undefined).detail, 'closed');
    assert.equal(classifyClose(499).detail, 'closed: 499');
  });

  it('every detail carries the code, because the code is what gets searched for', () => {
    for (const status of Object.values(CLOSE)) {
      assert.match(classifyClose(status).detail, new RegExp(String(status), 'u'));
    }
  });
});

describe('Backoff', () => {
  it('starts at the old fixed beat and doubles', () => {
    const b = new Backoff(5_000, 300_000);
    assert.deepEqual([b.next(), b.next(), b.next(), b.next()], [5_000, 10_000, 20_000, 40_000]);
  });

  it('is capped — an outage costs a dozen handshakes an hour, not seven hundred', () => {
    const b = new Backoff(5_000, 300_000);
    for (let i = 0; i < 20; i += 1) b.next();
    assert.equal(b.next(), 300_000);
  });

  it('reset on a successful open brings the next drop back to the short beat', () => {
    const b = new Backoff(5_000, 300_000);
    b.next();
    b.next();
    b.reset();
    assert.equal(b.failures, 0);
    assert.equal(b.next(), 5_000);
  });
});
