import { Body, Controller, Delete, Param, Patch, Post, Put, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import {
  AddPoolDto,
  AddSlotDto,
  QuizSettingsDto,
  ReorderSlotsDto,
} from './dto/quiz-builder.dto';
import { QuizBuilderService } from './quiz-builder.service';

@Controller('admin/quizzes')
@RequirePermission('quiz:write')
@UsePipes(ZodValidationPipe)
export class AdminQuizzesController {
  constructor(private readonly builder: QuizBuilderService) {}

  @Put('lesson/:lessonId')
  upsertForLesson(@Param('lessonId') lessonId: string, @Body() body: QuizSettingsDto) {
    return this.builder.upsertForLesson(lessonId, body);
  }

  @Post(':quizId/slots')
  addSlot(@Param('quizId') quizId: string, @Body() body: AddSlotDto) {
    return this.builder.addSlot(quizId, body);
  }

  @Delete(':quizId/slots/:slotId')
  removeSlot(@Param('quizId') quizId: string, @Param('slotId') slotId: string) {
    return this.builder.removeSlot(quizId, slotId);
  }

  @Patch(':quizId/slots/order')
  reorderSlots(@Param('quizId') quizId: string, @Body() body: ReorderSlotsDto) {
    return this.builder.reorderSlots(quizId, body.slotIds);
  }

  @Post(':quizId/pools')
  addPool(@Param('quizId') quizId: string, @Body() body: AddPoolDto) {
    return this.builder.addPool(quizId, body);
  }

  @Post(':quizId/publish')
  publish(@Param('quizId') quizId: string) {
    return this.builder.publish(quizId);
  }
}
