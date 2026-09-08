import type { PrismaService } from '../../prisma/prisma.service';

/**
 * A hermetic unit spec — no real database, no real network.
 *
 * `PushService` wraps two things that are wrong to touch from a test:
 * `web-push` makes real HTTPS calls to a browser vendor's push service, and
 * the subscription CRUD needs nothing a stub `pushSubscription` delegate
 * cannot stand in for. `question-bank.service.spec.ts` sets the precedent for
 * `jest.mock` on a leaf module in this codebase; this is the same shape,
 * applied to `web-push` instead of the sanitizer.
 */
jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

// Required for `loadEnv` to succeed inside `PushService`'s constructor — the
// base schema (`env.spec.ts`'s own `VALID` fixture) plus the VAPID triple,
// set directly rather than via a `.env` file so this spec has no filesystem
// dependency at all.
const BASE_ENV = {
  NODE_ENV: 'test',
  API_PORT: '3300',
  APP_URL: 'http://localhost:3200',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db?schema=app',
  DIRECT_DATABASE_URL: 'postgresql://o:p@localhost:5432/db?schema=app',
  REDIS_URL: 'redis://localhost:6379',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3300',
};

const VAPID_PUBLIC_KEY = 'BPub-Key';
const VAPID_PRIVATE_KEY = 'priv-key';
const VAPID_SUBJECT = 'mailto:admin@example.com';

function fakePrisma() {
  return {
    pushSubscription: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
  } as unknown as PrismaService;
}

