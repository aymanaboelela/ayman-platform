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
# ⚠️ `chromakey`, NOT `colorkey` — the opposite of what the retired green-screen
# pipeline used, and for a reason worth keeping.
#
# This clip's backdrop is not flat. It carries a strong vertical gradient and a
# vignette, running #15427e at the top to #3f7bb5 at the bottom — an RGB spread
# of about 85, which is far too wide for `colorkey`'s straight RGB distance to
# cover without also eating the subject. In UV, though, those same two colours
# are 12 apart: the gradient is almost entirely LUMA, and `chromakey` ignores
# luma by construction. Measured across the clip, the whole background sits
# within 0.017 normalized UV distance of the key while the rider's jeans — the
# nearest thing on the subject to the screen colour — sit at 0.103. SIM below
# picks the middle of that gap.
#
# The trap that ruled `chromakey` out on the old green-screen sources does not
# apply here either: white-hot flame carries a large GREEN component, so keying
# by hue against green ate the fire's own core. Against blue, flame is the
# furthest thing in the frame from the key — blue is its lowest channel. Blue
# screen and orange fire is the one pairing where this is all upside.
#
# No `despill`. Verified unnecessary: composited over near-black there is no
# blue fringe on the wings or the flame, and `despill=type=blue` visibly cooled
# the rider's skin.
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

KEY="${KEY:-0x2D5F9B}"
SIM="${SIM:-0.12}"
BLEND="${BLEND:-0.02}"
FPS="${FPS:-15}"
WIDTH="${WIDTH:-960}"
MOV_WIDTH="${MOV_WIDTH:-720}"
CRF="${CRF:-40}"

SPLIT="${SPLIT:-6.10}"
BLAZE_END="${BLAZE_END:-8.60}"

OUT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/apps/web/public/brand"
mkdir -p "$OUT_DIR"

KEYED="format=rgba,chromakey=${KEY}:${SIM}:${BLEND}"

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
