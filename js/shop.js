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

// Product galleries: numbered buttons pick a view. A view marked
// data-hover-preview (the video) also shows while the pointer is over the
// gallery, until a number is picked; leaving goes back to the picked view.
// A video plays only while its view is showing; its poster is its first frame.
(function productGalleries() {
  const canHover = window.matchMedia('(hover: hover)').matches;

  document.querySelectorAll('.shop-gallery').forEach((gallery) => {
    const slides = [...gallery.querySelectorAll('.shop-slide')];
    const dots = [...gallery.querySelectorAll('.shop-dots button')];
    const preview = slides.findIndex((s) => s.hasAttribute('data-hover-preview'));
    let picked = 0;
    let hovering = false;

    const render = () => {
      const shown = hovering && preview >= 0 ? preview : picked;
      slides.forEach((s, i) => {
        s.classList.toggle('is-active', i === shown);
        const v = s.querySelector('video');
        if (!v) return;
        if (i === shown) {
          v.play().catch(() => {});
        } else {
          v.pause();
          v.currentTime = 0;
        }
      });
      dots.forEach((d, i) => d.setAttribute('aria-pressed', String(i === picked)));
    };

    dots.forEach((d, i) => d.addEventListener('click', () => {
      picked = i;
      hovering = false;
      render();
    }));
    if (canHover) {
      gallery.addEventListener('pointerenter', () => { hovering = true; render(); });
      gallery.addEventListener('pointerleave', () => { hovering = false; render(); });
    }
  });
})();

// Description / size chart pop-up. Each apparel card's [ see more ] button,
// or its product photo, opens its <dialog> as a modal with its own buy row; it eases in and out, and closes on the
// close button, Escape, or a tap on the dimmed backdrop. Focus returns to
// the button that opened it.
(function detailsModal() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('.shop-details').forEach((box) => {
    const open = box.querySelector('.shop-more-btn');
    const dialog = box.querySelector('.shop-modal');
    if (!open || !dialog || typeof dialog.showModal !== 'function') return;

    const close = () => {
      if (!dialog.open || dialog.classList.contains('is-closing')) return;
      if (reduced) { dialog.close(); return; }
      dialog.classList.add('is-closing');
      const done = () => { dialog.classList.remove('is-closing'); dialog.close(); };
      dialog.addEventListener('animationend', done, { once: true });
      setTimeout(() => { if (dialog.classList.contains('is-closing')) done(); }, 400);
    };

    open.addEventListener('click', () => {
      dialog.showModal();
      dialog.scrollTop = 0;
      document.documentElement.classList.add('shop-modal-open');
    });
    dialog.addEventListener('close', () => {
      document.documentElement.classList.remove('shop-modal-open');
      open.focus({ preventScroll: true });
    });
    dialog.querySelector('.shop-modal-close').addEventListener('click', close);
    dialog.addEventListener('shop:close', close); // after add to cart (js/shop-buy.js)
    // the product photo opens it too (but not the gallery's number buttons)
    const card = box.closest('.shop-card');
    const media = card && card.querySelector('.shop-media');
    if (media) {
      media.classList.add('opens-details');
      media.addEventListener('click', (e) => {
        if (e.target.closest('.shop-dots')) return;
        open.click();
      });
    }
    // Escape: run the eased close instead of the instant one
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    // a click that lands on the dialog itself (not its frame) is the backdrop
    dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
  });
})();
