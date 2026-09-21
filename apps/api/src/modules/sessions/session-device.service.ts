import { Injectable } from '@nestjs/common';
import { parseUserAgent } from './user-agent';
import type { PrismaClient } from '../../generated/prisma/client';

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
   * Own, active DEVICES — one entry per device, not per sign-in.
   *
   * ## Why this is a GROUP BY and not a findMany any more
   *
   * This table is a sign-in log wearing a device table's name. A row is
   * written per session creation, `revoked_at` is set only by an explicit
   * revoke (never by signing out, never by a session lapsing), and
   * `last_seen_at` is written once and never updated. So «أجهزتي» was
   * rendering one card per login a student had ever made: measured on the dev
   * cohort, 3,686 students had one row and one had 459 — 459 cards, all of
   * them saying «Chrome على Android», and 38 of them pointing at sessions
   * that no longer exist.
   *
   * Two corrections, and the device limit in `auth/device-limit.ts` counts
   * exactly what this lists, which is the property that matters: what a
   * student can SEE and remove has to be what the gate counts, or removing a
   * device would not free a slot and the limit would be a permanent lock.
   *
   *   1. JOIN `app.sessions` and keep only rows whose session is still alive.
   *      This is also how the dead rows already in the table are handled —
   *      excluded by a WHERE clause, not erased by a mass `UPDATE ... SET
   *      revoked_at` over thousands of production rows that could not be
   *      tested first and could not be undone.
   *   2. GROUP BY `device_name`, so one phone is one card however many times
   *      it has signed in. The representative `id` is the newest row's, and
   *      `revokeOwn` expands it back to the whole group.
   *
   * Raw SQL because `session_id` is deliberately a plain column rather than a
   * `@relation` (schema comment), so Prisma has no join to offer.
   * `currentSessionId` comes from the caller's own `AuthGuard`-attached
   * session, never from the request body, so `isCurrent` cannot be spoofed.
   *
   * ⚠️ `now() AT TIME ZONE 'UTC'`, never a bare `now()`. `sessions.expires_at`
   * is `timestamp WITHOUT time zone` holding a UTC instant (that is what
   * Prisma writes), and comparing it against `now()` — a `timestamptz` —
   * makes Postgres reinterpret the column in the SERVER's timezone. The dev
   * database is set to `Africa/Cairo`, so a session with a real hour left on
   * it compared as two hours expired, and this list came back empty. Measured:
   * the same value tests `false` against `now()` and `true` against
   * `now() AT TIME ZONE 'UTC'`. Whatever a given stack's timezone happens to
   * be is not something a liveness check may depend on.
   */
  async listOwn(userId: string, currentSessionId: string | undefined): Promise<SessionDeviceView[]> {
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        deviceName: string;
        deviceType: string;
        ip: string | null;
        lastSeenAt: Date;
        loggedInAt: Date;
        isCurrent: boolean;
      }[]
    >`
      SELECT
        (array_agg(d.id ORDER BY d.logged_in_at DESC))[1]          AS "id",
        d.device_name                                              AS "deviceName",
        (array_agg(d.device_type ORDER BY d.logged_in_at DESC))[1] AS "deviceType",
        (array_agg(d.ip ORDER BY d.logged_in_at DESC))[1]          AS "ip",
        MAX(d.last_seen_at)                                        AS "lastSeenAt",
        MAX(d.logged_in_at)                                        AS "loggedInAt",
        bool_or(d.session_id = ${currentSessionId ?? ''})          AS "isCurrent"
      FROM app.session_devices d
      JOIN app.sessions s ON s.id = d.session_id
      WHERE d.user_id = ${userId}
        AND d.revoked_at IS NULL
        AND s.expires_at > (now() AT TIME ZONE 'UTC')
      GROUP BY d.device_name
      ORDER BY MAX(d.last_seen_at) DESC
    `;

    return rows.map((row) => ({
      id: row.id,
      deviceName: row.deviceName,
      deviceType: row.deviceType,
      // `inet` comes back as a string; the column is nullable and nothing
      // renders it (see `blankToNull`), so it is passed through untouched.
      ip: row.ip,
      lastSeenAt: row.lastSeenAt.toISOString(),
      loggedInAt: row.loggedInAt.toISOString(),
      isCurrent: row.isCurrent,
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
   * On success this ALSO deletes the underlying Better Auth `Session` rows,
   * not just this table's copies — that is what makes the revoked session
   * actually rejected on its next request (`AuthGuard`'s `getSession()`
   * finds nothing), rather than merely disappearing from `listOwn`.
   *
   * ## It revokes the whole DEVICE, not the one row
   *
   * `listOwn` groups by `device_name`, so the id a client sends back stands
   * for every un-revoked sign-in from that device — and with 90-day sessions
   * and no automatic sign-out, one phone routinely has dozens. Revoking only
   * the representative row would tick a card off the screen while the other
   * sessions stayed valid, and — worse now that `device-limit.ts` counts the
   * same group — it would leave the device still occupying its slot. «شيل
   * جهاز عشان تضيف جديد» has to actually free one, or the two-device limit is
   * a permanent lock and the student's only remaining move is WhatsApp.
   */
  async revokeOwn(userId: string, deviceId: string): Promise<boolean> {
    // Ownership is proven FIRST and by the WHERE clause — id AND user_id —
    // never by reading the row and comparing `userId` in application code.
    // A null result covers "belongs to someone else", "does not exist" and
    // "already revoked" identically, which is why the controller answers 404
    // rather than 403: a 403 would confirm the id belongs to somebody.
    const device = await this.prisma.sessionDevice.findFirst({
      where: { id: deviceId, userId, revokedAt: null },
      select: { deviceName: true },
    });
    if (!device) return false;

    const group = { userId, deviceName: device.deviceName, revokedAt: null } as const;
    const rows = await this.prisma.sessionDevice.findMany({
      where: group,
      select: { sessionId: true },
    });

    await this.prisma.sessionDevice.updateMany({
      where: group,
      data: { revokedAt: new Date() },
    });
    await this.prisma.session.deleteMany({
      where: { id: { in: rows.map((row) => row.sessionId) } },
    });
    return true;
  }
}
