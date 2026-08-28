/* §04 atlas index — wiring: data → state → url → filters/tree/list */
import { createState } from './state.js?v=28';
import { buildIndex, filterPapers } from './data.js?v=28';
import { initUrl } from './url.js?v=28';
import { initFilters } from './filters.js?v=28';
import { initTree } from './tree.js?v=28';
import { initList } from './list.js?v=28';

export function initExplorer(root, papers, taxonomy) {
  if (!root) return;
  const idx = buildIndex(papers, taxonomy);

  root.innerHTML = `
    <button class="explorer__filtersbtn" aria-expanded="false">Filters</button>
    <aside class="explorer__rail" aria-label="Corpus filters" data-lenis-prevent></aside>
    <div class="explorer__main">
      <div class="explorer__tree" role="navigation" aria-label="Taxonomy"></div>
      <div class="explorer__list"></div>
    </div>`;

  const railEl = root.querySelector('.explorer__rail');
  const treeEl = root.querySelector('.explorer__tree');
  const listEl = root.querySelector('.explorer__list');
  const filtersBtn = root.querySelector('.explorer__filtersbtn');

  const stateApi = createState(root, {});
  const url = initUrl(root, stateApi);
  const filters = initFilters(railEl, idx, stateApi);
  const tree = initTree(treeEl, idx, taxonomy, stateApi, () => {
    const s = stateApi.get();
    const counts = new Map();
    filterPapers(idx, s, { ignoreTree: true }).forEach((p) => {
      if (p.leaf) counts.set(p.leaf, (counts.get(p.leaf) || 0) + 1);
    });
    return counts;
  });
  const list = initList(listEl, idx, stateApi);

  const rerender = ({ state, changed, meta }) => {
    const shown = filterPapers(idx, state);
    const total = state.mode === 'datasets' ? idx.datasets.length : idx.methods.length;
    filters.sync(state, shown.length, total);
    tree.render(state);
    list.render(state, shown);
    if (changed.includes('paper') && state.paper && meta?.scrollTo !== false) {
      const el = document.getElementById(`paper-${state.paper}`);
      if (el) el.scrollIntoView({ block: 'center', behavior: meta?.fromUrl ? 'auto' : 'smooth' });
    }
  };
  stateApi.onChange(rerender);

  filtersBtn.addEventListener('click', () => {
    const open = root.classList.toggle('rail-open');
    filtersBtn.setAttribute('aria-expanded', String(open));
  });

  // inbound cross-links (question cards, tables)
  document.addEventListener('explorer:pin', (e) => {
    const key = e.detail.key;
    const p = idx.byKey.get(key);
    if (!p) return;
    stateApi.set({
      mode: p.role ? 'methods' : 'datasets',
      role: p.role || null,
      leaf: p.leaf || null,
      paper: key,
    }, { force: true });
  });
  document.querySelectorAll('[data-explorer-pin]').forEach((a) => {
    a.addEventListener('click', () => {
      const [k, v] = a.dataset.explorerPin.split(':');
      stateApi.set({ mode: 'methods', [k]: v, leaf: null, paper: null }, { force: true });
    });
  });

  // Esc clears the expanded paper
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && stateApi.get().paper) stateApi.set({ paper: null });
  });

  if (!url.pinFromHash()) {
    stateApi.set({}, { force: true }); // initial paint
  }
  document.documentElement.classList.add('explorer-ready');
}
