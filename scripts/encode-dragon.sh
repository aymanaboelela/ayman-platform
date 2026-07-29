#!/usr/bin/env bash
# Encode the dragon mascot to a transparent, web-ready loop.
#
#   scripts/encode-dragon.sh <input> [output-basename]
#
# Input may be a video (mp4/mov/webm) or a folder of numbered PNG frames.
# Output lands in apps/web/public/brand/ as:
#
#   <name>.webm   VP9 + alpha  — Chrome, Firefox, Edge, Android
#   <name>.mov    HEVC + alpha — Safari and iOS, which do not decode VP9 alpha
#
# WHY VIDEO AND NOT A BIGGER SPRITE SHEET
#
# A sprite sheet costs one full-size frame of image data per pose, and the
# browser repaints the whole element every time `background-position` changes.
# Sixteen poses is four times the bytes for an animation that still is not
# smooth. A video codec stores only what CHANGED between frames, decodes on the
# GPU, and composites without touching the main thread — 30fps costs less than
# 6fps of sprite stepping, and a turn or a burst of fire is just more frames
# rather than a new engineering problem.
#
# WHY TWO FILES
#
# There is no single alpha video format every browser plays. VP9-in-WebM covers
# everything except Safari; HEVC-in-MOV covers Safari and nothing else. Two
# <source> elements, one <video>, and the browser picks.

set -euo pipefail

IN="${1:?usage: encode-dragon.sh <input-video-or-frame-folder> [output-basename]}"
NAME="${2:-dragon}"
OUT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/apps/web/public/brand"
mkdir -p "$OUT_DIR"

if [ -d "$IN" ]; then
  # A folder of frames. `-pattern_type glob` avoids caring how they are numbered.
  INPUT_ARGS=(-framerate 30 -pattern_type glob -i "$IN/*.png")
else
  INPUT_ARGS=(-i "$IN")
fi

echo "→ VP9 + alpha (WebM)"
# `-auto-alt-ref 0` is REQUIRED with alpha: VP9's alternate-reference frames are
# encoded without an alpha plane, and leaving it on silently drops transparency
# on some frames — the classic "it works then flashes a black box" bug.
ffmpeg -hide_banner -loglevel error -y "${INPUT_ARGS[@]}" \
  -c:v libvpx-vp9 -pix_fmt yuva420p \
  -b:v 0 -crf 34 -row-mt 1 -auto-alt-ref 0 \
  -an "$OUT_DIR/$NAME.webm"

echo "→ HEVC + alpha (MOV, for Safari)"
ffmpeg -hide_banner -loglevel error -y "${INPUT_ARGS[@]}" \
  -c:v hevc_videotoolbox -alpha_quality 0.9 -q:v 55 \
  -tag:v hvc1 -pix_fmt bgra \
  -an "$OUT_DIR/$NAME.mov"

echo
ls -lh "$OUT_DIR/$NAME.webm" "$OUT_DIR/$NAME.mov" | awk '{print "  " $9 "  " $5}'
echo
echo "Now register it in apps/web/lib/brand-assets.ts:"
echo
echo "  export const DRAGON_VIDEO: DragonVideo | undefined = {"
echo "    webm: '/brand/$NAME.webm',"
echo "    mov:  '/brand/$NAME.mov',"
echo "  };"
