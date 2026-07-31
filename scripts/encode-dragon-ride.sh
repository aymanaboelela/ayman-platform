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
SIM="${SIM:-0.10}"
BLEND="${BLEND:-0.02}"

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
DEGREEN="geq=r='r(X,Y)':g='min(g(X,Y),max(r(X,Y),b(X,Y)))':b='b(X,Y)':a='alpha(X,Y)'"

KEYED="format=rgba,chromakey=${KEY}:${SIM}:${BLEND},${DEGREEN},crop=${CROP}"

# ⚠️ `-auto-alt-ref 0` is REQUIRED with alpha, on every VP9 call below. VP9's
# alternate-reference frames carry no alpha plane, and leaving it on drops
# transparency on scattered frames — the "works, then flashes a black box" bug.
#
# ⚠️ `-pix_fmt yuva420p` is equally required, and is not a size tweak. The key
# leaves the graph as yuva444p, which libvpx refuses outright ("not widely
# supported") — so leaving it off does not merely produce a bigger file, it
# produces no file.
VP9=(-c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf "$CRF" -row-mt 1 -auto-alt-ref 0 -an)

echo "→ dragon-ride  (0 → ${SPLIT}s, plays once)"
ffmpeg -hide_banner -loglevel error -y -to "$SPLIT" -i "$IN" \
  -vf "${KEYED},fps=${FPS},scale=${WIDTH}:-2" "${VP9[@]}" "$OUT_DIR/dragon-ride.webm"
ffmpeg -hide_banner -loglevel error -y -to "$SPLIT" -i "$IN" \
  -vf "${KEYED},fps=${FPS},scale=${MOV_WIDTH}:-2,format=bgra" \
  -c:v hevc_videotoolbox -alpha_quality 0.7 -q:v 45 -tag:v hvc1 -an "$OUT_DIR/dragon-ride.mov"

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
  -vf "${KEYED},fps=${FPS}" -an "$TMP/fwd/%04d.png"

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
    printf "  %-13s %-4s %9s  %5.2fs  %3s frames  %s\n" \
      "$f" "$ext" "$dims" "$secs" "$frames" "$(du -h "$p" | cut -f1)"
  done
done
echo
echo "Register the sizes and durations in apps/web/lib/brand-assets.ts."
