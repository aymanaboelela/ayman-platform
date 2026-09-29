import { Lightbulb, Quote } from 'lucide-react';
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

/**
 * ## Why a callout, and not a banner card any more
 *
 * It was a 40px well with a `Lightbulb` beside one line of text, then an
 * `.aside-card` with a 16/6 drawing of a lamp over an open book — and on a
 * 390px phone that second form was ~250px tall for ONE sentence, most of it
 * pale illustration («شكلها حلو أوي واضبط الدنيا»). It is now what it is: a
 * short, coloured callout. The bulb is a solid medallion rather than a
 * drawing, the sentence is set larger than body text because it is the only
 * thing in the card, and a faint quote mark behind it says "a saying" without
 * costing a line.
 *
 * Teal, not amber, for the card itself: amber on this page means "press this"
 * and "you are here", and a tip is neither. The bulb keeps the amber because
 * it is LIT — the same "live" sense the ring on the band uses.
 *
 * The heading stays. There was none once: the card printed the sentence with
 * no word anywhere saying what it was, so a student read a piece of advice
 * with no idea whether it was aimed at them, generated, or written by the
 * instructor. `c.tipOfDayTitle` names it.
 */
export function TipOfDayCard() {
  return (
    <section className="tip-callout">
      <span className="tip-callout__icon" aria-hidden="true">
        <Lightbulb className="size-5" strokeWidth={2.25} />
      </span>
      <div className="tip-callout__body">
        <h2 className="tip-callout__title">{c.tipOfDayTitle}</h2>
        <p className="tip-callout__text">{tipOfTheDay()}</p>
      </div>
      <Quote className="tip-callout__quote" aria-hidden="true" />
    </section>
  );
}
