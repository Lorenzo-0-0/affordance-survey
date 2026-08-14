#!/bin/bash
# Convert the paper's active figure PDFs into web png+webp with stable names.
# Usage: tools/build_figs.sh --src <paper_src_dir>
set -euo pipefail
SRC=""
while [[ $# -gt 0 ]]; do case "$1" in --src) SRC="$2"; shift 2;; *) shift;; esac; done
[[ -z "$SRC" ]] && { echo "usage: build_figs.sh --src <paper_src>"; exit 1; }
OUT="$(cd "$(dirname "$0")/.." && pwd)/assets/images"
mkdir -p "$OUT"

names=(overview timeline)
srcs=(overview-wide-2 timeline-cosmic)

for i in "${!names[@]}"; do
  n="${names[$i]}"; s="${srcs[$i]}"
  pdftocairo -png -r 200 -singlefile "$SRC/figures/$s.pdf" "$OUT/$n"
  magick "$OUT/$n.png" -trim +repage -bordercolor white -border 16 "$OUT/$n.png"
  magick "$OUT/$n.png" -quality 88 "$OUT/$n.webp"
  magick identify -format "$n: %wx%h  <img width=\"%w\" height=\"%h\">\n" "$OUT/$n.png"
done
echo "done → $OUT"
