#!/usr/bin/env bash
# Turn the blue-screen "rider on a dragon" clip into the two transparent videos
# the `#years` stage plays.
#
#   scripts/encode-dragon-ride.sh <input.mp4>
#
# The source is `Dragon_rider_fire_laptop_1080p_*.mp4` — 1920×1080, 24fps, 10s,
# the creature and rider composited over a blue gradient backdrop.
#
# ---------------------------------------------------------------------------
# WHY TWO FILES AND NOT ONE
#
# The scene has two halves with nothing in common. The ENTRANCE happens once —
# the dragon flies in, turns, and lights up — and must never repeat. The BLAZE
# is a flame that has to burn for as long as the reader stays in the section,
# which means it has to loop, and a loop that visibly cuts is worse than no
# loop at all.
#
# One file cannot do both: looping it would replay the entrance every few
# seconds, and not looping it would put the fire out. So the cut point is the
# moment the flame reaches full height, and each side is encoded for what it
# actually has to do. It also means the expensive half — fire is the highest-
# entropy thing in the clip by a wide margin — is only ~2.5s of source instead
# of 4, and the footer's pair of dragons replay the same `blaze` file the stage
# already downloaded rather than costing a second asset.
#
# HOW THE BLAZE LOOPS WITHOUT A SEAM
#
# It is a PALINDROME: the segment, then the same segment backwards. A clip
# whose end IS its beginning cannot cut on the wrap — the seam is removed by
# construction rather than hidden by a cross-fade. Fire is the one subject this
# works on unconditionally: churning flame has no direction, so the reversed
# half is indistinguishable from the forward one. (Do not reach for this on the
# entrance. A dragon flying backwards is extremely obvious.)
#
# The first and last frames of the reversed half are dropped. Without that,
# each turning point holds one frame for twice as long as the rest and the loop
# ticks audibly-visibly twice a cycle.
#
# ---------------------------------------------------------------------------
# ⚠️ THIS SCRIPT USED TO KEY A GREEN CUT OF THE SAME ANIMATION, AND THE ASSETS
# IT SHIPPED HAD THE CREATURE EATEN OUT OF THEM.
#
# Reported as «التنين من بطنه متآكل بسبب الكروما»: on the light theme the
# dragon's belly, its legs and most of both wing membranes were missing from the
# fire frames — the flame carried on through a body that was not there. The
# green build reached that by arithmetic it documented honestly: against a GREEN
# key, everything dark and unsaturated on the subject sits a fixed 0.130 away
# (black, grey and charcoal are all U 128, V 128), which is close enough to the
# threshold the smoke needed that one number could not serve both. It split the
# frame into zones to buy the rider back, and the zones it drew protected the
# rider and not the creature.
#
# The green source no longer exists. The blue one does, and it is the SAME
# animation frame for frame (verified by comparing poses against the shipped
# webm at 3.0s), so every timing measured off the old cut still holds —
# `DRAGON_FLIGHT_LOOP`, `DRAGON_IGNITES_AT`, the cut points below.
#
# ⚠️ AND BLUE KEYS THIS CLIP FAR MORE CLEANLY THAN GREEN EVER DID. Measured on
# the source, per-region mean chroma distance from the key (the same units
# ffmpeg's `chromakey` similarity uses — euclidean UV distance / 255·√2):
#
#   background, all four corners      0.013     ← what must go
#   smoke plumes                      0.055 – 0.068
#   wing membrane, seen through smoke 0.124     ← the nearest thing on the subject
#   the rider's jeans                 0.148
#   his black shirt                   0.166
#   the dragon's shadowed body        0.207
#   the flame                         0.273
#
# The gap between what must go and what must stay is a factor of two, where
# green's was a hundredth. Everything below follows from that: one threshold
# clears the background AND the smoke while leaving every part of the creature
# untouched, so there is no time gate, no tail-versus-smoke trade, and no
# despill pass in this script any more.
#
# The one exception is the rider's JEANS — blue denim against a blue screen,
# which is exactly why the green cut was made in the first place. They sit at
# 0.148, comfortably clear on paper; in practice the light denim's highlights
# run closer, and at the main threshold they measured 59% opaque and read as
# pale grey trousers. So a GENTLER key is used inside a box around the rider,
# and only there. Measured across that change: jeans alpha 150 → 238, smoke
# alpha 8 → 32 inside the box (where there is no smoke), wings unmoved.
#
# ---------------------------------------------------------------------------
# THE CUT POINTS, AND HOW THEY WERE FOUND
#
# Measured off the source, not eyeballed — the mean luma of the bottom third
# climbs off its baseline as the flame fills it and settles onto a plateau:
#
#   ffmpeg -i in.mp4 -vf "crop=1920:360:0:720,signalstats,\
#     metadata=print:key=lavfi.signalstats.YAVG:file=-" -f null -
#
#   frames   0–115   baseline: flying, turning, no fire
#   frames 116–139   the flame climbing
#   frames 140–239   plateau, full height
#
# SPLIT sits a few frames inside the plateau so the entrance ends on fire that
# is already at full height, and the blaze opens on the same. BLAZE_END stops
# well short of the clip's end because nothing after it differs.
# ---------------------------------------------------------------------------

