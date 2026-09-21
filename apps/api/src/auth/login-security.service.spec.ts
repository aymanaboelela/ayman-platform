import * as argon2 from 'argon2';
import { ARGON2_OPTIONS } from './argon2-options';
import {
  accountThrottleKey,
  emailIdentifier,
  phoneIdentifier,
  throttleKeyFor,
  type CredentialLookup,
  type LoginIdentifier,
  type StoredCredential,
} from './credential-check.service';
import {
  GENERIC_LOGIN_ERROR,
  GENERIC_LOGIN_STATUS,
  LOCKED_LOGIN_ERROR_CODE,
  LOCKED_LOGIN_STATUS,
  LoginSecurityService,
} from './login-security.service';
import { InMemoryAttemptStore, LoginThrottleService } from './login-throttle.service';

/**
 * S1 end-to-end at the orchestration layer: unknown identifier and wrong
 * password must produce byte-identical outcome bodies and status codes — and
 * must do so whether the student signed in with an email or a phone.
 *
 * The soft lock is now the documented exception to that, and the tests below
 * pin the precise shape of the exception rather than the old blanket rule:
 * the IDENTIFIER lock may be named, because it reads identically for an
 * address nobody owns; the ACCOUNT lock may not, unless the password has
 * verified, because it only exists for real students.
 */

/** Keyed by `throttleKeyFor`, so the fake distinguishes a phone from an email. */
class FakeLookup implements CredentialLookup {
  constructor(private readonly credentials: Map<string, StoredCredential>) {}
  async findCredential(identifier: LoginIdentifier): Promise<StoredCredential | null> {
    return this.credentials.get(throttleKeyFor(identifier)) ?? null;
  }
}

const KNOWN_EMAIL = emailIdentifier('known@example.com');
const KNOWN_PHONE = phoneIdentifier('+201012345678');
const UNKNOWN_EMAIL = emailIdentifier('nobody@example.com');
const UNKNOWN_PHONE = phoneIdentifier('+201119999999');
const LOCKED_EMAIL = emailIdentifier('locked@example.com');

/** Matches `LOCK_THRESHOLD` in `login-throttle.service.ts`. */
const LOCK_THRESHOLD = 6;

async function makeHarness() {
  const realPassword = 'correct-horse-battery-staple';
  const realHash = await argon2.hash(realPassword, ARGON2_OPTIONS);
  /** One account, reachable by either identifier — exactly like a real student. */
  const lookup = new FakeLookup(
    new Map([
      [throttleKeyFor(KNOWN_EMAIL), { userId: 'user-1', passwordHash: realHash }],
      [throttleKeyFor(KNOWN_PHONE), { userId: 'user-1', passwordHash: realHash }],
    ]),
  );
  const throttle = new LoginThrottleService(new InMemoryAttemptStore());
  const service = new LoginSecurityService(throttle, lookup);
  return { service, throttle, lookup, realPassword };
}

