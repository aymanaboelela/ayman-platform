import { Body, Controller, Delete, Get, HttpCode, Put, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import type { StudyPlanPayload } from '@ayman/contracts/engagement';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { StudyPlanSettingsDto } from './engagement.dto';
import { PlanService } from './plan.service';

/** «خطة المذاكرة» — `enrollment:read` like the backlog it is built on, behind `studyPlan`. */
@Controller('me/plan')
@RequireFeature('studyPlan')
@RequirePermission('enrollment:read')
export class PlanController {
  constructor(private readonly plan: PlanService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser): Promise<StudyPlanPayload> {
    return this.plan.forUser(user.id);
  }

  @Put()
  @UsePipes(ZodValidationPipe)
  save(@CurrentUser() user: AuthenticatedUser, @Body() dto: StudyPlanSettingsDto): Promise<StudyPlanPayload> {
    return this.plan.save(user.id, dto);
  }

  @Delete()
  @HttpCode(204)
  clear(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.plan.clear(user.id);
  }
}
