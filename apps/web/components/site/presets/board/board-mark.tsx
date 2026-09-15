import Image from 'next/image';
import { mediaUrl } from '@ayman/ui/branding';
import type { BrandingRead } from '@ayman/contracts/admin/settings';

/**
 * The figure standing in the bottom of the opener panel — the tenant's own
 * uploaded mark, or the board it is written on while there is none.
 *
 * ## Whose image this may be
 *
 * ONLY the deployment's own `branding.logo*AssetId`, uploaded by whoever runs
 * this stack from /admin/settings. It deliberately does NOT go through
 * `<MediaSlot>` / `lib/brand-assets.ts`, which is the registry of Ayman's
 * photography — his hero composite, his cut-out, his studio portrait, his face
 * as the nav avatar. Those are gated by `aymanOnly()` so they would resolve to
 * nothing on another stack anyway, but the fallbacks they hand back instead
 * are HIS page's stand-ins (a lit code pane, a spotlight pool, a `</>`
 * monogram), drawn in his design language for his sections. This preset is a
 * different page for a different person and borrows neither.
 *
 * ## `logoDarkKey` FIRST, and the name of that field is a trap
 *
 * The two logo slots are named after the THEME they are shown in, not after
 * the artwork's own colour — so `logoDark` is the logo an admin uploaded to be
 * legible ON a dark ground, i.e. a light-coloured wordmark. The panel this sits
 * in is a deep accent fill in BOTH themes (see `board-panel.tsx` for why it
 * ignores `data-theme`), so the asset it needs is the dark-theme one
 * regardless of what the visitor's theme is. Reaching for `logoLightKey` first
 * — the obvious reading of "the page is bright, so use the light logo" — puts
 * a near-black wordmark on a navy block, where it is invisible.
 *
 * `logoLightKey` is still the fallback rather than nothing: an admin who
 * uploaded only one file uploaded it to the slot they happened to open, and a
 * slightly-wrong-contrast logo is a far better answer than a letter on a slab
 * when a real logo exists.
 *
 * ## The empty state is a BOARD, not an empty box
 *
 * On a brand-new deployment there is no logo, and there will not be one for
 * days or weeks — an outlined rectangle there would read as an image that
 * failed to load, on the first screen of the first page. What renders instead
 * is the thing this preset is named after: a slab, edge-lit along its top,
 * with the deployment's initial written on it and a rule drawn underneath.
 * It is composed to hold the space on its own, so uploading a logo later
 * changes what is standing there and not whether anything is.
 *
 * `aria-hidden` on both branches, and `alt=""` on the image: the name is
 * already the page's `<h1>` directly above this, so announcing it again here
 * is the same string twice in a row to anyone who cannot see the difference
 * between a wordmark and a heading.
 */
export function BoardMark({ branding, name }: { branding: BrandingRead; name: string }) {
  const key = branding.logoDarkKey ?? branding.logoLightKey;

  if (key) {
    return (
      <div className="board-mark" aria-hidden="true">
        {/*
          `width`/`height` are a PLACEHOLDER ratio, exactly as `<CourseCover>`
          uses one: a branding asset's real dimensions are not in the settings
          payload, and `next/image` will not render without a pair. The CSS
          sets BOTH axes to `auto` under a `max-block-size` cap, which is the
          documented way to override the intrinsic box without tripping Next's
          "either width or height modified, but not the other" warning — and it
          means a square mark and a wide lockup both land correctly without
          this component ever being told which it was handed.

          `sizes` is measured off `.board-mark img`'s cap: it is never wider
          than the panel's content column, which tops out at 34rem.
        */}
        <Image
          src={mediaUrl(key)}
          alt=""
          width={640}
          height={220}
          sizes="(min-width: 48rem) 34rem, 80vw"
          className="board-mark__img"
        />
      </div>
    );
  }

  return (
    <div className="board-mark board-mark--slab" aria-hidden="true">
      <span className="board-mark__slab">
        {/*
          One grapheme, taken the same way `<MarkFallback>` takes its own. It
          is decoration: the whole figure is `aria-hidden`, and a bare letter
          announced on its own would be read as a stray character.

          `charAt(0)` and not a grapheme segmenter, deliberately. Arabic names
          — which is every name this will ever be handed — are not composed of
          surrogate pairs or combining sequences at their first position, and
          pulling `Intl.Segmenter` onto the landing page's render path to be
          theoretically right about an emoji nobody will type is not a trade
          worth making.
        */}
        <span className="board-mark__glyph">{name.trim().charAt(0)}</span>
        <span className="board-mark__rule" />
      </span>
    </div>
  );
}
