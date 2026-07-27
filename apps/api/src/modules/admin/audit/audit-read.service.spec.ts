import { AuditReadService } from './audit-read.service';

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 42n,
    occurredAt: new Date('2026-07-26T10:00:00.000Z'),
    actorUserId: 'user_1',
    actorIp: '127.0.0.1',
    actorUserAgent: 'jest',
    action: 'settings:update',
    resourceType: 'site_settings',
    resourceId: '1',
    outcome: 'success',
    metadata: { key: 'branding' },
    requestId: null,
    prevHash: null,
    hash: 'a'.repeat(64),
    ...overrides,
  };
}

function makeService() {
  const audit = { verifyChain: jest.fn(async () => ({ ok: true as const })) };
  const prisma = {
    auditLog: {
      count: jest.fn(async () => 0),
      findMany: jest.fn(async () => [] as unknown[]),
    },
    user: {
      findMany: jest.fn(async () => [] as { id: string; email: string }[]),
    },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return { service: new AuditReadService(prisma as never, audit as never), prisma, audit };
}

const BASE_QUERY = {
  page: 1,
  perPage: 50,
  action: [] as string[],
  resourceType: null,
  actorUserId: null,
  outcome: null,
  from: null,
  to: null,
};

describe('AuditReadService.list — BigInt serialisation', () => {
  it('serialises id as a decimal string, never a bigint or a lossy number', async () => {
    const { service, prisma } = makeService();
    prisma.auditLog.findMany.mockResolvedValueOnce([row({ id: 9_007_199_254_740_993n })]);
    prisma.auditLog.count.mockResolvedValueOnce(1);

    const result = await service.list(BASE_QUERY);

    expect(typeof result.rows[0]!.id).toBe('string');
    expect(result.rows[0]!.id).toBe('9007199254740993');
    // The whole point: JSON.stringify must not throw on the returned shape.
    expect(() => JSON.stringify(result)).not.toThrow();
  });
});

describe('AuditReadService.list — actor email join', () => {
  it('joins the actor email via a batched lookup, keyed by the immutable actorUserId', async () => {
    const { service, prisma } = makeService();
    prisma.auditLog.findMany.mockResolvedValueOnce([row({ actorUserId: 'user_1' })]);
    prisma.auditLog.count.mockResolvedValueOnce(1);
    prisma.user.findMany.mockResolvedValueOnce([{ id: 'user_1', email: 'admin@example.test' }]);

    const result = await service.list(BASE_QUERY);

    expect(result.rows[0]!.actorUserId).toBe('user_1');
    expect(result.rows[0]!.actorEmail).toBe('admin@example.test');
  });

  it('reports a null email for a null actor without querying users', async () => {
    const { service, prisma } = makeService();
    prisma.auditLog.findMany.mockResolvedValueOnce([row({ actorUserId: null })]);
    prisma.auditLog.count.mockResolvedValueOnce(1);

    const result = await service.list(BASE_QUERY);

    expect(result.rows[0]!.actorEmail).toBeNull();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});

describe('AuditReadService.list — filters', () => {
  it('filters by action, resourceType, actorUserId and outcome together', async () => {
    const { service, prisma } = makeService();
    await service.list({
      ...BASE_QUERY,
      action: ['flag:update'],
      resourceType: 'feature_flags',
      actorUserId: 'user_1',
      outcome: 'success',
    });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          action: { in: ['flag:update'] },
          resourceType: 'feature_flags',
          actorUserId: 'user_1',
          outcome: 'success',
        },
        orderBy: { occurredAt: 'desc' },
      }),
    );
  });

  it('always orders by occurredAt descending, never by a client-supplied column', async () => {
    const { service, prisma } = makeService();
    await service.list(BASE_QUERY);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { occurredAt: 'desc' } }),
    );
  });
});

describe('AuditReadService.verifyChain', () => {
  it('delegates to the write-side AuditService', async () => {
    const { service, audit } = makeService();
    await expect(service.verifyChain()).resolves.toEqual({ ok: true });
    expect(audit.verifyChain).toHaveBeenCalledTimes(1);
  });
});
