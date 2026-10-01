// The demo's three grappling arts, as tabs (the WAI-ARIA tabs pattern):
// click or arrow between them, Home/End for the ends. Judo's footage is the
// only video in the set; it pauses while another art is showing and picks up
// again on return, so nothing decodes off screen.
(function grapplingArts() {
  const tabs = [...document.querySelectorAll('.arts-tab')];
  if (!tabs.length) return;
  const video = document.querySelector('#panel-judo .demo-video');

  const select = (tab, focus) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    }
    if (focus) tab.focus();
    if (video) {
      if (tab.id === 'tab-judo') video.play().catch(() => {});
      else video.pause();
    }
  };

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab, false));
    tab.addEventListener('keydown', (e) => {
      let next = null;
      if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
      if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
      if (e.key === 'Home') next = tabs[0];
      if (e.key === 'End') next = tabs[tabs.length - 1];
      if (next) { e.preventDefault(); select(next, true); }
    });
  });
})();
