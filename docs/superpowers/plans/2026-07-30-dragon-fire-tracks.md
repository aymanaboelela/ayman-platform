# Dragon Fire Tracks Entrance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the standalone `FireReveal` section with a dragon that flies
in behind the three "choose your year" cards, turns, breathes fire, and whose
fire breath is the trigger that blooms those cards open — all GSAP/ScrollTrigger,
no scroll-scrubbed video. Bump the page-long mascot to its new, bigger flight
clip. Encode and register (but do not place) a third "standing" clip.

**Architecture:** Three new alpha-video assets replace/extend the existing
`dragon.webm/mov` + retiring `fire.webm/mov` pair, encoded with the project's
existing `scripts/encode-dragon.sh` chromakey pipeline. `YearTracks` gains a
single `useGsap` scope that owns a new presentational `TracksDragon` video
component, a `timeupdate`-driven fire-peak trigger (the same mechanism
`FireReveal` already uses for `FIRE_PEAK_S`), and a retimed card-bloom tween.
`FireReveal` and its assets/copy are deleted outright.

**Tech Stack:** Next.js (App Router), GSAP 3 + ScrollTrigger (`lib/gsap.ts`,
`components/motion/use-gsap.ts`), `scripts/encode-dragon.sh` (ffmpeg chromakey
→ VP9-alpha WebM + HEVC-alpha MOV), Arabic copy via `@ayman/contracts`.

## Global Constraints

- No literal user-facing strings in components — everything goes through
  `packages/contracts/src/copy/ar.ts` under `copy.landing`.
- Entrance animations use `gsap.from()`/`fromTo()`, never `gsap.to()` off a CSS
  start state — see the reduced-motion contract in `components/motion/use-gsap.ts:32-47`.
  Under `prefers-reduced-motion: reduce`, content must render in its final,
  fully visible state with no video requested or played.
- Anything referenced from inside a `useGsap` scope that lives OUTSIDE that
  scope's DOM subtree (a different section, the document) must be passed as an
  element reference (`document.querySelector(...)`), never a bare selector
  string — a scoped `gsap.context()` resolves selector strings only within its
  own scope. See `components/site/dragon-sprite.tsx:171-179` for the existing
  example (the mascot fading near the footer).
- The site is RTL (`dir="rtl"`). `inset-inline-end` is the LEFT edge of the
  viewport, not the right — confirmed from the comment directly above `.dragon`
  in `sections.css:205-207`. Any new "which side does it fly in from" decision
  must account for this.
- No automated test suite covers `components/site/*` or `components/motion/*`
  in this codebase today (checked: zero `*.test.*`/`*.spec.*` files under
  either directory). This plan follows that established pattern rather than
  introducing one-off tests for a single feature — see the codebase note under
  Task 6. Verification is `pnpm typecheck` + `pnpm lint` (real, project-wide
  gates) plus a concrete manual pass in the dev server, spelled out per task.
- Video assets go in `apps/web/public/brand/`; the encode pipeline is
  `scripts/encode-dragon.sh <input> [output-basename]`, reused as-is (see its
  header comment for the full recipe this plan builds on).
- Design doc: `docs/superpowers/specs/2026-07-30-dragon-fire-tracks-design.md`.

---

## Task 1: Retire the FireReveal section

**Files:**
- Delete: `apps/web/components/site/fire-reveal.tsx`
- Delete: `apps/web/public/brand/fire.mov`
- Delete: `apps/web/public/brand/fire.webm`
- Modify: `apps/web/app/(site)/page.tsx:4` (import), `:20` (`<FireReveal />`)
- Modify: `apps/web/app/(site)/styles/sections.css:2090-2199` (delete the whole
  `.reveal*` block — starts at the `/* The fire reveal — ... */` header comment,
  ends at the closing `}` of its `@media (max-width: 63.99rem)` block)
- Modify: `apps/web/lib/brand-assets.ts:162-184` (delete the `FIRE_VIDEO` doc
  comment + constant, and the `FIRE_PEAK_S` constant)
- Modify: `packages/contracts/src/copy/ar.ts` — delete the four keys
  `revealBadge`, `revealTitle`, `revealLead`, `revealCta` (currently around
  line 295-298, inside `copy.landing`; confirm the exact lines with
  `grep -n "revealBadge" packages/contracts/src/copy/ar.ts` before editing,
  since line numbers drift)

**Interfaces:**
- Produces: nothing new. This task only removes dead surface area so later
  tasks add to a clean file.
- Consumes: nothing.

- [ ] **Step 1: Delete the FireReveal component and its video assets**

```bash
git rm apps/web/components/site/fire-reveal.tsx
git rm apps/web/public/brand/fire.mov apps/web/public/brand/fire.webm
```

- [ ] **Step 2: Remove FireReveal from the landing page composition**

In `apps/web/app/(site)/page.tsx`, delete line 4
(`import { FireReveal } from '@/components/site/fire-reveal';`) and line 20
(`<FireReveal />`). The file should read:

```tsx
import { SiteHero } from '@/components/site/site-hero';
import { WhyRail } from '@/components/site/why-rail';
import { FeaturedCourses } from '@/components/site/featured-courses';
import { YearTracks } from '@/components/site/year-tracks';
import { CodeLab } from '@/components/site/code-lab';
import { AboutInstructor } from '@/components/site/about-instructor';
import { SiteFaq } from '@/components/site/site-faq';

/**
 * The landing page is a composition and nothing else — every section owns its
 * own data, markup and motion. Reordering the page is reordering this list.
 */
export default function HomePage() {
  return (
    <main>
      <SiteHero />
      <WhyRail />
      <FeaturedCourses />
      <YearTracks />
      <CodeLab />
      <AboutInstructor />
      <SiteFaq />
    </main>
  );
}
```

- [ ] **Step 3: Remove the `.reveal*` CSS block**

In `apps/web/app/(site)/styles/sections.css`, delete lines 2090-2199 (the
entire block from the `/* The fire reveal — ... */` header comment through the
closing brace of `@media (max-width: 63.99rem) { .reveal { ... } }`). Leave a
single blank line where it was, matching the spacing between other section
blocks in the file.

