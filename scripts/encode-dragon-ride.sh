#!/usr/bin/env bash
# Turn the blue-screen "rider on a dragon" clip into the two transparent videos
# the `#years` stage plays.
#
#   scripts/encode-dragon-ride.sh <input.mp4>
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
# ⚠️ GREEN, and the reason is the rider's JEANS.
#
# The first cut of this clip was shot against blue and keyed cleanly, but blue
# denim is the one thing on the subject that a blue screen cannot be told apart
# from with any margin worth having: it sat 0.103 from the key in UV while the
# background sat at 0.017 — a workable gap, but the whole matte balanced on it.
# Against green the jeans are nowhere near the key and the margin stops being a
# consideration at all.
#
# ⚠️ `chromakey`, NOT `colorkey`. The backdrop is not flat: it runs #10531b at
# the top to #3e9b4d at the bottom, an RGB spread far too wide for `colorkey`'s
# straight RGB distance to cover without also eating the subject. In UV those
# same colours are 8 apart, because the gradient is almost entirely LUMA and
# `chromakey` ignores luma by construction. Measured across the clip:
#
#   background extremes   0.022 from the key
#   rider's dark clothing 0.130   ← the nearest thing on the subject
#   the flame             0.285
#
# SIM sits in the middle of that gap.
#
# The classic green-screen trap does NOT bite here, but check it on any new
# source: keying by hue against green eats WHITE-hot flame, which carries a
# large green component. This clip's fire is orange — (254, 187, 79), V = +52
# against the screen's V = −43 — so it is the furthest thing in the frame from
# the key rather than the nearest. A whiter flame would need `colorkey` instead.
#
# No `despill`: it visibly drained the rider's skin. The green that a key alone
# leaves behind is handled by the clamp below.
#
# ---------------------------------------------------------------------------
# THE CUT POINTS, AND HOW THEY WERE FOUND
#
# Measured off the source, not eyeballed — the mean luma of the bottom third
# climbs off its ~100 baseline as the flame fills it and settles onto a ~134
# plateau:
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

KEY="${KEY:-0x2A7A2E}"

# ⚠️ THE KEY IS PULLED TWICE AND MASKED, and it is not a refinement — a single
# similarity cannot key this clip without visibly damaging some part of it.
#
# `chromakey` ignores luma by construction, so what it actually measures is how
# far a pixel's chroma sits from the key's. Two things on this set are close to
# it for opposite reasons, and they are at opposite ends of the frame:
#
#   the background extremes   0.022   (what must be removed)
#   the rider's black shirt   0.130   (what must be kept — see below)
#   the flame's translucent base      (screen shining THROUGH, at the bottom)
#
# The shirt's number is not a property of this shot, it is arithmetic. The key
# #2A7A2E sits at U 106.6, V 86.4; anything NEUTRAL — black, grey, charcoal —
# sits at U 128, V 128, which is sqrt(21.4² + 41.6²) / (sqrt(2)·255) = 0.130
# away. Every dark unsaturated thing on the subject lands on that number.
#
# A flat SIM of 0.10 with BLEND 0.02 put the threshold at 0.12 — a margin of
# ONE HUNDREDTH over the shirt, or about 3.6 units of UV. H.264 chroma noise on
# a dark garment clears that easily, so the key punched holes straight through
# the rider: measured, 8.3% of the torso came out part-transparent. On the dark
# theme that is invisible. On the light theme the shirt reads as moth-eaten,
# which is exactly what it was.
#
# Lowering SIM fixes the shirt (holes 8.3% → 1.7%, and the background still
# keys clean down to 0.05 — measured, zero residue) but gives back the flame's
# base, where the screen glows through translucent fire and needs the AGGRESSIVE
# setting to go. The two requirements are irreconcilable in one number and
# separable, though not as simply as it first looks — see the mask below, which
# went through a band and then a box before it worked.
#
# So two mattes are pulled and mixed by a mask. Only ALPHA is mixed — the colour
# plane is never split — so there is no seam to see.
SIM_TOP="${SIM_TOP:-0.06}"
BLEND_TOP="${BLEND_TOP:-0.04}"
SIM_BASE="${SIM_BASE:-0.13}"
BLEND_BASE="${BLEND_BASE:-0.06}"

