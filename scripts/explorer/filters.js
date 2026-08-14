/* sidebar rail: mode toggle, search, year/venue/modal/target facets, status */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function initFilters(rail, idx, stateApi) {
  const years = [];
  for (let y = idx.yearMin; y <= idx.yearMax; y++) years.push(y);
  const venueOpts = [...idx.topVenues, 'Other'];

  rail.innerHTML = `
    <div class="rail__mode" role="tablist">
      <button class="rail__modebtn is-active" data-mode="methods">Methods</button>
      <button class="rail__modebtn" data-mode="datasets">Datasets</button>
    </div>
    <label class="rail__search">
      <input type="search" placeholder="Search title, insight…" aria-label="Search the corpus" />
      <kbd>/</kbd>
    </label>
    <div class="rail__group">
      <span class="rail__label">Years</span>
      <div class="rail__years">
        <select data-year="min" aria-label="From year">
          <option value="">${idx.yearMin}</option>
          ${years.map((y) => `<option value="${y}">${y}</option>`).join('')}
        </select>
        <span>—</span>
        <select data-year="max" aria-label="To year">
          <option value="">${idx.yearMax}</option>
          ${years.map((y) => `<option value="${y}">${y}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="rail__group">
      <span class="rail__label">Venue</span>
      <div class="rail__chips" data-facet="venues">
        ${venueOpts.map((v) => `<button class="chip" data-val="${esc(v)}">${esc(v)}</button>`).join('')}
      </div>
    </div>
    <div class="rail__group" data-methods-only>
      <span class="rail__label">Output space</span>
      <div class="rail__chips" data-facet="modals">
        ${['2D', 'Video', '3D', 'implicit'].map((m) => `<button class="chip" data-val="${m}">${m}</button>`).join('')}
      </div>
    </div>
    <div class="rail__group" data-methods-only>
      <span class="rail__label">Grounding target</span>
      <div class="rail__chips" data-facet="targets">
        ${['object', 'scene'].map((t) => `<button class="chip" data-val="${t}">${t}</button>`).join('')}
      </div>
    </div>
    <div class="rail__group" data-methods-only>
      <span class="rail__label">Backbone</span>
      <div class="rail__chips">
        <button class="chip" data-toggle="mllm">MLLM-based</button>
      </div>
    </div>
    <button class="rail__clear" hidden>Clear filters ×</button>
    <p class="rail__status" role="status" aria-live="polite"></p>`;

  const search = rail.querySelector('input[type=search]');
  search.addEventListener('input', () => stateApi.set({ q: search.value }));
  addEventListener('keydown', (e) => {
    if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) {
      e.preventDefault();
      search.focus();
    }
  });

  rail.querySelectorAll('[data-year]').forEach((sel) =>
    sel.addEventListener('change', () => stateApi.set({
      [sel.dataset.year === 'min' ? 'yearMin' : 'yearMax']: sel.value ? +sel.value : null,
    })));

  rail.addEventListener('click', (e) => {
    const mode = e.target.closest('[data-mode]');
    if (mode) { stateApi.set({ mode: mode.dataset.mode, leaf: null, role: null, paper: null }); return; }
    const chip = e.target.closest('.chip[data-val]');
    if (chip) {
      const facet = chip.closest('[data-facet]').dataset.facet;
      const cur = stateApi.get()[facet];
      const val = chip.dataset.val;
      stateApi.set({ [facet]: cur.includes(val) ? cur.filter((v) => v !== val) : [...cur, val] });
      return;
    }
    const tog = e.target.closest('[data-toggle=mllm]');
    if (tog) { stateApi.set({ mllm: !stateApi.get().mllm }); return; }
    if (e.target.closest('.rail__clear')) {
      stateApi.set({ q: '', yearMin: null, yearMax: null, venues: [], modals: [], targets: [], mllm: false, role: null, leaf: null });
      search.value = '';
    }
  });

  return {
    sync(state, shown, total) {
      rail.querySelectorAll('[data-mode]').forEach((b) =>
        b.classList.toggle('is-active', b.dataset.mode === state.mode));
      rail.querySelectorAll('[data-methods-only]').forEach((el) =>
        el.toggleAttribute('hidden', state.mode !== 'methods'));
      rail.querySelectorAll('.chip[data-val]').forEach((c) => {
        const facet = c.closest('[data-facet]')?.dataset.facet;
        if (facet) c.classList.toggle('is-on', state[facet].includes(c.dataset.val));
      });
      rail.querySelector('[data-toggle=mllm]')?.classList.toggle('is-on', state.mllm);
      const active = state.q || state.yearMin || state.yearMax || state.venues.length
        || state.modals.length || state.targets.length || state.mllm || state.role || state.leaf;
      rail.querySelector('.rail__clear').hidden = !active;
      rail.querySelector('.rail__status').textContent = `${shown} of ${total} shown`;
      if (search.value !== state.q) search.value = state.q;
    },
  };
}
