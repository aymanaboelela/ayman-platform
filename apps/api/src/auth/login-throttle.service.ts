/**
 * S3 + S4 bookkeeping: how many times has this bucket failed to log in
 * recently, is it currently soft-locked, and has it been locked before.
 *
 * Keyed on a caller-supplied bucket string — deliberately NOT on a composite
 * `identifier+IP` one. See `./login-throttle.service.spec.ts` for the two
 * properties this has to satisfy simultaneously: (a) attempts against the
 * same account from *different* IPs must accumulate into one counter — a
 * composite key would let an attacker bypass the whole control just by
 * rotating IPs against a fixed victim account, which is a strictly worse
 * bug than either of the two extremes S3 rules out; (b) attempts against
 * *different* accounts from the same IP must never collide — which is what
 * an IP-keyed (or IP-primary) design would do, locking out an entire
 * school's NAT over one bad actor. Keying on the identifier alone satisfies
 * both. `ip` is still accepted and recorded on every attempt (see
 * `AttemptRecord`) so it's available for logging/future extension —
 * "jointly" describes the two dimensions this control has to reason about,
 * not a literal compound map key. The raw per-IP request *rate* (as opposed
 * to per-account lockout) is already covered by the app-wide
 * `ThrottlerModule` in `app.module.ts`.
 *
 * The soft lock this drives is intentionally not permanent (S4:
 * "auto-clearing, no admin action required") — that's what keeps an
 * identifier-keyed lock from becoming the "botnet locks out a victim
 * indefinitely" attack S3's table warns about; a botnet can force a ten
 * minute lock, never longer.
 *
 * ## Two buckets per account, not one
 *
 * `LoginSecurityService` drives TWO buckets per attempt: the submitted
 * identifier (`email:…` / `phone:…`) and, once the lookup has resolved one,
 * the account itself (`user:…`). This file is blind to the difference — it
 * stores whatever string it is handed. Why the second bucket exists at all is
 * on `accountThrottleKey` in `credential-check.service.ts`.
 */

export interface AttemptRecord {
  /** Failures inside the current window. Reset by the window, not by age alone. */
  count: number;
  /** When the current counting window opened — `count` is relative to this. */
  windowStartedAt: number;
  lockedUntil: number | null;
  /**
   * How many times this bucket has tripped the lock, within memory.
   *
   * Survives the lock expiring, which is the whole reason the record is no
   * longer deleted outright when the lock clears: «اتقفل تاني» is the signal
   * that sends a student to WhatsApp instead of leaving them to guess for
   * another ten minutes, and a counter that reset with the lock could never
   * produce it.
   */
  lockCount: number;
  /**
   * After this instant the record carries nothing worth the memory and may be
   * dropped. Without it, keeping `lockCount` past an expired lock would turn
   * this map into an attacker-controlled unbounded allocation: every made-up
   * identifier in a credential-stuffing run leaves a row behind for good, and
   * an API container that dies takes the whole domain with it — Traefik
   * answers 404 for every path on a stack whose API is not up, not just for
   * `/api`.
   */
  forgetAfter: number;
  lastIp: string;
}

/**
 * Storage port. `InMemoryAttemptStore` below is correct for a single
 * instance; swapping to Redis later means implementing this interface
 * against a Redis client (e.g. `HSET`/`HGETALL`/`DEL` on a key per bucket,
 * with `PEXPIREAT` doing what `forgetAfter` does here) and changing one
 * constructor argument — no caller of `LoginThrottleService` needs to change.
 */
export interface AttemptStore {
  get(key: string): AttemptRecord | undefined;
  set(key: string, record: AttemptRecord): void;
  delete(key: string): void;
}

/**
 * Ceiling on how many buckets one process will track.
 *
 * Every key in this map is attacker-chosen — it is the identifier they typed
 * — so "it only grows with real students" was never true. Eviction prefers
 * the records closest to `forgetAfter`, which orders plain counters (what a
 * stuffing run leaves behind) ahead of live locks, so pressure from junk
 * identifiers cannot flush the lock protecting a real account.
 */
const MAX_TRACKED_KEYS = 20_000;

export class InMemoryAttemptStore implements AttemptStore {
  private readonly records = new Map<string, AttemptRecord>();

  constructor(private readonly now: () => number = Date.now) {}

  get(key: string): AttemptRecord | undefined {
    const record = this.records.get(key);
    if (!record) return undefined;
    // Expiry is enforced on READ as well as on eviction, so a stale record is
    // never mistaken for a live one merely because the map has not been swept
    // — the same "check on access" rule the lock itself follows.
    if (record.forgetAfter <= this.now()) {
      this.records.delete(key);
      return undefined;
    }
    return record;
  }

