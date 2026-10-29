import { channelLookups, fetchSubscriberCount, YoutubeSyncError } from './youtube-subscribers';

const CHANNEL_ID = 'UCabcdefghijklmnopqrstuv';

describe('channelLookups', () => {
  it.each([
    ['https://www.youtube.com/@example', [{ by: 'forHandle', value: '@example' }]],
    ['https://youtube.com/@example/videos', [{ by: 'forHandle', value: '@example' }]],
    ['https://m.youtube.com/@example?si=x', [{ by: 'forHandle', value: '@example' }]],
    ['https://www.youtube.com/@%D8%A3%D9%8A', [{ by: 'forHandle', value: '@أي' }]],
    [`https://www.youtube.com/channel/${CHANNEL_ID}`, [{ by: 'id', value: CHANNEL_ID }]],
    ['https://www.youtube.com/user/oldname', [{ by: 'forUsername', value: 'oldname' }]],
    [
      'https://www.youtube.com/c/customname',
      [
        { by: 'forHandle', value: '@customname' },
        { by: 'forUsername', value: 'customname' },
      ],
    ],
    [
      'https://www.youtube.com/legacyname',
      [
        { by: 'forHandle', value: '@legacyname' },
        { by: 'forUsername', value: 'legacyname' },
      ],
    ],
  ])('%s', (link, expected) => {
    expect(channelLookups(link)).toEqual(expected);
  });

  it.each([
    [null],
    [''],
    ['not a url'],
    ['https://youtu.be/dQw4w9WgXcQ'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/abc'],
    ['https://www.youtube.com/'],
    ['https://www.youtube.com/channel/not-an-id'],
    ['https://example.com/@example'],
    ['https://notyoutube.com/@example'],
  ])('names no channel: %s', (link) => {
    expect(channelLookups(link)).toEqual([]);
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('fetchSubscriberCount', () => {
  it('asks channels.list for statistics with the lookup and the key', async () => {
    const fetchImpl = jest.fn(async () =>
      json({ items: [{ id: CHANNEL_ID, statistics: { subscriberCount: '123000', hiddenSubscriberCount: false } }] }),
    );
    await expect(
      fetchSubscriberCount('k', [{ by: 'forHandle', value: '@example' }], fetchImpl as unknown as typeof fetch),
    ).resolves.toEqual({ kind: 'count', count: 123_000, channelId: CHANNEL_ID });

    const url = (fetchImpl.mock.calls[0] as unknown as [URL])[0];
    expect(url.origin + url.pathname).toBe('https://www.googleapis.com/youtube/v3/channels');
    expect(Object.fromEntries(url.searchParams)).toEqual({ part: 'statistics', forHandle: '@example', key: 'k' });
  });

  it('falls through to the next lookup when one finds no channel', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(json({ items: [] }))
      .mockResolvedValueOnce(json({ items: [{ id: CHANNEL_ID, statistics: { subscriberCount: '5000' } }] }));
    await expect(
      fetchSubscriberCount('k', channelLookups('https://www.youtube.com/c/customname'), fetchImpl as unknown as typeof fetch),
    ).resolves.toMatchObject({ kind: 'count', count: 5000 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('reports a hidden count without a figure', async () => {
    const fetchImpl = async () => json({ items: [{ id: CHANNEL_ID, statistics: { hiddenSubscriberCount: true } }] });
    await expect(fetchSubscriberCount('k', [{ by: 'id', value: CHANNEL_ID }], fetchImpl as unknown as typeof fetch)).resolves.toEqual({
      kind: 'hidden',
      channelId: CHANNEL_ID,
    });
  });

  it.each([
    ['a 403 (bad key / quota)', async () => json({ error: { code: 403 } }, 403)],
    ['no channel at all', async () => json({})],
    ['a body that is not JSON', async () => new Response('<html>', { status: 200 })],
    ['a non-numeric count', async () => json({ items: [{ id: CHANNEL_ID, statistics: { subscriberCount: 'many' } }] })],
    [
      'a network failure',
      async () => {
        throw new TypeError('fetch failed');
      },
    ],
  ])('throws YoutubeSyncError on %s', async (_label, fetchImpl) => {
    await expect(
      fetchSubscriberCount('k', [{ by: 'id', value: CHANNEL_ID }], fetchImpl as unknown as typeof fetch),
    ).rejects.toBeInstanceOf(YoutubeSyncError);
  });

  it('never puts the key in an error message', async () => {
    const fetchImpl = async () => json({}, 400);
    const error = await fetchSubscriberCount('secret-key', [{ by: 'id', value: CHANNEL_ID }], fetchImpl as unknown as typeof fetch).catch(
      (thrown: Error) => thrown,
    );
    expect(error).toBeInstanceOf(YoutubeSyncError);
    expect((error as Error).message).not.toContain('secret-key');
  });

  it('passes an abort signal so a hung request cannot hold the job', async () => {
    const fetchImpl = jest.fn(async () => json({ items: [{ id: CHANNEL_ID, statistics: { subscriberCount: '1' } }] }));
    await fetchSubscriberCount('k', [{ by: 'id', value: CHANNEL_ID }], fetchImpl as unknown as typeof fetch);
    const init = (fetchImpl.mock.calls[0] as unknown as [URL, RequestInit])[1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
