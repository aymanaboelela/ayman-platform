import { fetchMetaFollowers, META_GRAPH_VERSION, MetaSyncError } from './meta-followers';

// Ids and username made up; the shape is what Graph answers a Page token's `me`.
const PAGE = { id: '1000000000000001', followers_count: 28_772 };
const IG = { id: '17840000000000001', followers_count: 108_345, username: 'example_page' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function call(fetchImpl: jest.Mock): [URL, RequestInit] {
  return fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
}

describe('fetchMetaFollowers', () => {
  it('reads the Page and its linked Instagram account in one call', async () => {
    const fetchImpl = jest.fn(async () => json({ ...PAGE, instagram_business_account: IG }));
    await expect(fetchMetaFollowers('t', fetchImpl as unknown as typeof fetch)).resolves.toEqual({
      pageId: PAGE.id,
      facebook: 28_772,
      instagram: 108_345,
      instagramUsername: 'example_page',
    });

    const [url] = call(fetchImpl);
    expect(url.origin + url.pathname).toBe(`https://graph.facebook.com/${META_GRAPH_VERSION}/me`);
    expect(META_GRAPH_VERSION).toBe('v26.0');
    expect(url.searchParams.get('fields')).toBe(
      'id,followers_count,instagram_business_account{followers_count,username}',
    );
  });

  it('sends the token as a Bearer header, never in the URL', async () => {
    const fetchImpl = jest.fn(async () => json(PAGE));
    await fetchMetaFollowers('secret-page-token', fetchImpl as unknown as typeof fetch);
    const [url, init] = call(fetchImpl);
    expect(url.toString()).not.toContain('secret-page-token');
    expect(url.searchParams.has('access_token')).toBe(false);
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer secret-page-token');
  });

  it('passes an abort signal so a hung request cannot hold the job', async () => {
    const fetchImpl = jest.fn(async () => json(PAGE));
    await fetchMetaFollowers('t', fetchImpl as unknown as typeof fetch);
    expect(call(fetchImpl)[1].signal).toBeInstanceOf(AbortSignal);
  });

  it('answers Facebook alone for a Page with no Instagram account linked', async () => {
    const fetchImpl = async () => json(PAGE);
    await expect(fetchMetaFollowers('t', fetchImpl as unknown as typeof fetch)).resolves.toEqual({
      pageId: PAGE.id,
      facebook: 28_772,
      instagram: null,
      instagramUsername: null,
    });
  });

  it('answers Facebook alone when the linked account shows no count', async () => {
    const fetchImpl = async () => json({ ...PAGE, instagram_business_account: { id: IG.id } });
    await expect(fetchMetaFollowers('t', fetchImpl as unknown as typeof fetch)).resolves.toMatchObject({
      facebook: 28_772,
      instagram: null,
    });
  });

  it.each([
    ['code 190 (expired token)', { message: 'Session has expired', type: 'OAuthException', code: 190, error_subcode: 463 }],
    ['code 190 (password changed)', { message: 'The session has been invalidated', type: 'OAuthException', code: 190, error_subcode: 460 }],
    ['code 102 (session)', { message: 'Session key invalid', type: 'OAuthException', code: 102 }],
    ['a data-access expiry', { message: 'Data access has expired for this user', type: 'OAuthException', code: 200 }],
  ])('flags %s as needing re-authorization', async (_label, error) => {
    const fetchImpl = async () => json({ error }, 400);
    const thrown = await fetchMetaFollowers('t', fetchImpl as unknown as typeof fetch).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(MetaSyncError);
    expect((thrown as MetaSyncError).reauthorize).toBe(true);
  });

  it.each([
    ['a permissions error', async () => json({ error: { message: '(#10) Permission denied', code: 10 } }, 403)],
    ['a rate limit', async () => json({ error: { message: 'Application request limit reached', code: 4 } }, 400)],
    ['a 500 that is not JSON', async () => new Response('<html>', { status: 500 })],
    ['a user token (no followers_count)', async () => json({ id: '42' })],
    ['a non-numeric count', async () => json({ id: PAGE.id, followers_count: 'many' })],
    [
      'a network failure',
      async () => {
        throw new TypeError('fetch failed');
      },
    ],
  ])('throws a plain MetaSyncError on %s', async (_label, fetchImpl) => {
    const thrown = await fetchMetaFollowers('t', fetchImpl as unknown as typeof fetch).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(MetaSyncError);
    expect((thrown as MetaSyncError).reauthorize).toBe(false);
  });

  it('never puts the token in an error message, even when Graph echoes it', async () => {
    const fetchImpl = async () =>
      json({ error: { message: 'Malformed access token secret-page-token', type: 'OAuthException', code: 190 } }, 400);
    const thrown = await fetchMetaFollowers('secret-page-token', fetchImpl as unknown as typeof fetch).catch(
      (e: Error) => e,
    );
    expect(thrown).toBeInstanceOf(MetaSyncError);
    expect((thrown as Error).message).not.toContain('secret-page-token');
    expect((thrown as Error).message).toContain('code 190');
  });
});