describe('PushService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv, ...BASE_ENV };
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('when VAPID is not configured', () => {
    it('reports no public key', async () => {
      const { PushService } = await import('./push.service');
      const service = new PushService(fakePrisma());
      expect(service.publicKey()).toBeNull();
    });

    it('does not set VAPID details on web-push', async () => {
      const webpush = jest.requireMock('web-push') as { setVapidDetails: jest.Mock };
      const { PushService } = await import('./push.service');
      new PushService(fakePrisma());
      expect(webpush.setVapidDetails).not.toHaveBeenCalled();
    });

    it('notifyUser is a silent no-op — never queries subscriptions', async () => {
      const { PushService } = await import('./push.service');
      const prisma = fakePrisma();
      const service = new PushService(prisma);
      await service.notifyUser('u1', { title: 't', body: 'b', url: '/x', tag: 'x' });
      expect(prisma.pushSubscription.findMany).not.toHaveBeenCalled();
    });
  });

  describe('when VAPID is configured', () => {
    beforeEach(() => {
      process.env.VAPID_PUBLIC_KEY = VAPID_PUBLIC_KEY;
      process.env.VAPID_PRIVATE_KEY = VAPID_PRIVATE_KEY;
      process.env.VAPID_SUBJECT = VAPID_SUBJECT;
    });

    it('reports the public key', async () => {
      const { PushService } = await import('./push.service');
      const service = new PushService(fakePrisma());
      expect(service.publicKey()).toBe(VAPID_PUBLIC_KEY);
    });

    it('sets VAPID details once, at construction', async () => {
      const webpush = jest.requireMock('web-push') as { setVapidDetails: jest.Mock };
      const { PushService } = await import('./push.service');
      new PushService(fakePrisma());
      expect(webpush.setVapidDetails).toHaveBeenCalledWith(
        VAPID_SUBJECT,
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY,
      );
    });

    it('subscribe upserts on the endpoint, not a blind create', async () => {
      const { PushService } = await import('./push.service');
      const prisma = fakePrisma();
      const service = new PushService(prisma);

      await service.subscribe('u1', {
        endpoint: 'https://push.example/abc',
        keys: { p256dh: 'p256', auth: 'auth' },
      });

      expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith({
        where: { endpoint: 'https://push.example/abc' },
        create: {
          userId: 'u1',
          endpoint: 'https://push.example/abc',
          // Written explicitly, never left to the column default: this table
          // holds native FCM tokens too now, and a browser row that arrived
          // without a platform would be one the fan-out's `platform: 'web'`
          // filter still matched by luck rather than by statement.
          platform: 'web',
          p256dh: 'p256',
          auth: 'auth',
        },
        update: {
          userId: 'u1',
          platform: 'web',
          p256dh: 'p256',
          auth: 'auth',
          lastSeenAt: expect.any(Date),
        },
      });
    });

    it('registerDevice stores an FCM token with NO web-push keys', async () => {
      const { PushService } = await import('./push.service');
      const prisma = fakePrisma();
      const service = new PushService(prisma);

      await service.registerDevice('u1', {
        token: 'fcm-token',
        platform: 'android',
        appVersion: '1.0.0 (1)',
      });

      expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith({
        where: { endpoint: 'fcm-token' },
        create: {
          userId: 'u1',
          endpoint: 'fcm-token',
          platform: 'android',
          appVersion: '1.0.0 (1)',
          lastSeenAt: expect.any(Date),
        },
        update: {
          userId: 'u1',
          platform: 'android',
          appVersion: '1.0.0 (1)',
          // Explicit NULLs, not omission. An endpoint could have been a web
          // subscription before; writing null makes that transition legal
          // instead of a CHECK violation at a moment nobody is watching.
          p256dh: null,
          auth: null,
          lastSeenAt: expect.any(Date),
        },
      });
    });

    it('registerDevice re-points an existing token at the NEW user', async () => {
      // A token belongs to an app INSTALL, not a person. Two siblings sharing
      // a phone produce the same token under two accounts, and whoever
      // registered last is the one signed in — so `userId` is on the UPDATE.
      const { PushService } = await import('./push.service');
      const prisma = fakePrisma();
      const service = new PushService(prisma);

      await service.registerDevice('u2', { token: 'shared-token', platform: 'ios' });

      const call = (prisma.pushSubscription.upsert as jest.Mock).mock.calls[0][0];
      expect(call.update.userId).toBe('u2');
    });

    it('unsubscribe scopes the delete by { endpoint, userId } — a guessed endpoint deletes nothing', async () => {
      const { PushService } = await import('./push.service');
      const prisma = fakePrisma();
      const service = new PushService(prisma);

      await service.unsubscribe('u1', 'https://push.example/abc');

      expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
        where: { endpoint: 'https://push.example/abc', userId: 'u1' },
      });
    });

    it('notifyUser is a no-op when the user has no subscriptions', async () => {
      const webpush = jest.requireMock('web-push') as { sendNotification: jest.Mock };
      const { PushService } = await import('./push.service');
      const prisma = fakePrisma();
      (prisma.pushSubscription.findMany as jest.Mock).mockResolvedValue([]);
      const service = new PushService(prisma);

      await service.notifyUser('u1', { title: 't', body: 'b', url: '/x', tag: 'x' });

      expect(webpush.sendNotification).not.toHaveBeenCalled();
    });

    it('notifyUser sends to every subscription this user has', async () => {
      const webpush = jest.requireMock('web-push') as { sendNotification: jest.Mock };
      webpush.sendNotification.mockResolvedValue({ statusCode: 201, body: '', headers: {} });
      const { PushService } = await import('./push.service');
      const prisma = fakePrisma();
      (prisma.pushSubscription.findMany as jest.Mock).mockResolvedValue([
        { id: 's1', endpoint: 'https://a', p256dh: 'p1', auth: 'a1' },
        { id: 's2', endpoint: 'https://b', p256dh: 'p2', auth: 'a2' },
      ]);
      const service = new PushService(prisma);

      const payload = { title: 'سؤال جديد', body: 'preview', url: '/admin/inbox/c1', tag: 'ayman-inbox' };
      await service.notifyUser('u1', payload);

      expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
      expect(webpush.sendNotification).toHaveBeenCalledWith(
        { endpoint: 'https://a', keys: { p256dh: 'p1', auth: 'a1' } },
        JSON.stringify(payload),
      );
    });

    it('⚠️ asks the database for WEB rows only', async () => {
      // The table holds native FCM tokens beside browser subscriptions now. An
      // FCM token is not a push-service URL and has no encryption keys, so
      // handing one to `web-push` is not a delivery that fails — it is a throw
      // inside a fan-out, for one recipient, after the notification row is
      // already committed.
      //
      // This asserts the FILTER rather than the outcome, because the outcome
      // of getting it wrong is a crash in a code path nothing else covers.
      const { PushService } = await import('./push.service');
      const prisma = fakePrisma();
      (prisma.pushSubscription.findMany as jest.Mock).mockResolvedValue([]);
      const service = new PushService(prisma);

      await service.notifyUser('u1', { title: 't', body: 'b', url: '/x', tag: 'x' });

      expect(prisma.pushSubscription.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1', platform: 'web' },
      });
    });

    it('prunes a subscription the push service reports gone (410)', async () => {
      const webpush = jest.requireMock('web-push') as { sendNotification: jest.Mock };
      webpush.sendNotification.mockRejectedValue(Object.assign(new Error('gone'), { statusCode: 410 }));
      const { PushService } = await import('./push.service');
      const prisma = fakePrisma();
      (prisma.pushSubscription.findMany as jest.Mock).mockResolvedValue([
        { id: 's1', endpoint: 'https://a', p256dh: 'p1', auth: 'a1' },
      ]);
      (prisma.pushSubscription.delete as jest.Mock).mockResolvedValue(undefined);
      const service = new PushService(prisma);

      await service.notifyUser('u1', { title: 't', body: 'b', url: '/x', tag: 'x' });

      expect(prisma.pushSubscription.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
    });

    it('does not prune on an ordinary send failure (not 404/410)', async () => {
      const webpush = jest.requireMock('web-push') as { sendNotification: jest.Mock };
      webpush.sendNotification.mockRejectedValue(Object.assign(new Error('boom'), { statusCode: 500 }));
      const { PushService } = await import('./push.service');
      const prisma = fakePrisma();
      (prisma.pushSubscription.findMany as jest.Mock).mockResolvedValue([
        { id: 's1', endpoint: 'https://a', p256dh: 'p1', auth: 'a1' },
      ]);
      const service = new PushService(prisma);

      // Never throws — the caller (`announce()`) has already committed.
      await expect(
        service.notifyUser('u1', { title: 't', body: 'b', url: '/x', tag: 'x' }),
      ).resolves.toBeUndefined();
      expect(prisma.pushSubscription.delete).not.toHaveBeenCalled();
    });
  });
});
