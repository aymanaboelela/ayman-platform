import { Injectable } from '@nestjs/common';
import { parseUserAgent } from './user-agent';
import type { PrismaClient, SessionDevice } from '../../generated/prisma/client';

export interface SessionDeviceView {
  id: string;
  deviceName: string;
  deviceType: string;
  ip: string | null;
  lastSeenAt: string;
  loggedInAt: string;
  isCurrent: boolean;
}

export interface RecordLoginInput {
  sessionId: string;
  userId: string;
  /** May be `''` — see `blankToNull`. */
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * The empty string is not an address, and on an `inet` column it is not even a
 * value — it is an error that costs the whole row.
 *
 * Better Auth writes `getIp(headers, options) || ''` onto the session, so a
 * request whose IP it cannot resolve arrives here as `''`, never as null, and
 * `?? null` at the call site does not catch it. Postgres then rejects
 * `''::inet` with `22P02`, `create` throws, and the caller's best-effort
 * try/catch swallows it — so the DEVICE record is lost over a column nothing
 * displays.
 *
 * And it cannot resolve one in production. `getIp` reads `x-forwarded-for`
 * only, and with no `advanced.ipAddress.trustedProxies` configured its parser
 * returns null unless the header holds EXACTLY ONE address — behind Cloudflare
 * and the VPS proxy it holds several. Its localhost fallback is guarded by
 * `isDevelopment() || isTest()`, which is why every developer machine has a
 * full device table and the server may have none at all.
 *
 * The IP is the least valuable thing in this row: nothing renders it (the
 * admin record deliberately omits it, and the student's own أجهزتي page shows
 * the label). Losing it must never cost the device name and type, which are
 * the whole point.
 */
function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Typed against the raw generated `PrismaClient`, not Nest's `PrismaService`
 * — this class is constructed twice: once by Nest's DI (via a factory in
 * `sessions.module.ts`, injecting the real `PrismaService`, which `extends
 * PrismaClient` and therefore satisfies this type) and once directly inside
 * `auth.config.ts`, which has no Nest container and only ever holds a raw
 * `PrismaClient` it built itself. Same split `PrismaCredentialLookup`
 * already established in `../../auth/login-security.hook.ts` for the same
 * reason.
 */
@Injectable()
export class SessionDeviceService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Called from `databaseHooks.session.create.after` on every session
   * creation (email/password today; any future OAuth provider gets this for
   * free without a second hook). Best-effort: a failure here must never
   * break sign-in itself — the caller wraps this in try/catch.
   */
  async recordLogin(input: RecordLoginInput): Promise<void> {
    const { deviceName, deviceType } = parseUserAgent(input.userAgent);
    const now = new Date();
    await this.prisma.sessionDevice.create({
      data: {
        userId: input.userId,
        sessionId: input.sessionId,
        deviceName,
        deviceType,
        ip: blankToNull(input.ipAddress),
        lastSeenAt: now,
        loggedInAt: now,
      },
    });
  }

  /**
   * Own, active devices only — revoked ones are dropped from the list (the
   * DB row survives for audit; see the schema comment). `currentSessionId`
   * comes from the caller's own `AuthGuard`-attached session, never trusted
   * from the request body, so `isCurrent` cannot be spoofed by a client.
   */
  async listOwn(userId: string, currentSessionId: string | undefined): Promise<SessionDeviceView[]> {
    const rows = await this.prisma.sessionDevice.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastSeenAt: 'desc' },
    });

    return rows.map((row: SessionDevice) => ({
      id: row.id,
      deviceName: row.deviceName,
      deviceType: row.deviceType,
      ip: row.ip,
      lastSeenAt: row.lastSeenAt.toISOString(),
      loggedInAt: row.loggedInAt.toISOString(),
      isCurrent: row.sessionId === currentSessionId,
    }));
  }

  /**
   * THE IDOR-CRITICAL PATH. Ownership is compiled directly into the
   * `updateMany` WHERE clause (`id = $1 AND user_id = $2 AND revoked_at IS
   * NULL`) — never a `findUnique` by id alone followed by an
   * application-level `if (row.userId !== userId)` check. `count === 0`
   * covers three cases identically (device belongs to someone else, device
   * does not exist, device is already revoked) so the caller cannot
   * distinguish "not yours" from "doesn't exist" — that indistinguishability
   * is exactly why the controller returns 404, not 403 (a 403 would confirm
   * the row exists, which is itself a leak for someone else's device id).
   *
   * On success this ALSO deletes the underlying Better Auth `Session` row,
   * not just this table's copy — that is what makes the revoked session
   * actually rejected on its next request (`AuthGuard`'s `getSession()`
   * finds nothing), rather than merely disappearing from `listOwn`.
   */
  async revokeOwn(userId: string, deviceId: string): Promise<boolean> {
    const result = await this.prisma.sessionDevice.updateMany({
      where: { id: deviceId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) return false;

    // Ownership was just proven above; this lookup is scoped identically
    // (id + userId) purely so a defensive reviewer never has to trust that
    // fact from a different line of code.
    const device = await this.prisma.sessionDevice.findFirst({
      where: { id: deviceId, userId },
      select: { sessionId: true },
    });
    if (device) {
      await this.prisma.session.deleteMany({ where: { id: device.sessionId } });
    }
    return true;
  }
}
