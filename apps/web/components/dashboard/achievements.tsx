import {
  Check,
  ClipboardCheck,
  Layers,
  Lock,
  Medal,
  PlayCircle,
  Sparkle,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { copy, formatCopy } from '@ayman/contracts';
import { tierName, type Achievement, type BadgeGlyph } from '@/lib/achievements';
import { isolateLtrRuns } from './ltr-runs';
import { PanelHead } from './panel-head';

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
 * Earned and unearned differ by metal, a tick or a padlock, and the line under
 * the title — all of it drawn, none of it read out. So each marker's
 * `aria-label` spells out which it is, and an unearned one appends its
 * condition and, where the page has the number, how far along it is: «عشر
 * دروس — شارة فضية — لسه: عشر محاضرات في أي كورس. (3 من 10)».
 *
 * ## What a locked tile prints
 *
 * It used to print its title and nothing else, so four grey tiles out of six
 * said nothing about how to get any of them — the condition lived in a `title`
 * tooltip, which does nothing on the phones this is read on. Now each locked
 * tile prints a second line: a meter and «3 من 10» where
 * `lib/achievements.ts` has a number for it, the hint where it does not. An
 * earned one prints its metal («ذهبية») in the same slot, so every tile in
 * the grid is the same three lines and the rows line up.
 *
 * The `<li>` carries the label rather than the title element, because the disc
 * is `aria-hidden` and the title alone would name the marker twice.
 *
 * ## Considered and rejected: a hue per badge
 *
 * The dashboard visual-richness pass that gave `StatsRow`'s three tiles their
 * own `.tile--hued` colour (and, right below them, `TipOfDayCard`'s) also
 * looked at giving each earned badge its own hue the same way. It does not
 * apply here, and the reason is `study.css`'s own split: a decorative hue may
 * only fill a NON-INTERACTIVE CATEGORY mark — "what kind of thing is this" —
 * while `.badge--earned`'s solid amber disc is making a POSITION claim
 * ("you have reached this"), the same job amber does everywhere else in the
 * product (the current lesson, a progress fill). Recolouring the disc per
 * badge would blur that exact split back together, and it would not even buy
 * back the distinctness a category hue is for: the six badges already carry
 * six different glyphs, so they are told apart by icon, not by a repeated
 * grey well the way the stat tiles were.
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
   * box. The strip is the same six markers built from the same rules; what
   * changes is that it opens with a `PanelHead` and a six-segment meter
   * instead of a `.group-head`, and it is pinned to three columns because the
   * `lg` rule on `.badge-strip` opens to SIX and six 50px cells in a 23rem
   * column wrap «أول امتحان» onto three lines each.
   *
   * It opened with a 16/6 drawing of a podium until the phone screenshot that
   * called it unfinished: ~140px of pastel before the heading, on a card whose
   * content is already six pictures.
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
        const tier = formatCopy(c.tierLabel, { tier: tierName(badge.tier) });
        return (
          <li
            key={badge.id}
            className={
              badge.earned
                ? `badge badge--${badge.tier} badge--earned`
                : `badge badge--${badge.tier}`
            }
            // A pointer affordance for the condition. No longer the only place
            // it reaches a sighted student — a locked tile now prints its
            // hint or its progress under the title — but it is the full
            // sentence where the tile shows «3 من 10».
            title={badge.earned ? undefined : badge.hint}
            // The tier sits between the name and the state in BOTH branches,
            // so the sentence reads the same way round every time: what it
            // is, what it is worth, whether you have it — and, locked, how
            // far along it is.
            aria-label={
              badge.earned
                ? `${badge.title} — ${tier} — ${c.earned}`
                : `${badge.title} — ${tier} — ${c.locked}: ${badge.hint}${
                    badge.progress ? ` (${badge.progress.label})` : ''
                  }`
            }
          >
            <span className="badge__disc" aria-hidden="true">
              <Glyph className="size-5" />
              {/* The state, ON the disc, in a shape — a tick or a padlock —
                  so earned-or-not survives greyscale and a glance. It says
                  "not yet", not "not for you": the line under the title is
                  how to get it. */}
              <span className="badge__state">
                {badge.earned ? <Check strokeWidth={3} /> : <Lock strokeWidth={2.5} />}
              </span>
            </span>
            {/* `aria-hidden`, all three lines: the `<li>` above already names
                this marker, its tier, its state and its progress. Leaving the
                text exposed would announce each of them twice. */}
            <span className="badge__title" aria-hidden="true">
              {badge.title}
            </span>
            {badge.earned ? (
              <span className="badge__tier" aria-hidden="true">
                {tierName(badge.tier)}
              </span>
            ) : badge.progress ? (
              <span className="badge__progress" aria-hidden="true">
                <span className="badge__meter">
                  <span
                    className="badge__meter-fill"
                    style={{
                      inlineSize: `${Math.round((badge.progress.value / badge.progress.target) * 100)}%`,
                    }}
                  />
                </span>
                <span className="badge__hint">{isolateLtrRuns(badge.progress.label)}</span>
              </span>
            ) : (
              <span className="badge__hint" aria-hidden="true">
                {isolateLtrRuns(badge.hint)}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );

  if (aside) {
    return (
      <section className="aside-card">
        {/* The gloss is the head's lead line, at every width — it is the one
            sentence that says what earns a marker at all. */}
        <PanelHead
          icon={Trophy}
          hue="violet"
          title={c.title}
          lead={c.note}
          meta={formatCopy(c.count, { earned, total: achievements.length })}
        />
        <div className="aside-card__body">
          <AwardMeter achievements={achievements} />
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

/** Cheapest first, so the lit segments climb bronze → silver → gold from the
 *  start of the bar, the way the metals themselves are ranked. */
const METAL_ORDER = { bronze: 0, silver: 1, gold: 2 } as const;

/**
 * «2 من 6» as a picture: one segment per marker, earned ones first, each
 * struck in its OWN metal — so the bar says how many and how much in the same
 * glance, where a single amber fill would only say how many.
 *
 * `aria-hidden`: the count is printed as text in the head right above it.
 */
function AwardMeter({ achievements }: { achievements: readonly Achievement[] }) {
  const ordered = [
    ...achievements
      .filter((badge) => badge.earned)
      .sort((a, b) => METAL_ORDER[a.tier] - METAL_ORDER[b.tier]),
    ...achievements.filter((badge) => !badge.earned),
  ];
  return (
    <span className="award-meter" aria-hidden="true">
      {ordered.map((badge) => (
        <span
          key={badge.id}
          className={
            badge.earned
              ? `award-meter__pip badge--${badge.tier} award-meter__pip--on`
              : 'award-meter__pip'
          }
        />
      ))}
    </span>
  );
}