describe('LoginSecurityService — S1: identical responses for unknown vs wrong password', () => {
  it('unknown email and wrong password share status + body', async () => {
    const { service } = await makeHarness();

    const unknown = await service.evaluate(UNKNOWN_EMAIL, 'anything', '1.1.1.1');
    const wrongPassword = await service.evaluate(KNOWN_EMAIL, 'wrong-guess', '2.2.2.2');

    expect(unknown.outcome).toBe('failure');
    expect(wrongPassword.outcome).toBe('failure');
    expect(unknown.status).toBe(GENERIC_LOGIN_STATUS);
    expect(wrongPassword.status).toBe(GENERIC_LOGIN_STATUS);

    // Deep equality across both, not just individually matching the constant
    // — proves nothing was mutated or field-added per case.
    expect(unknown.responseBody).toEqual(GENERIC_LOGIN_ERROR);
    expect(unknown.responseBody).toEqual(wrongPassword.responseBody);
  });

  /**
   * The phone route is the one that shipped last and is the one most likely to
   * be left un-hardened — Better Auth mounts `/sign-in/phone-number` as raw
   * middleware ahead of every Nest guard, so if it did not pass through this
   * service it would have no throttle, no timing equalisation and no generic
   * error at all. A failure by phone must be indistinguishable from a failure
   * by email.
   */
  it('a phone failure is byte-identical to an email failure', async () => {
    const { service } = await makeHarness();

    const byEmail = await service.evaluate(UNKNOWN_EMAIL, 'anything', '1.1.1.1');
    const byPhone = await service.evaluate(UNKNOWN_PHONE, 'anything', '1.1.1.1');
    const wrongPasswordByPhone = await service.evaluate(KNOWN_PHONE, 'wrong-guess', '1.1.1.1');

    expect(byPhone.outcome).toBe('failure');
    expect(byPhone.status).toBe(GENERIC_LOGIN_STATUS);
    expect(byPhone.responseBody).toEqual(byEmail.responseBody);
    expect(wrongPasswordByPhone.responseBody).toEqual(byEmail.responseBody);
    // No `userId` leaking on any failure path, phone included.
    expect(byPhone.userId).toBeUndefined();
    expect(wrongPasswordByPhone.userId).toBeUndefined();
  });

  it('a correct password reaches the same account by phone as by email', async () => {
    const { service, realPassword } = await makeHarness();

    const byEmail = await service.evaluate(KNOWN_EMAIL, realPassword, '1.1.1.1');
    const byPhone = await service.evaluate(KNOWN_PHONE, realPassword, '1.1.1.1');

    expect(byEmail.outcome).toBe('success');
    expect(byPhone.outcome).toBe('success');
    expect(byPhone.userId).toBe(byEmail.userId);
  });

  it('a correct password on an unlocked account succeeds and clears its throttle state', async () => {
    const { service, throttle, realPassword } = await makeHarness();
    await service.evaluate(KNOWN_EMAIL, 'wrong-guess', '1.1.1.1');
    await service.evaluate(KNOWN_EMAIL, 'wrong-guess', '1.1.1.1');

    const result = await service.evaluate(KNOWN_EMAIL, realPassword, '1.1.1.1');
    expect(result.outcome).toBe('success');
    expect(result.userId).toBe('user-1');

    // BOTH buckets reset: next failure should be attempt #1 again in each.
    expect(throttle.recordFailure(throttleKeyFor(KNOWN_EMAIL), '1.1.1.1').delayMs).toBe(0);
    expect(throttle.recordFailure(accountThrottleKey('user-1'), '1.1.1.1').delayMs).toBe(0);
  });

  it('a locked identifier never reaches the credential lookup (no DB round-trip on a login it will refuse anyway)', async () => {
    const throttle = new LoginThrottleService(new InMemoryAttemptStore());
    for (let i = 0; i < LOCK_THRESHOLD; i++) {
      throttle.recordFailure(throttleKeyFor(LOCKED_EMAIL), '3.3.3.3');
    }

    let called = false;
    const lookup: CredentialLookup = {
      async findCredential() {
        called = true;
        return null;
      },
    };
    const service = new LoginSecurityService(throttle, lookup);

    await service.evaluate(LOCKED_EMAIL, 'anything', '3.3.3.3');
    expect(called).toBe(false);
  });

  it('a failed attempt on an unlocked account returns the throttle-computed delay', async () => {
    const { service, throttle } = await makeHarness();
    for (let i = 0; i < 3; i++) throttle.recordFailure(throttleKeyFor(KNOWN_EMAIL), '1.1.1.1');
    // 4th failure — the throttle computes 5s (the cap) — evaluate() must surface it.
    const result = await service.evaluate(KNOWN_EMAIL, 'wrong-guess', '1.1.1.1');
    expect(result.delayMs).toBe(5_000);
  });
});

