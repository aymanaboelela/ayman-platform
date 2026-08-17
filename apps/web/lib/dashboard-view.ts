import { copy, type Dashboard } from '@ayman/contracts';
import { enrolledCourseHref } from './course-href';

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
 * courses, and "نختار كورس ونشترك فيه" is exactly the right thing to say.
 * ──────────────────────────────────────────────────────────────────────── */

export type StartStepId = 'enroll' | 'lesson' | 'quiz';

export interface StartStep {
  id: StartStepId;
  title: string;
  body: string;
  cta: string;
  href: string;
  done: boolean;
  /**
   * What has to happen before this step can be taken, or `null` when it can be
   * taken now.
   *
   * ## Why this exists
   *
   * The card rendered a button on the FIRST outstanding step and nothing at
   * all on the ones after it — no link, no explanation, not even the step's own
   * body text. The reasoning was sound as far as it went (three stacked CTAs
   * is three decisions, and a brand-new student has no basis for any of them),
   * but the result was two rows that looked exactly like the third and did
   * nothing whatsoever when pressed. «مش عايز إن هو يضغط على حاجة وما يبقاش
   * ليه استجابة.»
   *
   * A step that cannot be taken yet is not a step with nothing to say — it is
   * a step with a PREREQUISITE, and the prerequisite is the row directly above
   * it. So every outstanding step is now pressable: the next one goes straight
   * where it says, and a later one opens a dialog naming what comes first and
   * offering to take them there. «أقول له بعد إذنك اتفرج على الكورس الأول».
   *
   * The visual hierarchy the old design was protecting is unchanged: only the
   * next step wears the amber fill, and the later ones wear the quiet chip.
   */
  blockedBy: { reason: string; cta: string; href: string } | null;
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
      ? // `enrolledCourseHref`, and the note below is exactly why. This branch
        // used to be `/courses/${firstCourse.slug}` — the PUBLIC page — sitting
        // directly above a comment explaining that the public catalog drops a
        // signed-in student out of their shell. The principle was written down
        // and the line above it did the opposite anyway, which is the argument
        // for the rule living in a function instead of in a comment.
        enrolledCourseHref(firstCourse)
      : // `/library`, not `/courses`: this is a link a SIGNED-IN student
        // clicks from their dashboard, and the public catalog would drop them
        // out of the shell they are standing in.
        '/library';

  const c = copy.dashboard;

  /*
    The prerequisite chain.

    Two rules, and the second is the one that is easy to get wrong.

    1. A step is blocked by the CONDITION the step above it establishes, not by
       that step being ticked. It matters for the middle one: what decides
       whether there is a lesson to open is "are you enrolled", not "does the
       enrol row show a tick".

    2. The REASON belongs to the step being pressed; the DESTINATION belongs to
       the earliest thing that is missing. Step 3 pressed by a student with no
       course at all must explain itself in its own terms — «الاختبار بييجي بعد
       الدرس» — while sending them to the catalogue, because that is genuinely
       where they have to start. Reusing step 2's sentence there (the first
       version of this did) put «عشان تفتح درس…» under a row titled «حل أول
       اختبار», which answers a question nobody asked.

    Where the destination IS the lesson, it reuses step 2's own href and CTA, so
    «افتح الدرس» means one thing and goes to one place wherever it is pressed.
  */
  const toLibrary = { cta: c.stepEnrollCta, href: '/library' };

  return [
    {
      id: 'enroll',
      title: c.stepEnrollTitle,
      body: c.stepEnrollBody,
      cta: c.stepEnrollCta,
      href: '/library',
      done: enrolled,
      // Nothing comes before choosing a course. This step is always takeable.
      blockedBy: null,
    },
    {
      id: 'lesson',
      title: c.stepLessonTitle,
      body: c.stepLessonBody,
      cta: c.stepLessonCta,
      href: lessonHref,
      done: opened,
      blockedBy: enrolled ? null : { reason: c.stepLessonBlocked, ...toLibrary },
    },
    {
      id: 'quiz',
      title: c.stepQuizTitle,
      body: c.stepQuizBody,
      cta: c.stepQuizCta,
      href: '/path',
      done: graded,
      blockedBy: !enrolled
        ? // No course at all: the reason is still about this step, the
          // destination is the catalogue.
          { reason: c.stepQuizBlockedNoCourse, ...toLibrary }
        : !opened
          ? // Enrolled but nothing opened. `/library` would be the wrong place
            // to send someone who already has a course; the lesson is the
            // actual next move, so this reuses step 2's own href and label.
            { reason: c.stepQuizBlocked, cta: c.stepLessonCta, href: lessonHref }
          : null,
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
