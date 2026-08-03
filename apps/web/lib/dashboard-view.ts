import { copy, type Dashboard } from '@ayman/contracts';

/**
 * Everything the dashboard derives from the ONE payload the API already
 * returns. Pure functions in their own module rather than helpers inside the
 * page, so each is testable without rendering a Server Component — and so the
 * page reads as layout rather than as arithmetic.
 *
 * No second endpoint and no extra columns: slice 1 adds nothing to the API.
 */

export interface DashboardSummary {
  completedLessons: number;
  totalLessons: number;
  overallPercent: number;
  /** `null` — not 0 — when nothing has been graded yet. A student with no
   *  attempts has no average, and rendering "٠٪" tells them they failed. */
  averageScore: number | null;
}

/**
 * The four stat tiles.
 *
 * Overall progress is `completed / total` across every course, NOT the mean of
 * the per-course percentages. A student two lessons into a 40-lesson course
 * and finished with a 2-lesson one is 10% done, not 52% — averaging the
 * percentages lets a tiny course drag the headline number around.
 */
export function summarise(dashboard: Dashboard): DashboardSummary {
  const completedLessons = dashboard.enrolledCourses.reduce((n, x) => n + x.completedLessons, 0);
  const totalLessons = dashboard.enrolledCourses.reduce((n, x) => n + x.totalLessons, 0);
  const overallPercent = totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 100);

  const averageScore =
    dashboard.recentScores.length === 0
      ? null
      : Math.round(
          dashboard.recentScores.reduce((n, x) => n + x.scorePercent, 0) /
            dashboard.recentScores.length,
        );

  return { completedLessons, totalLessons, overallPercent, averageScore };
}

/** First word of the full name — "أهلًا أحمد محمود إبراهيم" greets nobody. */
export function firstName(fullName: string | undefined): string | null {
  const first = fullName?.trim().split(/\s+/)[0];
  return first && first.length > 0 ? first : null;
}

/* ────────────────────────────────────────────────────────────────────────
 * The first-run card.
 *
 * Three steps, each ticked from data that already exists. Nothing about this
 * is persisted: there is no "dismissed" column, no "tour seen" flag, and
 * therefore no way for a student to end up stuck looking at a card about
 * something they finished months ago — the classic failure of a stored
 * onboarding flag that was written once and never re-evaluated.
 *
 * The trade-off is that the card can come BACK: a student who unenrols from
 * every course sees step 1 again. That is correct. At that moment they have no
 * courses, and "اختار كورس واشترك فيه" is exactly the right thing to say.
 * ──────────────────────────────────────────────────────────────────────── */

export type StartStepId = 'enroll' | 'lesson' | 'quiz';

export interface StartStep {
  id: StartStepId;
  title: string;
  body: string;
  cta: string;
  href: string;
  done: boolean;
}

export function startHereSteps(dashboard: Dashboard): StartStep[] {
  const enrolled = dashboard.enrolledCourses.length > 0;

  // "Opened a lesson" is read off `lastLessonId`, which the API sets from the
  // student's own last resume target. `completedLessons > 0` would be a
  // stricter test and the wrong one — this step asks whether they have STARTED
  // watching, and a lesson only counts as completed at 95% position and 70%
  // watch time.
  const opened = dashboard.enrolledCourses.some((course) => course.lastLessonId !== null);

  const graded = dashboard.recentScores.length > 0;

  // Where "افتح الدرس" points. Prefer a live resume target; fall back to the
  // first enrolled course, whose page picks its own first lesson. Never a dead
  // link, and never a link to a lesson id that has since been unpublished —
  // `continueWatching` is already filtered on `isPublished` by the API.
  const resume = dashboard.continueWatching;
  const firstCourse = dashboard.enrolledCourses[0];
  const lessonHref = resume
    ? `/courses/${resume.courseSlug}/lessons/${resume.lessonId}`
    : firstCourse
      ? `/courses/${firstCourse.slug}`
      : '/courses';

  const c = copy.dashboard;

  return [
    {
      id: 'enroll',
      title: c.stepEnrollTitle,
      body: c.stepEnrollBody,
      cta: c.stepEnrollCta,
      href: '/courses',
      done: enrolled,
    },
    {
      id: 'lesson',
      title: c.stepLessonTitle,
      body: c.stepLessonBody,
      cta: c.stepLessonCta,
      href: lessonHref,
      done: opened,
    },
    {
      id: 'quiz',
      title: c.stepQuizTitle,
      body: c.stepQuizBody,
      cta: c.stepQuizCta,
      href: '/path',
      done: graded,
    },
  ];
}

/**
 * The card renders only while something is outstanding. Deliberately derived
 * from the same array the card renders, rather than recomputed from the
 * payload, so "what is shown" and "whether to show it" cannot disagree.
 */
export function hasOutstandingSteps(steps: readonly StartStep[]): boolean {
  return steps.some((step) => !step.done);
}
