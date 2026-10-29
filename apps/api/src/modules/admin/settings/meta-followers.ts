/**
 * The Facebook + Instagram half of «عدد السوشيال ميديا»'s automatic sync:
 * from the stack's Facebook Page access token to the Page's follower count
 * and that of the Instagram business account linked to the Page.
 *
 * Pure functions over an injected `fetch`, like `youtube-subscribers.ts`, so
 * the spec drives every branch without a network.
 *
 * ## Why one token covers both
 *
 * A Page token's `me` IS the Page, and Instagram's professional accounts are
 * reached THROUGH the Page they are linked to
 * (`instagram_business_account`). One request answers both figures; there is
 * no Instagram credential to hold.
 *
 * The count is the PAGE's. If `contact.facebook` points at a personal profile
 * instead, the landing page links a profile whose follower count is not the
 * one it shows — the admin should point that link at the Page.
 */

/** Pinned so a Graph default-version bump cannot silently reshape the answer. */
export const META_GRAPH_VERSION = 'v26.0';

const ENDPOINT = `https://graph.facebook.com/${META_GRAPH_VERSION}/me`;
const FIELDS = 'id,followers_count,instagram_business_account{followers_count,username}';

/** Daily, in the background — nothing waits on it, but nothing should hang on it either. */
export const META_TIMEOUT_MS = 10_000;

export interface MetaFollowers {
  pageId: string;
  facebook: number;
  /** `null` — no Instagram business account linked to the Page (or no count readable on it). */
  instagram: number | null;
  instagramUsername: string | null;
}

export class MetaSyncError extends Error {
  override readonly name = 'MetaSyncError';
  /**
   * The token itself is no longer good (expired, revoked, password changed,
   * data access lapsed) — no retry will fix it; somebody has to issue a new
   * one. The caller says so in words an operator can act on.
   */
  readonly reauthorize: boolean;

  constructor(message: string, reauthorize = false) {
    super(message);
    this.reauthorize = reauthorize;
  }
}

interface GraphError {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
}

interface MeResponse {
  id?: string;
  followers_count?: number;
  instagram_business_account?: { id?: string; followers_count?: number; username?: string };
  error?: GraphError;
}

/**
 * Whether a Graph error means "issue a new token". 190 is Graph's
 * `OAuthException` for an invalid or expired access token (every subcode:
 * expired, password changed, app removed, session invalidated); 102 is the
 * older session-expired code. Data-access expiry — the 90-day lapse of a
 * user's grant — has surfaced under more than one code over the API's
 * versions, so it is also matched by what the message says.
 */
function needsReauthorize(error: GraphError): boolean {
  if (error.code === 190 || error.code === 102) return true;
  return /data[ _-]?access/i.test(`${error.type ?? ''} ${error.message ?? ''}`);
}

/**
 * The Page's and its Instagram account's follower counts.
 *
 * Throws `MetaSyncError` on anything that is not a clean answer — a non-2xx,
 * a timeout, a malformed body, no usable `followers_count`. The caller keeps
 * the last saved figures on every throw.
 *
 * The token travels in the `Authorization` header, which Graph accepts, so it
 * is never part of a URL a proxy or an error might log. Error messages carry
 * Graph's own code and text with the token scrubbed out of them regardless.
 */
export async function fetchMetaFollowers(token: string, fetchImpl: typeof fetch = fetch): Promise<MetaFollowers> {
  const url = new URL(ENDPOINT);
  url.searchParams.set('fields', FIELDS);
  // A real Page token is ~200 characters; the length floor only keeps a
  // stray short value from shredding ordinary words in the message.
  const scrub = (text: string) => (token.length >= 8 ? text.split(token).join('[token]') : text);

  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(META_TIMEOUT_MS),
    });
  } catch (error) {
    throw new MetaSyncError(`request failed: ${(error as Error).name}`);
  }

  let body: MeResponse;
  try {
    body = (await response.json()) as MeResponse;
  } catch {
    throw new MetaSyncError(`Graph answered ${response.status} with a body that is not JSON`);
  }

  if (!response.ok || body.error) {
    const error = body.error ?? {};
    const detail = [
      `Graph answered ${response.status}`,
      error.code !== undefined ? `code ${error.code}${error.error_subcode ? `/${error.error_subcode}` : ''}` : null,
      error.message ? scrub(error.message) : null,
    ]
      .filter(Boolean)
      .join(' — ');
    throw new MetaSyncError(detail, needsReauthorize(error));
  }

  const facebook = body.followers_count;
  if (!body.id || !Number.isSafeInteger(facebook) || (facebook as number) < 0) {
    // A user token's `me` is a person, who has no `followers_count` here.
    throw new MetaSyncError('Graph answered no usable followers_count — is the token a Page token?');
  }

  const ig = body.instagram_business_account;
  const igCount = ig?.followers_count;
  const instagram = Number.isSafeInteger(igCount) && (igCount as number) >= 0 ? (igCount as number) : null;

  return {
    pageId: body.id,
    facebook: facebook as number,
    instagram,
    instagramUsername: instagram !== null ? (ig?.username ?? null) : null,
  };
}
