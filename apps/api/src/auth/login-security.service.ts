import {
  simulateCredentialCheck,
  throttleKeyFor,
  verifyLoginCredential,
  type CredentialLookup,
  type LoginIdentifier,
} from './credential-check.service';
import type { LoginThrottleService } from './login-throttle.service';

/**
 * Orchestrates S1-S4 for a single login attempt: check the soft lock (S4)
 * first, then run exactly one Argon2 verify either way (S1+S2), then record
 * the outcome against the throttle (S3+S4). Pure — no `better-auth` import —
 * so it's fully unit-testable; `./login-security.hook` is the thin adapter
 * that binds this to Better Auth's `/sign-in/email` request lifecycle.
 */

export const GENERIC_LOGIN_ERROR = {
  code: 'INVALID_CREDENTIALS',
  message: 'Invalid email or password',
} as const;
export const GENERIC_LOGIN_STATUS = 401;

export interface LoginAttemptOutcome {
  outcome: 'success' | 'failure';
  /** Only set when `outcome === 'success'`. */
  userId?: string;
  /** Only set when `outcome === 'failure'` — byte-identical across every failure reason (S1). */
  responseBody?: typeof GENERIC_LOGIN_ERROR;
  status?: number;
  /** Progressive delay (S4) the caller should apply before responding. */
  delayMs: number;
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
    const throttleKey = throttleKeyFor(identifier);
    if (this.throttle.isLocked(throttleKey)) {
      // Still pay the Argon2 cost (S2's principle applied to every failure
      // path, not just "unknown email") so a locked account isn't
      // measurably faster to reject than a genuine wrong-password attempt —
      // that speed difference would itself be an enumeration oracle. No DB
      // lookup: the account is refused regardless of what the lookup would
      // return, so there's nothing to gain by running it.
      await simulateCredentialCheck(password);
      return {
        outcome: 'failure',
        responseBody: GENERIC_LOGIN_ERROR,
        status: GENERIC_LOGIN_STATUS,
        delayMs: 0,
      };
    }

    const result = await verifyLoginCredential(identifier, password, this.lookup);

    if (result.success) {
      this.throttle.recordSuccess(throttleKey);
      return { outcome: 'success', userId: result.userId, delayMs: 0 };
    }

    const { delayMs } = this.throttle.recordFailure(throttleKey, ip);
    return {
      outcome: 'failure',
      responseBody: GENERIC_LOGIN_ERROR,
      status: GENERIC_LOGIN_STATUS,
      delayMs,
    };
  }
}
