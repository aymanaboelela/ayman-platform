import {
  MASTERY_STRONG_AT,
  copy,
  type Dashboard,
  type QuizHistorySummary,
} from '@ayman/contracts';

/**
 * «إنجازاتك» — six markers, derived on every render from data the dashboard
 * has already fetched.
 *
 * ## Nothing here is stored, and that is the design
 *
 * There is no `achievements` table, no "awarded_at", and no write path. Each
 * marker is a predicate over the current payload, evaluated fresh, exactly as
 * `startHereSteps` decided for the first-run card and for the same reason: a
 * persisted flag is written once and never re-evaluated, so it survives the
 * thing that earned it. A student whose enrolment is revoked would keep a
 * «كورس كامل» medal for a course they can no longer open.
 *
 * The trade-off is the same one that file accepts out loud — a marker can go
 * BACKWARDS. Unenrol from the finished course and «كورس كامل» goes out again.
 * That is correct: at that moment it is not true.
 *
 * ## Why six, and why these six
 *
 * They ladder. The first two are reachable in a student's first sitting
 * (open a lesson, open ten), the middle two the first time they are graded, and
 * the last two only after real work. A strip where everything is out of reach
 * on day one is a strip that says "you have done nothing"; a strip where
 * everything is earned in week one stops meaning anything by week two.
 *
 * ## Why an unearned marker keeps its own condition
 *
 * `hint` is what an unearned marker carries as its `title` and inside its
 * accessible name, so the block can answer "how do I get the next one" as well
 * as "what have I got". It is deliberately not rendered as visible text under
 * each disc — six conditions at six columns is a wall — which is why the
 * section heading carries `copy.dashboard.badges.note` instead: one line
 * saying the strip fills itself, so six outlined circles do not read as six
 * locked features.
 */

const c = copy.dashboard.badges;

/** The glyph key. Resolved to a `lucide-react` component in `achievements.tsx`,
 *  so this module stays free of React and can be unit-tested on its own. */
export type BadgeGlyph = 'play' | 'layers' | 'clipboard' | 'medal' | 'trophy' | 'star';

export interface Achievement {
  id: string;
  glyph: BadgeGlyph;
  /** The name of the marker. Rendered whether or not it has been earned. */
  title: string;
  /** What it takes. Read out as the accessible description while unearned. */
  hint: string;
  earned: boolean;
}

/** The lesson count that earns «عشر دروس». Named rather than inline so the
 *  copy string and the predicate cannot drift apart. */
export const TEN_LESSONS = 10;

/** The mark that earns «امتياز». Chosen to sit above the platform's own pass
 *  mark rather than at it — a marker for clearing the bar everybody clears is
 *  not a marker.
 *
 *  It is the same 90 the mastery card calls `MASTERY_STRONG_AT`, and it is
 *  an alias rather than a second literal so the two screens cannot disagree
 *  about what "excellent" is. The dependency runs this way round — a web file
 *  importing from contracts — because contracts is consumed by `apps/api` too
 *  and may never import from `apps/web`. */
export const DISTINCTION_PERCENT = MASTERY_STRONG_AT;

export function achievementsFor({
  dashboard,
  summary,
  completedLessons,
}: {
  dashboard: Dashboard;
  summary: QuizHistorySummary;
  /** Already summed by `summarise()` — passed in rather than recomputed, so
   *  the strip and the stat tile above it can never disagree about the count. */
  completedLessons: number;
}): Achievement[] {
  return [
    {
      id: 'first-lesson',
      glyph: 'play',
      title: c.firstLessonTitle,
      hint: c.firstLessonHint,
      earned: completedLessons >= 1,
    },
    {
      id: 'ten-lessons',
      glyph: 'layers',
      title: c.tenLessonsTitle,
      hint: c.tenLessonsHint,
      earned: completedLessons >= TEN_LESSONS,
    },
    {
      id: 'first-exam',
      glyph: 'clipboard',
      title: c.firstExamTitle,
      hint: c.firstExamHint,
      earned: summary.quizzesTaken >= 1,
    },
    {
      id: 'first-pass',
      glyph: 'medal',
      title: c.firstPassTitle,
      hint: c.firstPassHint,
      earned: summary.passedCount >= 1,
    },
    {
      id: 'course-done',
      glyph: 'trophy',
      title: c.courseDoneTitle,
      hint: c.courseDoneHint,
      // `completedLessons >= totalLessons`, not `course.progressPercent >=
      // 100` — that field is `Enrollment.progressPercent`, a separately
      // written column observed stuck at 100 on a real account with an
      // obviously in-progress course (a live resume target, partial watch
      // time). `completedLessons`/`totalLessons` are counted live by
      // `DashboardService` from the same query the ring's own percentage
      // comes from, so this badge cannot disagree with what the student is
      // actually looking at above it. `>=` rather than `===` for the
      // now-familiar reason: a Postgres `numeric` ratio can still land
      // fractionally over on the rare course whose lesson count changed
      // between two completions.
      earned: dashboard.enrolledCourses.some(
        (course) => course.totalLessons > 0 && course.completedLessons >= course.totalLessons,
      ),
    },
    {
      id: 'distinction',
      glyph: 'star',
      title: c.distinctionTitle,
      hint: c.distinctionHint,
      // `bestPercent` is null until something is graded — `null >= 90` is
      // false in JS, but only by coercion, and writing it out is what stops
      // the next edit "simplifying" it into a truthiness check that treats a
      // legitimate 0% as "not yet graded".
      earned: summary.bestPercent !== null && summary.bestPercent >= DISTINCTION_PERCENT,
    },
  ];
}

/** How many of the six are earned — the count the section heading states. */
export function earnedCount(achievements: readonly Achievement[]): number {
  return achievements.filter((badge) => badge.earned).length;
}
