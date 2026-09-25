// shop.html only. main.js is built around the home page's hero, deck and demo,
// so the shop takes just the pieces it shares: the footer year, the header's
// scrolled state, the mobile menu, and the ascii static behind each product
// placeholder (the same generator as the deck's, one field per card).

document.getElementById('year').textContent = new Date().getFullYear();

const header = document.getElementById('site-header');
window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 40);
}, { passive: true });

(function navMenu() {
  const toggle = document.getElementById('nav-toggle');
  const nav = document.getElementById('site-nav');
  if (!toggle || !nav) return;

  const setOpen = (open) => {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };
  toggle.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
  nav.addEventListener('click', (e) => { if (e.target.tagName === 'A') setOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
})();

(function productStatic() {
  const fields = [...document.querySelectorAll('.shop-static')];
  if (!fields.length) return;
  const CHARS = ' .:-=+*#%@';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Measure the real advance of the mono face, as the deck does, so the field
  // runs edge to edge.
  const charWidth = (el) => {
    const probe = document.createElement('span');
    const cs = getComputedStyle(el);
    probe.textContent = '0'.repeat(100);
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;top:0;left:0;';
    probe.style.fontFamily = cs.fontFamily;
    probe.style.fontSize = cs.fontSize;
    el.parentNode.appendChild(probe);
    const w = probe.getBoundingClientRect().width / 100;
    probe.remove();
    return w > 0 ? w : 5.4;
  };

  let grid = [];
  const size = () => {
    grid = fields.map((el) => ({
      el,
      cols: Math.ceil(el.clientWidth / charWidth(el)) + 2,
      rows: Math.ceil(el.clientHeight / (parseFloat(getComputedStyle(el).lineHeight) || 10)) + 1
    }));
  };

  const render = () => {
    for (const { el, cols, rows } of grid) {
      let out = '';
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const n = Math.random();
          out += n > 0.985 ? CHARS[CHARS.length - 1] : CHARS[Math.floor(n * (CHARS.length - 2))];
        }
        out += '\n';
      }
      el.textContent = out;
    }
  };

  size();
  render();
  window.addEventListener('resize', () => { size(); render(); }, { passive: true });
  if (!reduced) setInterval(render, 120);
})();
