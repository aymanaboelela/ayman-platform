/**
 * S3 + S4 bookkeeping: how many times has this account failed to log in
 * recently, and is it currently soft-locked.
 *
 * Keyed on the normalised email alone — deliberately NOT on a composite
 * `email+IP` string. See `./login-throttle.service.spec.ts` for the two
 * properties this has to satisfy simultaneously: (a) attempts against the
 * same account from *different* IPs must accumulate into one counter — a
 * composite key would let an attacker bypass the whole control just by
 * rotating IPs against a fixed victim account, which is a strictly worse
 * bug than either of the two extremes S3 rules out; (b) attempts against
 * *different* accounts from the same IP must never collide — which is what
 * an IP-keyed (or IP-primary) design would do, locking out an entire
 * school's NAT over one bad actor. Keying on email alone satisfies both.
 * `ip` is still accepted and recorded on every attempt (see `AttemptRecord`)
 * so it's available for logging/future extension — "jointly" describes the
 * two dimensions this control has to reason about, not a literal compound
 * map key. The raw per-IP request *rate* (as opposed to per-account
 * lockout) is already covered by the app-wide `ThrottlerModule` in
 * `app.module.ts`.
 *
 * The soft lock this drives is intentionally not permanent (S4:
 * "auto-clearing, no admin action required") — that's what keeps an
 * email-keyed lock from becoming the "botnet locks out a victim
 * indefinitely" attack S3's table warns about; a botnet can force a 15
 * minute lock, never longer.
 */

export interface AttemptRecord {
  count: number;
  lockedUntil: number | null;
  lastIp: string;
}

/**
 * Storage port. `InMemoryAttemptStore` below is correct for a single
 * instance; swapping to Redis later means implementing this interface
 * against a Redis client (e.g. `HSET`/`HGETALL`/`DEL` on a key per email)
 * and changing one constructor argument — no caller of `LoginThrottleService`
 * needs to change.
 */
export interface AttemptStore {
  get(key: string): AttemptRecord | undefined;
  set(key: string, record: AttemptRecord): void;
  delete(key: string): void;
}

export class InMemoryAttemptStore implements AttemptStore {
  private readonly records = new Map<string, AttemptRecord>();

  get(key: string): AttemptRecord | undefined {
    return this.records.get(key);
  }

  set(key: string, record: AttemptRecord): void {
    this.records.set(key, record);
  }

  delete(key: string): void {
    this.records.delete(key);
  }
}

/** Attempts 1-3 are free (no artificial delay). */
const FREE_ATTEMPTS = 3;
/** Delay grows as 2^n seconds from the 4th attempt, never exceeding this. */
const MAX_DELAY_SECONDS = 30;
/** The Nth failed attempt trips the soft lock. */
const LOCK_THRESHOLD = 10;
/** Soft lock duration — auto-clears, no admin action required. */
export const LOCK_DURATION_MS = 15 * 60 * 1000;

export function normalizeThrottleKey(email: string): string {
  return email.trim().toLowerCase();
}

/** `2^attemptCount` seconds, capped at `MAX_DELAY_SECONDS`, free for the first 3 attempts. */
export function computeDelayMs(attemptCount: number): number {
  if (attemptCount <= FREE_ATTEMPTS) return 0;
  const seconds = Math.min(2 ** attemptCount, MAX_DELAY_SECONDS);
  return seconds * 1000;
}

export interface FailureResult {
  delayMs: number;
  locked: boolean;
}

export class LoginThrottleService {
  constructor(
    private readonly store: AttemptStore = new InMemoryAttemptStore(),
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Whether `email` is currently soft-locked. An expired lock is cleared as
   * a side effect of checking — this is what makes S4's "auto-clearing, no
   * admin action required" true: the very next check (or attempt) after the
   * 15 minutes elapse resets the account, not a background sweep.
   */
  isLocked(email: string): boolean {
    const key = normalizeThrottleKey(email);
    const record = this.store.get(key);
    if (!record?.lockedUntil) return false;
    if (record.lockedUntil <= this.now()) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Records a failed login attempt for `email` from `ip` and returns the
   * delay the caller should apply before responding, plus whether this
   * attempt just tripped the soft lock.
   */
  recordFailure(email: string, ip: string): FailureResult {
    const key = normalizeThrottleKey(email);
    const existing = this.store.get(key);
    const count = (existing?.count ?? 0) + 1;
    const locked = count >= LOCK_THRESHOLD;
    this.store.set(key, {
      count,
      lockedUntil: locked ? this.now() + LOCK_DURATION_MS : null,
      lastIp: ip,
    });
    return { delayMs: computeDelayMs(count), locked };
  }

  /** A successful login clears the account's attempt history entirely. */
  recordSuccess(email: string): void {
    this.store.delete(normalizeThrottleKey(email));
  }
}
