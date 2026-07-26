import * as argon2 from 'argon2';
import { ARGON2_OPTIONS } from './argon2-options';
import type { CredentialLookup, StoredCredential } from './credential-check.service';
import { GENERIC_LOGIN_ERROR, GENERIC_LOGIN_STATUS, LoginSecurityService } from './login-security.service';
import { InMemoryAttemptStore, LoginThrottleService } from './login-throttle.service';

/**
 * S1 end-to-end at the orchestration layer: unknown email, wrong password,
 * and a locked account must produce byte-identical outcome bodies and
 * status codes. Written before `LoginSecurityService` exists.
 */

class FakeLookup implements CredentialLookup {
  constructor(private readonly credentials: Map<string, StoredCredential>) {}
  async findCredential(normalizedEmail: string): Promise<StoredCredential | null> {
    return this.credentials.get(normalizedEmail) ?? null;
  }
}

async function makeHarness() {
  const realPassword = 'correct-horse-battery-staple';
  const realHash = await argon2.hash(realPassword, ARGON2_OPTIONS);
  const lookup = new FakeLookup(
    new Map([['known@example.com', { userId: 'user-1', passwordHash: realHash }]]),
  );
  const throttle = new LoginThrottleService(new InMemoryAttemptStore());
  const service = new LoginSecurityService(throttle, lookup);
  return { service, throttle, lookup, realPassword };
}

describe('LoginSecurityService — S1: identical responses across all three failure modes', () => {
  it('unknown email, wrong password, and a locked account share status + body', async () => {
    const { service, throttle } = await makeHarness();

    const unknown = await service.evaluate('nobody@example.com', 'anything', '1.1.1.1');

    const wrongPassword = await service.evaluate('known@example.com', 'wrong-guess', '2.2.2.2');

    // Lock a third account outright, then attempt against it.
    for (let i = 0; i < 10; i++) throttle.recordFailure('locked@example.com', '3.3.3.3');
    const locked = await service.evaluate('locked@example.com', 'anything', '3.3.3.3');

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

  it('a correct password on an unlocked account succeeds and clears its throttle state', async () => {
    const { service, throttle } = await makeHarness();
    throttle.recordFailure('known@example.com', '1.1.1.1');
    throttle.recordFailure('known@example.com', '1.1.1.1');

    const result = await service.evaluate('known@example.com', 'correct-horse-battery-staple', '1.1.1.1');
    expect(result.outcome).toBe('success');
    expect(result.userId).toBe('user-1');

    // Throttle state reset: next failure should be attempt #1 again.
    expect(throttle.recordFailure('known@example.com', '1.1.1.1').delayMs).toBe(0);
  });

  it('a locked account never reaches the credential lookup (no DB round-trip on a login it will refuse anyway)', async () => {
    const throttle = new LoginThrottleService(new InMemoryAttemptStore());
    for (let i = 0; i < 10; i++) throttle.recordFailure('locked@example.com', '3.3.3.3');

    let called = false;
    const lookup: CredentialLookup = {
      async findCredential() {
        called = true;
        return null;
      },
    };
    const service = new LoginSecurityService(throttle, lookup);

    await service.evaluate('locked@example.com', 'anything', '3.3.3.3');
    expect(called).toBe(false);
  });

  it('a failed attempt on an unlocked account returns the throttle-computed delay', async () => {
    const { service, throttle } = await makeHarness();
    for (let i = 0; i < 3; i++) throttle.recordFailure('known@example.com', '1.1.1.1');
    // 4th failure — throttle would compute 16s — evaluate() must surface it.
    const result = await service.evaluate('known@example.com', 'wrong-guess', '1.1.1.1');
    expect(result.delayMs).toBe(16_000);
  });
});
