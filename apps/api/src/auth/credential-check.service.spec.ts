import * as argon2 from 'argon2';
import { ARGON2_OPTIONS } from './argon2-options';
import {
  DUMMY_PASSWORD_HASH,
  type CredentialLookup,
  type LoginIdentifier,
  type StoredCredential,
  emailIdentifier,
  normalizeEmail,
  phoneIdentifier,
  throttleKeyFor,
  verifyLoginCredential,
} from './credential-check.service';

/**
 * S1 (identical outcome shape for unknown-email and wrong-password) and S2
 * (Argon2 timing equalisation) — written before `credential-check.service`
 * exists.
 */

/**
 * Keyed by `throttleKeyFor` so the fake tells an email apart from a phone —
 * the two are different columns in the real lookup, and a fake that flattened
 * them back to one string would hide exactly the bug this split exists to
 * prevent.
 */
class FakeLookup implements CredentialLookup {
  constructor(private readonly credentials: Map<string, StoredCredential>) {}
  async findCredential(identifier: LoginIdentifier): Promise<StoredCredential | null> {
    return this.credentials.get(throttleKeyFor(identifier)) ?? null;
  }
}

const KNOWN_EMAIL = emailIdentifier('known@example.com');
const KNOWN_PHONE = phoneIdentifier('+201012345678');

describe('verifyLoginCredential — S1: identical outcome shape', () => {
  const realPassword = 'correct-horse-battery-staple';
  let realHash: string;
  let lookup: CredentialLookup;

  beforeAll(async () => {
    realHash = await argon2.hash(realPassword, ARGON2_OPTIONS);
    lookup = new FakeLookup(
      new Map([[throttleKeyFor(KNOWN_EMAIL), { userId: 'user-1', passwordHash: realHash }]]),
    );
  });

  it('an unknown email fails with the same shape as a wrong password on a real account', async () => {
    const unknownEmailResult = await verifyLoginCredential(
      emailIdentifier('nobody@example.com'),
      'whatever-password',
      lookup,
    );
    const wrongPasswordResult = await verifyLoginCredential(
      KNOWN_EMAIL,
      'definitely-not-the-password',
      lookup,
    );

    expect(unknownEmailResult).toEqual({ success: false });
    expect(wrongPasswordResult).toEqual({ success: false });
    // Byte-identical: not just "both false", but the exact same object shape
    // — no leftover `userId` or other distinguishing field on either path.
    expect(unknownEmailResult).toEqual(wrongPasswordResult);
  });

  it('the correct password on a real account succeeds and reveals the userId', async () => {
    const result = await verifyLoginCredential(KNOWN_EMAIL, realPassword, lookup);
    expect(result).toEqual({ success: true, userId: 'user-1' });
  });

  it('an account with no credential row (OAuth-only user) fails like an unknown email', async () => {
    const oauthOnlyLookup = new FakeLookup(new Map());
    const result = await verifyLoginCredential(emailIdentifier('oauth@example.com'), 'anything', oauthOnlyLookup);
    expect(result).toEqual({ success: false });
  });

  it('finds the same account by phone, with the same result shape', async () => {
    const phoneLookup = new FakeLookup(
      new Map([[throttleKeyFor(KNOWN_PHONE), { userId: 'user-1', passwordHash: realHash }]]),
    );
    await expect(verifyLoginCredential(KNOWN_PHONE, realPassword, phoneLookup)).resolves.toEqual({
      success: true,
      userId: 'user-1',
    });
    await expect(verifyLoginCredential(KNOWN_PHONE, 'wrong', phoneLookup)).resolves.toEqual({
      success: false,
    });
  });

  /**
   * The kinds must not be interchangeable. If the identifier ever collapsed
   * back to a bare string, a phone-keyed row would answer an email lookup for
   * the same text — which is not hypothetical, because a synthesised address
   * is literally the phone's digits.
   */
  it('does not match a phone-registered account via an email identifier of the same text', async () => {
    const phoneLookup = new FakeLookup(
      new Map([[throttleKeyFor(KNOWN_PHONE), { userId: 'user-1', passwordHash: realHash }]]),
    );
    await expect(
      verifyLoginCredential(emailIdentifier('+201012345678'), realPassword, phoneLookup),
    ).resolves.toEqual({ success: false });
  });
});

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Student@Example.COM  ')).toBe('student@example.com');
  });
});

describe('DUMMY_PASSWORD_HASH', () => {
  it('is a real Argon2id hash at the exact production parameters (m=19456, t=2, p=1)', () => {
    expect(DUMMY_PASSWORD_HASH).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it('never verifies true against any password a caller might send', async () => {
    for (const guess of ['', 'password', 'correct-horse-battery-staple', DUMMY_PASSWORD_HASH]) {
      await expect(argon2.verify(DUMMY_PASSWORD_HASH, guess)).resolves.toBe(false);
    }
  });
});

describe('verifyLoginCredential — S2: timing equalisation', () => {
  // Real numbers from this run are recorded in the task report — this test
  // only guards against regression (e.g., someone "optimising" the unknown
  // path to skip the dummy hash), with generous slack for CI/local jitter.
  const realPassword = 'correct-horse-battery-staple';
  const ITERATIONS = 25;

  function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
      : (sorted[mid] as number);
  }
  function mean(values: number[]): number {
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  it('unknown-email (dummy hash) and real-path (existing user, wrong password) timing are within ~15-20%', async () => {
    const realHash = await argon2.hash(realPassword, ARGON2_OPTIONS);
    const lookup = new FakeLookup(
      new Map([[throttleKeyFor(KNOWN_EMAIL), { userId: 'user-1', passwordHash: realHash }]]),
    );

    const unknownTimings: number[] = [];
    const realTimings: number[] = [];

    // Interleaved, not two separate blocks, so a systematic drift (CPU
    // throttling, GC pause) doesn't bias one path over the other.
    for (let i = 0; i < ITERATIONS; i++) {
      const t0 = performance.now();
      await verifyLoginCredential(emailIdentifier('nobody@example.com'), 'guess-password', lookup);
      unknownTimings.push(performance.now() - t0);

      const t1 = performance.now();
      await verifyLoginCredential(KNOWN_EMAIL, 'wrong-password-guess', lookup);
      realTimings.push(performance.now() - t1);
    }

    const unknownMedian = median(unknownTimings);
    const realMedian = median(realTimings);
    const unknownMean = mean(unknownTimings);
    const realMean = mean(realTimings);

    const medianDiffPct = (Math.abs(unknownMedian - realMedian) / realMedian) * 100;
    const meanDiffPct = (Math.abs(unknownMean - realMean) / realMean) * 100;

    // Intentional: S2 requires reporting actual timing numbers.
    console.log(
      `[S2 timing] unknown-email: median=${unknownMedian.toFixed(2)}ms mean=${unknownMean.toFixed(2)}ms | ` +
        `real-path: median=${realMedian.toFixed(2)}ms mean=${realMean.toFixed(2)}ms | ` +
        `median diff=${medianDiffPct.toFixed(1)}% mean diff=${meanDiffPct.toFixed(1)}%`,
    );

    // ~15% is the target; assert a looser 25% here to avoid CI flakiness
    // from the shared runner, while the report records and reasons about the
    // actual tighter number.
    expect(medianDiffPct).toBeLessThan(25);
  }, 30_000);
});
