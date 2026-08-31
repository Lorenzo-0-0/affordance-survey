#!/usr/bin/env python3
"""Hard gate for the site's generated data + asset hygiene.

Constants below are transcribed independently from the paper source —
when the paper changes, updating them is the deliberate acknowledgment step.
Usage: python3 tools/validate_data.py [--strict]
"""
import argparse
import json
import re
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent

EXPECTED = {
    "methods": {"perception": 78, "reasoning": 50, "action": 61},
    "datasets": 34,
    "tables": {"perception": 36, "reasoning": 36, "action": 48, "datasets": 32},
    "leaves": 18,
    "roles": 3,
}

fails, warns = [], []


def fail(msg): fails.append(msg)
def warn(msg): warns.append(msg)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true")
    args = ap.parse_args()

    papers = json.loads((SITE / "data" / "papers.json").read_text())
    tax = json.loads((SITE / "data" / "taxonomy.json").read_text())
    tables = json.loads((SITE / "data" / "tables.json").read_text())
    html = (SITE / "index.html").read_text()

    # --- corpus counts ---
    for role, n in EXPECTED["methods"].items():
        got = sum(1 for m in papers["methods"] if m["role"] == role)
        if got != n:
            fail(f"methods[{role}] = {got}, expected {n}")
    if len(papers["datasets"]) != EXPECTED["datasets"]:
        fail(f"datasets = {len(papers['datasets'])}, expected {EXPECTED['datasets']}")

    # --- keys unique, urls present ---
    keys = [p["key"] for p in papers["methods"]] + [d["key"] for d in papers["datasets"]]
    if len(keys) != len(set(keys)):
        fail("duplicate keys")
    for p in papers["methods"] + papers["datasets"]:
        if not (p.get("url") or "").startswith("http"):
            warn(f"no url: {p['key']}")

    # --- taxonomy ---
    leaves = [l for r in tax["roles"] for f in r["families"] for l in f["leaves"]]
    if len(tax["roles"]) != EXPECTED["roles"]:
        fail(f"roles = {len(tax['roles'])}")
    if len(leaves) != EXPECTED["leaves"]:
        fail(f"leaves = {len(leaves)}, expected {EXPECTED['leaves']}")
    empty = [l["slug"] for l in leaves if not l["papers"]]
    if empty:
        fail(f"empty leaves: {empty}")
    assigned = sum(len(l["papers"]) for l in leaves)
    if assigned != len(papers["methods"]):
        fail(f"leaf coverage {assigned}/{len(papers['methods'])}")

    # --- insights ---
    missing_ins = [p["key"] for p in papers["methods"] + papers["datasets"] if not p.get("insight_en")]
    if missing_ins:
        (fail if args.strict else warn)(f"missing insight_en: {len(missing_ins)}")

    # --- tables ---
    for name, n in EXPECTED["tables"].items():
        got = len(tables[name]["rows"])
        if got != n:
            fail(f"tables[{name}] = {got}, expected {n}")

    # --- asset version uniformity ---
    mv = re.search(r'data-asset-v="(\d+)"', html)
    if not mv:
        fail("no data-asset-v on <html>")
    else:
        v = mv.group(1)
        bad = {q for q in re.findall(r"\?v=(\d+)", html) if q != v}
        if bad:
            fail(f"?v= values {bad} differ from data-asset-v={v}")
    # every module import must carry the SAME ?v= as data-asset-v
    # (dev servers without cache-control heuristically cache unversioned modules)
    if mv:
        for js in (SITE / "scripts").rglob("*.js"):
            for imp in re.findall(r"from\s+['\"]([^'\"]+)['\"]", js.read_text()):
                q = re.search(r"\?v=(\d+)", imp)
                if not q:
                    fail(f"{js.name}: unversioned module import {imp} (run tools/bump_version.py)")
                elif q.group(1) != mv.group(1):
                    fail(f"{js.name}: import {imp} != data-asset-v={mv.group(1)}")

    # --- img dimensions ---
    for tag in re.findall(r"<img\b[^>]*>", html):
        if "width=" not in tag or "height=" not in tag:
            fail(f"<img> missing width/height: {tag[:80]}")

    # --- placeholders ---
    if "XXXX.XXXXX" in html:
        warn("BibTeX still carries arXiv placeholder (expected until release)")
    if "TODO: final deploy URL" in html:
        warn("canonical/og:url TODO still open (expected until deploy)")

    print(f"validate: {len(fails)} fail, {len(warns)} warn")
    for f in fails:
        print(f"  FAIL {f}")
    for w in warns:
        print(f"  warn {w}")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
