/* Hero background: "the corpus, adrift" — thin polylines with joint nodes
   floating in shallow depth. The mesh drifts on its own; under the cursor it
   gathers, densifies, and flows toward the pointer, then relaxes elastically.
   Lineage (all MIT, verified): franky's Particle Network Animation
   (codepen.io/franky/pen/LGMWPK — the cursor joins the mesh as a pinned node),
   LeonKohli's constellation (codepen.io/LeonKohli/pen/poQKLOL — depth layers,
   links that bloom near the pointer), Gradlon's net (codepen.io/Gradlon/pen/
   VXqXOe — power-falloff hairlines, enlarged cursor radius); spring
   relaxation after react-bits Waves. Rewritten against this site's tokens and
   perf contract: canvas2d, zero deps, single rAF, IO + visibility pause,
   reduced-motion static frame, DPR ≤ 2, no layout reads in the frame loop. */
export function initHeroNet() {
  const canvas = document.getElementById('hero-net');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const hero = canvas.closest('.hero') || document.body;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // theme-driven: resolve the palette from tokens.css — never hard-code hex here
  const css = getComputedStyle(document.documentElement);
  const tok = (n, fb) => ((css.getPropertyValue(n) || '').trim() || fb);
  const LINK = tok('--accent', '#3d63c2');       // ambient wires + nodes
  const VOLT = tok('--accent-volt', '#2e5beb');  // cursor-bound flow lines
  const EDGE = tok('--topo-edge', '#b3c1e2');    // receded (deep) wires

  // deterministic layout between loads
  let seed = 20260827;
  const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

  let W = 0, H = 0, absLeft = 0, absTop = 0;
  let nodes = [], R = 150;
  const M = 90;               // drift margin beyond the frame
  const TENSION = 0.01;       // spring back to the home position
  const FRICTION = 0.9;       // per-frame velocity decay (60fps basis)
  const PULL = 0.8;           // cursor attraction strength
  const MAXOFF = 140;         // px a node may be displaced by the cursor

  function size() {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    absLeft = r.left + window.scrollX;
    absTop = r.top + window.scrollY;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R = Math.min(165, Math.max(105, Math.hypot(W, H) * 0.085));
  }

  function build() {
    seed = 20260827;
    nodes = [];
    const count = Math.round(Math.min(132, Math.max(30, (W * H) / 13500)));
    for (let i = 0; i < count; i++) {
      const z = 0.25 + rand() * 0.75;                 // depth: size, alpha, speed
      const speed = (6 + rand() * 14) * (0.5 + z * 0.7);
      const dir = rand() * Math.PI * 2;
      nodes.push({
        hx: rand() * (W + 2 * M) - M,                 // home position (drifts)
        hy: rand() * (H + 2 * M) - M,
        bvx: Math.cos(dir) * speed,
        bvy: Math.sin(dir) * speed,
        ox: 0, oy: 0, ovx: 0, ovy: 0,                 // cursor displacement spring
        z,
        r: 1.0 + z * 1.4,
        ring: rand() < 0.09,                          // a few open joints
        phase: rand() * Math.PI * 2,
      });
    }
  }

  // cursor state — eased so the mesh trails and settles, never snaps
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

  function frame(now) {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    t += dt;
    const s = dt * 60;

    // ease the cursor and its influence in/out
    const ease = 1 - Math.pow(0.002, dt);
    cx += (tx - cx) * ease;
    cy += (ty - cy) * ease;
    ca += ((wantCursor ? 1 : 0) - ca) * (1 - Math.pow(0.02, dt));

    const AR = R * 2.1;          // attraction field
    const RC = R * 1.75;         // cursor link radius (the "super node")

    // -- update ------------------------------------------------------------
    for (const n of nodes) {
      n.hx += n.bvx * dt;
      n.hy += n.bvy * dt;
      if (n.hx < -M || n.hx > W + M) n.bvx = -n.bvx;
      if (n.hy < -M || n.hy > H + M) n.bvy = -n.bvy;

      let fx = 0, fy = 0;
      if (ca > 0.01) {
        const dx = cx - (n.hx + n.ox), dy = cy - (n.hy + n.oy);
        const d = Math.hypot(dx, dy) || 1;
        if (d < AR) {
          let f = 1 - d / AR;
          f = f * f * PULL * ca * (0.4 + 0.6 * n.z);
          fx = (dx / d) * f - (dy / d) * f * 0.35;   // pull + slight swirl
          fy = (dy / d) * f + (dx / d) * f * 0.35;
        }
      }
      n.ovx = (n.ovx + (fx - n.ox * TENSION) * s) * Math.pow(FRICTION, s);
      n.ovy = (n.ovy + (fy - n.oy * TENSION) * s) * Math.pow(FRICTION, s);
      n.ox += n.ovx * s;
      n.oy += n.ovy * s;
      const off = Math.hypot(n.ox, n.oy);
      if (off > MAXOFF) { n.ox *= MAXOFF / off; n.oy *= MAXOFF / off; }
      n.px = n.hx + n.ox;
      n.py = n.hy + n.oy;
    }

    // -- draw --------------------------------------------------------------
    ctx.clearRect(0, 0, W, H);

    // vignette: the field recedes behind the masthead, reads fully at the
    // frame — and the cursor locally lifts it back, like a torch
    const vig = (x, y) => {
      const nx = (x - W * 0.5) / (W * 0.62), ny = (y - H * 0.42) / (H * 0.52);
      const rr = Math.sqrt(nx * nx + ny * ny);
      const u = Math.min(1, Math.max(0, (rr - 0.32) / 0.62));
      let v = 0.38 + 0.62 * (u * u * (3 - 2 * u));
      if (ca > 0.01) {
        const d = Math.hypot(x - cx, y - cy);
        if (d < AR) {
          const lift = ca * Math.pow(1 - d / AR, 2);
          v = Math.min(1, v + (1 - v) * lift * 1.7);
        }
      }
      return v;
    };

    // spatial hash so linking stays O(n·k)
    const cell = R, grid = new Map();
    for (let i = 0; i < nodes.length; i++) {
      const key = ((nodes[i].px / cell) | 0) * 4096 + ((nodes[i].py / cell) | 0);
      const b = grid.get(key);
      if (b) b.push(i); else grid.set(key, [i]);
    }

    // ambient mesh: hairlines with power falloff; blooms near the cursor
    ctx.lineWidth = 0.75;
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
            let alpha = Math.pow(1 - d / R, 1.9) * 0.62
              * (0.35 + 0.65 * a.z) * (0.35 + 0.65 * nb.z)
              * (0.86 + 0.14 * Math.sin(t * 0.6 + a.phase + nb.phase))
              * vig(mx, my);
            if (ca > 0.01) {
              const dm = Math.hypot(mx - cx, my - cy);
              if (dm < AR) alpha *= 1 + 0.9 * ca * Math.pow(1 - dm / AR, 2);
            }
            ctx.strokeStyle = (a.z + nb.z) < 1 ? EDGE : LINK;
            ctx.globalAlpha = Math.min(alpha, 0.8);
            ctx.beginPath();
            ctx.moveTo(a.px, a.py);
            ctx.lineTo(nb.px, nb.py);
            ctx.stroke();
          }
        }
      }
    }

    // cursor as a member of the mesh: lines converge on it and flow inward
    if (ca > 0.02) {
      ctx.strokeStyle = VOLT;
      ctx.lineWidth = 1;
      ctx.setLineDash([2.5, 8]);
      ctx.lineDashOffset = -((t * 34) % 10.5);
      for (const n of nodes) {
        const d = Math.hypot(n.px - cx, n.py - cy);
        if (d > RC || d < 2) continue;
        ctx.globalAlpha = Math.pow(1 - d / RC, 1.5) * ca * (0.45 + 0.55 * n.z)
          * vig((n.px + cx) / 2, (n.py + cy) / 2);
        ctx.beginPath();
        ctx.moveTo(n.px, n.py);
        ctx.lineTo(cx, cy);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // the cursor itself joins the mesh: a small anchor joint
      ctx.fillStyle = VOLT;
      ctx.globalAlpha = 0.7 * ca;
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = VOLT;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.28 * ca;
      ctx.beginPath();
      ctx.arc(cx, cy, 5.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // joints
    for (const n of nodes) {
      const alpha = (0.35 + 0.5 * n.z) * vig(n.px, n.py);
      if (n.ring) {
        ctx.strokeStyle = LINK;
        ctx.lineWidth = 1;
        ctx.globalAlpha = alpha * 0.9;
        ctx.beginPath();
        ctx.arc(n.px, n.py, n.r + 1.4, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = n.z < 0.45 ? EDGE : LINK;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(n.px, n.py, n.r, 0, Math.PI * 2);
        ctx.fill();
        if (n.z > 0.92) {                        // faint halo on the nearest few
          ctx.globalAlpha = 0.07;
          ctx.beginPath();
          ctx.arc(n.px, n.py, n.r * 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;

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
