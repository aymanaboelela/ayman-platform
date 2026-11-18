import type { AcquisitionClaimInput } from '@ayman/contracts/acquisition';
import {
  ACQUISITION_FBCLID_MAX,
  ACQUISITION_PARAMS,
  ACQUISITION_PATH_MAX,
  ACQUISITION_TOUCH_TTL_SECONDS,
  ACQUISITION_VALUE_MAX,
  cleanAcquisitionToken,
  cleanAcquisitionValue,
} from '@ayman/contracts/acquisition-touch';

/**
 * «الحساب ده جه منين» — the browser's half: remember the FIRST ad link this
 * browser arrived through, and hand it to the API once an account exists.
 *
 * ## `localStorage`, and why not a cookie
 *
 * `proxy.ts` cannot set one: a public page is edge-cacheable and its response
 * carries no per-request `Set-Cookie`. A cookie written from script would
 * work, and would then ride every request to this origin for a month — the
 * cached pages and every `/api` call — carrying strings a stranger typed into
 * a URL. Storage sends nothing anywhere until the one request that needs it.
 *
 * ## Nothing here touches navigation
 *
 * The capture reads `location` once, on load. No `history` patch, no listener
 * on route changes: an ad click is a document load, so the landing URL is the
 * one the page was loaded with. (The tag that was removed from the root layout
 * was removed for patching `pushState`; this must never grow one.)
 *
 * ## Every function takes its storage and its clock
 *
 * So the rules — first touch wins, thirty days, cleaned values — are tested
 * as plain functions, and the two components that call them are three lines.
 * Storage that throws (Safari private mode, blocked site data) is the callers'
 * `try`: losing an attribution is fine, an error on the landing page is not.
 *
 * No Zod: `FirstTouchCapture` is mounted by the root layout
 * (`client-barrel.test.ts`). The API validates the claim; this only has to
 * avoid sending rubbish.
 */

/** Versioned, so a change of shape reads the old value as absent instead of misreading it. */
export const FIRST_TOUCH_KEY = 'first-touch:v1';

export interface FirstTouch {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  fbclid: string | null;
  landingPath: string | null;
  /** When the link was opened, by THIS browser's clock — epoch milliseconds. */
  at: number;
}

type TouchStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const TTL_MS = ACQUISITION_TOUCH_TTL_SECONDS * 1000;

function readablePath(pathname: string): string {
  // An Arabic slug is nine characters a letter once percent-encoded, which is
  // how a perfectly ordinary course URL would be cut off mid-escape by the cap.
  try {
    return decodeURI(pathname);
  } catch {
    return pathname;
  }
}

/** The touch a URL carries, or `null` when it carries none of `ACQUISITION_PARAMS`. */
export function touchFromUrl(search: string, pathname: string, now: number): FirstTouch | null {
  const params = new URLSearchParams(search);
  if (!ACQUISITION_PARAMS.some((name) => params.has(name))) return null;

  const touch: FirstTouch = {
    source: cleanAcquisitionToken(params.get('utm_source')),
    medium: cleanAcquisitionToken(params.get('utm_medium')),
    campaign: cleanAcquisitionValue(params.get('utm_campaign'), ACQUISITION_VALUE_MAX),
    content: cleanAcquisitionValue(params.get('utm_content'), ACQUISITION_VALUE_MAX),
    term: cleanAcquisitionValue(params.get('utm_term'), ACQUISITION_VALUE_MAX),
    fbclid: cleanAcquisitionValue(params.get('fbclid'), ACQUISITION_FBCLID_MAX),
    landingPath: cleanAcquisitionValue(readablePath(pathname), ACQUISITION_PATH_MAX),
    at: now,
  };
  // `?utm_source=` with nothing after it names no source — the API would
  // refuse the claim, so there is no point keeping it for thirty days.
  return hasSource(touch) ? touch : null;
}

