import { Controller, Get, type INestApplication, Module, Post } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AgentTokenResolver, agentBearerFrom, type ResolvedAgentToken } from '../agent-token.resolver';
import { BETTER_AUTH, type BetterAuthLike } from '../better-auth.token';
import { AllowAgentToken, NoAgentToken } from '../decorators/agent-token.decorator';
import { CurrentUser, type AuthenticatedUser } from '../decorators/current-user.decorator';
import { RequirePermission } from '../decorators/require-permission.decorator';
import { AuthGuard } from './auth.guard';
import { AgentScopeInterceptor } from '../agent-scope.interceptor';
import { permissionsForUser, userHasPermission } from '../permissions';

let featureOn = true;
jest.mock('../../common/entitlements', () => ({
  isFeatureEnabled: (key: string) => (key === 'agentTokens' ? featureOn : true),
}));

@Controller('t')
class FixtureController {
  @RequirePermission('homework:read')
  @Get('homework')
  homework(@CurrentUser() user: AuthenticatedUser): { id: string } {
    return { id: user.id };
  }

  @RequirePermission('homework:review')
  @Post('review')
  review(): { ok: true } {
    return { ok: true };
  }

  @RequirePermission('payment:review')
  @Post('money')
  money(): { ok: true } {
    return { ok: true };
  }

  // Signed-in-any-permission: a student's own surface.
  @Get('bare')
  bare(): { ok: true } {
    return { ok: true };
  }

  @AllowAgentToken()
  @Get('allowed')
  allowed(): { ok: true } {
    return { ok: true };
  }

  // A handler that asks a SECOND question itself, like finance's `includeBooks`.
  @RequirePermission('homework:read')
  @Get('inner')
  async inner(@CurrentUser() user: AuthenticatedUser): Promise<{ books: boolean; held: number }> {
    await Promise.resolve(); // across an await, like a real handler
    return {
      books: userHasPermission(user.id, user.role, 'book-order:read'),
      held: permissionsForUser(user.id, user.role).length,
    };
  }

  @NoAgentToken()
  @RequirePermission('homework:read')
  @Get('keys')
  keys(): { ok: true } {
    return { ok: true };
  }
}

const KEY = `ayk_${'a'.repeat(43)}`;
const now = new Date();

const token: ResolvedAgentToken = {
  id: '0190c0de-0000-7000-8000-000000000001',
  name: 'Claude',
  hint: 'ayk_aaaaaa',
  expiresAt: new Date(Date.now() + 86_400_000),
  // An admin: `userHasPermission` says yes to everything, so whatever is
  // refused below is refused by the KEY, which is the point.
  user: {
    id: 'admin-1',
    email: 'a@example.com',
    name: 'Admin',
    emailVerified: true,
    role: 'admin',
    createdAt: now,
    updatedAt: now,
  },
  permissions: new Set(['homework:read', 'homework:review']),
};

async function build(options: { resolve?: () => Promise<ResolvedAgentToken | null>; withResolver?: boolean } = {}) {
  const getSession = jest.fn().mockResolvedValue(null);
  const resolve = jest.fn(options.resolve ?? (() => Promise.resolve(token)));
  const recordUse = jest.fn();
  const fakeAuth: BetterAuthLike = { api: { getSession } };

  @Module({
    controllers: [FixtureController],
    providers: [
      Reflector,
      { provide: APP_GUARD, useClass: AuthGuard },
      { provide: APP_INTERCEPTOR, useClass: AgentScopeInterceptor },
      { provide: BETTER_AUTH, useValue: fakeAuth },
      ...(options.withResolver === false
        ? []
        : [{ provide: AgentTokenResolver, useValue: { resolve, recordUse } }]),
    ],
  })
  class FixtureModule {}

  const moduleRef = await Test.createTestingModule({ imports: [FixtureModule] }).compile();
  const app: INestApplication = moduleRef.createNestApplication();
  await app.init();
  return { app, getSession, resolve, recordUse };
}

const auth = { authorization: `Bearer ${KEY}` };

