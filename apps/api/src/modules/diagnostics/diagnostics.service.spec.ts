import { DiagnosticsService } from './diagnostics.service';
import type { PrismaService } from '../../prisma/prisma.service';

describe('DiagnosticsService', () => {
  let service: DiagnosticsService;
  let prisma: {
    errorReport: {
      upsert: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      errorReport: {
        upsert: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    service = new DiagnosticsService(prisma as unknown as PrismaService);
  });

  describe('onModuleInit', () => {
    it('marks all legacy deploy and network drop error rows as resolved', async () => {
      prisma.errorReport.updateMany.mockResolvedValue({ count: 53 });

      await service.onModuleInit();

      expect(prisma.errorReport.updateMany).toHaveBeenCalledWith({
        where: {
          resolvedAt: null,
          OR: [
            { message: { contains: 'Failed to load chunk' } },
            { message: { contains: 'Loading chunk' } },
            { message: { contains: 'ChunkLoadError' } },
            { message: { contains: 'Server Action' } },
            { message: { contains: 'Failed to fetch' } },
            { message: { contains: 'Load failed' } },
            { stack: { contains: 'at module evaluation' } },
          ],
        },
        data: { resolvedAt: expect.any(Date) },
      });
    });
  });

  describe('record', () => {
    it('drops chunk load errors without writing to prisma', async () => {
      await service.record(
        {
          kind: 'client',
          route: '/courses/lessons/1',
          message: 'Failed to load chunk /_next/static/chunks/0lh3tq3nd7tdv.js from module 501123',
        },
        { userId: null, userAgent: 'Chrome' },
      );

      expect(prisma.errorReport.upsert).not.toHaveBeenCalled();
    });

    it('drops stale deploy server action errors without writing to prisma', async () => {
      await service.record(
        {
          kind: 'client',
          route: '/admin/courses/1',
          message: 'Server Action "abc12345" was not found on the server',
        },
        { userId: null, userAgent: 'Chrome' },
      );

      expect(prisma.errorReport.upsert).not.toHaveBeenCalled();
    });

    it('drops client network dropouts (Failed to fetch, Load failed)', async () => {
      await service.record(
        {
          kind: 'client',
          route: '/admin/homework/1',
          message: 'Failed to fetch',
        },
        { userId: null, userAgent: 'Chrome' },
      );

      expect(prisma.errorReport.upsert).not.toHaveBeenCalled();
    });

    it('records genuine application errors', async () => {
      prisma.errorReport.upsert.mockResolvedValue({});

      await service.record(
        {
          kind: 'server',
          route: '/dashboard',
          message: 'Cannot read properties of undefined (reading name)',
          digest: '12345678',
        },
        { userId: 'u1', userAgent: 'Chrome' },
      );

      expect(prisma.errorReport.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            kind: 'server',
            route: '/dashboard',
            message: 'Cannot read properties of undefined (reading name)',
            digest: '12345678',
          }),
        }),
      );
    });
  });

  describe('resolveAll', () => {
    it('updates all open error reports to resolved', async () => {
      prisma.errorReport.updateMany.mockResolvedValue({ count: 12 });

      await service.resolveAll();

      expect(prisma.errorReport.updateMany).toHaveBeenCalledWith({
        where: { resolvedAt: null },
        data: { resolvedAt: expect.any(Date) },
      });
    });
  });

  describe('setResolved', () => {
    it('sets resolvedAt date when resolving', async () => {
      prisma.errorReport.update.mockResolvedValue({});

      await service.setResolved('42', true);

      expect(prisma.errorReport.update).toHaveBeenCalledWith({
        where: { id: BigInt(42) },
        data: { resolvedAt: expect.any(Date) },
      });
    });

    it('clears resolvedAt when reopening', async () => {
      prisma.errorReport.update.mockResolvedValue({});

      await service.setResolved('42', false);

      expect(prisma.errorReport.update).toHaveBeenCalledWith({
        where: { id: BigInt(42) },
        data: { resolvedAt: null },
      });
    });
  });
});
