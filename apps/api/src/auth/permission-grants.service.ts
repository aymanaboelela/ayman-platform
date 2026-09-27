import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  grantablePermissions,
  PERMISSIONS,
  permissionsForRole,
  setRuntimeGrants,
  setUserPermissionOverrides,
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
    await this.refreshUserOverrides();
  }

  /**
   * القفل والفتح لكل حساب، في نفس دورة التحديث.
   *
   * الجدول ده صغير بطبعه: صفوفه بتتكتب لحسابات الفريق بس، وهُمّ أفراد
   * معدودين — فقرايته كلها مرة واحدة أرخص من فهرسة أي حاجة.
   *
   * ⚠️ ومش في نفس الاستعلام مع المنح فوق عن قصد: لو القراية دي فشلت، المنح
   * اللي اتحمّلت خلاص تفضل مكانها بدل ما الاتنين يرجعوا فاضيين. وفاضي هنا
   * معناه «مفيش قفل» — يعني المساعد بيشوف أكتر، مش أقل.
   */
  private async refreshUserOverrides(): Promise<void> {
    const rows = await this.prisma.userPermissionOverride.findMany({
      select: { userId: true, permission: true, allow: true },
    });

    const next = new Map<string, { allow: Set<string>; deny: Set<string> }>();
    for (const row of rows) {
      let entry = next.get(row.userId);
      if (!entry) {
        entry = { allow: new Set<string>(), deny: new Set<string>() };
        next.set(row.userId, entry);
      }
      (row.allow ? entry.allow : entry.deny).add(row.permission);
    }
    setUserPermissionOverrides(next);
  }

  /**
   * قرارات الصلاحيات المكتوبة على حساب بعينه.
   *
   * بيرجّع الاتنين منفصلين لأن الشاشة محتاجة تفرّق: «ده مفتوح لأن الرول
   * بيديهوله» غير «ده مفتوح لأنك فتحته».
   */
  async listForUser(userId: string): Promise<{ allowed: string[]; withheld: string[] }> {
    const rows = await this.prisma.userPermissionOverride.findMany({
      where: { userId },
      select: { permission: true, allow: true },
      orderBy: { permission: 'asc' },
    });
    return {
      allowed: rows.filter((row) => row.allow).map((row) => row.permission),
      withheld: rows.filter((row) => !row.allow).map((row) => row.permission),
    };
  }

  /**
   * بيخلّي الحساب يملك **بالظبط** `permissions`، وبيسري في نفس اللحظة.
   *
   * ## الفرق عن الأساس هو اللي بيتكتب
   *
   * الشاشة بتبعت الحالة النهائية، والسيرفر بيقارنها بأساس الرول:
   *
   *   في الطلب ومش في الأساس  →  صف «افتح»
   *   في الأساس ومش في الطلب  →  صف «اقفل»
   *   الاتنين متفقين            →  مفيش صف
   *
   * والصف اللي بيتفق مع الأساس بيتشال، مش بيتكتب: صف بيقول «افتح» لحاجة
   * مفتوحة أصلًا بيتقرا بعد شهر كأن حد اتخد قرار، وهو مجرد ضوضاء.
   *
   * ## الكتابة كلها في ترانزاكشن واحدة
   *
   * نص القرارات اتكتبت ونص لأ = مساعد بصلاحيات محدش اختارها. والتحديث
   * بيتنده **بعد** الترانزاكشن وقبل ما الرد يرجع، فاللي دوس «حفظ» يعرف إن
   * القرار سرى في العملية دي.
   *
   * ⚠️ `admin` مرفوض من هنا: `userHasPermission` بيرجّع `true` قبل ما يبص
   * على الجدول أصلًا، فصف عليه بيكون كذب صامت — الشاشة تقول «مقفول» والقفل
   * مالوش أثر.
   */
  async replaceForUser(
    userId: string,
    role: string,
    permissions: readonly string[],
    actorUserId: string | null,
  ): Promise<{ allowed: string[]; withheld: string[] }> {
    if (role === 'admin') {
      throw new Error('حساب الأدمن بياخد كل الصلاحيات، والقفل عليه مالوش أثر');
    }
    /*
     * ⚠️ حسابات الفريق بس.
     *
     * الشاشة دي بتتكلم عن مساعد، وصلاحيات الطالب بتيجي من روله — مفيش سبب
     * مشروع تتعدّل بالإيد من هنا.
     *
     * واللي كشف ده تست: صف في مصفوفة الصلاحيات كتب `permissions: []` على
     * حساب طالب، فاتكتبله صف «اقفل» لكل حاجة في أساس الطالب — وبعدها إحدى
     * عشر تست تانية وقعت بـ403، لأن الطالب اتسحبت منه كل صلاحياته. على
     * البرودكشن ده كان هيبقى طالب مقفول عليه حسابه من غير أي شاشة تقول ليه.
     */
    if (role !== 'owner') {
      throw new Error('الصلاحيات دي بتتظبط لحسابات الفريق بس');
    }

    const known = new Set<string>(PERMISSIONS);
    const unknown = permissions.filter((permission) => !known.has(permission));
    if (unknown.length > 0) {
      throw new Error(`صلاحيات مش في الكتالوج: ${unknown.join(', ')}`);
    }

    const wanted = new Set(permissions);
    const baseline = new Set<string>(permissionsForRole(role));

    const rows = PERMISSIONS.filter(
      (permission) => wanted.has(permission) !== baseline.has(permission),
    ).map((permission) => ({
      userId,
      permission,
      allow: wanted.has(permission),
      setByUserId: actorUserId,
    }));

    await this.prisma.$transaction([
      this.prisma.userPermissionOverride.deleteMany({ where: { userId } }),
      ...(rows.length > 0
        ? [this.prisma.userPermissionOverride.createMany({ data: rows })]
        : []),
    ]);

    await this.refresh();
    return this.listForUser(userId);
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
