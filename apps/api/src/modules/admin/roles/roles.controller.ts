import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Put,
  UsePipes,
} from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import {
  GrantableRoleSchema,
  type RoleGrantsRead,
  type UserPermissionsRead,
} from '@ayman/contracts/admin/roles';
import { RequirePermission } from '../../../auth/decorators/require-permission.decorator';
import { PermissionGrantsService } from '../../../auth/permission-grants.service';
import {
  grantablePermissions,
  PERMISSIONS,
  permissionsForRole,
  permissionsForUser,
  type Role,
} from '../../../auth/permissions';
import { PrismaService } from '../../../prisma/prisma.service';
import { currentActor } from '../../../audit/audit-context';
import { RoleGrantsWriteDto, UserPermissionsWriteDto } from './roles.dto';

/**
 * «الصلاحيات» — opening a feature up to the instructor who runs this stack.
 *
 * Both routes require `role:grant`, which only `admin` holds and which
 * `grantablePermissions()` refuses to hand out. That is the loop this screen
 * has to not close: a role that could be given this screen could give itself
 * everything else, and the baseline in `permissions.ts` would be decoration.
 */
@Controller()
@UsePipes(ZodValidationPipe)
export class RolesController {
  constructor(
    private readonly grants: PermissionGrantsService,
    private readonly prisma: PrismaService,
  ) {}

  @RequirePermission('role:read')
  @Get('admin/roles/:role/permissions')
  async read(@Param('role') role: string): Promise<RoleGrantsRead> {
    const parsed = GrantableRoleSchema.safeParse(role);
    if (!parsed.success) throw new BadRequestException(`role "${role}" cannot be granted to`);

    const granted = await this.grants.list(parsed.data);
    const grantedSet = new Set<string>(granted);

    return {
      role: parsed.data,
      // The baseline is what the role holds with NO grants, so the screen can
      // show «this is always on» separately from «you turned this on». It is
      // computed by subtracting the grants rather than read from a second
      // source, which is what keeps the two from disagreeing.
      baseline: permissionsForRole(parsed.data).filter(
        (permission) => !grantedSet.has(permission),
      ),
      granted: [...granted],
      grantable: [...grantablePermissions(parsed.data as Role)],
    };
  }

  @RequirePermission('role:grant')
  @Put('admin/roles/:role/permissions')
  async write(@Param('role') role: string, @Body() body: RoleGrantsWriteDto) {
    const parsed = GrantableRoleSchema.safeParse(role);
    if (!parsed.success) throw new BadRequestException(`role "${role}" cannot be granted to`);

    try {
      const granted = await this.grants.replace(
        parsed.data,
        body.permissions,
        currentActor().actorUserId,
      );
      return { role: parsed.data, granted };
    } catch (error) {
      // The service throws for a permission that is not grantable — a 400,
      // not a 500: the caller sent something wrong and can be told which.
      throw new BadRequestException(error instanceof Error ? error.message : 'invalid grant');
    }
  }

