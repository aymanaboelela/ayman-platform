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
}: {
  tone?: 'surface' | 'ink';
  showTagline?: boolean;
}) {
  const mark = getBrandAsset('mark');

  return (
    <span className="brand" data-tone={tone}>
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
        <span className="brand__name">{copy.site.name}</span>
        {showTagline ? <span className="brand__tag">{copy.site.tagline}</span> : null}
      </span>
    </span>
  );
}
