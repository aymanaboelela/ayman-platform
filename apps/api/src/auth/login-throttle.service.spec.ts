import { InMemoryAttemptStore, LoginThrottleService } from './login-throttle.service';

/**
 * S3 (rate limit keyed on email+IP jointly) and S4 (progressive delay,
 * auto-clearing soft lock) — written before `LoginThrottleService` exists.
 *
 * `makeService` injects a fake, manually-advanced clock instead of Jest fake
 * timers on `Date.now`, so the 15-minute lock-expiry test doesn't need to
 * fake the whole process's notion of time.
 */
function makeService() {
  let currentTime = 1_000_000;
  const clock = () => currentTime;
  const advance = (ms: number) => {
    currentTime += ms;
  };
  const service = new LoginThrottleService(new InMemoryAttemptStore(), clock);
  return { service, advance };
}

describe('LoginThrottleService — S3: keyed on email, not on IP alone or account alone', () => {
  it('two different IPs attacking the same email share a counter', () => {
    const { service } = makeService();
    service.recordFailure('victim@example.com', '1.1.1.1');
    service.recordFailure('victim@example.com', '1.1.1.1');
    service.recordFailure('victim@example.com', '1.1.1.1');
    // 4th attempt overall for this email, but from a *different* IP — if IP
    // were part of the bucket key, this would reset to attempt #1 (delay 0)
    // instead of continuing the shared count.
    const fourth = service.recordFailure('victim@example.com', '2.2.2.2');
    expect(fourth.delayMs).toBe(16_000);
  });

  it('locking one email from many IPs does not require all attempts from a single IP', () => {
    const { service } = makeService();
    const ips = ['10.0.0.1', '10.0.0.2', '10.0.0.3', '10.0.0.4', '10.0.0.5'];
    let last: { delayMs: number; locked: boolean } | undefined;
    for (let i = 0; i < 10; i++) {
      last = service.recordFailure('victim@example.com', ips[i % ips.length] as string);
    }
    expect(last?.locked).toBe(true);
    expect(service.isLocked('victim@example.com')).toBe(true);
  });

  it('two different emails from the same IP do not collide', () => {
    const { service } = makeService();
    const attackerIp = '9.9.9.9';
    // Drive studentA close to the lock threshold from one IP.
    for (let i = 0; i < 9; i++) service.recordFailure('studentA@example.com', attackerIp);
    expect(service.isLocked('studentA@example.com')).toBe(false);

    // A completely different account, attempted from the *same* IP, must
    // start fresh at attempt #1 — if the bucket were keyed on IP alone, this
    // would inherit studentA's near-locked count (or even collide directly
    // with a shared IP-only counter and lock out a student who never
    // mistyped their own password).
    const first = service.recordFailure('studentB@example.com', attackerIp);
    expect(first.delayMs).toBe(0);
    expect(first.locked).toBe(false);
    expect(service.isLocked('studentB@example.com')).toBe(false);
  });
});

describe('LoginThrottleService — S4: progressive delay, 2^n seconds capped at 30s', () => {
  it('attempts 1-3 are free (no delay)', () => {
    const { service } = makeService();
    expect(service.recordFailure('a@x.com', '1.1.1.1').delayMs).toBe(0);
    expect(service.recordFailure('a@x.com', '1.1.1.1').delayMs).toBe(0);
    expect(service.recordFailure('a@x.com', '1.1.1.1').delayMs).toBe(0);
  });

  it('attempt 4 delays 2^4 = 16 seconds', () => {
    const { service } = makeService();
    for (let i = 0; i < 3; i++) service.recordFailure('a@x.com', '1.1.1.1');
    expect(service.recordFailure('a@x.com', '1.1.1.1').delayMs).toBe(16_000);
  });

  it('attempt 5 would be 2^5=32s, capped at 30s', () => {
    const { service } = makeService();
    for (let i = 0; i < 4; i++) service.recordFailure('a@x.com', '1.1.1.1');
    expect(service.recordFailure('a@x.com', '1.1.1.1').delayMs).toBe(30_000);
  });

  it('attempt 9 stays capped at 30s, never exceeds it', () => {
    const { service } = makeService();
    for (let i = 0; i < 8; i++) service.recordFailure('a@x.com', '1.1.1.1');
    expect(service.recordFailure('a@x.com', '1.1.1.1').delayMs).toBe(30_000);
  });
});

describe('LoginThrottleService — S4: soft lock at 10 attempts / 15 minutes, auto-clearing', () => {
  it('does not lock before the 10th failed attempt', () => {
    const { service } = makeService();
    for (let i = 0; i < 9; i++) {
      expect(service.recordFailure('a@x.com', '1.1.1.1').locked).toBe(false);
    }
    expect(service.isLocked('a@x.com')).toBe(false);
  });

  it('trips exactly at the 10th failed attempt', () => {
    const { service } = makeService();
    for (let i = 0; i < 9; i++) service.recordFailure('a@x.com', '1.1.1.1');
    const tenth = service.recordFailure('a@x.com', '1.1.1.1');
    expect(tenth.locked).toBe(true);
    expect(service.isLocked('a@x.com')).toBe(true);
  });

  it('auto-clears after 15 minutes with no admin action', () => {
    const { service, advance } = makeService();
    for (let i = 0; i < 10; i++) service.recordFailure('a@x.com', '1.1.1.1');
    expect(service.isLocked('a@x.com')).toBe(true);

    advance(15 * 60 * 1000 - 1);
    expect(service.isLocked('a@x.com')).toBe(true); // one ms before expiry, still locked

    advance(1);
    expect(service.isLocked('a@x.com')).toBe(false); // expiry reached, auto-cleared
  });

  it('a cleared lock gives the account a clean slate, not a lingering high count', () => {
    const { service, advance } = makeService();
    for (let i = 0; i < 10; i++) service.recordFailure('a@x.com', '1.1.1.1');
    advance(15 * 60 * 1000);
    expect(service.isLocked('a@x.com')).toBe(false);
    // Next failure after the lock cleared should be treated as attempt #1
    // again (free, no delay) — not attempt #11.
    expect(service.recordFailure('a@x.com', '1.1.1.1').delayMs).toBe(0);
  });

  it('recordSuccess clears the counter entirely', () => {
    const { service } = makeService();
    for (let i = 0; i < 5; i++) service.recordFailure('a@x.com', '1.1.1.1');
    service.recordSuccess('a@x.com');
    expect(service.recordFailure('a@x.com', '1.1.1.1').delayMs).toBe(0);
    expect(service.isLocked('a@x.com')).toBe(false);
  });

  it('email keys are case- and whitespace-normalised', () => {
    const { service } = makeService();
    for (let i = 0; i < 3; i++) service.recordFailure('Student@Example.com', '1.1.1.1');
    // Same account, different casing/whitespace — must be the same bucket.
    const fourth = service.recordFailure('  student@example.com  ', '1.1.1.1');
    expect(fourth.delayMs).toBe(16_000);
  });
});