/**
 * The identifier lock is ANNOUNCED, and this describe block is the reason that
 * is not a hole in S1.
 *
 * The counter it reports on is keyed on the string that was typed, and a
 * failed attempt fills it whether or not that string belongs to anybody. So
 * the sentence a locked real account produces and the sentence a locked
 * imaginary one produces are the same sentence, with the same number of
 * minutes on it. Delete the second test here and the first becomes an
 * enumeration oracle.
 */
describe('LoginSecurityService — the identifier lock says so, and says nothing else', () => {
  it('a locked identifier is refused with a code, a wait and a repeat flag', async () => {
    const { service } = await makeHarness();
    for (let i = 0; i < LOCK_THRESHOLD; i++) {
      await service.evaluate(KNOWN_EMAIL, 'wrong-guess', '1.1.1.1');
    }

    const locked = await service.evaluate(KNOWN_EMAIL, 'wrong-guess', '1.1.1.1');
    expect(locked.outcome).toBe('locked');
    expect(locked.status).toBe(LOCKED_LOGIN_STATUS);
    expect(locked.responseBody).toMatchObject({
      code: LOCKED_LOGIN_ERROR_CODE,
      repeated: false,
    });
    // Ten minutes, and never a value that would send somebody back early.
    const body = locked.responseBody as { retryAfterSeconds: number };
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
    expect(body.retryAfterSeconds).toBeLessThanOrEqual(600);
  });

  it('an identifier with NO account locks and reports identically to one with an account', async () => {
    const { service } = await makeHarness();

    for (let i = 0; i < LOCK_THRESHOLD; i++) {
      await service.evaluate(KNOWN_EMAIL, 'wrong-guess', '1.1.1.1');
    }
    for (let i = 0; i < LOCK_THRESHOLD; i++) {
      await service.evaluate(UNKNOWN_EMAIL, 'wrong-guess', '1.1.1.1');
    }

    const real = await service.evaluate(KNOWN_EMAIL, 'wrong-guess', '1.1.1.1');
    const imaginary = await service.evaluate(UNKNOWN_EMAIL, 'wrong-guess', '1.1.1.1');

    expect(real.outcome).toBe('locked');
    expect(imaginary.outcome).toBe('locked');
    expect(real.status).toBe(imaginary.status);
    expect(real.responseBody).toEqual(imaginary.responseBody);
  });

  it('reports the second lockout as repeated, which is what routes a student to WhatsApp', async () => {
    let currentTime = 5_000_000;
    const clock = () => currentTime;
    const throttle = new LoginThrottleService(new InMemoryAttemptStore(clock), clock);
    const realHash = await argon2.hash('correct-horse-battery-staple', ARGON2_OPTIONS);
    const service = new LoginSecurityService(
      throttle,
      new FakeLookup(new Map([[throttleKeyFor(KNOWN_EMAIL), { userId: 'user-1', passwordHash: realHash }]])),
    );

    for (let i = 0; i < LOCK_THRESHOLD; i++) {
      await service.evaluate(KNOWN_EMAIL, 'wrong-guess', '1.1.1.1');
    }
    currentTime += 10 * 60 * 1000; // lock lapses
    for (let i = 0; i < LOCK_THRESHOLD; i++) {
      await service.evaluate(KNOWN_EMAIL, 'wrong-guess', '1.1.1.1');
    }

    const locked = await service.evaluate(KNOWN_EMAIL, 'wrong-guess', '1.1.1.1');
    expect(locked.responseBody).toMatchObject({ repeated: true });
  });
});

/**
 * «القفل لازم يغطّي كل معرّفات نفس الحساب» — the hole the per-identifier lock
 * left open, and the reason the account bucket exists.
 *
 * The old behaviour was pinned as a test of its own («locks per identifier,
 * not per account — a phone lockout leaves email sign-in open») because it was
 * a deliberate trade at the time. It is not the trade any more.
 */
