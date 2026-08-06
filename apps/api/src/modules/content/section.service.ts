import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { SectionCreateInput, SectionUpdateInput } from '@ayman/contracts/content';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { buildReorderSql } from './reorder.sql';

@Injectable()
export class SectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Appends. Positions are contiguous from 0 and only the reorder endpoint rewrites them. */
  async create(courseId: string, input: SectionCreateInput) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
    if (!course) throw new NotFoundException();

    const last = await this.prisma.courseSection.findFirst({
      where: { courseId },
      orderBy: [{ position: 'desc' }, { id: 'desc' }],
      select: { position: true },
    });

    const section = await this.prisma.courseSection.create({
      data: {
        courseId,
        title: input.title,
        summary: input.summary,
        isPublished: input.isPublished,
        position: last === null ? 0 : last.position + 1,
      },
    });

    // AUDIT_ACTIONS carries `section:update` and `section:reorder` only —
    // there is no `section:create` or `section:delete` in the closed list, so
    // the operation is carried in `metadata` rather than by inventing an
    // action nothing else knows about.
    await this.audit.record({
      action: 'section:update',
      resourceType: AUDIT_RESOURCES.courseSection,
      resourceId: section.id,
      outcome: 'success',
      metadata: { operation: 'create', courseId, title: section.title },
    });

    return section;
  }

  async update(id: string, input: SectionUpdateInput) {
    const section = await this.prisma.courseSection.findUnique({ where: { id }, select: { id: true } });
    if (!section) throw new NotFoundException();
    const updated = await this.prisma.courseSection.update({
      where: { id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.summary !== undefined && { summary: input.summary }),
        ...(input.isPublished !== undefined && { isPublished: input.isPublished }),
      },
    });

    await this.audit.record({
      action: 'section:update',
      resourceType: AUDIT_RESOURCES.courseSection,
      resourceId: id,
      outcome: 'success',
      metadata: { operation: 'update', changed: Object.keys(input) },
    });

    return updated;
  }

  /**
   * Deleting closes the gap in the same transaction. Leaving holes "because the
   * order still reads correctly" is how a section ends up at position 47 with
   * six siblings, and every later reorder diff becomes unreadable.
   */
  async remove(id: string): Promise<{ id: string }> {
    const section = await this.prisma.courseSection.findUnique({
      where: { id },
      select: { id: true, courseId: true, position: true },
    });
    if (!section) throw new NotFoundException();

    // One cascade further out than the lesson guard: section → lessons →
    // quizzes → attempts. Same permanent refusal, and see `LessonService.remove`
    // for the two ways the unguarded delete failed — a 500 when the attempt had
    // events, silent destruction of the attempt when it did not.
    const attemptCount = await this.prisma.quizAttempt.count({
      where: { quiz: { lesson: { sectionId: id } } },
    });
    if (attemptCount > 0) {
      throw new ConflictException({
        code: 'section_has_attempts',
        message:
          'this section holds a lesson with student quiz attempts and can never be hard-deleted; unpublish it instead',
      });
    }

    await this.prisma.$transaction([
      this.prisma.courseSection.delete({ where: { id } }),
      this.prisma.courseSection.updateMany({
        where: { courseId: section.courseId, position: { gt: section.position } },
        data: { position: { decrement: 1 } },
      }),
    ]);

    await this.audit.record({
      action: 'section:update',
      resourceType: AUDIT_RESOURCES.courseSection,
      resourceId: id,
      outcome: 'success',
      metadata: { operation: 'delete', courseId: section.courseId },
    });

    return { id };
  }

  /** Mirrors LessonService.reorder — see that method's comment for the threat model. */
  async reorder(courseId: string, orderedIds: string[]): Promise<{ updated: number }> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.courseSection.findMany({
        where: { courseId },
        select: { id: true },
      });
      const currentIds = new Set(current.map((section) => section.id));

      if (orderedIds.length !== currentIds.size) {
        throw new BadRequestException('the ordered array must contain every section in the course');
      }
      for (const id of orderedIds) {
        if (!currentIds.has(id)) {
          throw new BadRequestException('the ordered array contains an id from another course');
        }
      }

      const updated = await tx.$executeRaw(
        buildReorderSql('course_sections', 'course_id', courseId, orderedIds),
      );
      if (updated !== orderedIds.length) {
        throw new BadRequestException('reorder touched an unexpected number of rows');
      }

      // Order IS the payload here, which is why `canonicalise` preserves array
      // order: the ids alone would not reconstruct what changed.
      await this.audit.record({
        action: 'section:reorder',
        resourceType: AUDIT_RESOURCES.courseSection,
        resourceId: courseId,
        outcome: 'success',
        metadata: { orderedIds },
      });

      return { updated };
    });
  }
}
