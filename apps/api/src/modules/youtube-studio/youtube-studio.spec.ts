const ENV = {
  APP_URL: 'https://teacher.example',
  BETTER_AUTH_SECRET: 's'.repeat(40),
  YOUTUBE_OAUTH_CLIENT_ID: 'client-id.apps.googleusercontent.com',
  YOUTUBE_OAUTH_CLIENT_SECRET: 'client-secret',
} as Record<string, string | undefined>;
jest.mock('../../config/env', () => ({ loadEnv: () => ENV }));

import { tokenKey, openToken } from '../social-posts/token-cipher';
import type { AuditService } from '../../audit/audit.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { FileSignatureService } from '../media/file-signature.service';
import type { AnswerProvider } from '../assistant/ai/providers/answer-provider';
import { issueState } from './oauth-state';
import { YoutubeApiClient } from './youtube-api.client';
import { YoutubeConnectionService, YoutubeNotConnectedException } from './youtube-connection.service';
import { YoutubeStudioService, mergeSnippet } from './youtube-studio.service';
import { YoutubeWatchService } from './youtube-watch.service';
import type { NotificationsService } from '../notifications/notifications.service';

/**
 * «يوتيوب» end to end against a scripted Google: the OAuth round-trip and its
 * state, how the refresh token is kept, and the read-modify-write that keeps
 * `videos.update` from wiping what the form does not show.
 */

interface RecordedCall {
  method: string;
  url: URL;
  body: string | null;
  headers: Record<string, string>;
}

type Handler = (call: RecordedCall) => { status?: number; json?: unknown; text?: string } | undefined;

/** A `fetch` that answers from `routes` (first match wins) and records every call. */
function scriptedFetch(routes: [RegExp, Handler][]) {
  const calls: RecordedCall[] = [];
  const fetchFn = async (input: string, init?: RequestInit): Promise<Response> => {
    const url = new URL(input);
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    const body =
      typeof init?.body === 'string' ? init.body : init?.body instanceof Uint8Array ? `<${init.body.byteLength} bytes>` : null;
    const call: RecordedCall = { method: init?.method ?? 'GET', url, body, headers };
    calls.push(call);
    const target = `${call.method} ${url.origin}${url.pathname}`;
    for (const [pattern, handler] of routes) {
      if (!pattern.test(target)) continue;
      const answer = handler(call);
      if (!answer) continue;
      const status = answer.status ?? 200;
      const text = answer.text ?? JSON.stringify(answer.json ?? {});
      return new Response(text, { status, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: { message: `unscripted ${target}` } }), { status: 599 });
  };
  return { fetchFn, calls };
}

type Row = Record<string, unknown> & { id: number };

/** Just enough Prisma for `youtube_connection` and the course picker. */
function fakePrisma(courses: { id: string; title: string; slug: string; status: string; year: number }[] = []) {
  let row: Row | null = null;
  const videos = new Map<string, Record<string, unknown>>();
  const matches = (where: Record<string, unknown>): boolean => {
    if (!row) return false;
    return Object.entries(where).every(([key, expected]) => {
      const actual = row![key];
      if (expected && typeof expected === 'object' && 'gt' in (expected as object)) {
        return actual instanceof Date && actual > (expected as { gt: Date }).gt;
      }
      return actual === expected;
    });
  };
  const prisma = {
    youtubeConnection: {
      findUnique: jest.fn(async () => (row ? { updatedAt: new Date(), ...row } : null)),
      upsert: jest.fn(async ({ create, update }: { create: Row; update: Record<string, unknown> }) => {
        row = row ? { ...row, ...update } : { ...create };
        return row;
      }),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (!row) throw new Error('no row');
        row = { ...row, ...data };
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (!matches(where)) return { count: 0 };
        row = { ...row!, ...data };
        return { count: 1 };
      }),
      deleteMany: jest.fn(async () => {
        const count = row ? 1 : 0;
        row = null;
        return { count };
      }),
    },
    youtubeVideo: {
      findMany: jest.fn(async ({ where }: { where: { videoId?: { in: string[] }; channelId?: string; isNew?: boolean; handledAt?: null } }) =>
        [...videos.values()].filter((video) =>
          (!where.videoId || where.videoId.in.includes(video.videoId as string)) &&
          (where.channelId === undefined || video.channelId === where.channelId) &&
          (where.isNew === undefined || video.isNew === where.isNew) &&
          (where.handledAt === undefined || video.handledAt === null),
        ),
      ),
      count: jest.fn(async ({ where }: { where: { channelId: string } }) =>
        [...videos.values()].filter((video) => video.channelId === where.channelId).length,
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (videos.has(data.videoId as string)) throw new Error('unique violation');
        const row = { handledAt: null, thumbnailSetAt: null, firstSeenAt: new Date(), ...data };
        videos.set(data.videoId as string, row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: { where: { videoId: string }; data: Record<string, unknown> }) => {
        const row = { ...videos.get(where.videoId)!, ...data };
        videos.set(where.videoId, row);
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }: { where: { videoId: string; handledAt?: null }; data: Record<string, unknown> }) => {
        const row = videos.get(where.videoId);
        if (!row || (where.handledAt === null && row.handledAt !== null)) return { count: 0 };
        videos.set(where.videoId, { ...row, ...data });
        return { count: 1 };
      }),
    },
    $transaction: jest.fn(async (work: (tx: unknown) => Promise<unknown>) => work({})),
    course: {
      findMany: jest.fn(async () => courses.filter((course) => course.status === 'published')),
      findFirst: jest.fn(async ({ where }: { where: { id: string; status: string } }) =>
        courses.find((course) => course.id === where.id && course.status === where.status) ?? null,
      ),
    },
  };
  return { prisma, current: () => row, set: (next: Row | null) => (row = next), videos };
}

