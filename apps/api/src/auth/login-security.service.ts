import {
  accountThrottleKey,
  simulateCredentialCheck,
  throttleKeyFor,
  verifyPassword,
  type CredentialLookup,
  type LoginIdentifier,
} from './credential-check.service';
import type { LockState, LoginThrottleService } from './login-throttle.service';

/**
 * Orchestrates S1-S4 for a single login attempt: check the soft lock (S4)
 * first, then run exactly one Argon2 verify either way (S1+S2), then record
 * the outcome against the throttle (S3+S4). Pure — no `better-auth` import —
 * so it's fully unit-testable; `./login-security.hook` is the thin adapter
 * that binds this to Better Auth's `/sign-in/email` request lifecycle.
 *
 * ## The two buckets, and which one is allowed to speak
 *
 * Every attempt now counts against two ledgers (see `throttleKeyFor` and
 * `accountThrottleKey`):
 *
 *   · the IDENTIFIER bucket — the string that was typed, consulted before any
 *     database lookup. It exists identically for an address that has an
 *     account and one that does not, because a failed attempt fills it either
 *     way. So «مقفول، فاضل ٩ دقايق» on this bucket answers no question about
 *     who is registered: the same six wrong guesses against a made-up address
 *     produce the same sentence. This one may be named out loud.
 *
 *   · the ACCOUNT bucket — filled only once the lookup has resolved a real
 *     user, which is precisely what makes it dangerous to mention. Saying
 *     «مقفول» here to someone who typed an email, after they locked a PHONE,
 *     would tell them the two belong to the same person. So it refuses
 *     SILENTLY, with the byte-identical generic error, unless the submitted
 *     password has already verified — the same rule, and the same reasoning,
 *     that lets `ACCOUNT_BANNED` exist at all.
 *
 * Between them: six wrong tries lock the student, whichever box they were
 * typed into, and nothing a stranger can do reveals who exists.
 */

export const GENERIC_LOGIN_ERROR = {
  code: 'INVALID_CREDENTIALS',
  message: 'Invalid email or password',
} as const;
export const GENERIC_LOGIN_STATUS = 401;

/** The code the web app matches on to render the Arabic «الدخول مقفول» line. */
export const LOCKED_LOGIN_ERROR_CODE = 'ACCOUNT_LOCKED' as const;
/**
 * 429, not 401.
 *
 * The credentials are not what is being refused — the attempt rate is — and
 * it keeps the one distinguishable login response out of the 401 path that
 * every other failure shares, so a reviewer scanning for S1 violations sees
 * the exception rather than having to spot it inside the rule.
 */
export const LOCKED_LOGIN_STATUS = 429;

export interface LockedLoginBody {
  code: typeof LOCKED_LOGIN_ERROR_CODE;
  /** Library-shaped English, like every other API message. The web renders copy. */
  message: string;
  /** Whole seconds, rounded UP — never tell someone to come back before the lock lifts. */
  retryAfterSeconds: number;
  /** Not their first lockout, so the web adds the «كلّم المدرّس» line and the link. */
  repeated: boolean;
}

export interface LoginAttemptOutcome {
  outcome: 'success' | 'failure' | 'locked';
  /** Only set when `outcome === 'success'`. */
  userId?: string;
  /**
   * Set on both refusals. Byte-identical across every `failure` reason (S1);
   * `locked` is the one documented exception and carries its own shape.
   */
  responseBody?: typeof GENERIC_LOGIN_ERROR | LockedLoginBody;
  status?: number;
  /** Progressive delay (S4) the caller should apply before responding. */
  delayMs: number;
}

function lockedOutcome(lock: LockState): LoginAttemptOutcome {
  return {
    outcome: 'locked',
    responseBody: {
      code: LOCKED_LOGIN_ERROR_CODE,
      message: 'Too many failed sign-in attempts',
      retryAfterSeconds: Math.ceil(lock.retryAfterMs / 1000),
      repeated: lock.repeated,
    },
    status: LOCKED_LOGIN_STATUS,
    // No artificial delay on top of a lock: the student is already waiting ten
    // minutes, and holding the socket open as well only costs the server.
    delayMs: 0,
  };
}

