#!/bin/bash
# Regenerate everything from the paper source, then validate.
# Usage: tools/build_all.sh --src <paper_src_dir>
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC=""
while [[ $# -gt 0 ]]; do case "$1" in --src) SRC="$2"; shift 2;; *) shift;; esac; done
[[ -z "$SRC" ]] && { echo "usage: build_all.sh --src <paper_src>"; exit 1; }

python3 "$HERE/build_papers.py" --src "$SRC"
python3 "$HERE/build_tables.py" --src "$SRC"
bash    "$HERE/build_figs.sh"   --src "$SRC"
python3 "$HERE/build_authors.py"
python3 "$HERE/build_histogram.py"
python3 "$HERE/validate_data.py" --strict
echo "build_all: OK — remember to bump data-asset-v (and all ?v=) in index.html if assets changed"
