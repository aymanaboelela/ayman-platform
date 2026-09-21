import { InMemoryAttemptStore, LoginThrottleService } from './login-throttle.service';

/**
 * S3 (rate limit keyed on identifier+IP jointly) and S4 (progressive delay,
 * auto-clearing soft lock) — written before `LoginThrottleService` existed and
 * re-pinned to the policy the platform owner asked for: six wrong tries inside
 * a quarter of an hour, then ten minutes locked.
 *
 * `makeService` injects a fake, manually-advanced clock instead of Jest fake
 * timers on `Date.now`, so the lock-expiry tests don't need to fake the whole
 * process's notion of time. The SAME clock goes to the store: its records
 * carry their own `forgetAfter`, and a store still reading the wall clock
 * would drop every record a fake-clocked service wrote as ancient.
 */
function makeService() {
  let currentTime = 1_000_000;
  const clock = () => currentTime;
  const advance = (ms: number) => {
    currentTime += ms;
  };
  const store = new InMemoryAttemptStore(clock);
  const service = new LoginThrottleService(store, clock);
  return { service, store, advance };
}

const LOCK_MS = 10 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;

describe('LoginThrottleService — S3: keyed on the identifier, not on IP alone or account alone', () => {
  it('two different IPs attacking the same identifier share a counter', () => {
    const { service } = makeService();
    service.recordFailure('victim@example.com', '1.1.1.1');
    service.recordFailure('victim@example.com', '1.1.1.1');
    service.recordFailure('victim@example.com', '1.1.1.1');
    // 4th attempt overall for this identifier, but from a *different* IP — if
    // IP were part of the bucket key, this would reset to attempt #1 (delay 0)
    // instead of continuing the shared count.
    const fourth = service.recordFailure('victim@example.com', '2.2.2.2');
    expect(fourth.delayMs).toBe(5_000);
  });

  it('locking one identifier from many IPs does not require all attempts from a single IP', () => {
    const { service } = makeService();
    const ips = ['10.0.0.1', '10.0.0.2', '10.0.0.3', '10.0.0.4', '10.0.0.5'];
    let last: { locked: boolean } | undefined;
    for (let i = 0; i < 6; i++) {
      last = service.recordFailure('victim@example.com', ips[i % ips.length] as string);
    }
    expect(last?.locked).toBe(true);
    expect(service.isLocked('victim@example.com')).toBe(true);
  });

  it('two different identifiers from the same IP do not collide', () => {
    const { service } = makeService();
    const attackerIp = '9.9.9.9';
    // Drive studentA to one attempt short of the lock from one IP.
    for (let i = 0; i < 5; i++) service.recordFailure('studentA@example.com', attackerIp);
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

describe('LoginThrottleService — S4: progressive delay, 2^n seconds capped at 5s', () => {
  it('attempts 1-3 are free (no delay)', () => {
    const { service } = makeService();
    expect(service.recordFailure('a@x.com', '1.1.1.1').delayMs).toBe(0);
    expect(service.recordFailure('a@x.com', '1.1.1.1').delayMs).toBe(0);
    expect(service.recordFailure('a@x.com', '1.1.1.1').delayMs).toBe(0);
  });

  /**
   * The cap came down from 30s to 5s with the threshold. The hook `await`s
   * this delay with the socket open, so the old cap let a bot pin a connection
   * for half a minute per deliberately-failed login at no cost to itself —
   * and with the lock now landing at six there are only two delayed attempts
   * for the delay to cover anyway.
   */
  it('attempt 4 is delayed, and never by more than 5 seconds', () => {
    const { service } = makeService();
    for (let i = 0; i < 3; i++) service.recordFailure('a@x.com', '1.1.1.1');
    expect(service.recordFailure('a@x.com', '1.1.1.1').delayMs).toBe(5_000);
  });

  it('attempt 5 stays capped at 5s', () => {
    const { service } = makeService();
    for (let i = 0; i < 4; i++) service.recordFailure('a@x.com', '1.1.1.1');
    expect(service.recordFailure('a@x.com', '1.1.1.1').delayMs).toBe(5_000);
  });
});

describe('LoginThrottleService — S4: soft lock at 6 attempts / 10 minutes, auto-clearing', () => {
  it('does not lock before the 6th failed attempt', () => {
    const { service } = makeService();
    for (let i = 0; i < 5; i++) {
      expect(service.recordFailure('a@x.com', '1.1.1.1').locked).toBe(false);
    }
    expect(service.isLocked('a@x.com')).toBe(false);
  });

  it('trips exactly at the 6th failed attempt', () => {
    const { service } = makeService();
    for (let i = 0; i < 5; i++) service.recordFailure('a@x.com', '1.1.1.1');
    const sixth = service.recordFailure('a@x.com', '1.1.1.1');
    expect(sixth.locked).toBe(true);
    expect(service.isLocked('a@x.com')).toBe(true);
  });

  it('auto-clears after 10 minutes with no admin action', () => {
    const { service, advance } = makeService();
    for (let i = 0; i < 6; i++) service.recordFailure('a@x.com', '1.1.1.1');
    expect(service.isLocked('a@x.com')).toBe(true);

    advance(LOCK_MS - 1);
    expect(service.isLocked('a@x.com')).toBe(true); // one ms before expiry, still locked

    advance(1);
    expect(service.isLocked('a@x.com')).toBe(false); // expiry reached, auto-cleared
  });

  it('a cleared lock gives the account a clean slate, not a lingering high count', () => {
    const { service, advance } = makeService();
    for (let i = 0; i < 6; i++) service.recordFailure('a@x.com', '1.1.1.1');
    advance(LOCK_MS);
    expect(service.isLocked('a@x.com')).toBe(false);
    // Next failure after the lock cleared should be treated as attempt #1
    // again (free, no delay) — not attempt #7.
    expect(service.recordFailure('a@x.com', '1.1.1.1').delayMs).toBe(0);
  });

  /**
   * The counter expiring on its own is new, and it is the difference between
   * a control aimed at an attacker and one that fires on students. With no
   * window, six mistypes spread across a whole school year locked the account
   * on the sixth.
   */
  it('failures older than the 15-minute window do not count toward the lock', () => {
    const { service, advance } = makeService();
    for (let i = 0; i < 5; i++) service.recordFailure('a@x.com', '1.1.1.1');

    advance(WINDOW_MS);

    const afterWindow = service.recordFailure('a@x.com', '1.1.1.1');
    expect(afterWindow.locked).toBe(false);
    // Attempt #1 of a fresh window, so free again.
    expect(afterWindow.delayMs).toBe(0);
    expect(service.isLocked('a@x.com')).toBe(false);
  });

  it('six failures INSIDE the window still lock, however they are spread', () => {
    const { service, advance } = makeService();
    for (let i = 0; i < 5; i++) {
      service.recordFailure('a@x.com', '1.1.1.1');
      advance(60_000); // five minutes total — comfortably inside the window
    }
    expect(service.recordFailure('a@x.com', '1.1.1.1').locked).toBe(true);
  });

  it('recordSuccess clears the counter entirely', () => {
    const { service } = makeService();
    for (let i = 0; i < 5; i++) service.recordFailure('a@x.com', '1.1.1.1');
    service.recordSuccess('a@x.com');
    expect(service.recordFailure('a@x.com', '1.1.1.1').delayMs).toBe(0);
    expect(service.isLocked('a@x.com')).toBe(false);
  });

  it('keys are case- and whitespace-normalised', () => {
    const { service } = makeService();
    for (let i = 0; i < 3; i++) service.recordFailure('Student@Example.com', '1.1.1.1');
    // Same account, different casing/whitespace — must be the same bucket.
    const fourth = service.recordFailure('  student@example.com  ', '1.1.1.1');
    expect(fourth.delayMs).toBe(5_000);
  });
});

/**
 * «ولو طبعًا كتبها برضه غلط أكتر من مرة، تقدر تقوله تواصل مع البشمهندس» — the
 * repeat signal that routes a student to WhatsApp instead of to a third ten
 * minutes of guessing. It is the one piece of state that has to SURVIVE the
 * lock it describes, which is why the record is no longer deleted on expiry.
 */
describe('LoginThrottleService — a second lockout is distinguishable from the first', () => {
  it('the first lock is not repeated', () => {
    const { service } = makeService();
    for (let i = 0; i < 5; i++) service.recordFailure('a@x.com', '1.1.1.1');
    expect(service.recordFailure('a@x.com', '1.1.1.1').repeated).toBe(false);
    expect(service.lockState('a@x.com')?.repeated).toBe(false);
  });

  it('a second lock after the first expired IS repeated', () => {
    const { service, advance } = makeService();
    for (let i = 0; i < 6; i++) service.recordFailure('a@x.com', '1.1.1.1');
    advance(LOCK_MS);
    expect(service.isLocked('a@x.com')).toBe(false);

    for (let i = 0; i < 6; i++) service.recordFailure('a@x.com', '1.1.1.1');
    expect(service.lockState('a@x.com')?.repeated).toBe(true);
  });

  /**
   * The bug this rules out: `LoginSecurityService` records a failure against
   * the account bucket on EVERY failed attempt, including ones that land while
   * that bucket is already locked. If those re-tripped the lock, the second
   * wrong password after a lockout would report «اتقفل تاني» and send a
   * student to WhatsApp over what is, to them, a first lockout.
   */
  it('attempts against an already-locked bucket do not count as further lockouts', () => {
    const { service } = makeService();
    for (let i = 0; i < 6; i++) service.recordFailure('a@x.com', '1.1.1.1');
    for (let i = 0; i < 20; i++) {
      expect(service.recordFailure('a@x.com', '1.1.1.1').repeated).toBe(false);
    }
    expect(service.lockState('a@x.com')?.repeated).toBe(false);
  });

  it('clear() forgets the lock history too, so an admin reset is a clean slate', () => {
    const { service, advance } = makeService();
    for (let i = 0; i < 6; i++) service.recordFailure('a@x.com', '1.1.1.1');
    service.clear('a@x.com');
    advance(1);
    for (let i = 0; i < 6; i++) service.recordFailure('a@x.com', '1.1.1.1');
    expect(service.lockState('a@x.com')?.repeated).toBe(false);
  });
});

describe('LoginThrottleService — the ledger cannot be grown without bound', () => {
  it('reports how long a lock has left, rounded by the caller not here', () => {
    const { service, advance } = makeService();
    for (let i = 0; i < 6; i++) service.recordFailure('a@x.com', '1.1.1.1');
    advance(60_000);
    expect(service.lockState('a@x.com')?.retryAfterMs).toBe(LOCK_MS - 60_000);
  });

  /**
   * Every key in this map is a string the attacker typed. Keeping `lockCount`
   * past an expired lock would otherwise have turned "remember the lockout"
   * into "never forget any identifier anybody has ever guessed" — an
   * attacker-controlled allocation inside the API process, and a dead API
   * container answers 404 for the whole domain, not just for `/api`.
   */
  it('forgets a plain counter once its memory window has passed', () => {
    const { service, store, advance } = makeService();
    service.recordFailure('one-off@example.com', '1.1.1.1');
    expect(store.size()).toBe(1);

    advance(6 * 60 * 60 * 1000 + 1);
    // Read through the service, which is how every real caller reaches it.
    expect(service.isLocked('one-off@example.com')).toBe(false);
    expect(store.size()).toBe(0);
  });

  it('keeps a live lock well past the counter it replaced', () => {
    const { service, store, advance } = makeService();
    for (let i = 0; i < 6; i++) service.recordFailure('locked@example.com', '1.1.1.1');
    advance(LOCK_MS - 1);
    expect(service.isLocked('locked@example.com')).toBe(true);
    expect(store.size()).toBe(1);
  });
});
