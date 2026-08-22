document.getElementById('year').textContent = new Date().getFullYear();

const header = document.getElementById('site-header');
window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 40);
}, { passive: true });

const cards = document.querySelectorAll('.deck-card');
const cardObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add('in-view');
  });
}, { threshold: 0.35 });
cards.forEach((card) => cardObserver.observe(card));

// Animated ASCII "static" filling the video placeholder until real footage lands.
const asciiEl = document.getElementById('ascii-static');
const ASCII_CHARS = ' .:-=+*#%@';
let asciiCols = 0;
let asciiRows = 0;

function sizeAsciiGrid() {
  const charW = 6;
  const charH = 10;
  asciiCols = Math.ceil(asciiEl.clientWidth / charW);
  asciiRows = Math.ceil(asciiEl.clientHeight / charH);
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
video.addEventListener('loadedmetadata', () => {
  if (video.duration && isFinite(video.duration)) {
    videoReady = true;
    if (signalBox) signalBox.style.display = 'none';
  }
});

function scrubVideo() {
  if (!videoReady) return;

  const rect = deckSection.getBoundingClientRect();
  const total = rect.height - window.innerHeight;
  const scrolled = Math.min(Math.max(-rect.top, 0), total);
  const progress = total > 0 ? scrolled / total : 0;

  video.currentTime = progress * video.duration;
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