- [ ] **Step 4: Remove `FIRE_VIDEO` and `FIRE_PEAK_S` from the asset registry**

In `apps/web/lib/brand-assets.ts`, delete the doc comment and constant at
lines 162-184 (`/** The roar-and-fire clip ... */`, `export const FIRE_VIDEO`,
the `FIRE_PEAK_S` doc comment, `export const FIRE_PEAK_S = 2.42;`). The file
should end at `export const DRAGON_VIDEO` (currently lines 145-160) with
nothing after it — Tasks 3 and 4 add the next constants there.

- [ ] **Step 5: Remove the retiring copy keys**

```bash
grep -n "revealBadge\|revealTitle\|revealLead\|revealCta" packages/contracts/src/copy/ar.ts
```

Delete those four lines (`revealBadge: '...'`, `revealTitle: '...'`,
`revealLead: '...'`, `revealCta: '...'`) from inside `copy.landing`. Do not add
replacement copy — `YearTracks` already has its own heading
(`tracksSelectBadge` / `Title` / `Lead`), and Task 6 removes the need for a
separate CTA button.

- [ ] **Step 6: Typecheck and lint**

```bash
cd apps/web && pnpm typecheck && pnpm lint
```

Expected: both pass clean. If typecheck fails on a leftover `FireReveal` or
`FIRE_VIDEO`/`FIRE_PEAK_S` reference, grep for it
(`grep -rn "FireReveal\|FIRE_VIDEO\|FIRE_PEAK_S" apps/web`) — every reference
should be gone.

- [ ] **Step 7: Manual verification**

```bash
cd apps/web && pnpm dev
```

Open the landing page at a desktop width. Confirm: the page still renders
Hero → Why → Featured Courses → Year Tracks (cards visible, current plain
entrance) → Code Lab → About → FAQ, with no gap or console error where
`FireReveal` used to sit, and no 404s in the network tab for `/brand/fire.mov`
or `/brand/fire.webm`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(web): retire the fire-reveal section

Its dragon-and-fire moment is being rebuilt inside the tracks cards
entrance instead of standing alone — see the design doc."
```

---

## Task 2: Re-encode the page-long mascot's flight loop and bump its size

**Files:**
- Modify (regenerate binaries): `apps/web/public/brand/dragon.webm`,
  `apps/web/public/brand/dragon.mov`
- Modify: `apps/web/app/(site)/styles/sections.css:213` (`.dragon` width)

**Interfaces:**
- Produces: no new exported symbols — `DRAGON_VIDEO` in `brand-assets.ts`
  already points at `/brand/dragon.webm` / `/brand/dragon.mov`, so
  `dragon-sprite.tsx` needs no code change, only new bytes at those paths.
- Consumes: `scripts/encode-dragon.sh` (unmodified).

- [ ] **Step 1: Verify the chromakey and crop values on the new source**

The new source is `~/Downloads/Dragon_flying_in_static_frame_202607292220.mp4`
(1280×720, 24fps, 10s, green screen — already confirmed by direct frame
inspection: the dragon flies in place with no turn and no fire, safe to use
in full). Measured values, reusable directly:

```bash
# Background colour (sampled from a clean corner patch):
ffmpeg -i ~/Downloads/Dragon_flying_in_static_frame_202607292220.mp4 \
  -vf "crop=40:40:20:20" -frames:v 1 -f rawvideo -pix_fmt rgb24 - | xxd -l3
# → 0c 8f 41  (KEY=0x0C8F41 — close to, but not identical to, the existing
#   0x0C8D36; this clip is a different generation batch, sample fresh rather
#   than reusing the old constant)
```

Content bounding box, measured across the WHOLE clip (composited over a black
canvas and cropdetected, which sidesteps an `alphaextract`-format bug in this
ffmpeg build — do not use the `alphaextract,cropdetect` recipe from the script
header as written; it fails to negotiate formats on ffmpeg 8.1.2):

```bash
ffmpeg -f lavfi -i color=black:size=1280x720:duration=10 \
  -i ~/Downloads/Dragon_flying_in_static_frame_202607292220.mp4 \
  -filter_complex "[1:v]chromakey=0x0C8F41:0.16:0.06[keyed];[0:v][keyed]overlay=shortest=1,cropdetect=limit=16:round=2:reset=0[out]" \
  -map "[out]" -f null - 2>&1 | grep -o "crop=[0-9:]*" | tail -1
# → crop=580:564:414:102  (CROP=580:564:414:102)
```

Verify the alpha is clean before encoding (per the script's own documented
rule — look at it, don't trust the numbers alone):

```bash
ffmpeg -y -ss 2 -i ~/Downloads/Dragon_flying_in_static_frame_202607292220.mp4 \
  -vf "crop=580:564:414:102,chromakey=0x0C8F41:0.16:0.06,despill=type=green:mix=0.5:expand=0.3" \
  -frames:v 1 /tmp/dragon-loop-alpha-check.png
```

Open `/tmp/dragon-loop-alpha-check.png`. Expected: clean dragon silhouette, no
green fringe, no clipped wingtips (this exact recipe was already verified
during planning and produced a clean result — this step is a regression check,
not exploratory).

- [ ] **Step 2: Encode**

The mascot's CSS size is increasing in Step 4 from a 288px to a 368px max
render width, so the WebM target width doubles accordingly for retina
(736 ≈ 2 × 368, rounded to a clean number; MOV width kept at the same ~0.83
ratio the existing default uses):

```bash
KEY=0x0C8F41 CROP=580:564:414:102 WIDTH=736 MOV_WIDTH=614 FPS=20 \
  scripts/encode-dragon.sh ~/Downloads/Dragon_flying_in_static_frame_202607292220.mp4 dragon
```

This overwrites `apps/web/public/brand/dragon.webm` and `dragon.mov` in place.
Expected console output: file sizes for both, printed by the script's own
final `ls -lh`.

- [ ] **Step 3: Bump the mascot's on-screen size**

In `apps/web/app/(site)/styles/sections.css`, change line 213:

```css
/* before */
  width: min(24vw, 18rem);
/* after */
  width: min(30vw, 23rem);
