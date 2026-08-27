document.getElementById('year').textContent = new Date().getFullYear();

const header = document.getElementById('site-header');
window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 40);
}, { passive: true });

const cards = document.querySelectorAll('.deck-card');

// Cards start at opacity 0 and are revealed by .in-view. A missed observer
// callback therefore leaves a card permanently invisible, so the reveal is
// backed by a direct geometry check on load and on scroll.
function revealVisibleCards() {
  cards.forEach((card) => {
    if (card.classList.contains('in-view')) return;
    const r = card.getBoundingClientRect();
    if (r.top < window.innerHeight * 0.9 && r.bottom > 0) card.classList.add('in-view');
  });
}

const cardObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add('in-view');
  });
}, { threshold: 0.15 });
cards.forEach((card) => cardObserver.observe(card));

revealVisibleCards();
window.addEventListener('load', revealVisibleCards);
window.addEventListener('scroll', revealVisibleCards, { passive: true });

// Animated ASCII "static" filling the video placeholder until real footage lands.
const asciiEl = document.getElementById('ascii-static');
const ASCII_CHARS = ' .:-=+*#%@';
let asciiCols = 0;
let asciiRows = 0;

// The old grid assumed a 6px advance. IBM Plex Mono at 9px is ~5.4px, so the
// column count came up short and the static stopped well before the right edge.
// Measure the real advance instead, then overshoot by two columns so the field
// runs edge to edge (the container clips the remainder).
function measureCharWidth() {
  const probe = document.createElement('span');
  const cs = getComputedStyle(asciiEl);
  probe.textContent = '0'.repeat(100);
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;top:0;left:0;';
  probe.style.fontFamily = cs.fontFamily;
  probe.style.fontSize = cs.fontSize;
  probe.style.letterSpacing = cs.letterSpacing;
  asciiEl.parentNode.appendChild(probe);
  const w = probe.getBoundingClientRect().width / 100;
  probe.remove();
  return w > 0 ? w : 5.4;
}

function sizeAsciiGrid() {
  const charW = measureCharWidth();
  const charH = parseFloat(getComputedStyle(asciiEl).lineHeight) || 10;
  asciiCols = Math.ceil(asciiEl.clientWidth / charW) + 2;
  asciiRows = Math.ceil(asciiEl.clientHeight / charH) + 1;
}

function renderAsciiFrame() {
  let out = '';
  for (let r = 0; r < asciiRows; r++) {
    let row = '';
    for (let c = 0; c < asciiCols; c++) {
      const n = Math.random();
      row += n > 0.985 ? ASCII_CHARS[ASCII_CHARS.length - 1]
        : ASCII_CHARS[Math.floor(n * (ASCII_CHARS.length - 2))];
    }
    out += row + '\n';
  }
  asciiEl.textContent = out;
}

sizeAsciiGrid();
window.addEventListener('resize', sizeAsciiGrid, { passive: true });
setInterval(renderAsciiFrame, 120);

// Scroll-scrubbed video: maps scroll progress through .deck-section to
// video.currentTime. The ascii-static layer stays running behind it — only
// the "NO SIGNAL" text is dismissed once real footage is ready.
const deckSection = document.getElementById('deck');
const video = document.getElementById('bg-video');
const signalBox = document.querySelector('.signal-box');

let videoReady = false;

function markVideoReady() {
  if (videoReady) return;
  if (!video.duration || !isFinite(video.duration)) return;
  videoReady = true;
  if (signalBox) signalBox.style.display = 'none';
  scrubVideo();
}

video.addEventListener('loadedmetadata', markVideoReady);
// Metadata can already be in place by the time this script runs (cached video,
// fast local load), in which case loadedmetadata never fires again.
if (video.readyState >= HTMLMediaElement.HAVE_METADATA) markVideoReady();

function scrubVideo() {
  if (!videoReady) return;

  const rect = deckSection.getBoundingClientRect();
  const total = rect.height - window.innerHeight;
  const scrolled = Math.min(Math.max(-rect.top, 0), total);
  const progress = total > 0 ? scrolled / total : 0;

  // Stop one frame short: seeking to exactly duration can blank the last frame.
  const end = Math.max(video.duration - 1 / 30, 0);
  video.currentTime = progress * end;
}

let ticking = false;
window.addEventListener('scroll', () => {
  if (!ticking) {
    requestAnimationFrame(() => {
      scrubVideo();
      ticking = false;
    });
    ticking = true;
  }
}, { passive: true });

