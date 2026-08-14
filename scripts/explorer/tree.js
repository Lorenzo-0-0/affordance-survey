/* the atlas index tree: role → family → leaf, live counts, single-select filter */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function initTree(el, idx, taxonomy, stateApi, countFn) {
  const render = (state) => {
    if (state.mode === 'datasets') { el.hidden = true; return; }
    el.hidden = false;
    const counts = countFn(); // Map leaf -> n (respecting all filters except tree selection)
    const maxN = Math.max(1, ...counts.values()); // shared scale for the per-leaf count bars
    el.innerHTML = taxonomy.roles.map((r) => {
      const roleN = r.families.reduce((n, f) => n + f.leaves.reduce((m, l) => m + (counts.get(l.slug) || 0), 0), 0);
      const roleOn = state.role === r.slug && !state.leaf;
      return `
      <section class="tree__role role-${r.slug}">
        <button class="tree__rolehead ${roleOn ? 'is-on' : ''}" data-role="${r.slug}" ${state.role === r.slug ? 'aria-expanded="true"' : ''}>
          <span class="tree__numeral">${r.numeral}</span>
          <span class="tree__rolename">${esc(r.label)}</span>
          <span class="tree__count">${roleN}</span>
        </button>
        <p class="tree__question">${esc(r.question)}</p>
        ${r.families.map((f) => `
          <div class="tree__family">
            <span class="tree__familyname">${esc(f.label)}</span>
            <ul class="tree__leaves">
              ${f.leaves.map((l) => `
                <li><button class="tree__leaf ${state.leaf === l.slug ? 'is-on' : ''}" data-role="${r.slug}" data-leaf="${l.slug}" title="${esc(l.blurb)}" style="--bar:${((counts.get(l.slug) || 0) / maxN).toFixed(3)}">
                  ${esc(l.label)}<span class="tree__count">${counts.get(l.slug) || 0}</span>
                </button></li>`).join('')}
            </ul>
          </div>`).join('')}
      </section>`;
    }).join('');
  };

  el.addEventListener('click', (e) => {
    const leaf = e.target.closest('[data-leaf]');
    if (leaf) {
      const s = stateApi.get();
      const same = s.leaf === leaf.dataset.leaf;
      stateApi.set({ role: same ? null : leaf.dataset.role, leaf: same ? null : leaf.dataset.leaf, paper: null });
      return;
    }
    const role = e.target.closest('[data-role]');
    if (role) {
      const s = stateApi.get();
      const same = s.role === role.dataset.role && !s.leaf;
      stateApi.set({ role: same ? null : role.dataset.role, leaf: null, paper: null });
    }
  });

  return { render };
}
