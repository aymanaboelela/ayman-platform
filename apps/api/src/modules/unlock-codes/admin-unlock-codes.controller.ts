import { Body, Controller, Delete, Get, Param, Post, Query, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import type {
  AdminUnlockCodeCreateResponse,
  AdminUnlockCodeList,
  AdminUnlockCodeRow,
  AdminUnlockCourseOption,
  AdminUnlockCourseTree,
} from '@ayman/contracts/admin/unlock-codes';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { RequireCsrf } from '../security/require-csrf.decorator';
import { AdminUnlockCodeCreateDto, AdminUnlockCodeQueryDto } from './unlock-codes.dto';
import { UnlockCodesService } from './unlock-codes.service';

/**
 * «أكواد الفتح» — the admin screen's API.
 *
 * On `payment:*` and not a permission of its own: a code IS a sale — somebody
 * paid on WhatsApp and this is how what they paid for gets opened — so the
 * people who may approve a Vodafone screenshot are the people who may issue
 * one, and the people who may read the payments list may read this one.
 *
 * ⚠️ The literal routes (`courses`, `courses/:courseId/tree`) are declared
 * before `:id` so no future `@Get(':id')` can swallow them.
 */
@Controller('admin/unlock-codes')
@UsePipes(ZodValidationPipe)
export class AdminUnlockCodesController {
  constructor(private readonly codes: UnlockCodesService) {}

  @RequirePermission('payment:read')
  @Get('courses')
  courses(): Promise<{ items: AdminUnlockCourseOption[] }> {
    return this.codes.courseOptions();
  }

  @RequirePermission('payment:read')
  @Get('courses/:courseId/tree')
  tree(@Param('courseId') courseId: string): Promise<AdminUnlockCourseTree> {
    return this.codes.courseTree(courseId);
  }

  @RequirePermission('payment:read')
  @Get()
  list(@Query() query: AdminUnlockCodeQueryDto): Promise<AdminUnlockCodeList> {
    return this.codes.list(query);
  }

  @RequirePermission('payment:review')
  @RequireCsrf()
  @Post()
  create(
    @Body() body: AdminUnlockCodeCreateDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminUnlockCodeCreateResponse> {
    return this.codes.create(user.id, body);
  }

  @RequirePermission('payment:review')
  @RequireCsrf()
  @Post(':id/revoke')
  revoke(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<AdminUnlockCodeRow> {
    return this.codes.revoke(user.id, id);
  }

  @RequirePermission('payment:review')
  @RequireCsrf()
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<{ ok: true }> {
    return this.codes.remove(user.id, id);
  }
}