# The gentle matte is confined to a BOX AROUND THE RIDER, as fractions of the
# cropped frame, and the strong one has everything else.
#
# ⚠️ It was a horizontal band — gentle above, strong below — and that was too
# generous by half. The only thing on this set that needs the gentle key is the
# rider, because he is the only thing that is DARK AND UNSATURATED. The dragon
# is saturated red and the flame saturated orange; both sit 0.28 or further from
# the key and neither can tell the two settings apart.
#
# Handing the gentle key everything above the claws also handed it the SMOKE,
# which is the one part of the frame that most wants the strong one: it is grey,
# it is semi-transparent, and it sits over the screen. A band keeps it, and on
# the light theme a kept smoke plume is not atmosphere, it is a dirty grey
# smudge across a cream page — worse than the shirt it was traded for.
#
# The rider spans x 0.40–0.61 and y 0.05–0.41 measured off the matte; the box is
# opened out to take his legs and boots, and stops well inside the plumes, which
# live beyond x 0.30 and x 0.70.
RIDER_X0="${RIDER_X0:-0.34}"
RIDER_X1="${RIDER_X1:-0.66}"
RIDER_Y1="${RIDER_Y1:-0.58}"
# How far the box feathers out, so no edge of it can be seen as an edge.
RIDER_SOFT="${RIDER_SOFT:-0.06}"

# ⚠️ The bottom 6% of the frame is CUT OFF, and it is not a composition choice.
#
# Where the flame meets the floor of the set it goes semi-transparent, and the
# brightest part of the green screen glows straight through it. A key removes
# pixels that ARE the screen; it cannot remove the screen shining THROUGH
# something. Measured on the plateau, green-dominant pixels survive the key
# across y 1014–1078 of 1080 and essentially nowhere else — a hard band at the
# very bottom. The clamp below can only mute it to olive, not remove it.
#
# Cutting it costs the last inch of the flame's base, which the section crops
# anyway (the bed is placed at the section's own bottom edge), and it is what
# stops a dirty green line running under the fire.
CROP="${CROP:-1920:1012:0:0}"
FPS="${FPS:-15}"
WIDTH="${WIDTH:-960}"
MOV_WIDTH="${MOV_WIDTH:-720}"
CRF="${CRF:-40}"

SPLIT="${SPLIT:-6.10}"
BLAZE_END="${BLAZE_END:-8.60}"

OUT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/apps/web/public/brand"
mkdir -p "$OUT_DIR"

# DE-GREEN: clamp the green channel to whichever of red and blue is larger.
#
# A key removes pixels that ARE the screen; it does nothing about the screen
# bouncing THROUGH a translucent subject. The wing membranes and the smoke both
# carry it, and they come out a sage green that reads, correctly, as leftover
# chroma. It is spread through the interior rather than sitting at the edges, so
# no amount of matte shrinking reaches it.
#
# This clamp is provably safe on the fire, which is why it is used in place of a
# despill. Flame here is (254, 187, 79): green is already below red, so
# `min(g, max(r, b))` returns it unchanged. Sage green is (180, 210, 160): green
# is above both, so it drops to red's level and the pixel lands on a warm grey.
# Nothing that is not literally green-dominant can be altered at all.
#
# ⚠️ CLAMPED FROM BOTH SIDES — `min(r,b)` is the floor, and it is not symmetry
# for its own sake. `UNSPILL` below subtracts screen from the green channel, and
# on the grey smoke it subtracts slightly too much: green drops under BOTH other
# channels and the plume comes out mauve. Visible on the light theme, on exactly
# the pixels this whole exercise is about.
#
# Green above `max(r,b)` is leftover screen; green below `min(r,b)` is
# over-correction. Pinning it into that band forbids both, and forbids them
# without knowing which of the two ran. Safe on everything in this clip for the
# same reason the ceiling is: flame (254, 187, 79) has green comfortably inside
# the band, and so do the dragon's reds and the rider's blues — the only pixels
# either end can move are ones where green is already an outlier.
DEGREEN="geq=r='r(X,Y)'\
:g='clip(g(X,Y),min(r(X,Y),b(X,Y)),max(r(X,Y),b(X,Y)))'\
:b='b(X,Y)':a='alpha(X,Y)'"

# UNSPILL: take the screen back out of every pixel the key left PARTLY opaque.
#
# ⚠️ Required by the lower SIM above, not an independent nicety. Dropping SIM to
# spare the rider's shirt also stops the key removing the band of pixels that
# sit 0.06–0.13 from it — the transitional ring around the silhouette. Those
# used to be deleted outright; now they survive, and they survive GREEN.
# Measured on the encoded file, the fix for the shirt on its own took rim
# green-lean from 22% to 32% and green-dominant pixels from 0.049% to 0.235%.
# Narrowing BLEND does not touch it (33% — slightly worse); the ring is a
# COLOUR problem, so it needs a colour fix.
#
# A partly-transparent pixel is `observed = a·subject + (1-a)·screen`, so the
# subject's own colour is `(observed - (1-a)·screen) / a`. The screen is the
# vertical gradient the header describes, hence the ramp on Y.
#
# ⚠️ GREEN ONLY, and clamped so it can only ever DARKEN green.
#
# Running the full three-channel unmultiply is the textbook move and it wrecked
# the rider: `chromakey`'s alpha is a chroma-DISTANCE ramp, not a true opacity,
# so a black shirt the key rates at 0.9 gets a tenth of a green screen
# subtracted from an already-dark pixel and lands on magenta. Restricting it to
# green makes that impossible — red and blue are copied through untouched, so
# no pixel can gain a colour cast it did not already have — and the `0..g`
# clamp means the worst case is a pixel that is left exactly as it was.
UNSPILL="geq=r='r(X,Y)'\
:g='clip((g(X,Y)-(1-alpha(X,Y)/255)*(83+72*Y/H))/max(alpha(X,Y)/255,0.02),0,g(X,Y))'\
:b='b(X,Y)':a='alpha(X,Y)'"