```

- [ ] **Step 4: Typecheck and lint**

```bash
cd apps/web && pnpm typecheck && pnpm lint
```

No code changed in this task, so this is a fast sanity check — expected to
pass trivially.

- [ ] **Step 5: Manual verification**

```bash
cd apps/web && pnpm dev
```

At a viewport ≥ 64rem wide, scroll from the top of the landing page to the
footer. Confirm: the mascot is visibly bigger than before, still flies its
lazy S-curve down the page, still banks/flips to face its direction of travel,
still fades out approaching the footer, and shows no green fringe or black-box
flash on any frame. Resize under 64rem and confirm it disappears entirely (no
video request in the network tab).

- [ ] **Step 6: Commit**

```bash
git add apps/web/public/brand/dragon.webm apps/web/public/brand/dragon.mov \
  "apps/web/app/(site)/styles/sections.css"
git commit -m "feat(web): fly a bigger dragon down the page

New source clip, re-keyed and re-encoded at the mascot's new,
larger on-screen size."
```

---

## Task 3: Encode the tracks fire-dragon clip and measure its real fire-peak timestamp

This is the highest-risk asset in the plan — read Step 1 fully before running
anything. The source clip's green screen is **not** uniform across its own
duration: the background colour measurably drifts (fire light bloom, and very
likely a spliced-in shot right at the fire beat — see the SEI marker below),
and a straightforward `chromakey`/`colorkey` call that works perfectly on the
flying portions goes fully inert (matches nothing, at *any* similarity up to
`1.0`) on frames right around the fire. This was reproduced repeatedly during
planning across several extraction methods, so budget real time for Step 4,
not just Step 3.

**Files:**
- Create (binaries): `apps/web/public/brand/dragon-fire.webm`,
  `apps/web/public/brand/dragon-fire.mov`
- Modify: `apps/web/lib/brand-assets.ts` (append `TRACKS_DRAGON_VIDEO`,
  `TRACKS_FIRE_PEAK_S`)

**Interfaces:**
- Produces: `TRACKS_DRAGON_VIDEO: DragonVideo | undefined` and
  `TRACKS_FIRE_PEAK_S: number`, both exported from `apps/web/lib/brand-assets.ts`.
  Task 5 and Task 6 import both by name.
- Consumes: `scripts/encode-dragon.sh`; the `DragonVideo` type already defined
  in `brand-assets.ts:140-143`.

- [ ] **Step 1: Trim the source to a frame-accurate intermediate file**

Source: `~/Downloads/Dragon_flying_and_breathing_fire_202607292222.mp4`
(1280×720, 24fps, 10s). Measured (ffmpeg `signalstats`, mean luma of the lower
half of frame, same method `FIRE_PEAK_S` used originally): baseline ~100 until
~5.0s, ramping as the dragon turns to face forward, **peaking at 6.58s**
(luma 138.8, on a plateau from ~5.8–6.9s), decaying back to baseline by ~7.9s.

`ffprobe` also shows a keyframe with an `H.264 User Data Unregistered SEI
message` at frame 158 (= 6.583s) — almost exactly the measured peak. That is
very likely where a separately-rendered "hero fire" shot was spliced into the
flying footage, which is the most plausible explanation for the colour drift
in Step 4.

Trim 3.0s–9.3s of raw source (a short flying pre-roll, the full turn/fire/decay,
a short exit) via a **re-encode**, not stream copy — stream-copy trimming
snaps to the nearest keyframe and would throw off the peak-timestamp math
below:

```bash
ffmpeg -y -ss 3.0 -t 6.3 -i ~/Downloads/Dragon_flying_and_breathing_fire_202607292222.mp4 \
  -c:v libx264 -crf 12 -preset veryfast -an \
  /tmp/dragon-fire-trimmed.mp4
```

This lands the measured fire peak at **3.58s** in the trimmed file
(6.58 − 3.0). That number is `TRACKS_FIRE_PEAK_S` in Step 5 — it does not
change regardless of how Step 4's keying is resolved, since trim timing and
keying are independent.

- [ ] **Step 2: Sample background colour and crop box on the TRIMMED file**

Re-sample against the trimmed file, not the raw source (the trim's re-encode
can shift pixel values slightly at the edges of the CRF range). Measured
during planning, on the raw source's opening corner: `0x09A436` — expect
something very close to this on the trimmed file too, since the trim's start
(3.0s raw) is still well before the colour drift discussed above begins
(~5.0s raw):

```bash
ffmpeg -i /tmp/dragon-fire-trimmed.mp4 -vf "crop=40:40:20:20" \
  -frames:v 1 -f rawvideo -pix_fmt rgb24 - | xxd -l3
# expect ≈ 09 a4 36 (KEY=0x09A436) — if it differs noticeably, use the fresh value
```

Content bounding box (same black-composite technique as Task 2 — the wings are
nearly full-frame during the fire-breath pose, this is expected, not a
detection error):

```bash
ffmpeg -f lavfi -i color=black:size=1280x720:duration=7 \
  -i /tmp/dragon-fire-trimmed.mp4 \
  -filter_complex "[1:v]chromakey=0x09A436:0.16:0.06[keyed];[0:v][keyed]overlay=shortest=1,cropdetect=limit=16:round=2:reset=0[out]" \
  -map "[out]" -f null - 2>&1 | grep -o "crop=[0-9:]*" | tail -1
```

Expect a box close to `1280:708:0:12` (measured on the untrimmed source during
planning) — i.e. effectively full width, ~98% of the height. If the measured
box differs meaningfully once run on the trimmed file, use the fresh number.

- [ ] **Step 3: Verify the alpha at MULTIPLE points, not just one**

This is the step that catches the colour-drift problem before it ships. Check
at least four timestamps spanning the trimmed clip — pre-fire, ramp-in, peak,
and post-fire — not only the peak:

```bash
for T in 0.5 2.2 3.58 5.5; do
  ffmpeg -y -ss "$T" -i /tmp/dragon-fire-trimmed.mp4 \
    -vf "crop=1280:708:0:12,colorkey=0x09A436:0.20:0.06" \
    -frames:v 1 "/tmp/fire-check-$T.png"
