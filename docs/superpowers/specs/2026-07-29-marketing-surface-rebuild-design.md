# Marketing surface rebuild — design

**Date:** 2026-07-29
**Status:** approved
**Scope:** the public marketing surface — landing page, `/years/[year]`, `/essentials`, `/courses/[slug]`.
**Out of scope:** `/login`, `/register`, and everything behind auth.

## Why

The current landing ("neon lab") reads as generic. The brief is to rebuild the
public surface to match a named reference — <https://kamalelmarakby.com> — in
layout, section composition, interaction and motion, while carrying our own
identity: orange accent instead of the reference's `#9b63e9` purple, our
instructor, our copy, our catalog data.

The reference is CRA + Tailwind 3 + **GSAP 3.15.0** + **Lenis 1.3.23**, `dir="rtl"`,
IBM Plex Sans Arabic for headings/UI and Tajawal for body. We already ship IBM
Plex Sans Arabic and GSAP 3.15; Lenis is the only new dependency.

## Constraint that shapes everything: no photography

The reference's impact is roughly half photographic — a studio-shot instructor
composited with a robot and holographic screens for the hero, a second cutout
for the tracks section, a portrait for the about section, branded course
thumbnails, and a calligraphic logo. We have exactly one usable image
(`public/team/ayman.jpg`, an unstyled phone photo).

The decision is to build the layouts at their real dimensions and fill every
image position with a designed fallback, behind one component:

```
<MediaSlot kind="hero" | "cutout" | "portrait" | "course-thumb" | "logo" />
```

`MediaSlot` resolves `kind` against `lib/brand-assets.ts`. If that registry has
no entry, it renders the fallback for that kind — a composed CSS/SVG panel at
the exact aspect ratio the real asset will occupy. When assets arrive, the only
edit is the registry; no layout, no styles, no component internals change.

This is the whole reason the seam exists. Nothing else in the codebase may
reference a marketing image path directly.

## Architecture

### Motion

Three pieces, each independently testable:

- `components/motion/smooth-scroll.tsx` — mounts Lenis, drives it from GSAP's
  ticker, and registers `ScrollTrigger.scrollerProxy`. One instance, in the
  `(site)` layout only; the app and admin surfaces keep native scrolling.
- `lib/gsap.ts` — the single place `gsap.registerPlugin(ScrollTrigger)` runs,
  exporting configured `gsap` and `ScrollTrigger`. Importing GSAP anywhere else
  risks double registration and a second ticker.
- `components/motion/use-gsap.ts` — a `useGSAP`-style hook wrapping
  `gsap.context()` so every animation is scoped to a ref and reverted on
  unmount. Under `prefers-reduced-motion: reduce`, the hook still runs but
  `gsap.defaults({ duration: 0 })` is applied inside the context, so transforms
  land at their end state instantly and opacity fades are preserved. This
  matches the existing `MotionConfig reducedMotion="user"` policy.

The existing `motion/react` `Reveal`/`RevealItem` stays for the app surface. The
marketing surface uses GSAP. They do not overlap: `Reveal` carries a
`data-orchestrated-reveal` attribute counted by a Playwright assertion, and the
marketing sections do not use it.

### Theme

The marketing surface follows the app's existing `data-theme` mechanism
(`lib/security/theme-script.ts` + `components/theme-toggle.tsx`) rather than
being hard-committed to dark as `.lp` is today.

- Every marketing colour resolves from a semantic variable defined once for both
  themes at `.site` scope.
- The hero is the single exception: always dark, in both themes, because it sits
  behind a dark composite. It gets `color-scheme: dark` and reads the dark ramp
  explicitly rather than the ambient one.
- The navbar toggle is a two-position sun/moon pill matching the reference, not
  the current three-position `system → light → dark` cycle button. `system`
  remains reachable — it is the default until the user touches the pill.

### Colour

The reference's purple maps 1:1 onto our existing amber accent ramp
(`--a-9: oklch(0.770 0.152 72)`). We add a scoped 50–950 orange scale derived
from that hue so the reference's `primary-50 … primary-950` usages have exact
counterparts, defined once in `app/(site)/site.css`. No new global tokens; the
admin/quiz surfaces and the reserved green/red correctness tokens are untouched.

### Layout primitives

`app/(site)/site.css` replaces `app/landing.css`. Scoped to `.site`. Removed
outright: the 52px square grid `.lp::before`, the global `.dot-grid` +
`DotGridSpotlight` mount in the root layout, and the three.js `Neural` scene.

### Data

`/years/[year]` and the landing's featured-courses block both read
`getCatalog()` and filter on `CatalogCourse.year`. No new API surface —
`year`, `coverKey`, `trackLabelAr`, `lessonCount` and `totalSeconds` are already
on the public catalog contract.

## Landing sections