function fakeAudit() {
  return { record: jest.fn(async () => ({ id: 1n, prevHash: null, hash: 'h' })) };
}

const REFRESH = '1//refresh-token-SECRET-abcd';
const CHANNEL = 'UCabcdefghijklmnopqrstuv';
const VIDEO = 'dQw4w9WgXcQ';

const channelItem = {
  id: CHANNEL,
  snippet: { title: 'قناة المادة', customUrl: '@teacher', thumbnails: { medium: { url: 'https://yt3.ggpht.com/a.jpg' } } },
  statistics: { subscriberCount: '1200', videoCount: '45', hiddenSubscriberCount: false },
  contentDetails: { relatedPlaylists: { uploads: 'UUabcdefghijklmnopqrstuv' } },
};

const currentSnippet = {
  title: 'العنوان القديم',
  description: 'وصف قديم',
  tags: ['قديم', 'old tag'],
  categoryId: '27',
  defaultLanguage: 'ar',
  defaultAudioLanguage: 'ar-EG',
  channelId: CHANNEL,
  publishedAt: '2026-01-01T00:00:00Z',
  thumbnails: { medium: { url: 'https://i.ytimg.com/vi/x/mqdefault.jpg' } },
  localized: { title: 'العنوان القديم', description: 'وصف قديم' },
};

function google(extra: [RegExp, Handler][] = []) {
  return scriptedFetch([
    ...extra,
    [/^POST https:\/\/oauth2\.googleapis\.com\/token$/, (call) => {
      const form = new URLSearchParams(call.body ?? '');
      if (form.get('grant_type') === 'authorization_code') {
        return { json: { access_token: 'ya29.first', expires_in: 3599, refresh_token: REFRESH, scope: 'x' } };
      }
      return { json: { access_token: 'ya29.refreshed', expires_in: 3599 } };
    }],
    [/^POST https:\/\/oauth2\.googleapis\.com\/revoke$/, () => ({ json: {} })],
    [/^GET https:\/\/www\.googleapis\.com\/youtube\/v3\/channels$/, () => ({ json: { items: [channelItem] } })],
    [/^GET https:\/\/www\.googleapis\.com\/youtube\/v3\/playlistItems$/, () => ({
      json: { items: [{ contentDetails: { videoId: VIDEO } }], nextPageToken: 'NEXT', pageInfo: { totalResults: 45 } },
    })],
    [/^GET https:\/\/www\.googleapis\.com\/youtube\/v3\/videos$/, () => ({
      json: {
        items: [{
          id: VIDEO,
          snippet: currentSnippet,
          status: { privacyStatus: 'public' },
          statistics: { viewCount: '1000', likeCount: '50' },
          contentDetails: { duration: 'PT10M' },
        }],
      },
    })],
    [/^PUT https:\/\/www\.googleapis\.com\/youtube\/v3\/videos$/, (call) => ({ json: JSON.parse(call.body ?? '{}') })],
  ]);
}