# The zoned key, as a graph fragment ending in `[keyed]`. Callers append their
# own tail — `[keyed]fps=…,scale=…[o]` — and `-map "[o]"`.
#
# ⚠️ `crop` runs FIRST here, before the key rather than after it. The ramp below
# is written against `H`, and it has to mean the height of the frame that ships,
# not of the source it was cut from.
#
# ⚠️ The `format=rgba,alphaextract,format=gray` on each branch is not
# decoration: without the explicit formats, `alphaextract` cannot negotiate and
# the graph fails to configure outright.
# `RIDER` is 1 inside the box, 0 outside it, feathered across RIDER_SOFT. The
# three `clip`s are the two vertical sides and the bottom edge; the top needs
# none, the frame ends there.
RIDER="clip((X-W*(${RIDER_X0}-${RIDER_SOFT}))/(W*${RIDER_SOFT}),0,1)\
*clip((W*(${RIDER_X1}+${RIDER_SOFT})-X)/(W*${RIDER_SOFT}),0,1)\
*clip((H*(${RIDER_Y1}+${RIDER_SOFT})-Y)/(H*${RIDER_SOFT}),0,1)"

# ⚠️ THE STRONG KEY IS GATED BY TIME AS WELL AS SPACE, and it has to be, because
# the two things that fight over it are in the same PLACE at different MOMENTS.
#
# The rider box alone was not enough. The dragon's TAIL sweeps the lower left
# through the whole of the flight, and the smoke fills the lower left and right
# through the whole of the fire — the same pixels, minutes apart in the edit. A
# purely spatial split has to pick one, and picking the smoke ate the tail:
# saturated red is safe at the strong setting, but the tail in flight is
# shadowed brown, close enough to neutral that 0.13 ghosts it. On the light
# theme it came out as a torn, half-transparent streak.
#
# Nothing is asked to tell a tail from a smoke plume. Before ignition there IS
# no smoke, so the gentle key can have the entire frame; from ignition on there
# is no tail to lose, because the creature is front-on and lit by its own fire.
# So the mask is `max(RIDER, gate)`: gentle everywhere while the gate is open,
# gentle only over the rider once it has closed.
#
# The blaze passes 0 — it is all fire, all of the time.
IGNITE_N="${IGNITE_N:-73}"      # 4.87s x 15fps, the frame the flame leaves the jaws
GATE_SPAN="${GATE_SPAN:-6}"     # closed over six frames, so the change cannot pop
RIDE_GATE="clip((${IGNITE_N}+${GATE_SPAN}-N)/${GATE_SPAN},0,1)"
BLAZE_GATE="0"

# `key_graph <gate>` emits the graph, ending in `[keyed]`.
key_graph() {
  local gate="$1"
  printf '%s' "[0:v]format=rgba,crop=${CROP},split=3[c][k1][k2];\
[k1]chromakey=${KEY}:${SIM_TOP}:${BLEND_TOP},format=rgba,alphaextract,format=gray[a1];\
[k2]chromakey=${KEY}:${SIM_BASE}:${BLEND_BASE},format=rgba,alphaextract,format=gray[a2];\
[a1][a2]blend=all_expr='A*max(${RIDER},${gate})+B*(1-max(${RIDER},${gate}))',format=gray[am];\
[c][am]alphamerge,${UNSPILL},${DEGREEN}[keyed]"
}


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
  -filter_complex "$(key_graph "$RIDE_GATE");[keyed]fps=${FPS},scale=${WIDTH}:-2[o]" -map "[o]" \
  "${VP9[@]}" -g "$GOP" "$OUT_DIR/dragon-ride.webm"
ffmpeg -hide_banner -loglevel error -y -to "$SPLIT" -i "$IN" \
  -filter_complex "$(key_graph "$RIDE_GATE");[keyed]fps=${FPS},scale=${MOV_WIDTH}:-2,format=bgra[o]" -map "[o]" \
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
  -filter_complex "$(key_graph "$BLAZE_GATE");[keyed]fps=${FPS}[o]" -map "[o]" -an "$TMP/fwd/%04d.png"

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
