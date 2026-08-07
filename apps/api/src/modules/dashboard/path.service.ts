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
            examLessonId: true,
            // The path draws the same generated artwork the dashboard and the
            // library do, and that is keyed on the subject's name — see
            // `PathCourseSchema.subjectNameAr`. `subject` is a required
            // relation on `Course`, so this needs no null handling.
            subject: { select: { nameAr: true } },
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

      const nodes: PathNode[] = flat.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        kind: lesson.kind as PathNode['kind'],
        state: (stateByLesson.get(lesson.id) ?? 'not_started') as PathNode['state'],
        gate: gate.get(lesson.id) ?? 'locked',
        isExam: lesson.id === enrollment.course.examLessonId,
      }));

      const cleared = nodes.filter((node) => node.gate === 'cleared').length;
      clearedLessons += cleared;
      totalLessons += nodes.length;

      return {
        id: enrollment.course.id,
        slug: enrollment.course.slug,
        title: enrollment.course.title,
        subjectNameAr: enrollment.course.subject.nameAr,
        progressPercent: Number(enrollment.progressPercent),
        clearedLessons: cleared,
        totalLessons: nodes.length,
        // The first thing they can actually open. Null when the course holds
        // nothing available — finished, or entirely locked.
        nextLessonId: nodes.find((node) => node.gate === 'available')?.id ?? null,
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