done
```

(swap in the freshly-measured colour from Step 2 if it differed from
`0x09A436`).

Open all four. Expected failure mode if it recurs: the pre-fire/post-fire
timestamps key cleanly (transparent/white background) while the frames at and
around the peak (~3.3–4.6s in the trimmed timeline, corresponding to the
5.8–7.1s plateau in raw time) stay solid green even at high `similarity`.

If that happens, do not keep raising `similarity` — it was tested up to `1.0`
during planning with zero effect on the affected frames, so it is not a
threshold problem. Two escalation paths, in order:

1. **Re-sample the key colour from inside the affected window specifically**
   (e.g. a background patch adjacent to the flame at `t≈3.58`, not the clip's
   opening frame) and re-run Step 3's check across all four timestamps again.
2. **If no single colour/threshold covers the whole trimmed clip**, split it
   at the SEI keyframe and key the two halves separately before the alpha
   encode:

   ```bash
   ffmpeg -y -i /tmp/dragon-fire-trimmed.mp4 -t 3.3 -c:v libx264 -crf 12 -an /tmp/fire-part-a.mp4
   ffmpeg -y -i /tmp/dragon-fire-trimmed.mp4 -ss 3.3 -c:v libx264 -crf 12 -an /tmp/fire-part-b.mp4
   # key each part with its own locally-sampled KEY/SIM (repeat Steps 2-3 per part), producing
   # /tmp/fire-part-a-keyed.mov and /tmp/fire-part-b-keyed.mov (yuva420p, ProRes 4444 or similar
   # alpha-safe intermediate codec — NOT a final delivery codec, this is a splice intermediate),
   # then concatenate before Step 4's final encode:
   ffmpeg -y -i /tmp/fire-part-a-keyed.mov -i /tmp/fire-part-b-keyed.mov \
     -filter_complex "[0:v][1:v]concat=n=2:v=1:a=0,format=yuva420p[out]" \
     -map "[out]" -c:v prores_ks -profile:v 4444 /tmp/fire-recombined.mov
   ```

   Feed `/tmp/fire-recombined.mov` into Step 4 in place of `/tmp/dragon-fire-trimmed.mp4`.

- [ ] **Step 4: Encode**

Once Step 3 shows a clean alpha across all four checkpoints:

```bash
KEY=0x09A436 CROP=1280:708:0:12 SIM=0.20 BLEND=0.06 WIDTH=1280 MOV_WIDTH=960 \
  FPS=24 CRF=38 \
  scripts/encode-dragon.sh /tmp/dragon-fire-trimmed.mp4 dragon-fire
```

(swap in whatever `KEY`/`CROP`/`SIM` Steps 2-3 actually landed on if they
differed from these starting values).

Notes on the non-default values: `WIDTH=1280` is the source's own cropped
width, not a 2×-retina multiple — this clip renders large enough that the
source resolution is the real ceiling, upscaling past it wastes bytes without
adding detail. `FPS=24` (vs. the wingbeat loop's `20`) keeps the one-shot
hero moment smooth. `CRF=38` (vs. the default `46`) spends more bytes on
quality here specifically because this is the sequence's dramatic peak — the
thing the brand owner explicitly wants to look impressive.

This writes `apps/web/public/brand/dragon-fire.webm` and
`apps/web/public/brand/dragon-fire.mov`.

- [ ] **Step 5: Register the asset and the measured peak**

Append to `apps/web/lib/brand-assets.ts` (after the `DRAGON_VIDEO` block that
now ends the file, per Task 1 Step 4):

```ts
/**
 * The big dragon behind the "choose your year" cards — flies in, turns to
 * face forward, breathes fire, flies on. Used by `<TracksDragon>` inside
 * `YearTracks`, not the page-long mascot.
 *
 * `TRACKS_FIRE_PEAK_S` is measured off the source the same way `FIRE_PEAK_S`
 * was: the mean luma of the frame's lower half peaks at 6.58s in the raw
 * clip, and this one is trimmed to start at 3.0s, so it lands at 3.58s here.
 * The cards' bloom is timed to it — see `year-tracks.tsx`.
 */
export const TRACKS_DRAGON_VIDEO: DragonVideo | undefined = {
  webm: '/brand/dragon-fire.webm',
  mov: '/brand/dragon-fire.mov',
};

/** Seconds into `TRACKS_DRAGON_VIDEO` at which the flame is at full height. */
export const TRACKS_FIRE_PEAK_S = 3.58;
```

If Step 3 needed re-trimming (a different start point than 3.0s), recompute
this constant as `6.58 - <actual trim start>` and update the doc comment's
numbers to match.

- [ ] **Step 6: Typecheck and lint**

```bash
cd apps/web && pnpm typecheck && pnpm lint
```

- [ ] **Step 7: Manual verification**

Play the encoded files directly (`open apps/web/public/brand/dragon-fire.webm`
or equivalent) end to end at normal speed. Confirm: flies in, turns, breathes
fire with a clean (non-green, non-fringed) background throughout — including
through the peak — flies on, no visible seam if Step 3's split-and-concat path
was used.

- [ ] **Step 8: Commit**

```bash
git add apps/web/public/brand/dragon-fire.webm apps/web/public/brand/dragon-fire.mov \
  apps/web/lib/brand-assets.ts
git commit -m "feat(web): encode and register the tracks fire-dragon clip

Fire-peak timestamp measured off the source, same method FIRE_PEAK_S
used — see the doc comment on TRACKS_FIRE_PEAK_S."
```

---

## Task 4: Encode and register the idle dragon clip (deferred, unplaced)

**Files:**
- Create (binaries): `apps/web/public/brand/dragon-idle.webm`,
  `apps/web/public/brand/dragon-idle.mov`
- Modify: `apps/web/lib/brand-assets.ts` (append `DRAGON_IDLE_VIDEO`)

**Interfaces:**
- Produces: `DRAGON_IDLE_VIDEO: DragonVideo | undefined`, exported from
  `apps/web/lib/brand-assets.ts`. No consumers — this mirrors the file's
  existing pattern of pre-registering assets before a page uses them (see the
  commented-out `cutout` / `portrait` / `logo` entries in `brandAssets`).
- Consumes: `scripts/encode-dragon.sh`.

This asset is not wired into any live trigger, so it does not need the
frame-accurate peak measurement Task 3 needed — reasonable values are enough.

- [ ] **Step 1: Sample colour and crop, trim**

Source: `~/Downloads/Fire_dragon_spins_and_roars_202607292027.mp4`
(1920×1080, 24fps, 10s — a different resolution and generation batch from the
other two, sample fresh):

```bash
ffmpeg -i ~/Downloads/Fire_dragon_spins_and_roars_202607292027.mp4 \
  -vf "crop=40:40:20:20" -frames:v 1 -f rawvideo -pix_fmt rgb24 - | xxd -l3
