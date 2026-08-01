import { copy } from '@ayman/contracts';

/**
 * The product wordmark: a `</>` monogram tile plus the name and tagline.
 *
 * Deliberately typographic rather than an image. `lib/brand-assets.ts` carries
 * no `logo` entry yet, and a drawn logo would have to be swapped in exactly one
 * place — here — when it exists. Until then a wordmark set in the product's own
 * type is a finished answer, not a placeholder.
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
  return (
    <span className="brand" data-tone={tone}>
      <span className="brand__mark" aria-hidden="true">
        &lt;/&gt;
      </span>
      <span className="brand__text">
        <span className="brand__name">{copy.site.name}</span>
        {showTagline ? <span className="brand__tag">{copy.site.tagline}</span> : null}
      </span>
    </span>
  );
}
