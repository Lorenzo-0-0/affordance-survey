/* entry: boots every feature in its own try/catch — one failure never cascades */
import { initReveal } from './reveal.js?v=12';
import { initScrollProgress } from './scroll-progress.js?v=12';
import { initCopyBibtex } from './copy-bibtex.js?v=12';
import { initHeroField } from './hero-field.js?v=12';
import { initTables } from './tables.js?v=12';
import { initExplorer } from './explorer/index.js?v=12';

const V = document.documentElement.dataset.assetV || '1';
const boot = (name, fn) => { try { fn(); } catch (err) { console.error(`[${name}]`, err); } };

boot('reveal', initReveal);
boot('scroll-progress', initScrollProgress);
boot('copy-bibtex', initCopyBibtex);
boot('hero', initHeroField);

/* Lenis smooth scroll (CDN, optional) + anchor handling.
   Init on window load so it measures a settled document height. */
addEventListener('load', () => boot('lenis', () => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || typeof Lenis === 'undefined') return;
  const lenis = new Lenis({
    lerp: 0.08,
    wheelMultiplier: 1.0,
    smoothWheel: true,
    prevent: (node) => !!(node.closest && node.closest('[data-lenis-prevent]')),
  });
  const loop = (t) => { lenis.raf(t); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  window.__lenis = lenis;
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    const href = a.getAttribute('href');
    if (!href || href === '#') return;
    a.addEventListener('click', (e) => {
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: -56, duration: 1.2 });
    });
  });
}));

/* nav scroll state + scroll-spy */
boot('nav', () => {
  const nav = document.querySelector('.nav');
  const hero = document.querySelector('.hero');
  const links = [...document.querySelectorAll('.nav__link')];
  const byId = Object.fromEntries(links.map((l) => [l.getAttribute('href').slice(1), l]));
  // cache the threshold: reading hero.offsetHeight inside the scroll handler
  // forces a synchronous layout every frame while Lenis eases
  let threshold = 280;
  const measure = () => { threshold = (hero?.offsetHeight || 400) - 120; };
  measure();
  addEventListener('load', measure);
  addEventListener('resize', measure, { passive: true });
  addEventListener('scroll', () => {
    nav.classList.toggle('is-scrolled', scrollY > threshold);
  }, { passive: true });
  const spy = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting && byId[e.target.id]) {
        links.forEach((l) => l.classList.remove('is-active'));
        byId[e.target.id].classList.add('is-active');
      }
    }
  }, { rootMargin: '-30% 0px -60% 0px' });
  document.querySelectorAll('section[id]').forEach((s) => spy.observe(s));
});

/* data-driven features */
(async () => {
  let papers, taxonomy, tables;
  try {
    [papers, taxonomy, tables] = await Promise.all([
      fetch(`data/papers.json?v=${V}`).then((r) => r.json()),
      fetch(`data/taxonomy.json?v=${V}`).then((r) => r.json()),
      fetch(`data/tables.json?v=${V}`).then((r) => r.json()),
    ]);
  } catch (err) {
    console.error('[data]', err);
    const app = document.getElementById('explorer-app');
    if (app) app.innerHTML = `<p class="explorer__noscript container">The corpus index could not load. The same corpus lives in
      <a href="https://github.com/hq-King/Awesome-Affordance-Learning">Awesome-Affordance-Learning</a>.</p>`;
    return;
  }
  boot('tables', () => initTables(document.getElementById('tables-app'), tables));
  boot('explorer', () => initExplorer(document.getElementById('explorer-app'), papers, taxonomy));
})();