# → 3e 8a 44  (KEY=0x3E8A44)
```

This clip's luma (measured during planning) ramps from a ~106 baseline
starting ~6.25s, peaks ~173 around 6.9-7.0s, back to baseline by ~7.9s — the
same shape as Task 3's clip, offset slightly later. Trim 3.2s–9.5s (re-encode,
not copy, for consistency with Task 3 even though exact-frame precision isn't
required here):

```bash
ffmpeg -y -ss 3.2 -t 6.3 -i ~/Downloads/Fire_dragon_spins_and_roars_202607292027.mp4 \
  -c:v libx264 -crf 12 -preset veryfast -an \
  /tmp/dragon-idle-trimmed.mp4
```

Content bounding box:

```bash
ffmpeg -f lavfi -i color=black:size=1920x1080:duration=7 \
  -i /tmp/dragon-idle-trimmed.mp4 \
  -filter_complex "[1:v]chromakey=0x3E8A44:0.16:0.06[keyed];[0:v][keyed]overlay=shortest=1,cropdetect=limit=16:round=2:reset=0[out]" \
  -map "[out]" -f null - 2>&1 | grep -o "crop=[0-9:]*" | tail -1
```

Expect something close to `1920:1020:0:60` (measured on the untrimmed source
during planning — again nearly full-frame, the standing/roaring pose spreads
its wings edge to edge same as Task 3's clip).

- [ ] **Step 2: Verify the alpha before encoding**

Same colour-drift risk as Task 3 potentially applies here (same "turn to face
camera + breathe fire" shot structure). Check at least the pre-fire and peak
timestamps:

```bash
for T in 0.5 3.7; do
  ffmpeg -y -ss "$T" -i /tmp/dragon-idle-trimmed.mp4 \
    -vf "crop=1920:1020:0:60,colorkey=0x3E8A44:0.20:0.06" \
    -frames:v 1 "/tmp/idle-check-$T.png"
done
```

If the peak frame fails to key the same way Task 3's did, apply the same
escalation (re-sample locally, or split-and-concat) described in Task 3 Step 3
— do not spend time re-diagnosing from scratch, the same fix applies.

- [ ] **Step 3: Encode**

Unplaced asset, so a moderate budget rather than the fire clip's premium
settings:

```bash
KEY=0x3E8A44 CROP=1920:1020:0:60 SIM=0.20 BLEND=0.06 WIDTH=1280 MOV_WIDTH=960 \
  FPS=20 \
  scripts/encode-dragon.sh /tmp/dragon-idle-trimmed.mp4 dragon-idle
```

- [ ] **Step 4: Register it, unconsumed**

Append to `apps/web/lib/brand-assets.ts`, after `TRACKS_FIRE_PEAK_S`:

```ts
/**
 * The dragon standing (legs planted, not flying) and breathing fire — a
 * variant of `TRACKS_DRAGON_VIDEO` for a future card or page mascot. NOT
 * consumed anywhere yet. Fill in a placement the same way a photo gets
 * dropped into `brandAssets` above: this constant stays put, only a
 * component's `import` changes when a home for it is decided.
 */
export const DRAGON_IDLE_VIDEO: DragonVideo | undefined = {
  webm: '/brand/dragon-idle.webm',
  mov: '/brand/dragon-idle.mov',
};
```

- [ ] **Step 5: Typecheck and lint**

```bash
cd apps/web && pnpm typecheck && pnpm lint
```

Expected: passes. An unused exported constant is not a lint error in this
codebase's config (`DRAGON_SHEET` already ships in the same file, unused
whenever `DRAGON_VIDEO` is set — same pattern).

- [ ] **Step 6: Manual verification**

Play `apps/web/public/brand/dragon-idle.webm` directly. Confirm a clean,
fringe-free alpha throughout, including the standing/fire beat.

- [ ] **Step 7: Commit**

```bash
git add apps/web/public/brand/dragon-idle.webm apps/web/public/brand/dragon-idle.mov \
  apps/web/lib/brand-assets.ts
git commit -m "feat(web): encode and register the standing dragon clip

Not wired into any page — placement is deferred, per the brand owner."
```

---

## Task 5: Build the TracksDragon presentational component and its stage CSS

**Files:**
- Create: `apps/web/components/site/tracks-dragon.tsx`
- Modify: `apps/web/app/(site)/styles/sections.css` (append new rules after
  the `.tracks__card--active` block, currently ending around line 968)

**Interfaces:**
- Produces: `TracksDragon`, a component with signature
  `function TracksDragon({ videoRef }: { videoRef: RefObject<HTMLVideoElement | null> }): JSX.Element | null`,
  exported from `apps/web/components/site/tracks-dragon.tsx`. Task 6 renders
  it inside `.tracks__stage` and reads/controls the forwarded video element
  through `videoRef`.
- Consumes: `TRACKS_DRAGON_VIDEO` from `apps/web/lib/brand-assets.ts` (Task 3);
  `useMediaQuery` from `@/lib/use-media-query` (existing hook, already used by
  `dragon-sprite.tsx` and the retired `fire-reveal.tsx` for the same
  64rem breakpoint).

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { type RefObject } from 'react';
import { TRACKS_DRAGON_VIDEO } from '@/lib/brand-assets';
import { useMediaQuery } from '@/lib/use-media-query';

/**
 * The big dragon behind the "choose your year" cards. Pure markup — every
 * tween, the fire-peak listener, and the replay contract live in
 * `year-tracks.tsx`, which owns the whole section's choreography in one
 * `useGsap` scope. This component only forwards a ref to the `<video>` so
 * that scope can drive it.
 *
 * `preload="auto"` fetches regardless of CSS visibility, so hiding this
 * below 64rem with `display: none` alone would still cost a phone visitor
 * the download. Not rendering the `<video>` at all is what actually prevents
 * it — the same reason `DragonSprite` and the retired `FireReveal` both
 * gate their own `<video>` the same way rather than relying on CSS.
 */
export function TracksDragon({
  videoRef,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const wide = useMediaQuery('(min-width: 64rem)', false);

  if (!wide || !TRACKS_DRAGON_VIDEO) return null;

  return (
    <div className="tracks__dragon" aria-hidden="true">
      <video
        ref={videoRef}
        className="tracks__dragon-video"
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        controls={false}
      >
        <source src={TRACKS_DRAGON_VIDEO.webm} type="video/webm" />
        <source src={TRACKS_DRAGON_VIDEO.mov} type="video/quicktime" />
      </video>
    </div>
  );
}
```

