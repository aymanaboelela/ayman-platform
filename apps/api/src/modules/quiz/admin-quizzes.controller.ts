import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Put, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import {
  AddPoolDto,
  AddSlotDto,
  QuizSettingsDto,
  ReorderSlotsDto,
  SetSlotMarkDto,
} from './dto/quiz-builder.dto';
import { QuizBuilderService } from './quiz-builder.service';

@Controller('admin/quizzes')
@RequirePermission('quiz:write')
@UsePipes(ZodValidationPipe)
export class AdminQuizzesController {
  constructor(private readonly builder: QuizBuilderService) {}

  // Registered before `:quizId` below so the literal `lesson` segment can
  // never be swallowed as a quiz id.
  @Get('lesson/:lessonId')
  async findByLesson(@Param('lessonId') lessonId: string) {
    const quiz = await this.builder.findByLesson(lessonId);
    if (!quiz) throw new NotFoundException();
    return quiz;
  }

  /**
   * Every route below wraps its result in a plain object. NestJS's Express
   * adapter only calls `response.json()` for an OBJECT return value — a bare
   * string or `void` goes through `response.send(String(body))` instead,
   * which is NOT valid JSON (an unquoted string, or an empty body). Every
   * browser caller here does `await response.json()`, so an unwrapped
   * primitive return silently turned a successful write into a thrown parse
   * error the client reported as "save failed". Wrapping is the fix, not the
   * client swallowing it — the service layer's own return types (exercised
   * directly by `quiz-builder.service.spec.ts`) are untouched.
   */
  @Put('lesson/:lessonId')
  async upsertForLesson(@Param('lessonId') lessonId: string, @Body() body: QuizSettingsDto) {
    return { id: await this.builder.upsertForLesson(lessonId, body) };
  }

  @Get(':quizId')
  getForEdit(@Param('quizId') quizId: string) {
    return this.builder.getForEdit(quizId);
  }

  @Post(':quizId/slots')
  async addSlot(@Param('quizId') quizId: string, @Body() body: AddSlotDto) {
    return { id: await this.builder.addSlot(quizId, body) };
  }

  @Delete(':quizId/slots/:slotId')
  async removeSlot(@Param('quizId') quizId: string, @Param('slotId') slotId: string) {
    await this.builder.removeSlot(quizId, slotId);
    return { ok: true };
  }

  @Patch(':quizId/slots/order')
  async reorderSlots(@Param('quizId') quizId: string, @Body() body: ReorderSlotsDto) {
    await this.builder.reorderSlots(quizId, body.slotIds, body.paper);
    return { ok: true };
  }

  /**
   * MUST stay below `:quizId/slots/order`. Nest matches in declaration order,
   * so a `:slotId` parameter declared first would swallow `/slots/order` with
   * `slotId === 'order'` — the reorder would 404 on a slot that does not
   * exist, and the drag-to-reorder in the builder would silently stop saving.
   */
  @Patch(':quizId/slots/:slotId')
  async setSlotMark(
    @Param('quizId') quizId: string,
    @Param('slotId') slotId: string,
    @Body() body: SetSlotMarkDto,
  ) {
    await this.builder.setSlotMark(quizId, slotId, body.maxMark);
    return { ok: true };
  }

  @Post(':quizId/pools')
  async addPool(@Param('quizId') quizId: string, @Body() body: AddPoolDto) {
    return { id: await this.builder.addPool(quizId, body) };
  }

  @Post(':quizId/publish')
  async publish(@Param('quizId') quizId: string) {
    await this.builder.publish(quizId);
    return { ok: true };
  }
}