// Mobile browsers will not decode a video that has never played, so a clip
// driven only by currentTime stays blank there — the deck's background was
// missing on phones for exactly this reason. Muted inline playback is allowed
// without a gesture, so the clip is played for one frame and paused again:
// enough to force a decode, after which seeking paints like it does on desktop.
// Some browsers still refuse before any interaction, so the first touch retries.
(function primeVideoForTouch() {
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  let primed = false;
  const kick = () => {
    if (primed) return;
    const playing = video.play();
    if (playing && playing.then) {
      playing.then(() => {
        primed = true;
        video.pause();
        scrubVideo();          // paint the frame the current scroll position wants
      }).catch(() => { /* refused until a gesture; the listener below retries */ });
    }
  };

  kick();
  video.addEventListener('loadedmetadata', kick);
  document.addEventListener('touchstart', kick, { passive: true, once: true });
})();

// The clip never plays on its own at any size: scroll position is the only
// thing that moves it, on mobile as well as desktop.
video.loop = false;
video.addEventListener('loadeddata', () => {
  video.pause();
  scrubVideo();
});

// Collapse the cards column so the footage can run full width.
const deckToggle = document.getElementById('deck-toggle');
if (deckToggle) {
  deckToggle.addEventListener('click', () => {
    const collapsed = deckSection.classList.toggle('expanded');
    deckToggle.setAttribute('aria-expanded', String(!collapsed));
    deckToggle.innerHTML = collapsed ? '[ &laquo; ]' : '[ &raquo; ]';
    deckToggle.title = collapsed ? 'Show panel' : 'Expand video';
  });
}

// ---------- eased page scrolling ----------
// CSS scroll-behavior only smooths anchor jumps; this smooths the wheel itself,
// easing the page toward a target position instead of snapping to each notch.
// Touch devices keep their native momentum, and reduced-motion opts out.
(function smoothScroll() {
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // the handler swallows the wheel event, so bail out entirely if the animation
  // loop it hands off to isn't available - never leave the page unscrollable
  if (!finePointer || reduced || typeof requestAnimationFrame !== 'function') return;

  const EASE = 0.11;
  let target = window.scrollY;
  let current = target;
  let running = false;

  const maxScroll = () =>
    Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

  // scroll-behavior: smooth would animate these writes too and fight the easing
  const jumpTo = (y) => {
    try {
      window.scrollTo({ top: y, behavior: 'instant' });
    } catch (e) {
      const root = document.documentElement;
      const prev = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      window.scrollTo(0, y);
      root.style.scrollBehavior = prev;
    }
  };

  function frame() {
    current += (target - current) * EASE;
    if (Math.abs(target - current) < 0.5) {
      current = target;
      running = false;
    }
    jumpTo(current);
    if (running) requestAnimationFrame(frame);
  }

  window.addEventListener('wheel', (event) => {
    if (event.ctrlKey) return;               // leave pinch-zoom alone
    event.preventDefault();
    const lines = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
    target = Math.min(Math.max(target + event.deltaY * lines, 0), maxScroll());
    if (!running) {
      running = true;
      requestAnimationFrame(frame);
    }
  }, { passive: false });

  // anchors, keyboard and scrollbar drags move the page on their own, so adopt
  // whatever position they land on rather than yanking it back
  window.addEventListener('scroll', () => {
    if (!running) {
      current = window.scrollY;
      target = current;
    }
  }, { passive: true });

  window.addEventListener('resize', () => {
    target = Math.min(target, maxScroll());
  }, { passive: true });
})();

// The demo section embeds the real build (app/index.html) in an iframe, so the
// mockup's HUD and dashboard modules that used to live here are gone. Their
// behaviour now comes from the build's own app.js.