- [ ] **Step 2: Add its CSS**

Append to `apps/web/app/(site)/styles/sections.css`, directly after the
`.tracks__card--active` rule (around line 968, before the `/* ---- the
code-window card itself ---- */` comment):

```css
/* The big dragon behind the cards, in front of the cutout — z-index sits
   between `.tracks__cutout` (10) and `.tracks__card*` (30/40). Enters from
   the LEFT: under `dir="rtl"` that is `inset-inline-end`, the same side the
   page-long mascot flies down (see `.dragon` above), so the two read as one
   dragon continuing its flight rather than two unrelated elements. Starting
   state (`opacity: 0`) is set here, in CSS, not by the entrance tween — see
   the reduced-motion contract in `use-gsap.ts`: a `gsap.to()` off a CSS
   `opacity: 0` would leave this permanently invisible under reduced motion.
   `year-tracks.tsx` only ever animates it under `!reduced`. */
.tracks__dragon {
  position: absolute;
  inset-inline-end: -8%;
  bottom: 6%;
  z-index: 20;
  width: min(48vw, 40rem);
  aspect-ratio: 16 / 9;
  opacity: 0;
  pointer-events: none;
  will-change: transform, opacity;
}

.tracks__dragon-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* Same reasoning as `.dragon` in the page-long mascot: no staged layout to
   fly behind below the pin breakpoint, and DragonSprite is already hidden
   there too. */
@media (max-width: 63.99rem) {
  .tracks__dragon {
    display: none;
  }
}
```

- [ ] **Step 3: Typecheck and lint**

```bash
cd apps/web && pnpm typecheck && pnpm lint
```

Expected: passes. `TracksDragon` is not imported anywhere yet (Task 6 does
that), so this only checks the new file compiles on its own.

- [ ] **Step 4: Manual verification**

No visual check yet — nothing renders this component until Task 6. Confirm
only that `pnpm build` (or `pnpm typecheck`) doesn't flag `tracks-dragon.tsx`
as an unused-export problem (it isn't; TypeScript doesn't error on unimported
exports, only unused *local* bindings).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/site/tracks-dragon.tsx "apps/web/app/(site)/styles/sections.css"
git commit -m "feat(web): add the tracks-dragon presentational component"
```

---

## Task 6: Wire the dragon-fire-bloom choreography into YearTracks

This is where the pieces from Tasks 3-5 assemble into the actual sequence
described in the design doc. It replaces `YearTracks`'s current independent
`scrollTrigger: { trigger: scope, start: 'top 70%' }` stagger on
`[data-track-card]` with one driven off the dragon's fire-peak crossing — on
wide viewports only. Below 64rem, `TracksDragon` renders nothing (Task 5), so
this task keeps the ORIGINAL plain stagger alive as a fallback there, rather
than leaving mobile with no card entrance at all.

**Files:**
- Modify: `apps/web/components/site/year-tracks.tsx`

**Interfaces:**
- Consumes: `TracksDragon` (Task 5), `TRACKS_DRAGON_VIDEO` /
  `TRACKS_FIRE_PEAK_S` (Task 3), `gsap` / `ScrollTrigger` from `@/lib/gsap`,
  `useGsap` from `@/components/motion/use-gsap`, `useMediaQuery` from
  `@/lib/use-media-query` (already used by `dragon-sprite.tsx` /
  `fire-reveal.tsx` for the identical breakpoint).
- Produces: nothing new — this is the leaf that assembles everything above it.

- [ ] **Step 1: Add the video ref and mount TracksDragon in the stage**

In `apps/web/components/site/year-tracks.tsx`, add the imports and two hooks
near the top of the component, and render `<TracksDragon>` inside
`.tracks__stage`, positioned so it sits behind the cards in DOM/z-index terms
(exact visual stacking is CSS z-index, already set in Task 5 — DOM order here
just needs to not be AFTER the cards, to avoid relying on z-index alone for
hit-testing, though `pointer-events: none` makes this mostly moot):

```tsx
import { useRef } from 'react';
import { copy } from '@ayman/contracts';
import { gsap, ScrollTrigger } from '@/lib/gsap';
import { useGsap } from '@/components/motion/use-gsap';
import { useMediaQuery } from '@/lib/use-media-query';
import { MediaSlot } from '@/components/site/media-slot';
import { ElectricCard } from '@/components/site/electric-card';
import { TrackCardView, type TrackCard } from '@/components/site/track-card';
import { TracksDragon } from '@/components/site/tracks-dragon';
import { TRACKS_FIRE_PEAK_S } from '@/lib/brand-assets';
```

(`ScrollTrigger` joins the existing `gsap` import from `@/lib/gsap` — the
current file only imports `gsap`.)

Inside `export function YearTracks()`, alongside the existing
`const ref = useRef<HTMLElement>(null);`, add:

```tsx
const dragonVideoRef = useRef<HTMLVideoElement>(null);
// A real dependency for the `useGsap` call below, not decoration: TracksDragon
// only renders its <video> once this flips true (Task 5), so the effect has
// to re-run when it does — otherwise a resize crossing the breakpoint would
// leave the effect holding a stale `dragonVideoRef.current` captured from
// before TracksDragon mounted. Same reasoning as the identical dependency on
// `dragon-sprite.tsx`.
const wide = useMediaQuery('(min-width: 64rem)', false);
```

In the JSX, inside `<div className="tracks__stage">`, add `<TracksDragon
videoRef={dragonVideoRef} />` as the first child (before `.tracks__spot`), so
it sits earliest in DOM order:

```tsx
<div className="tracks__stage">
  <TracksDragon videoRef={dragonVideoRef} />
  <div className="tracks__spot" aria-hidden="true" />
  <div className="tracks__cutout">
    <MediaSlot kind="cutout" alt="" sizes="66vw" />
  </div>
  {/* ...cards unchanged... */}
