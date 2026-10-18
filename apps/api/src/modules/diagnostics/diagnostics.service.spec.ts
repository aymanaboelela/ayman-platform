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
            { message: { in: expect.arrayContaining(['network error', 'Connection closed.']) } },
            { message: 'An unexpected response was received from the server.' },
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

    /*
     * Chrome's OTHER sentence for a dropped connection — the one that filled
     * the log after `Failed to fetch` was taught: a response body that died
     * half-way (`/results`, `/rank`, `/dashboard`, a quiz review). An older
     * tab still posts it; this is the check it meets.
     */
    it('drops every engine’s sentence for a dropped connection, exactly', async () => {
      for (const message of [
        'network error',
        'NetworkError when attempting to fetch resource.',
        'The network connection was lost.',
        'Connection closed.',
      ]) {
        await service.record({ kind: 'client', route: '/results', message }, { userId: null, userAgent: null });
      }
      expect(prisma.errorReport.upsert).not.toHaveBeenCalled();

      // …and only exactly: somebody's real message that mentions it is filed.
      prisma.errorReport.upsert.mockResolvedValue({});
      await service.record(
        { kind: 'client', route: '/results', message: 'network error while decoding the grade' },
        { userId: null, userAgent: null },
      );
      expect(prisma.errorReport.upsert).toHaveBeenCalledTimes(1);
    });

    it('drops a Server Action the edge answered mid-deploy', async () => {
      await service.record(
        {
          kind: 'client',
          route: '/admin/grading/01a12c02',
          message: 'An unexpected response was received from the server.',
        },
        { userId: null, userAgent: null },
      );
      expect(prisma.errorReport.upsert).not.toHaveBeenCalled();
    });

    /*
     * The server files a Server Component failure itself now, with the real
     * message, under the same fingerprint the browser's copy uses. The
     * browser's copy — still sent by a tab older than that change — knows only
     * Next's production sentence, and must never erase the real one.
     */
    const OMITTED =
      'An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.';

    it('never lets the browser’s generic copy overwrite the server’s real message', async () => {
      prisma.errorReport.upsert.mockResolvedValue({});
      await service.record(
        {
          kind: 'server',
          route: '/quizzes/01a12fb3',
          message: OMITTED,
          digest: '1389995574',
          stack: 'Error: An error occurred in the Server Components render.',
        },
        { userId: 'u1', userAgent: 'Chrome' },
      );

      const update = prisma.errorReport.upsert.mock.calls[0][0].update;
      expect(update.message).toBeUndefined();
      expect(update.stack).toBeUndefined();
      expect(update.occurrences).toEqual({ increment: 1 });
    });

    it('lets the server’s real message replace a row an older browser created', async () => {
      prisma.errorReport.upsert.mockResolvedValue({});
      await service.record(
        {
          kind: 'server',
          route: '/quizzes/01a12fb3',
          message: '/api/quiz/lessons/01a12fb3 failed with 429',
          digest: '1389995574',
          stack: '[render · /quizzes/[lessonId]]\nApiRequestError: …',
        },
        { userId: 'u1', userAgent: 'Chrome' },
      );

      const call = prisma.errorReport.upsert.mock.calls[0][0];
      expect(call.update.message).toBe('/api/quiz/lessons/01a12fb3 failed with 429');
      expect(call.update.stack).toContain('[render · /quizzes/[lessonId]]');
    });

    it('files the server’s report and the browser’s copy of one failure under one fingerprint', async () => {
      prisma.errorReport.upsert.mockResolvedValue({});
      const base = { kind: 'server' as const, route: '/welcome', digest: '1048231609' };
      await service.record({ ...base, message: 'GET /api/session failed with 429' }, { userId: null, userAgent: null });
      await service.record({ ...base, message: OMITTED }, { userId: null, userAgent: null });

      const [first, second] = prisma.errorReport.upsert.mock.calls.map((call) => call[0].where.fingerprint);
      expect(first).toBe(second);
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
