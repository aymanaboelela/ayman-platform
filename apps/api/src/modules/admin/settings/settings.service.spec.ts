import { runWithActor } from '../../../audit/audit-context';
import { SettingsService } from './settings.service';

/**
 * Unit test with an in-memory stand-in for the singleton row. The interesting
 * behaviour here is entirely in the schema merge and the audit call, neither of
 * which Postgres contributes to — the DATABASE-side guarantee (the `id = 1`
 * CHECK) is proved by a rejected INSERT in the migration verification instead.
 */
function makeService() {
  const stored: { data: unknown; updatedBy: string | null } = { data: {}, updatedBy: null };

  /** The library, keyed by id — what `resolveAssetKeys` reads. */
  const assets = new Map<string, string>();

  const prisma = {
    siteSetting: {
      findUniqueOrThrow: jest.fn(async () => stored),
      update: jest.fn(async ({ data }: { data: { data: unknown; updatedBy: string | null } }) => {
        stored.data = data.data;
        stored.updatedBy = data.updatedBy;
        return stored;
      }),
    },
    mediaAsset: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in
          .filter((id) => assets.has(id))
          .map((id) => ({ id, storageKey: assets.get(id) })),
      ),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };

  const audit = { record: jest.fn(async () => ({ id: 1n, prevHash: null, hash: 'x' })) };

  return {
    service: new SettingsService(prisma as never, audit as never),
    prisma,
    audit,
    stored,
    assets,
  };
}

/** A v7-shaped id, so the fixtures read like the real rows. */
const FAVICON_ID = '0191c0de-0000-7000-8000-000000000001';
const OG_ID = '0191c0de-0000-7000-8000-000000000002';

describe('SettingsService', () => {
  it('reads an empty blob as fully defaulted settings', async () => {
    const { service } = makeService();
    await expect(service.read()).resolves.toMatchObject({
      branding: { accent: 'amber', radius: 'default' },
      seo: { titleAr: '', descriptionAr: '' },
      contact: { email: null, whatsapp: null },
    });
  });

  it('merges one section and leaves the others alone', async () => {
    const { service, stored } = makeService();
    await service.updateSection('branding', { accent: 'cyan' });
    await service.updateSection('seo', { titleAr: 'عنوان' });

    expect(stored.data).toMatchObject({
      branding: { accent: 'cyan' },
      seo: { titleAr: 'عنوان' },
    });
  });

  // 400, not 500. A bare `.parse()` throws a ZodError, which is not an
  // HttpException, and `AllExceptionsFilter` fails it closed as a generic 500 —
  // so the admin form could not tell "you typed an unknown key" apart from
  // "the database is down". Asserting the status is what keeps that honest.
  it('rejects an unknown key with a 400 rather than storing it', async () => {
    const { service, stored } = makeService();
    await expect(
      service.updateSection('branding', { accent: 'amber', customCss: 'body{}' }),
    ).rejects.toMatchObject({ status: 400 });
    expect(stored.data).toEqual({});
  });

  it('rejects a raw colour string in the accent slot with a 400', async () => {
    const { service } = makeService();
    await expect(service.updateSection('branding', { accent: '#ff0000' })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('writes exactly one audit entry per successful section update', async () => {
    const { service, audit } = makeService();
    await service.updateSection('branding', { accent: 'violet' });
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record.mock.calls[0]![0]).toMatchObject({
      action: 'branding:update',
      resourceType: 'site_settings',
      outcome: 'success',
    });
  });

  it('distinguishes a branding change from any other settings change in the trail', async () => {
    const { service, audit } = makeService();
    await service.updateSection('contact', { email: 'a@b.com' });
    expect(audit.record.mock.calls[0]![0]).toMatchObject({ action: 'settings:update' });
  });

  it('writes no audit entry when validation fails', async () => {
    const { service, audit } = makeService();
    await expect(service.updateSection('seo', { titleAr: 'x'.repeat(200) })).rejects.toMatchObject({
      status: 400,
    });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('stamps updated_by from the ambient actor', async () => {
    const { service, stored } = makeService();
    await runWithActor(
      { actorUserId: 'admin_9', actorIp: null, actorUserAgent: null, requestId: null },
      () => service.updateSection('seo', { titleAr: 'عنوان' }),
    );
    expect(stored.updatedBy).toBe('admin_9');
  });

  it('readPublic never returns branding', async () => {
    const { service } = makeService();
    const result = await service.readPublic();
    expect(Object.keys(result).sort()).toEqual(['contact', 'seo']);
  });

  /**
   * The regression these four exist for.
   *
   * `app/layout.tsx` built `mediaUrl(`${faviconAssetId}.webp`)` — an asset id
   * where a storage key belongs. Keys are `<2 hex>/<uuid>.webp`, the
   * two-segment shape `GET /media/:prefix/:name` routes on; a one-segment path
   * matched no route, so every favicon an admin ever chose 404'd and left the
   * browser's default globe in the tab, which looks exactly like "not set".
   *
   * Asserting the key CONTAINS a slash is the point. A test that only checked
   * `faviconKey` was non-null would have passed against the broken code.
   */
  it('resolves each branding asset id to the storage key it points at', async () => {
    const { service, assets } = makeService();
    assets.set(FAVICON_ID, `0a/${FAVICON_ID}.webp`);
    await service.updateSection('branding', { faviconAssetId: FAVICON_ID });

    const branding = await service.readBranding();
    expect(branding.faviconKey).toBe(`0a/${FAVICON_ID}.webp`);
    expect(branding.faviconKey).toContain('/');
    // The id is still there — the write shape is unchanged, this is additive.
    expect(branding.faviconAssetId).toBe(FAVICON_ID);
  });

  it('resolves the OG image key the same way', async () => {
    const { service, assets } = makeService();
    assets.set(OG_ID, `f3/${OG_ID}.webp`);
    await service.updateSection('seo', { ogImageAssetId: OG_ID });

    const { seo } = await service.readPublicResolved();
    expect(seo.ogImageKey).toBe(`f3/${OG_ID}.webp`);
  });

  /**
   * An asset that was permanently deleted while still selected. `null` is the
   * right answer — the layout then renders no `<link rel="icon">` at all,
   * rather than one pointing at bytes that are gone.
   */
  it('resolves a dangling asset id to null rather than inventing a key', async () => {
    const { service } = makeService();
    await service.updateSection('branding', { faviconAssetId: FAVICON_ID });

    const branding = await service.readBranding();
    expect(branding.faviconKey).toBeNull();
  });

  it('resolves every branding slot in ONE query, not one per slot', async () => {
    const { service, prisma, assets } = makeService();
    assets.set(FAVICON_ID, `0a/${FAVICON_ID}.webp`);
    await service.updateSection('branding', {
      faviconAssetId: FAVICON_ID,
      logoLightAssetId: FAVICON_ID,
      logoDarkAssetId: FAVICON_ID,
    });
    prisma.mediaAsset.findMany.mockClear();

    await service.readBranding();
    expect(prisma.mediaAsset.findMany).toHaveBeenCalledTimes(1);
    // Deduplicated too: three slots, one id, one value in the `IN` list.
    expect(prisma.mediaAsset.findMany.mock.calls[0]![0].where.id.in).toEqual([FAVICON_ID]);
  });

  it('asks for nothing when no slot holds an asset', async () => {
    const { service, prisma } = makeService();
    const branding = await service.readBranding();
    expect(prisma.mediaAsset.findMany).not.toHaveBeenCalled();
    expect(branding.faviconKey).toBeNull();
  });
});
