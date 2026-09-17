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
import { tierName, type Achievement, type BadgeGlyph } from '@/lib/achievements';
import { CardArt } from './card-art';

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
 *
 * ## …and now the TIER as well
 *
 * The weight of a marker is carried entirely by a metallic fill and a ring
 * thickness — colour and thickness, no text — so it reaches nobody who is not
 * looking at it. `tierName()` puts the word into the accessible name, and it is
 * spoken on unearned markers too: «كورس كامل، شارة ذهبية، لسه: …» is the
 * sentence that makes an unearned marker worth rendering at all.
 *
 * ⚠️ The tier CLASS is read straight off `badge.tier` and is applied whether or
 * not the marker is earned, while the metallic fill in `study.css` hangs off
 * `.badge--earned.badge--gold`. That split is deliberate: the tier is a fact
 * about the marker, the metal is a fact about the student, and deciding either
 * one here — rather than in `lib/achievements.ts` — is what would let the two
 * screens that show badges disagree about what a badge is worth.
 */
export function Achievements({
  achievements,
  earned,
  variant = 'section',
}: {
  achievements: readonly Achievement[];
  earned: number;
  /**
   * `'aside'` is the dashboard's, and it is the reason this block moved off
   * the main column — «الإنجازات برضه نفس الكلام»، i.e. into the side, in a
   * box, with a picture. The strip is the same six markers built from the same
   * rules; what changes is that it opens with a banner instead of a
   * `.group-head`, and it is pinned to three columns because the `lg` rule on
   * `.badge-strip` opens to SIX and six 50px cells in a 23rem column wrap
   * «أول امتحان» onto three lines each.
   *
   * `'section'` is the original full-width form. Nothing renders it today; it
   * is kept because the strip is not dashboard-specific and `/profile` is the
   * obvious next home for it.
   */
  variant?: 'section' | 'aside';
}) {
  const aside = variant === 'aside';

  const strip = (
      <ul className={aside ? 'badge-strip badge-strip--compact' : 'badge-strip'}>
        {achievements.map((badge) => {
          const Glyph = GLYPHS[badge.glyph];
          return (
            <li
              key={badge.id}
              className={
                badge.earned
                  ? `badge badge--${badge.tier} badge--earned`
                  : `badge badge--${badge.tier}`
              }
              // A pointer affordance for the condition, which otherwise only
              // reaches screen readers. It is deliberately NOT the only way to
              // learn what the strip is — `title` does nothing on a touch
              // screen, which is why the heading carries `badges.note`.
              title={badge.earned ? undefined : badge.hint}
              // The tier sits between the name and the state in BOTH branches,
              // so the sentence reads the same way round every time: what it
              // is, what it is worth, whether you have it.
              aria-label={
                badge.earned
                  ? `${badge.title} — ${formatCopy(c.tierLabel, { tier: tierName(badge.tier) })} — ${c.earned}`
                  : `${badge.title} — ${formatCopy(c.tierLabel, { tier: tierName(badge.tier) })} — ${c.locked}: ${badge.hint}`
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
  );

  if (aside) {
    return (
      <section className="aside-card">
        <CardArt name="awards" />
        <div className="aside-card__body">
          <div className="flex items-baseline gap-2">
            <h2 className="aside-card__title min-w-0 flex-1">{c.title}</h2>
            <span className="group-head__count shrink-0">
              {formatCopy(c.count, { earned, total: achievements.length })}
            </span>
          </div>
          {/* The gloss is UNCONDITIONAL here, at every width. In the full-width
              form it is `sm:hidden` under a heading that carries its own copy
              of it — a `.group-head` cannot wrap, so the two split by
              breakpoint. This card's heading is a flex row that can, so there
              is one gloss and it is always on. It is also the only thing on
              screen that says what earns a marker: `title` on a badge does
              nothing on a touch screen. */}
          <p className="aside-card__note mb-3">{c.note}</p>
          {strip}
        </div>
      </section>
    );
  }

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
      <p className="mb-3 text-[length:var(--fs-text-sm)] text-fg-muted sm:hidden">{c.note}</p>
      {strip}
    </section>
  );
}