function genericFailure(delayMs: number): LoginAttemptOutcome {
  return {
    outcome: 'failure',
    responseBody: GENERIC_LOGIN_ERROR,
    status: GENERIC_LOGIN_STATUS,
    delayMs,
  };
}

export class LoginSecurityService {
  constructor(
    private readonly throttle: LoginThrottleService,
    private readonly lookup: CredentialLookup,
  ) {}

  /**
   * `identifier` is a phone or an email, already normalised. Everything below
   * is deliberately blind to which — a phone sign-in gets the identical soft
   * lock, the identical progressive delay, and the identical generic 401 an
   * email sign-in gets. `/sign-in/phone-number` reaching production without
   * passing through here would be an unthrottled credential-stuffing surface
   * sitting next to a hardened one.
   */
  async evaluate(
    identifier: LoginIdentifier,
    password: string,
    ip: string,
  ): Promise<LoginAttemptOutcome> {
    const identifierKey = throttleKeyFor(identifier);

    const identifierLock = this.throttle.lockState(identifierKey);
    if (identifierLock) {
      // Still pay the Argon2 cost (S2's principle applied to every failure
      // path, not just "unknown email") so a locked bucket isn't measurably
      // faster to reject than a genuine wrong-password attempt. No DB lookup:
      // the attempt is refused regardless of what the lookup would return, so
      // there is nothing to gain by running it — and not running it is what
      // keeps a locked account unprobeable.
      await simulateCredentialCheck(password);
      return lockedOutcome(identifierLock);
    }

    // The lookup and the verify are split (rather than one
    // `verifyLoginCredential` call) for one reason: the account bucket needs
    // the user id of a FAILED attempt, and a helper that only names the
    // account on success cannot supply it. `verifyPassword` still pays exactly
    // one Argon2 verify whether or not the row exists — the cost guarantee
    // lives in that function, not in this ordering.
    const credential = await this.lookup.findCredential(identifier);
    const passwordValid = await verifyPassword(credential, password);
    const accountKey = credential ? accountThrottleKey(credential.userId) : null;
    const accountLock = accountKey ? this.throttle.lockState(accountKey) : null;

    if (credential && passwordValid) {
      /**
       * The one place the account-wide lock is allowed to explain itself.
       *
       * Reaching this line required holding the account's password, so naming
       * the lock tells the person nothing they could not already establish —
       * the exact argument that makes `ACCOUNT_BANNED` safe. It is also the
       * case that most needs the sentence: a student who finally remembers
       * their password and is refused anyway, with «البريد أو كلمة المرور مش
       * مظبوطين», will keep retyping a password that is already correct.
       */
      if (accountLock) return lockedOutcome(accountLock);

      this.throttle.recordSuccess(identifierKey);
      if (accountKey) this.throttle.recordSuccess(accountKey);
      return { outcome: 'success', userId: credential.userId, delayMs: 0 };
    }

    /**
     * Both buckets take the failure, including when the account bucket is
     * already locked — `recordFailure` is a no-op against a live lock, so
     * this neither extends it nor inflates `lockCount`.
     *
     * The identifier bucket is recorded even while the account is locked,
     * deliberately: skipping it would leave that bucket permanently at zero,
     * which is both a timing tell (no growing delay where every other account
     * has one) and an open door — the password could then be guessed at full
     * speed against a locked account, on the one identifier nobody had tried
     * yet.
     */
    const { delayMs } = this.throttle.recordFailure(identifierKey, ip);
    if (accountKey) this.throttle.recordFailure(accountKey, ip);

    // Generic, whether or not the account bucket is locked. `accountLock` is
    // read above only so the SUCCESS path can name it; a wrong password must
    // look the same on a locked account as on any other.
    return genericFailure(delayMs);
  }
}