set -euo pipefail

IN="${1:?usage: encode-dragon-ride.sh <input.mp4>}"

# The backdrop is a GRADIENT, not a flat fill — it runs light at the bottom to
# dark at the top — so this is its middle, taken as the mean U/V of four
# 200×200 corner boxes (U 164.8, V 98.6 at Y 85) converted back to RGB. Both
# extremes sit 0.013 from it, which is why one key covers the whole frame:
# `chromakey` ignores luma by construction, and the gradient is almost entirely
# luma. `colorkey` — straight RGB distance — could not do this without also
# eating the subject.
KEY="${KEY:-0x2C5D96}"

# The main key. 0.10 clears the smoke (mean alpha 8/255, against 32 at 0.075)
# while the wings it sits over lose 1.6% of theirs — 183 → 180 — because their
# alpha is governed by their own coverage, not by the threshold. Above 0.11 the
# returns stop entirely and the risk to the creature starts.
SIM="${SIM:-0.10}"
BLEND="${BLEND:-0.03}"

# The gentle key, for the rider box only. See the jeans note in the header.
SIM_RIDER="${SIM_RIDER:-0.075}"
BLEND_RIDER="${BLEND_RIDER:-0.035}"

# The box the gentle key applies inside, as fractions of the cropped frame.
#
# The rider spans x 0.40–0.61 and y 0.05–0.41 measured off the matte; the box is
# opened out to take his legs and boots, and stops well inside the smoke plumes,
# which live beyond x 0.30 and x 0.70 and below y 0.35. Nothing inside it needs
# the main key: the only things there are the rider, the dragon's head and neck,
# and the flame's core column, all of them 0.15 or further from the key.
RIDER_X0="${RIDER_X0:-0.34}"
RIDER_X1="${RIDER_X1:-0.66}"
RIDER_Y1="${RIDER_Y1:-0.58}"
# How far the box feathers out, so no edge of it can be seen as an edge.
RIDER_SOFT="${RIDER_SOFT:-0.06}"

# ⚠️ The bottom 6% of the frame is CUT OFF, and it is not a composition choice.
#
# Where the flame meets the floor of the set it goes semi-transparent and the
# backdrop shines straight through it. A key removes pixels that ARE the
# backdrop; it cannot remove the backdrop shining THROUGH something. Measured on
# the plateau, the bottom band survives the key nearly opaque and carries the
# screen's cast with it.
#
# Cutting it costs the last inch of the flame's base, which the section crops
# anyway (the bed is placed at the section's own bottom edge), and it is what
# stops a dirty line running under the fire.
#
# ⚠️ 1920:1012 IS ALSO A CONTRACT WITH THE STYLESHEET. `.tracks__dragon`
# declares `aspect-ratio: 960 / 506` precisely because of this crop — change one
# and the other stretches the creature. See `(site)/styles/sections.css`.
CROP="${CROP:-1920:1012:0:0}"
FPS="${FPS:-15}"
WIDTH="${WIDTH:-960}"
MOV_WIDTH="${MOV_WIDTH:-720}"
CRF="${CRF:-40}"

SPLIT="${SPLIT:-6.10}"
BLAZE_END="${BLAZE_END:-8.60}"

OUT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/apps/web/public/brand"
mkdir -p "$OUT_DIR"

