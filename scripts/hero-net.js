/* Hero background: "the corpus, adrift" — a dense 3D wire nebula of thin
   polylines and joint nodes in true perspective. The field drifts slowly,
   tilts with the pointer (parallax), and near the cursor the mesh brightens
   and reaches for it (grab), with a gentle elastic gather.
   Visual recipe reverse-engineered from data.snu.ac.kr's masthead
   (particles.js by Vincent Garreau, MIT — measured live config: 240 points
   @1.6Mpx, link radius 200, link alpha 0.30 linear falloff, size/opacity
   jitter, grab 312/0.6), rebuilt here in true 3D: nodes live in a shallow
   z-slab, perspective projection supplies the size/alpha depth jitter
   physically, and the camera leans toward the cursor. Palette is drawn from
   tokens.css — a morning-mist periwinkle base with sparse celadon/coral
   pinpricks echoing the survey's three roles. Perf contract: canvas2d, zero
   deps, single rAF, spatial hash, IO + visibility pause, reduced-motion
   static frame, DPR ≤ 2, no layout reads in the frame loop. */
export function initHeroNet() {
  const canvas = document.getElementById('hero-net');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const hero = canvas.closest('.hero') || document.body;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // theme-driven: resolve the palette from tokens.css — never hard-code hex here
  const css = getComputedStyle(document.documentElement);
  const tok = (n, fb) => ((css.getPropertyValue(n) || '').trim() || fb);
  const hex = (s, fb) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(s.trim());
    const v = parseInt((m ? m[1] : fb), 16);
    return [v >> 16 & 255, v >> 8 & 255, v & 255];
  };
  const MIST = hex(tok('--topo-edge', '#b3c1e2'), 'b3c1e2');       // wire + far nodes
  const PERI = hex(tok('--moss-fill', '#6a93e8'), '6a93e8');       // near nodes
  const DEEP = hex(tok('--accent', '#3d63c2'), '3d63c2');          // grab lines, accents
  const CELA = hex(tok('--ochre-fill', '#66bfa3'), '66bfa3');      // role Ⅱ pinpricks
  const CORA = hex(tok('--terra-fill', '#f0836f'), 'f0836f');      // role Ⅲ pinpricks
  const SPARK = hex(tok('--accent-spark', '#6fc2ff'), '6fc2ff');   // sky tint, upper-left

  // deterministic layout between loads
  let seed = 20260827;
  const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

  let W = 0, H = 0, absLeft = 0, absTop = 0;
  let nodes = [], R = 200;
  const FOV = 900;            // perspective strength
  const DEPTH = 190;          // half-depth of the z-slab in world px
  const TILT = 34;            // px of camera lean at full cursor offset
  const M = 110;              // drift margin beyond the frame
  const TENSION = 0.012;      // spring back to the home position
  const FRICTION = 0.9;       // per-frame velocity decay (60fps basis)
  const PULL = 0.32;          // cursor gather — present, restrained
  const MAXOFF = 64;          // px a node may be displaced by the cursor
  const GRAB = 312;           // cursor link reach (screen px)

  function size() {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    absLeft = r.left + window.scrollX;
    absTop = r.top + window.scrollY;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R = Math.min(205, Math.max(125, W * 0.13));
  }

  function build() {
    seed = 20260827;
    nodes = [];
    // SNU density: 240 points on a 1.6Mpx canvas ≈ area/6700
    const count = Math.round(Math.min(330, Math.max(70, (W * H) / 5200)));
    const mix = (a, b, k) => [
      Math.round(a[0] + (b[0] - a[0]) * k),
      Math.round(a[1] + (b[1] - a[1]) * k),
      Math.round(a[2] + (b[2] - a[2]) * k),
    ];
    for (let i = 0; i < count; i++) {
      const z = rand() * 2 - 1;                       // depth slab [-1, 1]
      const roll = rand();
      // ~90% mist blues; sparse role pinpricks (Ⅱ celadon, Ⅲ coral)
      const tint = roll < 0.9 ? null : (roll < 0.958 ? CELA : CORA);
      const hx = rand() * (W + 2 * M) - M;
      const hy = rand() * (H + 2 * M) - M;
      // blueprint graphite: a mid-deep cornflower-mist wire tone whose HUE
      // (not lightness) drifts with the aurora — cobalt upper-left, a breath
      // of celadon lower-right; crisp at low alpha, never milky
      const wbase = mix(DEEP, MIST, 0.42);
      const kx = Math.max(0, Math.min(0.5, 0.5 - hx / W));
      const ky = Math.max(0, Math.min(0.5, (hx / W + hy / H) / 2 - 0.5));
      const col = tint || mix(mix(wbase, DEEP, kx * 0.5), CELA, ky * 0.4);
      const speed = 14 + rand() * 26;                 // SNU-brisk drift
      const dir = rand() * Math.PI * 2;
      nodes.push({
        hx, hy, z,
        bvx: Math.cos(dir) * speed,
        bvy: Math.sin(dir) * speed,
        bvz: (rand() - 0.5) * 0.16,
        ox: 0, oy: 0, ovx: 0, ovy: 0,                 // cursor displacement spring
        r: (0.7 + rand() * 1.5) * (tint ? 1.2 : 1),
        tint,
        col,
        jitter: 0.45 + rand() * 0.55,                 // per-node opacity jitter
      });
    }
  }

  // cursor state — eased so the field leans and settles, never snaps
  let tx = 0, ty = 0, cx = -9999, cy = -9999, ca = 0, wantCursor = false;

  hero.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    tx = e.clientX + window.scrollX - absLeft;
    ty = e.clientY + window.scrollY - absTop;
    if (!wantCursor) { cx = tx; cy = ty; }
    wantCursor = true;
  }, { passive: true });
  hero.addEventListener('pointerleave', () => { wantCursor = false; }, { passive: true });

  size();
  build();

  let t = 0, last = performance.now(), running = false, raf = 0;
  let camX = 0, camY = 0;     // eased parallax lean

  function frame(now) {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    t += dt;
    const s = dt * 60;

    const ease = 1 - Math.pow(0.002, dt);
    cx += (tx - cx) * ease;
    cy += (ty - cy) * ease;
    ca += ((wantCursor ? 1 : 0) - ca) * (1 - Math.pow(0.02, dt));

    // camera leans toward the cursor — the slab tilts in parallax;
    // a slow autonomous sway keeps the depth legible even at rest
    const lean = 1 - Math.pow(0.01, dt);
    const swayX = Math.sin(t * 0.11) * 0.14, swayY = Math.cos(t * 0.083) * 0.1;
    camX += ((wantCursor ? (cx / W - 0.5) * 2 : swayX) - camX) * lean;
    camY += ((wantCursor ? (cy / H - 0.5) * 2 : swayY) - camY) * lean;

    const AR = R * 1.5;       // gather field

    // -- update + project -------------------------------------------------
    for (const n of nodes) {
      n.hx += n.bvx * dt;
      n.hy += n.bvy * dt;
      n.z += n.bvz * dt;
      if (n.hx < -M || n.hx > W + M) n.bvx = -n.bvx;
      if (n.hy < -M || n.hy > H + M) n.bvy = -n.bvy;
      if (n.z < -1 || n.z > 1) n.bvz = -n.bvz;

      let fx = 0, fy = 0;
      if (ca > 0.01) {
        const dx = cx - (n.hx + n.ox), dy = cy - (n.hy + n.oy);
        const d = Math.hypot(dx, dy) || 1;
        if (d < AR) {
          let f = 1 - d / AR;
          f = f * f * PULL * ca;
          fx = (dx / d) * f - (dy / d) * f * 0.15;
          fy = (dy / d) * f + (dx / d) * f * 0.15;
        }
      }
      n.ovx = (n.ovx + (fx - n.ox * TENSION) * s) * Math.pow(FRICTION, s);
      n.ovy = (n.ovy + (fy - n.oy * TENSION) * s) * Math.pow(FRICTION, s);
      n.ox += n.ovx * s;
      n.oy += n.ovy * s;
      const off = Math.hypot(n.ox, n.oy);
      if (off > MAXOFF) { n.ox *= MAXOFF / off; n.oy *= MAXOFF / off; }

      // perspective: near (z<0) grows, far (z>0) recedes; camera lean shifts
      // layers at different rates — genuine parallax
      const sc = FOV / (FOV + n.z * DEPTH);
      n.sc = sc;
      n.px = W / 2 + (n.hx + n.ox - W / 2) * sc - camX * TILT * n.z;
      n.py = H / 2 + (n.hy + n.oy - H / 2) * sc - camY * TILT * n.z;
    }

    // -- draw --------------------------------------------------------------
    ctx.clearRect(0, 0, W, H);

    // soft vignette: barely recedes behind the masthead; cursor lifts it
    const vig = (x, y) => {
      const nx = (x - W * 0.5) / (W * 0.62), ny = (y - H * 0.42) / (H * 0.52);
      const rr = Math.sqrt(nx * nx + ny * ny);
      const u = Math.min(1, Math.max(0, (rr - 0.3) / 0.62));
      let v = 0.8 + 0.2 * (u * u * (3 - 2 * u));
      if (ca > 0.01) {
        const d = Math.hypot(x - cx, y - cy);
        if (d < AR) v = Math.min(1, v + (1 - v) * ca * Math.pow(1 - d / AR, 2) * 1.6);
      }
      return v;
    };

    // spatial hash on projected positions
    const cell = R, grid = new Map();
    for (let i = 0; i < nodes.length; i++) {
      const key = ((nodes[i].px / cell) | 0) * 4096 + ((nodes[i].py / cell) | 0);
      const b = grid.get(key);
      if (b) b.push(i); else grid.set(key, [i]);
    }

    // wire mesh: SNU's linear falloff, graphite-crisp at a lower ceiling
    ctx.lineWidth = 0.7;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      const gx = (a.px / cell) | 0, gy = (a.py / cell) | 0;
      for (let ox = 0; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          if (ox === 0 && oy < 0) continue;
          const b = grid.get((gx + ox) * 4096 + (gy + oy));
          if (!b) continue;
          for (const j of b) {
            if (j <= i && ox === 0 && oy === 0) continue;
            const nb = nodes[j];
            const dx = a.px - nb.px, dy = a.py - nb.py;
            if (Math.abs(dx) > R || Math.abs(dy) > R) continue;
            const d = Math.hypot(dx, dy);
            if (d > R) continue;
            const mx = (a.px + nb.px) / 2, my = (a.py + nb.py) / 2;
            const depthMul = (a.sc + nb.sc) / 2;      // near lines read fuller
            let alpha = (1 - d / R) * 0.27
              * (0.74 + 0.26 * (depthMul - 0.68) / 0.64)
              * vig(mx, my);
            if (ca > 0.01) {
              const dm = Math.hypot(mx - cx, my - cy);
              if (dm < AR) alpha *= 1 + 0.8 * ca * Math.pow(1 - dm / AR, 2);
            }
            const ta = a.col, tb = nb.col;
            ctx.strokeStyle = `rgba(${(ta[0] + tb[0]) >> 1},${(ta[1] + tb[1]) >> 1},${(ta[2] + tb[2]) >> 1},${Math.min(alpha, 0.5).toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(a.px, a.py);
            ctx.lineTo(nb.px, nb.py);
            ctx.stroke();
          }
        }
      }
    }

    // grab: the cursor reaches into the mesh — solid hairlines, SNU 312/0.6
    if (ca > 0.02) {
      ctx.lineWidth = 0.8;
      for (const n of nodes) {
        const d = Math.hypot(n.px - cx, n.py - cy);
        if (d > GRAB || d < 2) continue;
        const alpha = (1 - d / GRAB) * 0.6 * ca * (0.6 + 0.4 * n.sc);
        ctx.strokeStyle = `rgba(${DEEP[0]},${DEEP[1]},${DEEP[2]},${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(n.px, n.py);
        ctx.lineTo(cx, cy);
        ctx.stroke();
      }
      // a quiet anchor where the mesh meets the pointer
      ctx.fillStyle = `rgba(${DEEP[0]},${DEEP[1]},${DEEP[2]},${(0.55 * ca).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(cx, cy, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // joints: near = periwinkle and larger, far = mist and finer;
    // sparse celadon/coral pinpricks mark the three roles
    for (const n of nodes) {
      const depthT = Math.min(1, Math.max(0, (n.sc - 0.68) / 0.64));
      const warm = depthT * 0.65;                     // near joints lean periwinkle
      const base = n.tint || [
        Math.round(n.col[0] + (PERI[0] - n.col[0]) * warm),
        Math.round(n.col[1] + (PERI[1] - n.col[1]) * warm),
        Math.round(n.col[2] + (PERI[2] - n.col[2]) * warm),
      ];
      const alpha = (0.4 + 0.32 * depthT) * n.jitter * vig(n.px, n.py);
      ctx.fillStyle = `rgba(${base[0]},${base[1]},${base[2]},${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(n.px, n.py, n.r * n.sc, 0, Math.PI * 2);
      ctx.fill();
    }

    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  if (reduced) {
    // a single settled frame — the composition without the motion
    running = true;
    frame(performance.now());
    running = false;
    return;
  }

  let visible = true;
  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible && !document.hidden) start(); else stop();
  }).observe(canvas);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && visible) start(); else stop();
  });

  let resizeT = 0;
  new ResizeObserver(() => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { size(); build(); }, 150);
  }).observe(canvas);

  start();
}
