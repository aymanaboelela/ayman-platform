import type { ReactNode } from 'react';
import { Award, Clock, Zap } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { type AchievementTier, tierName } from '@/lib/achievements';
import { formatHoursMinutes } from '@/lib/format';
import { StatTile } from './stat-tile';

const c = copy.dashboard;

/**
 * One figure on the band: a headline number, what it is, the raw count behind
 * it, and the screen that holds the rest of it.
 */
export interface StatFigure {
  id: 'xp' | 'time' | 'badges';
  value: string | number;
  label: string;
  /** The second line — see `note` on `StatTile` for why it exists. */
  note: string;
  href: string;
  /** Printed small beside the number. Only «شارات محققة» has one, and it is
   *  the tier's own name — see `statFigures` for why the colour alone is not
   *  allowed to carry that. */
  suffix?: string;
  /** The tier class whose `--badge-metal*` values light the well. Absent means
   *  the band's default white-alpha well. */
  metalClass?: string;
}

/**
 * The band's three figures, chosen and phrased in one place.
 *
 * All three headline numbers are computed, never stored: `xp` comes from
 * `xpFor()` (`lib/xp.ts`), `learningSeconds` from `summarise()`'s reading of
 * the API's `totalWatchedSeconds`, and `badgesEarned` from `earnedCount()` —
 * the exact count «إنجازاتك» states in its own heading, passed in rather than
 * recomputed so the two can never disagree about how many are earned.
 *
 * ## The duplication this function is the fix for
 *
 * Six numbers described this student, in two shapes, a screen apart. The band
 * carried «٢ كورساتك · ٤ دروس خلصتها · ٢٧٪ متوسط درجاتك» as a line of small
 * inline links, and three `.tile`s under «تكمل من مكانك» carried نقاط الخبرة،
 * وقت المذاكرة، شارات محققة. «عاوز تنقل السكشن ده أعلى» is what started this,
 * but moving the tiles up on their own would have left the band stating the
 * same KIND of fact twice, once at 14px and once at 24px, forty pixels apart.
 *
 * They are not merely alike — they overlap at the source. XP is computed from
 * completed lessons and passed quizzes (`lib/xp.ts`); the badge count is
 * computed from completed lessons and quiz results (`lib/achievements.ts`). So
 * «٤ دروس خلصتها» was already an INPUT to two of the three tiles, printed
 * beside its own outputs as if it were a third, independent measurement.
 *
 * The reconciliation is a pairing rather than a deletion: each tile keeps its
 * headline number, takes the raw count it was derived from as its second line,
 * and inherits that count's destination.
 *
 *   نقاط الخبرة   ← «{n} دروس خلصتها»     → /path
 *   وقت المذاكرة  ← «{n} كورساتك»          → /library
 *   شارات محققة   ← «متوسط درجاتك {n}٪»   → /results
 *
 * Six facts, three shapes, nothing dropped, and every destination the inline
 * links used to offer is still one tap away — which mattered most on a phone,
 * where the rail is gone and this band is most of what is on screen.
 *
 * ## Why the pairs are these pairs
 *
 * XP↔lessons and badges↔marks are causal: the note is literally what earned
 * the number above it. Time↔courses is the weakest of the three and is still
 * the right one left over — hours are spent INSIDE courses, and «كورساتك» is
 * the only one of the three raw facts that has nothing to do with grading.
 *
 * ## No new copy strings
 *
 * Every label here already existed, on one side of the duplication or the
 * other. `statNoScores` («لسه») is what an ungraded student's average reads as
 * — deliberately not «٠٪», which is a mark rather than the absence of one.
 */