// ---------- hero diamond field ----------
// Restored: an earlier edit of mine trimmed this file at the demo modules and
// took the generator with it, leaving the container and its CSS behind with
// nothing to populate them.
//
// Count, lane, size, drift, opacity and duration are randomised per diamond so
// the field never visibly repeats, and delays are NEGATIVE so the page opens on
// a field already in motion rather than an empty sky filling up.
(function heroDiamonds() {
  const field = document.getElementById('hero-diamonds');
  if (!field) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COUNT = Math.round(Math.min(46, Math.max(18, window.innerWidth / 34)));
  const frag = document.createDocumentFragment();

  for (let i = 0; i < COUNT; i++) {
    const d = document.createElement('span');
    d.className = 'diamond';
    const size = 6 + Math.random() * 16;
    const dur = 34 + Math.random() * 40;
    d.style.setProperty('--x', (Math.random() * 100).toFixed(2) + 'vw');
    d.style.setProperty('--s', size.toFixed(1) + 'px');
    d.style.setProperty('--dx', (Math.random() * 120 - 60).toFixed(0) + 'px');
    d.style.setProperty('--o', (0.08 + Math.random() * 0.22).toFixed(3));
    d.style.setProperty('--dur', dur.toFixed(1) + 's');
    // negative delay: each one starts mid-drift, so the field is already alive
    d.style.setProperty('--delay', (-Math.random() * dur).toFixed(1) + 's');

    if (reduced) {
      // a still constellation rather than nothing at all
      d.style.animation = 'none';
      d.style.top = (Math.random() * 100).toFixed(1) + '%';
      d.style.opacity = (0.06 + Math.random() * 0.14).toFixed(3);
      d.style.transform = 'rotate(45deg)';
    }
    frag.appendChild(d);
  }
  field.appendChild(frag);
})();

// ---------- header menu ----------
// Below the HUD's breakpoint the links fold into a menu; the lockup never does.
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

// ---------- demo embed ----------
// The embed renders at a fixed logical width and is scaled to fit its column.
// Narrowing the iframe instead would trip the HUD's own 860px breakpoint and
// swap in its mobile layout — on this page the demo should get smaller, not
// become a different interface.
(function demoEmbed() {
  const frame = document.getElementById('demo-frame');
  const embed = document.getElementById('demo-embed');
  if (!frame || !embed) return;

  const LOGICAL_W = 1440;
  const LOGICAL_H = 900;

  function fit() {
    const scale = frame.clientWidth / LOGICAL_W;
    embed.style.transform = `scale(${scale})`;
    frame.style.height = Math.round(LOGICAL_H * scale) + 'px';
  }
  fit();
  window.addEventListener('resize', fit, { passive: true });
  if (window.ResizeObserver) new ResizeObserver(fit).observe(frame);
})();

// ---------- throw label follows the cursor ----------
// The label used to name the athletes from a fixed corner. It now tracks the
// pointer across the footage and calls the technique instead.
//
// It eases toward the cursor rather than pinning to it: a label welded to the
// pointer reads as part of the cursor, while a trailing one reads as a thing
// the interface is saying about what is under it.
(function throwLabel() {
  const wrap = document.getElementById('video-bg-wrap');
  const label = document.getElementById('video-cursor');
  const deck = document.getElementById('deck');
  if (!wrap || !label) return;

  // No cursor to follow on a touch screen, so the label is struck at the point
  // of contact instead, with an echo behind it. It fires only outside the
  // cards: inside them a tap is reading, scrolling or collapsing a panel, and
  // a shout over that is noise.
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    if (!deck) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let last = 0;

    deck.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      // anything the operator can actually operate is not a target
      if (e.target.closest('.deck-card, .cards-col, .deck-toggle, a, button')) return;
      const now = Date.now();
      if (now - last < 260) return;          // one shout per tap, not per finger jitter
      last = now;

      const burst = document.createElement('div');
      burst.className = 'uchi-burst' + (reduced ? ' is-still' : '');
      burst.style.left = e.clientX + 'px';
      burst.style.top = e.clientY + 'px';
      const copies = reduced ? 1 : 3;
      for (let i = 0; i < copies; i++) {
        const s = document.createElement('span');
        s.textContent = 'UCHI-MATA!';
        // the echoes trail the strike rather than firing with it
        s.style.animationDelay = (i * 90) + 'ms';
        if (i > 0) s.className = 'echo';
        burst.appendChild(s);
      }
      document.body.appendChild(burst);
      setTimeout(() => burst.remove(), reduced ? 900 : 1200);
    }, { passive: true });
    return;
  }

  const EASE = 0.18;
  let tx = 0, ty = 0, x = 0, y = 0, tracking = false, raf = null;

  function frame() {
    x += (tx - x) * EASE;
    y += (ty - y) * EASE;
    label.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    if (tracking || Math.abs(tx - x) > 0.5 || Math.abs(ty - y) > 0.5) {
      raf = requestAnimationFrame(frame);
    } else {
      raf = null;
    }
  }

  wrap.addEventListener('pointermove', (e) => {
    const r = wrap.getBoundingClientRect();
    // offset off the pointer so the label sits beside it, never under it
    tx = e.clientX - r.left + 16;
    ty = e.clientY - r.top + 14;
    if (!tracking) {
      // land it where the pointer entered instead of flying in from the corner,
      // and paint that position synchronously so it is never briefly at 0,0
      tracking = true;
      x = tx; y = ty;
      label.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
      wrap.classList.add('is-tracking');
    }
    if (!raf) raf = requestAnimationFrame(frame);
  }, { passive: true });

  wrap.addEventListener('pointerleave', () => {
    tracking = false;
    wrap.classList.remove('is-tracking');
  }, { passive: true });
})();

