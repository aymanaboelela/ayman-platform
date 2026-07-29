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

Wrapped by `components/site/electric-card.tsx`.

## `splash-cursor.tsx`

- **Source:** <https://reactbits.dev/r/SplashCursor-TS-CSS.json> (React Bits)
- **Fetched:** 2026-07-29
- **Upstream path:** `SplashCursor/SplashCursor.tsx`
- **Runtime dependencies:** none (raw WebGL, no `three`)

Ships with its own `'use client'`; the only edit is `/* eslint-disable */`
inserted after it. There is no CSS file — the component styles inline.

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