Numbered as they appear top to bottom. Each is one file under
`components/site/`.

1. **`site-nav.tsx`** — fixed. Over-hero state: transparent, full-bleed, no
   shadow. Past the hero: a floating rounded card with surface background,
   hairline border and shadow, with a reading-progress bar flush to its bottom
   edge. Contents: logo slot, theme pill, `تسجيل الدخول` (ghost),
   `حساب جديد` (solid). State flips on a single ScrollTrigger, not a scroll
   listener.

2. **`site-hero.tsx`** — `100svh`, full-bleed, always dark. Media slot on the
   inline-start side; on the inline-end side an eyebrow, a two-line `h1` whose
   second line takes the accent, a lead paragraph, two CTAs, and a four-item
   stats row with vertical dividers anchored to the bottom.

3. **`why-marquee.tsx`** — a flex row: a 42%-wide column holding the heading and
   two paragraphs, and beside it a 720px-tall clipped viewport containing two
   columns of feature cards scrolling vertically in opposite directions
   (~30px/s and ~23px/s), each list tripled for a seamless wrap, with gradient
   fade masks top and bottom. Pauses on hover and under reduced motion.

4. **`featured-courses.tsx`** — heading + lead on one side, `كل الكورسات` on the
   other; a responsive grid of course cards (thumb slot, title, free badge, two
   dated rows, outline CTA). Server component; cards are presentational.

5. **`year-tracks.tsx`** — full-bleed. Ambient orange radial washes, a scattered
   drifting field of low-opacity monospace glyphs, and a receding ground grid
   with a floor glow. Centred eyebrow pill, `h2`, lead. Below: three
   code-editor cards — two flanking at `top: 28%`, one active card centred and
   raised, carrying a filled meta panel, progress ticks and the primary CTA —
   over a cutout slot.

6. **`code-lab.tsx`** — heading + lead, then a toolbar (filename chip, JS badge,
   example `<select>`, `⌘/Ctrl + Enter` hint, run/reset/clear/copy buttons) above
   a split editor/console. Execution stays in the existing sandboxed evaluator
   from `components/landing/playground.tsx`; only the shell is rebuilt.

7. **`about-instructor.tsx`** — a tall accent-lit portrait card with the name and
   role overlaid at its foot, beside the heading, two paragraphs and three
   feature chips.

8. **`site-faq.tsx`** — a tinted panel of accordion rows; circular `±` control on
   the inline-start side, question on the inline-end side, height animated.
   Built on `<details>` so it works without JS.

9. **`site-footer.tsx`** — brand, copyright and a `<Developed … />` mono line on
   one half; a three-column link grid (`الصفحات`, `تابعنا`, `مجتمع الطلاب`,
   `تواصل معنا`) on the other.

## Pages

- **`/years/[year]`** — heading, filter pills (`كل التصنيفات`,
  `الكورسات المجانية`), and the course grid filtered by year. `year` is
  validated against `1 | 2 | 3`; anything else is `notFound()`.
- **`/essentials`** — a `WARM-UP` pill, `قبل ما تكتب أول سطر كود`, a lead
  containing an inline `ready = true` code chip, a CTA, then a grid of numbered
  term cards (mono English name, Arabic name, definition).
- **`/courses/[slug]`** — rebuilt presentation over the existing loader: an
  accent-gradient header band with a back link, title and subtitle; a card
  overlapping its lower edge (thumb slot, free badge, lesson checklist); and
  beside it `عن الكورس` plus a `الدروس` accordion.

## Copy

Every user-facing string goes in `packages/contracts/src/copy/ar.ts` under a new
`site` namespace. No literals in components — the existing rule.

`أيمن أبو العيلة` → `أيمن أبو العلا` everywhere in that file.

## Error handling

- `MediaSlot` never throws on a missing asset; a missing entry *is* the fallback
  path, and it is the default state at time of writing.
- The Lenis mount is a no-op under reduced motion, so the page falls back to
  native scrolling rather than a stuttering emulation.
- `/years/[year]` with a non-numeric or out-of-range segment is a 404, not a
  crash.
- The code lab's evaluator already catches and prints thrown errors to its
  console pane; that behaviour is preserved.

## Testing

- Unit (vitest): `MediaSlot` resolution — registered asset renders an image,
  unregistered renders the fallback for that kind; `/years/[year]` param
  validation; marquee list tripling produces a seam-free offset.
- E2E (playwright): landing renders all nine sections in order; the navbar flips
  to its scrolled state past the hero; the FAQ opens with JS disabled; axe
  passes on the landing, `/years/1` and `/essentials` in both themes.
- Visual: 390 / 768 / 1440 in light and dark, checked against the captured
  reference screenshots.

## Notes

The reference site is a competitor's product. What is being reproduced is layout
and interaction — its copy, images, logo and code are not copied; ours are
written for this platform.
