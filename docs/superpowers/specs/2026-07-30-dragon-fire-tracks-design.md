# Dragon fire reveal — year tracks entrance — design

**Date:** 2026-07-30
**Status:** approved
**Scope:** the `#years` (`YearTracks`) section's entrance sequence; the page-long
dragon mascot's flight asset and on-screen size; retiring the `FireReveal`
section it replaces.
**Out of scope:** placement of the third ("standing") dragon clip — it is
encoded and registered in this round, not wired into any page yet.

## Why

`FireReveal` (uncommitted, built the prior session) was a first pass at a
dragon-and-fire moment: a front-on dragon roars, a wall of flame goes up, one
card opens through it, with a CTA down to the tracks. The brand owner supplied
three new AI-generated dragon clips and a sharper brief: the flying mascot
should fly *behind* the three real track cards, turn, breathe fire, and the
fire itself should be what makes those cards bloom open — not a separate card
of its own that then points at the real ones. `FireReveal`'s own CTA already
linked straight to `/#years`, so the two moments were already pointing at each
other; this design fuses them into one.

## Source assets

Three H.264 clips, 1280×720 or 1920×1080, 24fps, 10s, green-screen
(`~/Downloads/`), confirmed by extracting and inspecting start/mid/end frames
of each — not assumed from filename alone:

| File | Content | Becomes |
|---|---|---|
| `Dragon_flying_in_static_frame_202607292220.mp4` | Flies in place, camera framing static, no turn, no fire. | Re-encode of `DRAGON_VIDEO` — the page-long companion mascot. |
| `Dragon_flying_and_breathing_fire_202607292222.mp4` | Flies → turns front-on **mid-air, legs tucked** → breathes a fireball → resumes flying. | New `TRACKS_DRAGON_VIDEO` — the big dragon behind the track cards. |
| `Fire_dragon_spins_and_roars_202607292027.mp4` | Flies → turns and **lands, legs planted, standing in frame** → roars and breathes fire → resumes flying. | New `DRAGON_IDLE_VIDEO` — registered, not placed. Deferred per the brand owner. |

The middle clip's fire happens while still airborne (a flight beat); the third
clip's fire happens from a planted, standing pose, which is why it reads as
"standing" rather than "flying" and is the better fit for a future
card/page mascot rather than the page-long flight companion.

Measured (ffmpeg `signalstats`, mean luma of the frame's lower half, same
method the existing `FIRE_PEAK_S` used): on the raw
`Dragon_flying_and_breathing_fire` source, luma sits at a ~100 baseline until
~5.0s, ramps up as the dragon turns and ignites, and peaks at **6.58s**
(luma 138.8), holding a plateau through ~6.9s before decaying back to baseline
by ~7.9s. This is the number `TRACKS_FIRE_PEAK_S` will be derived from once the
clip is trimmed (see Architecture) — the same "measured off the source, not
guessed" rule `FIRE_PEAK_S` already follows.

## What retires

`FireReveal` is removed outright, not kept alongside the new sequence — two
similar dragon-fire beats back to back would undercut both:

- `apps/web/components/site/fire-reveal.tsx` — deleted.
- `apps/web/public/brand/fire.mov`, `fire.webm` — deleted (superseded).
- `<FireReveal />` and its import — removed from `apps/web/app/(site)/page.tsx`.
- `.reveal*` rules — removed from `apps/web/app/(site)/styles/sections.css`.
- `FIRE_VIDEO`, `FIRE_PEAK_S` — removed from `apps/web/lib/brand-assets.ts`.
- `revealBadge`, `revealTitle`, `revealLead`, `revealCta` — removed from
  `packages/contracts/src/copy/ar.ts`. No replacement copy is added: `YearTracks`
  already has its own heading (`tracksSelectBadge` / `Title` / `Lead`), and the
  three cards are now themselves the call to action, so the old `revealCta`
  button ("اختار صفك") is not needed anywhere.

## Architecture

- **`dragon-sprite.tsx`** — unchanged code. `DRAGON_VIDEO` in `brand-assets.ts`
  points at a re-encode of `Dragon_flying_in_static_frame`, same filenames
  (`dragon.webm` / `dragon.mov`), so no component change is needed for the
  asset swap.
- **`.dragon`** (`sections.css`) — width goes from `min(24vw, 18rem)` (288px
  max) to `min(30vw, 23rem)` (368px max), the "a bit bigger" the brand owner
  asked for, still clamped by viewport width and still hidden below 64rem.
- **New `tracks-dragon.tsx`** — a small presentational component (owns only the
  `<video>` markup and its two `<source>`s, no GSAP of its own), mirroring how
  `MediaSlot` / `ElectricCard` / `TrackCardView` are already dumb pieces
  `YearTracks` composes. Rendered inside `.tracks__stage`.
- **`year-tracks.tsx`** — gains the choreography, replacing its current
  independent `scrollTrigger: { trigger: scope, start: 'top 70%' }` stagger on
  `[data-track-card]`. One `useGsap` scope now owns: the dragon's fly-in/out
  tween, a `timeupdate` listener on the dragon video crossing
  `TRACKS_FIRE_PEAK_S` (the exact mechanism `FireReveal` already uses for its
  `FIRE_PEAK_S` — real playback position, not a guessed delay), the cards'
  bloom tween fired from that crossing, and a matching glow-flash on the
  existing `.tracks__spot` element. This keeps the section's existing rule
  intact: one section, one file, owns its own motion.
