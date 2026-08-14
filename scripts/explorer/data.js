/* pure data layer: indexes, facet inventories, filter pipeline */
export function buildIndex(papers, taxonomy) {
  const methods = papers.methods;
  const datasets = papers.datasets;
  const byKey = new Map();
  methods.forEach((p) => byKey.set(p.key, p));
  datasets.forEach((d) => byKey.set(d.key, d));

  const leafInfo = new Map();   // slug -> {label, role, family, blurb, papers}
  const roleOf = new Map();     // key -> role (for datasets: 'datasets')
  taxonomy.roles.forEach((r) =>
    r.families.forEach((f) =>
      f.leaves.forEach((l) => leafInfo.set(l.slug, { ...l, role: r.slug, family: f.label }))));
  methods.forEach((p) => roleOf.set(p.key, p.role));
  datasets.forEach((d) => roleOf.set(d.key, 'datasets'));

  const years = methods.concat(datasets).map((p) => p.year).filter(Boolean);
  const yearMin = Math.min(...years);
  const yearMax = Math.max(...years);

  const venueCount = new Map();
  methods.concat(datasets).forEach((p) => {
    if (p.venue) venueCount.set(p.venue, (venueCount.get(p.venue) || 0) + 1);
  });
  const topVenues = [...venueCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 9).map(([v]) => v);

  const hay = new Map();
  methods.forEach((p) => hay.set(p.key,
    `${p.title} ${p.venue_raw} ${p.insight_en || ''} ${p.leaf}`.toLowerCase()));
  datasets.forEach((d) => hay.set(d.key,
    `${d.title} ${d.paper_title || ''} ${d.venue_raw} ${d.insight_en || ''}`.toLowerCase()));

  return { methods, datasets, byKey, leafInfo, yearMin, yearMax, topVenues, hay };
}

export function filterPapers(idx, s, { ignoreTree = false } = {}) {
  const pool = s.mode === 'datasets' ? idx.datasets : idx.methods;
  const q = s.q.trim().toLowerCase();
  return pool.filter((p) => {
    if (!ignoreTree && s.mode === 'methods') {
      if (s.role && p.role !== s.role) return false;
      if (s.leaf && p.leaf !== s.leaf) return false;
    }
    if (s.yearMin && (p.year || 0) < s.yearMin) return false;
    if (s.yearMax && (p.year || 9999) > s.yearMax) return false;
    if (s.venues.length) {
      const v = idx.topVenues.includes(p.venue) ? p.venue : 'Other';
      if (!s.venues.includes(v)) return false;
    }
    if (s.mode === 'methods') {
      if (s.modals.length) {
        const m = p.modal || '';
        if (!s.modals.some((tok) => m.split('+').includes(tok) || m === tok)) return false;
      }
      if (s.targets.length) {
        const t = (p.attrs && p.attrs.target) || '';
        if (!s.targets.some((tok) => t.includes(tok))) return false;
      }
      if (s.mllm && !(p.attrs && p.attrs.mllm)) return false;
    }
    if (q && !idx.hay.get(p.key).includes(q)) return false;
    return true;
  });
}
