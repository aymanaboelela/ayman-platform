import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  LessonAttachmentInput,
  LessonCreateInput,
  LessonTextInput,
  LessonUpdateInput,
} from '@ayman/contracts/content';
import type { LessonVideoInput } from '@ayman/contracts/video';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { sanitizeRichText } from '../../common/sanitize/rich-text';
import { PrismaService } from '../../prisma/prisma.service';
import { buildReorderSql } from './reorder.sql';

@Injectable()
export class LessonService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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

    const lesson = await this.prisma.lesson.create({
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

    await this.audit.record({
      action: 'lesson:create',
      resourceType: AUDIT_RESOURCES.lesson,
      resourceId: lesson.id,
      outcome: 'success',
      metadata: { sectionId, courseId: section.courseId, title: lesson.title },
    });

    return lesson;
  }

  async update(id: string, input: LessonUpdateInput) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id }, select: { id: true } });
    if (!lesson) throw new NotFoundException();
    const updated = await this.prisma.lesson.update({
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

    await this.audit.record({
      action: 'lesson:update',
      resourceType: AUDIT_RESOURCES.lesson,
      resourceId: id,
      outcome: 'success',
      metadata: { changed: Object.keys(input) },
    });

    return updated;
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
    await this.audit.record({
      action: 'lesson:update',
      resourceType: AUDIT_RESOURCES.lesson,
      resourceId: lessonId,
      outcome: 'success',
      metadata: { operation: 'removeVideo' },
    });
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
    await this.audit.record({
      action: 'lesson:update',
      resourceType: AUDIT_RESOURCES.lesson,
      resourceId: id,
      outcome: 'success',
      metadata: { operation: 'removeAttachment' },
    });
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
    await this.audit.record({
      action: 'lesson:delete',
      resourceType: AUDIT_RESOURCES.lesson,
      resourceId: id,
      outcome: 'success',
      metadata: { sectionId: lesson.sectionId },
    });
    return { id };
  }

  /**
   * The client sends the FULL ordered array, debounced. The server verifies the
   * submitted set is exactly the section's current set — no additions, no
   * removals, no ids borrowed from another section — and then rewrites every
   * position in one statement.
   *
   * The set check is what stops the interesting attack: a PATCH whose array
   * contains 39 of this section's lessons plus one from a course the caller
   * cannot see would otherwise silently re-parent nothing but reveal, through
   * the row count, that the foreign id exists.
   */
  async reorder(sectionId: string, orderedIds: string[]): Promise<{ updated: number }> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.lesson.findMany({
        where: { sectionId },
        select: { id: true },
      });
      const currentIds = new Set(current.map((lesson) => lesson.id));

      if (orderedIds.length !== currentIds.size) {
        throw new BadRequestException('the ordered array must contain every lesson in the section');
      }
      for (const id of orderedIds) {
        if (!currentIds.has(id)) {
          throw new BadRequestException('the ordered array contains an id from another section');
        }
      }

      const updated = await tx.$executeRaw(
        buildReorderSql('lessons', 'section_id', sectionId, orderedIds),
      );
      if (updated !== orderedIds.length) {
        // Cannot happen given the set check above — but if it ever does, the
        // transaction rolls back rather than leaving a partial order.
        throw new BadRequestException('reorder touched an unexpected number of rows');
      }

      // Order IS the payload here, which is why `canonicalise` preserves array
      // order: the ids alone would not reconstruct what changed.
      await this.audit.record({
        action: 'lesson:reorder',
        resourceType: AUDIT_RESOURCES.lesson,
        resourceId: sectionId,
        outcome: 'success',
        metadata: { orderedIds },
      });

      return { updated };
    });
  }
}
