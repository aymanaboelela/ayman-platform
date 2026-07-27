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

  return {
    service: new SettingsService(prisma as never, audit as never),
    prisma,
    audit,
    stored,
  };
}

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
});
