/**
 * The four calls «نشر دلوقتي» needs from Meta's Graph API, and nothing else.
 *
 * ## Facebook
 *
 *   · feed:  `POST /{page}/photos {url, caption}` → `{id, post_id}`, then the
 *            post's `permalink_url`.
 *   · story: `POST /{page}/photos {url, published:false}` → a photo id, then
 *            `POST /{page}/photo_stories {photo_id}` → `{post_id}`.
 *
 * ## Instagram (a Business/Creator account linked to the Page)
 *
 *   `POST /{ig}/media {image_url, caption | media_type:STORIES}` → a
 *   container id; wait for it to be `FINISHED`; `POST /{ig}/media_publish
 *   {creation_id}` → the media id; then its `permalink`.
 *
 * Both platforms DOWNLOAD the picture from `url` / `image_url` themselves —
 * which is why the studio's pictures live under a public media key — and
 * Instagram accepts JPEG only.
 *
 * ## The token
 *
 * Sent as the `access_token` form field (or query parameter on a GET), the
 * documented form. Nothing in this file logs a URL or a body, and a Graph
 * error is reduced to Meta's own `message`, which never echoes the token.
 *
 * `fetch` and `sleep` are injected so the spec runs every path against a
 * scripted fake, with no network and no real waiting.
 */

export const GRAPH_BASE = 'https://graph.facebook.com/v23.0';

const TIMEOUT_MS = 30_000;

/** Instagram processes a still image in seconds; ten polls is generous. */
const CONTAINER_POLLS = 10;
const CONTAINER_POLL_MS = 2_000;

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export class GraphApiError extends Error {
  constructor(
    message: string,
    readonly code: number | null = null,
  ) {
    super(message);
    this.name = 'GraphApiError';
  }
}

export interface PublishedRef {
  id: string;
  permalink: string | null;
}

type Json = Record<string, unknown>;

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : typeof value === 'number' ? String(value) : null;
}

export class MetaGraphClient {
  constructor(
    private readonly fetchImpl: FetchLike,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    private readonly base: string = GRAPH_BASE,
  ) {}

  private async call(method: 'GET' | 'POST', path: string, token: string, params: Record<string, string>): Promise<Json> {
    const form = new URLSearchParams({ ...params, access_token: token });
    const url = method === 'GET' ? `${this.base}/${path}?${form.toString()}` : `${this.base}/${path}`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
        body: method === 'POST' ? form.toString() : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      // The cause may carry the URL (and so the token on a GET); never pass it on.
      throw new GraphApiError('could not reach Meta');
    }

    let json: Json = {};
    try {
      json = (await response.json()) as Json;
    } catch {
      // A non-JSON body is an outage page; the status below says enough.
    }
    const error = json.error as { message?: unknown; code?: unknown } | undefined;
    if (!response.ok || error) {
      const message = typeof error?.message === 'string' ? error.message : `Meta answered ${response.status}`;
      throw new GraphApiError(message.slice(0, 300), typeof error?.code === 'number' ? error.code : null);
    }
    return json;
  }

  /** «تجربة الربط» — the Page's name, and the Instagram account linked to it. */
  async pageInfo(pageId: string, token: string): Promise<{ name: string | null; instagramUserId: string | null }> {
    const json = await this.call('GET', pageId, token, { fields: 'name,instagram_business_account' });
    const ig = json.instagram_business_account as { id?: unknown } | undefined;
    return { name: str(json.name), instagramUserId: str(ig?.id) };
  }

  async facebookPhoto(input: { pageId: string; token: string; imageUrl: string; caption: string }): Promise<PublishedRef> {
    const json = await this.call('POST', `${input.pageId}/photos`, input.token, {
      url: input.imageUrl,
      caption: input.caption,
    });
    const id = str(json.post_id) ?? str(json.id);
    if (!id) throw new GraphApiError('Meta returned no post id');
    return { id, permalink: await this.permalink(id, input.token, 'permalink_url') };
  }

  async facebookStory(input: { pageId: string; token: string; imageUrl: string }): Promise<PublishedRef> {
    const photo = await this.call('POST', `${input.pageId}/photos`, input.token, {
      url: input.imageUrl,
      published: 'false',
    });
    const photoId = str(photo.id);
    if (!photoId) throw new GraphApiError('Meta returned no photo id');
    const story = await this.call('POST', `${input.pageId}/photo_stories`, input.token, { photo_id: photoId });
    const id = str(story.post_id) ?? str(story.id) ?? photoId;
    // A story expires in a day; there is no lasting permalink to keep.
    return { id, permalink: null };
  }

  async instagramMedia(input: {
    igUserId: string;
    token: string;
    imageUrl: string;
    caption: string;
    story: boolean;
  }): Promise<PublishedRef> {
    const container = await this.call(
      'POST',
      `${input.igUserId}/media`,
      input.token,
      input.story ? { image_url: input.imageUrl, media_type: 'STORIES' } : { image_url: input.imageUrl, caption: input.caption },
    );
    const creationId = str(container.id);
    if (!creationId) throw new GraphApiError('Instagram returned no container id');

    await this.waitForContainer(creationId, input.token);

    const published = await this.call('POST', `${input.igUserId}/media_publish`, input.token, { creation_id: creationId });
    const id = str(published.id);
    if (!id) throw new GraphApiError('Instagram returned no media id');
    return { id, permalink: input.story ? null : await this.permalink(id, input.token, 'permalink') };
  }

  /**
   * Publishing a container before Instagram has fetched and processed the
   * picture fails with «media not ready». `ERROR`/`EXPIRED` are final.
   */
  private async waitForContainer(creationId: string, token: string): Promise<void> {
    for (let poll = 0; poll < CONTAINER_POLLS; poll += 1) {
      const json = await this.call('GET', creationId, token, { fields: 'status_code' });
      const status = str(json.status_code);
      if (status === 'FINISHED' || status === 'PUBLISHED') return;
      if (status === 'ERROR' || status === 'EXPIRED') {
        throw new GraphApiError(`Instagram could not process the image (${status})`);
      }
      await this.sleep(CONTAINER_POLL_MS);
    }
    throw new GraphApiError('Instagram is still processing the image');
  }

  /** Best effort: a post that went out without a readable link is still out. */
  private async permalink(id: string, token: string, field: 'permalink_url' | 'permalink'): Promise<string | null> {
    try {
      const json = await this.call('GET', id, token, { fields: field });
      return str(json[field]);
    } catch {
      return null;
    }
  }
}
