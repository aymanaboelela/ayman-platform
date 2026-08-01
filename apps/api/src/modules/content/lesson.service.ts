import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  LessonCreateInput,
  LessonResourceInput,
  LessonResourceUpdateInput,
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

  /**
   * ⚠️ Deliberately NOT `assertKind`-gated, unlike `setVideo` and `setText`.
   *
   * Resources are not a lesson body — they are the material set that hangs off
   * any lesson, and the common case is precisely a VIDEO lesson carrying the
   * presentation it was taught from plus a few materials. The predecessor
   * `addAttachment` required `kind === 'attachment'`, which is exactly why
   * materials could not be attached to the lessons that most needed them.
   */
  async addResource(lessonId: string, input: LessonResourceInput) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true },
    });
    if (!lesson) throw new NotFoundException();

    const last = await this.prisma.lessonResource.findFirst({
      where: { lessonId },
      orderBy: [{ position: 'desc' }, { id: 'desc' }],
      select: { position: true },
    });

    const resource = await this.prisma.lessonResource.create({
      data: {
        lessonId,
        kind: input.kind,
        title: input.title,
        description: input.description,
        storageKey: input.storageKey,
        filename: input.filename,
        mime: input.mime,
        sizeBytes: input.sizeBytes,
        videoProvider: input.videoProvider,
        videoExternalId: input.videoExternalId,
        linkUrl: input.linkUrl,
        position: last === null ? 0 : last.position + 1,
      },
    });

    await this.audit.record({
      action: 'lesson:update',
      resourceType: AUDIT_RESOURCES.lesson,
      resourceId: lessonId,
      outcome: 'success',
      metadata: { operation: 'addResource', resourceId: resource.id, kind: input.kind },
    });

    return resource;
  }

  /** Title and description only — see `LessonResourceUpdateSchema` for why a
   *  kind change is a delete plus a create rather than a PATCH. */
  async updateResource(id: string, input: LessonResourceUpdateInput) {
    const existing = await this.prisma.lessonResource.findUnique({
      where: { id },
      select: { id: true, lessonId: true },
    });
    if (!existing) throw new NotFoundException();

    const updated = await this.prisma.lessonResource.update({
      where: { id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
      },
    });

    await this.audit.record({
      action: 'lesson:update',
      resourceType: AUDIT_RESOURCES.lesson,
      resourceId: existing.lessonId,
      outcome: 'success',
      metadata: { operation: 'updateResource', resourceId: id, changed: Object.keys(input) },
    });

    return updated;
  }

  async removeResource(id: string): Promise<{ id: string }> {
    const resource = await this.prisma.lessonResource.findUnique({
      where: { id },
      select: { id: true, lessonId: true },
    });
    if (!resource) throw new NotFoundException();

    await this.prisma.lessonResource.delete({ where: { id } });
    await this.audit.record({
      action: 'lesson:update',
      resourceType: AUDIT_RESOURCES.lesson,
      // The LESSON is the audited resource — `id` is the row that went away,
      // and a trail keyed on a deleted row's own id is not navigable.
      resourceId: resource.lessonId,
      outcome: 'success',
      metadata: { operation: 'removeResource', resourceId: id },
    });
    return { id };
  }

  /**
   * Same contract as `reorder` above: the FULL ordered array, and the server
   * verifies the submitted set is exactly this lesson's current set before it
   * rewrites anything. The set check is what stops an array carrying one id
   * from another lesson from revealing, through the row count, that it exists.
   */
  async reorderResources(lessonId: string, orderedIds: string[]): Promise<{ updated: number }> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.lessonResource.findMany({
        where: { lessonId },
        select: { id: true },
      });
      const currentIds = new Set(current.map((row) => row.id));

      if (orderedIds.length !== currentIds.size) {
        throw new BadRequestException(
          'the ordered array must contain every resource of the lesson',
        );
      }
      for (const id of orderedIds) {
        if (!currentIds.has(id)) {
          throw new BadRequestException('the ordered array contains an id from another lesson');
        }
      }

      const updated = await tx.$executeRaw(
        buildReorderSql('lesson_resources', 'lesson_id', lessonId, orderedIds),
      );
      if (updated !== orderedIds.length) {
        throw new BadRequestException('reorder touched an unexpected number of rows');
      }

      await this.audit.record({
        action: 'lesson:reorder',
        resourceType: AUDIT_RESOURCES.lesson,
        resourceId: lessonId,
        outcome: 'success',
        metadata: { operation: 'reorderResources', orderedIds },
      });

      return { updated };
    });
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