// ---------- touch: key the frames and paint them into a canvas ----------
// Both clips are knocked out with mix-blend-mode: screen — black contributes
// nothing. WebKit ignores that blend in several compositing situations, and
// simply turning the blend off paints the black ground as an opaque rectangle
// (which is exactly the dark box that appeared around both clips).
//
// So on touch the frames are keyed properly instead: each pixel's alpha is set
// from its own brightness, which makes black genuinely transparent rather than
// asking a blend mode to hide it. That is plain pixel data, so nothing depends
// on a compositing path.
// The desktop lockup is knocked out by a CSS filter chain whose order is
// load-bearing (see .hero-mark in style.css):
//
//     invert(1) hue-rotate(180deg) contrast(1.42) brightness(1.22) saturate(1.12)
//
// The canvas path used to run only the invert, and that is exactly why the mark
// came out sepia on phones: invert() flips HUE as well as lightness, so without
// the half-turn back the cool metal lands on the opposite side of the wheel.
// These rebuild the same transform in pixels so the two paths agree.
//
// hue-rotate and saturate are both 3x3 matrices in sRGB, so they multiply into
// ONE matrix built once per renderer rather than per pixel. contrast and
// brightness are scalars and fold straight through it: every row of the
// saturate matrix sums to 1, so it passes contrast's constant term untouched.
//
//     out = A * (M . invert(v)) + B
//     A = brightness * contrast
//     B = brightness * 127.5 * (1 - contrast)
function hueRotateMatrix(deg) {
  const c = Math.cos(deg * Math.PI / 180);
  const s = Math.sin(deg * Math.PI / 180);
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072
  ];
}

function saturateMatrix(k) {
  return [
    0.213 + 0.787 * k, 0.715 - 0.715 * k, 0.072 - 0.072 * k,
    0.213 - 0.213 * k, 0.715 + 0.285 * k, 0.072 - 0.072 * k,
    0.213 - 0.213 * k, 0.715 - 0.715 * k, 0.072 + 0.928 * k
  ];
}

function multiply3(a, b) {
  const out = new Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return out;
}

