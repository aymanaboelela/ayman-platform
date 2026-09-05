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
 * ## Why every marker carries a TIER
 *
 * Six flat booleans say how MANY markers a student has and never how much any
 * one of them is worth: «أول درس» and «كورس كامل» rendered as the same outlined
 * disc, so the strip counted a first lecture and a finished course as one each.
 * Reported as «خليها يبقى فيه البرونز» — the strip has no sense of weight.
 *
 * So each marker declares a `tier`, and the tier is decided HERE, beside the
 * predicate that earns it, for the same reason `hint` is: the component renders
 * the claim, it does not get to make it. A tier is an assertion about how hard
 * something was, somebody will eventually want to argue with it, and the
 * argument belongs next to the thing being argued about.
 *
 * ### The argument, marker by marker
 *
 * The question each one is scored against is "how much of a student's own work
 * does this cost", NOT "how nice is it to receive" — a tier that tracked
 * pleasantness would put «أول نجاح» at gold, which would then make the finished
 * course worth the same as one passed quiz.
 *
 *   bronze — a single deliberate act, reachable in one sitting on day one.
 *     `first-lesson` is one lecture watched to the end. `first-exam` is one
 *     exam SAT, and it is bronze rather than silver on purpose: sitting an
 *     exam costs attendance, not attainment — the badge is awarded to a
 *     student who failed it. Passing is a different marker and is priced
 *     higher precisely because this one is not.
 *
 *   silver — sustained, but bounded; a week of real study, not a term of it.
 *     `ten-lessons` is ten lectures, which nobody reaches by accident and
 *     everybody reaches eventually. `first-pass` is a mark above the pass
 *     line, which is attainment rather than attendance, but it is one quiz
 *     and the platform's own pass mark is a bar most students clear.
 *
 *   gold — the two markers that cannot be reached in a hurry.
 *     `course-done` is every lecture in a course, counted live. `distinction`
 *     is `DISTINCTION_PERCENT` — deliberately above the pass mark, so it is
 *     the one marker in the strip that a student can sit ten exams and still
 *     not hold.
 *
 * ### Tier is a property of the MARKER, not of the student
 *
 * ⚠️ `tier` never reads `earned`, and `achievementsFor` returns the same six
 * tiers for a brand-new account as for a finished one. An unearned gold marker
 * is still gold — that is the whole point of showing it: the strip is supposed
 * to say what the expensive ones ARE before you have them. Coupling the two
 * would turn the tier into a second, redundant spelling of `earned`, and the
 * unearned half of the strip would go back to being six identical circles.
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

/** What a marker is WORTH. See «Why every marker carries a tier» above for the
 *  argument behind each assignment; the three names are rendered from
 *  `copy.dashboard.badges.tierBronze` / `…Silver` / `…Gold`. */
export type AchievementTier = 'bronze' | 'silver' | 'gold';

/** Cheapest first. Exists so `highestTier` can compare tiers without a chain of
 *  `includes()` checks, and so adding a fourth tier is one edit rather than a
 *  hunt for every place the order was re-spelled inline. */
const TIER_RANK: Record<AchievementTier, number> = {
  bronze: 1,
  silver: 2,
  gold: 3,
};

export interface Achievement {
  id: string;
  glyph: BadgeGlyph;
  /** The name of the marker. Rendered whether or not it has been earned. */
  title: string;
  /** What it takes. Read out as the accessible description while unearned. */
  hint: string;
  /** How much this marker costs — fixed per marker, and deliberately
   *  INDEPENDENT of `earned`: an unearned gold badge is still a gold badge. */
  tier: AchievementTier;
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
      tier: 'bronze',
      earned: completedLessons >= 1,
    },
    {
      id: 'ten-lessons',
      glyph: 'layers',
      title: c.tenLessonsTitle,
      hint: c.tenLessonsHint,
      tier: 'silver',
      earned: completedLessons >= TEN_LESSONS,
    },
    {
      id: 'first-exam',
      glyph: 'clipboard',
      title: c.firstExamTitle,
      hint: c.firstExamHint,
      tier: 'bronze',
      earned: summary.quizzesTaken >= 1,
    },
    {
      id: 'first-pass',
      glyph: 'medal',
      title: c.firstPassTitle,
      hint: c.firstPassHint,
      tier: 'silver',
      earned: summary.passedCount >= 1,
    },
    {
      id: 'course-done',
      glyph: 'trophy',
      title: c.courseDoneTitle,
      hint: c.courseDoneHint,
      tier: 'gold',
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
      tier: 'gold',
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

/** The tier's name, for an accessible description. In this module rather than
 *  in `achievements.tsx` for the same reason `highestTier` is — see the ⚠️ on
 *  that function, immediately below. The stat tile that colours itself by
 *  `highestTier` is rendered on the server and needs the WORD as well as the
 *  colour, or its label goes back to being a bare number in a hue that reaches
 *  nobody who is not looking at the screen. */
export function tierName(tier: AchievementTier): string {
  return tier === 'gold' ? c.tierGold : tier === 'silver' ? c.tierSilver : c.tierBronze;
}

/**
 * The best tier the student actually HOLDS, or `null` when the strip is still
 * empty. Consumed by the «شارات محققة» stat tile, which colours itself by it —
 * a tile reading "6" in the same neutral as a tile reading "1" repeats the
 * exact flatness the tiers were added to fix.
 *
 * ⚠️ It lives in this plain module rather than beside the components that use
 * it, and that is not tidiness. `/dashboard` is a Server Component and calls
 * this directly; the day either `achievements.tsx` or `stat-tile.tsx` picks up
 * a `'use client'` — one `onClick` is enough — a helper exported from it stops
 * being callable from the server and React throws «Attempted to call
 * highestTier() from the server but highestTier is on the client» on the first
 * real request. Typecheck stays green, the unit tests stay green, and the route
 * 500s in production. Keeping it here means that edit cannot break this.
 *
 * `null` rather than `'bronze'` for the empty case: a new student holds no
 * badge at all, and defaulting to the lowest tier would paint the tile bronze
 * for somebody who has not earned bronze.
 */
export function highestTier(achievements: readonly Achievement[]): AchievementTier | null {
  let best: AchievementTier | null = null;
  for (const badge of achievements) {
    // Unearned markers are skipped rather than ranked: the strip renders gold
    // markers a student does not have, and ranking those would report every
    // brand-new account as gold.
    if (!badge.earned) continue;
    if (best === null || TIER_RANK[badge.tier] > TIER_RANK[best]) best = badge.tier;
  }
  return best;
}
