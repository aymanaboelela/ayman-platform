import Image from 'next/image';
import { copy } from '@ayman/contracts';
import { getBrandAsset } from '@/lib/brand-assets';

/**
 * The product wordmark: the instructor's portrait plus the name and tagline.
 *
 * This is THE swap point the `</>` monogram was holding open — every logged-in
 * surface renders the brand through this one component (app header and its
 * mobile sheet, admin header, admin sidebar, both auth columns), so the mark
 * only ever changes here. The monogram is still the fallback, and still a
 * finished answer rather than a placeholder, for whenever the registry has no
 * `mark` entry.
 *
 * ⚠️ It is a CIRCLE here, matching the marketing nav, while the monogram
 * fallback keeps its 11px squircle. That is not an inconsistency: an accent
 * tile with two glyphs in it reads as a logo at any radius, but the same face
 * shown as a circle on the landing page and as a rounded square after login
 * reads as two different marks.
 *
 * `tone` selects which colour scale it reads:
 *   - `surface` — the app tokens, so it inverts with the theme (auth form
 *     column, admin sidebar).
 *   - `ink` — fixed light-on-dark, for the panels that stay dark in BOTH
 *     themes (the auth showcase).
 */
export function BrandLockup({
  tone = 'surface',
  showTagline = true,
  compact = false,
}: {
  tone?: 'surface' | 'ink';
  showTagline?: boolean;
  /**
   * Portrait only — the name and tagline are dropped entirely.
   *
   * For the one place that genuinely cannot afford them: the student topbar on
   * a phone. At 360px that bar carries a menu button, this lockup, the
   * notification bell, the theme switch and the account control, and the
   * wordmark «أيمن أبو العلا» is wide enough that the row overflowed and the
   * name rendered ON TOP of the theme switch. The portrait alone still says
   * whose platform this is, the sheet behind the menu button shows the full
   * lockup, and the space it frees is what lets the topbar name the current
   * page instead.
   *
   * Deliberately NOT the default: every other caller has room, and a mark
   * without a name is a weaker brand wherever it is not forced.
   */
  compact?: boolean;
}) {
  const mark = getBrandAsset('mark');

  return (
    <span className="brand" data-tone={tone} data-compact={compact ? 'true' : undefined}>
      {/*
        Decorative in both branches: `.brand__name` states the name right
        beside it, and every call site wraps this in a link that carries its
        own `aria-label`. Announcing the portrait too would say the brand
        twice.
      */}
      <span
        className={mark ? 'brand__mark brand__mark--photo' : 'brand__mark'}
        aria-hidden="true"
      >
        {mark ? (
          <Image src={mark.src} width={mark.width} height={mark.height} alt="" sizes="38px" />
        ) : (
          <>&lt;/&gt;</>
        )}
      </span>
      <span className="brand__text">
        {/*
          `instructor`, not `name` — «المهندس أيمن أبو العلا» rather than
          «أيمن أبو العلا». Asked for directly, and the honorific is how he is
          addressed everywhere else on the platform: the about page, the
          landing hero and every meta description already carry it. The wordmark
          was the one surface that dropped it.

          `copy.site.name` stays the bare name and stays correct where it is
          still used — the footer's copyright line, the nav logo's `alt`, the
          `Person` in the JSON-LD. A structured-data `Person.name` takes the
          name, not the title.
        */}
        <span className="brand__name">{copy.site.instructor}</span>
        {showTagline ? <span className="brand__tag">{copy.site.tagline}</span> : null}
      </span>
    </span>
  );
}
