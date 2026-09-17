import { copy } from '@ayman/contracts';
import { CardArt } from './card-art';

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
 * ## Why this is a banner card and not a `.tile` any more
 *
 * It was a 40px well with a `Lightbulb` in it and one line of text beside it,
 * sitting full-width between the stats row and «إنجازاتك». Two things were
 * wrong with that and they are the same two the whole aside column fixes: at
 * full width a one-line card reads as important, and it is not — it is the
 * lightest thing on the page — and the glyph was too small to say "tip"
 * («غير الأيكونز، يبقى فيه صور، لأن بجد مش فاهم حاجة»).
 *
 * The heading is new. There was none: the card printed the sentence with no
 * word anywhere saying what it was, so a student read a piece of advice with
 * no idea whether it was aimed at them, generated, or written by the
 * instructor. `c.tipOfDayTitle` names it.
 */
export function TipOfDayCard() {
  return (
    <section className="aside-card">
      <CardArt name="tip" />
      <div className="aside-card__body">
        <h2 className="aside-card__title">{c.tipOfDayTitle}</h2>
        <p className="aside-card__note">{tipOfTheDay()}</p>
      </div>
    </section>
  );
}
