import { Injectable } from '@nestjs/common';
import type { LearningPath, PathCourse, PathNode } from '@ayman/contracts/path';
import { PrismaService } from '../../prisma/prisma.service';
import { ACTIVE_ENROLLMENT_STATUSES } from '../enrollment/enrollment.service';
import { LessonGateService } from '../progress/lesson-gate.service';

/**
 * The learning-path read model: every enrolled course as an ordered run of
 * nodes, each carrying the lock state the routes actually enforce.
 *
 * It resolves the gate through `LessonGateService` — the same resolver
 * `LessonAccessService.require` consults — rather than re-deriving locks for
 * display. A map that computed its own locks would eventually disagree with
 * the routes, and the student would see an open door that 404s.
 */
@Injectable()
export class PathService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gate: LessonGateService,
  ) {}

  async forUser(userId: string): Promise<LearningPath> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId, status: { in: [...ACTIVE_ENROLLMENT_STATUSES] } },
      orderBy: [{ enrolledAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        progressPercent: true,
        course: {
          select: {
            id: true,
            slug: true,
            title: true,
            /*
             * Selected, NOT filtered on — and that is the whole decision.
             *
             * An instructor unpublishing a course to edit it does not
             * un-enrol anybody, so this query has always returned it. What it
             * did not do was SAY so, which left the map drawing a run of
             * pressable stops that every one 404'd: `LessonAccessService`
             * refuses an unpublished course, the lesson page redirects to
             * `/library/:slug`, and the catalog — published-only — answers
             * `notFound()`.
             *
             * A `where: { course: { status: 'published' } }` here would have
             * been one line and the wrong fix: the course would vanish off the
             * student's own path mid-term with no explanation. It ships with a
             * flag instead and the UI says «مقفول مؤقتاً».
             */
            status: true,
            examLessonId: true,
            // The path draws the same generated artwork the dashboard and the
            // library do, and that is keyed on the subject's name — see
            // `PathCourseSchema.subjectNameAr`. `subject` is a required
            // relation on `Course`, so this needs no null handling.
            subject: { select: { nameAr: true } },
            // The instructor's own artwork, which beats the generated scene
            // wherever it exists. Nullable: most courses have none.
            coverKey: true,
            sections: {
              where: { isPublished: true },
              orderBy: [{ position: 'asc' }, { id: 'asc' }],
              select: {
                lessons: {
                  where: { isPublished: true },
                  orderBy: [{ position: 'asc' }, { id: 'asc' }],
                  select: { id: true, title: true, kind: true },
                },
              },
            },
          },
        },
      },
    });

    // One gate resolution per course, in parallel — not one per lesson.
    const gates = await Promise.all(
      enrollments.map((enrollment) =>
        this.gate.resolveCourse(enrollment.id, enrollment.course.id),
      ),
    );

    const progressRows = await this.prisma.lessonProgress.findMany({
      where: { enrollmentId: { in: enrollments.map((enrollment) => enrollment.id) } },
      select: { lessonId: true, state: true },
    });
    const stateByLesson = new Map(progressRows.map((row) => [row.lessonId, row.state as string]));

    let clearedLessons = 0;
    let totalLessons = 0;

    const courses: PathCourse[] = enrollments.map((enrollment, index) => {
      const gate = gates[index]!;
      // The run is the whole course flattened in reading order — the same
      // shape the gate itself walks. Sections are chapter headings over one
      // sequence, so the map draws one column, not one per section.
      const flat = enrollment.course.sections.flatMap((section) => section.lessons);

      // `archived` counts as closed too: only a genuinely published course is
      // openable, and everything else on this screen has to agree with the
      // routes that enforce it.
      const published = enrollment.course.status === 'published';

      const nodes: PathNode[] = flat.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        kind: lesson.kind as PathNode['kind'],
        state: (stateByLesson.get(lesson.id) ?? 'not_started') as PathNode['state'],
        gate: gate.get(lesson.id) ?? 'locked',
        isExam: lesson.id === enrollment.course.examLessonId,
      }));

      /**
       * Counted over LECTURES, matching `CourseProgressService.recalculate` and
       * the catalog's `lessonCount`. `nodes` still carries the quizzes — the
       * outline needs them to draw each lecture's quiz beneath it — but a quiz
       * is not a step on the path, and counting it made «٢ / ٥» sit next to a
       * percentage computed out of three.
       */
      const lectures = nodes.filter((node) => node.kind !== 'quiz');
      const cleared = lectures.filter((node) => node.gate === 'cleared').length;
      clearedLessons += cleared;
      totalLessons += lectures.length;

      return {
        id: enrollment.course.id,
        slug: enrollment.course.slug,
        title: enrollment.course.title,
        subjectNameAr: enrollment.course.subject.nameAr,
        coverKey: enrollment.course.coverKey,
        published,
        progressPercent: Number(enrollment.progressPercent),
        clearedLessons: cleared,
        totalLessons: lectures.length,
        // The first thing they can actually open. Null when the course holds
        // nothing available — finished, or entirely locked.
        // Still resolved over ALL nodes: «كمّل» should land on the quiz that
        // is open right now if that is genuinely the next thing, not skip past
        // it to the following lecture.
        //
        // And null outright while the course is unpublished. `nextLessonId` is
        // what «نكمّل» links to and what `currentCourseId` is derived from, so
        // leaving it set would keep offering a resume button into the 404 this
        // change exists to remove — and would open the map on a course nobody
        // can enter.
        nextLessonId: published
          ? (nodes.find((node) => node.gate === 'available')?.id ?? null)
          : null,
        nodes,
      };
    });

    return {
      courses,
      currentCourseId: courses.find((course) => course.nextLessonId !== null)?.id ?? null,
      clearedLessons,
      totalLessons,
      percent: totalLessons === 0 ? 0 : Math.round((clearedLessons / totalLessons) * 100),
    };
  }
}