function keyedCanvas(source, canvas, opts) {
  const settings = Object.assign({
    invert: false, alpha: 1, animate: false, fps: 15, fit: 'contain',
    // The rest of the CSS filter chain, matched per caller. Identity by
    // default, so a caller with no filter to mirror pays one multiply-add per
    // channel and nothing changes.
    hueRotate: 0, contrast: 1, brightness: 1, saturate: 1,
    // Brightness at which a pixel becomes FULLY opaque. 213 is what the old
    // fixed gain of 1.35 worked out to.
    knee: 213
  }, opts);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // The keying loop runs per pixel, so it works on a small buffer and the
  // result is scaled up. The clips are soft; the detail is not missed.
  const FLOOR = 24;   // brightness below this is ground, not mark
  // ...and KNEE is where what survives reaches full opacity. The ramp between
  // the two is what decides whether a clip OCCLUDES what sits under it or lets
  // it show through, which is a separate question from how bright the clip is:
  // clipping ALPHA does not flatten anything, because the RGB is untouched and
  // a fully opaque pixel still renders its own dark tone.
  const KNEE = Math.max(FLOOR + 1, settings.knee);
  const GAIN = 255 / (KNEE - FLOOR);

  // hue-rotate and saturate folded into one matrix; contrast and brightness as
  // the scalars that ride through it.
  const M = multiply3(saturateMatrix(settings.saturate), hueRotateMatrix(settings.hueRotate));
  const A = settings.brightness * settings.contrast;
  const B = settings.brightness * 127.5 * (1 - settings.contrast);

  const work = document.createElement('canvas');
  const wctx = work.getContext('2d', { willReadFrequently: true });
  const WORK_W = 480;

  function key() {
    const vw = source.videoWidth;
    const vh = source.videoHeight;
    if (!vw || !vh || source.readyState < 2) return false;

    const w = Math.min(WORK_W, vw);
    const h = Math.max(1, Math.round(w * vh / vw));
    if (work.width !== w || work.height !== h) { work.width = w; work.height = h; }

    try { wctx.drawImage(source, 0, 0, w, h); } catch (e) { return false; }
    const img = wctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i], g = d[i + 1], b = d[i + 2];
      if (settings.invert) { r = 255 - r; g = 255 - g; b = 255 - b; }

      // the same colour the CSS filter chain produces on desktop
      let nr = A * (M[0] * r + M[1] * g + M[2] * b) + B;
      let ng = A * (M[3] * r + M[4] * g + M[5] * b) + B;
      let nb = A * (M[6] * r + M[7] * g + M[8] * b) + B;
      if (nr < 0) nr = 0; else if (nr > 255) nr = 255;
      if (ng < 0) ng = 0; else if (ng > 255) ng = 255;
      if (nb < 0) nb = 0; else if (nb > 255) nb = 255;

      // brightness becomes opacity: the ground falls away, the mark stays.
      // Measured on the FINAL colour, because that is what `screen` blends
      // against on desktop — and contrast has already crushed the ground toward
      // black by this point, which is what makes the floor hold. The floor
      // matters: an inverted grey ground lands around 18/255, which is not
      // black but is still a visible haze once it covers a whole frame.
      const lum = nr > ng ? (nr > nb ? nr : nb) : (ng > nb ? ng : nb);
      let a = (lum - FLOOR) * GAIN;
      if (a < 0) a = 0; else if (a > 255) a = 255;
      d[i] = nr; d[i + 1] = ng; d[i + 2] = nb;
      d[i + 3] = a;
    }
    wctx.putImageData(img, 0, 0);
    return true;
  }

  function paint() {
    if (!key()) return false;
    const cw = canvas.width;
    const ch = canvas.height;
    if (!cw || !ch) return false;
    ctx.clearRect(0, 0, cw, ch);
    // `cover` fills the panel and crops the overflow; `contain` fits the whole
    // frame inside it — the same choice object-fit was making before the canvas.
    const scale = settings.fit === 'cover'
      ? Math.max(cw / work.width, ch / work.height)
      : Math.min(cw / work.width, ch / work.height);
    const w = work.width * scale;
    const h = work.height * scale;
    ctx.globalAlpha = settings.alpha;
    ctx.drawImage(work, (cw - w) / 2, (ch - h) / 2, w, h);
    return true;
  }

  function resize(width, height) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(width * dpr);
    const h = Math.round(height * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    paint();
  }

  if (settings.animate) {
    // a looping mark does not need 60fps, and a per-pixel loop at 60fps on a
    // phone is a battery decision rather than a visual one
    let last = 0;
    const tick = (now) => {
      if (now - last > 1000 / settings.fps) { last = now; paint(); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // timeupdate is the belt to that braces: it fires from the media clock
    // rather than the frame clock, so the mark still paints wherever rAF is
    // throttled — a backgrounded tab, low power mode, or reduced-motion.
    source.addEventListener('timeupdate', paint);
    source.addEventListener('playing', paint);
  }

  return { paint, resize };
}

// The deck clip: repainted whenever a scrub lands on a new frame.
(function deckBackdrop() {
  // Every device now, not just touch. Under `screen` the ascii field showed
  // through the clip's dark areas, so the throw read as being UNDER the static.
  // Keyed pixels sit on top of it instead, and the ground stays transparent so
  // the field still fills everything around the figures.
  const wrap = document.getElementById('video-bg-wrap');
  const canvas = document.getElementById('bg-canvas');
  const source = document.getElementById('bg-video');
  if (!wrap || !canvas || !source) return;

  // On a phone the clip is a backdrop behind the cards and stays quiet. On
  // desktop it is the thing you are looking at, and `screen` used to ADD light
  // to the ascii beneath it — keying at 0.55 reads far dimmer than that did, so
  // the pointer path keeps it at full strength.
  const isTouch = !window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  // The desktop panel is nearly square while the clip is 16:9, so `contain`
  // left it marooned in the middle at a fraction of the width.
  // The throw is DARK footage — its figures sit at a median value of ~70/255 —
  // so the default 213 knee painted them at about a third alpha and the ascii
  // field read straight through the bodies. That is what kept the clip looking
  // like it was UNDER the static even though its canvas paints above it: the
  // stacking was never the problem, the transparency was. At 90 the figures
  // occlude what is behind them while the ground and the soft halo around them
  // stay keyed out, and the clip keeps its own tonality because only alpha is
  // being clipped here, never colour.
  const renderer = keyedCanvas(source, canvas, {
    alpha: isTouch ? 0.55 : 1,
    fit: isTouch ? 'contain' : 'cover',
    knee: 90
  });
  if (!renderer) return;
  wrap.classList.add('is-canvas');

  const fit = () => {
    const r = wrap.getBoundingClientRect();
    if (r.width && r.height) renderer.resize(r.width, r.height);
  };
  // A canvas only ever shows what it was last told to draw, and `seeked` is a
  // poor clock to drive that from: while the page is scrolling, successive
  // currentTime writes get coalesced into ONE pending seek, so the event fires
  // a handful of times across a whole scroll rather than once per frame. The
  // clip then holds a stale frame instead of running under the scrub.
  //
  // The <video> element this canvas replaced did not have the problem because
  // it repainted itself on every decoded frame. Nothing here regressed when the
  // canvas arrived — the stall was simply unreadable while the key still
  // painted the throw at about a third alpha over a busy ascii field.
  //
  // So the repaint rides the frame clock while the deck is actually moving, and
  // stops once it settles. A paint is well under a millisecond, which is cheap
  // for the length of a scroll and nothing at all when the page is idle.
  const TAIL = 400;   // keep painting this long after the last sign of movement
  let lastMove = 0;
  let pumping = false;

  function pump() {
    if (performance.now() - lastMove > TAIL) { pumping = false; return; }
    renderer.paint();
    requestAnimationFrame(pump);
  }

  function wake() {
    lastMove = performance.now();
    if (!pumping) { pumping = true; requestAnimationFrame(pump); }
  }

  source.addEventListener('seeked', wake);
  window.addEventListener('scroll', wake, { passive: true });
  source.addEventListener('loadeddata', fit);
  source.addEventListener('canplay', fit);
  window.addEventListener('resize', fit, { passive: true });
  fit();

  // A still frame only repaints when something asks it to, so if every trigger
  // fires before these listeners attach — a cached video is ready immediately —
  // the canvas would simply stay empty. Retry until one lands.
  let tries = 0;
  (function settle() {
    if (renderer.paint() || tries++ > 12) return;
    setTimeout(settle, 250);
  })();
})();

// The hero lockup: a looping animation, so it repaints continuously. Its source
// is a dark mark on light grey, the inverse of this page, so it is inverted
// before the key — the same thing the CSS filter does for the desktop path.
(function heroMark() {
  // Touch only. On desktop the CSS filter + blend render the lockup at full
  // resolution and full frame rate; the canvas path is a 480px buffer at 15fps,
  // which is the right trade on a phone that cannot do the blend at all and the
  // wrong one on a machine that can.
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const stack = document.querySelector('.hero-stack');
  const source = document.getElementById('hero-mark');
  const canvas = document.getElementById('hero-mark-canvas');
  if (!stack || !source || !canvas) return;

  // The whole of .hero-mark's filter chain, not just the invert. Running the
  // invert alone is what desaturated the lockup on phones: invert() flips hue
  // as well as lightness, so the blue metal came back around 13deg — orange —
  // instead of the ~252deg the desktop path renders. Keep these in step with
  // the `filter:` line on .hero-mark in style.css; they are the same numbers.
  const renderer = keyedCanvas(source, canvas, {
    invert: true, animate: true, fps: 15,
    hueRotate: 180, contrast: 1.42, brightness: 1.22, saturate: 1.12
  });
  if (!renderer) return;
  stack.classList.add('is-canvas');

  const fit = () => {
    const width = canvas.clientWidth || stack.clientWidth;
    if (width) renderer.resize(width, Math.round(width * 1080 / 2880));
  };
  source.addEventListener('loadeddata', fit);
  window.addEventListener('resize', fit, { passive: true });
  fit();
})();