function hasSource(touch: FirstTouch): boolean {
  return [touch.source, touch.medium, touch.campaign, touch.content, touch.term, touch.fbclid].some(
    (field) => field !== null,
  );
}

/**
 * The stored touch, or `null` when there is none, it is malformed, or it has
 * expired. Values are cleaned again on the way OUT: storage is as writable by
 * the visitor as the URL was, and what was stored may predate a tighter cap.
 */
export function readFirstTouch(storage: TouchStorage, now: number): FirstTouch | null {
  const raw = storage.getItem(FIRST_TOUCH_KEY);
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const stored = parsed as Record<string, unknown>;
  if (typeof stored.at !== 'number' || !Number.isFinite(stored.at)) return null;
  if (now - stored.at > TTL_MS) return null;

  const text = (field: unknown) => (typeof field === 'string' ? field : null);
  const touch: FirstTouch = {
    source: cleanAcquisitionToken(text(stored.source)),
    medium: cleanAcquisitionToken(text(stored.medium)),
    campaign: cleanAcquisitionValue(text(stored.campaign), ACQUISITION_VALUE_MAX),
    content: cleanAcquisitionValue(text(stored.content), ACQUISITION_VALUE_MAX),
    term: cleanAcquisitionValue(text(stored.term), ACQUISITION_VALUE_MAX),
    fbclid: cleanAcquisitionValue(text(stored.fbclid), ACQUISITION_FBCLID_MAX),
    landingPath: cleanAcquisitionValue(text(stored.landingPath), ACQUISITION_PATH_MAX),
    at: stored.at,
  };
  return hasSource(touch) ? touch : null;
}

/**
 * Called once per document load. Stores the URL's touch — unless a live one is
 * already there, in which case this does nothing at all: the FIRST link is the
 * one that found the visitor, and the second ad they see must not take the
 * credit for it.
 */
export function captureFirstTouch(
  storage: TouchStorage,
  location: { search: string; pathname: string },
  now: number,
): void {
  const touch = touchFromUrl(location.search, location.pathname, now);
  if (touch === null) return;
  if (readFirstTouch(storage, now) !== null) return;
  storage.setItem(FIRST_TOUCH_KEY, JSON.stringify(touch));
}

/**
 * The claim's body. The touch travels as an AGE, not a time: a phone's clock
 * is wrong often enough that the API cannot compare a timestamp from it with
 * anything, and an age is two readings of the same clock. A clock that moved
 * backwards since the capture reads as «just now» rather than as negative.
 */
export function claimBody(touch: FirstTouch, now: number): AcquisitionClaimInput {
  const { at, ...fields } = touch;
  return { ...fields, ageSeconds: Math.max(0, Math.round((now - at) / 1000)) };
}

/**
 * A refusal that asking again cannot change. 401 (the session is not there
 * yet), 408 and 429 are «later»; so is any 5xx and a request that never
 * arrived. Everything else in the 4xx range is about the touch itself.
 */
function isFinalRefusal(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status !== 'number') return false;
  return status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429;
}

export type HandOverResult = 'none' | 'sent' | 'dropped' | 'kept';

/**
 * Gives the stored touch to the API and forgets it once the API has ANSWERED —
 * whatever the answer. Every outcome it can give («recorded», «already has
 * one», «account too old») is final, so keeping the touch would only mean
 * asking again on every page for a month. Only a request that never got an
 * answer leaves it in place for the next page to retry.
 */
export async function handOverFirstTouch(
  storage: TouchStorage,
  send: (body: AcquisitionClaimInput) => Promise<void>,
  now: number,
): Promise<HandOverResult> {
  const touch = readFirstTouch(storage, now);
  if (touch === null) return 'none';

  try {
    await send(claimBody(touch, now));
  } catch (error) {
    if (!isFinalRefusal(error)) return 'kept';
    storage.removeItem(FIRST_TOUCH_KEY);
    return 'dropped';
  }
  storage.removeItem(FIRST_TOUCH_KEY);
  return 'sent';
}
