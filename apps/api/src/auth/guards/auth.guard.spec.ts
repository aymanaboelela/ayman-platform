import { Controller, Get, type INestApplication, Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { BETTER_AUTH, type BetterAuthLike, type BetterAuthSessionResult } from '../better-auth.token';
import { CurrentUser, type AuthenticatedUser } from '../decorators/current-user.decorator';
import { Public } from '../decorators/public.decorator';
import { RequirePermission } from '../decorators/require-permission.decorator';
import { AuthGuard } from './auth.guard';

// A minimal controller, independent of the real app, exercising every shape
// the guard has to handle: a public route, a route with zero decorators at
// all (deny-by-default has to cover this case, not just explicitly
// `@Public()`-annotated ones), and routes gated on a specific permission.
@Controller('test')
class FixtureController {
  @Public()
  @Get('public')
  publicRoute(): { ok: true } {
    return { ok: true };
  }

  // Deliberately no @Public(), no @RequirePermission() — proves the guard
  // denies by default rather than needing an explicit "protect me" marker.
  @Get('bare')
  bareRoute(@CurrentUser() user: AuthenticatedUser): { id: string; role: string } {
    return { id: user.id, role: user.role };
  }

  @RequirePermission('admin:access')
  @Get('admin-only')
  adminOnlyRoute(): { ok: true } {
    return { ok: true };
  }

  @RequirePermission('course:read')
  @Get('course-read')
  courseReadRoute(): { ok: true } {
    return { ok: true };
  }
}

async function buildApp(
  getSession: () => Promise<BetterAuthSessionResult | null>,
): Promise<INestApplication> {
  const fakeAuth: BetterAuthLike = { api: { getSession } };

  @Module({
    controllers: [FixtureController],
    providers: [
      Reflector,
      { provide: APP_GUARD, useClass: AuthGuard },
      { provide: BETTER_AUTH, useValue: fakeAuth },
    ],
  })
  class FixtureModule {}

  const moduleRef = await Test.createTestingModule({ imports: [FixtureModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

const now = new Date();

const studentSession: BetterAuthSessionResult = {
  session: { id: 'sess-1' },
  user: {
    id: 'user-1',
    email: 'student@example.com',
    name: 'Student',
    emailVerified: true,
    role: 'student',
    createdAt: now,
    updatedAt: now,
  },
};

const adminSession: BetterAuthSessionResult = {
  session: { id: 'sess-2' },
  user: {
    id: 'user-2',
    email: 'admin@example.com',
    name: 'Admin',
    emailVerified: true,
    role: 'admin',
    createdAt: now,
    updatedAt: now,
  },
};

describe('AuthGuard', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('denies an unauthenticated request to a protected route with 401', async () => {
    app = await buildApp(async () => null);
    await request(app.getHttpServer()).get('/test/course-read').expect(401);
  });

  it('allows a @Public() route to respond 200 while unauthenticated', async () => {
    app = await buildApp(async () => null);
    await request(app.getHttpServer()).get('/test/public').expect(200, { ok: true });
  });

  it('denies an authenticated user who lacks the required permission with 403', async () => {
    app = await buildApp(async () => studentSession);
    // student holds profile:read/write + course:read, NOT admin:access
    await request(app.getHttpServer()).get('/test/admin-only').expect(403);
  });

  it('allows an authenticated user who holds the required permission', async () => {
    app = await buildApp(async () => studentSession);
    await request(app.getHttpServer()).get('/test/course-read').expect(200, { ok: true });
  });

  it('admin holds every permission, including ones not explicitly listed', async () => {
    app = await buildApp(async () => adminSession);
    await request(app.getHttpServer()).get('/test/admin-only').expect(200, { ok: true });
  });

  it('fails closed: a session lookup that throws denies with 401, never 200', async () => {
    app = await buildApp(async () => {
      throw new Error('adapter error: connection refused');
    });
    await request(app.getHttpServer()).get('/test/bare').expect(401);
  });

  it('protects a route with no decorator at all, proving deny-by-default', async () => {
    app = await buildApp(async () => null);
    await request(app.getHttpServer()).get('/test/bare').expect(401);
  });

  it('a bare route still works normally for an authenticated user, exposing @CurrentUser()', async () => {
    app = await buildApp(async () => studentSession);
    await request(app.getHttpServer())
      .get('/test/bare')
      .expect(200, { id: 'user-1', role: 'student' });
  });
});
