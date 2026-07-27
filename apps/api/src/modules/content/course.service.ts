import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CourseCreateInput, CourseUpdateInput, CourseStatus } from '@ayman/contracts/content';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { PrismaService } from '../../prisma/prisma.service';
import type { Course } from '../../generated/prisma/client';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

@Injectable()
export class CourseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * S10-equivalent: re-validate the taxonomy tuple against the DATABASE, not
   * just the Zod schema. A client can submit four syntactically valid UUIDs
   * that name a subject belonging to another system — Zod cannot know that and
   * the foreign keys individually cannot either, because each id exists.
   */
  private async assertOfferingExists(input: {
    systemId: string;
    year: number;
    trackId: string | null;
    subjectId: string;
  }): Promise<void> {
    if (input.year === 1 && input.trackId !== null) {
      throw new BadRequestException('grade 1 courses cannot carry a track');
    }
    const offering = await this.prisma.subjectOffering.findFirst({
      where: {
        systemId: input.systemId,
        year: input.year,
        trackId: input.trackId,
        subjectId: input.subjectId,
      },
      select: { id: true },
    });
    if (!offering) {
      throw new BadRequestException(
        'no subject offering exists for this (system, year, track, subject)',
      );
    }
  }

  async create(actorId: string, input: CourseCreateInput): Promise<Course> {
    await this.assertOfferingExists(input);

    // Named fields only. Never `data: input` — a spread is how a field that was
    // added to the schema for internal use ends up client-writable six months
    // later without anyone noticing.
    try {
      const course = await this.prisma.course.create({
        data: {
          slug: input.slug,
          title: input.title,
          subtitle: input.subtitle,
          description: input.description,
          systemId: input.systemId,
          year: input.year,
          trackId: input.trackId,
          subjectId: input.subjectId,
          coverKey: input.coverKey,
          instructorId: actorId,
          status: 'draft',
        },
      });
      await this.audit.record({
        action: 'course:create',
        resourceType: AUDIT_RESOURCES.course,
        resourceId: course.id,
        outcome: 'success',
        metadata: { slug: course.slug, title: course.title },
      });
      return course;
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('slug already in use');
      throw error;
    }
  }

  async update(id: string, input: CourseUpdateInput): Promise<Course> {
    const current = await this.prisma.course.findUnique({
      where: { id },
      select: { systemId: true, year: true, trackId: true, subjectId: true },
    });
    if (!current) throw new NotFoundException();

    // Any change to the taxonomy tuple re-validates the WHOLE tuple, because
    // changing one component can invalidate a combination that was previously
    // legal.
    const next = {
      systemId: input.systemId ?? current.systemId,
      year: input.year ?? current.year,
      trackId: input.trackId === undefined ? current.trackId : input.trackId,
      subjectId: input.subjectId ?? current.subjectId,
    };
    await this.assertOfferingExists(next);

    try {
      const course = await this.prisma.course.update({
        where: { id },
        // Explicit field list. `status`, `publishedAt`, `instructorId` and
        // `position` are structurally unreachable from here.
        data: {
          ...(input.slug !== undefined && { slug: input.slug }),
          ...(input.title !== undefined && { title: input.title }),
          ...(input.subtitle !== undefined && { subtitle: input.subtitle }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.coverKey !== undefined && { coverKey: input.coverKey }),
          systemId: next.systemId,
          year: next.year,
          trackId: next.trackId,
          subjectId: next.subjectId,
        },
      });
      await this.audit.record({
        action: 'course:update',
        resourceType: AUDIT_RESOURCES.course,
        resourceId: id,
        outcome: 'success',
        metadata: { changed: Object.keys(input) },
      });
      return course;
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('slug already in use');
      throw error;
    }
  }

  /**
   * The only writer of `status`. Publishing an empty course is the most common
   * way a catalog page ships broken, so it is refused here rather than caught
   * in review.
   */
  async setStatus(id: string, status: CourseStatus): Promise<Course> {
    const course = await this.prisma.course.findUnique({
      where: { id },
      select: { id: true, publishedAt: true },
    });
    if (!course) throw new NotFoundException();

    if (status === 'published') {
      const publishedLessons = await this.prisma.lesson.count({
        where: { courseId: id, isPublished: true, section: { isPublished: true } },
      });
      if (publishedLessons === 0) {
        throw new BadRequestException('a course needs at least one published lesson to go live');
      }
    }

    const updated = await this.prisma.course.update({
      where: { id },
      data: {
        status,
        // Set once. `publishedAt` is the course's birthday, not its last
        // deploy — the sitemap's <lastmod> uses updatedAt for that.
        publishedAt: status === 'published' ? (course.publishedAt ?? new Date()) : course.publishedAt,
      },
    });

    await this.audit.record({
      action: status === 'published' ? 'course:publish' : 'course:unpublish',
      resourceType: AUDIT_RESOURCES.course,
      resourceId: id,
      outcome: 'success',
      metadata: { status },
    });

    return updated;
  }

  /**
   * I4 (audit): a course's lessons cascade to quizzes, which cascade to
   * quiz_attempts, which cascade to attempt_events — and attempt_events is
   * append-only (a DB trigger REVOKEs the DELETE/UPDATE outright, even for
   * the table owner). A `course.delete()` against a course with any student
   * attempt therefore always rolled the whole transaction back with a raw
   * Postgres error surfacing as an opaque 500, permanently. That trigger is
   * correct — a student's attempt history is an audit trail, not something a
   * course deletion should ever cascade through — so the fix is here, not
   * there: check for attempts BEFORE Prisma ever issues the cascading
   * DELETE, and refuse with a specific, actionable error instead of letting
   * the DB reject it. `archived` (already a distinct CourseStatus from
   * `draft` — see the enum) is the "right action" this refusal points the
   * admin at: retiring a finished course is a different intent from an
   * instructor unpublishing a work-in-progress back to `draft`, and the
   * catalog (`status: 'published'` exact-match) already excludes both.
   */
  async remove(id: string): Promise<{ id: string }> {
    const course = await this.prisma.course.findUnique({ where: { id }, select: { status: true } });
    if (!course) throw new NotFoundException();

    const attemptCount = await this.prisma.quizAttempt.count({
      where: { quiz: { lesson: { courseId: id } } },
    });
    if (attemptCount > 0) {
      throw new ConflictException({
        code: 'course_has_attempts',
        message: 'this course has student quiz attempts and can never be hard-deleted; archive it instead',
      });
    }

    if (course.status === 'published') {
      throw new BadRequestException('unpublish before deleting');
    }
    await this.prisma.course.delete({ where: { id } });
    await this.audit.record({
      action: 'course:delete',
      resourceType: AUDIT_RESOURCES.course,
      resourceId: id,
      outcome: 'success',
      metadata: null,
    });
    return { id };
  }

  list() {
    return this.prisma.course.findMany({
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        year: true,
        publishedAt: true,
        updatedAt: true,
        system: { select: { nameAr: true } },
        track: { select: { labelAr: true } },
        subject: { select: { nameAr: true } },
        _count: { select: { lessons: true } },
      },
    });
  }

  async findForAdmin(id: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        title: true,
        subtitle: true,
        description: true,
        systemId: true,
        year: true,
        trackId: true,
        subjectId: true,
        coverKey: true,
        status: true,
        publishedAt: true,
        sections: {
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            title: true,
            summary: true,
            position: true,
            isPublished: true,
            lessons: {
              orderBy: [{ position: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                title: true,
                kind: true,
                position: true,
                isPublished: true,
                isFreePreview: true,
                estimatedSeconds: true,
                video: { select: { externalId: true, durationSeconds: true } },
              },
            },
          },
        },
      },
    });
    if (!course) throw new NotFoundException();
    return course;
  }
}
