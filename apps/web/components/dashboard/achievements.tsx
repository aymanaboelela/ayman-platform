import {
  ClipboardCheck,
  Layers,
  Medal,
  PlayCircle,
  Sparkle,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { copy, formatCopy } from '@ayman/contracts';
import type { Achievement, BadgeGlyph } from '@/lib/achievements';

const GLYPHS: Record<BadgeGlyph, LucideIcon> = {
  play: PlayCircle,
  layers: Layers,
  clipboard: ClipboardCheck,
  medal: Medal,
  trophy: Trophy,
  star: Sparkle,
};

const c = copy.dashboard.badges;

/**
 * «إنجازاتك» — the one block on the dashboard that reports what a student has
 * DONE rather than what is left. The rules behind each marker, and why none of
 * them is persisted, are in `lib/achievements.ts`.
 *
 * ## The accessible name carries the state
 *
 * Earned and unearned differ by fill and by opacity — two visual properties and
 * no text. So each marker's `aria-label` spells out which it is, and an
 * unearned one appends its condition; a screen reader hears «أول درس — لسه:
 * افتح أول محاضرة وخلّصها» rather than a title with no state at all.
 *
 * The `<li>` carries the label rather than the title element, because the disc
 * is `aria-hidden` and the title alone would name the marker twice.
 */
export function Achievements({
  achievements,
  earned,
}: {
  achievements: readonly Achievement[];
  earned: number;
}) {
  return (
    <section>
      <div className="group-head">
        <span className="group-head__mark" aria-hidden="true" />
        <h2 className="group-head__title">{c.title}</h2>
        {/* Held back on phones for the reason `/library`'s heading gives: a
            `.group-head` does not wrap, and a title, a gloss and a count cannot
            share a 360px row. The gloss is a gloss — the count is the fact. */}
        <span className="group-head__note hidden min-w-0 truncate sm:block">{c.note}</span>
        <span className="group-head__count">
          {formatCopy(c.count, { earned, total: achievements.length })}
        </span>
      </div>

      <ul className="badge-strip">
        {achievements.map((badge) => {
          const Glyph = GLYPHS[badge.glyph];
          return (
            <li
              key={badge.id}
              className={badge.earned ? 'badge badge--earned' : 'badge'}
              // A pointer affordance for the condition, which otherwise only
              // reaches screen readers. It is deliberately NOT the only way to
              // learn what the strip is — `title` does nothing on a touch
              // screen, which is why the heading carries `badges.note`.
              title={badge.earned ? undefined : badge.hint}
              aria-label={
                badge.earned
                  ? `${badge.title} — ${c.earned}`
                  : `${badge.title} — ${c.locked}: ${badge.hint}`
              }
            >
              <span className="badge__disc" aria-hidden="true">
                <Glyph className="size-5" />
              </span>
              {/* `aria-hidden`: the `<li>` above already names this marker AND
                  its state. Leaving the text exposed would announce the title,
                  then the title again inside the label. */}
              <span className="badge__title" aria-hidden="true">
                {badge.title}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
