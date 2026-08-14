#!/usr/bin/env python3
"""Parse the paper's four comparison tables (tabs/*.tex) into data/tables.json.

Column layouts are transcribed by hand per table (header rows are NOT parsed);
row-width assertions catch drift when the paper changes.
Usage: python3 tools/build_tables.py --src <paper_src_dir> [--out data/tables.json]
"""
import argparse
import json
import re
import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
SITE = TOOLS.parent

SPECS = {
    "perception": {
        "file": "perception_tab.tex",
        "expected_rows": 36,
        "cols": ["method", "venue_raw", "setting",
                 "in_I", "in_D", "in_V", "in_3D", "in_L", "in_HOI",
                 "out_M", "out_H", "out_P", "out_Mo",
                 "supervision", "open_set"],
        "has_paradigm": False,
    },
    "reasoning": {
        "file": "reasoning_tab.tex",
        "expected_rows": 33,
        "cols": ["method", "venue_raw", "setting", "text_form",
                 "out_M", "out_H", "out_P", "out_Mo"],
        "has_paradigm": True,
    },
    "action": {
        "file": "action_tab.tex",
        "expected_rows": 48,
        "cols": ["method", "venue_raw",
                 "in_I", "in_D", "in_3D", "in_L",
                 "aff_role", "robot"],
        "has_paradigm": True,
    },
    "datasets": {
        "file": "dataset_table.tex",
        "expected_rows": 32,
        "cols": ["name", "venue_raw", "setting", "obj", "aff", "num",
                 "in_I", "in_D", "in_V", "in_3D", "in_L", "in_HOI",
                 "ann_M", "ann_H", "ann_P", "ann_Mo"],
        "has_paradigm": False,
    },
}

MULTIROW_RE = re.compile(r"\\multirow(?:\[[^\]]*\])?\{[^}]*\}\{[^}]*\}\{(.*)\}\s*$")
CITE_RE = re.compile(r"~?\\citep?\{([^}]+)\}")
VENUE_RE = re.compile(r"^(.*?)\s+(\d{4})$")


def clean_paradigm(raw: str) -> str:
    raw = re.sub(r"\\shortstack(?:\[[^\]]*\])?\{", "", raw)
    raw = raw.replace(r"\\", " ").replace("}", "").replace("-", "-").strip()
    return re.sub(r"-\s+", "-", raw)  # "Relation- based" -> "Relation-based"


def clean_cell(cell: str):
    c = cell.strip()
    if re.fullmatch(r"\$\\bullet\$", c):
        return True
    if re.fullmatch(r"\$\\circ\$", c):
        return False
    if c == r"\cmark":
        return True
    if c == r"\xmark":
        return False
    c = CITE_RE.sub("", c)
    c = c.replace(r"\&", "&").replace(r"\_", "_").replace(r"\%", "%").replace("~", " ")
    c = re.sub(r"\\textbf\{([^}]*)\}", r"\1", c)
    c = re.sub(r"\s+", " ", c).strip()
    return c


def parse_table(path: Path, spec: dict):
    lines = []
    for ln in path.read_text(encoding="utf-8").splitlines():
        if ln.lstrip().startswith("%"):
            continue
        lines.append(re.sub(r"(?<!\\)%.*$", "", ln))
    text = "\n".join(lines)
    # flatten \shortstack{A\\B} -> "A B" BEFORE row-splitting (its \\ is not a row break)
    text = re.sub(r"\\shortstack(?:\[[^\]]*\])?\{([^{}]*)\}",
                  lambda mm: mm.group(1).replace("\\\\", " "), text)
    m = re.search(r"\\midrule(.*)\\bottomrule", text, flags=re.S)
    if not m:
        sys.exit(f"{path.name}: no midrule..bottomrule block")
    body = m.group(1)

    rows, paradigm = [], None
    for raw in re.split(r"\\\\|\\tabularnewline", body):
        raw = raw.strip()
        raw = re.sub(r"\\(?:midrule|cmidrule(?:\([^)]*\))?\{[^}]*\}|addlinespace(?:\[[^\]]*\])?|rowcolor\{[^}]*\})", "", raw).strip()
        if not raw:
            continue
        cells = [c for c in raw.split("&")]
        if spec["has_paradigm"]:
            head = cells[0].strip()
            mr = MULTIROW_RE.match(head)
            if mr:
                paradigm = clean_paradigm(mr.group(1))
            cells = cells[1:]  # drop paradigm column (empty on non-multirow rows)
        if len(cells) != len(spec["cols"]):
            sys.exit(f"{path.name}: row has {len(cells)} cells, expected {len(spec['cols'])}: {raw[:90]!r}")
        cite = CITE_RE.search(cells[0])
        row = {k: clean_cell(v) for k, v in zip(spec["cols"], cells)}
        row["cite_key"] = cite.group(1) if cite else None
        vm = VENUE_RE.match(row["venue_raw"])
        row["venue"], row["year"] = (vm.group(1), int(vm.group(2))) if vm else (row["venue_raw"], None)
        if spec["has_paradigm"]:
            row["paradigm"] = paradigm
        rows.append(row)
    if len(rows) != spec["expected_rows"]:
        sys.exit(f"{path.name}: parsed {len(rows)} rows, expected {spec['expected_rows']}")
    return rows


def attach_paper_keys(tables, papers_path: Path):
    """Best-effort cross-link: table method name -> papers.json key."""
    if not papers_path.exists():
        return
    papers = json.loads(papers_path.read_text(encoding="utf-8"))
    corpus = papers["methods"] + papers["datasets"]
    aliases_path = TOOLS / "table_aliases.json"
    aliases = json.loads(aliases_path.read_text(encoding="utf-8")) if aliases_path.exists() else {}
    unmatched = []
    for tname, tab in tables.items():
        for row in tab["rows"]:
            label = row.get("method") or row.get("name") or ""
            norm = label.lower().strip()
            key = aliases.get(label)
            if not key:
                hits = [p["key"] for p in corpus
                        if norm and (norm in p["title"].lower() or p["title"].lower().startswith(norm))]
                key = hits[0] if len(hits) >= 1 else None
            row["paper_key"] = key
            if not key:
                unmatched.append(f"{tname}: {label}")
    if unmatched:
        print(f"unlinked table rows (ok — add tools/table_aliases.json entries to link): {len(unmatched)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--out", default=str(SITE / "data" / "tables.json"))
    args = ap.parse_args()
    src = Path(args.src).expanduser() / "tabs"

    tables = {}
    for name, spec in SPECS.items():
        rows = parse_table(src / spec["file"], spec)
        tables[name] = {"rows": rows}
        print(f"{name}: {len(rows)} rows")
    attach_paper_keys(tables, SITE / "data" / "papers.json")

    out = {"version": 1, **tables}
    Path(args.out).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
