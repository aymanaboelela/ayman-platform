import {
  CERTIFICATE_MIN_PERCENT,
  type ExamCertificate,
  type UnitCertificate,
} from '@ayman/contracts/share-cards';
import { EXAM_SHELF_TITLE } from '@ayman/contracts/quiz/scheduled';

/**
 * Which certificates a student holds — a pure fold over rows the service
 * reads, so every rule below is pinned by a unit test without a database.
 * The rules themselves are set out in `@ayman/contracts/share-cards`.
 */

export interface CourseRow {
  id: string;
  slug: string;
  title: string;
  examLessonId: string | null;
}

export interface QuizLessonRow {
  id: string;
  title: string;
  courseId: string;
  sectionId: string;
  sectionTitle: string;
  sectionPosition: number;
}

/** One FINAL attempt (state `submitted`, scored). */
export interface AttemptRow {
  lessonId: string;
  score: number;
  total: number;
  submittedAt: Date;
}

interface Best {
  score: number;
  total: number;
  percent: number;
  submittedAt: Date;
}

export function percentOf(score: number, total: number): number {
  return total > 0 ? Math.min(100, Math.max(0, (score / total) * 100)) : 0;
}

/** Monthly exams live on their own shelf; the course exam is named by the course. */
export function isExamLesson(lesson: QuizLessonRow, course: CourseRow | undefined): boolean {
  return lesson.sectionTitle.trim() === EXAM_SHELF_TITLE || lesson.id === course?.examLessonId;
}

function bestByLesson(attempts: readonly AttemptRow[]): Map<string, Best> {
  const best = new Map<string, Best>();
  for (const attempt of attempts) {
    const percent = percentOf(attempt.score, attempt.total);
    const current = best.get(attempt.lessonId);
    // Ties go to the EARLIER sitting: the certificate dates from the day the
    // mark was first reached, not the day it was repeated.
    if (!current || percent > current.percent || (percent === current.percent && attempt.submittedAt < current.submittedAt)) {
      best.set(attempt.lessonId, { score: attempt.score, total: attempt.total, percent, submittedAt: attempt.submittedAt });
    }
  }
  return best;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildCertificates(
  courses: readonly CourseRow[],
  lessons: readonly QuizLessonRow[],
  attempts: readonly AttemptRow[],
  minPercent = CERTIFICATE_MIN_PERCENT,
): { units: UnitCertificate[]; exams: ExamCertificate[] } {
  const courseById = new Map(courses.map((course) => [course.id, course]));
  const best = bestByLesson(attempts);

  const units = new Map<string, { lessons: QuizLessonRow[]; course: CourseRow }>();
  const exams: ExamCertificate[] = [];

  for (const lesson of lessons) {
    const course = courseById.get(lesson.courseId);
    if (!course) continue;
    if (isExamLesson(lesson, course)) {
      const mark = best.get(lesson.id);
      if (mark && mark.percent >= minPercent) {
        exams.push({
          id: lesson.id,
          courseId: course.id,
          courseTitle: course.title,
          title: lesson.title,
          score: mark.score,
          total: mark.total,
          percent: round1(mark.percent),
          earnedAt: mark.submittedAt.toISOString(),
        });
      }
      continue;
    }
    const unit = units.get(lesson.sectionId) ?? { lessons: [], course };
    unit.lessons.push(lesson);
    units.set(lesson.sectionId, unit);
  }

  const unitRows: (UnitCertificate & { order: [number, number] })[] = [];
  for (const [sectionId, { lessons: unitLessons, course }] of units) {
    const marks = unitLessons.map((lesson) => best.get(lesson.id)).filter((mark): mark is Best => mark !== undefined);
    const average = marks.length > 0 ? marks.reduce((sum, mark) => sum + mark.percent, 0) / marks.length : null;
    const complete = marks.length === unitLessons.length;
    const earned = complete && average !== null && average >= minPercent;
    const first = unitLessons[0]!;
    unitRows.push({
      id: sectionId,
      courseId: course.id,
      courseSlug: course.slug,
      courseTitle: course.title,
      title: first.sectionTitle.trim(),
      quizzesTotal: unitLessons.length,
      quizzesTaken: marks.length,
      averagePercent: average === null ? null : round1(average),
      earned,
      earnedAt: earned
        ? new Date(Math.max(...marks.map((mark) => mark.submittedAt.getTime()))).toISOString()
        : null,
      order: [courses.indexOf(course), first.sectionPosition],
    });
  }

  unitRows.sort((a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1]);
  exams.sort((a, b) => b.earnedAt.localeCompare(a.earnedAt));
  return { units: unitRows.map(({ order: _order, ...unit }) => unit), exams };
}
