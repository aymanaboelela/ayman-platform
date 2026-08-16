import { z } from '@ayman/contracts/zod';
import { egyptianPhone, normalizeEgyptianPhone } from '@ayman/contracts/phone';

/**
 * No relative imports in this file, on purpose — same reason as
 * `onboarding.ts`: apps/api may eventually import this module directly via
 * the `@ayman/contracts/auth` subpath export (see package.json) rather than
 * through the root barrel, and Node's native ESM loader cannot resolve an
 * extensionless relative specifier (e.g. `./copy/ar`) at runtime. A leaf
 * module with zero relative imports of its own sidesteps that failure mode
 * entirely, so validation messages are inlined here rather than pulled from
 * `copy/ar.ts`.
 *
 * The `@ayman/contracts/phone` import above obeys that same rule — it is the
 * subpath specifier, not `./phone`, precisely because `apps/api` now DOES load
 * this module at runtime (the sign-up normalisation hook needs
 * `resolveLoginIdentifier`'s parser). Written as `./phone` this line
 * type-checks, tests green, builds clean, and then fails the API at boot with
 * `ERR_MODULE_NOT_FOUND`. `apps/api/test/contracts-barrel.check.ts` guards it.
 */

// Matches Better Auth's own defaults (`emailAndPassword.minPasswordLength` /
// `maxPasswordLength`, unset in `auth.config.ts` — see
// `context/create-context.mjs`: 8 / 128). Client-side validation must never
// be LOOSER than what the server enforces, so these bounds are copied here
// rather than guessed independently.
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

export const AuthEmailSchema = z
  .string()
  .trim()
  .min(1, 'البريد الإلكتروني مطلوب')
  .email('أدخل بريدًا إلكترونيًا صحيحًا');

/** Full complexity check — used on the REGISTER form, where the password is
 * actually being chosen and the client can usefully catch a too-short value
 * before round-tripping to the server. */
export const AuthPasswordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `كلمة المرور لازم تكون ${MIN_PASSWORD_LENGTH} أحرف على الأقل`)
  .max(MAX_PASSWORD_LENGTH, 'كلمة المرور طويلة جدًا');

/**
 * The LOGIN form intentionally does NOT reuse `AuthPasswordSchema`. Login
 * failures must all resolve to one identical, generic response (S1) — the
 * server never reveals whether a submitted password fails on length,
 * correctness, or account existence. Enforcing a minimum length client-side
 * on login would let a user (or an attacker scripting the form) learn that a
 * short guess was rejected "before the real check" purely from client
 * behaviour, which is an enumeration-adjacent signal this schema must not
 * introduce. Login only checks that a password was typed at all.
 */
/**
 * ONE identifier field, holding either a phone or an email, and deliberately
 * unvalidated beyond "not empty".
 *
 * Two separate fields (or a phone/email toggle) would force the student to
 * classify their own account before they are allowed in, and they frequently
 * cannot: someone who signed up by phone and later added an email owns both,
 * and a Google student owns an address they never typed. The platform knows
 * which is which; asking is pushing our schema onto them.
 *
 * The absence of a shape check is S1, not laziness. Rejecting «ده مش إيميل ولا
 * رقم» client-side is a behaviour an attacker can script and a wall an honest
 * student with an odd legacy address can hit. Everything non-empty goes to the
 * server and comes back as the same generic 401.
 */
export const LoginSchema = z
  .object({
    identifier: z.string().trim().min(1, 'اكتب رقم موبايلك أو إيميلك'),
    password: z.string().min(1, 'كلمة المرور مطلوبة'),
  })
  .strict();

/**
 * Picks which Better Auth sign-in endpoint a submission belongs to, and — for
 * the phone branch — hands back the number ALREADY NORMALISED.
 *
 * That normalisation is the entire reason this is a function rather than a
 * regex at the call site: `/sign-in/phone-number` matches `user.phoneNumber`
 * by exact string equality, so `01012345678` and `+201012345678` are two
 * different accounts to it. See `normalizeEgyptianPhone`'s docblock.
 *
 * Unparseable input falls through to the EMAIL endpoint rather than erroring.
 * That keeps the S1 promise above — a typo earns the same generic 401 as any
 * other wrong credential, produced by the endpoint whose failure path is
 * already hardened by `createLoginSecurityHook`.
 */
export function resolveLoginIdentifier(
  identifier: string,
): { kind: 'phone'; value: string } | { kind: 'email'; value: string } {
  const trimmed = identifier.trim();
  /**
   * The `@` test runs FIRST, and it is not redundant with the parse below.
   *
   * `libphonenumber-js` extracts digits out of surrounding text rather than
   * demanding the whole string be a number, so it reads
   * `201012345678@phone.invalid` — a synthesised address, which is mostly
   * digits — as the perfectly valid number `+201012345678`. Routing on the
   * parse alone would send that address to the phone endpoint and silently
   * change which account was being asked for. Anything holding an `@` is an
   * address by definition; no phone number contains one.
   */
  if (trimmed.includes('@')) return { kind: 'email', value: trimmed };
  const phone = normalizeEgyptianPhone(trimmed);
  if (phone) return { kind: 'phone', value: phone };
  return { kind: 'email', value: trimmed };
}

/**
 * An untouched optional text input submits `''`, never `undefined`. Left
 * as-is, that empty string reaches `.email()` and the student is told the
 * field they deliberately skipped is invalid — the fastest way to make an
 * optional field feel required. Blank (or whitespace) means absent.
 */
/**
 * Deliberately NOT `z.preprocess`, which would have been the obvious spelling.
 * `preprocess` types its input as `unknown`, and `zodResolver` propagates that
 * into react-hook-form's field types — so the register form stops
 * type-checking and every `errors.email` access becomes untyped. The
 * `.optional().transform().pipe()` chain keeps the input as
 * `string | undefined`, which is what the `<input>` actually produces.
 */
const OptionalAuthEmailSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === undefined || value === '' ? undefined : value))
  .pipe(z.email('أدخل بريدًا إلكترونيًا صحيحًا').optional());

export const RegisterSchema = z
  .object({
    name: z.string().trim().min(2, 'الاسم الكامل مطلوب').max(120, 'الاسم طويل جدًا'),
    /**
     * The account's identity. Required, normalised to E.164 here so the value
     * that reaches `/sign-up/email` is already in the exact form
     * `/sign-in/phone-number` will later look it up by.
     *
     * Client-side normalisation is a convenience, NOT the guarantee — the
     * server re-normalises in `createPhoneNormalizationHook`, because nothing
     * stops a caller POSTing straight past this schema.
     */
    phone: egyptianPhone('رقم الموبايل مطلوب'),
    /**
     * Optional, and that is the product decision: the platform sends no email
     * — no verification, no password reset, no notifications (there is not a
     * single mail dependency in the repo). Demanding an address bought us
     * nothing and cost registrations from students who do not have one.
     *
     * When it is absent, `placeholderEmailForPhone` mints a stand-in, because
     * Better Auth's `email` column cannot be null. See that function for why.
     */
    email: OptionalAuthEmailSchema,
    password: AuthPasswordSchema,
    confirmPassword: z.string().min(1, 'تأكيد كلمة المرور مطلوب'),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: 'كلمتا المرور غير متطابقتين',
      });
    }
  });

export type Login = z.infer<typeof LoginSchema>;
export type Register = z.infer<typeof RegisterSchema>;