  set(key: string, record: AttemptRecord): void {
    this.records.set(key, record);
    if (this.records.size > MAX_TRACKED_KEYS) this.evict();
  }

  delete(key: string): void {
    this.records.delete(key);
  }

  /** Test seam: lets a spec prove the ceiling holds rather than trust the constant. */
  size(): number {
    return this.records.size;
  }

  private evict(): void {
    const now = this.now();
    for (const [key, record] of this.records) {
      if (record.forgetAfter <= now) this.records.delete(key);
    }
    if (this.records.size <= MAX_TRACKED_KEYS) return;

    const byExpiry = [...this.records].sort((a, b) => a[1].forgetAfter - b[1].forgetAfter);
    for (const [key] of byExpiry) {
      if (this.records.size <= MAX_TRACKED_KEYS) break;
      this.records.delete(key);
    }
  }
}

/** Attempts 1-3 are free (no artificial delay). */
const FREE_ATTEMPTS = 3;
/**
 * Delay grows as 2^n seconds from the 4th attempt, never exceeding this.
 *
 * Was 30. Cut to five deliberately, alongside dropping the lock threshold
 * from ten to six. The delay used to be the control that made guessing
 * expensive between attempts four and ten; with the lock landing at six there
 * are two delayed attempts left for it to cover. What the old cap still cost
 * is the other half of the trade — `login-security.hook.ts` holds the SOCKET
 * open for the whole delay, so five hundred deliberately failing logins
 * pinned five hundred connections for half a minute each, at no cost to
 * whoever sent them. Six attempts then a ten-minute lock is a strictly
 * tighter guess budget than ten attempts ever was; the thirty-second hold was
 * pure cost.
 */
const MAX_DELAY_SECONDS = 5;
/** The Nth failed attempt WITHIN `ATTEMPT_WINDOW_MS` trips the soft lock. */
const LOCK_THRESHOLD = 6;
/** Soft lock duration — auto-clears, no admin action required. */
export const LOCK_DURATION_MS = 10 * 60 * 1000;
/**
 * Failures older than this stop counting.
 *
 * There was no window at all before, and at a threshold of ten that was
 * merely unkind: a student who mistyped nine times across a whole school year
 * was locked out by the tenth. At six it would fire on real students weekly.
 * "Six wrong tries inside a quarter of an hour" is a rule a person can hold
 * in their head, and it is what the lock now means.
 */
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
/**
 * How long a bucket remembers having been locked, once the lock itself has
 * expired. Long enough that a second lock the same evening still reads as
 * «تاني» and routes the student to WhatsApp; short enough that the map does
 * not accumulate a day's worth of junk identifiers.
 */
const LOCK_MEMORY_MS = 6 * 60 * 60 * 1000;

export function normalizeThrottleKey(email: string): string {
  return email.trim().toLowerCase();
}

/** `2^attemptCount` seconds, capped at `MAX_DELAY_SECONDS`, free for the first 3 attempts. */
export function computeDelayMs(attemptCount: number): number {
  if (attemptCount <= FREE_ATTEMPTS) return 0;
  const seconds = Math.min(2 ** attemptCount, MAX_DELAY_SECONDS);
  return seconds * 1000;
}

/**
 * What a caller may learn about a live lock — and, by omission, what it may
 * not.
 *
 * No account id, no "does this exist", no attempt count. The two fields are
 * the two things the person at the keyboard needs: how long, and whether this
 * has happened before. Which of the two buckets is allowed to say any of it
 * out loud is decided in `LoginSecurityService`, not here.
 */
export interface LockState {
  /** Milliseconds until the lock clears by itself. */
  retryAfterMs: number;
  /** Not the first time this bucket has been locked. */
  repeated: boolean;
}

export interface FailureResult {
  delayMs: number;
  locked: boolean;
  retryAfterMs: number;
  repeated: boolean;
}

export class LoginThrottleService {
  private readonly store: AttemptStore;

  constructor(
    store?: AttemptStore,
    private readonly now: () => number = Date.now,
  ) {
    // The store's expiry clock and this service's clock have to be the SAME
    // one, or a spec that advances a fake clock is reading a map which still
    // believes it is 1970 and has already dropped every record as stale.
    // A default parameter (`store = new InMemoryAttemptStore()`) could not do
    // this: defaults evaluate left to right, so `now` did not exist yet.
    this.store = store ?? new InMemoryAttemptStore(now);
  }

