/* BibTeX copy button with execCommand fallback */
export function initCopyBibtex() {
  const btn = document.querySelector('[data-copy-bibtex]');
  const pre = document.getElementById('bibtex-source');
  if (!btn || !pre) return;
  btn.addEventListener('click', async () => {
    const text = pre.textContent;
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch { /* noop */ }
      ta.remove();
    }
    if (ok) {
      btn.textContent = 'Copied ✓';
      btn.classList.add('is-copied');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('is-copied'); }, 1800);
    }
  });
}
