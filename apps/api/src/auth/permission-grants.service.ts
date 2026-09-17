import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  grantablePermissions,
  setRuntimeGrants,
  type Permission,
  type Role,
} from './permissions';

/**
 * Keeps `permissions.ts`'s runtime grant table in sync with the database.
 *
 * ## Why a cache at all
 *
 * `roleHasPermission` is synchronous and `AuthGuard` calls it on every
 * authenticated request. Reading a table there would put a database round trip
 * in front of the whole API, and making it async would change all 58
 * controllers' worth of `@RequirePermission`. So the grants are loaded into
 * memory and read from there.
 *
 * ## Why the staleness is acceptable, and where it is not
 *
 * A grant is a decision a person makes a few times a year, not a hot path. A
 * refresh loop of a minute is invisible for opening a feature up.
 *
 * CLOSING one is different — that is the direction where being late matters —
 * so `refresh()` is called synchronously by the write path before it answers,
 * and the caller therefore knows the change has taken effect in THIS process
 * by the time the request returns.
 *
 * ⚠️ In this process. Run more than one API replica and the others are up to
 * `REFRESH_MS` behind. That is written down rather than solved because the
 * platform runs one API container per instructor today
 * (`docs/runbooks/new-tenant.md`); the moment that stops being true this needs
 * a Redis pub/sub invalidation, and a grant closed on one replica while
 * another still honours it is the failure to expect.
 */
@Injectable()
export class PermissionGrantsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PermissionGrantsService.name);

  /**
   * Long enough that this is not a poll loop against the database, short
   * enough that «I opened it and nothing happened» is never a real report.
   */
  private static readonly REFRESH_MS = 60_000;

  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    // Awaited, so the process does not start serving with an empty grant table
    // and briefly 403 an owner who has been granted something. A failure here
    // is logged and NOT rethrown: an API that refuses to boot because one
    // optional table could not be read would take the whole domain down
    // through Traefik, and the baselines alone are a working platform.
    await this.refresh().catch((error: unknown) => {
      this.logger.error(`initial permission-grant load failed: ${String(error)}`);
    });

    this.timer = setInterval(() => {
      void this.refresh().catch((error: unknown) => {
        this.logger.warn(`permission-grant refresh failed: ${String(error)}`);
      });
    }, PermissionGrantsService.REFRESH_MS);
    // Without this a Jest run hangs on an open handle, and more importantly a
    // container ignores SIGTERM for a minute on every deploy.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Reloads every grant and swaps the whole map in one assignment.
   *
   * Wholesale rather than incremental, so a row deleted directly in the
   * database disappears here too — an incremental apply would leave a closed
   * feature open until the next restart, which is the failure nobody would
   * think to look for.
   */
  async refresh(): Promise<void> {
    const rows = await this.prisma.rolePermissionGrant.findMany({
      select: { role: true, permission: true },
    });

    const next = new Map<Role, Set<Permission>>();
    for (const row of rows) {
      const role = row.role as Role;
      let set = next.get(role);
      if (!set) {
        set = new Set<Permission>();
        next.set(role, set);
      }
      set.add(row.permission as Permission);
    }
    setRuntimeGrants(next);
  }

  /** What a role currently holds beyond its baseline, from the database. */
  async list(role: Role): Promise<readonly Permission[]> {
    const rows = await this.prisma.rolePermissionGrant.findMany({
      where: { role },
      select: { permission: true },
      orderBy: { permission: 'asc' },
    });
    return rows.map((row) => row.permission as Permission);
  }

  /**
   * Sets a role's grants to exactly `permissions`, and takes effect at once.
   *
   * Whole-set rather than add/remove, because that is the shape of the screen
   * that drives it — a list of checkboxes and one save — and because a partial
   * update would need the caller to know what is already there, which is the
   * usual way two admins undo each other.
   *
   * Every permission is validated against `grantablePermissions(role)` first,
   * so a request cannot write `role:grant`, cannot write a string that is not
   * in the catalogue, and cannot write a permission the role already holds in
   * its baseline (which would be a row that later reads like a decision).
   */
  async replace(
    role: Role,
    permissions: readonly string[],
    grantedByUserId: string | null,
  ): Promise<readonly Permission[]> {
    const allowed = new Set<string>(grantablePermissions(role));
    const rejected = permissions.filter((permission) => !allowed.has(permission));
    if (rejected.length > 0) {
      throw new Error(`not grantable to ${role}: ${rejected.join(', ')}`);
    }

    const wanted = [...new Set(permissions)] as Permission[];

    await this.prisma.$transaction([
      this.prisma.rolePermissionGrant.deleteMany({
        where: { role, permission: { notIn: wanted.length > 0 ? wanted : ['__none__'] } },
      }),
      ...wanted.map((permission) =>
        this.prisma.rolePermissionGrant.upsert({
          where: { role_permission: { role, permission } },
          // Only the issuer and the timestamp can change on a re-grant, and
          // neither should: re-saving a screen without touching a row must not
          // rewrite who opened it or when.
          update: {},
          create: { role, permission, grantedByUserId },
        }),
      ),
    ]);

    await this.refresh();
    return wanted.sort();
  }
}
