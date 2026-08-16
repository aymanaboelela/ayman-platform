import { parsePhoneNumberWithError } from "libphonenumber-js/core";
import { z } from '@ayman/contracts/zod';
import { EG_METADATA } from "@ayman/contracts/eg-metadata";

/**
 * Egyptian phone numbers, normalised to E.164.
 *
 * Lifted out of `onboarding.ts` when المساعد's guest form became the second
 * place that needs one. Two copies of a phone validator drift the moment one
 * of them is relaxed for a support case, and the failure is invisible: the
 * onboarding form and the assistant form would disagree about what a valid
 * number is, and only one of them would tell the student.
 *
 * No relative imports — a leaf module both `onboarding.ts` and
 * `assistant/conversation.ts` reach without pulling the root barrel. That rule
 * covers `@ayman/contracts/eg-metadata` above too, and it is not stylistic:
 * `apps/api` reaches this file at runtime and Node's ESM loader will not add a
 * `.ts` extension to `'./eg-metadata'` for you. Written relatively, this line
 * type-checks, tests green, builds clean and then fails the API at boot with
 * `ERR_MODULE_NOT_FOUND` — the H3 trap `apps/api/test/contracts-barrel.check.ts`
 * documents at length. Verified against Node directly, not assumed.
 *
 * ## The `/core` build, and why the metadata is passed by hand
 *
 * `libphonenumber-js`'s default entry point carries `metadata.min.json` — 245
 * countries, 84,269 bytes raw / 19,781 gzip, parsed in full on module
 * evaluation. This module is on the critical path of effectively every page in
 * the product (see `eg-metadata.ts` for the chain through the assistant
 * widget), and the `parsed.country !== 'EG'` line below means 244 of those 245
 * countries could never have produced an accepted number. `/core` is the same
 * library with no metadata compiled in; `EG_METADATA` is 366 bytes, filtered
 * out of that very same `metadata.min.json`, so no verdict changes.
 *
 * One behaviour DOES shift, and it is invisible to the student: a non-Egyptian
 * number used to parse successfully and then fail the `country !== 'EG'` check,
 * and now throws `INVALID_COUNTRY` because its calling code is not in the blob.
 * Both land in the same `catch` and both produce `INVALID`, which is why the
 * rejection branch and the catch branch below say exactly the same thing.
 */

const INVALID = "رقم الهاتف يجب أن يكون رقمًا مصريًا صحيحًا";

/**
 * The one parser. Returns the E.164 form (`+201012345678`) or `null` — never
 * throws, and carries no message, so it is usable everywhere a zod issue would
 * be the wrong shape of answer.
 *
 * It exists as a separate export because the phone is now a LOGIN IDENTIFIER,
 * not just a profile field, and two of its three callers cannot use a zod
 * schema:
 *
 *   · Better Auth's `phoneNumberValidator` option is typed to return a
 *     `boolean`. It is a gate, not a transform — the library keeps whatever
 *     string it was handed.
 *   · Better Auth then looks the account up by EXACT STRING EQUALITY
 *     (`adapter.findOne({ field: 'phoneNumber', value })` in
 *     `plugins/phone-number/routes.mjs`). There is no normalisation hook
 *     anywhere in that path.
 *
 * Put together, those two facts mean the library will happily store
 * `+201012345678` at sign-up and then fail to find it when the same student
 * types `01012345678` at sign-in — with the unique index agreeing, because as
 * strings they genuinely differ. The student is simply told they have no
 * account, and nothing anywhere logs an error. That is why normalisation has
 * to happen on the way IN, in a Better Auth `before` hook, using exactly the
 * function the form uses.
 */
export function normalizeEgyptianPhone(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = parsePhoneNumberWithError(trimmed, "EG", EG_METADATA);
    if (!parsed.isValid() || parsed.country !== "EG") return null;
    return parsed.number;
  } catch {
    return null;
  }
}

/**
 * Rejects anything `libphonenumber-js` cannot parse as a valid +20 number.
 * Numbers written the way Egyptians actually type them — a leading zero,
 * `01012345678` — are accepted and normalised, not rejected for shape.
 *
 * A thin wrapper over `normalizeEgyptianPhone` so the form and the server-side
 * hook cannot drift into disagreeing about what a valid number is.
 */
export function egyptianPhone(requiredMessage: string) {
  return z
    .string()
    .trim()
    .min(1, requiredMessage)
    .transform((value, ctx) => {
      const normalized = normalizeEgyptianPhone(value);
      if (normalized === null) {
        ctx.addIssue({ code: "custom", message: INVALID });
        return z.NEVER;
      }
      return normalized;
    });
}

/**
 * The domain every synthesised address sits under. `.invalid` is reserved by
 * RFC 2606 §2 and is guaranteed never to be delegated, so no address built on
 * it can ever collide with a real one or accidentally receive mail.
 */
const PLACEHOLDER_EMAIL_DOMAIN = "phone.invalid";

/**
 * Mints the stand-in address for a student who registered with a phone and no
 * email.
 *
 * This is a workaround for a hard constraint, not a design preference. Better
 * Auth 1.6.25 declares `email` as `required: true` and `unique: true` on its
 * core user table (`@better-auth/core/db/get-tables.mjs`) and validates it with
 * a bare `z.string()`; there is no option in the version to relax either. And
 * relaxing the Postgres column by hand is worse than useless — Postgres allows
 * any number of NULLs under a unique index, so `users_email_key` would silently
 * stop constraining precisely the phone-only accounts, and `findUnique({ where:
 * { email } })` stops being valid Prisma input for a nullable unique field.
 *
 * Deriving the local part from the number means the address inherits the
 * number's uniqueness, so the email index keeps doing real work instead of
 * guarding a column full of nulls.
 *
 * The input is normalised first. Skipping that would let `01012345678` and
 * `+201012345678` mint two different addresses for what is one account.
 */
export function placeholderEmailForPhone(phone: string): string {
  const normalized = normalizeEgyptianPhone(phone) ?? phone.trim();
  return `${normalized.replace(/^\+/, "")}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

/**
 * Guards every surface that prints an email.
 *
 * A synthesised address is an implementation detail of the sign-up flow; shown
 * to an admin in the students table, or back to the student in their own
 * profile, it reads as corrupted data. Call this before rendering
 * `user.email` ANYWHERE, and render the phone instead.
 *
 * Case-insensitive because Better Auth lowercases every address at sign-up
 * (`sign-up.mjs`: `email.toLowerCase()`), so what comes back out of the
 * database is not necessarily byte-identical to what went in. Accepts
 * null/undefined so callers do not each have to guard the column first.
 */
export function isPlaceholderEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
}
