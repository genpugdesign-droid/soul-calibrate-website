(() => {
  const updated = document.getElementById('annotation-progress-updated');
  if (!updated) return;
  const refresh = () => fetch(`data/annotation_progress.json?fresh=${Date.now()}`, { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((card) => {
      if (card.schema !== 'magi_public_annotation_progress_v1' || !card.counts) {
        throw new Error('unsupported progress feed');
      }
      for (const node of document.querySelectorAll('[data-progress]')) {
        const value = card.counts[node.dataset.progress];
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
          throw new Error(`invalid count: ${node.dataset.progress}`);
        }
        node.textContent = value.toLocaleString('en-US', {
          maximumFractionDigits: Number.isInteger(value) ? 0 : 2
        });
      }
      const date = new Date(card.as_of_utc);
      updated.textContent = Number.isNaN(date.getTime())
        ? 'Source date unavailable.'
        : `Updated ${date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}.`;
    })
    .catch(() => {
      updated.textContent = 'Latest counts are temporarily unavailable.';
    });
  refresh();
  setInterval(refresh, 60_000);
})();
