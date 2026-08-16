import { describe, expect, it } from 'vitest';
import { LoginSchema, RegisterSchema, resolveLoginIdentifier } from './auth';

describe('LoginSchema', () => {
  /**
   * ONE field, not two. The sign-in form asks for «رقم الموبايل أو الإيميل»
   * and the client picks the endpoint from what was typed — see
   * `resolveLoginIdentifier` below.
   *
   * Asking twice ("sign in with phone" / "sign in with email" tabs) would make
   * the student classify their own account before they can log in, and they
   * have no way to know the answer: a student who signed up with a phone and
   * later added an email owns both, and a Google student owns an email they
   * never typed. One field, and the platform works it out.
   */
  it('accepts an email identifier + any non-empty password', () => {
    const result = LoginSchema.safeParse({
      identifier: 'student@example.com',
      password: 'x',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a phone identifier', () => {
    const result = LoginSchema.safeParse({ identifier: '01012345678', password: 'x' });
    expect(result.success).toBe(true);
  });

  /**
   * S1 (account enumeration), and the reason this schema is deliberately
   * near-empty. The login form must not reject an identifier on shape grounds
   * — «ده مش إيميل ولا رقم» told to someone who typed a typo is a client-side
   * behaviour difference an attacker can script, and it also fails the honest
   * student with a legacy account whose email has some shape zod dislikes.
   *
   * Anything non-empty goes to the server and comes back as the one generic
   * 401. The ONLY thing checked here is that the fields were filled in.
   */
  it('does not validate the SHAPE of the identifier (would weaken S1)', () => {
    const result = LoginSchema.safeParse({ identifier: 'not-an-email', password: 'x' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty identifier', () => {
    const result = LoginSchema.safeParse({ identifier: '', password: 'whatever' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty password', () => {
    const result = LoginSchema.safeParse({
      identifier: 'student@example.com',
      password: '',
    });
    expect(result.success).toBe(false);
  });

  /**
   * S1 again: a short-but-non-empty password is a valid — if wrong — guess and
   * must reach the server, so the generic 401 is what the user sees rather
   * than a client-only "too short" that behaves differently for real accounts
   * with a short legacy password than for accounts that do not exist.
   */
  it('does not enforce a minimum length on login passwords (would weaken S1)', () => {
    const result = LoginSchema.safeParse({
      identifier: 'student@example.com',
      password: 'ab',
    });
    expect(result.success).toBe(true);
  });

  it('rejects unrecognised keys (.strict())', () => {
    const result = LoginSchema.safeParse({
      identifier: 'student@example.com',
      password: 'whatever',
      role: 'admin',
    });
    expect(result.success).toBe(false);
  });
});

/**
 * Which of Better Auth's two sign-in endpoints a submission goes to.
 *
 * `/sign-in/phone-number` looks the account up by exact string, so the phone
 * branch must hand back the NORMALISED number — the whole point of routing
 * here rather than in the form.
 */
describe('resolveLoginIdentifier', () => {
  it.each([
    ['01012345678', '+201012345678'],
    ['+201012345678', '+201012345678'],
    ['٠١٠١٢٣٤٥٦٧٨', '+201012345678'],
    ['010 1234 5678', '+201012345678'],
  ])('routes %j to the phone endpoint as %s', (input, expected) => {
    expect(resolveLoginIdentifier(input)).toEqual({
      kind: 'phone',
      value: expected,
    });
  });

  it.each(['student@example.com', 'AYMAN@Example.COM'])(
    'routes %j to the email endpoint',
    (input) => {
      expect(resolveLoginIdentifier(input).kind).toBe('email');
    },
  );

  /**
   * Anything unparseable goes to the EMAIL endpoint rather than being rejected
   * here. That keeps the "no client-side shape judgement" promise above: a
   * typo produces the same generic 401 every other wrong credential produces,
   * from the endpoint that already has the hardened failure path.
   */
  it.each(['not-an-email', '12345', '+966501234567'])(
    'falls back to the email endpoint for unparseable input (%j)',
    (input) => {
      expect(resolveLoginIdentifier(input).kind).toBe('email');
    },
  );

  it('trims before deciding', () => {
    expect(resolveLoginIdentifier('  01012345678  ')).toEqual({
      kind: 'phone',
      value: '+201012345678',
    });
  });

  /**
   * A student cannot type the synthesised address — they never saw it — but
   * nothing stops someone pasting one, and it must not become a back door that
   * behaves differently from the number it was minted from.
   */
  it('passes a placeholder address through as an ordinary email', () => {
    expect(resolveLoginIdentifier('201012345678@phone.invalid').kind).toBe('email');
  });
});

describe('RegisterSchema', () => {
  function basePayload(overrides: Record<string, unknown> = {}) {
    return {
      name: 'أحمد محمد',
      phone: '01012345678',
      password: 'correcthorsebatterystaple',
      confirmPassword: 'correcthorsebatterystaple',
      ...overrides,
    };
  }

  it('accepts a payload with no email at all', () => {
    const result = RegisterSchema.safeParse(basePayload());
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBeUndefined();
  });

  it('normalises the phone to E.164', () => {
    const result = RegisterSchema.safeParse(basePayload({ phone: '010 1234 5678' }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBe('+201012345678');
  });

  it('requires the phone', () => {
    expect(RegisterSchema.safeParse(basePayload({ phone: '' })).success).toBe(false);
  });

  it('rejects a non-Egyptian phone', () => {
    expect(RegisterSchema.safeParse(basePayload({ phone: '+966501234567' })).success).toBe(
      false,
    );
  });

  /**
   * The email is optional, and an untouched text input submits `''`, not
   * `undefined`. Without this coercion the empty string would hit `.email()`
   * and the student would be told their blank optional field is invalid —
   * which is the single most likely way to make an optional field feel
   * required.
   */
  it.each(['', '   '])('treats a blank email (%j) as absent, not invalid', (email) => {
    const result = RegisterSchema.safeParse(basePayload({ email }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBeUndefined();
  });

  it('accepts a real email when one is given', () => {
    const result = RegisterSchema.safeParse(basePayload({ email: 'student@example.com' }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe('student@example.com');
  });

  it('still rejects a malformed email when one IS given', () => {
    expect(RegisterSchema.safeParse(basePayload({ email: 'not-an-email' })).success).toBe(
      false,
    );
  });

  it('rejects mismatched password/confirmPassword', () => {
    const result = RegisterSchema.safeParse(
      basePayload({ confirmPassword: 'somethingElse123' }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('confirmPassword'))).toBe(true);
    }
  });

  // Matches Better Auth's own default (create-context.mjs: minPasswordLength
  // = 8) — client-side validation MATCHING the server floor, not inventing a
  // stricter one.
  it('rejects a password shorter than 8 characters', () => {
    const result = RegisterSchema.safeParse(
      basePayload({ password: 'short1', confirmPassword: 'short1' }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a password longer than 128 characters', () => {
    const tooLong = 'a'.repeat(129);
    const result = RegisterSchema.safeParse(
      basePayload({ password: tooLong, confirmPassword: tooLong }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a missing/blank name', () => {
    const result = RegisterSchema.safeParse(basePayload({ name: ' ' }));
    expect(result.success).toBe(false);
  });

  // S11-style mass-assignment guard, same shape as OnboardingSchema's own
  // test: a client-supplied role/userId must fail validation, not be silently
  // stripped.
  it('rejects unrecognised keys such as role (.strict())', () => {
    const result = RegisterSchema.safeParse(basePayload({ role: 'admin' }));
    expect(result.success).toBe(false);
  });
});
