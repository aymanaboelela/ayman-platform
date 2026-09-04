import { Award, Clock, Zap } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { formatHoursMinutes } from '@/lib/format';
import { StatTile } from './stat-tile';

const c = copy.dashboard;

/**
 * XP, learning hours, badges earned — three `.tile`s, the same object
 * `/profile` and `/results` already open with.
 *
 * All three numbers are computed, never stored: `xp` comes from `xpFor()`
 * (`lib/xp.ts`), `learningSeconds` from `summarise()`'s reading of the API's
 * `totalWatchedSeconds`, and `badgesEarned` from `earnedCount()` — the exact
 * count the achievements strip's own heading states, passed in rather than
 * recomputed so the two can never disagree about how many are earned.
 *
 * ⚠️ The time tile prints through `formatHoursMinutes`, the SAME helper the
 * player's «إجمالي الوقت» uses, and it carries its own unit. It used to print a
 * bare hour count, which is «٠» for anybody under thirty minutes — every
 * student in their first session, told by the one tile that measures effort
 * that they had made none. A tile that can only be right after half an hour is
 * wrong on the day it matters most.
 *
 * No `accent` tile here: this row sits beside «ذاكر ده», which already owns
 * the page's one accent-tinted surface (see the comment at its call site in
 * `page.tsx`), so all three wells stay hued rather than amber.
 */
export function StatsRow({
  xp,
  learningSeconds,
  badgesEarned,
}: {
  xp: number;
  learningSeconds: number;
  badgesEarned: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-4">
      <StatTile icon={<Zap className="size-4" />} value={xp} label={c.xpLabel} hue={45} />
      <StatTile
        icon={<Clock className="size-4" />}
        value={formatHoursMinutes(learningSeconds)}
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