function build(fetchFn: (url: string, init?: RequestInit) => Promise<Response>, courses: Parameters<typeof fakePrisma>[0] = []) {
  const db = fakePrisma(courses);
  const audit = fakeAudit();
  const client = new YoutubeApiClient(fetchFn);
  const connection = new YoutubeConnectionService(
    db.prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    client,
  );
  const signature = { detect: jest.fn(async () => ({ mime: 'image/jpeg', ext: 'jpg' })) };
  const notifications = { emit: jest.fn(async () => undefined), announce: jest.fn(async () => undefined) };
  const watcher = new YoutubeWatchService(
    db.prisma as unknown as PrismaService,
    connection,
    client,
    notifications as unknown as NotificationsService,
  );
  const studio = new YoutubeStudioService(
    db.prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    connection,
    client,
    signature as unknown as FileSignatureService,
    watcher,
  );
  return { db, audit, connection, studio, signature, watcher, notifications };
}

/** Start and finish a connection the way the browser would. */
async function connect(kit: ReturnType<typeof build>, userId = 'admin_nanoid_1') {
  const { url } = await kit.connection.start(userId);
  const state = new URL(url).searchParams.get('state')!;
  return kit.connection.complete(userId, { code: 'auth-code', state });
}

describe('YoutubeConnectionService — the OAuth round-trip', () => {
  beforeEach(() => {
    ENV.YOUTUBE_OAUTH_CLIENT_ID = 'client-id.apps.googleusercontent.com';
    ENV.YOUTUBE_OAUTH_CLIENT_SECRET = 'client-secret';
  });

  it('asks Google for an offline, re-consented grant on the exact registered redirect URI', async () => {
    const kit = build(google().fetchFn);
    const { url } = await kit.connection.start('admin_nanoid_1');
    const auth = new URL(url);
    expect(auth.origin + auth.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(auth.searchParams.get('redirect_uri')).toBe('https://teacher.example/api/admin/youtube/oauth/callback');
    expect(auth.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/youtube.force-ssl');
    expect(auth.searchParams.get('access_type')).toBe('offline');
    expect(auth.searchParams.get('prompt')).toBe('consent');
    expect(auth.searchParams.get('response_type')).toBe('code');
    // The row keeps a hash, never the state itself.
    expect(kit.db.current()?.pendingStateHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(kit.db.current())).not.toContain(auth.searchParams.get('state')!.split('.')[0]);
  });

  it('connects, and stores the refresh token sealed — only its last four characters in the clear', async () => {
    const { fetchFn } = google();
    const kit = build(fetchFn);
    expect(await connect(kit)).toBe('connected');

    const row = kit.db.current()!;
    expect(row.channelId).toBe(CHANNEL);
    expect(row.tokenHint).toBe('abcd');
    expect(String(row.tokenCiphertext)).not.toContain('refresh-token');
    expect(openToken(String(row.tokenCiphertext), tokenKey(ENV.BETTER_AUTH_SECRET!, 'youtube-refresh-token:v1'))).toBe(REFRESH);
    // Sealed under its OWN label: the Page-token key does not open it.
    expect(openToken(String(row.tokenCiphertext), tokenKey(ENV.BETTER_AUTH_SECRET!))).toBeNull();
    expect(row.pendingStateHash).toBeNull();

    const state = await kit.connection.state();
    expect(JSON.stringify(state)).not.toContain(REFRESH);
    expect(state.connection?.tokenHint).toBe('abcd');
    expect(state.connection?.channel).toMatchObject({ title: 'قناة المادة', subscriberCount: 1200, videoCount: 45 });

    expect(kit.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'youtube:connect', outcome: 'success' }));
    expect(JSON.stringify(kit.audit.record.mock.calls)).not.toContain(REFRESH);
  });

  it('refuses a state started by ANOTHER admin (login CSRF), and keeps it for its owner', async () => {
    const kit = build(google().fetchFn);
    const { url } = await kit.connection.start('admin_a');
    const state = new URL(url).searchParams.get('state')!;
    expect(await kit.connection.complete('admin_b', { code: 'c', state })).toBe('expired');
    expect(kit.db.current()?.tokenCiphertext).toBeUndefined();
    expect(await kit.connection.complete('admin_a', { code: 'c', state })).toBe('connected');
  });

  it('accepts a state exactly once — a replayed callback URL finds nothing to consume', async () => {
    const kit = build(google().fetchFn);
    const { url } = await kit.connection.start('admin_a');
    const state = new URL(url).searchParams.get('state')!;
    expect(await kit.connection.complete('admin_a', { code: 'c', state })).toBe('connected');
    expect(await kit.connection.complete('admin_a', { code: 'c', state })).toBe('expired');
  });

  it('refuses a forged, an edited and an expired state without calling Google', async () => {
    const { fetchFn, calls } = google();
    const kit = build(fetchFn);
    const { url } = await kit.connection.start('admin_a');
    const state = new URL(url).searchParams.get('state')!;
    const [nonce, expiry, mac] = state.split('.');
    const key = tokenKey(ENV.BETTER_AUTH_SECRET!, 'youtube-oauth-state:v1');
    const stale = issueState('admin_a', key, new Date(Date.now() - 11 * 60 * 1000)).state;

    for (const bad of [undefined, 'x', `${nonce}.${Number(expiry) + 1000}.${mac}`, `${nonce}.${expiry}.${mac}x`, stale]) {
      expect(await kit.connection.complete('admin_a', { code: 'c', state: bad })).toBe('expired');
    }
    expect(calls.filter((call) => call.url.host === 'oauth2.googleapis.com')).toHaveLength(0);
  });

  it('a press of «إلغاء» on Google’s screen is «denied», and the state is spent', async () => {
    const kit = build(google().fetchFn);
    const { url } = await kit.connection.start('admin_a');
    const state = new URL(url).searchParams.get('state')!;
    expect(await kit.connection.complete('admin_a', { error: 'access_denied', state })).toBe('denied');
    expect(kit.db.current()?.pendingStateHash).toBeNull();
  });

  it('a grant with no refresh token is refused and revoked, not stored', async () => {
    const { fetchFn, calls } = google([
      [/^POST https:\/\/oauth2\.googleapis\.com\/token$/, () => ({ json: { access_token: 'ya29.only', expires_in: 3599 } })],
    ]);
    const kit = build(fetchFn);
    expect(await connect(kit)).toBe('noRefresh');
    expect(kit.db.current()?.tokenCiphertext).toBeUndefined();
    expect(calls.some((call) => call.url.pathname === '/revoke')).toBe(true);
  });

  it('says «not available» rather than starting a flow when the OAuth client is not configured', async () => {
    ENV.YOUTUBE_OAUTH_CLIENT_SECRET = undefined;
    const kit = build(google().fetchFn);
    expect((await kit.connection.state()).configured).toBe(false);
    await expect(kit.connection.start('admin_a')).rejects.toThrow(/not configured/);
  });

  it('disconnect revokes at Google with the opened token, deletes the row and audits it', async () => {
    const { fetchFn, calls } = google();
    const kit = build(fetchFn);
    await connect(kit);
    expect(await kit.connection.disconnect()).toEqual({ revoked: true });
    const revoke = calls.find((call) => call.url.pathname === '/revoke');
    expect(new URLSearchParams(revoke?.body ?? '').get('token')).toBe(REFRESH);
    expect(kit.db.current()).toBeNull();
    expect(kit.audit.record).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'youtube:disconnect' }));
    await expect(kit.connection.accessToken()).rejects.toBeInstanceOf(YoutubeNotConnectedException);
  });

  it('a grant revoked from the Google account reads as «not connected»', async () => {
    const kit = build(
      google([
        [/^POST https:\/\/oauth2\.googleapis\.com\/token$/, (call) =>
          new URLSearchParams(call.body ?? '').get('grant_type') === 'refresh_token'
            ? { status: 400, json: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } }
            : undefined],
      ]).fetchFn,
    );
    await connect(kit);
    kit.connection.dropAccessToken();
    await expect(kit.connection.accessToken()).rejects.toBeInstanceOf(YoutubeNotConnectedException);
    expect((await kit.connection.state()).connection).toBeNull();
  });
});

