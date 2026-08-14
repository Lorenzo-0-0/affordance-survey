/* hash ⇄ state deep links: #x=m:methods;r:perception;l:hoi-image;q:hotspot;p:key */
const FIELDS = [['m', 'mode'], ['r', 'role'], ['l', 'leaf'], ['q', 'q'], ['p', 'paper']];

export function initUrl(root, stateApi) {
  let applying = false;

  stateApi.onChange(({ state }) => {
    if (applying) return;
    const parts = [];
    for (const [short, k] of FIELDS) {
      const v = state[k];
      if (v && !(k === 'mode' && v === 'methods')) parts.push(`${short}:${encodeURIComponent(v)}`);
    }
    if (parts.length) {
      const hash = `#x=${parts.join(';')}`;
      if (location.hash !== hash) history.replaceState(null, '', hash);
    } else if (location.hash.startsWith('#x=')) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  });

  return {
    pinFromHash() {
      const m = location.hash.match(/^#x=(.+)$/);
      if (!m) return false;
      const patch = {};
      for (const kv of m[1].split(';')) {
        const [short, ...rest] = kv.split(':');
        const field = FIELDS.find(([s]) => s === short);
        if (field) patch[field[1]] = decodeURIComponent(rest.join(':'));
      }
      applying = true;
      stateApi.set(patch, { fromUrl: true, force: true });
      applying = false;
      return true;
    },
  };
}
