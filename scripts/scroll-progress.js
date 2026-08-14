/* thin ink progress bar along the top edge.
   Animates with transform: scaleX and caches the scrollable height —
   the per-frame path does zero layout-dirtying work. */
export function initScrollProgress() {
  const bar = document.createElement('div');
  bar.className = 'scroll-bar';
  document.body.appendChild(bar);
  const h = document.documentElement;
  let max = 1;
  const measure = () => { max = Math.max(1, h.scrollHeight - h.clientHeight); };
  let raf = 0;
  const update = () => {
    raf = 0;
    bar.style.transform = `scaleX(${Math.min(1, h.scrollTop / max)})`;
  };
  const req = () => { if (!raf) raf = requestAnimationFrame(update); };
  addEventListener('scroll', req, { passive: true });
  addEventListener('resize', () => { measure(); req(); }, { passive: true });
  addEventListener('load', () => { measure(); req(); });
  // document height also changes without a resize (data-driven sections, accordion)
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => { measure(); req(); }).observe(document.body);
  }
  measure();
  update();
}
