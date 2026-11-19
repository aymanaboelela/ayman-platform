/**
 * «الحساب ده جه منين» — the first touch: which ad link, if any, a browser
 * arrived through before it made an account.
 *
 * ## Why this half has no Zod in it
 *
 * The capture runs from the ROOT layout, on every page of the product, and a
 * layout-mounted client module may not reach Zod (`client-barrel.test.ts`).
 * So the numbers both sides must agree on live here, schema-free, and the
 * claim's schema (`./acquisition`) reads them from this file.
 *
 * No relative imports — same rule as every other leaf module in this package.
 */

/**
 * The query parameters an ad link carries. The five `utm_*` ones are typed by
 * whoever builds the link; `fbclid` is appended by Facebook itself, so a click
 * from an ad whose link was pasted bare still says where it came from.
 */
export const ACQUISITION_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'fbclid',
] as const;
export type AcquisitionParam = (typeof ACQUISITION_PARAMS)[number];

/**
 * Ceilings on what is kept. Every one of these strings is typed by a stranger
 * into a URL, so the cap is the control: a campaign name is a few words, and
 * `fbclid` is the long one (Facebook's own ids run past 200 characters).
 */
export const ACQUISITION_VALUE_MAX = 120;
export const ACQUISITION_FBCLID_MAX = 512;
export const ACQUISITION_PATH_MAX = 300;

/** How long a first touch waits in the browser for a sign-up. */
export const ACQUISITION_TOUCH_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * How long after an account is created the API still accepts its first touch.
 *
 * The claim is sent on the first signed-in page, seconds after the sign-up, so
 * an hour would cover the ordinary case. A day covers the one that is not
 * ordinary: the request lost to a dead connection and retried on the next
 * visit. Past that the answer is no, for good — which is what stops the
 * students who were here before this table existed, and everything they ever
 * paid, from being handed to a campaign by a replayed or hand-written request.
 */
export const ACQUISITION_CLAIM_WINDOW_SECONDS = 24 * 60 * 60;

/**
 * The slack on «the touch came BEFORE the account». The API works the touch's
 * moment out from an age the browser reports, so the request's own travel time
 * lands on the wrong side of the comparison; a minute absorbs a slow phone
 * line without letting a click made after signing up count.
 */
export const ACQUISITION_AFTER_SIGNUP_GRACE_SECONDS = 60;

/**
 * One value off a URL, made safe to keep — or `null` when nothing is left.
 *
 * Control characters go (a newline in a campaign name is how one row becomes
 * two in any export), whitespace runs collapse, and the cap is applied last so
 * it is a cap on what is stored. Not an allow-list of characters on purpose:
 * campaign names here are written in Arabic as often as in Latin, and every
 * reader of the value escapes it (React on the screen, a bound parameter in
 * SQL).
 */
export function cleanAcquisitionValue(raw: string | null | undefined, max: number): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/\p{Cc}+/gu, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned === '') return null;
  return cleaned.slice(0, max);
}

/**
 * `utm_source` and `utm_medium` are folded to lower case: they are a small
 * closed vocabulary in practice, and «Facebook» and «facebook» typed on two
 * days must not become two rows of the same report. The campaign, content and
 * term keep their case — they are names somebody chose.
 */
export function cleanAcquisitionToken(raw: string | null | undefined): string | null {
  return cleanAcquisitionValue(raw, ACQUISITION_VALUE_MAX)?.toLowerCase() ?? null;
}
