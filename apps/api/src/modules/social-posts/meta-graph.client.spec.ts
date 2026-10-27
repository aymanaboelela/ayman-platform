import { GRAPH_BASE, GraphApiError, MetaGraphClient, type FetchLike } from './meta-graph.client';

interface Call {
  method: string;
  url: string;
  body: URLSearchParams | null;
}

/** A scripted Graph API: each request is answered by the next matching rule. */
function fakeGraph(rules: Array<(call: Call) => { status?: number; json: unknown } | undefined>) {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const call: Call = {
      method: init?.method ?? 'GET',
      url,
      body: typeof init?.body === 'string' ? new URLSearchParams(init.body) : null,
    };
    calls.push(call);
    for (const rule of rules) {
      const answer = rule(call);
      if (answer) {
        return new Response(JSON.stringify(answer.json), { status: answer.status ?? 200 });
      }
    }
    return new Response(JSON.stringify({ error: { message: `unexpected ${call.method} ${call.url}` } }), { status: 500 });
  };
  const sleeps: number[] = [];
  const client = new MetaGraphClient(fetchImpl, async (ms) => {
    sleeps.push(ms);
  });
  return { client, calls, sleeps };
}

const post = (path: string, json: unknown) => (call: Call) =>
  call.method === 'POST' && call.url === `${GRAPH_BASE}/${path}` ? { json } : undefined;
const get = (path: string, json: unknown) => (call: Call) =>
  call.method === 'GET' && call.url.startsWith(`${GRAPH_BASE}/${path}?`) ? { json } : undefined;

describe('MetaGraphClient', () => {
  it('posts a Page photo with its caption and reads the permalink back', async () => {
    const { client, calls } = fakeGraph([
      post('123/photos', { id: 'photo-1', post_id: '123_999' }),
      get('123_999', { permalink_url: 'https://facebook.com/123/posts/999' }),
    ]);

    const result = await client.facebookPhoto({
      pageId: '123',
      token: 'PAGE-TOKEN',
      imageUrl: 'https://media.example.com/media/sp/x.jpg',
      caption: 'مبروك',
    });

    expect(result).toEqual({ id: '123_999', permalink: 'https://facebook.com/123/posts/999' });
    expect(calls[0]!.body?.get('url')).toBe('https://media.example.com/media/sp/x.jpg');
    expect(calls[0]!.body?.get('caption')).toBe('مبروك');
    expect(calls[0]!.body?.get('access_token')).toBe('PAGE-TOKEN');
  });

  it('publishes an Instagram container only once it has FINISHED processing', async () => {
    let polls = 0;
    const { client, calls, sleeps } = fakeGraph([
      post('777/media', { id: 'container-1' }),
      (call) =>
        call.method === 'GET' && call.url.includes('/container-1?')
          ? { json: { status_code: ++polls < 3 ? 'IN_PROGRESS' : 'FINISHED' } }
          : undefined,
      post('777/media_publish', { id: 'media-1' }),
      get('media-1', { permalink: 'https://instagram.com/p/abc' }),
    ]);

    const result = await client.instagramMedia({
      igUserId: '777',
      token: 'T',
      imageUrl: 'https://media.example.com/media/sp/x.jpg',
      caption: 'كلام',
      story: false,
    });

    expect(result).toEqual({ id: 'media-1', permalink: 'https://instagram.com/p/abc' });
    expect(sleeps).toHaveLength(2);
    expect(calls.find((call) => call.url.endsWith('/777/media'))!.body?.get('caption')).toBe('كلام');
    expect(calls.find((call) => call.url.endsWith('/777/media_publish'))!.body?.get('creation_id')).toBe('container-1');
  });

  it('sends a story as STORIES with no caption', async () => {
    const { client, calls } = fakeGraph([
      post('777/media', { id: 'c' }),
      get('c', { status_code: 'FINISHED' }),
      post('777/media_publish', { id: 'm' }),
    ]);

    const result = await client.instagramMedia({ igUserId: '777', token: 'T', imageUrl: 'u', caption: 'x', story: true });

    expect(result).toEqual({ id: 'm', permalink: null });
    const body = calls[0]!.body!;
    expect(body.get('media_type')).toBe('STORIES');
    expect(body.has('caption')).toBe(false);
  });

  it('puts a Facebook story up as an unpublished photo, then a photo story', async () => {
    const { client, calls } = fakeGraph([
      post('123/photos', { id: 'photo-9' }),
      post('123/photo_stories', { post_id: 'story-1', success: true }),
    ]);

    const result = await client.facebookStory({ pageId: '123', token: 'T', imageUrl: 'u' });

    expect(result).toEqual({ id: 'story-1', permalink: null });
    expect(calls[0]!.body?.get('published')).toBe('false');
    expect(calls[1]!.body?.get('photo_id')).toBe('photo-9');
  });

  it('turns a Graph error into its own message, and never the token', async () => {
    const { client } = fakeGraph([
      () => ({ status: 400, json: { error: { message: '(#200) Requires pages_manage_posts permission', code: 200 } } }),
    ]);

    const error = await client.facebookPhoto({ pageId: '1', token: 'SECRET-TOKEN', imageUrl: 'u', caption: 'c' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GraphApiError);
    expect((error as GraphApiError).message).toBe('(#200) Requires pages_manage_posts permission');
    expect((error as GraphApiError).code).toBe(200);
    expect(String((error as Error).message)).not.toContain('SECRET-TOKEN');
  });

  it('reports a network failure without the URL it was calling', async () => {
    const client = new MetaGraphClient(async (url) => {
      throw new Error(`connect failed ${url}`);
    });

    const error = await client.pageInfo('1', 'SECRET-TOKEN').catch((e: unknown) => e);

    expect((error as Error).message).toBe('could not reach Meta');
  });

  it('stops waiting on a container Instagram rejected', async () => {
    const { client } = fakeGraph([post('7/media', { id: 'c' }), get('c', { status_code: 'ERROR' })]);

    await expect(client.instagramMedia({ igUserId: '7', token: 'T', imageUrl: 'u', caption: 'c', story: false })).rejects.toThrow(
      /could not process/,
    );
  });

  it('reads the Page name and its linked Instagram account', async () => {
    const { client, calls } = fakeGraph([get('123', { name: 'صفحة المنصة', instagram_business_account: { id: '1784' } })]);

    expect(await client.pageInfo('123', 'T')).toEqual({ name: 'صفحة المنصة', instagramUserId: '1784' });
    expect(new URL(calls[0]!.url).searchParams.get('fields')).toBe('name,instagram_business_account');
  });
});
