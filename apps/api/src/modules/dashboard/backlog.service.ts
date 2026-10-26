import { Injectable } from '@nestjs/common';
import type { BacklogCourse, BacklogItem, StudentBacklog } from '@ayman/contracts/backlog';
import type { PathNode } from '@ayman/contracts/path';
import { PrismaService } from '../../prisma/prisma.service';
import { PathService } from './path.service';

/** A quiz that can still be sat. `failed` is not here: a quiz is one sitting
 *  (see `gate-rule.ts`), so a failed one is history, not backlog. */
const OPEN_QUIZ_STATES: ReadonlySet<string> = new Set(['not_started', 'in_progress']);

function itemStatus(node: PathNode): BacklogItem['status'] {
  return node.state === 'in_progress' ? 'in_progress' : 'not_started';
}

/**
 * «المتراكم عليّا» — see `StudentBacklogSchema`.
 *
 * Built ON TOP of `PathService.forUser` rather than beside it, so the gate,
 * the month ownership, the unpublished-course rule and the monthly-exam shelf
 * exclusion are all decided exactly once. The only thing added here is the
 * homework, which the path does not carry.
 */
@Injectable()
export class BacklogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly path: PathService,
  ) {}

  async forUser(userId: string): Promise<StudentBacklog> {
    const path = await this.path.forUser(userId);
    // An unpublished course is «مقفول مؤقتاً» on the path and every lesson in
    // it 404s — listing its lectures as owed would be a to-do list of doors
    // that do not open.
    const courses = path.courses.filter((course) => course.published);

    // Homework hangs off a LESSON (never a quiz stop), and only one the
    // student can open. `node.id === node.lessonId` is what tells a lesson's
    // own stop from an attached quiz's.
    const openLessonIds = courses.flatMap((course) =>
      course.nodes.filter((node) => node.id === node.lessonId && node.gate !== 'locked').map((node) => node.id),
    );

    const [homework, submissions] =
      openLessonIds.length === 0
        ? [[], []]
        : await Promise.all([
            this.prisma.lessonHomework.findMany({
              where: { lessonId: { in: openLessonIds }, isPublished: true },
              select: { lessonId: true },
            }),
            this.prisma.homeworkSubmission.findMany({
              where: { userId, lessonId: { in: openLessonIds } },
              select: { lessonId: true, status: true },
            }),
          ]);
    const hasHomework = new Set(homework.map((row) => row.lessonId));
    const submissionByLesson = new Map(submissions.map((row) => [row.lessonId, row.status as string]));

    let awaitingReview = 0;
    const counts = { lectures: 0, quizzes: 0, homework: 0 };

    const result: BacklogCourse[] = courses.flatMap((course) => {
      const items: BacklogItem[] = [];
      const base = { courseId: course.id, courseSlug: course.slug, courseTitle: course.title };

      for (const node of course.nodes) {
        const isLessonStop = node.id === node.lessonId;

        if (node.isExam) {
          if (node.gate === 'available' && OPEN_QUIZ_STATES.has(node.state)) {
            items.push({ ...base, id: node.id, kind: 'exam', lessonId: node.lessonId, title: node.title, status: itemStatus(node) });
            counts.quizzes += 1;
          }
        } else if (node.kind === 'quiz') {
          // An ATTACHED quiz's stop carries its host lecture's gate, so a
          // watched lecture reads `cleared` here while its quiz was never
          // sat. Its own `state` (from the attempts) is the honest signal —
          // the gate only answers "may they open the page at all".
          if (node.gate !== 'locked' && OPEN_QUIZ_STATES.has(node.state)) {
            items.push({ ...base, id: node.id, kind: 'quiz', lessonId: node.lessonId, title: node.title, status: itemStatus(node) });
            counts.quizzes += 1;
          }
        } else if (node.gate === 'available') {
          items.push({ ...base, id: node.id, kind: 'lecture', lessonId: node.lessonId, title: node.title, status: itemStatus(node) });
          counts.lectures += 1;
        }

        if (isLessonStop && node.gate !== 'locked' && hasHomework.has(node.id)) {
          const submitted = submissionByLesson.get(node.id);
          if (submitted === 'submitted') {
            awaitingReview += 1;
          } else if (submitted === undefined || submitted === 'needs_work') {
            items.push({
              ...base,
              id: `hw:${node.id}`,
              kind: 'homework',
              lessonId: node.lessonId,
              title: node.title,
              status: submitted === 'needs_work' ? 'redo' : 'not_started',
            });
            counts.homework += 1;
          }
        }
      }

      if (items.length === 0) return [];
      return [{ id: course.id, slug: course.slug, title: course.title, subjectNameAr: course.subjectNameAr, coverKey: course.coverKey, items }];
    });

    return { courses: result, counts: { ...counts, awaitingReview } };
  }
}
