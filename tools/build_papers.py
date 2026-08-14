#!/usr/bin/env python3
"""Parse the survey's taxonomy.md into data/papers.json + data/taxonomy.json.

Stdlib only. The markdown tables are the source of truth for the corpus;
leaf assignment and English insights live in hand-maintained overrides files
(tools/leaf_overrides.json, tools/insights_en.json) which this script merges
but never rewrites.

Usage:
  python3 tools/build_papers.py --src <paper_src_dir> [--out data]
                                [--check] [--dump-worklist FILE]
"""
import argparse
import hashlib
import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from difflib import get_close_matches
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
SITE = TOOLS.parent

ROLE_HEADINGS = {"perception": "perception", "reasoning": "reasoning", "action": "action"}


def slugify(title: str) -> str:
    t = unicodedata.normalize("NFKD", title)
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    return t


def sha1(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]


def strip_comments(md: str) -> str:
    return re.sub(r"<!--.*?-->", "", md, flags=re.S)


def split_sections(md: str):
    """Yield (heading, body) for each ## section."""
    parts = re.split(r"^##\s+(.+)$", md, flags=re.M)
    for i in range(1, len(parts) - 1, 2):
        yield parts[i].strip(), parts[i + 1]


def table_rows(body: str):
    """Rows of the first markdown table in body (skips header + separator)."""
    lines = [ln.rstrip() for ln in body.splitlines() if ln.lstrip().startswith("|")]
    rows = []
    seen_sep = False
    for ln in lines:
        if re.match(r"^\s*\|[\s:|-]+\|\s*$", ln):
            seen_sep = True
            continue
        if not seen_sep:
            continue  # header row(s)
        cells = [c.strip() for c in ln.strip().strip("|").split("|")]
        rows.append(cells)
    return rows


LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
VENUE_RE = re.compile(r"^(.*?)\s+(\d{4})(?:\.(\d{1,2}))?$")


def parse_title_cell(cell: str):
    m = LINK_RE.search(cell)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return cell.strip(), None


def parse_dataset_title_cell(cell: str):
    """Datasets col 1 is either '[Title](url)' or 'Name / [Paper Title](url)'."""
    m = LINK_RE.search(cell)
    url = m.group(2).strip() if m else None
    before = cell.split("/ [")[0].strip() if "/ [" in cell else ""
    if before:
        return before.rstrip(" /"), url, (m.group(1).strip() if m else None)
    return (m.group(1).strip() if m else cell.strip()), url, None


def parse_venue(cell: str):
    cell = cell.strip()
    m = VENUE_RE.match(cell)
    if not m:
        return cell, None, None
    return m.group(1).strip(), int(m.group(2)), (int(m.group(3)) if m.group(3) else None)


def parse_insight(cell: str):
    parts = re.split(r"<br\s*/?>", cell)
    out = {"brief": "", "route": "", "insight": ""}
    keymap = {"简介": "brief", "技术路线": "route", "insight": "insight"}
    for p in parts:
        p = p.strip()
        m = re.match(r"^(简介|技术路线|Insight)\s*[:：]\s*(.*)$", p, flags=re.I)
        if m:
            out[keymap[m.group(1).lower() if m.group(1).lower() == "insight" else m.group(1)]] = m.group(2).strip()
        elif p and not out["brief"]:
            out["brief"] = p
    return out


def norm_modal(cell: str) -> str:
    c = cell.strip().replace("｜", "/").replace(" ", "")
    if not c:
        return ""
    if c.lower() == "implicit":
        return "implicit"
    toks = re.split(r"[/+,]", c)
    canon = []
    for t in toks:
        tl = t.lower()
        if tl in ("2d", "2drgb-d", "2d/rgb-d", "rgb-d"):
            canon.append("2D")
        elif tl in ("video",):
            canon.append("Video")
        elif tl in ("3d",):
            canon.append("3D")
        elif t:
            canon.append(t)
    order = {"2D": 0, "Video": 1, "3D": 2}
    canon = sorted(set(canon), key=lambda x: order.get(x, 9))
    return "+".join(canon)


def norm_target(cell: str) -> str:
    c = cell.strip().lower()
    if not c:
        return ""
    has_obj = "object" in c
    has_scene = "scene" in c
    if has_obj and has_scene:
        return "object+scene"
    if "object-pair" in c or "pair" in c:
        return "object-pair"
    if has_obj:
        return "object"
    if has_scene:
        return "scene"
    return c