  /**
   * صلاحيات حساب بعينه — «المساعد ده يشوف إيه».
   *
   * `staff:manage` مش `role:grant`: ده بيتكلم عن **فرد** في الفريق، وهي نفس
   * الصلاحية اللي بتضيفه وبتشيله. ولسه مقفولة على `admin` زي أختها، لنفس
   * السبب المكتوب فوق — حد يقدر يوصل للشاشة دي يقدر يفتح على نفسه كل حاجة.
   */
  @RequirePermission('staff:manage')
  @Get('admin/staff/:userId/permissions')
  async readUser(@Param('userId') userId: string): Promise<UserPermissionsRead> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true },
    });
    if (!user) throw new NotFoundException();

    const { allowed, withheld } = await this.grants.listForUser(user.id);

    return {
      userId: user.id,
      name: user.name,
      role: user.role,
      // من نفس الدالة اللي الجارد بيقرا منها — الشاشة مايصحش تحسبها بنفسها.
      effective: [...permissionsForUser(user.id, user.role)],
      baseline: [...permissionsForRole(user.role)],
      allowed,
      withheld,
    };
  }

  @RequirePermission('staff:manage')
  @Put('admin/staff/:userId/permissions')
  async writeUser(@Param('userId') userId: string, @Body() body: UserPermissionsWriteDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user) throw new NotFoundException();

    /*
     * صلاحيات **اللي بيكتب** — الفحص إنه مايفتحش حاجة هو نفسه مش ماسكها.
     *
     * استعلام زيادة، وde مقصود: الرول لوحده مش كفاية. اللي بيكتب ممكن يكون
     * مساعد اتقفل عليه قسم بقرار على حسابه، و`permissionsForUser` هو اللي
     * بيقرا الطبقتين — الرول والقرار اللي عليه.
     */
    const actorUserId = currentActor().actorUserId;
    const actor = actorUserId
      ? await this.prisma.user.findUnique({
          where: { id: actorUserId },
          select: { id: true, role: true },
        })
      : null;
    if (!actor) throw new BadRequestException('مش عارفين مين بيكتب');

    /*
     * ⚠️ مفيش حد يعدّل صلاحيات نفسه — ده قفل على بره مالوش مفتاح.
     *
     * الشاشة بتخبّي الزرار على حسابك («إنت»)، بس الشاشة مش الحارس.
     *
     * والخطورة مش نظرية: على ستاكات المدرّسين التانيين **الحساب الوحيد هو
     * المدرّس نفسه، ورولُه `owner`** (اتقاس — عادل وصبري عندهم حساب واحد
     * لكل واحد). يعني الراوت ده كان بيقبله كهدف، ولو شال `admin:access` عن
     * نفسه بيتقفل بره لوحته — **ومفيش حساب `admin` على الستاكات دي يرجّعه**.
     * الإصلاح الوحيد ساعتها كان هيبقى صف في الداتابيز بالإيد.
     */
    if (actor.id === user.id) {
      throw new BadRequestException('مش هينفع تعدّل صلاحيات حسابك إنت');
    }

    /*
     * ⚠️ وصاحب الستاك نفسه مالوش حد يعدّل عليه — ولا مساعد، ولا مساعد تاني.
     *
     * المشكلة اللي ده بيقفلها: على ستاكات المدرّسين التانيين **المدرّس
     * والمساعد بياخدوا نفس الرول** (`owner`)، والمساعد بياخد `staff:manage`
     * في أساسه. يعني أول مساعد يتضاف يقدر يقفل على المدرّس نفسه —
     * ومفيش حساب `admin` هناك يرجّعه. نفس اللوكاوت اللي فوق، من الباب
     * التاني.
     *
     * والمدرّس هو **أقدم حساب مش-طالب** على الستاك: هو اللي اتعمل وقت
     * التجهيز، وأي مساعد بييجي بعده بالضرورة. مافيش عمود بيقول «ده صاحب
     * المنصة»، وإضافة واحد كانت هتحتاج ميجريشن + قرار مين يملاه على
     * الستاكات الشغالة دلوقتي — والترتيب الزمني بيجاوب نفس السؤال من غير
     * أي صف جديد.
     *
     * والاستعلام مقيّد بالرولز المش-طالب عشان أقدم **طالب** مسجّل
     * (٢٠٢٥) مايتحسبش صاحب الستاك.
     */
    const founder = await this.prisma.user.findFirst({
      where: { role: { not: 'student' } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (founder && founder.id === user.id) {
      throw new BadRequestException('ده حساب صاحب المنصة، وصلاحياته مش بتتقفل');
    }

    /*
     * ⚠️ ومفيش حد يعدّل حساب ماسك حاجة هو مش ماسكها.
     *
     * المساعد `owner` زي المدرّس بالظبط، والفرق قرارات على حسابه. فمساعد
     * متقفل عليه قسم وسايبينله `staff:manage` كان يقدر يقفل على **المدرّس
     * نفسه** — ولو قفل عليه `staff:manage` محدش يرجّعها على ستاك مالوش أدمن.
     * وكان يقدر يفتح لمساعد تاني قسم هو نفسه مقفول عليه، لأن فحص التصعيد في
     * `replaceForUser` بيعدّي أي حاجة في أساس الرول.
     *
     * القاعدة: الهدف صلاحياته كلها جوّه صلاحياتك، والنتيجة كمان جوّه
     * صلاحياتك. الأدمن ماسك كل حاجة، فعنده الشرطين دول دايمًا صح.
     */
    const actorHeld = new Set<string>(permissionsForUser(actor.id, actor.role));
    const outranks = permissionsForUser(user.id, user.role).some((p) => !actorHeld.has(p));
    if (outranks) {
      throw new ForbiddenException('الحساب ده ماسك صلاحيات إنت مش ماسكها');
    }
    // Only catalogue permissions: an unknown string is a malformed request, and
    // `replaceForUser` answers that with its own 400 naming it.
    const catalogue = new Set<string>(PERMISSIONS);
    const beyondActor = body.permissions.filter((p) => catalogue.has(p) && !actorHeld.has(p));
    if (beyondActor.length > 0) {
      throw new ForbiddenException(`مش ماسك الصلاحيات دي عشان تفتحها لحد: ${beyondActor.join(', ')}`);
    }

    try {
      return await this.grants.replaceForUser(
        user.id,
        user.role,
        body.permissions,
        actor.id,
        actorHeld,
      );
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'invalid');
    }
  }
}
