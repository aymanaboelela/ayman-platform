import { z } from '@ayman/contracts/zod';
import { egyptianPhone, toAsciiDigits } from '@ayman/contracts/phone';
import { AuthPasswordSchema } from '@ayman/contracts/auth';

/**
 * «نسيت كلمة السر» — a six-digit code on WhatsApp, from the stack's own
 * linked number. The shapes both halves agree on, and the limits.
 *
 * Subpath imports only (`@ayman/contracts/phone`, never `./phone`): the API
 * loads this module at runtime, and Node cannot resolve an extensionless
 * relative specifier — see the note at the top of `auth.ts`.
 *
 * ## Why the limits live here and not in the service
 *
 * The web shows the resend countdown and the code's lifetime, and a number
 * typed twice drifts. The API is still the only thing that ENFORCES any of
 * them — the client reads them to draw a timer, nothing more.
 */
export const PASSWORD_RESET_LIMITS = {
  /** Digits in the code. 10^6 guesses, of which `maxAttempts` are allowed per code. */
  codeLength: 6,
  /** How long a delivered code verifies. */
  codeTtlSeconds: 10 * 60,
  /** Wrong guesses before the code is burned. */
  maxAttempts: 5,
  /** Minimum gap between two requests for the same number. */
  resendCooldownSeconds: 60,
  /**
   * Per number. Counted over EVERY request for it — whether or not an account
   * owns it — so a limit that fires says nothing about who is registered.
   */
  perPhonePerHour: 3,
  perPhonePerDay: 5,
  /**
   * Per client (`cf-connecting-ip`, IPv6 as its /64). Loose enough for a
   * centre's shared wifi, tight enough that one script walking a list of
   * numbers stops within the hour.
   */
  perIpPerHour: 6,
  perIpPerDay: 20,
  /**
   * Requests of any kind, for the whole stack. Past these every caller is told
   * «إرسال الكود واقف» before anything is looked up.
   *
   * Counted over EVERY request, not over sends, on purpose. A cap on sends
   * that the request step could see would be an oracle at its edge: with one
   * send left, ask for a stranger's number and then for your own — if yours
   * is now refused, the stranger's was registered. So the visible cap counts
   * what every caller can cause equally, and the sends cap below is enforced
   * where nobody can watch it.
   */
  requestsPerHour: 30,
  requestsPerDay: 120,
  /**
   * Messages actually put on the wire, for the whole stack. THIS is the limit
   * that protects the number: every code to a student who never chatted with
   * it is a NEW chat, and a burst of new chats is exactly what gets a personal
   * WhatsApp account restricted or banned. Well under the warm-up ramp's
   * floor (`DEVICE_WARMUP`, 40 a day) so campaigns and notices keep room.
   *
   * Enforced only in the delivery half, after the response: a request past it
   * is answered `accepted` like any other and simply sends nothing, which is
   * what the page's «لو الكود موصلش» line is for.
   */
  sendsPerHour: 8,
  sendsPerDay: 25,
} as const;

/** The code as typed: Arabic-Indic digits and stray spaces are the student's keyboard, not a typo. */
export const PasswordResetCodeSchema = z
  .string()
  .transform((value) => toAsciiDigits(value).replace(/\s+/g, ''))
  .refine((value) => new RegExp(`^\\d{${PASSWORD_RESET_LIMITS.codeLength}}$`).test(value), 'الكود 6 أرقام');

export const PasswordResetRequestSchema = z
  .object({
    phoneNumber: egyptianPhone('رقم الموبايل مطلوب'),
  })
  .strict();
export type PasswordResetRequest = z.infer<typeof PasswordResetRequestSchema>;

export const PasswordResetConfirmSchema = z
  .object({
    phoneNumber: egyptianPhone('رقم الموبايل مطلوب'),
    code: PasswordResetCodeSchema,
    newPassword: AuthPasswordSchema,
  })
  .strict();
export type PasswordResetConfirm = z.infer<typeof PasswordResetConfirmSchema>;

/**
 * The request step's whole vocabulary.
 *
 * `accepted` is said for EVERY number that passes the limits — registered or
 * not, deliverable or not. The send happens after the response, so there is
 * nothing per-account for this answer to carry even by accident.
 *
 * `unavailable` is a fact about the STACK (no linked device, WhatsApp is
 * refusing new chats, the day's sends are spent) and is said to everyone
 * alike, before any account is looked at.
 */
export const PasswordResetRequestResultSchema = z.object({
  status: z.enum(['accepted', 'unavailable']),
});
export type PasswordResetRequestResult = z.infer<typeof PasswordResetRequestResultSchema>;

/**
 * `reset` — the password changed and every session was signed out.
 * `google` — the code was right, and the account has no password to change:
 * it signs in with Google. Only said AFTER a correct code, so it is never a
 * way to learn how a number's account was made.
 */
export const PasswordResetConfirmResultSchema = z.object({
  status: z.enum(['reset', 'google']),
});
export type PasswordResetConfirmResult = z.infer<typeof PasswordResetConfirmResultSchema>;

/** The one error code the confirm step answers with, whatever was wrong. */
export const PASSWORD_RESET_INVALID_CODE = 'PASSWORD_RESET_INVALID_CODE';
/** Turnstile said no. Not an account fact. */
export const PASSWORD_RESET_HUMAN_CHECK = 'PASSWORD_RESET_HUMAN_CHECK';
/** A request limit fired; `details.retryAfterSeconds` says for how long. */
export const PASSWORD_RESET_LIMITED = 'PASSWORD_RESET_LIMITED';