describe('YoutubeStudioService — saving without wiping', () => {
  it('mergeSnippet keeps every writable field the input does not name', () => {
    expect(mergeSnippet(currentSnippet, { title: 'جديد' })).toEqual({
      title: 'جديد',
      description: 'وصف قديم',
      tags: ['قديم', 'old tag'],
      categoryId: '27',
      defaultLanguage: 'ar',
      defaultAudioLanguage: 'ar-EG',
    });
    // Clearing tags on purpose is a real edit, not a wipe.
    expect(mergeSnippet(currentSnippet, { tags: [] }).tags).toEqual([]);
    // Read-only fields never go back.
    expect(Object.keys(mergeSnippet(currentSnippet, {})).sort()).toEqual(
      ['categoryId', 'defaultAudioLanguage', 'defaultLanguage', 'description', 'tags', 'title'],
    );
  });

  it('reads the current snippet, then PUTs it whole with only the edited fields changed', async () => {
    const { fetchFn, calls } = google();
    const kit = build(fetchFn);
    await connect(kit);

    const detail = await kit.studio.update(VIDEO, { description: 'وصف جديد فيه teacher.example' });
    expect(detail.id).toBe(VIDEO);

    const put = calls.filter((call) => call.method === 'PUT');
    expect(put).toHaveLength(1);
    expect(put[0]!.url.searchParams.get('part')).toBe('snippet');
    // A read of the snippet BEFORE the write.
    const putIndex = calls.indexOf(put[0]!);
    expect(calls.slice(0, putIndex).some((call) => call.method === 'GET' && call.url.pathname.endsWith('/videos'))).toBe(true);

    expect(JSON.parse(put[0]!.body!)).toEqual({
      id: VIDEO,
      snippet: {
        title: 'العنوان القديم',
        description: 'وصف جديد فيه teacher.example',
        tags: ['قديم', 'old tag'],
        categoryId: '27',
        defaultLanguage: 'ar',
        defaultAudioLanguage: 'ar-EG',
      },
    });
    expect(kit.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'youtube:update', resourceId: VIDEO, outcome: 'success', metadata: { videoId: VIDEO, fields: ['description'] } }),
    );
  });

  it('shows YouTube’s own refusal, with its status, and audits the failure', async () => {
    const { fetchFn } = google([
      [/^PUT https:\/\/www\.googleapis\.com\/youtube\/v3\/videos$/, () => ({
        status: 400,
        json: { error: { code: 400, message: 'The request metadata specifies an invalid video title.', errors: [{ reason: 'invalidTitle' }] } },
      })],
    ]);
    const kit = build(fetchFn);
    await connect(kit);
    await expect(kit.studio.update(VIDEO, { title: 'x' })).rejects.toMatchObject({
      status: 400,
      response: expect.objectContaining({ message: 'The request metadata specifies an invalid video title.', code: 'youtube' }),
    });
    expect(kit.audit.record).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'youtube:update', outcome: 'failure' }));
  });

  it('refuses a video that is not on the connected channel, before any write', async () => {
    const { fetchFn, calls } = google([
      [/^GET https:\/\/www\.googleapis\.com\/youtube\/v3\/videos$/, () => ({
        json: { items: [{ id: VIDEO, snippet: { ...currentSnippet, channelId: 'UCsomeoneelse000000000000' } }] },
      })],
    ]);
    const kit = build(fetchFn);
    await connect(kit);
    await expect(kit.studio.update(VIDEO, { title: 'x' })).rejects.toMatchObject({ status: 404 });
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
  });

  it('refuses a malformed id without calling Google', async () => {
    const { fetchFn, calls } = google();
    const kit = build(fetchFn);
    await connect(kit);
    const before = calls.length;
    await expect(kit.studio.update('../../channels', { title: 'x' })).rejects.toMatchObject({ status: 404 });
    expect(calls.length).toBe(before);
  });

  it('caches a list page for a minute, and a save empties the cache', async () => {
    const { fetchFn, calls } = google();
    const kit = build(fetchFn);
    await connect(kit);
    const lists = () => calls.filter((call) => call.url.pathname.endsWith('/playlistItems')).length;

    const page = await kit.studio.list(null);
    expect(page.items[0]).toMatchObject({ id: VIDEO, privacy: 'public', views: 1000, likes: 50 });
    expect(page.items[0]!.flags).toEqual(expect.arrayContaining(['noDescription', 'noSiteLink']));
    expect(page.nextPageToken).toBe('NEXT');
    await kit.studio.list(null);
    expect(lists()).toBe(1);

    await kit.studio.update(VIDEO, { title: 'جديد' });
    await kit.studio.list(null);
    expect(lists()).toBe(2);
  });

  it('uploads a thumbnail as the detected type, and refuses anything else', async () => {
    const { fetchFn, calls } = google([
      [/^POST https:\/\/www\.googleapis\.com\/upload\/youtube\/v3\/thumbnails\/set$/, () => ({ json: { items: [] } })],
    ]);
    const kit = build(fetchFn);
    await connect(kit);
    const file = { originalname: 't.jpg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]), size: 4 };
    await kit.studio.thumbnail(VIDEO, file);
    const upload = calls.find((call) => call.url.pathname.endsWith('/thumbnails/set'));
    expect(upload?.headers['content-type']).toBe('image/jpeg');
    expect(upload?.url.searchParams.get('videoId')).toBe(VIDEO);

    kit.signature.detect.mockResolvedValueOnce({ mime: 'image/gif', ext: 'gif' });
    await expect(kit.studio.thumbnail(VIDEO, file)).rejects.toMatchObject({ status: 400 });
    await expect(kit.studio.thumbnail(VIDEO, { ...file, size: 3 * 1024 * 1024 })).rejects.toMatchObject({ status: 413 });
  });
});

