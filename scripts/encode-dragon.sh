#!/usr/bin/env bash
# Turn a green-screen dragon clip into a transparent, web-ready loop.
#
#   scripts/encode-dragon.sh <input.mp4> [output-basename]
#
# Env overrides (all optional — the defaults are tuned for the clip in
# public/brand, and `KEY`/`CROP` are the two you would actually change):
#
#   KEY=0x0C8D36   the screen colour, sampled from the source's background
#   SIM=0.16       chromakey similarity. HIGHER eats the subject, lower leaves
#                  green. Raise in steps of 0.02 and re-check the alpha.
#   BLEND=0.06     edge softness
#   CROP=w:h:x:y   content box. Find it with the cropdetect line below.
#   WIDTH=576      WebM width. The mascot renders at 288 CSS px at most, so
#                  576 is exactly 2x — more is bytes nobody sees.
#   MOV_WIDTH=480  Safari build. HEVC-with-alpha is far less efficient than
#                  VP9, so it trades resolution to stay in budget.
#   FPS=20         A wingbeat reads fine at 20; 24 costs ~15% for no gain.
#   CRF=46         VP9 quality. Lower is better and bigger.
#
# Outputs to apps/web/public/brand/:
#   <name>.webm   VP9 + alpha  — Chrome, Firefox, Edge, Android
#   <name>.mov    HEVC + alpha — Safari and iOS, which cannot decode VP9 alpha
#
# ---------------------------------------------------------------------------
# FINDING THE NUMBERS FOR A NEW CLIP
#
# 1. Sample the screen colour from a patch of clean background:
#      ffmpeg -i in.mp4 -vf "crop=40:40:800:440" -frames:v 1 -f rawvideo \
#             -pix_fmt rgb24 - | xxd -l3
#
# 2. Find the content box (run it over the WHOLE clip, not one frame — wings
#    move, and a box fitted to a single frame clips them later):
#      ffmpeg -i in.mp4 -vf "chromakey=0xKEY:0.16:0.06,alphaextract,\
#             cropdetect=limit=24:round=2:reset=0" -f null - 2>&1 | grep crop=
#
# 3. LOOK at the alpha before encoding. Numbers do not tell you that the key
#    ate a wing:
#      ffmpeg -i in.mp4 -vf "chromakey=...,alphaextract" -frames:v 1 alpha.png
# ---------------------------------------------------------------------------

set -euo pipefail

IN="${1:?usage: encode-dragon.sh <input.mp4> [output-basename]}"
NAME="${2:-dragon}"

KEY="${KEY:-0x0C8D36}"
SIM="${SIM:-0.16}"
BLEND="${BLEND:-0.06}"
CROP="${CROP:-700:424:34:42}"
WIDTH="${WIDTH:-576}"
FPS="${FPS:-20}"
MOV_WIDTH="${MOV_WIDTH:-480}"
CRF="${CRF:-46}"

OUT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/apps/web/public/brand"
mkdir -p "$OUT_DIR"

# `despill` is what stops a green rim appearing once the subject sits on a light
# background — the key alone only removes whole pixels, not the green bounced
# onto the edges of the subject.
KEYED="crop=${CROP},chromakey=${KEY}:${SIM}:${BLEND},despill=type=green:mix=0.5:expand=0.3"

echo "→ VP9 + alpha (WebM)"
# `-auto-alt-ref 0` is REQUIRED with alpha. VP9's alternate-reference frames are
# encoded without an alpha plane, and leaving it on drops transparency on some
# frames — the classic "works, then flashes a black box" bug.
ffmpeg -hide_banner -loglevel error -y -i "$IN" \
  -vf "${KEYED},scale=${WIDTH}:-2,fps=${FPS}" \
  -c:v libvpx-vp9 -pix_fmt yuva420p \
  -b:v 0 -crf "$CRF" -row-mt 1 -auto-alt-ref 0 \
  -an "$OUT_DIR/$NAME.webm"

echo "→ HEVC + alpha (MOV, for Safari)"
ffmpeg -hide_banner -loglevel error -y -i "$IN" \
  -vf "${KEYED},scale=${MOV_WIDTH}:-2,fps=${FPS},format=bgra" \
  -c:v hevc_videotoolbox -alpha_quality 0.7 -q:v 40 \
  -tag:v hvc1 \
  -an "$OUT_DIR/$NAME.mov"

echo
ls -lh "$OUT_DIR/$NAME.webm" "$OUT_DIR/$NAME.mov" | awk '{printf "  %-46s %s\n", $9, $5}'
echo
echo "Register it in apps/web/lib/brand-assets.ts:"
echo "  export const DRAGON_VIDEO: DragonVideo | undefined = {"
echo "    webm: '/brand/$NAME.webm',"
echo "    mov:  '/brand/$NAME.mov',"
echo "  };"