</div>
```

- [ ] **Step 2: Replace the cards' independent ScrollTrigger with a paused, fire-triggered timeline**

Replace the existing `useGsap` callback body. Current code (to be replaced) is:

```tsx
useGsap(
  ({ scope, reduced }) => {
    if (reduced) return;

    gsap.from(scope.querySelectorAll('[data-track-card]'), {
      y: 40,
      opacity: 0,
      duration: 0.9,
      stagger: 0.12,
      ease: 'power3.out',
      scrollTrigger: { trigger: scope, start: 'top 70%' },
    });

    for (const glyph of scope.querySelectorAll<HTMLElement>('.tracks__glyph')) {
      const seconds = Number(glyph.dataset.drift ?? 12);
      gsap.to(glyph, {
        y: '+=18',
        x: '+=8',
        duration: seconds,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
      });
    }
  },
  ref,
  [],
);
```

New version — the glyph drift loop is untouched; the card stagger is replaced
by the dragon/fire/bloom sequence:

```tsx
useGsap(
  ({ scope, reduced }) => {
    // Reduced motion: return BEFORE the glyph loop too, not just before the
    // dragon/fire/cards below — glyph drift is continuous decorative motion,
    // exactly the category `use-gsap.ts` says must respect `reduced`. The
    // cards still render at their resting (final, visible) CSS state because
    // nothing below ever calls gsap.from()/set() on them when this returns
    // early, and the dragon is simply never played.
    if (reduced) return;

    for (const glyph of scope.querySelectorAll<HTMLElement>('.tracks__glyph')) {
      const seconds = Number(glyph.dataset.drift ?? 12);
      gsap.to(glyph, {
        y: '+=18',
        x: '+=8',
        duration: seconds,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
      });
    }

    const video = dragonVideoRef.current;
    if (!video) {
      // Narrow viewport — TracksDragon rendered nothing (Task 5), so there is
      // no fire to time the bloom off. Fall back to exactly the plain stagger
      // this section used before this task, unchanged.
      gsap.from(scope.querySelectorAll('[data-track-card]'), {
        y: 40,
        opacity: 0,
        duration: 0.9,
        stagger: 0.12,
        ease: 'power3.out',
        scrollTrigger: { trigger: scope, start: 'top 70%' },
      });
      return;
    }

    // Cards ordered active-first so the stagger blooms OUTWARD from where
    // the fire actually is, not in DOM order (start, end, active).
    const activeCard = scope.querySelector('[data-track-card].tracks__card--active');
    const startCard = scope.querySelector('[data-track-card].tracks__card--start');
    const endCard = scope.querySelector('[data-track-card].tracks__card--end');
    const cardsInBloomOrder = [activeCard, startCard, endCard].filter(
      (el): el is Element => el !== null,
    );

    const dragon = scope.querySelector<HTMLElement>('.tracks__dragon');
    const spot = scope.querySelector<HTMLElement>('.tracks__spot');
    // Resolved OUTSIDE this component's gsap.context() scope, exactly like
    // the existing footer-fade in `dragon-sprite.tsx:171-179` — deliberate,
    // not an oversight. A bare `'.dragon'` selector STRING would resolve
    // INSIDE this scope (which contains no such element) and silently do
    // nothing. `null` whenever DragonSprite isn't rendered (narrow viewport),
    // so every use below is guarded.
    const mascot = document.querySelector<HTMLElement>('.dragon');

    // How long after the measured fire-peak the flame has visibly died down
    // in the source clip (peaks ~5.8-6.9s raw, back to baseline by ~7.9s —
    // roughly a 1-second tail past the peak; 1.6s here for a beat of margin
    // so the fade doesn't clip the tail of the flame).
    const FIRE_OUT_S = TRACKS_FIRE_PEAK_S + 1.6;

    // Paused on creation — played from the `timeupdate` listener below, not
    // from this timeline's own ScrollTrigger. `gsap.from()` still means the
    // cards' resting DOM state is their final state, so scrubbing this
    // timeline's progress back to 0 (onLeaveBack, below) leaves them exactly
    // where the reduced-motion path already leaves them.
    const bloom = gsap.timeline({ paused: true });
    if (spot) {
      bloom.to(spot, { opacity: 0.9, scale: 1.15, duration: 0.25, yoyo: true, repeat: 1 }, 0);
    }
    bloom.from(
      cardsInBloomOrder,
      { y: 40, opacity: 0, scale: 0.92, duration: 0.9, stagger: 0.12, ease: 'power3.out' },
      0,
    );

    // Two independent triggers off the SAME real playback position, not a
    // wall-clock delay — a delay measured from when `.play()` was called
    // would drift out of sync with the actual flame if playback ever stalls
    // (a slow decode, a dropped frame). Tying the fade-out to `currentTime`
    // the same way the bloom trigger already is keeps both honest.
    let bloomArmed = true;
    let fadeArmed = true;
    const onTime = () => {
      if (bloomArmed && video.currentTime >= TRACKS_FIRE_PEAK_S) {
        bloomArmed = false;
        bloom.play();
      }
      if (fadeArmed && video.currentTime >= FIRE_OUT_S) {
        fadeArmed = false;
        if (dragon) gsap.to(dragon, { opacity: 0, duration: 0.8 });
        if (mascot) gsap.to(mascot, { opacity: 1, duration: 0.6 });
      }
    };
    video.addEventListener('timeupdate', onTime);

    const trigger = ScrollTrigger.create({
      trigger: scope,
      start: 'top 70%',
      end: 'bottom top',
      onEnter: () => {
        if (mascot) gsap.to(mascot, { opacity: 0, duration: 0.4 });

        // Flies in from further off-stage (35% of its own width) to its
        // CSS resting position — NOT a `.to()` off the current transform,
        // which would only be correct the first time and wrong on replay
        // once GSAP has already moved it. Kept in a variable so the
        // autoplay-rejected fallback below can kill it before it fights
        // with that fallback's own instant `.set()`.
        const entrance = dragon
          ? gsap.fromTo(
              dragon,
              { xPercent: -35, opacity: 0 },
              { xPercent: 0, opacity: 1, duration: 1.1, ease: 'power2.out' },
            )
          : null;

        video.currentTime = 0;
        void video.play().catch(() => {
          // Autoplay refused — the cards must still bloom, same fallback
          // FireReveal used for the same reason.
          entrance?.kill();
          bloomArmed = false;
          bloom.play();
          fadeArmed = false;
          if (dragon) gsap.set(dragon, { opacity: 0 });
          if (mascot) gsap.set(mascot, { opacity: 1 });
        });
      },
      onLeaveBack: () => {
        bloomArmed = true;
        fadeArmed = true;
        bloom.progress(0).pause();
        video.pause();
        video.currentTime = 0;
        if (dragon) gsap.set(dragon, { opacity: 0, xPercent: 0 });
        if (mascot) gsap.to(mascot, { opacity: 1, duration: 0.4 });
      },
    });

    return () => {
      video.removeEventListener('timeupdate', onTime);
      trigger.kill();
      bloom.kill();
    };
  },
  ref,
  [wide],
);
```

- [ ] **Step 3: Typecheck and lint**

```bash
cd apps/web && pnpm typecheck && pnpm lint
```

Fix any type errors before moving on — in particular, confirm
`scope.querySelector('[data-track-card].tracks__card--active')` types as
`Element | null` and the `.filter((el): el is Element => el !== null)` guard
satisfies `cardsInBloomOrder: Element[]` for `gsap.from`.

- [ ] **Step 4: Manual verification — the full sequence**

```bash
cd apps/web && pnpm dev
```

At a viewport ≥ 64rem:

1. Scroll slowly from the top. Confirm the page-long mascot fades out just
   before the tracks section's stage comes into view.
2. Confirm the big dragon fades/flies in from the left side of the stage,
   behind the three (still-hidden) cards and in front of the instructor
   cutout, turns to face forward, and breathes fire.
3. Confirm the three cards bloom in — scale + fade + rise — starting from the
   centred active card, at the moment the fire is at full height, not before
   it and not on a fixed delay (compare against the video playing at normal
   speed — the cards should react to the flame, not to the clock).
4. Confirm `.tracks__spot`'s glow visibly pulses at the same moment.
5. Confirm the big dragon fades out afterward and the page-long mascot fades
   back in and resumes flying down the rest of the page.
6. Scroll back up above the section, then back down again. Confirm the whole
   sequence replays from the start (video rewound, cards re-hidden then
   re-bloomed) rather than showing bare cards on the second pass.
7. In Chrome DevTools, enable "Emulate CSS prefers-reduced-motion: reduce",
   reload, and scroll to the section. Confirm the three cards are visible
   immediately with no animation and no `dragon-fire.webm`/`.mov` request in
   the Network tab.
8. Resize under 64rem (or load the page at that width directly). Confirm the
   section falls back to a plain stacked column, the three cards still
   animate in with the original rise-and-fade stagger on scroll, and neither
   `dragon-fire.webm` nor `.mov` appears in the Network tab at all.
9. With the page loaded WIDE, resize the window down across the 64rem
   boundary mid-session (not just a fresh narrow load). Confirm it settles
   into the narrow fallback cleanly — no stuck-invisible cards, no console
   error from a torn-down ScrollTrigger still firing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/site/year-tracks.tsx
git commit -m "feat(web): the dragon's fire blooms the year-tracks cards

Replaces the cards' independent scroll trigger with one driven off
the dragon video's measured fire-peak, same mechanism the retired
FireReveal section used."
```

