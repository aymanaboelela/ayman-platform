import { Injectable } from '@nestjs/common';
import type { BacklogCourse, BacklogItem, StudentBacklog } from '@ayman/contracts/backlog';
import type { LearningPath, PathNode } from '@ayman/contracts/path';
import { PrismaService } from '../../prisma/prisma.service';
import { PathService } from './path.service';

/** A quiz that can still be sat. `failed` is not here: a quiz is one sitting
 *  (see `gate-rule.ts`), so a failed one is history, not backlog. */
const OPEN_QUIZ_STATES: ReadonlySet<string> = new Set(['not_started', 'in_progress']);

/**
 * One lecture's homework as the student stands on it — `missing` (open, never
 * handed in), `submitted` (waiting for the teacher), `needs_work`, `accepted`.
 *
 * Exported for the guardian report, which lists ALL four where «المتراكم»
 * keeps only the two still owed. One function decides both, so «٢ واجب متسلّمش»
 * on the parent's page and «٢ واجبات» on the student's backlog are the same two.
 */
export interface LessonHomeworkRow {
  courseId: string;
  courseTitle: string;
  lessonId: string;
  title: string;
  status: 'missing' | 'submitted' | 'needs_work' | 'accepted';
  submittedAt: Date | null;
  grade: number | null;
  /** The lecture can be opened today — `missing` is only ever an open one. */
  open: boolean;
}

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
    return this.fromPath(userId, await this.path.forUser(userId));
  }

  /**
   * Every lecture with published homework the student can open, plus every
   * answer they handed in on a published one that has since closed — in path
   * order.
   *
   * A submission on a lecture that has since closed (a month that lapsed) is
   * still listed: it happened, and it is the teacher's mark. It is just never
   * `missing` — a door that does not open is not homework owed.
   */
  async homeworkFromPath(userId: string, path: LearningPath): Promise<LessonHomeworkRow[]> {
    // An unpublished course is «مقفول مؤقتاً» on the path and every lesson in
    // it 404s — listing its lectures as owed would be a to-do list of doors
    // that do not open.
    const courses = path.courses.filter((course) => course.published);

    // Homework hangs off a LESSON (never a quiz stop). `node.id ===
    // node.lessonId` is what tells a lesson's own stop from an attached quiz's.
    const lessonStops = courses.flatMap((course) =>
      course.nodes.filter((node) => node.id === node.lessonId).map((node) => ({ course, node })),
    );
    if (lessonStops.length === 0) return [];
    const lessonIds = lessonStops.map(({ node }) => node.id);

    const [homework, submissions] = await Promise.all([
      this.prisma.lessonHomework.findMany({
        where: { lessonId: { in: lessonIds }, isPublished: true },
        select: { lessonId: true },
      }),
      this.prisma.homeworkSubmission.findMany({
        where: { userId, lessonId: { in: lessonIds } },
        select: { lessonId: true, status: true, submittedAt: true, grade: true },
      }),
    ]);
    const hasHomework = new Set(homework.map((row) => row.lessonId));
    const submissionByLesson = new Map(submissions.map((row) => [row.lessonId, row]));

    return lessonStops.flatMap(({ course, node }) => {
      const open = node.gate !== 'locked';
      const submitted = submissionByLesson.get(node.id);
      // Published homework only — the teacher pulling one takes it off both
      // screens. Then an answer counts wherever it is, and an unanswered
      // lecture only while it is open.
      if (!hasHomework.has(node.id)) return [];
      if (!submitted && !open) return [];
      return [
        {
          courseId: course.id,
          courseTitle: course.title,
          lessonId: node.id,
          title: node.title,
          status: submitted ? (submitted.status as LessonHomeworkRow['status']) : 'missing',
          submittedAt: submitted?.submittedAt ?? null,
          grade: submitted?.grade == null ? null : Number(submitted.grade),
          open,
        },
      ];
    });
  }

  /** `forUser` over a path the caller already has — the guardian report reads
   *  the path and its homework once and hands both in. */
  async fromPath(
    userId: string,
    path: LearningPath,
    homeworkRows?: readonly LessonHomeworkRow[],
  ): Promise<StudentBacklog> {
    const courses = path.courses.filter((course) => course.published);
    const rows = homeworkRows ?? (await this.homeworkFromPath(userId, path));
    const homeworkByLesson = new Map(
      rows.filter((row) => row.open).map((row) => [row.lessonId, row.status]),
    );

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

        const homework = isLessonStop ? homeworkByLesson.get(node.id) : undefined;
        if (homework === 'submitted') {
          awaitingReview += 1;
        } else if (homework === 'missing' || homework === 'needs_work') {
          items.push({
            ...base,
            id: `hw:${node.id}`,
            kind: 'homework',
            lessonId: node.lessonId,
            title: node.title,
            status: homework === 'needs_work' ? 'redo' : 'not_started',
          });
          counts.homework += 1;
        }
      }

      if (items.length === 0) return [];
      return [{ id: course.id, slug: course.slug, title: course.title, subjectNameAr: course.subjectNameAr, coverKey: course.coverKey, items }];
    });

    return { courses: result, counts: { ...counts, awaitingReview } };
  }
}
