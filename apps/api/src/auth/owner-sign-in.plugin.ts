import { randomBytes } from 'node:crypto';
import type { BetterAuthPlugin } from 'better-auth';
import { createAuthEndpoint } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { CONTROL_PUBLIC_KEYS } from '../common/entitlements';
import { TENANT_KEY } from '../common/tenant';
import type { PrismaClient } from '../generated/prisma/client';
import { verifyOwnerSignInToken } from './owner-sign-in';

/** The `verifications` row that burns a token and remembers the session it
 *  opened — `id` is the primary key, so two requests racing on one token
 *  cannot both insert it. */
const IDENTIFIER = 'owner-sign-in';

/**
 * «لوحته» — `GET /api/auth/owner-sign-in?token=…`, the instructor-stack half.
 * The signing half is `apps/web/app/(admin)/admin/platforms/sign-in/[key]`.
 *
 * Signs the owner in as this stack's FIRST admin (the account `create-admin`
 * made when the stack was provisioned), whatever its password is now — the
 * whole point is that a changed password does not lock the owner out.
 *
 * ## Why the session is written here and not through `createSession`
 *
 * `internalAdapter.createSession` runs `databaseHooks.session.create`, and the
 * device limit lives there: an instructor already on two devices would refuse
 * the owner, which is exactly the day he is opening their panel to help. And
 * the session is deliberately NOT given a `session_devices` row, because that
 * is what the device limit counts — the owner never uses up one of the
 * instructor's slots. The audit row below is the record of it instead.
 *
 * Every failure lands on `/login` with nothing said: a refused token is either
 * an expired click or someone probing, and neither is owed a reason.
 */
export function ownerSignIn(options: { prisma: PrismaClient; appUrl: string; sessionSeconds: number }) {
  const { prisma, appUrl, sessionSeconds } = options;
  const audit = new AuditService(prisma as never);

  return {
    id: 'owner-sign-in',
    endpoints: {
      ownerSignIn: createAuthEndpoint(
        '/owner-sign-in',
        { method: 'GET', query: z.object({ token: z.string().min(1).max(4096) }) },
        async (ctx) => {
          const refused = new URL('/login', appUrl).toString();

          let claims;
          try {
            claims = await verifyOwnerSignInToken(ctx.query.token, { keys: CONTROL_PUBLIC_KEYS, tenantKey: TENANT_KEY });
          } catch (error) {
            console.warn('owner-sign-in: refused a token', error instanceof Error ? error.message : error);
            throw ctx.redirect(refused);
          }

          const admin = await prisma.user.findFirst({
            where: { role: 'admin', bannedAt: null },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: { id: true },
          });
          if (!admin) throw ctx.redirect(refused);
          const user = await ctx.context.internalAdapter.findUserById(admin.id);
          if (!user) throw ctx.redirect(refused);

          const now = Date.now();
          const sessionId = randomBytes(24).toString('base64url');
          try {
            await prisma.verification.create({
              data: {
                id: `${IDENTIFIER}:${claims.jti}`,
                identifier: IDENTIFIER,
                value: sessionId,
                expiresAt: new Date(now + sessionSeconds * 1000),
              },
            });
          } catch {
            // P2002 on the primary key: this token was already used.
            throw ctx.redirect(refused);
          }

          // One owner session at a time: the previous ones are found through
          // the rows above, so an instructor's own sessions are never touched.
          // ⚠️ The rows themselves stay — each one is a burnt `jti`, and
          // deleting it re-opens that token for the rest of its minute. One
          // row per click is nothing to keep.
          const earlier = await prisma.verification.findMany({
            where: { identifier: IDENTIFIER, NOT: { value: sessionId } },
            select: { value: true },
          });
          if (earlier.length > 0) {
            await prisma.session.deleteMany({ where: { id: { in: earlier.map((row) => row.value) } } });
          }

          const headers = ctx.request?.headers;
          const ipAddress = headers?.get('cf-connecting-ip')?.trim() || null;
          const userAgent = headers?.get('user-agent')?.slice(0, 512) || null;
          const session = await prisma.session.create({
            data: {
              id: sessionId,
              token: randomBytes(24).toString('base64url'),
              userId: user.id,
              expiresAt: new Date(now + sessionSeconds * 1000),
              ipAddress,
              userAgent,
            },
          });

          try {
            await audit.record({
              action: 'platform:owner-sign-in',
              resourceType: 'user',
              resourceId: user.id,
              outcome: 'success',
              actorUserId: null,
              actorIp: ipAddress,
              actorUserAgent: userAgent,
              requestId: null,
              metadata: { jti: claims.jti },
            });
          } catch (error) {
            // The audit chain serialises on an advisory lock; a row that fails
            // to land must not turn into a door that will not open.
            console.error('owner-sign-in: audit row failed', error);
          }

          await setSessionCookie(ctx, { session, user });
          throw ctx.redirect(new URL('/admin', appUrl).toString());
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}