# The zoned key, as a graph fragment ending in `[keyed]`. Callers append their
# own tail — `[keyed]fps=…,scale=…[o]` — and `-map "[o]"`.
#
# ⚠️ `crop` runs FIRST, before the key: `RIDER` below is written against `W`/`H`
# and they have to mean the frame that ships, not the one it was cut from.
#
# ⚠️ The `format=rgba,alphaextract,format=gray` on each branch is not
# decoration: without the explicit formats, `alphaextract` cannot negotiate and
# the graph fails to configure outright.
#
# Only ALPHA is mixed — the colour plane is never split — so there is no seam to
# see where the two mattes meet, and `RIDER`'s feather makes the transition a
# ramp rather than an edge.
#
# `RIDER` is 1 inside the box, 0 outside it, feathered across RIDER_SOFT. The
# three `clip`s are the two vertical sides and the bottom edge; the top needs
# none, the frame ends there.
RIDER="clip((X-W*(${RIDER_X0}-${RIDER_SOFT}))/(W*${RIDER_SOFT}),0,1)\
*clip((W*(${RIDER_X1}+${RIDER_SOFT})-X)/(W*${RIDER_SOFT}),0,1)\
*clip((H*(${RIDER_Y1}+${RIDER_SOFT})-Y)/(H*${RIDER_SOFT}),0,1)"

KEY_GRAPH="[0:v]format=rgba,crop=${CROP},split=3[c][k1][k2];\
[k1]chromakey=${KEY}:${SIM_RIDER}:${BLEND_RIDER},format=rgba,alphaextract,format=gray[a1];\
[k2]chromakey=${KEY}:${SIM}:${BLEND},format=rgba,alphaextract,format=gray[a2];\
[a1][a2]blend=all_expr='A*(${RIDER})+B*(1-(${RIDER}))',format=gray[am];\
[c][am]alphamerge[keyed]"

# ⚠️ `-auto-alt-ref 0` is REQUIRED with alpha, on every VP9 call below. VP9's
# alternate-reference frames carry no alpha plane, and leaving it on drops
# transparency on scattered frames — the "works, then flashes a black box" bug.
#
# ⚠️ `-pix_fmt yuva420p` is equally required, and is not a size tweak. The key
# leaves the graph as yuva444p, which libvpx refuses outright ("not widely
# supported") — so leaving it off does not merely produce a bigger file, it
# produces no file.
VP9=(-c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf "$CRF" -row-mt 1 -auto-alt-ref 0 -an)

# ⚠️ THE RIDE CARRIES KEYFRAMES; THE BLAZE DOES NOT. This asymmetry is the whole
# reason the scene can run backwards, and it costs bytes, so do not "tidy" it
# into one setting for both.
#
# `<TracksDragon>` rewinds the entrance by stepping `currentTime` DOWN the frame
# grid (see `rewind()`), and a backward seek has to decode forward from the
# nearest preceding keyframe. Encoded as one GOP — which is what libvpx does by
# default on a clip this short — every step back decodes from frame 0, so the
# cost of a rewind is quadratic in its length. Measured in Chrome on the shipped
# 92-frame file: 21.1 fps against a 22.5 fps target, with 116ms stalls. It could
# not keep up on a fast machine, let alone a slow one.
#
# At GOP 8 the same rewind runs at 113 fps — five times the headroom — with a
# 16ms worst gap, because no seek decodes more than seven frames. Measured cost:
# 740KB → 900KB. GOP 1 (all-intra) would be 2.5MB, which is what the WebP frame
# sequence this replaced cost, and the point of the video was not paying it.
#
# The blaze only ever plays FORWARD and loops back to a keyframe that is already
# at its head, so it needs none of this and is left alone.
GOP="${GOP:-8}"

echo "→ dragon-ride  (0 → ${SPLIT}s, plays once, GOP ${GOP} so it can be rewound)"
ffmpeg -hide_banner -loglevel error -y -to "$SPLIT" -i "$IN" \
  -filter_complex "${KEY_GRAPH};[keyed]fps=${FPS},scale=${WIDTH}:-2[o]" -map "[o]" \
  "${VP9[@]}" -g "$GOP" "$OUT_DIR/dragon-ride.webm"
