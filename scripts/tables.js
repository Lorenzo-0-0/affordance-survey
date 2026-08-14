/* §05 comparison tables — 4 tabs rendered from data/tables.json.
   Sortable (Method / Venue & Year), sticky header, paradigm group rows,
   role-accented ●/○ dots. Cross-links dispatch 'explorer:pin'. */

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const DOT = (v, kind) => `<span class="dot ${v ? `dot--on dot--${kind}` : 'dot--off'}"></span>`;
const BOOL = (v) => (v ? '<span class="tbl-yes">✓</span>' : '<span class="tbl-no">—</span>');
const SUP = (v) => `<span class="sup sup--${String(v).toLowerCase()}">${esc(v)}</span>`;
const KEY = (kind, label) => `<span class="legend-key legend-key--${kind}">${label}</span>`;

const SPECS = {
  perception: {
    label: 'Perception', roleClass: 'role-perception', nameKey: 'method',
    groups: [['', 3], ['Input', 6], ['Output', 4], ['', 2]],
    cols: [
      { k: 'method', l: 'Method', sort: 'alpha' },
      { k: 'venue_raw', l: 'Venue & Year', sort: 'year' },
      { k: 'setting', l: 'Setting' },
      ...['I', 'D', 'V', '3D', 'L', 'HOI'].map((m) => ({ k: `in_${m}`, l: m, dot: 'in' })),
      ...['M', 'H', 'P', 'Mo'].map((m) => ({ k: `out_${m}`, l: m, dot: 'out' })),
      { k: 'supervision', l: 'Supervision', chip: 1 },
      { k: 'open_set', l: 'Open-set', bool: 1 },
    ],
    legend: `${KEY('in', 'Input')} I RGB · D depth · V video · 3D point cloud · L language · HOI human–object interaction &ensp; ${KEY('out', 'Output')} M mask · H heatmap · P keypoint · Mo motion/trajectory`,
  },
  reasoning: {
    label: 'Reasoning', roleClass: 'role-reasoning', nameKey: 'method', grouped: 'paradigm',
    groups: [['', 4], ['Output', 4]],
    cols: [
      { k: 'method', l: 'Method', sort: 'alpha' },
      { k: 'venue_raw', l: 'Venue & Year', sort: 'year' },
      { k: 'setting', l: 'Setting' },
      { k: 'text_form', l: 'Text form' },
      ...['M', 'H', 'P', 'Mo'].map((m) => ({ k: `out_${m}`, l: m, dot: 'out' })),
    ],
    legend: `Text form — how language enters: an action term, an explicit instruction, or implicit intent ("--" = no direct language input) &ensp; ${KEY('out', 'Output')} M mask · H heatmap · P keypoint · Mo motion`,
  },
  action: {
    label: 'Action', roleClass: 'role-action', nameKey: 'method', grouped: 'paradigm',
    groups: [['', 2], ['Input', 4], ['', 2]],
    cols: [
      { k: 'method', l: 'Method', sort: 'alpha' },
      { k: 'venue_raw', l: 'Venue & Year', sort: 'year' },
      ...['I', 'D', '3D', 'L'].map((m) => ({ k: `in_${m}`, l: m, dot: 'in' })),
      { k: 'aff_role', l: 'Affordance role' },
      { k: 'robot', l: 'Robot' },
    ],
    legend: `${KEY('in', 'Input')} I RGB · D depth · 3D point cloud · L language &ensp; Affordance role — Primitive / Retrieval / Planning (hierarchical) · Explicit / Implicit / Reward / Goal (policy learning)`,
  },
  datasets: {
    label: 'Datasets', roleClass: '', nameKey: 'name',
    groups: [['', 6], ['Input', 6], ['Annotation', 4]],
    cols: [
      { k: 'name', l: 'Dataset', sort: 'alpha' },
      { k: 'venue_raw', l: 'Venue & Year', sort: 'year' },
      { k: 'setting', l: 'Setting' },
      { k: 'obj', l: 'Obj.' },
      { k: 'aff', l: 'Aff.' },
      { k: 'num', l: 'Scale' },
      ...['I', 'D', 'V', '3D', 'L', 'HOI'].map((m) => ({ k: `in_${m}`, l: m, dot: 'in' })),
      ...['M', 'H', 'P', 'Mo'].map((m) => ({ k: `ann_${m}`, l: m, dot: 'ann' })),
    ],
    legend: `Obj./Aff. — object and affordance category counts where reported &ensp; ${KEY('in', 'Input')} I RGB · D depth · V video · 3D point cloud · L language · HOI &ensp; ${KEY('ann', 'Annotation')} M mask · H heatmap · P keypoint · Mo motion`,
  },
};

