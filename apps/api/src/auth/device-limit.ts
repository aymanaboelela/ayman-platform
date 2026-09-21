import { FLAG_DECLARATIONS } from '@ayman/contracts/admin/flags';
import { parseUserAgent } from '../modules/sessions/user-agent';
import type { PrismaClient } from '../generated/prisma/client';

/**
 * «ما ينفعش أي أكاونت يتدخل على أكتر من جهازين» — the account sharing gate.
 *
 * Deliberately `better-auth`-free, like `./credential-check.service` and
 * `./login-security.service`: the decision has to be unit-testable, and the
 * two files that DO import Better Auth (`./auth.config.ts`,
 * `./login-security.hook.ts`) take down every Jest spec that loads them.
 *
 * ## What counts as a device, and why not a row
 *
 * `app.session_devices` reads like a device registry and is a SIGN-IN LOG.
 * Measured on the dev cohort (4,554 rows): `revoked_at` is written only by an
 * explicit revoke — never by signing out, never by a session expiring — and
 * `last_seen_at` is written once at creation and never updated again. So
 * `count(*) WHERE revoked_at IS NULL` is "how many times has this person ever
 * logged in", and one student in that database has 459 of them. A limit built
 * on that number refuses the third sign-in of a student's life.
 *
 * Two corrections, and both are needed:
 *
 *   1. JOIN to `app.sessions` and keep only rows whose session has not
 *      expired. This is also the answer to the dead rows already in the table
 *      — they are excluded from the COUNT rather than mass-UPDATEd. A
 *      `SET revoked_at` over 4,500 production rows to make a new feature work
 *      is a write that cannot be undone and cannot be tested first; a WHERE
 *      clause is both.
 *
 *   2. Count DISTINCT `device_name`, not rows. A 90-day session and no
 *      automatic sign-out mean one phone accumulates a session per login; the
 *      name («Chrome على Android») is what stays constant across them. On the
 *      same cohort this collapses the worst case from 459 rows to 2 names,
 *      and 3,752 of 3,761 users have exactly one name.
 *
 * ⚠️ The honest limits of `device_name` as an identity, both of which are in
 * `user-agent.ts`'s output and neither of which this file can fix:
 *
 *   · UNDER-counts — two Android phones in Chrome are one name. Safe: it
 *     admits a student it could have refused.
 *   · OVER-counts — the same phone opened from Chrome and from Facebook's
 *     in-app browser is two names. That one can refuse somebody legitimate,
 *     which is why «أجهزتي» must be able to free a slot (it revokes a whole
 *     name at once, see `SessionDeviceService.revokeOwn`) and why the refusal
 *     carries the instructor's WhatsApp link. Measured: 4 of 3,761 students
 *     have ever had 3+ distinct names.
 *
 * A real device id (a cookie minted before sign-in and stored on the row)
 * would fix both and is the right next step; it needs a migration and a web
 * change, and nothing below assumes the current identity is permanent.
 */

/** «آخره two devices». */
export const MAX_DEVICES_PER_ACCOUNT = 2;

/** The code the web app matches on to render «إنت داخلة على جهازين خلاص». */
export const DEVICE_LIMIT_ERROR = 'DEVICE_LIMIT_REACHED' as const;

export const DEVICE_LIMIT_FLAG = 'sessions.enforceDeviceLimit';

/**
 * The declared default, read from the contract rather than retyped here.
 *
 * The flag has existed with zero readers since it was declared; taking its
 * default from the declaration means turning it on stays a single decision in
 * one file, and a stack that has never seen the row behaves exactly like the
 * admin screen says it does.
 */
export const DEVICE_LIMIT_FLAG_DEFAULT =
  FLAG_DECLARATIONS.find((entry) => entry.key === DEVICE_LIMIT_FLAG)?.defaultValue ?? false;

export interface ActiveDeviceLookup {
  /** Distinct device names for `userId` that still have a live session behind them. */
  activeDeviceNames(userId: string): Promise<string[]>;
}

/**
 * The whole decision, as a pure function.
 *
 * A device already on the list is ALWAYS admitted, even at the limit — the
 * student signing in again from the phone they use every day must never be
 * the one refused. Only a name that is not there yet has to find room.
 */
export function admitsDevice(
  activeNames: readonly string[],
  incomingName: string,
  limit: number = MAX_DEVICES_PER_ACCOUNT,
): boolean {
  const distinct = new Set(activeNames);
  if (distinct.has(incomingName)) return true;
  return distinct.size < limit;
}

