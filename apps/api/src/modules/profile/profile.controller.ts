import { Body, Controller, Get, Patch, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
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
}