export function initTables(root, data) {
  if (!root || !data) return;
  let active = 'perception';
  const sortState = {}; // tab -> {k, dir}

  const render = () => {
    const spec = SPECS[active];
    const sort = sortState[active];
    let rows = [...data[active].rows];
    if (sort) {
      const dir = sort.dir;
      rows.sort((a, b) => {
        if (sort.type === 'year') {
          return ((a.year || 0) - (b.year || 0) || String(a.venue).localeCompare(String(b.venue))) * dir;
        }
        return String(a[sort.k]).localeCompare(String(b[sort.k])) * dir;
      });
    }

    const tabs = Object.entries(SPECS).map(([key, s]) =>
      `<button class="tables__tab ${s.roleClass} ${key === active ? 'is-active' : ''}" data-tab="${key}">
         ${s.label} (${data[key].rows.length})</button>`).join('');

    const groupHead = spec.groups.length
      ? `<tr>${spec.groups.map(([g, span]) =>
          `<th colspan="${span}" class="td-c th-group th-group--${g.toLowerCase() || 'none'}">${g}</th>`).join('')}</tr>` : '';
    const head = `<tr>${spec.cols.map((c) => {
      const sortable = c.sort ? 'is-sortable' : '';
      const dir = sort && sort.k === c.k ? `<span class="dir">${sort.dir > 0 ? '▲' : '▼'}</span>` : '';
      return `<th class="${sortable} ${c.dot ? 'td-c' : ''}" data-sort="${c.sort || ''}" data-k="${c.k}">${c.l}${dir}</th>`;
    }).join('')}</tr>`;

    let lastGroup = null;
    const body = rows.map((r) => {
      let groupRow = '';
      if (spec.grouped && !sort && r[spec.grouped] !== lastGroup) {
        lastGroup = r[spec.grouped];
        groupRow = `<tr class="group-row"><td colspan="${spec.cols.length}">${esc(lastGroup)}</td></tr>`;
      }
      const tds = spec.cols.map((c) => {
        if (c.dot) return `<td class="td-c">${DOT(r[c.k], c.dot)}</td>`;
        if (c.bool) return `<td class="td-c">${BOOL(r[c.k])}</td>`;
        if (c.chip) return `<td>${SUP(r[c.k])}</td>`;
        if (c.k === spec.nameKey) {
          const inner = r.paper_key
            ? `<a href="#explorer" data-pin="${esc(r.paper_key)}" title="Open in the atlas index">${esc(r[c.k])}</a>`
            : esc(r[c.k]);
          return `<td class="link-cell">${inner}</td>`;
        }
        return `<td>${esc(r[c.k])}</td>`;
      }).join('');
      return groupRow + `<tr>${tds}</tr>`;
    }).join('');

    root.innerHTML = `
      <div class="tables__tabs">${tabs}</div>
      <div class="tables__scroll ${spec.roleClass}">
        <table class="ctable ${spec.roleClass}">
          <thead>${groupHead}${head}</thead>
          <tbody>${body}</tbody>
        </table>
      </div>
      <p class="tables__legend">${spec.legend}</p>`;
    fitCheck();
  };

  // when the table fits, lift the h-scroll container so the header row can
  // stick to the viewport (a scroll container would trap position:sticky)
  const fitCheck = () => {
    const sc = root.querySelector('.tables__scroll');
    if (sc) sc.classList.toggle('tables__scroll--fit', sc.scrollWidth <= sc.clientWidth + 1);
  };
  addEventListener('resize', fitCheck, { passive: true });

  root.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) { active = tab.dataset.tab; render(); return; }
    const th = e.target.closest('th.is-sortable');
    if (th) {
      const prev = sortState[active];
      const k = th.dataset.k;
      if (prev && prev.k === k && prev.dir === -1) delete sortState[active];       // 3rd click resets
      else sortState[active] = { k, type: th.dataset.sort, dir: prev && prev.k === k ? -1 : 1 };
      render(); return;
    }
    const pin = e.target.closest('[data-pin]');
    if (pin) {
      document.dispatchEvent(new CustomEvent('explorer:pin', { detail: { key: pin.dataset.pin } }));
    }
  });

  render();
}