ffmpeg -hide_banner -loglevel error -y -to "$SPLIT" -i "$IN" \
  -filter_complex "${KEY_GRAPH};[keyed]fps=${FPS},scale=${MOV_WIDTH}:-2,format=bgra[o]" -map "[o]" \
  -c:v hevc_videotoolbox -alpha_quality 0.7 -q:v 45 -tag:v hvc1 -g "$GOP" -an \
  "$OUT_DIR/dragon-ride.mov"

# ⚠️ The blaze starts where the ride's LAST FRAME ENDS — read back off the file
# rather than assumed to be SPLIT.
#
# `-to` cuts at a source timestamp, but `fps` then resamples onto its own grid,
# so the ride's final frame lands on the last multiple of 1/FPS at or below
# SPLIT — 6.0667s here, not 6.10. Starting the blaze at SPLIT therefore left a
# 1.5-frame hole at the swap; starting it one frame after SPLIT left the same
# hole plus a duplicate. The encoded duration IS the next frame's start time, so
# this is exact by construction and stays exact if SPLIT or FPS ever change.
BLAZE_START="$(ffprobe -v error -show_entries format=duration -of csv=p=0 \
  "$OUT_DIR/dragon-ride.webm")"

# The palindrome is built by LAYING THE FRAMES OUT ON DISK in the order they
# play, rather than with `reverse`+`trim` inside one filter graph.
#
# It reads as the long way round and is not: both ends of the reversed half have
# to be dropped, `trim` will not take a negative `end_frame`, and the forward
# half's exact frame count is a rounding decision inside the `fps` filter rather
# than anything this script can compute from the timestamps. Numbering the files
# makes the count observable and the order literal. It also keys once instead of
# twice, and the WebM and MOV builds then encode the identical frames.
echo "→ dragon-blaze (${BLAZE_START} → ${BLAZE_END}s, palindromed, loops forever)"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/fwd" "$TMP/loop"

ffmpeg -hide_banner -loglevel error -y -ss "$BLAZE_START" -to "$BLAZE_END" -i "$IN" \
  -filter_complex "${KEY_GRAPH};[keyed]fps=${FPS}[o]" -map "[o]" -an "$TMP/fwd/%04d.png"

# f1…fN then f(N-1)…f2. Dropping fN from the reversed half stops the far turning
# point holding a frame; dropping f1 stops the WRAP holding one. Leave either in
# and the loop ticks once a cycle on flame that should be continuous.
N="$(find "$TMP/fwd" -name '*.png' | wc -l | tr -d ' ')"
i=0
for n in $(seq 1 "$N") $(seq $((N - 1)) -1 2); do
  printf -v dst "%s/loop/%04d.png" "$TMP" "$i"
  cp "$(printf '%s/fwd/%04d.png' "$TMP" "$n")" "$dst"
  i=$((i + 1))
done
echo "   ${N} frames forward → ${i} in the loop"

ffmpeg -hide_banner -loglevel error -y -framerate "$FPS" -i "$TMP/loop/%04d.png" \
  -vf "scale=${WIDTH}:-2" "${VP9[@]}" "$OUT_DIR/dragon-blaze.webm"
ffmpeg -hide_banner -loglevel error -y -framerate "$FPS" -i "$TMP/loop/%04d.png" \
  -vf "scale=${MOV_WIDTH}:-2,format=bgra" \
  -c:v hevc_videotoolbox -alpha_quality 0.7 -q:v 45 -tag:v hvc1 -an \
  "$OUT_DIR/dragon-blaze.mov"

echo
for f in dragon-ride dragon-blaze; do
  for ext in webm mov; do
    p="$OUT_DIR/$f.$ext"
    dims="$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height \
      -of csv=p=0:s=x "$p")"
    secs="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$p")"
    frames="$(ffprobe -v error -select_streams v:0 -count_frames \
      -show_entries stream=nb_read_frames -of csv=p=0 "$p")"
    # ⚠️ The FILE size, not `du` — these are transfer costs, and `du` reports
    # blocks on disk. It rounded a 1,125,776-byte blaze up to "2.0M", which is
    # not a rounding error to shrug at when the number is being weighed against
    # a keyframe budget.
    printf "  %-13s %-4s %9s  %5.2fs  %3s frames  %7s KB\n" \
      "$f" "$ext" "$dims" "$secs" "$frames" \
      "$(( $(wc -c < "$p") / 1024 ))"
  done
done
echo
echo "Register the sizes and durations in apps/web/lib/brand-assets.ts."