describe('YoutubeStudioService — «اقترح لي»', () => {
  const SRT = [
    '1\n00:00:00,000 --> 00:00:05,000\nأهلا بيكم النهارده هنشرح المصفوفات',
    '2\n00:01:30,000 --> 00:01:35,000\nأول حاجة تعريف المصفوفة',
    '3\n00:04:10,000 --> 00:04:15,000\nأمثلة على المصفوفات',
    '4\n00:08:00,000 --> 00:08:05,000\nحل أسئلة',
  ].join('\n\n');

  function withProvider(kit: ReturnType<typeof build>, answer: string) {
    const seen: { context?: string; maxOutputTokens?: number } = {};
    const provider: AnswerProvider = {
      id: 'fake',
      async *answer(request) {
        seen.context = request.context;
        seen.maxOutputTokens = request.maxOutputTokens;
        yield { kind: 'text', text: answer };
      },
    };
    (kit.studio as unknown as { provider: AnswerProvider }).provider = provider;
    return seen;
  }

  it('writes from the Arabic captions, with chapters and the chosen course link tagged for the video', async () => {
    const { fetchFn, calls } = google([
      [/^GET https:\/\/www\.googleapis\.com\/youtube\/v3\/captions$/, () => ({
        json: { items: [
          { id: 'en1', snippet: { language: 'en', trackKind: 'standard' } },
          { id: 'ar-asr', snippet: { language: 'ar', trackKind: 'asr' } },
        ] },
      })],
      [/^GET https:\/\/www\.googleapis\.com\/youtube\/v3\/captions\/ar-asr$/, () => ({ text: SRT })],
    ]);
    const kit = build(fetchFn, [{ id: 'course-1', title: 'برمجة', slug: 'programming-y2', status: 'published', year: 2 }]);
    await connect(kit);
    const seen = withProvider(kit, JSON.stringify({
      title: 'شرح المصفوفات',
      description: 'شرح كامل للمصفوفات https://evil.example',
      tags: ['مصفوفات', 'arrays'],
      chapters: [
        { start: '00:00', title: 'مقدمة' },
        { start: '01:30', title: 'التعريف' },
        { start: '04:10', title: 'أمثلة' },
        { start: '08:00', title: 'حل أسئلة' },
      ],
    }));

    const suggestion = await kit.studio.suggest(VIDEO, { courseId: 'course-1' });
    expect(calls.find((call) => call.url.pathname.includes('/captions/'))?.url.searchParams.get('tfmt')).toBe('srt');
    expect(seen.context).toContain('[01:30] أول حاجة تعريف المصفوفة');
    expect(seen.maxOutputTokens).toBeGreaterThan(1024);
    expect(suggestion.source).toBe('captions');
    expect(suggestion.chapterCount).toBe(4);
    expect(suggestion.description).not.toContain('evil.example');
    expect(suggestion.description).toContain(
      'https://teacher.example/courses/programming-y2?utm_source=youtube&utm_medium=description&utm_campaign=dQw4w9WgXcQ',
    );
    expect(suggestion.description).toContain('01:30 التعريف');
    // A suggestion writes nothing.
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
  });

  it('falls back to the title when the captions cannot be downloaded', async () => {
    const { fetchFn } = google([
      [/^GET https:\/\/www\.googleapis\.com\/youtube\/v3\/captions$/, () => ({ json: { items: [{ id: 'ar', snippet: { language: 'ar' } }] } })],
      [/^GET https:\/\/www\.googleapis\.com\/youtube\/v3\/captions\/ar$/, () => ({ status: 403, json: { error: { message: 'forbidden' } } })],
    ]);
    const kit = build(fetchFn);
    await connect(kit);
    withProvider(kit, '```json\n{"title":"عنوان","description":"وصف","tags":[],"chapters":[{"start":"00:00","title":"x"}]}\n```');
    const suggestion = await kit.studio.suggest(VIDEO, { courseId: null });
    expect(suggestion.source).toBe('title');
    expect(suggestion.chapterCount).toBe(0);
  });

  it('refuses a course that is not published', async () => {
    const kit = build(google().fetchFn, [{ id: 'draft-1', title: 'x', slug: 'x', status: 'draft', year: 1 }]);
    await connect(kit);
    withProvider(kit, '{}');
    await expect(kit.studio.suggest(VIDEO, { courseId: 'draft-1' })).rejects.toMatchObject({ status: 400 });
  });
});