- **`brand-assets.ts`** — remove `FIRE_VIDEO` / `FIRE_PEAK_S`; add
  `TRACKS_DRAGON_VIDEO: DragonVideo` and `TRACKS_FIRE_PEAK_S: number` (derived
  from the 6.58s raw measurement above, offset by the clip's final trim start);
  add `DRAGON_IDLE_VIDEO: DragonVideo | undefined`, registered and documented
  as not yet consumed anywhere, the same "fill in when ready" pattern this file
  already uses for `cutout` / `portrait` / `logo`.
- **`sections.css`** — new rules for the tracks-stage dragon layer: absolutely
  positioned inside `.tracks__stage`, sized noticeably larger than the mascot,
  `z-index` between `.tracks__cutout` (10) and `.tracks__card` (30) so it
  reads as flying behind the cards and in front of the instructor cutout.
- **`scripts/encode-dragon.sh`** — reused as-is, run once per new source clip
  with freshly sampled `KEY`/`CROP`/`SIM` (green-screen shade can differ
  between generation batches — this is not assumed identical to the existing
  clip) and a `WIDTH` sized to that clip's actual render size. Each source is
  trimmed to its essential beats before encoding rather than kept at the full
  10s — for `Dragon_flying_and_breathing_fire` specifically, trim to
  roughly 3.0s–9.3s of the raw source (a short flying pre-roll, the full
  turn/fire/decay, a short exit), landing the measured fire peak at
  approximately 3.58s in the shipped clip — both for file size and so the
  one-shot playback feels quick rather than drawn out.

## The sequence

Triggered by `ScrollTrigger` on `.tracks__stage` entering the viewport — no
autoplay on page load, no scroll-scrubbed video (scrubbing needs every frame
keyframed, which is the exact cost/stutter trade `FireReveal`'s doc comment
already rules out). All of it plays once per entry and re-arms on scroll-back,
matching `FireReveal`'s existing replay contract:

1. The page-long mascot (`DragonSprite`) fades out as the section arrives.
2. `TRACKS_DRAGON_VIDEO` fades/flies in from the side of the stage, behind the
   cards, in front of the cutout, on `video.currentTime = 0` + `play()`.
3. It turns to face forward and breathes fire (baked into the source clip).
   Crossing `TRACKS_FIRE_PEAK_S` is the trigger for step 4 — not a fixed delay,
   so a slow decode doesn't fire the cards onto an empty stage.
4. The three cards bloom (scale + fade + rise, a softer version of the current
   `y: 40, opacity: 0` tween), staggered outward from the centred active card
   rather than in DOM order. `.tracks__spot`'s existing glow pulses brighter in
   the same moment, so the light reads as coming from the flame.
5. The big dragon fades out; the page-long mascot fades back in and resumes its
   normal scroll-driven flight for the rest of the page.
6. Scrolling back up past the section resets the video to 0, re-hides the
   cards, and re-shows step 1's state, so scrolling back down plays it again —
   `FireReveal`'s existing "no bare cards on a second visit" rule, carried over.

Two safety nets carried over unchanged from `FireReveal`, because they are
already proven necessary in this codebase, not new invention:

- `prefers-reduced-motion: reduce` — the cards render fully visible immediately
  (`useGsap`'s `reduced` flag), the big dragon video is not rendered or played
  at all.
- If the browser refuses `video.play()` (power-saving modes block muted
  autoplay too), the cards reveal immediately rather than staying hidden
  forever waiting on a `timeupdate` that will never come.

## Mobile

Unaffected. Below 64rem `YearTracks` already unsets the absolute staging and
stacks the cards in a plain column (three 27vw-positioned cards have nowhere
to go at that width), and `DragonSprite` already renders nothing there. The new
dragon layer follows the same gate: nothing is requested or rendered below
64rem, so no phone visitor downloads video for an effect with no stage to play
on. Cards keep today's plain `scrollTrigger: top 70%` stagger at that width —
no fire dependency there.

## Performance

Same recipe as the existing mascot and the retiring `FireReveal`, applied to
the new, physically larger clip: VP9+alpha WebM primary, HEVC+alpha MOV
fallback for Safari, `-auto-alt-ref 0` (alpha-safe), encode width set to the
clip's real maximum render size rather than the source's full resolution.
`preload="auto"`, same as `FireReveal` today — the section sits far enough down
the page (after hero, why-rail, featured courses) that the browser has idle
time to fetch it before the visitor scrolls there.

## Testing / verification

No existing site/motion component (`FireReveal`, `DragonSprite`, `YearTracks`,
or any of the other `components/site/*` sections) has automated unit or e2e
coverage in this codebase — this class of work is verified visually, not by
test suite, and this plan follows that established pattern rather than
introducing one-off tests for a single feature. Verification per task is
`pnpm typecheck` / `pnpm lint` (real, project-wide gates) plus a concrete
manual pass in the running dev server: scroll to `#years` and confirm the
dragon flies in behind the cards, turns, breathes fire, and the cards bloom on
the fire, not before it; scroll back up and back down to confirm it re-arms;
toggle `prefers-reduced-motion` in devtools and confirm the cards are visible
immediately with no video request; resize under 64rem and confirm the section
falls back to the plain stagger with no dragon assets requested.

## Notes

`FireReveal` never shipped (uncommitted), so removing it is not a user-facing
regression — it is finishing the thought before it went live. The third clip
(`DRAGON_IDLE_VIDEO`) is deliberately left unplaced rather than guessed at a
page; the brand owner said "another page or a card," not a specific one, and
YAGNI applies to a mascot's home just as much as to code.
