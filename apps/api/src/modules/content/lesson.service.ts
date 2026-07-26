import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  LessonAttachmentInput,
  LessonCreateInput,
  LessonTextInput,
  LessonUpdateInput,
} from '@ayman/contracts/content';
import type { LessonVideoInput } from '@ayman/contracts/video';
import { sanitizeRichText } from '../../common/sanitize/rich-text';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LessonService {
  constructor(private readonly prisma: PrismaService) {}

  async create(sectionId: string, input: LessonCreateInput) {
    // courseId is read from the section, never accepted from the client. The
    // composite FK (lessons_section_matches_course) makes a mismatch impossible
    // at the database level too.
    const section = await this.prisma.courseSection.findUnique({
      where: { id: sectionId },
      select: { id: true, courseId: true },
    });
    if (!section) throw new NotFoundException();

    const last = await this.prisma.lesson.findFirst({
      where: { sectionId },
      orderBy: [{ position: 'desc' }, { id: 'desc' }],
      select: { position: true },
    });

    return this.prisma.lesson.create({
      data: {
        sectionId,
        courseId: section.courseId,
        title: input.title,
        kind: input.kind,
        isPublished: input.isPublished,
        isFreePreview: input.isFreePreview,
        estimatedSeconds: input.estimatedSeconds,
        completionMode: input.completionMode,
        completionMinViewSeconds: input.completionMinViewSeconds,
        completionPassGrade: input.completionPassGrade,
        position: last === null ? 0 : last.position + 1,
      },
    });
  }

  async update(id: string, input: LessonUpdateInput) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id }, select: { id: true } });
    if (!lesson) throw new NotFoundException();
    return this.prisma.lesson.update({
      where: { id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.kind !== undefined && { kind: input.kind }),
        ...(input.isPublished !== undefined && { isPublished: input.isPublished }),
        ...(input.isFreePreview !== undefined && { isFreePreview: input.isFreePreview }),
        ...(input.estimatedSeconds !== undefined && { estimatedSeconds: input.estimatedSeconds }),
        ...(input.completionMode !== undefined && { completionMode: input.completionMode }),
        ...(input.completionMinViewSeconds !== undefined && {
          completionMinViewSeconds: input.completionMinViewSeconds,
        }),
        ...(input.completionPassGrade !== undefined && {
          completionPassGrade: input.completionPassGrade,
        }),
      },
    });
  }

  private async assertKind(lessonId: string, kind: 'video' | 'text' | 'attachment') {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, kind: true },
    });
    if (!lesson) throw new NotFoundException();
    if (lesson.kind !== kind) {
      throw new BadRequestException(`lesson ${lessonId} is a ${lesson.kind} lesson, not ${kind}`);
    }
    return lesson;
  }

  /**
   * `input.externalId` is already an 11-character id — LessonVideoInputSchema
   * transformed the URL away before this method could see it. Nothing here
   * parses, reconstructs, or fetches anything.
   */
  async setVideo(lessonId: string, input: LessonVideoInput) {
    await this.assertKind(lessonId, 'video');
    return this.prisma.lessonVideo.upsert({
      where: { lessonId },
      create: {
        lessonId,
        provider: input.provider,
        externalId: input.externalId,
        durationSeconds: input.durationSeconds,
        posterKey: input.posterKey,
      },
      update: {
        provider: input.provider,
        externalId: input.externalId,
        durationSeconds: input.durationSeconds,
        posterKey: input.posterKey,
      },
    });
  }

  async removeVideo(lessonId: string): Promise<{ lessonId: string }> {
    await this.assertKind(lessonId, 'video');
    await this.prisma.lessonVideo.delete({ where: { lessonId } }).catch(() => undefined);
    return { lessonId };
  }

  /** Sanitized on WRITE. The stored row is safe even if a future renderer is not. */
  async setText(lessonId: string, input: LessonTextInput) {
    await this.assertKind(lessonId, 'text');
    const bodyHtml = sanitizeRichText(input.bodyHtml);
    return this.prisma.lessonText.upsert({
      where: { lessonId },
      create: { lessonId, bodyHtml },
      update: { bodyHtml },
    });
  }

  async addAttachment(lessonId: string, input: LessonAttachmentInput) {
    await this.assertKind(lessonId, 'attachment');
    const last = await this.prisma.lessonAttachment.findFirst({
      where: { lessonId },
      orderBy: [{ position: 'desc' }, { id: 'desc' }],
      select: { position: true },
    });
    return this.prisma.lessonAttachment.create({
      data: {
        lessonId,
        storageKey: input.storageKey,
        filename: input.filename,
        mime: input.mime,
        sizeBytes: input.sizeBytes,
        position: last === null ? 0 : last.position + 1,
      },
    });
  }

  async removeAttachment(id: string): Promise<{ id: string }> {
    const attachment = await this.prisma.lessonAttachment.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!attachment) throw new NotFoundException();
    await this.prisma.lessonAttachment.delete({ where: { id } });
    return { id };
  }

  async remove(id: string): Promise<{ id: string }> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      select: { id: true, sectionId: true, position: true },
    });
    if (!lesson) throw new NotFoundException();

    await this.prisma.$transaction([
      this.prisma.lesson.delete({ where: { id } }),
      this.prisma.lesson.updateMany({
        where: { sectionId: lesson.sectionId, position: { gt: lesson.position } },
        data: { position: { decrement: 1 } },
      }),
    ]);
    return { id };
  }
}
