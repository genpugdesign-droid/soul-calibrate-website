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

// Scroll-scrubbed video: maps scroll progress through .deck-section to
// video.currentTime. No-ops until a real <source> is added to #bg-video.
const deckSection = document.getElementById('deck');
const video = document.getElementById('bg-video');
const placeholder = document.getElementById('video-placeholder');

let videoReady = false;
video.addEventListener('loadedmetadata', () => {
  if (video.duration && isFinite(video.duration)) {
    videoReady = true;
    placeholder.style.display = 'none';
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
