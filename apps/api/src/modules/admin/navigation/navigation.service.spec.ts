import { ConflictException } from '@nestjs/common';
import { NavigationService } from './navigation.service';

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'n1',
    parentId: null,
    labelAr: 'الرئيسية',
    href: '/',
    icon: null,
    position: 0,
    visibleTo: [],
    isPublished: true,
    archivedAt: null,
    ...overrides,
  };
}

function makeService() {
  const audit = { record: jest.fn(async () => ({ id: 1n, prevHash: null, hash: 'x' })) };
  const prisma = {
    navigationItem: {
      findMany: jest.fn(async () => [] as unknown[]),
      findUnique: jest.fn(async () => null as unknown),
      create: jest.fn(async () => row()),
      update: jest.fn(async () => row()),
      aggregate: jest.fn(async () => ({ _max: { position: null } })),
    },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return { service: new NavigationService(prisma as never, audit as never), prisma, audit };
}

describe('NavigationService.listPublic / listAdmin', () => {
  it('groups children under their parent, one level deep', async () => {
    const { service, prisma } = makeService();
    prisma.navigationItem.findMany.mockResolvedValueOnce([
      row({ id: 'p1', parentId: null, position: 0 }),
      row({ id: 'c1', parentId: 'p1', position: 0, labelAr: 'فرعي' }),
      row({ id: 'p2', parentId: null, position: 1, labelAr: 'ثاني' }),
    ]);

    const tree = await service.listPublic();
    expect(tree).toHaveLength(2);
    expect(tree[0]!.children).toHaveLength(1);
    expect(tree[0]!.children[0]!.id).toBe('c1');
    expect(tree[1]!.children).toHaveLength(0);
  });

  it('filters the public tree to published rows only, at the query level', async () => {
    const { service, prisma } = makeService();
    await service.listPublic();
    expect(prisma.navigationItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isPublished: true, archivedAt: null } }),
    );
  });
});

describe('NavigationService.reorder', () => {
  it('rejects a reorder whose id set no longer matches the current level (A2/lost-update)', async () => {
    const { service, prisma } = makeService();
    prisma.navigationItem.findMany.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);

    await expect(
      service.reorder({ parentId: null, ids: ['a', 'b', 'c'] }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('writes positions in the given order and one nav:reorder audit entry', async () => {
    const { service, prisma, audit } = makeService();
    prisma.navigationItem.findMany.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);

    await service.reorder({ parentId: null, ids: ['b', 'a'] });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record.mock.calls[0][0]).toMatchObject({
      action: 'nav:reorder',
      metadata: { order: ['b', 'a'] },
    });
  });
});

describe('NavigationService.archive / restore', () => {
  it('archive sets archivedAt and writes nav:archive', async () => {
    const { service, prisma, audit } = makeService();
    prisma.navigationItem.findUnique.mockResolvedValueOnce(row());
    await service.archive('n1');
    expect(prisma.navigationItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'n1' }, data: { archivedAt: expect.any(Date) } }),
    );
    expect(audit.record.mock.calls[0][0]).toMatchObject({ action: 'nav:archive' });
  });

  it('restore clears archivedAt and writes nav:restore', async () => {
    const { service, prisma, audit } = makeService();
    prisma.navigationItem.findUnique.mockResolvedValueOnce(row({ archivedAt: new Date() }));
    await service.restore('n1');
    expect(prisma.navigationItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'n1' }, data: { archivedAt: null } }),
    );
    expect(audit.record.mock.calls[0][0]).toMatchObject({ action: 'nav:restore' });
  });
});
