import { Award, Clock, Zap } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { StatTile } from './stat-tile';

const c = copy.dashboard;

/**
 * XP, learning hours, badges earned — three `.tile`s, the same object
 * `/profile` and `/results` already open with.
 *
 * All three numbers are computed, never stored: `xp` comes from `xpFor()`
 * (`lib/xp.ts`), `learningHours` from `summarise()`'s reading of the API's
 * `totalWatchedSeconds`, and `badgesEarned` from `earnedCount()` — the exact
 * count the achievements strip's own heading states, passed in rather than
 * recomputed so the two can never disagree about how many are earned.
 *
 * No `accent` tile here: this row sits beside «ذاكر ده», which already owns
 * the page's one accent-tinted surface (see the comment at its call site in
 * `page.tsx`), so all three wells stay hued rather than amber.
 */
export function StatsRow({
  xp,
  learningHours,
  badgesEarned,
}: {
  xp: number;
  learningHours: number;
  badgesEarned: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-4">
      <StatTile icon={<Zap className="size-4" />} value={xp} label={c.xpLabel} hue={45} />
      <StatTile
        icon={<Clock className="size-4" />}
        value={learningHours}
        label={c.learningHoursLabel}
        hue={225}
      />
      <StatTile
        icon={<Award className="size-4" />}
        value={badgesEarned}
        label={c.badgesEarnedLabel}
        hue={140}
      />
    </div>
  );
}
