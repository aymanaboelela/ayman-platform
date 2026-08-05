import { parsePhoneNumberWithError } from 'libphonenumber-js';
import { z } from 'zod';

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
 * `assistant/conversation.ts` reach without pulling the root barrel.
 */

const INVALID = 'رقم الهاتف يجب أن يكون رقمًا مصريًا صحيحًا';

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
        const parsed = parsePhoneNumberWithError(value, 'EG');
        if (!parsed.isValid() || parsed.country !== 'EG') {
          ctx.addIssue({ code: 'custom', message: INVALID });
          return z.NEVER;
        }
        return parsed.number;
      } catch {
        ctx.addIssue({ code: 'custom', message: INVALID });
        return z.NEVER;
      }
    });
}
