import * as argon2 from 'argon2';
import { ARGON2_OPTIONS } from './argon2-options';
import {
  emailIdentifier,
  phoneIdentifier,
  throttleKeyFor,
  type CredentialLookup,
  type LoginIdentifier,
  type StoredCredential,
} from './credential-check.service';
import { GENERIC_LOGIN_ERROR, GENERIC_LOGIN_STATUS, LoginSecurityService } from './login-security.service';
import { InMemoryAttemptStore, LoginThrottleService } from './login-throttle.service';

/**
 * S1 end-to-end at the orchestration layer: unknown identifier, wrong
 * password, and a locked account must produce byte-identical outcome bodies
 * and status codes — and must do so whether the student signed in with an
 * email or a phone.
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

describe('LoginSecurityService — S1: identical responses across all three failure modes', () => {
  it('unknown email, wrong password, and a locked account share status + body', async () => {
    const { service, throttle } = await makeHarness();

    const unknown = await service.evaluate(UNKNOWN_EMAIL, 'anything', '1.1.1.1');

    const wrongPassword = await service.evaluate(KNOWN_EMAIL, 'wrong-guess', '2.2.2.2');

    // Lock a third account outright, then attempt against it.
    for (let i = 0; i < 10; i++) throttle.recordFailure(throttleKeyFor(LOCKED_EMAIL), '3.3.3.3');
    const locked = await service.evaluate(LOCKED_EMAIL, 'anything', '3.3.3.3');

    expect(unknown.outcome).toBe('failure');
    expect(wrongPassword.outcome).toBe('failure');
    expect(locked.outcome).toBe('failure');

    expect(unknown.status).toBe(GENERIC_LOGIN_STATUS);
    expect(wrongPassword.status).toBe(GENERIC_LOGIN_STATUS);
    expect(locked.status).toBe(GENERIC_LOGIN_STATUS);

    expect(unknown.responseBody).toEqual(GENERIC_LOGIN_ERROR);
    expect(wrongPassword.responseBody).toEqual(GENERIC_LOGIN_ERROR);
    expect(locked.responseBody).toEqual(GENERIC_LOGIN_ERROR);

    // Deep equality across all three, not just individually matching the
    // constant — proves nothing was mutated or field-added per case.
    expect(unknown.responseBody).toEqual(wrongPassword.responseBody);
    expect(wrongPassword.responseBody).toEqual(locked.responseBody);
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

  /**
   * The documented cost of namespacing the throttle by identifier kind (see
   * `throttleKeyFor`): locking the phone bucket does NOT lock the email one.
   * Pinned as a test rather than left as a comment so the trade-off is visible
   * to whoever changes it, and so nobody assumes a lock is account-wide.
   */
  it('locks per identifier, not per account — a phone lockout leaves email sign-in open', async () => {
    const { service, throttle, realPassword } = await makeHarness();
    for (let i = 0; i < 10; i++) throttle.recordFailure(throttleKeyFor(KNOWN_PHONE), '3.3.3.3');

    const byPhone = await service.evaluate(KNOWN_PHONE, realPassword, '3.3.3.3');
    const byEmail = await service.evaluate(KNOWN_EMAIL, realPassword, '3.3.3.3');

    expect(byPhone.outcome).toBe('failure');
    expect(byEmail.outcome).toBe('success');
  });

  it('a correct password on an unlocked account succeeds and clears its throttle state', async () => {
    const { service, throttle } = await makeHarness();
    throttle.recordFailure(throttleKeyFor(KNOWN_EMAIL), '1.1.1.1');
    throttle.recordFailure(throttleKeyFor(KNOWN_EMAIL), '1.1.1.1');

    const result = await service.evaluate(KNOWN_EMAIL, 'correct-horse-battery-staple', '1.1.1.1');
    expect(result.outcome).toBe('success');
    expect(result.userId).toBe('user-1');

    // Throttle state reset: next failure should be attempt #1 again.
    expect(throttle.recordFailure(throttleKeyFor(KNOWN_EMAIL), '1.1.1.1').delayMs).toBe(0);
  });

  it('a locked account never reaches the credential lookup (no DB round-trip on a login it will refuse anyway)', async () => {
    const throttle = new LoginThrottleService(new InMemoryAttemptStore());
    for (let i = 0; i < 10; i++) throttle.recordFailure(throttleKeyFor(LOCKED_EMAIL), '3.3.3.3');

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
    // 4th failure — throttle would compute 16s — evaluate() must surface it.
    const result = await service.evaluate(KNOWN_EMAIL, 'wrong-guess', '1.1.1.1');
    expect(result.delayMs).toBe(16_000);
  });
});
