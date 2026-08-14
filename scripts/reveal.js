/* [data-reveal] scroll reveal + [data-count-to] count-up */
export function initReveal() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const els = document.querySelectorAll('[data-reveal]');
  if (reduced || !('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('is-in'));
  } else {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    els.forEach((el) => io.observe(el));
  }

  const counters = document.querySelectorAll('[data-count-to]');
  if (!counters.length) return;
  const run = (el) => {
    const to = parseFloat(el.dataset.countTo);
    if (reduced) { el.textContent = String(to); return; }
    const t0 = performance.now();
    const dur = 1300;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      el.textContent = String(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const cio = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { run(e.target); cio.unobserve(e.target); }
    }
  }, { threshold: 0.4 });
  counters.forEach((el) => cio.observe(el));
}