describe('YoutubeWatchService — «نزل فيديو جديد»', () => {
  const upload = (id: string, title = `فيديو ${id}`) => ({
    snippet: { title, thumbnails: { medium: { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` } }, resourceId: { videoId: id } },
    contentDetails: { videoId: id, videoPublishedAt: '2026-10-30T10:00:00Z' },
  });

  it('spends ONE playlistItems call per run, records a baseline first, then notifies only the connecting admin', async () => {
    let items = [upload('aaaaaaaaaaa'), upload('bbbbbbbbbbb')];
    const { fetchFn, calls } = google([
      [/^GET https:\/\/www\.googleapis\.com\/youtube\/v3\/playlistItems$/, () => ({ json: { items } })],
    ]);
    const kit = build(fetchFn);
    await connect(kit, 'connecting_admin');
    const youtubeCalls = () => calls.filter((call) => call.url.host === 'www.googleapis.com').length;

    const before = youtubeCalls();
    expect(await kit.watcher.watch()).toBe(0);
    expect(youtubeCalls() - before).toBe(1);
    expect(kit.notifications.emit).not.toHaveBeenCalled();

    items = [upload('ccccccccccc', 'الدرس الجديد'), ...items];
    expect(await kit.watcher.watch()).toBe(1);
    expect(kit.notifications.emit).toHaveBeenCalledTimes(1);
    expect(kit.notifications.emit).toHaveBeenCalledWith(expect.anything(), {
      userId: 'connecting_admin',
      kind: 'youtube_new_video',
      videoId: 'ccccccccccc',
    });
    expect(kit.notifications.announce).toHaveBeenCalledWith('connecting_admin');
    // Never captions, never a second page.
    expect(calls.some((call) => call.url.pathname.includes('/captions'))).toBe(false);

    // Seen once is seen: a second run notifies nothing.
    expect(await kit.watcher.watch()).toBe(0);

    const state = await kit.connection.state();
    expect(state.newVideos.map((video) => video.id)).toEqual(['ccccccccccc']);
  });

  it('a save from the studio ends the «جديد» badge', async () => {
    let items = [upload('aaaaaaaaaaa')];
    const { fetchFn } = google([
      [/^GET https:\/\/www\.googleapis\.com\/youtube\/v3\/playlistItems$/, (call) =>
        call.url.searchParams.get('part') === 'snippet,contentDetails' ? { json: { items } } : undefined],
    ]);
    const kit = build(fetchFn);
    await connect(kit);
    await kit.watcher.watch();
    items = [upload(VIDEO), ...items];
    await kit.watcher.watch();
    expect((await kit.connection.state()).newVideos).toHaveLength(1);
    await kit.studio.update(VIDEO, { title: 'عنوان أحسن' });
    expect((await kit.connection.state()).newVideos).toHaveLength(0);
  });

  it('says the daily quota is spent, in its own code', async () => {
    const { fetchFn } = google([
      [/^GET https:\/\/www\.googleapis\.com\/youtube\/v3\/playlistItems$/, () => ({
        status: 403,
        json: { error: { code: 403, message: 'The request cannot be completed because you have exceeded your quota.', errors: [{ reason: 'quotaExceeded' }] } },
      })],
    ]);
    const kit = build(fetchFn);
    await connect(kit);
    await expect(kit.studio.list(null)).rejects.toMatchObject({ status: 429, response: expect.objectContaining({ code: 'youtube_quota' }) });
    await expect(kit.watcher.scheduledWatch()).resolves.toBeUndefined();
  });
});