  /**
   * The live lock on `key`, or `null`. An expired lock is stood down as a
   * side effect of asking — this is what makes S4's "auto-clearing, no admin
   * action required" true: the very next check (or attempt) after the ten
   * minutes elapse reopens the account, not a background sweep.
   *
   * Standing it down resets the counter but KEEPS `lockCount`. Deleting the
   * whole record, which is what this used to do, made every lock look like a
   * first lock.
   */
  lockState(key: string): LockState | null {
    const normalized = normalizeThrottleKey(key);
    const record = this.store.get(normalized);
    if (!record?.lockedUntil) return null;

    const now = this.now();
    if (record.lockedUntil <= now) {
      this.store.set(normalized, {
        ...record,
        count: 0,
        windowStartedAt: now,
        lockedUntil: null,
        forgetAfter: now + LOCK_MEMORY_MS,
      });
      return null;
    }

    return {
      retryAfterMs: record.lockedUntil - now,
      repeated: record.lockCount >= 2,
    };
  }

  /** Whether `key` is currently soft-locked. */
  isLocked(key: string): boolean {
    return this.lockState(key) !== null;
  }

  /**
   * Records a failed login attempt for `key` from `ip` and returns the delay
   * the caller should apply before responding, plus whether this attempt just
   * tripped the soft lock.
   */
  recordFailure(key: string, ip: string): FailureResult {
    const normalized = normalizeThrottleKey(key);
    const now = this.now();
    const existing = this.store.get(normalized);

    /**
     * An attempt against an ALREADY locked bucket changes nothing.
     *
     * Load-bearing, not defensive. `LoginSecurityService` calls this on the
     * account bucket for every failure, including ones arriving while that
     * bucket is locked; letting those fall through would re-trip the lock and
     * increment `lockCount` on every single request, so the second wrong
     * password after a lock would report «اتقفل تاني» and send the student to
     * WhatsApp over what is, to them, their first lockout.
     */
    if (existing?.lockedUntil != null && existing.lockedUntil > now) {
      return {
        delayMs: 0,
        locked: true,
        retryAfterMs: existing.lockedUntil - now,
        repeated: existing.lockCount >= 2,
      };
    }

    // A record still carrying a `lockedUntil` here is one whose lock has just
    // run out without anyone asking `lockState` first — that failure opens a
    // fresh window rather than resuming the count that caused the lock.
    const lockJustExpired = existing?.lockedUntil != null;
    const withinWindow =
      existing !== undefined &&
      !lockJustExpired &&
      now - existing.windowStartedAt < ATTEMPT_WINDOW_MS;

    const count = withinWindow ? existing.count + 1 : 1;
    const windowStartedAt = withinWindow ? existing.windowStartedAt : now;
    const locked = count >= LOCK_THRESHOLD;
    const lockCount = (existing?.lockCount ?? 0) + (locked ? 1 : 0);
    const lockedUntil = locked ? now + LOCK_DURATION_MS : null;

    this.store.set(normalized, {
      count,
      windowStartedAt,
      lockedUntil,
      lockCount,
      forgetAfter: (lockedUntil ?? now) + LOCK_MEMORY_MS,
      lastIp: ip,
    });

    return {
      delayMs: computeDelayMs(count),
      locked,
      retryAfterMs: locked ? LOCK_DURATION_MS : 0,
      repeated: lockCount >= 2,
    };
  }

  /** A successful login clears the bucket's attempt history entirely. */
  recordSuccess(key: string): void {
    this.clear(key);
  }

  /**
   * Forgets everything recorded against `key` — count, lock and lock history
   * alike.
   *
   * `recordSuccess` is one caller. The other is an admin setting a new
   * password (`StudentsService.setPassword`), and that case is why this is a
   * method of its own rather than a second call to `recordSuccess`: nobody has
   * logged in, so naming it that way would put a lie in the call site.
   *
   * Not a weakening of S4. The lock exists to make GUESSING expensive, and
   * whoever is clearing it has just replaced the secret being guessed — every
   * attempt the counter accumulated was against a password that no longer
   * opens anything. Leaving the lock standing would only mean the student is
   * refused for another ten minutes with the credential they were just given,
   * over failures that can no longer teach an attacker anything.
   *
   * ⚠️ Clearing one identifier bucket does NOT clear the account bucket the
   * same failures also filled. `StudentsService.setPassword` therefore clears
   * all three keys, not one.
   */
  clear(key: string): void {
    this.store.delete(normalizeThrottleKey(key));
  }
}
