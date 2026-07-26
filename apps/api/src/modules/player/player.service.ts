import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CourseOutline,
  LessonKind,
  LessonPlayer,
  LessonProgressState,
  OutlineSection,
} from '@ayman/contracts';
// A runtime VALUE from a contracts leaf module — must come from the explicit
// subpath export, never the root barrel (hazard H3: Node's native ESM loader
// cannot resolve an extensionless barrel re-export at real runtime, even
// though tests/build stay green). Every other apps/api module follows this
// same rule for `@ayman/contracts/content`, `/catalog`, `/video`.
import { youTubeThumbnailUrl } from '@ayman/contracts/video';
import { PrismaService } from '../../prisma/prisma.service';
import { InjectMediaUrl, type MediaUrlResolver } from '../../common/media/media-url';
import { ACTIVE_ENROLLMENT_STATUSES } from '../enrollment/enrollment.service';
import { LessonAccessService } from '../progress/lesson-access.service';
import { toProgressDto, type ProgressRow } from '../progress/progress.mapper';

interface FlatLesson {
  id: string;
  title: string;
  kind: LessonKind;
}

@Injectable()
export class PlayerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: LessonAccessService,
    @InjectMediaUrl() private readonly media: MediaUrlResolver,
  ) {}

  /**
   * The sidebar payload. Fetched once per course and reused across lesson
   * navigations, which is why it is a separate endpoint from the lesson body:
   * moving between lessons must not refetch the whole structure.
   */
  async outline(userId: string, courseSlug: string): Promise<CourseOutline> {
    const course = await this.prisma.course.findFirst({
      where: {
        slug: courseSlug,
        status: 'published',
        enrollments: { some: { userId, status: { in: [...ACTIVE_ENROLLMENT_STATUSES] } } },
      },
      select: {
        id: true,
        slug: true,
        title: true,
        enrollments: {
          where: { userId, status: { in: [...ACTIVE_ENROLLMENT_STATUSES] } },
          select: { id: true, progressPercent: true, lastLessonId: true },
          take: 1,
        },
        sections: {
          where: { isPublished: true },
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            title: true,
            position: true,
            lessons: {
              where: { isPublished: true },
              orderBy: [{ position: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                title: true,
                kind: true,
                position: true,
                estimatedSeconds: true,
                isFreePreview: true,
              },
            },
          },
        },
      },
    });

    const enrollment = course?.enrollments[0];
    if (!course || !enrollment) {
      throw new NotFoundException('course not found');
    }

    // One extra query rather than a per-lesson subquery: a course has tens of
    // lessons, and fetching the student's whole progress set at once keeps
    // this endpoint at two round trips regardless of course size.
    const progressRows = await this.prisma.lessonProgress.findMany({
      where: { enrollmentId: enrollment.id },
      select: { lessonId: true, state: true, completion: true },
    });
    const progressByLesson = new Map(progressRows.map((row) => [row.lessonId, row]));

    let completedLessons = 0;
    let totalLessons = 0;

    const sections: OutlineSection[] = course.sections.map((section) => ({
      id: section.id,
      title: section.title,
      position: section.position,
      lessons: section.lessons.map((lesson) => {
        const progress = progressByLesson.get(lesson.id);
        const state = (progress?.state ?? 'not_started') as LessonProgressState;
        totalLessons += 1;
        if (state === 'completed' || state === 'passed') completedLessons += 1;

        return {
          id: lesson.id,
          title: lesson.title,
          kind: lesson.kind as LessonKind,
          position: lesson.position,
          estimatedSeconds: lesson.estimatedSeconds,
          isFreePreview: lesson.isFreePreview,
          state,
          completion: Number(progress?.completion ?? 0),
        };
      }),
    }));

    return {
      course: { id: course.id, slug: course.slug, title: course.title },
      sections,
      enrollmentId: enrollment.id,
      progressPercent: Number(enrollment.progressPercent),
      lastLessonId: enrollment.lastLessonId,
      completedLessons,
      totalLessons,
    };
  }

  /**
   * The lesson body plus its neighbours. Ownership comes from
   * `LessonAccessService` first, so the detailed query below never runs for a
   * caller who has no business seeing it.
   */
  async lesson(userId: string, lessonId: string): Promise<LessonPlayer> {
    const context = await this.access.require(userId, lessonId);

    const [lesson, ordered, progress] = await Promise.all([
      this.prisma.lesson.findUniqueOrThrow({
        where: { id: context.lessonId },
        // Explicit select, never include — spec §7 P2. Nothing that is not
        // named here can ever reach a response, including anything the quiz
        // tables will later hang off this model.
        select: {
          id: true,
          title: true,
          kind: true,
          courseId: true,
          estimatedSeconds: true,
          course: { select: { slug: true, title: true } },
          section: { select: { title: true } },
          video: { select: { externalId: true, durationSeconds: true, posterKey: true } },
          text: { select: { bodyHtml: true } },
          attachments: {
            orderBy: [{ position: 'asc' }, { id: 'asc' }],
            select: { id: true, filename: true, mime: true, sizeBytes: true },
          },
        },
      }),
      this.orderedLessons(context.courseId),
      this.prisma.lessonProgress.findUnique({
        where: {
          enrollmentId_lessonId: {
            enrollmentId: context.enrollmentId,
            lessonId: context.lessonId,
          },
        },
        select: {
          lessonId: true,
          state: true,
          completion: true,
          watchedSeconds: true,
          maxPositionSeconds: true,
          openCount: true,
          completedAt: true,
          completedVia: true,
        },
      }),
    ]);

    const index = ordered.findIndex((entry) => entry.id === context.lessonId);
    const duration = lesson.video?.durationSeconds ?? 0;

    return {
      lesson: {
        id: lesson.id,
        courseId: lesson.courseId,
        courseSlug: lesson.course.slug,
        courseTitle: lesson.course.title,
        sectionTitle: lesson.section.title,
        title: lesson.title,
        kind: lesson.kind as LessonKind,
        estimatedSeconds: lesson.estimatedSeconds,
      },
      video: lesson.video
        ? {
            // §7 P3: the 11-char id is what the database holds and what we
            // emit. The embed URL is reconstructed on the client from this id
            // — a stored URL would reintroduce the whole SSRF class.
            youtubeId: lesson.video.externalId,
            durationSeconds: duration,
            posterUrl: lesson.video.posterKey
              ? this.media.resolve(lesson.video.posterKey)
              : // No uploaded poster yet: fall back to YouTube's own thumbnail,
                // built from the id we already hold rather than stored as a
                // URL. `i.ytimg.com` is the one remote host the CSP's
                // `img-src` allows for exactly this reason.
                youTubeThumbnailUrl(lesson.video.externalId),
          }
        : null,
      text: lesson.text ? { bodyHtml: lesson.text.bodyHtml } : null,
      attachments: lesson.attachments.map((attachment) => ({
        id: attachment.id,
        filename: attachment.filename,
        mime: attachment.mime,
        sizeBytes: attachment.sizeBytes,
        // Never the storage URL: the download route re-checks enrollment, so
        // a key that leaks is not by itself an access grant.
        downloadPath: `/api/lessons/${lesson.id}/attachments/${attachment.id}`,
      })),
      progress: progress
        ? toProgressDto(progress as ProgressRow)
        : {
            lessonId: lesson.id,
            state: 'not_started',
            completion: 0,
            watchedSeconds: 0,
            maxPositionSeconds: 0,
            openCount: 0,
            completedAt: null,
            completedVia: null,
          },
      previous: index > 0 ? (ordered[index - 1] ?? null) : null,
      next: index >= 0 && index < ordered.length - 1 ? (ordered[index + 1] ?? null) : null,
      // False when the duration is unknown: the thresholds are ratios, so a
      // zero duration would make them meaningless. The manual button carries
      // such a lesson instead.
      autoCompleteAvailable: lesson.kind === 'video' && duration > 0,
    };
  }

  /**
   * Every published lesson of a course in reading order — section position,
   * then lesson position, then id as a stable tie-break (never index-based
   * keys, never a CSV sequence column).
   */
  private async orderedLessons(courseId: string): Promise<FlatLesson[]> {
    const rows = await this.prisma.lesson.findMany({
      where: { courseId, isPublished: true, section: { isPublished: true } },
      orderBy: [{ section: { position: 'asc' } }, { position: 'asc' }, { id: 'asc' }],
      select: { id: true, title: true, kind: true },
    });
    return rows.map((row) => ({ id: row.id, title: row.title, kind: row.kind as LessonKind }));
  }

  /**
   * Resolves an attachment to its storage URL, but only for a caller who is
   * actually enrolled. This is why attachments are not linked directly: the
   * authorization decision has to happen per request, on our origin.
   */
  async attachmentUrl(userId: string, lessonId: string, attachmentId: string): Promise<string> {
    const context = await this.access.require(userId, lessonId);

    const attachment = await this.prisma.lessonAttachment.findFirst({
      where: { id: attachmentId, lessonId: context.lessonId },
      select: { storageKey: true },
    });
    if (!attachment) {
      throw new NotFoundException('attachment not found');
    }

    return this.media.resolve(attachment.storageKey);
  }
}
