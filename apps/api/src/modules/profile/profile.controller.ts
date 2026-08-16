import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
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
import { OnboardingDto, StudentSectionDto } from './onboarding.dto';
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
   * The student changing their academic section — «غيّر صفّك ومسارك».
   *
   * Same `profile:write` permission and the same session-only `userId` as
   * onboarding above, for the same S11 reason: nothing in the body can name a
   * user. `StudentSectionDto` is `.strict()` and carries only the four section
   * fields, so this route physically cannot write a name, a phone or
   * `onboardingCompletedAt` however the payload is shaped.
   */
  @RequirePermission('profile:write')
  @Patch('section')
  @UsePipes(ZodValidationPipe)
  section(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: StudentSectionDto,
  ): Promise<StudentProfile> {
    return this.profile.updateSection(user.id, body);
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

  /**
   * «ضغطت على لينك الواتساب» — so «رسايل م. أيمن» stops asking.
   *
   * ## Why this route exists at all
   *
   * The channel invitation is the one message the platform sends about nothing
   * the student did, and until now it had no way to tell someone who had
   * already gone from someone who never will. Everyone got asked again on the
   * same schedule — including the student who subscribed the first time, who is
   * then being nagged by a teacher who is not paying attention. This is the
   * only signal that exists: WhatsApp tells us nothing about who subscribed.
   *
   * ## 204 and idempotent, with no body either way
   *
   * The caller is a click handler racing a navigation to WhatsApp, so it must
   * not need a response and must not fail visibly. `ProfileService` writes only
   * when the column is still null, so a student who taps the card twice a week
   * for a term produces one row-touch and then nothing.
   *
   * ## `profile:write`, not a permission of its own
   *
   * It writes one column of the caller's OWN profile, taken from the session —
   * which is exactly what that permission already means here. A new
   * `whatsapp:track` would be a permission nobody could ever hold differently.
   */
  @RequirePermission('profile:write')
  @Post('whatsapp-opened')
  @HttpCode(204)
  async whatsappOpened(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.profile.markWhatsappOpened(user.id);
  }
}
