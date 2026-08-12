import { z } from "zod";

/**
 * No relative imports in this file, on purpose — same reason as
 * `onboarding.ts`: apps/api may eventually import this module directly via
 * the `@ayman/contracts/auth` subpath export (see package.json) rather than
 * through the root barrel, and Node's native ESM loader cannot resolve an
 * extensionless relative specifier (e.g. `./copy/ar`) at runtime. A leaf
 * module with zero relative imports of its own sidesteps that failure mode
 * entirely, so validation messages are inlined here rather than pulled from
 * `copy/ar.ts`.
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
  .min(1, "البريد الإلكتروني مطلوب")
  .email("أدخل بريدًا إلكترونيًا صحيحًا");

/** Full complexity check — used on the REGISTER form, where the password is
 * actually being chosen and the client can usefully catch a too-short value
 * before round-tripping to the server. */
export const AuthPasswordSchema = z
  .string()
  .min(
    MIN_PASSWORD_LENGTH,
    `كلمة المرور لازم تكون ${MIN_PASSWORD_LENGTH} أحرف على الأقل`,
  )
  .max(MAX_PASSWORD_LENGTH, "كلمة المرور طويلة جدًا");

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
export const LoginSchema = z
  .object({
    email: AuthEmailSchema,
    password: z.string().min(1, "كلمة المرور مطلوبة"),
  })
  .strict();

export const RegisterSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "الاسم الكامل مطلوب")
      .max(120, "الاسم طويل جدًا"),
    email: AuthEmailSchema,
    password: AuthPasswordSchema,
    confirmPassword: z.string().min(1, "تأكيد كلمة المرور مطلوب"),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "كلمتا المرور غير متطابقتين",
      });
    }
  });

export type Login = z.infer<typeof LoginSchema>;
export type Register = z.infer<typeof RegisterSchema>;
