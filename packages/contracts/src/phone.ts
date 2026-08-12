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
 * Rejects anything `libphonenumber-js` cannot parse as a valid +20 number.
 * Numbers written the way Egyptians actually type them — a leading zero,
 * `01012345678` — are accepted and normalised, not rejected for shape.
 */
export function egyptianPhone(requiredMessage: string) {
  return z
    .string()
    .trim()
    .min(1, requiredMessage)
    .transform((value, ctx) => {
      try {
        const parsed = parsePhoneNumberWithError(value, "EG", EG_METADATA);
        if (!parsed.isValid() || parsed.country !== "EG") {
          ctx.addIssue({ code: "custom", message: INVALID });
          return z.NEVER;
        }
        return parsed.number;
      } catch {
        ctx.addIssue({ code: "custom", message: INVALID });
        return z.NEVER;
      }
    });
}
