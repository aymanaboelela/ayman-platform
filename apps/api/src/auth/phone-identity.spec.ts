import { planPhoneNormalization, PHONE_SIGN_UP_PATH } from './phone-identity';

/**
 * The pure half of the sign-up/sign-in phone handling, split out for the same
 * reason `login-security.service.ts` is: `./login-security.hook.ts` imports
 * `better-auth/api`, which is ESM-only and cannot be `require()`d by Jest, so
 * anything with a decision in it has to live where a spec can reach it.
 */
describe('planPhoneNormalization', () => {
  describe('paths it does not touch', () => {
    it.each(['/sign-in/email', '/get-session', '/update-user', '/sign-in/social'])(
      'ignores %s',
      (path) => {
        expect(planPhoneNormalization(path, { phoneNumber: '01012345678' })).toEqual({
          action: 'ignore',
        });
      },
    );
  });

  describe('sign-up — the one place a phone is MANDATORY', () => {
    /**
     * This is the server-side enforcement of "every account has a phone".
     * The register form validates too, but nothing stops a caller POSTing
     * straight past it, and `users.phone_number` is nullable (it has to be —
     * Google creates rows before the student reaches onboarding). Without this
     * branch, `/sign-up/email` is an open door to a permanently phone-less
     * password account.
     */
    it('rejects a sign-up with no phone at all', () => {
      expect(
        planPhoneNormalization(PHONE_SIGN_UP_PATH, {
          email: 'a@b.com',
          password: 'x',
        }),
      ).toEqual({ action: 'reject', message: 'رقم الموبايل مطلوب' });
    });

    it.each([undefined, null, '', '   '])('rejects a blank phone (%j)', (phoneNumber) => {
      expect(planPhoneNormalization(PHONE_SIGN_UP_PATH, { phoneNumber })).toEqual({
        action: 'reject',
        message: 'رقم الموبايل مطلوب',
      });
    });

    it('rejects a non-string phone rather than coercing it', () => {
      expect(planPhoneNormalization(PHONE_SIGN_UP_PATH, { phoneNumber: 201012345678 })).toEqual({
        action: 'reject',
        message: 'رقم الموبايل مطلوب',
      });
    });

    it.each(['+966501234567', '123', 'not a phone'])(
      'rejects an unparseable phone (%j) with the shape message',
      (phoneNumber) => {
        expect(planPhoneNormalization(PHONE_SIGN_UP_PATH, { phoneNumber })).toEqual({
          action: 'reject',
          message: 'رقم الهاتف يجب أن يكون رقمًا مصريًا صحيحًا',
        });
      },
    );

    it.each([
      ['01012345678', '+201012345678'],
      ['010 1234 5678', '+201012345678'],
      ['٠١٠١٢٣٤٥٦٧٨', '+201012345678'],
      ['+201012345678', '+201012345678'],
    ])('normalises %j to %s', (phoneNumber, expected) => {
      expect(
        planPhoneNormalization(PHONE_SIGN_UP_PATH, { phoneNumber, email: 'a@b.com' }),
      ).toEqual({
        action: 'rewrite',
        phoneNumber: expected,
      });
    });

    /**
     * The email is genuinely optional, but `/sign-up/email` validates its body
     * with `z.email()` in the route handler — before any table definition or
     * hook is consulted, and with no option to disable it. So a sign-up with
     * no address cannot reach the handler unless something fills one in.
     *
     * This is that fill-in. The value is marked with the reserved
     * `@phone.invalid` domain so `databaseHooks.user.create.before` can
     * recognise and strip it, which means it exists only inside the request
     * and is never written to the database.
     */
    it.each([undefined, null, '', '   '])(
      'supplies a throwaway address when the student gave none (%j)',
      (email) => {
        expect(
          planPhoneNormalization(PHONE_SIGN_UP_PATH, { phoneNumber: '01012345678', email }),
        ).toEqual({
          action: 'rewrite',
          phoneNumber: '+201012345678',
          email: '201012345678@phone.invalid',
        });
      },
    );

    it('derives the throwaway address from the NORMALISED number, so one account cannot mint two', () => {
      const viaNational = planPhoneNormalization(PHONE_SIGN_UP_PATH, {
        phoneNumber: '01012345678',
      });
      const viaE164 = planPhoneNormalization(PHONE_SIGN_UP_PATH, {
        phoneNumber: '+201012345678',
      });
      expect(viaNational).toEqual(viaE164);
    });

    it('leaves a real address completely alone', () => {
      expect(
        planPhoneNormalization(PHONE_SIGN_UP_PATH, {
          phoneNumber: '01012345678',
          email: 'student@example.com',
        }),
      ).toEqual({ action: 'rewrite', phoneNumber: '+201012345678' });
    });

    /**
     * Only sign-up. The OTP and sign-in routes have no email in their bodies
     * and must never acquire one — inventing an address on a LOOKUP path would
     * be manufacturing an identity rather than filling in a blank.
     */
    it('never supplies an address on a sign-in path', () => {
      expect(
        planPhoneNormalization('/sign-in/phone-number', { phoneNumber: '01012345678' }),
      ).toEqual({ action: 'rewrite', phoneNumber: '+201012345678' });
    });
  });

  describe('sign-in and the OTP routes — normalise, never reject', () => {
    const paths = [
      '/sign-in/phone-number',
      '/phone-number/send-otp',
      '/phone-number/verify',
      '/phone-number/request-password-reset',
      '/phone-number/reset-password',
    ];

    it.each(paths)('%s normalises a valid number', (path) => {
      expect(planPhoneNormalization(path, { phoneNumber: '01012345678' })).toEqual({
        action: 'rewrite',
        phoneNumber: '+201012345678',
      });
    });

    /**
     * S1. A malformed number at SIGN-IN must not produce its own error — that
     * would be a client-observable branch which "wrong password" does not
     * have. Left untouched, the lookup simply misses and the attempt lands on
     * the same generic 401 as every other bad credential.
     *
     * The register form is the opposite case, and rightly so: there, the
     * student is filling in a field and telling them the number is wrong leaks
     * nothing about who else exists.
     */
    it.each(paths)('%s leaves an unparseable number alone rather than rejecting', (path) => {
      expect(planPhoneNormalization(path, { phoneNumber: 'garbage' })).toEqual({
        action: 'ignore',
      });
    });

    it.each(paths)('%s ignores a body with no phone at all', (path) => {
      expect(planPhoneNormalization(path, { code: '123456' })).toEqual({ action: 'ignore' });
    });
  });

  describe('defensive input handling', () => {
    it.each([undefined, null, 'a string body', 42])(
      'treats a non-object body (%j) as nothing to do on a sign-in path',
      (body) => {
        expect(planPhoneNormalization('/sign-in/phone-number', body)).toEqual({
          action: 'ignore',
        });
      },
    );

    /**
     * A sign-up with no parseable body still has to be refused — falling
     * through to `ignore` would let a caller skip the phone requirement just
     * by sending something Better Auth would later reject for its own reasons.
     */
    it.each([undefined, null, 'a string body'])(
      'still refuses a sign-up with a non-object body (%j)',
      (body) => {
        expect(planPhoneNormalization(PHONE_SIGN_UP_PATH, body)).toEqual({
          action: 'reject',
          message: 'رقم الموبايل مطلوب',
        });
      },
    );
  });
});
