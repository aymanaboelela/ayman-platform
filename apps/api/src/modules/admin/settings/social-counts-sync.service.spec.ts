import { SettingsService } from './settings.service';
import { syncMetaFollowers, syncYoutubeSubscribers } from './social-counts-sync.service';

interface StoredCounts {
  [key: string]: unknown;
  sources?: Record<string, string>;
  syncedAt?: Record<string, string>;
  updatedAt?: string | null;
}

/**
 * The sync against the REAL `SettingsService` over an in-memory singleton row
 * (same stand-in as `settings.service.spec.ts`), so "keeps the old value" is
 * asserted on what is stored, not on which mock was called.
 */
function harness(socialCounts: Record<string, unknown> = {}) {
  const stored: { data: unknown; updatedBy: string | null } = {
    data: { contact: { youtube: 'https://www.youtube.com/@example' }, socialCounts },
    updatedBy: null,
  };
  const prisma = {
    siteSetting: {
      findUniqueOrThrow: jest.fn(async () => stored),
      update: jest.fn(async ({ data }: { data: { data: unknown; updatedBy: string | null } }) => {
        stored.data = data.data;
        stored.updatedBy = data.updatedBy;
        return stored;
      }),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  const audit = { record: jest.fn(async () => ({ id: 1n, prevHash: null, hash: 'x' })) };
  const settings = new SettingsService(prisma as never, audit as never);
  const logger = { log: jest.fn(), warn: jest.fn() };
  const counts = () => (stored.data as { socialCounts: StoredCounts }).socialCounts;
  return { settings, prisma, audit, logger, counts };
}

function answers(statistics: Record<string, unknown>) {
  return jest.fn(async () =>
    new Response(JSON.stringify({ items: [{ id: 'UCabcdefghijklmnopqrstuv', statistics }] }), { status: 200 }),
  );
}

describe('syncYoutubeSubscribers', () => {
  it('writes the figure as automatic, with «آخر مزامنة», and audits the change', async () => {
    const { settings, audit, logger, counts } = harness({ facebook: 28_000 });
    const fetchImpl = answers({ subscriberCount: '123000', hiddenSubscriberCount: false });

    const outcome = await syncYoutubeSubscribers({
      apiKey: 'k',
      featureEnabled: () => true,
      settings,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger,
    });

    expect(outcome).toBe('synced');
    expect(counts()).toMatchObject({ youtube: 123_000, facebook: 28_000, sources: { youtube: 'auto' } });
    expect(counts().syncedAt).toEqual({ youtube: expect.any(String) });
    expect(counts().updatedAt).toEqual(expect.any(String));
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ by: 'youtube-sync' }) }),
    );
  });

  it('refreshes «آخر مزامنة» but writes no audit row when the figure did not move', async () => {
    const { settings, audit, logger, counts } = harness({
      youtube: 123_000,
      sources: { youtube: 'auto' },
      syncedAt: { youtube: '2026-10-01T00:00:00.000Z' },
    });
    const outcome = await syncYoutubeSubscribers({
      apiKey: 'k',
      featureEnabled: () => true,
      settings,
      fetchImpl: answers({ subscriberCount: '123000' }) as unknown as typeof fetch,
      logger,
    });
    expect(outcome).toBe('unchanged');
    expect(counts().syncedAt?.youtube).not.toBe('2026-10-01T00:00:00.000Z');
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('respects a hidden count: clears a figure the sync wrote and hands the field back', async () => {
    const { settings, logger, counts } = harness({
      youtube: 123_000,
      sources: { youtube: 'auto' },
      syncedAt: { youtube: '2026-10-28T00:00:00.000Z' },
    });
    const outcome = await syncYoutubeSubscribers({
      apiKey: 'k',
      featureEnabled: () => true,
      settings,
      fetchImpl: answers({ hiddenSubscriberCount: true }) as unknown as typeof fetch,
      logger,
    });
    expect(outcome).toBe('hidden');
    expect(counts()).toMatchObject({ youtube: null, sources: { youtube: 'manual' } });
  });

  it('respects a hidden count without touching a figure the admin typed', async () => {
    const { settings, logger, counts, audit } = harness({ youtube: 90_000 });
    await syncYoutubeSubscribers({
      apiKey: 'k',
      featureEnabled: () => true,
      settings,
      fetchImpl: answers({ hiddenSubscriberCount: true }) as unknown as typeof fetch,
      logger,
    });
    expect(counts()).toMatchObject({ youtube: 90_000 });
    expect(counts().sources?.youtube).not.toBe('auto');
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('keeps the last saved figure and warns when YouTube errors — and never throws', async () => {
    const before = { youtube: 120_000, sources: { youtube: 'auto' }, syncedAt: { youtube: '2026-10-28T00:00:00.000Z' } };
    const { settings, prisma, logger, counts } = harness(before);
    const fetchImpl = jest.fn(async () => new Response('{"error":{"code":403}}', { status: 403 }));

    await expect(
      syncYoutubeSubscribers({
        apiKey: 'k',
        featureEnabled: () => true,
        settings,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        logger,
      }),
    ).resolves.toBe('failed');
    expect(counts()).toEqual(before);
    expect(prisma.siteSetting.update).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('keeping the last saved figure'));
  });

  it('is a no-op without a key', async () => {
    const { settings, prisma, logger } = harness();
    const fetchImpl = jest.fn();
    await expect(
      syncYoutubeSubscribers({
        apiKey: undefined,
        featureEnabled: () => true,
        settings,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        logger,
      }),
    ).resolves.toBe('no-key');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(prisma.siteSetting.update).not.toHaveBeenCalled();
  });

  it('is a no-op with the feature closed, key or not', async () => {
    const { settings, prisma, logger } = harness();
    const fetchImpl = jest.fn();
    await expect(
      syncYoutubeSubscribers({
        apiKey: 'k',
        featureEnabled: () => false,
        settings,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        logger,
      }),
    ).resolves.toBe('disabled');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(prisma.siteSetting.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});

/** A Page token's `me`, in the shape Graph answers (ids and username made up). */
function graph(body: Record<string, unknown>, status = 200) {
  return jest.fn(async () => new Response(JSON.stringify(body), { status }));
}

const PAGE = { id: '1000000000000001', followers_count: 28_772 };
const IG = { id: '17840000000000001', followers_count: 108_345, username: 'example_page' };

describe('syncMetaFollowers', () => {
  it('writes both figures as automatic, each with its own «آخر مزامنة», and audits the change', async () => {
    const { settings, audit, logger, counts } = harness({ youtube: 120_000, tiktok: 40_000 });
    const fetchImpl = graph({ ...PAGE, instagram_business_account: IG });

    const outcome = await syncMetaFollowers({
      token: 't',
      featureEnabled: () => true,
      settings,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger,
    });

    expect(outcome).toBe('synced');
    expect(counts()).toMatchObject({
      youtube: 120_000,
      tiktok: 40_000,
      facebook: 28_772,
      instagram: 108_345,
      sources: { facebook: 'auto', instagram: 'auto' },
      syncedAt: { facebook: expect.any(String), instagram: expect.any(String) },
    });
    expect(counts().sources?.youtube).toBeUndefined();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ by: 'meta-sync' }) }),
    );
  });

  it('writes Facebook only when the Page has no Instagram account linked, leaving Instagram as typed', async () => {
    const { settings, logger, counts } = harness({ instagram: 90_000 });
    const outcome = await syncMetaFollowers({
      token: 't',
      featureEnabled: () => true,
      settings,
      fetchImpl: graph(PAGE) as unknown as typeof fetch,
      logger,
    });
    expect(outcome).toBe('synced');
    expect(counts()).toMatchObject({ facebook: 28_772, instagram: 90_000, sources: { facebook: 'auto' } });
    expect(counts().sources?.instagram).toBeUndefined();
    expect(counts().syncedAt?.instagram).toBeUndefined();
  });

  it('says the token needs re-authorizing on Graph error 190, and keeps the old figures', async () => {
    const before = {
      facebook: 28_000,
      instagram: 100_000,
      sources: { facebook: 'auto', instagram: 'auto' },
      syncedAt: { facebook: '2026-10-28T00:00:00.000Z', instagram: '2026-10-28T00:00:00.000Z' },
    };
    const { settings, prisma, logger, counts } = harness(before);
    const fetchImpl = graph(
      { error: { message: 'Error validating access token: Session has expired', type: 'OAuthException', code: 190, error_subcode: 463 } },
      400,
    );

    await expect(
      syncMetaFollowers({ token: 't', featureEnabled: () => true, settings, fetchImpl: fetchImpl as unknown as typeof fetch, logger }),
    ).resolves.toBe('reauthorize');
    expect(counts()).toEqual(before);
    expect(prisma.siteSetting.update).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/the Meta page token needs re-authorizing/i));
  });

  it('keeps the last saved figures and warns on a network failure — and never throws', async () => {
    const before = { facebook: 28_000, sources: { facebook: 'auto' }, syncedAt: { facebook: '2026-10-28T00:00:00.000Z' } };
    const { settings, prisma, logger, counts } = harness(before);
    const fetchImpl = jest.fn(async () => {
      throw new TypeError('fetch failed');
    });

    await expect(
      syncMetaFollowers({ token: 't', featureEnabled: () => true, settings, fetchImpl: fetchImpl as unknown as typeof fetch, logger }),
    ).resolves.toBe('failed');
    expect(counts()).toEqual(before);
    expect(prisma.siteSetting.update).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('keeping the last saved figures'));
  });

  it('is a no-op without a token', async () => {
    const { settings, prisma, logger } = harness();
    const fetchImpl = jest.fn();
    await expect(
      syncMetaFollowers({
        token: undefined,
        featureEnabled: () => true,
        settings,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        logger,
      }),
    ).resolves.toBe('no-token');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(prisma.siteSetting.update).not.toHaveBeenCalled();
  });

  it('is a no-op with the feature closed, token or not', async () => {
    const { settings, prisma, logger } = harness();
    const fetchImpl = jest.fn();
    await expect(
      syncMetaFollowers({
        token: 't',
        featureEnabled: () => false,
        settings,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        logger,
      }),
    ).resolves.toBe('disabled');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(prisma.siteSetting.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  // One shared stamp would let YouTube's daily success keep a Facebook figure
  // read-only for ever behind a dead Meta token.
  it('does not refresh the Meta stamps when only YouTube synced', async () => {
    const metaStamp = '2026-10-20T00:00:00.000Z';
    const { settings, logger, counts } = harness({
      facebook: 28_000,
      sources: { facebook: 'auto' },
      syncedAt: { facebook: metaStamp },
    });
    await syncYoutubeSubscribers({
      apiKey: 'k',
      featureEnabled: () => true,
      settings,
      fetchImpl: answers({ subscriberCount: '123000' }) as unknown as typeof fetch,
      logger,
    });
    expect(counts().syncedAt).toEqual({ facebook: metaStamp, youtube: expect.any(String) });
  });
});

describe('the manual save while YouTube is automatic', () => {
  it('keeps the synced YouTube figure and saves the other networks', async () => {
    const syncedAt = { youtube: new Date().toISOString() };
    const { settings, counts } = harness({ youtube: 123_000, sources: { youtube: 'auto' }, syncedAt });

    await settings.updateSocialCounts({ youtube: 1, facebook: 28_000 });

    expect(counts()).toMatchObject({ youtube: 123_000, facebook: 28_000, sources: { youtube: 'auto' }, syncedAt });
  });

  it('hands YouTube back to the admin once the sync has gone quiet', async () => {
    const { settings, counts } = harness({
      youtube: 123_000,
      sources: { youtube: 'auto' },
      syncedAt: { youtube: '2020-01-01T00:00:00.000Z' },
    });

    await settings.updateSocialCounts({ youtube: 130_000 });

    expect(counts()).toMatchObject({ youtube: 130_000 });
    expect(counts().sources).toBeUndefined();
  });

  it('keeps every network the sync still holds, and only those', async () => {
    const fresh = new Date().toISOString();
    const { settings, counts } = harness({
      youtube: 123_000,
      facebook: 28_772,
      instagram: 108_345,
      sources: { youtube: 'auto', facebook: 'auto', instagram: 'auto' },
      syncedAt: { youtube: fresh, facebook: fresh, instagram: '2020-01-01T00:00:00.000Z' },
    });

    await settings.updateSocialCounts({ youtube: 1, facebook: 2, instagram: 99_000, tiktok: 40_000 });

    expect(counts()).toMatchObject({
      youtube: 123_000,
      facebook: 28_772,
      instagram: 99_000,
      tiktok: 40_000,
      sources: { youtube: 'auto', facebook: 'auto' },
    });
    expect(counts().sources?.instagram).toBeUndefined();
  });
});
