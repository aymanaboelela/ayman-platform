import { Body, Controller, Get, HttpCode, Patch, Post, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import type { AdminChangePasswordResult, AdminProfile } from '@ayman/contracts/admin/profile';
import { CurrentUser, type AuthenticatedUser } from '../../../auth/decorators/current-user.decorator';
import {
  CurrentSession,
  type AuthenticatedSession,
} from '../../../auth/decorators/current-session.decorator';
import { RequirePermission } from '../../../auth/decorators/require-permission.decorator';
import { AdminProfileService } from './admin-profile.service';
import { AdminChangePasswordDto, AdminUpdateProfileDto } from './dto/admin-profile.dto';

@Controller('admin/profile')
export class AdminProfileController {
  constructor(private readonly profileService: AdminProfileService) {}

  @Get()
  @RequirePermission('admin:access')
  getProfile(@CurrentUser() user: AuthenticatedUser): Promise<AdminProfile> {
    return this.profileService.getProfile(user.id);
  }

  @Patch()
  @RequirePermission('admin:access')
  @UsePipes(ZodValidationPipe)
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: AdminUpdateProfileDto,
  ): Promise<AdminProfile> {
    return this.profileService.updateProfile(user.id, body);
  }

  @Post('change-password')
  @HttpCode(200)
  @RequirePermission('admin:access')
  @UsePipes(ZodValidationPipe)
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSession() session: AuthenticatedSession,
    @Body() body: AdminChangePasswordDto,
  ): Promise<AdminChangePasswordResult> {
    return this.profileService.changePassword(user.id, session?.id, body);
  }
}