describe('LoginSecurityService — the lock follows the ACCOUNT, across identifiers', () => {
  it('failures by phone lock the email box too', async () => {
    const { service, realPassword } = await makeHarness();

    for (let i = 0; i < LOCK_THRESHOLD; i++) {
      await service.evaluate(KNOWN_PHONE, 'wrong-guess', '3.3.3.3');
    }

    // The correct password, through the identifier that was never attacked.
    const byEmail = await service.evaluate(KNOWN_EMAIL, realPassword, '3.3.3.3');
    expect(byEmail.outcome).toBe('locked');
    expect(byEmail.userId).toBeUndefined();
  });

  /**
   * And the other half of it: the account lock must not become the linkage
   * oracle the identifier lock is careful not to be.
   *
   * Someone who locked a PHONE and then gets «مقفول» on an EMAIL they have
   * merely typed has learned that the two belong to one person. So a WRONG
   * password on a locked account is the ordinary generic 401 — the lock is
   * only explained to somebody who has just proved they hold the password.
   */
  it('refuses silently to anyone who has not proved the password', async () => {
    const { service } = await makeHarness();

    for (let i = 0; i < LOCK_THRESHOLD; i++) {
      await service.evaluate(KNOWN_PHONE, 'wrong-guess', '3.3.3.3');
    }

    const wrongByEmail = await service.evaluate(KNOWN_EMAIL, 'another-guess', '3.3.3.3');
    const wrongByStranger = await service.evaluate(UNKNOWN_EMAIL, 'another-guess', '3.3.3.3');

    expect(wrongByEmail.outcome).toBe('failure');
    expect(wrongByEmail.status).toBe(GENERIC_LOGIN_STATUS);
    expect(wrongByEmail.responseBody).toEqual(GENERIC_LOGIN_ERROR);
    // Byte-identical to an address that has no account at all — which is the
    // whole property. Nothing here says the email and the phone are one
    // student.
    expect(wrongByEmail.responseBody).toEqual(wrongByStranger.responseBody);
  });

  /**
   * A wrong password against a locked account still has to FILL the untouched
   * identifier's bucket. Skipping it would leave that counter at zero forever:
   * a timing tell (no growing delay where every other account has one) and, far
   * worse, an open lane — the password could be guessed at full speed on the
   * one identifier nobody had tried yet.
   */
  it('keeps counting the second identifier while the account is locked', async () => {
    const { service, throttle } = await makeHarness();

    for (let i = 0; i < LOCK_THRESHOLD; i++) {
      await service.evaluate(KNOWN_PHONE, 'wrong-guess', '3.3.3.3');
    }
    expect(throttle.isLocked(throttleKeyFor(KNOWN_EMAIL))).toBe(false);

    for (let i = 0; i < LOCK_THRESHOLD; i++) {
      await service.evaluate(KNOWN_EMAIL, 'wrong-guess', '3.3.3.3');
    }
    expect(throttle.isLocked(throttleKeyFor(KNOWN_EMAIL))).toBe(true);
  });

  /** Six wrong tries, not twelve: the two identifiers share one budget. */
  it('spends one shared budget across both identifiers', async () => {
    const { service, throttle } = await makeHarness();

    for (let i = 0; i < 3; i++) await service.evaluate(KNOWN_PHONE, 'wrong-guess', '3.3.3.3');
    expect(throttle.isLocked(accountThrottleKey('user-1'))).toBe(false);

    for (let i = 0; i < 3; i++) await service.evaluate(KNOWN_EMAIL, 'wrong-guess', '3.3.3.3');
    expect(throttle.isLocked(accountThrottleKey('user-1'))).toBe(true);
  });

  it('a lock earned by an identifier that has no account never touches a real one', async () => {
    const { service, throttle, realPassword } = await makeHarness();

    for (let i = 0; i < LOCK_THRESHOLD; i++) {
      await service.evaluate(UNKNOWN_EMAIL, 'wrong-guess', '4.4.4.4');
    }

    expect(throttle.isLocked(accountThrottleKey('user-1'))).toBe(false);
    const result = await service.evaluate(KNOWN_EMAIL, realPassword, '4.4.4.4');
    expect(result.outcome).toBe('success');
  });
});