def load_json(path: Path, default):
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return default


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="paper source dir containing taxonomy.md")
    ap.add_argument("--out", default=str(SITE / "data"))
    ap.add_argument("--check", action="store_true", help="report only, write nothing")
    ap.add_argument("--dump-worklist", default=None, help="write leaf/translation worklist JSON")
    args = ap.parse_args()

    md_path = Path(args.src).expanduser() / "taxonomy.md"
    md = strip_comments(md_path.read_text(encoding="utf-8"))

    tree = load_json(TOOLS / "taxonomy_tree.json", None)
    if tree is None:
        sys.exit("taxonomy_tree.json missing")
    leaf_index = {}  # slug -> (role, family)
    for role in tree["roles"]:
        for fam in role["families"]:
            for leaf in fam["leaves"]:
                leaf_index[leaf["slug"]] = (role["slug"], fam["slug"])

    leaf_overrides = load_json(TOOLS / "leaf_overrides.json", {})
    insights = load_json(TOOLS / "insights_en.json", {})

    methods, datasets = [], []
    for heading, body in split_sections(md):
        h = heading.strip().lower()
        role = None
        for key in ROLE_HEADINGS:
            if h == key:
                role = key
        is_dataset = "dataset" in h
        if role is None and not is_dataset:
            continue
        # per-section column schemas (taxonomy.md tables are heterogeneous):
        #   perception: title|venue|zh|Transfer|Output Modal|Object-Scene   (6)
        #   reasoning:  title|venue|zh|2D-3D|Reasoning Category|MLLM       (6)
        #   action:     title|venue|zh|Hierarchical-E2E|explicit-implicit-reward (5)
        #   datasets:   title|venue|category|benchmark                      (4)
        expect = {"perception": 6, "reasoning": 6, "action": 5}
        for cells in table_rows(body):
            if not any(cells):
                continue
            if is_dataset:
                if len(cells) < 4:
                    sys.exit(f"dataset row too short: {cells}")
                title, url, paper_title = parse_dataset_title_cell(cells[0])
                venue, year, month = parse_venue(cells[1])
                datasets.append({
                    "key": slugify(title), "title": title, "url": url,
                    "paper_title": paper_title,
                    "venue": venue, "year": year, "month": month, "venue_raw": cells[1],
                    "category_zh": cells[2], "benchmark_zh": cells[3],
                })
                continue
            if len(cells) < expect[role]:
                sys.exit(f"method row in {role} has {len(cells)} cells (need {expect[role]}): {cells[0][:60]!r}")
            title, url = parse_title_cell(cells[0])
            venue, year, month = parse_venue(cells[1])
            insight_zh = parse_insight(cells[2])
            rec = {
                "key": slugify(title), "title": title, "url": url,
                "venue": venue, "year": year, "month": month, "venue_raw": cells[1],
                "role": role, "leaf": None,
                "modal": None, "attrs": {},
                "insight_zh": insight_zh, "insight_en": None,
                "zh_hash": sha1(json.dumps(insight_zh, ensure_ascii=False, sort_keys=True)),
            }
            if role == "perception":
                rec["attrs"] = {"transfer": cells[3].strip(), "target": norm_target(cells[5])}
                rec["modal"] = norm_modal(cells[4])
            elif role == "reasoning":
                raw_modal = cells[3].strip()
                rec["modal"] = norm_modal(raw_modal.split("/")[0])
                cat = cells[4].strip().lower()
                fam = ("relation-modeling" if "relation" in cat
                       else "agentic-feasibility" if "agentic" in cat
                       else "task-intent" if "language" in cat else None)
                rec["attrs"] = {"category": cells[4].strip(), "modal_raw": raw_modal,
                                "mllm": cells[5].strip().lower().startswith("y")}
                rec["auto_leaf"] = fam
            elif role == "action":
                arch = cells[3].strip()
                aff_role = cells[4].strip().lower()
                rec["attrs"] = {"arch": arch, "aff_role": cells[4].strip()}
                if arch.upper().startswith("E2E"):
                    rec["auto_leaf"] = {"explicit": "explicit-input",
                                       "implicit": "implicit-representation",
                                       "reward": "optimization-signal"}.get(aff_role.split("/")[0])
            methods.append(rec)

    # --- key uniqueness (hard) ---
    all_keys = [p["key"] for p in methods] + [d["key"] for d in datasets]
    dupes = {k for k in all_keys if all_keys.count(k) > 1}
    if dupes:
        sys.exit(f"KEY COLLISION: {sorted(dupes)}")

    # --- merge overrides ---
    report = {"new_leaf": [], "new_insight": [], "orphaned": [], "stale": [], "bad_leaf": []}
    known = set(all_keys)
    for k in sorted(set(leaf_overrides) | set(insights)):
        if k not in known:
            sugg = get_close_matches(k, all_keys, n=1, cutoff=0.85)
            report["orphaned"].append(f"{k}" + (f"  → did you mean: {sugg[0]}" if sugg else ""))

    for p in methods:
        leaf = leaf_overrides.get(p["key"]) or p.pop("auto_leaf", None)
        p.pop("auto_leaf", None)
        if leaf is None:
            report["new_leaf"].append(p["key"])
        elif leaf not in leaf_index:
            report["bad_leaf"].append(f"{p['key']} → unknown leaf {leaf!r}")
        elif leaf_index[leaf][0] != p["role"]:
            report["bad_leaf"].append(f"{p['key']} → leaf {leaf} belongs to {leaf_index[leaf][0]}, paper parsed under {p['role']}")
        else:
            p["leaf"] = leaf
        ins = insights.get(p["key"])
        if ins is None:
            report["new_insight"].append(p["key"])
        else:
            p["insight_en"] = ins["en"]
            if ins.get("zh_hash") and ins["zh_hash"] != p["zh_hash"]:
                report["stale"].append(p["key"])
    for d in datasets:
        ins = insights.get(d["key"])
        d["insight_en"] = ins["en"] if ins else None
        if ins is None:
            report["new_insight"].append(d["key"])

    counts = {r: sum(1 for p in methods if p["role"] == r) for r in ROLE_HEADINGS}
    counts["datasets"] = len(datasets)
    print(f"parsed: {counts}  (methods total {len(methods)})")
    for label, items in report.items():
        if items:
            print(f"\n== {label.upper()} ({len(items)}) ==")
            for it in items[:400]:
                print(f"  {it}")
    if report["bad_leaf"]:
        sys.exit("bad leaf assignments — fix leaf_overrides.json")

    if args.dump_worklist:
        wl = {
            "methods": [
                {"key": p["key"], "title": p["title"], "venue_raw": p["venue_raw"],
                 "role": p["role"], "zh": p["insight_zh"], "modal": p["modal"],
                 "attrs": p["attrs"], "leaf": p["leaf"],
                 "needs_leaf": p["key"] in set(report["new_leaf"])}
                for p in methods
            ],
            "datasets": [
                {"key": d["key"], "title": d["title"], "venue_raw": d["venue_raw"],
                 "category_zh": d["category_zh"], "benchmark_zh": d["benchmark_zh"]}
                for d in datasets
            ],
        }
        Path(args.dump_worklist).write_text(json.dumps(wl, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"\nworklist → {args.dump_worklist}")

    if args.check:
        return

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
    papers = {
        "version": 1, "generated": stamp,
        "source": f"taxonomy.md sha1:{sha1(md)}",
        "counts": counts,
        "methods": methods, "datasets": datasets,
    }
    (out / "papers.json").write_text(json.dumps(papers, ensure_ascii=False, indent=1), encoding="utf-8")

    # taxonomy.json = skeleton + per-leaf ordered keys
    tax = {"version": 1, "roles": []}
    for role in tree["roles"]:
        r = {k: role[k] for k in ("slug", "numeral", "label", "question")}
        r["families"] = []
        for fam in role["families"]:
            f = {"slug": fam["slug"], "label": fam["label"], "leaves": []}
            for leaf in fam["leaves"]:
                members = [p for p in methods if p["leaf"] == leaf["slug"]]
                members.sort(key=lambda p: (p["year"] or 0, p["month"] or 0, p["key"]))
                f["leaves"].append({**leaf, "papers": [p["key"] for p in members]})
            r["families"].append(f)
        tax["roles"].append(r)
    (out / "taxonomy.json").write_text(json.dumps(tax, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nwrote {out/'papers.json'} and {out/'taxonomy.json'}")


if __name__ == "__main__":
    main()
