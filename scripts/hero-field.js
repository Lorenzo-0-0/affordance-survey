/* hero object field — cursor proximity "develops" each object's affordance
   (glow + contour rings + verb label), like an exposure coming up on paper.

   Perf contract (deliberate — see the scroll-jank postmortem):
   · pointermove is passive and only records clientX/Y; ALL geometry work
     happens inside one rAF loop.
   · screen→viewBox matrix is cached; resize/scroll just set a dirty flag.
   · spot centers are computed once at bind time (transforms are static).
   · writes are opacity-only, no SVG filters anywhere, and the loop
     early-outs DOM writes once every spot has settled.
   · IntersectionObserver parks the loop when the hero is offscreen. */

const R_IN = 70;        // fully developed inside this radius (viewBox units)
const R_OUT = 280;      // development begins here
const LERP = 0.16;
const EPS = 0.002;
const IDLE_AFTER = 4000; // ms without pointer before the idle cycle starts
const CYCLE_MS = 3000;   // idle: one object develops per cycle
const TAP_MS = 2600;     // touch: how long a tapped spot stays developed

const smooth = (t) => t * t * (3 - 2 * t);

function bindSvg(svg) {
  const spots = [...svg.querySelectorAll('.fobj__glow')].map((glow) => {
    const action = glow.dataset.action;
    const obj = glow.closest('.fobj');
    const pick = (sel) => obj.querySelector(`${sel}[data-action="${action}"]`);
    // one-time: glow center in root viewBox coords (group transforms are static)
    const m = glow.getCTM();
    const cx = glow.cx.baseVal.value;
    const cy = glow.cy.baseVal.value;
    return {
      action,
      glow,
      rings: pick('.fobj__rings'),
      label: pick('.fobj__label'),
      x: m ? m.a * cx + m.c * cy + m.e : cx,
      y: m ? m.b * cx + m.d * cy + m.f : cy,
      cur: 0,
      seeded: false,
    };
  });
  return { svg, spots };
}

function paint(s) {
  s.glow.setAttribute('opacity', (s.cur * 0.85).toFixed(3));
  if (s.rings) s.rings.setAttribute('opacity', (s.cur * 0.55).toFixed(3));
  if (s.label) s.label.setAttribute('opacity', s.cur <= 0.3 ? '0' : ((s.cur - 0.3) / 0.7).toFixed(3));
}

function developAll(svg) {
  svg.querySelectorAll('.fobj__glow').forEach((el) => el.setAttribute('opacity', '0.5'));
  svg.querySelectorAll('.fobj__rings').forEach((el) => el.setAttribute('opacity', '0.4'));
  svg.querySelectorAll('.fobj__label').forEach((el) => el.setAttribute('opacity', '1'));
}

export function initHeroField() {
  const hero = document.querySelector('.hero');
  const field = hero && hero.querySelector('.hero__field');
  if (!hero || !field) return;

  const svgs = [...field.querySelectorAll('svg.field')];
  if (!svgs.length) return;

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    svgs.forEach(developAll); // static developed plate
    return;
  }

  const activeSvg = () => svgs.find((s) => s.getClientRects().length) || svgs[0];
  let bound = bindSvg(activeSvg());

  const mq = matchMedia('(max-width: 1020px)');
  mq.addEventListener('change', () => {
    bound.spots.forEach((s) => { s.cur = 0; paint(s); });
    bound = bindSvg(activeSvg());
    dirty = true;
  });

  /* -- input: record only, compute in rAF -- */
  let px = 0, py = 0, hasPointer = false;
  let lastMove = performance.now();
  let tapAction = null, tapUntil = 0;

  hero.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    px = e.clientX; py = e.clientY;
    hasPointer = true;
    lastMove = performance.now();
  }, { passive: true });
  hero.addEventListener('pointerleave', () => {
    hasPointer = false;
    lastMove = performance.now();
  }, { passive: true });
  field.addEventListener('pointerdown', (e) => {
    const hit = e.target.closest && e.target.closest('.fobj__hit');
    if (!hit) return;
    tapAction = hit.dataset.action;
    tapUntil = performance.now() + TAP_MS;
  }, { passive: true });

  /* -- cached geometry -- */
  let inv = null, dirty = true;
  addEventListener('resize', () => { dirty = true; }, { passive: true });
  addEventListener('scroll', () => { dirty = true; }, { passive: true });

  /* -- the one loop -- */
  let running = false, rafId = 0;
  const t0 = performance.now();

  const frame = (now) => {
    rafId = 0;
    if (!running) return;

    if (dirty) {
      const m = bound.svg.getScreenCTM();
      inv = m && m.inverse();
      dirty = false;
    }

    const tapLive = tapAction && now < tapUntil;
    const idleLive = !hasPointer && now - lastMove > IDLE_AFTER;
    let vx = 0, vy = 0;
    if (hasPointer && inv) {
      vx = inv.a * px + inv.c * py + inv.e;
      vy = inv.b * px + inv.d * py + inv.f;
    }
    const idleIdx = Math.floor((now - t0) / CYCLE_MS) % bound.spots.length;
    const idlePulse = Math.sin(Math.PI * (((now - t0) % CYCLE_MS) / CYCLE_MS));

    for (const s of bound.spots) {
      let target = 0;
      if (tapLive) {
        target = s.action === tapAction ? 1 : 0;
      } else if (hasPointer && inv) {
        const d = Math.hypot(vx - s.x, vy - s.y);
        target = d <= R_IN ? 1 : d >= R_OUT ? 0 : smooth(1 - (d - R_IN) / (R_OUT - R_IN));
      } else if (idleLive && s === bound.spots[idleIdx]) {
        target = idlePulse;
      }
      if (!s.seeded || Math.abs(target - s.cur) > EPS) {
        s.seeded = true;
        s.cur += (target - s.cur) * LERP;
        if (Math.abs(target - s.cur) < EPS) s.cur = target;
        paint(s);
      }
    }
    rafId = requestAnimationFrame(frame);
  };

  new IntersectionObserver((entries) => {
    const vis = entries[0].isIntersecting;
    if (vis && !running) {
      running = true;
      dirty = true;
      if (!rafId) rafId = requestAnimationFrame(frame);
    } else if (!vis) {
      running = false;
    }
  }, { threshold: 0.02 }).observe(field);
}
