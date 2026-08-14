/* single-writer state machine; every mutation flows through set() and emits
   'explorer:change' on the root element. */
export function createState(root, initial) {
  const state = {
    mode: 'methods',      // 'methods' | 'datasets'
    role: null,           // 'perception' | 'reasoning' | 'action' | null
    leaf: null,
    q: '',
    yearMin: null,
    yearMax: null,
    venues: [],
    modals: [],
    targets: [],
    mllm: false,
    paper: null,          // expanded paper key
    open: [],             // manually expanded leaf-group slugs (grouped view; not in URL)
    ...initial,
  };
  const listeners = [];
  return {
    get: () => ({ ...state }),
    set(patch, meta = {}) {
      const changed = [];
      for (const [k, v] of Object.entries(patch)) {
        if (JSON.stringify(state[k]) !== JSON.stringify(v)) { state[k] = v; changed.push(k); }
      }
      if (!changed.length && !meta.force) return;
      const detail = { state: { ...state }, changed, meta };
      root.dispatchEvent(new CustomEvent('explorer:change', { detail }));
      listeners.forEach((fn) => fn(detail));
    },
    onChange(fn) { listeners.push(fn); },
  };
}
