import { copy } from '@ayman/contracts/copy';
import { getBranding } from '@/lib/settings';
import { tenantName } from '@/lib/tenant';
import { MediaSlot } from '@/components/site/media-slot';

/**
 * The two marks inside the marketing nav's logo link — the round mark and the
 * wordmark beside it — with the instructor's own uploaded file behind the
 * first of them.
 *
 * ## Why this is a separate async Server Component and not two lines in `<SiteNav>`
 *
 * Exactly the shape `<SiteAccountSlot>` already has, for the same three
 * reasons stacked on top of each other:
 *
 * 1. `<SiteNav>` is `'use client'` — it drives ScrollTrigger — so it cannot
 *    `await getBranding()` itself.
 * 2. `(site)/layout.tsx` is deliberately NOT `async` (see its docblock, and
 *    `(app)/layout.tsx` for the transition it costs), so the read cannot be
 *    hoisted there either.
 * 3. `<MediaSlot>` takes the key as a PROP rather than reading it — see the
 *    long note on `tenantKey` in `media-slot.tsx` for the `tsc` failure that
 *    reading it inside the component produced.
 *
 * So the read happens here, inside its own `<Suspense>`, and arrives at the
 * nav as an already-rendered node.
 *
 * ## Why only the round mark gets a key, and the wordmark stays type
 *
 * There is exactly ONE uploaded file that belongs in this header, and it
 * cannot be in two places.
 *
 * `logoDarkAssetId` and `logoLightAssetId` are theme variants of one mark, not
 * two different marks — the names say which GROUND the artwork is drawn for.
 * The nav sits on two grounds: transparent over the hero (dark) and, once
 * pinned, `--site-nav-card`, which is `#ffffff` under the light theme. Handing
 * the same file to both slots would print the tenant's logo twice within
 * 200px, and handing the light variant to the wordmark box would put it on the
 * dark hero where it was never meant to be read.
 *
 * So the file goes where a mark of unknown artwork survives either ground: the
 * 36px circle, which is `object-fit: cover` behind a ring (`.site-mark`). The
 * wordmark stays `<LogoFallback>`'s type lockup, which is not a placeholder —
 * see its note in `media-slot.tsx` — and is what states the platform's name
 * next to a picture that carries `alt=""`.
 *
 * `logoDarkKey` first, matching `<BoardMark>` and `<NeonHero>` to the letter:
 * the state a visitor meets first is `--over`, on the landing hero, which is
 * dark on every preset. `logoLightKey` is the fallback rather than nothing,
 * because an admin who uploaded exactly one file uploaded it to whichever slot
 * they happened to open.
 */
export async function SiteBrandSlot() {
  const branding = await getBranding();

  return <SiteBrandMarks markKey={branding.logoDarkKey ?? branding.logoLightKey} />;
}

/**
 * The same two marks with no key — which is byte-for-byte what this header
 * rendered before the read existed.
 *
 * That makes it the right Suspense fallback rather than a grey box: on Ayman's
 * stack `getBrandAsset('mark')` resolves his registered photograph in BOTH
 * branches, so the boundary resolving changes nothing at all and there is
 * nothing to flash. On any other stack it is the designed `<MarkFallback>`
 * initial for as long as the settings read is in flight.
 */
export function SiteBrandSlotFallback() {
  return <SiteBrandMarks markKey={null} />;
}

function SiteBrandMarks({ markKey }: { markKey: string | null }) {
  return (
    <>
      {/*
        The portrait is decorative here, not informative: the wordmark
        immediately after it states the name, and the Link already carries an
        aria-label. An alt describing the photo would make a screen reader
        announce the same brand twice, so it is empty by intent.

        `sizes` is pinned to the rendered box — the default '100vw' would have
        the browser pick a candidate for a full-width image and pull the
        largest one for a 36px circle.
      */}
      <MediaSlot kind="mark" tenantKey={markKey} alt="" className="site-mark" sizes="36px" />
      {/*
        No `tenantKey`, and that is the decision this file's docblock is about
        rather than the bug it fixed — one uploaded mark cannot fill two boxes.
      */}
      <MediaSlot kind="logo" alt={tenantName(copy.site.name)} />
    </>
  );
}
