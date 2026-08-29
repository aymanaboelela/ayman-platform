import type { Readable } from 'node:stream';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
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
import { MEDIA_STORAGE, type MediaStorage } from '../media/storage/media-storage';
import { ACTIVE_ENROLLMENT_STATUSES } from '../enrollment/enrollment.service';
import { LessonAccessService } from '../progress/lesson-access.service';
import { LessonGateService } from '../progress/lesson-gate.service';
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
    private readonly gate: LessonGateService,
    @InjectMediaUrl() private readonly media: MediaUrlResolver,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
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
        examLessonId: true,
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

    // The SAME resolver the access gate uses, so what the outline draws and
    // what the lesson route enforces cannot disagree. The lock the student
    // sees is a render of this; it is not where the decision is made.
    const gate = await this.gate.resolveCourse(enrollment.id, course.id);

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
          // A lesson missing from the gate map is one the gate did not see —
          // an unpublished section, say. `locked` is the safe default; the
          // outline query and the gate query filter identically, so this is a
          // race guard rather than an expected branch.
          gate: gate.get(lesson.id) ?? 'locked',
          isExam: lesson.id === course.examLessonId,
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
      examLessonId: course.examLessonId,
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
        // named here can ever reach a response — `quiz` below is now named,
        // which is what lets the tables hanging off this model actually
        // surface.
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
          // `Quiz.lessonId` is 1:1 with ANY lesson, not just `kind: 'quiz'` —
          // see `LessonPanel`'s admin-side comment. Selected here so a quiz
          // attached to e.g. a video lesson can be surfaced by the player too;
          // gated on `isPublished` below, same rule `lessonIsReady` uses.
          quiz: { select: { id: true, isPublished: true } },
          resources: {
            orderBy: [{ position: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              kind: true,
              title: true,
              description: true,
              filename: true,
              mime: true,
              sizeBytes: true,
              videoExternalId: true,
              linkUrl: true,
            },
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
      // Draft quizzes stay invisible to students, same gate `lessonIsReady`
      // applies when deciding a `kind: 'quiz'` lesson is publishable.
      quiz: lesson.quiz?.isPublished ? { id: lesson.quiz.id } : null,
      resources: lesson.resources.map((resource) => {
        const isFile = resource.kind === 'presentation' || resource.kind === 'document';
        return {
          id: resource.id,
          kind: resource.kind,
          title: resource.title,
          description: resource.description,
          filename: resource.filename,
          mime: resource.mime,
          sizeBytes: resource.sizeBytes,
          youtubeId: resource.videoExternalId,
          linkUrl: resource.linkUrl,
          // Never the storage URL. `/media/*` is @Public(), so anything gated
          // on enrollment has to come back through a route that re-checks it.
          // Null for video and link — they have no bytes of ours to serve.
          viewPath: isFile ? `/api/lessons/${lesson.id}/resources/${resource.id}/view` : null,
          downloadPath: isFile
            ? `/api/lessons/${lesson.id}/resources/${resource.id}/download`
            : null,
        };
      }),
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
      /*
       * False when the duration is unknown: the thresholds are ratios, so a
       * zero duration would make them meaningless. The manual button carries
       * such a lesson instead.
       *
       * A QUIZ lesson is auto-completable too, and always was — the flag simply
       * never said so. `recordQuizResultTx` stamps `completedAt` with
       * `completedVia: 'auto'` when the attempt grades to a pass, which is the
       * same contract the video thresholds have. Reporting false here told the
       * player the opposite, so a quiz lesson drew «مدة الفيديو مش متسجّلة،
       * فدوس خلّصت الدرس لما تنتهي» — a sentence about a video, on an exam, next
       * to a button that let the student skip the exam entirely (see
       * `completeManually`, which now refuses).
       */
      autoCompleteAvailable: lesson.kind === 'quiz' || (lesson.kind === 'video' && duration > 0),
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
   * Streams a file resource, but only to a caller who is actually enrolled.
   * This is why resources are not linked directly: the authorization decision
   * has to happen per request, on our origin.
   *
   * The gate runs FIRST and storage is only touched after it returns — the
   * spec asserts `getStream` was never called on the rejecting path, because
   * "we checked, then read" and "we read, then checked" are indistinguishable
   * from the outside right up until the check has a bug.
   *
   * Video and link resources 404 here rather than redirecting to their target:
   * a redirect to a third-party URL from an authenticated route is an open
   * redirect wearing a download button.
   */
  async resourceStream(
    userId: string,
    lessonId: string,
    resourceId: string,
  ): Promise<{ stream: Readable; mime: string; filename: string; size: number }> {
    const context = await this.access.require(userId, lessonId);

    // `lessonId: context.lessonId` is what stops a resource id from ANOTHER
    // lesson resolving here — the gate authorized one lesson, and this query
    // is scoped to that same lesson rather than to the id in the URL.
    const resource = await this.prisma.lessonResource.findFirst({
      where: { id: resourceId, lessonId: context.lessonId },
      select: { kind: true, storageKey: true, mime: true, filename: true },
    });
    if (
      !resource ||
      resource.storageKey === null ||
      resource.mime === null ||
      resource.filename === null
    ) {
      throw new NotFoundException('resource not found');
    }

    const info = await this.storage.stat(resource.storageKey);
    if (!info) throw new NotFoundException('resource not found');

    return {
      stream: await this.storage.getStream(resource.storageKey),
      mime: resource.mime,
      filename: resource.filename,
      size: info.size,
    };
  }
}
