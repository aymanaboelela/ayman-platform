import { BadRequestException, Body, Controller, Get, Post, Query, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { CardsQuerySchema, type CardReviewResult, type CardsPayload } from '@ayman/contracts/engagement';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { CardsService } from './cards.service';
import { CardReviewDto } from './engagement.dto';

/**
 * «بطاقات المراجعة» — `quiz:read` like «سؤال اليوم», behind `flashCards`.
 *
 * Not `@NoAnswerLeak()`: the back of a flash card is its answer, and the deck
 * is drawn from a bank that already excludes every still-open exam
 * (`CardsService`). The key travels as `keyOptionIds`, the daily card's name.
 */
@Controller('me/cards')
@RequireFeature('flashCards')
@RequirePermission('quiz:read')
export class CardsController {
  constructor(private readonly cards: CardsService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser, @Query('courseId') courseId?: string): Promise<CardsPayload> {
    const query = CardsQuerySchema.safeParse({ courseId });
    if (!query.success) throw new BadRequestException();
    return this.cards.forUser(user.id, query.data.courseId);
  }

  @Post('review')
  @UsePipes(ZodValidationPipe)
  review(@CurrentUser() user: AuthenticatedUser, @Body() dto: CardReviewDto): Promise<CardReviewResult> {
    return this.cards.review(user.id, dto);
  }
}
