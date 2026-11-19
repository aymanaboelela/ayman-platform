import { z } from '@ayman/contracts/zod';
import {
  ACQUISITION_FBCLID_MAX,
  ACQUISITION_PATH_MAX,
  ACQUISITION_VALUE_MAX,
  cleanAcquisitionToken,
  cleanAcquisitionValue,
} from '@ayman/contracts/acquisition-touch';

/**
 * `POST /api/me/acquisition` — a new account handing over the first touch its
 * browser was holding. The constants and the cleaning live in
 * `./acquisition-touch`, which the capture can import without Zod; the report
 * the admin reads is `./admin/acquisition`.
 */

/**
 * A raw value up to `max`, cleaned on the way in. The cap is checked on the
 * RAW string so an oversized body is refused rather than quietly trimmed — the
 * capture already trims, so anything longer was not written by it.
 */
const value = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .transform((raw) => cleanAcquisitionValue(raw, max));

const token = z
  .string()
  .max(ACQUISITION_VALUE_MAX)
  .nullable()
  .transform((raw) => cleanAcquisitionToken(raw));

export const AcquisitionClaimSchema = z
  .object({
    source: token,
    medium: token,
    campaign: value(ACQUISITION_VALUE_MAX),
    content: value(ACQUISITION_VALUE_MAX),
    term: value(ACQUISITION_VALUE_MAX),
    fbclid: value(ACQUISITION_FBCLID_MAX),
    /** The pathname the visitor landed on — never the query, which is what the other fields are. */
    landingPath: value(ACQUISITION_PATH_MAX),
    /**
     * How long ago the touch happened, by the browser's own clock — NOT when.
     *
     * A phone's clock is wrong often enough that a timestamp from it cannot be
     * compared with `users.created_at`. An age is two readings of the same
     * clock, so the error cancels and the API places the touch on ITS clock.
     * Ten years is only «not absurd»; the real limit is the service's.
     */
    ageSeconds: z.number().int().min(0).max(10 * 365 * 24 * 60 * 60),
  })
  .strict()
  .refine(
    (touch) =>
      [touch.source, touch.medium, touch.campaign, touch.content, touch.term, touch.fbclid].some(
        (field) => field !== null,
      ),
    { message: 'a first touch names at least one source' },
  );
/** What the browser sends. */
export type AcquisitionClaimInput = z.input<typeof AcquisitionClaimSchema>;
/** What the service receives, cleaned. */
export type AcquisitionClaim = z.output<typeof AcquisitionClaimSchema>;

/**
 * Always a 200. Every outcome but `recorded` is «nothing was written, and
 * asking again will not change that», which is exactly what the browser needs
 * to know to stop asking — so they are answers, not errors.
 *
 *   · `exists`            the account already has its first touch
 *   · `account_too_old`   past `ACQUISITION_CLAIM_WINDOW_SECONDS`
 *   · `touch_expired`     older than the browser was allowed to keep it
 *   · `touch_after_signup` the click came after the account, so it brought nobody
 */
export const AcquisitionClaimOutcomeSchema = z.enum([
  'recorded',
  'exists',
  'account_too_old',
  'touch_expired',
  'touch_after_signup',
]);
export type AcquisitionClaimOutcome = z.infer<typeof AcquisitionClaimOutcomeSchema>;

export const AcquisitionClaimResultSchema = z.object({ outcome: AcquisitionClaimOutcomeSchema });
export type AcquisitionClaimResult = z.infer<typeof AcquisitionClaimResultSchema>;
