# `components/site/vendor`

Third-party components pulled in verbatim. **Do not hand-edit files here** —
re-fetch and re-apply instead, or the next update silently drops your changes.

## `liquid-ether.tsx`

- **Source:** <https://reactbits.dev/r/LiquidEther-TS-CSS.json> (React Bits)
- **Fetched:** 2026-07-29
- **Upstream path:** `LiquidEther/LiquidEther.tsx`
- **Runtime dependency:** `three` (already a direct dependency of this app)

Applied on import, and the only changes made to the file:

1. `'use client'` prepended — the component is a `useEffect`-driven WebGL mount
   and cannot render on the server.
2. `// @ts-nocheck` — this repo runs `noUncheckedIndexedAccess` and
   `noImplicitOverride`, which upstream does not. Fixing ~40 diagnostics inside
   vendored source would be thrown away by the next re-fetch.
3. `/* eslint-disable */` — same reasoning for the lint rules.
4. The CSS import path lowercased to match the filename convention used here.

To update: fetch the JSON again, write `files[].content` out, and re-apply those
edits.

Wrapped by `components/site/liquid-backdrop.tsx`, which is what the rest of the
app imports — the wrapper owns the lazy boundary, the reduced-motion opt-out and
the brand palette, so none of that has to survive a re-vendor.

## `electric-border.tsx`

- **Source:** <https://reactbits.dev/r/ElectricBorder-TS-CSS.json> (React Bits)
- **Fetched:** 2026-07-29
- **Upstream path:** `ElectricBorder/ElectricBorder.tsx`
- **Runtime dependencies:** none

Same three edits as above: `'use client'`, `/* eslint-disable */`, and the CSS
import path lowercased.

**Plus one adaptation that must be re-applied on every update**, marked in the
file with an `ADAPTED FOR THIS REPO` banner over the draw loop: the animation is
gated on an `IntersectionObserver` and `document.hidden`, capped at 30fps, and
cut from ten noise octaves to seven at 3px sampling.

Upstream draws every animation frame from mount onwards, whether or not the card
is on screen. That is affordable for one card in a demo and is not affordable
here — the landing page carries six of these at once, and each redraw walks
~1000 perimeter points calling a ten-octave noise function twice per point.
Measured at 1512x945 under a 4x CPU slowdown: the page ran at **15fps with them
drawing and 30fps without**, and the dragon clip on `#years` presented **14.6 of
its 22.5 frames per second, dropping 39** — which is what "the dragon is a laggy
photograph" turned out to be. With all three changes it presents 23.2, drops 1,
and the page holds 60fps.

None of it changes what the effect looks like. `timeRef` advances by real
elapsed seconds, so the shimmer runs at its old speed on half as many frames; a
border nobody can see is not a border anyone can miss; and the octaves that went
displaced a point by under a pixel while running far past what 3px sampling can
resolve. The restart also resets `lastFrameTimeRef`, without which a card
returning from off screen — or a tab returning from the background, which is an
upstream bug — fast-forwards the noise by however long it was away and snaps.

Wrapped by `components/site/electric-card.tsx`.

## `splash-cursor.tsx`

- **Source:** <https://reactbits.dev/r/SplashCursor-TS-CSS.json> (React Bits)
- **Fetched:** 2026-07-29
- **Upstream path:** `SplashCursor/SplashCursor.tsx`
- **Runtime dependencies:** none (raw WebGL, no `three`)

Ships with its own `'use client'`; `/* eslint-disable */` and `// @ts-nocheck`
are inserted after it. There is no CSS file — the component styles inline.

**Plus one adaptation that must be re-applied on every update**, marked in the
file with two `ADAPTED FOR THIS REPO` banners — one over the hoisted
`DEFAULT_BACK_COLOR`, one over the listener block at the bottom of the effect:
**the effect is made undoable.**

Upstream's `useEffect` returns nothing. It opens a 60Hz `requestAnimationFrame`
loop, attaches five `window` listeners and two `document.body` ones, and takes a
WebGL context, then lets React unmount the canvas out from under all of it.
Every navigation away from a page that mounted this therefore leaks one of each,
per visit, for the life of the tab. The orphaned loop goes cheap rather than free
— with the canvas detached, `resizeCanvas()` reads a `clientWidth` of 0 and
`getResolution()` divides 0/0 into NaN, so the GPU work collapses — but it still
wakes the main thread 60 times a second. The contexts are the real problem:
browsers keep only ~16 alive and force-lose the oldest, so enough round trips
between the landing page and the product will silently blank the LiquidEther
backdrop on `/essentials`, with nothing pointing back here.

None of that is a phone concern — `splash-cursor-mount.tsx` gates the component
off coarse pointers and off reduced motion, so it is desktop-only hygiene.

Four changes carry it, and they are interdependent:

1. The five `window` handlers are lifted out of the `addEventListener` calls into
   named consts, since an inline arrow cannot be removed.
2. The rAF loop keeps its handle (`let raf`), started through a `startFrameLoop`
   guard so the two first-input handlers cannot both start one on a hybrid
   touch-and-trackpad laptop and leave the second uncancellable.
3. The effect returns a cleanup that cancels the loop, removes all seven
   listeners and calls `WEBGL_lose_context.loseContext()` — the same shape as
   `components/atmosphere/hero-shader.tsx`.
4. The `BACK_COLOR` default object literal is hoisted to a module-level
   `DEFAULT_BACK_COLOR`. **This one is load-bearing, not tidying.** Written
   inline it is a fresh object on every render and it sits in the effect's dep
   array, so the effect re-runs; with a cleanup now attached, that re-run calls
   `loseContext()` and then asks the *same* canvas for a context again, which
   returns the lost one. The wake would go dead until unmount.

The touch listeners also pass `{ passive: true }` instead of upstream's bare
`false` (which only ever set `capture`). Window-level touch events are already
passive by default, so this changes no behaviour — it records at the call site
that neither handler calls `preventDefault`.

Wrapped by `components/site/splash-cursor-mount.tsx`, mounted once in the root
layout.

## `rotating-text.tsx`

- **Source:** <https://reactbits.dev/r/RotatingText-TS-CSS.json> (React Bits)
- **Fetched:** 2026-07-29
- **Upstream path:** `RotatingText/RotatingText.tsx`
- **Runtime dependency:** `motion` (already a direct dependency)

This one needed **two adaptations beyond the usual header**, because upstream
assumes a plain Framer Motion setup and this app does not have one:

1. **`motion.span` → `m.span`** (and the matching import). `MotionProvider`
   wraps the app in `<LazyMotion strict>`, under which the full `motion` proxy
   throws at runtime by design — that is the mechanism keeping the 34kB bundle
   out. Only `m` is legal here.
2. **The `layout` props removed.** The lazily-loaded feature bundle is
   `domAnimation`, which deliberately excludes layout projection, and
   `ayman/no-layout-animation` bans the prop outright. With it left in, the
   props are inert at best.

Re-applying these two on every update is the cost of vendoring this one; if it
gets much further from upstream, replace it with an in-house component built on
`m` + `AnimatePresence` instead.

Wrapped by `components/site/rotating-headline.tsx`.
