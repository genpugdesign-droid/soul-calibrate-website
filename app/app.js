/* ── magi v12 — application shell ──────────────────────────────────────────────
   Two views over ONE engine. hud.js runs the loop; this file switches views,
   drives the record/review journey, and reports what the engine actually
   produced. Every number on the dashboard is sampled from window.MAGI while
   the loop runs — throws are ATTACK commits, the score is the real weighted
   formula, frames and uke-bound come off the same counters the HUD shows.
   Nothing here is authored data. */
(function app() {
  const M = window.MAGI;
  if (!M) return;
  const $ = (id) => document.getElementById(id);

  const views = { dash: $('viewDash'), sys: $('viewport') };
  // v12: the rail lives inside each view's grid, so there are two copies of
  // it. Every rail control is addressed as a set rather than a single id.
  const all = (sel) => Array.from(document.querySelectorAll(sel));
  const tabs = { dash: all('.tab-dash'), sys: all('.tab-sys') };
  const recBadges = all('.rec-overlay');   // v15: recording reads on the feed
  const stopBtns = all('.btn-stop');
  const feedVideo = $('feed');           // the system's live feed
  const reviewVideo = $('reviewVideo');  // same footage, for review
  const panels = ['pSessions', 'pTotals', 'pStatus', 'pRoster', 'pPeaks', 'pThrow'].map($);

  const scoreOf = (sig) =>
    Object.entries(M.WEIGHTS).reduce((s, [k, w]) => s + (sig[k] || 0) * w, 0);
  const pct = (n) => Math.round(n * 100) + '%';
  const clock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  let sessions = [];
  let cur = null;
  let lastCommitted = M.smoother.committed;
  let selected = 0;
  let activeSession = null;   // null = every session

  /* ── views ─────────────────────────────────────────────────────────────── */
  function showView(which) {
    const dash = which === 'dash';
    views.dash.classList.toggle('is-inactive', !dash);
    views.sys.classList.toggle('is-inactive', dash);
    tabs.dash.forEach((t) => {
      t.classList.toggle('is-active', dash);
      t.setAttribute('aria-selected', String(dash));
    });
    tabs.sys.forEach((t) => {
      t.classList.toggle('is-active', !dash);
      t.setAttribute('aria-selected', String(!dash));
    });
  }
  tabs.dash.forEach((t) => t.addEventListener('click', () => showView('dash')));
  tabs.sys.forEach((t) => t.addEventListener('click', () => showView('sys')));

  /* ── capture ───────────────────────────────────────────────────────────── */
  function startSession() {
    $('feedCta').hidden = true;
    cur = {
      t0: performance.now(),
      throws: [],
      peaks: {},
      trans0: M.smoother.transitions,
      frames0: M.state.frames
    };
    lastCommitted = M.smoother.committed;
    M.setRecording(true);
    recBadges.forEach((b) => { b.hidden = false; });
    stopBtns.forEach((b) => { b.hidden = false; });
    $('dState').textContent = 'AGGREGATING';
    $('dReview').textContent = 'capturing';
    $('dashEmpty').hidden = true;
    $('dashLoad').hidden = false;
    $('loadSub').textContent = 'capturing \u00b7 0 throws';
    panels.forEach((p) => p.classList.add('is-loading'));
    showView('sys');
    sample();
  }

  // One sample per frame, reading the live engine.
  function sample() {
    if (!M.recording || !cur) return;
    const sig = M.state.sig;
    for (const k of Object.keys(sig)) {
      cur.peaks[k] = Math.max(cur.peaks[k] || 0, sig[k]);
    }
    // A throw is a committed ATTACK edge — the same condition that opens the
    // THROW panel in the system view.
    const c = M.smoother.committed;
    if (c === 'ATTACK' && lastCommitted !== 'ATTACK') {
      cur.throws.push({
        t: (performance.now() - cur.t0) / 1000,
        // the feed's own position at the instant of the commit: review seeks to
        // this frame rather than guessing from session time
        feedTime: feedVideo && isFinite(feedVideo.currentTime) ? feedVideo.currentTime : 0,
        score: scoreOf(sig),
        sig: { ...sig },
        uke: M.ukeBoundPct()
      });
      const label = '<span class="tab-rec-dot" aria-hidden="true"></span>REC &middot; ' +
        cur.throws.length + (cur.throws.length === 1 ? ' throw' : ' throws');
      recBadges.forEach((b) => { b.innerHTML = label; });
      $('loadSub').textContent = 'capturing \u00b7 ' + cur.throws.length +
        (cur.throws.length === 1 ? ' throw' : ' throws');
    }
    lastCommitted = c;
    requestAnimationFrame(sample);
  }

  function stopSession() {
    if (!cur) return;
    $('feedCta').hidden = false;
    const frames = M.state.frames;              // read before setRecording resets it
    const elapsed = (performance.now() - cur.t0) / 1000;
    M.setRecording(false);
    recBadges.forEach((b) => {
      b.hidden = true;
      b.innerHTML = '<span class="tab-rec-dot" aria-hidden="true"></span>REC';
    });
    stopBtns.forEach((b) => { b.hidden = true; });

    const captured = {
      id: sessionId(),
      elapsed,
      frames: Math.floor(frames),
      throws: cur.throws,
      peaks: cur.peaks,
      transitions: M.smoother.transitions - cur.trans0,
      uke: M.ukeBoundPct()
    };
    cur = null;
    aggregate(captured);
  }

  function sessionId() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  /* ── aggregate ─────────────────────────────────────────────────────────── */
  function aggregate(captured) {
    showView('dash');
    $('dashEmpty').hidden = true;
    $('hlList').hidden = true;
    $('dashRail').hidden = true;
    $('dashLoad').hidden = false;
    $('dState').textContent = 'AGGREGATING';
    $('dReview').textContent = 'scoring';
    panels.forEach((p) => p.classList.add('is-loading'));

    let p = 0;
    const tick = () => {
      p = Math.min(100, p + 8);
      $('loadSub').textContent = (p < 55 ? 'reading clips · ' : 'scoring events · ') + p + '%';
      if (p < 100) return setTimeout(tick, 130);
      setTimeout(() => {
        sessions.unshift(captured);
        panels.forEach((el) => el.classList.remove('is-loading'));
        $('dashLoad').hidden = true;
        render();
      }, 260);
    };
    tick();
  }

  /* ── review ────────────────────────────────────────────────────────────── */
  function render() {
    const shown = activeSession ? sessions.filter((s) => s.id === activeSession) : sessions;
    const throws = shown.flatMap((s) => s.throws.map((t) => ({ ...t, sid: s.id })));
    const frames = shown.reduce((n, s) => n + s.frames, 0);
    const secs = shown.reduce((n, s) => n + s.elapsed, 0);
    const trans = shown.reduce((n, s) => n + s.transitions, 0);

    $('dSessions').textContent = String(sessions.length);
    $('dThrows').textContent = String(throws.length);
    $('dLast').textContent = sessions[0].id;

    // The session list is a pick list: choosing one narrows the review to that
    // capture, ALL returns the whole history.
    $('bodySessions').innerHTML =
      `<button class="sess-pick${activeSession === null ? ' is-active' : ''}" type="button" data-sid="">
         <span class="k">ALL SESSIONS</span><span class="v">${sessions.length}</span>
       </button>` +
      sessions.map((s) => `
        <button class="sess-pick${activeSession === s.id ? ' is-active' : ''}" type="button" data-sid="${s.id}">
          <span class="k">${s.id}</span>
          <span class="v">${s.throws.length} thr &middot; ${clock(s.elapsed)}</span>
        </button>`).join('');
    $('bodySessions').querySelectorAll('.sess-pick').forEach((b) =>
      b.addEventListener('click', () => {
        activeSession = b.dataset.sid || null;
        selected = 0;
        render();
      }));

    $('tThrows').textContent = String(throws.length);
    $('tTrans').textContent = String(trans);
    $('tFrames').textContent = frames + 'f';
    $('tTime').textContent = clock(secs);
    $('tUke').textContent = (shown[0] || sessions[0]).uke.toFixed(1) + '%';

    const peaks = {};
    shown.forEach((s) => Object.entries(s.peaks).forEach(([k, v]) => {
      peaks[k] = Math.max(peaks[k] || 0, v);
    }));
    $('bodyPeaks').innerHTML = Object.entries(M.SIG_LABELS).map(([key, label]) => `
      <div class="meter">
        <div class="meter-head"><span>${label} <i class="w">×${M.WEIGHTS[key] ?? 0}</i></span><span class="val">${pct(peaks[key] || 0)}</span></div>
        <div class="meter-track"><div class="meter-fill" style="width:${(peaks[key] || 0) * 100}%"></div></div>
      </div>`).join('');

    const list = $('hlList');
    if (!throws.length) {
      list.innerHTML = '<p class="null-line">session captured, no committed throw in it</p>';
    } else {
      list.innerHTML = throws.map((t, i) => `
        <button class="hl-item${i === 0 ? ' is-active' : ''}" type="button" data-i="${i}">
          <span class="hl-n">${String(i + 1).padStart(2, '0')}</span>
          <span class="hl-t">throw · T+${t.t.toFixed(1)}s</span>
          <span class="hl-s">score ${pct(t.score)}</span>
        </button>`).join('');
      list.querySelectorAll('.hl-item').forEach((b) =>
        b.addEventListener('click', () => selectThrow(Number(b.dataset.i), throws)));
    }
    list.hidden = false;
    $('dashRail').hidden = false;

    $('dReview').textContent = 'ready';
    $('dCount').textContent = String(throws.length);
    $('dState').textContent = 'READY';

    // Session figures, not live analysis: these are pair-level facts the
    // capture produced, reported identically for both slots.
    const best = throws.reduce((m, t) => Math.max(m, t.score), 0);
    const bound = (shown[0] || sessions[0]).uke.toFixed(1) + '%';
    $('rThrowsA').textContent = String(throws.length);
    $('rThrowsB').textContent = String(throws.length);
    $('rBestA').textContent = throws.length ? pct(best) : '\u2014';
    $('rBestB').textContent = throws.length ? pct(best) : '\u2014';
    $('rBoundA').textContent = bound;
    $('rBoundB').textContent = bound;

    $('dashWindow').classList.toggle('has-footage', throws.length > 0);
    if (throws.length) selectThrow(0, throws);
    else $('bodyPick').innerHTML = '<p class="null-line">nothing selected</p>';
  }

  function selectThrow(i, throws) {
    selected = i;
    const t = throws[i];
    playHighlight(t);
    document.querySelectorAll('.hl-item').forEach((b, bi) =>
      b.classList.toggle('is-active', bi === i));
    $('bodyPick').innerHTML = `
      <div class="row"><span class="k">session</span><span class="v">${t.sid}</span></div>
      <div class="row"><span class="k">at</span><span class="v">T+${t.t.toFixed(2)}s</span></div>
      <div class="row"><span class="k">score</span><span class="v">${pct(t.score)}</span></div>
      <div class="row"><span class="k">threshold</span><span class="v">${t.score >= 0.6 ? 'over 0.60' : 'under 0.60'}</span></div>
      <div class="row"><span class="k">support loss</span><span class="v">${pct(t.sig.support_loss)}</span></div>
      <div class="row"><span class="k">descent</span><span class="v">${pct(t.sig.descent)}</span></div>
      <div class="row"><span class="k">uke bound</span><span class="v">${t.uke.toFixed(1)}%</span></div>`;
  }

  // Names are entered on the dashboard and carry through to the live roster.
  ['A', 'B'].forEach((slot) => {
    const input = $('nameInput' + slot);
    const target = $('name' + slot);
    if (!input || !target) return;
    const fallback = slot === 'A' ? 'LEO' : 'BEN';
    const apply = () => {
      target.textContent = (input.value || '').trim().toUpperCase() || fallback;
    };
    input.addEventListener('input', apply);
    apply();
  });

  // Review starts a little before the commit, so the entry is visible too.
  function playHighlight(t) {
    if (!reviewVideo) return;
    const go = () => {
      try { reviewVideo.currentTime = Math.max(0, (t.feedTime || 0) - 1.2); } catch (e) { /* not seekable */ }
      const p = reviewVideo.play();
      if (p && p.catch) p.catch(() => {});
    };
    if (reviewVideo.readyState >= 1) go();
    else reviewVideo.addEventListener('loadedmetadata', go, { once: true });
  }

  /* ── boot ──────────────────────────────────────────────────────────────── */
  const arm = (btn) => {
    btn.classList.add('is-armed');
    setTimeout(() => btn.classList.remove('is-armed'), 260);
  };
  $('btnStart').addEventListener('click', (e) => { arm(e.currentTarget); startSession(); });
  $('btnStartFeed').addEventListener('click', (e) => { arm(e.currentTarget); startSession(); });
  $('btnNew').addEventListener('click', (e) => { arm(e.currentTarget); startSession(); });
  stopBtns.forEach((b) => b.addEventListener('click', stopSession));

  showView('dash');
  M.setRecording(false);
  $('dState').textContent = 'EMPTY';
})();
