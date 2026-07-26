import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { SessionDeviceService } from './session-device.service';

/**
 * `recordLogin` is only ever called from `databaseHooks.session.create.after`
 * in `auth.config.ts` — no controller test exercises it — so it gets its own
 * direct coverage against a real seeded Postgres, same connection pattern as
 * `profile.service.spec.ts`.
 */
describe('SessionDeviceService', () => {
  let prisma: PrismaClient;
  let service: SessionDeviceService;
  const testUserIds: string[] = [];

  async function createTestUser(): Promise<string> {
    const id = randomUUID();
    await prisma.user.create({
      data: { id, name: 'Service Test', email: `${id}@example.test`, emailVerified: true, role: 'student' },
    });
    testUserIds.push(id);
    return id;
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
    await prisma.$connect();
    service = new SessionDeviceService(prisma);
  });

  afterAll(async () => {
    await prisma.sessionDevice.deleteMany({ where: { userId: { in: testUserIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: testUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
    await prisma.$disconnect();
  });

  it('creates a device row with a parsed label and the given ip', async () => {
    const userId = await createTestUser();
    const sessionId = `sess-${randomUUID()}`;
    await prisma.session.create({
      data: {
        id: sessionId,
        userId,
        token: `token-${sessionId}`,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await service.recordLogin({
      sessionId,
      userId,
      ipAddress: '198.51.100.4',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    });

    const device = await prisma.sessionDevice.findUnique({ where: { sessionId } });
    expect(device).toMatchObject({
      userId,
      sessionId,
      deviceName: 'Edge على Windows',
      deviceType: 'desktop',
      ip: '198.51.100.4',
      revokedAt: null,
    });
  });

  it('records a null ip and an unknown label for a missing user agent', async () => {
    const userId = await createTestUser();
    const sessionId = `sess-${randomUUID()}`;
    await prisma.session.create({
      data: { id: sessionId, userId, token: `token-${sessionId}`, expiresAt: new Date(Date.now() + 60_000) },
    });

    await service.recordLogin({ sessionId, userId, ipAddress: null, userAgent: null });

    const device = await prisma.sessionDevice.findUnique({ where: { sessionId } });
    expect(device).toMatchObject({ deviceName: 'جهاز غير معروف', deviceType: 'unknown', ip: null });
  });
});