export function statFigures({
  xp,
  learningSeconds,
  badgesEarned,
  completedLessons,
  courseCount,
  averageScore,
  badgeTier,
}: {
  xp: number;
  learningSeconds: number;
  badgesEarned: number;
  completedLessons: number;
  courseCount: number;
  /** `null` until the student has been graded at all. */
  averageScore: number | null;
  /** The best tier the student HOLDS, from `highestTier()`; `null` while the
   *  strip is still empty. */
  badgeTier: AchievementTier | null;
}): StatFigure[] {
  return [
    {
      id: 'xp',
      value: xp,
      label: c.xpLabel,
      note: `${completedLessons} ${c.statLessonsDone}`,
      href: '/path',
    },
    {
      id: 'time',
      /*
       * ⚠️ `formatHoursMinutes`, the SAME helper the player's «إجمالي الوقت»
       * uses, and it carries its own unit. This figure used to print a bare
       * hour count, which is «٠» for anybody under thirty minutes — every
       * student in their first session, told by the one number that measures
       * effort that they had made none. A figure that can only be right after
       * half an hour is wrong on the day it matters most.
       */
      value: formatHoursMinutes(learningSeconds),
      label: c.learningHoursLabel,
      note: `${courseCount} ${c.statCourses}`,
      href: '/library',
    },
    {
      id: 'badges',
      value: badgesEarned,
      /*
       * The tier's NAME, beside the count, and it is not decoration.
       *
       * `highestTier` exists so this tile can be lit by the best badge the
       * student holds, and a well struck in bronze against one struck in gold
       * is a difference that reaches nobody reading the screen with their ears
       * — and, at a 20° hue step on a 390px phone, very few of the people
       * reading it with their eyes. So the word is printed. «٣ ذهبية» under
       * «شارات محققة» says the same thing the metal says, in the one channel
       * that cannot be lost.
       *
       * `undefined` rather than an empty string while the strip is empty: a
       * new student holds no tier, and «٠» followed by a dangling separator is
       * how that renders if this is left to fall through.
       */
      suffix: badgeTier === null ? undefined : tierName(badgeTier),
      /*
       * The tier's metal, borrowed rather than re-mixed. `.badge--bronze` and
       * its siblings declare `--badge-metal*` and nothing else — they are a
       * palette, not a layout — so putting one on this tile hands the well the
       * exact stops the badge disc beside it is struck from. A second set of
       * metals mixed here would be two answers to "what colour is silver", and
       * they would drift apart on the first tweak to either.
       */
      metalClass: badgeTier === null ? undefined : `tile--metal badge--${badgeTier}`,
      label: c.badgesEarnedLabel,
      note:
        averageScore === null
          ? `${c.statAverage} ${c.statNoScores}`
          : `${c.statAverage} ${averageScore}%`,
      href: '/results',
    },
  ];
}

const ICONS: Record<StatFigure['id'], ReactNode> = {
  xp: <Zap className="size-4" />,
  time: <Clock className="size-4" />,
  badges: <Award className="size-4" />,
};

/**
 * XP, learning time, badges earned — three tiles ON the dashboard's ember
 * band, beside the greeting and the ring.
 *
 * ## Where they used to be
 *
 * A loose row under «تكمل من مكانك», a full screen below the band that
 * introduces the student — and on a phone, below the fold entirely. «عاوز
 * تنقل السكشن ده أعلى». They are rendered by `DashboardHero` now rather than
 * by the page, because the band places its children BY GRID COLUMN and only a
 * direct child of it can be given one.
 *
 * ## `tone="ink"` is not a detail
 *
 * `.tile`'s `--n-2` ground is one step off the PAGE. On the band it is one
 * step off nothing — in the dark theme it sits within a hair of the band's own
 * darkest gradient stop, so an unmodified tile there is a rectangle findable
 * only by its border. The ink tone paints the ground, the border, the number
 * and the label in white alphas, which composite against whatever part of the
 * gradient they land on and cannot invert with the theme. `StatTile` and
 * `.tile--ink` in `study.css` both carry the long form of this.
 *
 * ## All three are links
 *
 * They inherited that from the inline figures they absorbed — see
 * `statFigures`. The band is still not where the page's primary action lives:
 * that is the card directly beneath it, and it is the only amber-FILLED thing
 * on the screen. These are structure you can walk through rather than a row of
 * buttons, which is why nothing here is underlined or chevroned and the hover
 * is the whole affordance.
 */
export function StatsRow({
  xp,
  learningSeconds,
  badgesEarned,
  completedLessons,
  courseCount,
  averageScore,
  badgeTier,
}: {
  xp: number;
  learningSeconds: number;
  badgesEarned: number;
  completedLessons: number;
  courseCount: number;
  averageScore: number | null;
  /**
   * The best tier the student holds, from `highestTier()` in
   * `lib/achievements.ts` — it lights the «شارات محققة» well and names itself
   * beside the count.
   *
   * ⚠️ `highestTier` is imported by the PAGE, a Server Component, and lives in
   * that plain module for the reason its own ⚠️ gives: the day this file or
   * `stat-tile.tsx` picks up a `'use client'`, a helper exported from either
   * would stop being callable from the server and the route would 500 on the
   * first real request with every test still green. The tier arrives here as a
   * value, never as a function to call.
   */
  badgeTier: AchievementTier | null;
}) {
  const figures = statFigures({
    xp,
    learningSeconds,
    badgesEarned,
    completedLessons,
    courseCount,
    averageScore,
    badgeTier,
  });

  return (
    <div className="dash-hero__stats">
      {figures.map((figure) => (
        <StatTile
          key={figure.id}
          tone="ink"
          icon={ICONS[figure.id]}
          value={figure.value}
          suffix={figure.suffix}
          label={figure.label}
          note={figure.note}
          href={figure.href}
          className={figure.metalClass}
        />
      ))}
    </div>
  );
}