export class PrismaActiveDeviceLookup implements ActiveDeviceLookup {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Raw SQL rather than two Prisma calls, because `session_devices.session_id`
   * is deliberately a plain column and not a `@relation` (see its schema
   * comment), so there is no `include` to ask for. The alternative — read
   * every row, then `findMany` the sessions with a 459-element `IN` — is two
   * round trips on the sign-in path to compute a number Postgres can group in
   * one.
   *
   * ⚠️ `now() AT TIME ZONE 'UTC'` and not a bare `now()` — the predicate has
   * to match `SessionDeviceService.listOwn` exactly (what the gate counts must
   * be what the student can see and remove), and a bare `now()` is wrong in
   * both for the same reason: `expires_at` is `timestamp WITHOUT time zone`
   * holding UTC, so comparing it to a `timestamptz` reinterprets it in the
   * server's timezone. The dev database runs `Africa/Cairo`, where that made
   * a session with an hour left read as two hours expired.
   */
  async activeDeviceNames(userId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ device_name: string }[]>`
      SELECT DISTINCT d.device_name
      FROM app.session_devices d
      JOIN app.sessions s ON s.id = d.session_id
      WHERE d.user_id = ${userId}
        AND d.revoked_at IS NULL
        AND s.expires_at > (now() AT TIME ZONE 'UTC')
    `;
    return rows.map((row) => row.device_name);
  }
}

/**
 * A feature flag read from a place that has no Nest container.
 *
 * `auth.config.ts` configures Better Auth at import time, outside the
 * injector, so `FlagsService` is unreachable from it — the same constraint
 * `login-throttle.instance.ts` documents. That leaves a Prisma read, and an
 * uncached one would put an extra query on EVERY session creation, i.e. on
 * every sign-in, sign-up and Google callback.
 *
 * Fails to the last known value, and to the declared default before the first
 * successful read. Both directions of that matter: a gate that refuses
 * sign-ins because a flag read timed out is a worse outage than the sharing
 * it prevents.
 */
export class CachedFlag {
  private value: boolean;
  private readAt: number | null = null;

  constructor(
    private readonly load: () => Promise<boolean>,
    fallback: boolean,
    private readonly ttlMs = 30_000,
    private readonly now: () => number = Date.now,
  ) {
    this.value = fallback;
  }

  async enabled(): Promise<boolean> {
    const now = this.now();
    if (this.readAt !== null && now - this.readAt < this.ttlMs) return this.value;
    try {
      this.value = await this.load();
      this.readAt = now;
    } catch {
      // Keep whatever was last known and retry on the next call rather than
      // pinning the stale value for a full TTL — a flag the instructor has
      // just switched on should not wait on a transient error.
    }
    return this.value;
  }
}

/**
 * The gate itself. One `admits` call answers both enforcement points:
 * `databaseHooks.session.create.before` (which can only refuse) and
 * `createAuthBeforeHook` (which can explain). They MUST ask the same question
 * — a message that does not match the refusal is worse than no message.
 */
export class DeviceLimitGate {
  constructor(
    private readonly flag: CachedFlag,
    private readonly devices: ActiveDeviceLookup,
    private readonly limit: number = MAX_DEVICES_PER_ACCOUNT,
  ) {}

  /**
   * Fails OPEN, on purpose and at every step.
   *
   * This runs inside `databaseHooks.session.create.before`, where the only
   * vocabulary is "allow" or "refuse the session write". A device query that
   * times out would otherwise mean nobody on the stack — not one student, all
   * of them — can sign in, register, or come back from Google, and the
   * message they would get is «Failed to create session». Account sharing for
   * the length of an incident is the cheaper failure by a wide margin.
   */
  async admits(userId: string, userAgent: string | null | undefined): Promise<boolean> {
    try {
      if (!(await this.flag.enabled())) return true;
      const { deviceName } = parseUserAgent(userAgent);
      const activeNames = await this.devices.activeDeviceNames(userId);
      return admitsDevice(activeNames, deviceName, this.limit);
    } catch (error) {
      console.error('device-limit: admitting by default after a failed check', error);
      return true;
    }
  }
}

/** Wiring helper, so `auth.config.ts` states the intent and not the plumbing. */
export function createDeviceLimitGate(prisma: PrismaClient): DeviceLimitGate {
  return new DeviceLimitGate(
    new CachedFlag(async () => {
      const row = await prisma.featureFlag.findUnique({
        where: { key: DEVICE_LIMIT_FLAG },
        select: { enabled: true },
      });
      return row?.enabled ?? DEVICE_LIMIT_FLAG_DEFAULT;
    }, DEVICE_LIMIT_FLAG_DEFAULT),
    new PrismaActiveDeviceLookup(prisma),
  );
}
