import { describe, expect, it } from 'vitest';
import { LoginSchema, RegisterSchema } from './auth';

describe('LoginSchema', () => {
  it('accepts a well-formed email + any non-empty password', () => {
    const result = LoginSchema.safeParse({ email: 'student@example.com', password: 'x' });
    expect(result.success).toBe(true);
  });

  it('rejects a malformed email', () => {
    const result = LoginSchema.safeParse({ email: 'not-an-email', password: 'whatever' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty password', () => {
    const result = LoginSchema.safeParse({ email: 'student@example.com', password: '' });
    expect(result.success).toBe(false);
  });

  /**
   * S1 (account enumeration): the login form must not reject a password on
   * shape grounds the server itself doesn't enforce at sign-in time (e.g. a
   * length floor). A short-but-non-empty password is a valid — if wrong —
   * guess, and must reach the server so the generic 401 is what the user
   * sees, not a client-only "too short" message that would behave
   * differently for real accounts with a short legacy password than for
   * accounts that don't exist at all.
   */
  it('does not enforce a minimum length on login passwords (would weaken S1)', () => {
    const result = LoginSchema.safeParse({ email: 'student@example.com', password: 'ab' });
    expect(result.success).toBe(true);
  });

  it('rejects unrecognised keys (.strict())', () => {
    const result = LoginSchema.safeParse({
      email: 'student@example.com',
      password: 'whatever',
      role: 'admin',
    });
    expect(result.success).toBe(false);
  });
});

describe('RegisterSchema', () => {
  function basePayload(overrides: Record<string, unknown> = {}) {
    return {
      name: 'أحمد محمد',
      email: 'student@example.com',
      password: 'correcthorsebatterystaple',
      confirmPassword: 'correcthorsebatterystaple',
      ...overrides,
    };
  }

  it('accepts a well-formed payload with matching passwords', () => {
    const result = RegisterSchema.safeParse(basePayload());
    expect(result.success).toBe(true);
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
  // = 8) — this is client-side validation MATCHING the server floor, not
  // inventing a stricter one.
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

  it('rejects a malformed email', () => {
    const result = RegisterSchema.safeParse(basePayload({ email: 'not-an-email' }));
    expect(result.success).toBe(false);
  });

  it('rejects a missing/blank name', () => {
    const result = RegisterSchema.safeParse(basePayload({ name: ' ' }));
    expect(result.success).toBe(false);
  });

  // S11-style mass-assignment guard, same shape as OnboardingSchema's own
  // test: a client-supplied role/userId must fail validation, not be
  // silently stripped.
  it('rejects unrecognised keys such as role (.strict())', () => {
    const result = RegisterSchema.safeParse(basePayload({ role: 'admin' }));
    expect(result.success).toBe(false);
  });
});
