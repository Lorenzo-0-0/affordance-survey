# affordance-survey-site

Project page for **“From Passive Perception to Active Interaction: A Survey of Affordance
Learning for Embodied AI”** (MARS Lab, NTU · HKUST-GZ · SJTU · USyd).

**Live: https://jingliangli.com/affordance-survey/**

Pure static site — no bundler, no framework; one CDN dependency (Lenis smooth-scroll).
Deployable at any subpath (relative URLs throughout).

## Layout

- `index.html` — single page. Two generated blocks live between HTML markers:
  `AUTHORS` (from `tools/authors.json`) and `HISTOGRAM` (from `data/papers.json`).
  Never edit those blocks by hand.
- `styles/` — `tokens.css` holds every design variable (「粉彩双档」 two-tier pastel
  palette: DEEP tier for text/links, PASTEL `-fill` tier for chart fills; NOTE: the
  role tokens keep their legacy names `--moss/--ochre/--terra` but hold cornflower /
  celadon / coral — renaming them would break the baked HISTOGRAM block); the other
  files consume it.
- `scripts/` — vanilla ES modules. `main.js` is the only versioned entry.
  `hero-topo.js` draws the hero topology backdrop (seeded layout, colors read from
  CSS tokens at init; single rAF, dash-offset writes only, IO pause offscreen).
- `data/` — **generated, never hand-edited**: `papers.json` (193 methods + 34 datasets),
  `taxonomy.json` (3 roles → 18 leaves), `tables.json` (the paper's 4 comparison tables).
- `tools/` — the build pipeline (stdlib Python + bash; no venv needed).

## Regenerating after a paper update

```bash
tools/build_all.sh --src /path/to/paper_src   # the Overleaf/LaTeX source directory
```

- `build_papers.py` parses `taxonomy.md` plus `tools/corpus_additions.json` for methods already present in the paper but missing from its Markdown index; per-paper leaf assignment lives in
  `tools/leaf_overrides.json` and English one-liners in `tools/insights_en.json`
  (keyed by title slug — the build **never rewrites these**; it reports NEW /
  ORPHANED / STALE entries for you to resolve).
- Reasoning leaves and E2E action leaves are derived automatically from the
  table columns; only perception + hierarchical-action papers need manual leaves.
- `validate_data.py` hard-fails when corpus counts drift from its `EXPECTED`
  constants — updating those constants is the deliberate “yes, the paper changed” step.
- After any asset/data change, bump `data-asset-v` on `<html>` **and** every `?v=` in
  `index.html` to the same number (validate checks uniformity).

## Author order

Order and affiliations follow the active byline in the 2026-09-15 paper — edit `tools/authors.json`, run `tools/build_authors.py`.

Each affiliation specifies a local logo asset and its display dimensions. The validator checks that every institution has a configured, existing, rendered logo. UIUC uses the official [single-color Block I](https://cdn.brand.illinois.edu/logos/limited-use/block-i/blue.svg), displayed through the same monochrome `.affil__logo` style as the other institutions.

## Dev server

`.claude/launch.json` (in `mac_vis_pack/`) has an `affordance-survey` entry → port 8470.

## Open items

- BibTeX carries `arXiv:XXXX.XXXXX` placeholder until the arXiv ID exists (also gate
  the disabled hero arXiv button on release).
- No HuggingFace link in the paper source yet (logo asset exists if one appears).

## September 15 update scope

The 193-method corpus adds ViSPLA, TokAG, Spatial-RelNet, and PAP to the previous 189. The latter two are in the active reasoning table but absent from the exported `taxonomy.md`, so `tools/corpus_additions.json` records them with provenance. The corpus contains 78 perception, 54 reasoning, and 61 action methods, plus the existing 34 dataset records. Reasoning venues and 2D/3D settings follow the active LaTeX table; table aliases keep all 37 rows linked to their method records.

`build_all.sh` refreshes the requested reasoning comparison table (37 rows), the timeline and trend figure assets, authors, and corpus. Other comparison tables remain at their previous published revision. To explicitly refresh additional tables, run `build_tables.py --src /path/to/paper --tables perception action datasets` and review the corpus coverage and validation constants. Their newer rows include methods outside the requested 193-method snapshot.
