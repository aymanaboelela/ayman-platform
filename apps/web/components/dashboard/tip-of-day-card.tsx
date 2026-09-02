import { Lightbulb } from 'lucide-react';
import { copy } from '@ayman/contracts';

const c = copy.dashboard;

/**
 * «نصيحة اليوم» — one line, picked by the calendar date rather than at
 * random.
 *
 * ## Why the date, not `Math.random()`
 *
 * A random pick reshuffles on every render — refresh the page and the tip
 * changes under you, which reads as broken rather than as content. Keying off
 * the day of the year gives every student the SAME tip on a given day (a
 * small shared thing, like the channel's own weekly nudges) and the same
 * student the same tip if they reload ten times before midnight. Nothing is
 * stored to make that true — same "recomputed every render" rule `xp.ts` and
 * `achievements.ts` both document, applied to a calendar index instead of a
 * payload.
 *
 * ## Why modulo the tip count rather than a 365/366-entry table
 *
 * `tips.length` is small on purpose (about ten), so the list wraps several
 * times a year. A tip repeating a few times a season is a minor thing to
 * notice; a list long enough to never repeat would mean writing — and
 * translating, and eventually stale-checking — three hundred-odd lines of
 * copy for a card that is decoration next to the page's real content.
 */
function dayOfYear(date: Date): number {
  const startOfYear = new Date(date.getFullYear(), 0, 0);
  const diffMs = date.getTime() - startOfYear.getTime();
  return Math.floor(diffMs / 86_400_000);
}

export function tipOfTheDay(date: Date = new Date()): string {
  const tips = c.tipOfDay;
  const index = dayOfYear(date) % tips.length;
  // `tips` is a fixed, non-empty array (`ar.ts` carries ten entries) — the
  // `?? tips[0]` fallback exists only to satisfy `noUncheckedIndexedAccess`,
  // never because the index is actually expected to miss.
  return tips[index] ?? tips[0] ?? '';
}

/*
 * `.tile--hued`, not the plain `.tile` this card opened with.
 *
 * The stats row right above it already gives its three tiles their own
 * per-tile hue (see `StatsRow`) precisely to answer the "four grey wells"
 * flatness complaint `.tile--hued`'s own comment in `study.css` documents —
 * and a plain ember well directly underneath that row put the exact
 * complaint right back on the page, one card down. `hue={280}` (violet) is
 * simply the next step in that same row's spread (45 → 140 → 225 → 280), far
 * enough from the amber accent (~72) and the ember structure hue (35) that a
 * decorative well here still cannot be mistaken for either.
 */
export function TipOfDayCard() {
  return (
    <div className="tile tile--hued" style={{ '--tile-h': 280 } as React.CSSProperties}>
      <span className="tile__well" aria-hidden="true">
        <Lightbulb className="size-4" />
      </span>
      <p className="min-w-0 flex-1 self-center text-[length:var(--fs-text-sm)] text-fg">
        {tipOfTheDay()}
      </p>
    </div>
  );
}
