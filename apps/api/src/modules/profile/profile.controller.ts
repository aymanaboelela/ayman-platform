import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ZodValidationPipe } from 'nestjs-zod';
import { MAX_AVATAR_BYTES } from '@ayman/contracts/admin/media';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { OnboardingDto } from './onboarding.dto';
import { ProfileService, type ProfileMeResponse } from './profile.service';
import type { StudentProfile } from '../../generated/prisma/client';

@Controller('profile')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @RequirePermission('profile:read')
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<ProfileMeResponse> {
    return this.profile.getMe(user.id);
  }

  /**
   * S11: `userId` is deliberately never read from the request body — it
   * comes only from the authenticated session, so a student physically
   * cannot write another user's profile no matter what the payload claims.
   * `OnboardingDto` additionally rejects (not strips) any unrecognized key —
   * see that file's comment.
   */
  @RequirePermission('profile:write')
  @Patch('onboarding')
  @UsePipes(ZodValidationPipe)
  onboarding(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: OnboardingDto,
  ): Promise<StudentProfile> {
    return this.profile.completeOnboarding(user.id, body);
  }

  /**
   * The student's own profile photo.
   *
   * `profile:write` — the permission they already hold to write their own
   * profile — and NOT `media:write`, which is staff-only and would have to be
   * granted to every student on the platform to make this work. The user id
   * comes from the session and is never read from the request, so a student
   * physically cannot set someone else's photo.
   *
   * `limits.fileSize` is multer refusing the body before it is fully buffered
   * in memory; `MediaService.uploadAvatar` checks the same ceiling again on
   * the buffer it receives. Two checks because they fail at different layers:
   * this one stops the allocation, that one is the rule.
   */
  @RequirePermission('profile:write')
  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
    }),
  )
  avatar(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: { originalname: string; buffer: Buffer; size: number },
  ): Promise<{ image: string }> {
    if (!file) throw new BadRequestException('no file uploaded');
    return this.profile.setAvatar(user.id, file);
  }
}
