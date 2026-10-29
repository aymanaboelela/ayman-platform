import { BadRequestException, ConflictException } from '@nestjs/common';
import { PROMO_BANNER_MAX } from '@ayman/contracts/admin/promo-banners';
import { PromoBannersService } from './promo-banners.service';

const KEY = 'ab/0192f0e4-7b1c-7cc0-9f00-0123456789ab.webp';

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'b1',
    title: 'خصم الأسبوع',
    imageKey: KEY,
    linkUrl: '/library',
    years: [] as number[],
    isActive: true,
    startsOn: null as Date | null,
    endsOn: null as Date | null,
    position: 0,
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    updatedAt: new Date('2026-10-01T10:00:00.000Z'),
    ...overrides,
  };
}

function makeService() {
  const audit = { record: jest.fn(async () => ({ id: 1n, prevHash: null, hash: 'x' })) };
  const prisma = {
    promoBanner: {
      findMany: jest.fn(async () => [] as unknown[]),
      findUnique: jest.fn(async () => null as unknown),
      count: jest.fn(async () => 0),
      create: jest.fn(async () => row()),
      update: jest.fn(async () => row()),
      delete: jest.fn(async () => row()),
      aggregate: jest.fn(async () => ({ _max: { position: null as number | null } })),
    },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return { service: new PromoBannersService(prisma as never, audit as never), prisma, audit };
}

describe('PromoBannersService.listPublic', () => {
  it('asks for active rows that have not ended by the CAIRO day, not the UTC one', async () => {
    const { service, prisma } = makeService();
    // 23:30 UTC on the 4th is already 01:30 (or 02:30) on the 5th in Cairo.
    await service.listPublic(new Date('2026-11-04T23:30:00.000Z'));
    expect(prisma.promoBanner.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          OR: [{ endsOn: null }, { endsOn: { gte: new Date('2026-11-05T00:00:00.000Z') } }],
        },
      }),
    );
  });

  it('sends days as YYYY-MM-DD and no admin-only field', async () => {
    const { service, prisma } = makeService();
    prisma.promoBanner.findMany.mockResolvedValueOnce([
      row({ startsOn: new Date('2026-11-01T00:00:00.000Z'), endsOn: new Date('2026-11-07T00:00:00.000Z') }),
    ]);
    const [banner] = await service.listPublic();
    expect(banner).toEqual({
      id: 'b1',
      title: 'خصم الأسبوع',
      imageKey: KEY,
      linkUrl: '/library',
      years: [],
      startsOn: '2026-11-01',
      endsOn: '2026-11-07',
    });
  });
});

describe('PromoBannersService.create', () => {
  it('appends after the last position and writes one audit entry', async () => {
    const { service, prisma, audit } = makeService();
    prisma.promoBanner.aggregate.mockResolvedValueOnce({ _max: { position: 4 } });
    await service.create({ imageKey: KEY, startsOn: '2026-11-01', endsOn: null });

    expect(prisma.promoBanner.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        imageKey: KEY,
        position: 5,
        isActive: true,
        years: [],
        startsOn: new Date('2026-11-01T00:00:00.000Z'),
        endsOn: null,
      }),
    });
    expect(audit.record.mock.calls[0][0]).toMatchObject({ action: 'promo-banner:create' });
  });

  it('refuses past the cap', async () => {
    const { service, prisma } = makeService();
    prisma.promoBanner.count.mockResolvedValueOnce(PROMO_BANNER_MAX);
    await expect(service.create({ imageKey: KEY })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.promoBanner.create).not.toHaveBeenCalled();
  });
});

describe('PromoBannersService.patch', () => {
  it('writes only the fields that were sent', async () => {
    const { service, prisma } = makeService();
    prisma.promoBanner.findUnique.mockResolvedValueOnce(row());
    await service.patch('b1', { isActive: false });
    expect(prisma.promoBanner.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { isActive: false } });
  });

  it('refuses an end day before the STORED start day', async () => {
    const { service, prisma } = makeService();
    prisma.promoBanner.findUnique.mockResolvedValueOnce(
      row({ startsOn: new Date('2026-11-10T00:00:00.000Z') }),
    );
    await expect(service.patch('b1', { endsOn: '2026-11-05' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.promoBanner.update).not.toHaveBeenCalled();
  });
});

describe('PromoBannersService.reorder', () => {
  it('refuses a list that is not exactly the current set', async () => {
    const { service, prisma } = makeService();
    prisma.promoBanner.findMany.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);
    await expect(service.reorder({ ids: ['a'] })).rejects.toBeInstanceOf(ConflictException);
  });

  it('writes positions in the order given', async () => {
    const { service, prisma, audit } = makeService();
    prisma.promoBanner.findMany.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);
    await service.reorder({ ids: ['b', 'a'] });
    expect(prisma.promoBanner.update).toHaveBeenNthCalledWith(1, { where: { id: 'b' }, data: { position: 0 } });
    expect(prisma.promoBanner.update).toHaveBeenNthCalledWith(2, { where: { id: 'a' }, data: { position: 1 } });
    expect(audit.record.mock.calls[0][0]).toMatchObject({ action: 'promo-banner:reorder' });
  });
});