describe('AuthGuard — agent keys', () => {
  beforeEach(() => {
    featureOn = true;
  });

  it('lets a key through on a permission it carries, acting as its creator', async () => {
    const { app, getSession } = await build();
    const res = await request(app.getHttpServer()).get('/t/homework').set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'admin-1' });
    // Never handed to better-auth: a key is not a session token.
    expect(getSession).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuses a permission the key does not carry, even for an admin, and audits it', async () => {
    const { app, recordUse } = await build();
    const res = await request(app.getHttpServer()).post('/t/money').set(auth);
    expect(res.status).toBe(403);
    expect(recordUse).toHaveBeenCalledWith(token, expect.objectContaining({ method: 'POST', path: '/t/money' }), 'denied', 'payment:review');
    await app.close();
  });

  it('audits writes and not reads', async () => {
    const { app, recordUse } = await build();
    await request(app.getHttpServer()).get('/t/homework').set(auth).expect(200);
    expect(recordUse).not.toHaveBeenCalled();
    await request(app.getHttpServer()).post('/t/review').set(auth).expect(201);
    expect(recordUse).toHaveBeenCalledWith(token, expect.objectContaining({ method: 'POST' }), 'success', 'homework:review');
    await app.close();
  });

  it('refuses a route with no permission unless it opts in', async () => {
    const { app } = await build();
    await request(app.getHttpServer()).get('/t/bare').set(auth).expect(403);
    await request(app.getHttpServer()).get('/t/allowed').set(auth).expect(200);
    await app.close();
  });

  it("narrows a handler's own permission checks to the key, even for an admin", async () => {
    const { app } = await build();
    const res = await request(app.getHttpServer()).get('/t/inner').set(auth).expect(200);
    expect(res.body).toEqual({ books: false, held: 2 });
    // Outside the request the admin holds everything again.
    expect(userHasPermission('admin-1', 'admin', 'book-order:read')).toBe(true);
    await app.close();
  });

  it('refuses key management outright, whatever the key carries', async () => {
    const { app } = await build();
    await request(app.getHttpServer()).get('/t/keys').set(auth).expect(403);
    await app.close();
  });

  it('answers 401 for a key that does not resolve', async () => {
    const { app, getSession } = await build({ resolve: () => Promise.resolve(null) });
    await request(app.getHttpServer()).get('/t/homework').set(auth).expect(401);
    expect(getSession).not.toHaveBeenCalled();
    await app.close();
  });

  it('fails closed when the lookup throws', async () => {
    const { app } = await build({ resolve: () => Promise.reject(new Error('db down')) });
    await request(app.getHttpServer()).get('/t/homework').set(auth).expect(401);
    await app.close();
  });

  it('refuses every key without a lookup when the stack has the feature off', async () => {
    featureOn = false;
    const { app, resolve } = await build();
    await request(app.getHttpServer()).get('/t/homework').set(auth).expect(401);
    expect(resolve).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuses a key when no resolver is wired, instead of trying it as a session', async () => {
    const { app, getSession } = await build({ withResolver: false });
    await request(app.getHttpServer()).get('/t/homework').set(auth).expect(401);
    expect(getSession).not.toHaveBeenCalled();
    await app.close();
  });

  it('leaves a better-auth bearer token on the session path', async () => {
    const { app, getSession, resolve } = await build();
    await request(app.getHttpServer()).get('/t/homework').set({ authorization: 'Bearer abc.def' }).expect(401);
    expect(getSession).toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('agentBearerFrom', () => {
  it('picks out only the ayk_ prefix', () => {
    expect(agentBearerFrom({ authorization: `Bearer ${KEY}` })).toBe(KEY);
    expect(agentBearerFrom({ authorization: `bearer   ${KEY} ` })).toBe(KEY);
    expect(agentBearerFrom({ authorization: 'Bearer session.token' })).toBeNull();
    expect(agentBearerFrom({})).toBeNull();
    // Meant as a key, so it is one — and the resolver rejects its shape.
    expect(agentBearerFrom({ authorization: 'Bearer ayk_short' })).toBe('ayk_short');
  });
});