---

## Task 7: Full end-to-end verification pass

No new code — this is the capstone check that the six prior tasks compose
correctly as one feature, plus the checks that only make sense once
everything exists together.

**Files:** none (verification only; may produce a small fixup commit if
Step 2 finds something).

- [ ] **Step 1: Full project checks**

```bash
cd apps/web && pnpm typecheck && pnpm lint && pnpm build
```

Expected: all three pass. `pnpm build` in particular catches anything
`typecheck`/`lint` don't (e.g. an `next/image` or asset-path issue).

- [ ] **Step 2: Cold-load performance sanity check**

```bash
cd apps/web && pnpm dev
```

With DevTools Network tab open and throttled to "Fast 3G", load the landing
page fresh. Confirm `dragon.webm`/`dragon.mov` and `dragon-fire.webm`/`.mov`
are not both fully downloaded before the visitor could plausibly reach the
tracks section — `preload="auto"` should let the browser fetch the fire clip
opportunistically while earlier sections are being read, not block anything.
If the fire clip's file size (from Task 3 Step 4's `ls -lh` output) looks
disproportionate next to the rest of the page's weight, that's a signal to
drop `CRF` back toward the default `46` and re-run Task 3 Steps 4-8 — note
this in the commit if it happens, don't silently ship a regression.

- [ ] **Step 3: Cross-browser source order sanity check**

Confirm both `<video>` elements (mascot and tracks-dragon) list `<source
type="video/webm">` before `<source type="video/quicktime">` — Safari can't
decode VP9 alpha and needs to fall through to the MOV; the wrong order breaks
Safari silently. (Already correct if Task 5's component was copied as
written — this is a final read-through, not a new implementation step.)

- [ ] **Step 4: Full page read-through**

Scroll the entire landing page top to bottom once more, both themes (light
and dark, via the theme toggle), confirming nothing from Tasks 1-6 regressed
any of the untouched sections (Hero, Why, Featured Courses, Code Lab, About,
FAQ).

- [ ] **Step 5: Final commit (only if Step 2 or Step 3 required a change)**

```bash
git add -A
git commit -m "fix(web): tune dragon-fire encode weight after a full-page pass"
```

If nothing needed changing, skip this step — there is nothing to commit.
