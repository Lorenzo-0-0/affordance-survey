/* paper list grouped by leaf, with inline expandable detail */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ym = (p) => (p.year ? `${p.year}${p.month ? '.' + String(p.month).padStart(2, '0') : ''}` : '—');

function chips(p, mode) {
  if (mode === 'datasets') return '';
  const out = [];
  if (p.modal) out.push(`<span class="pchip">${esc(p.modal)}</span>`);
  if (p.attrs?.transfer && p.attrs.transfer !== 'no') out.push(`<span class="pchip">${esc(p.attrs.transfer)}</span>`);
  if (p.attrs?.target) out.push(`<span class="pchip">${esc(p.attrs.target)}</span>`);
  if (p.attrs?.mllm) out.push('<span class="pchip">MLLM</span>');
  if (p.attrs?.arch) out.push(`<span class="pchip">${esc(p.attrs.arch)}</span>`);
  if (p.attrs?.aff_role) out.push(`<span class="pchip">${esc(p.attrs.aff_role)}</span>`);
  return out.join('');
}

function detail(p, mode) {
  const zh = mode === 'datasets'
    ? (p.category_zh ? `<details class="pd__zh"><summary>原文（中文）</summary><p>类别：${esc(p.category_zh)}</p><p>Benchmark：${esc(p.benchmark_zh)}</p></details>` : '')
    : (p.insight_zh ? `<details class="pd__zh"><summary>原文（中文）</summary>
        <p>${esc(p.insight_zh.brief)}</p><p>${esc(p.insight_zh.route)}</p><p>${esc(p.insight_zh.insight)}</p></details>` : '');
  return `
    <div class="paper__detail">
      <p class="pd__insight">${esc(p.insight_en || '')}</p>
      ${zh}
      <div class="pd__actions">
        ${p.url ? `<a class="pd__link" href="${esc(p.url)}" target="_blank" rel="noopener">Paper ↗</a>` : ''}
        <button class="pd__link" data-copylink="${esc(p.key)}">Copy link</button>
      </div>
    </div>`;
}

export function initList(el, idx, stateApi) {
  let lastSlugs = []; // leaf slugs of the last grouped render (for expand-all)

  const row = (p, state) => `
    <li class="paper role-${p.role || 'datasets'} ${state.paper === p.key ? 'is-open' : ''}" data-key="${esc(p.key)}" id="paper-${esc(p.key)}">
      <button class="paper__row" aria-expanded="${state.paper === p.key}">
        <span class="paper__year">${ym(p)}</span>
        <span class="paper__title">${esc(p.title)}</span>
        <span class="paper__venue">${esc(p.venue || '')}</span>
        <span class="paper__chips">${chips(p, state.mode)}</span>
      </button>
      ${state.paper === p.key ? detail(p, state.mode) : ''}
    </li>`;

  const render = (state, shown) => {
    if (!shown.length) {
      el.innerHTML = '<p class="list__empty">No entries match — loosen a filter or clear the search.</p>';
      return;
    }
    shown = [...shown].sort((a, b) =>
      (a.year || 0) - (b.year || 0) || (a.month || 0) - (b.month || 0) || a.key.localeCompare(b.key));
    if (state.mode === 'datasets' || state.leaf) {
      el.innerHTML = `<ul class="list__flat">${shown.map((p) => row(p, state)).join('')}</ul>`;
      return;
    }
    // group by leaf, keeping taxonomy order — collapsed by default.
    // A group is open if: the user opened it, a search is active, or it
    // contains the pinned paper (deep links / cross-links auto-expand).
    const byLeaf = new Map();
    shown.forEach((p) => {
      if (!byLeaf.has(p.leaf)) byLeaf.set(p.leaf, []);
      byLeaf.get(p.leaf).push(p);
    });
    // leafInfo's insertion order IS taxonomy order — use it so the collapsed
    // index reads as a table of contents, not first-paper-year order
    lastSlugs = [...idx.leafInfo.keys()].filter((s) => byLeaf.has(s))
      .concat([...byLeaf.keys()].filter((s) => !idx.leafInfo.has(s)));
    const searching = state.q.trim() !== '';
    let html = `
      <div class="list__tools">
        <span class="list__toolsum">${byLeaf.size} leaves · ${shown.length} entries — click a leaf to reveal its papers</span>
        <button class="list__toolbtn" data-expandall>Expand all</button>
        <button class="list__toolbtn" data-collapseall>Collapse all</button>
      </div>`;
    for (const slug of lastSlugs) {
      const papers = byLeaf.get(slug);
      const info = idx.leafInfo.get(slug);
      const isOpen = searching || state.open.includes(slug) || papers.some((p) => p.key === state.paper);
      html += `
        <section class="list__leafgroup role-${info.role} ${isOpen ? 'is-open' : ''}">
          <h4 class="list__leafhead">
            <button class="leaf__toggle" data-leaftoggle="${esc(slug)}" aria-expanded="${isOpen}" aria-controls="leafgroup-${esc(slug)}">
              <span class="leaf__chev" aria-hidden="true">▸</span>
              <span class="leaf__name">${esc(info.label)}</span>
              <span class="list__leafcount">${papers.length}</span>
            </button>
            <button class="leaf__focus" data-goleaf="${esc(slug)}" data-gorole="${info.role}" title="Focus this leaf across the whole index">focus →</button>
          </h4>
          ${isOpen ? `<ul class="list__flat" id="leafgroup-${esc(slug)}">${papers.map((p) => row(p, stateApi.get())).join('')}</ul>` : ''}
        </section>`;
    }
    el.innerHTML = html;
  };

  el.addEventListener('click', async (e) => {
    const copy = e.target.closest('[data-copylink]');
    if (copy) {
      const url = `${location.origin}${location.pathname}#x=p:${copy.dataset.copylink}`;
      try { await navigator.clipboard.writeText(url); copy.textContent = 'Copied ✓'; } catch { /* noop */ }
      setTimeout(() => { copy.textContent = 'Copy link'; }, 1600);
      return;
    }
    if (e.target.closest('a')) return;
    if (e.target.closest('details')) return;
    const tog = e.target.closest('[data-leaftoggle]');
    if (tog) {
      const s = stateApi.get();
      const slug = tog.dataset.leaftoggle;
      stateApi.set({ open: s.open.includes(slug) ? s.open.filter((x) => x !== slug) : [...s.open, slug] });
      return;
    }
    if (e.target.closest('[data-expandall]')) { stateApi.set({ open: [...lastSlugs] }); return; }
    if (e.target.closest('[data-collapseall]')) { stateApi.set({ open: [] }); return; }
    const go = e.target.closest('[data-goleaf]');
    if (go) { stateApi.set({ role: go.dataset.gorole, leaf: go.dataset.goleaf }); return; }
    const li = e.target.closest('.paper');
    if (li) {
      const s = stateApi.get();
      stateApi.set({ paper: s.paper === li.dataset.key ? null : li.dataset.key });
    }
  });

  return { render };
}
