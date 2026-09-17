import { BadRequestException, Body, Controller, Get, Param, Put, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { GrantableRoleSchema, type RoleGrantsRead } from '@ayman/contracts/admin/roles';
import { RequirePermission } from '../../../auth/decorators/require-permission.decorator';
import { PermissionGrantsService } from '../../../auth/permission-grants.service';
import { grantablePermissions, permissionsForRole, type Role } from '../../../auth/permissions';
import { currentActor } from '../../../audit/audit-context';
import { RoleGrantsWriteDto } from './roles.dto';

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
  constructor(private readonly grants: PermissionGrantsService) {}

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
}
