import { Controller, Get, NotFoundException, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import type { CentersList, MyCenterBooking } from '@ayman/contracts/centers';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { CentersService } from './centers.service';

/**
 * «السناتر» for a signed-in student: what can be booked, and what they booked.
 * The booking itself is written through the profile save
 * (`PATCH /api/profile/onboarding`), so the question and the answer land in
 * one transaction.
 */
@Controller()
@UsePipes(ZodValidationPipe)
export class CentersController {
  constructor(
    private readonly centers: CentersService,
    private readonly prisma: PrismaService,
  ) {}

  /** Slots for the student's own year (plus the all-years ones). Before a
   *  year is chosen — mid-onboarding — every slot. */
  @RequirePermission('profile:read')
  @Get('centers')
  async list(@CurrentUser() user: AuthenticatedUser): Promise<CentersList> {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId: user.id },
      select: { year: true },
    });
    return this.centers.listPublic(profile?.year ?? null);
  }

  @RequirePermission('profile:read')
  @Get('me/center-booking')
  async mine(@CurrentUser() user: AuthenticatedUser): Promise<MyCenterBooking> {
    try {
      return await this.centers.myBooking(user.id);
    } catch (error) {
      if (error instanceof NotFoundException) throw new NotFoundException('no profile yet');
      throw error;
    }
  }
}
