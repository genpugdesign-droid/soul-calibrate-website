// Header variant: the bar takes the tone of the section scrolling under it.
// Each section names its tone in data-header-tone (see css/header-pill.css);
// the one whose box contains the bar's vertical middle wins, and the last
// match wins when regions nest. On the home page the link for the section
// under the bar is marked too.
(function headerTone() {
  const header = document.getElementById('site-header');
  const regions = [...document.querySelectorAll('[data-header-tone]')];
  if (!header || !regions.length) return;
  const links = [...header.querySelectorAll('.site-nav a[href^="#"]')];

  let ticking = false;
  const update = () => {
    ticking = false;
    const hb = header.getBoundingClientRect();
    const y = hb.top + hb.height / 2;
    let hit = null;
    for (const el of regions) {
      const r = el.getBoundingClientRect();
      if (r.top <= y && r.bottom > y) hit = el;
    }
    const tone = hit ? hit.dataset.headerTone : '';
    if (header.dataset.tone !== tone) header.dataset.tone = tone;

    // the nav link whose section is under the bar
    let here = null;
    for (const a of links) {
      const t = document.getElementById(a.getAttribute('href').slice(1));
      if (!t) continue;
      const r = t.getBoundingClientRect();
      if (r.top <= y + hb.height && r.bottom > y + hb.height) here = a;
    }
    // the last section can be too short to ever reach the bar; at the foot of
    // the page it is the one being read
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
      here = links.filter((l) => document.getElementById(l.getAttribute('href').slice(1))).pop() || here;
    }
    for (const a of links) a.classList.toggle('is-here', a === here);
  };
  const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };

  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request, { passive: true });
  update();
})();

// The merch callout: × puts it away for the rest of the visit.
(function merchCallout() {
  const cta = document.getElementById('merch-cta');
  const close = document.getElementById('merch-cta-close');
  if (!cta || !close) return;
  const KEY = 'magi-merch-cta-dismissed';
  try { if (sessionStorage.getItem(KEY)) cta.hidden = true; } catch (e) { /* storage blocked: show it */ }
  close.addEventListener('click', () => {
    cta.hidden = true;
    try { sessionStorage.setItem(KEY, '1'); } catch (e) { /* fine: hidden for this page view */ }
  });
})();
