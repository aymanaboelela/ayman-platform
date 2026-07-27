import { ConflictException } from '@nestjs/common';
import { HomeBlocksService } from './home-blocks.service';

const HERO_PROPS = { type: 'hero' as const, headlineAr: 'مرحبًا', subheadlineAr: '', ctaLabelAr: '', ctaHref: '/courses', imageAssetId: null };

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'b1',
    key: 'hero-main',
    position: 0,
    isPublished: false,
    props: HERO_PROPS,
    archivedAt: null,
    ...overrides,
  };
}

function makeService() {
  const audit = { record: jest.fn(async () => ({ id: 1n, prevHash: null, hash: 'x' })) };
  const prisma = {
    homeBlock: {
      findMany: jest.fn(async () => [] as unknown[]),
      findUnique: jest.fn(async () => null as unknown),
      create: jest.fn(async () => row()),
      update: jest.fn(async () => row()),
      aggregate: jest.fn(async () => ({ _max: { position: null } })),
    },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return { service: new HomeBlocksService(prisma as never, audit as never), prisma, audit };
}

describe('HomeBlocksService.listPublic', () => {
  it('queries only published, non-archived rows', async () => {
    const { service, prisma } = makeService();
    await service.listPublic();
    expect(prisma.homeBlock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isPublished: true, archivedAt: null } }),
    );
  });
});

describe('HomeBlocksService.create', () => {
  it('denormalises props.type onto the type column and writes one audit entry', async () => {
    const { service, prisma, audit } = makeService();
    await service.create({ key: 'hero-main', isPublished: false, props: HERO_PROPS });

    expect(prisma.homeBlock.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'hero', props: HERO_PROPS }) }),
    );
    expect(audit.record.mock.calls[0][0]).toMatchObject({ action: 'home-block:create' });
  });
});

describe('HomeBlocksService.setPublished', () => {
  it('writes home-block:publish when enabling', async () => {
    const { service, prisma, audit } = makeService();
    prisma.homeBlock.findUnique.mockResolvedValueOnce(row());
    await service.setPublished('b1', true);
    expect(audit.record.mock.calls[0][0]).toMatchObject({ action: 'home-block:publish' });
  });

  it('writes home-block:unpublish when disabling', async () => {
    const { service, prisma, audit } = makeService();
    prisma.homeBlock.findUnique.mockResolvedValueOnce(row({ isPublished: true }));
    await service.setPublished('b1', false);
    expect(audit.record.mock.calls[0][0]).toMatchObject({ action: 'home-block:unpublish' });
  });
});

describe('HomeBlocksService.reorder', () => {
  it('rejects a reorder whose id set does not match the current list', async () => {
    const { service, prisma } = makeService();
    prisma.homeBlock.findMany.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);
    await expect(service.reorder({ ids: ['a', 'b', 'c'] })).rejects.toThrow(ConflictException);
  });

  it('writes positions and one home-block:reorder audit entry', async () => {
    const { service, prisma, audit } = makeService();
    prisma.homeBlock.findMany.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);
    await service.reorder({ ids: ['b', 'a'] });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(audit.record.mock.calls[0][0]).toMatchObject({ action: 'home-block:reorder' });
  });
});
