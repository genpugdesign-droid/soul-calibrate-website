/* ============================================================================
   Soul Calibrate — Live HUD v1 · data driver
   ----------------------------------------------------------------------------
   DESIGN SCAFFOLDING. This file SIMULATES the live data stream so every field
   the real recorder feeds can be judged in layout. It is not a detector, it
   reads no camera, and it never writes anything.

   Every field below mirrors a real value in record_session.py's
   `_update_display`. The mapping is:

     statusWord / vFps / vPersons / vFrames / vBoth / vStable / vSwaps / vCpu
                          -> self.status_label   (telemetry.get_hud_stats())
     reel (rolodex)       -> self.state_label    (DisplayStateSmoother.committed)
     pulseChip            -> LEVEL CHANGE pulse  (display_state.PULSE_WORDS)
     pillScore/Atk/Rcv/Entry -> self.throw_score_label (ThrowScore)
     meters               -> ThrowScore component scores × real weights
     athlete rows         -> angles_a/b_label, support_label, stance_detail_label
     aBind/bBind/sBinder/sUke -> binder_status_label + binder_session_label
     sPair/sHeading       -> pair_label (PairMetrics)
     sStance/sGrip        -> stance_label + stance_detail_label
   ========================================================================== */

'use strict';

const $ = (id) => document.getElementById(id);
// The HUD root carries the committed state as a data attribute — see the loop.
const hudEl = $('hud');

/* ── Contract constants, copied from the Python source of truth ──────────── */

// throw_scoring.THROW_SCORE_WEIGHTS
const WEIGHTS = {
  engagement: 0.12, entry: 0.15, best_entry_signal: 0.23,
  knee_asymmetry: 0.05, support_loss: 0.25, descent: 0.20,
};

// display_state.py — dwell + hold hysteresis, so the badge cannot flicker
const MIN_DWELL_S = 0.8;
const DEFAULT_HOLD_S = 1.5;
const MIN_HOLD_S = { RECOVERY: 1.5 };
const IMMEDIATE = ['ATTACK', 'GROUND'];
const SALIENCE = { OPEN: 0, ENGAGED: 1, RECOVERY: 2, ATTACK: 3, GROUND: 4 };
const PULSE_REFRACTORY_S = 1.5;

// support_state.py
const SUPPORT = ['double_support', 'single_support', 'light_support', 'airborne'];

/* ── Scripted beat sheet ─────────────────────────────────────────────────────
   One nage-komi repetition: settle, grip, kuzushi, entry, throw, ground,
   recovery. Each beat names the RAW state; the smoother below decides what
   the badge is allowed to show — exactly as production does. */
const BEATS = [
  { s: 'neutral',               dur: 3.2, sig: { engagement: .10, entry: .05, best_entry_signal: .04, knee_asymmetry: .08, support_loss: .05, descent: .02 } },
  { s: 'engaged',               dur: 4.0, sig: { engagement: .62, entry: .22, best_entry_signal: .18, knee_asymmetry: .14, support_loss: .10, descent: .04 } },
  { s: 'entry_candidate',       dur: 1.6, sig: { engagement: .78, entry: .58, best_entry_signal: .46, knee_asymmetry: .30, support_loss: .18, descent: .10 } },
  { s: 'off_balance_candidate', dur: 1.4, sig: { engagement: .84, entry: .70, best_entry_signal: .62, knee_asymmetry: .44, support_loss: .52, descent: .22 } },
  { s: 'descent',               dur: 1.1, sig: { engagement: .88, entry: .76, best_entry_signal: .74, knee_asymmetry: .52, support_loss: .68, descent: .71 } },
  { s: 'throw_candidate',       dur: 1.8, sig: { engagement: .91, entry: .82, best_entry_signal: .88, knee_asymmetry: .58, support_loss: .86, descent: .84 } },
  { s: 'impact_or_grounded',    dur: 2.0, sig: { engagement: .74, entry: .40, best_entry_signal: .52, knee_asymmetry: .36, support_loss: .94, descent: .90 } },
  { s: 'recovery_or_abort',     dur: 3.0, sig: { engagement: .48, entry: .16, best_entry_signal: .14, knee_asymmetry: .20, support_loss: .40, descent: .18 } },
  { s: 'neutral',               dur: 2.4, sig: { engagement: .14, entry: .06, best_entry_signal: .05, knee_asymmetry: .10, support_loss: .08, descent: .03 } },
];

// ui_semantics.DISPLAY_WORD — raw state -> committed display vocabulary
const DISPLAY_WORD = {
  neutral: 'OPEN', engaged: 'ENGAGED',
  entry_candidate: 'ENGAGED', off_balance_candidate: 'ENGAGED',
  throw_candidate: 'ATTACK', descent: 'LEVEL_CHANGE',
  impact_or_grounded: 'GROUND', recovery_or_abort: 'RECOVERY',
};

/* The raw vocabulary, in detector order, for the ribbon under the committed
   word. Derived from DISPLAY_WORD rather than typed out again, so the ribbon
   cannot drift from the mapping it is there to expose.

   NOTE this is the eight RAW STATES, not the nine entries of the beat sheet
   below. The beat sheet is a script — it knows what happens next, and the
   recorder never does. A ribbon built from it would be showing the operator
   the future, which is the one lie this mock must not tell. */
const RAW_STATES = Object.keys(DISPLAY_WORD);
// The two raw states that carry drama; the ribbon lights these in red.
const RAW_HOT = ['throw_candidate', 'impact_or_grounded'];

/* ── DisplayStateSmoother, ported 1:1 from display_state.py ──────────────── */
class Smoother {
  constructor() {
    this.committed = 'OPEN';
    this.committedAt = 0;
    this.pending = null;      // [word, sinceT]
    this.lastDrama = null;    // last ATTACK/GROUND commit
    this.lastPulseT = null;
    this.transitions = 0;
  }
  hold(word) { return MIN_HOLD_S[word] ?? DEFAULT_HOLD_S; }

  update(t, raw) {
    const word = DISPLAY_WORD[raw] ?? 'OPEN';

    // `descent` is a quiet PULSE beside the badge, never a badge transition.
    if (word === 'LEVEL_CHANGE') {
      if (this.lastPulseT === null || (t - this.lastPulseT) >= PULSE_REFRACTORY_S) {
        this.lastPulseT = t;
      }
      return this.committed;
    }
    if (word === this.committed) { this.pending = null; return this.committed; }

    // RECOVERY is aftermath narration — it only commits after shown drama.
    if (word === 'RECOVERY' && this.lastDrama === null) return this.committed;

    // High-salience states commit IMMEDIATELY and preempt anything lower.
    const immediate = IMMEDIATE.includes(word) &&
                      SALIENCE[word] > SALIENCE[this.committed];
    if (immediate) return this._commit(t, word);

    // Low-salience: needs continuous intent AND the current hold to expire.
    if (!this.pending || this.pending[0] !== word) this.pending = [word, t];
    const dwellOk = (t - this.pending[1]) >= MIN_DWELL_S;
    const holdOk = (t - this.committedAt) >= this.hold(this.committed);
    if (dwellOk && holdOk) return this._commit(t, word);
    return this.committed;
  }

  _commit(t, word) {
    this.committed = word;
    this.committedAt = t;
    this.pending = null;
    this.transitions += 1;
    if (word === 'ATTACK' || word === 'GROUND') this.lastDrama = word;
    if (word === 'OPEN') this.lastDrama = null;
    return word;
  }

  pulseActive(t) {
    return this.lastPulseT !== null && (t - this.lastPulseT) < 1.2;
  }
}

/* ── Session-level fixtures ──────────────────────────────────────────────── */
const SESSION = {
  id: '20260824_194512',
  plan: 'gi_standup / nage-komi',
  profile: 'gpug-m4-webcam',
  consent: 'GRANTED · research',
  power: 'performance · AC',
};

const state = {
  t0: performance.now(),
  beat: 0,
  beatT: 0,
  recording: false,
  frames: 0,
  fps: 9.4,
  swaps: 0,
  stableRun: 0,
  ukeBoundFrames: 0,
  totalFrames: 0,
  trackA: 3,
  trackB: 7,
  // Latched at ATTACK, released when the system returns to calm — the throw
  // card outlives the instant that opened it. See the throw block in frame().
  throwLatch: false,
  sig: { ...BEATS[0].sig },
};

const smoother = new Smoother();

/* `#beat=N` pins the drum to one beat instead of looping, so a specific state
   can be linked to for review — same URL-hash convention as the existing
   design_preview tool. `#beat=5` is the throw (ATTACK).

   `#from=N` seeks to a beat and KEEPS RUNNING. Pinning cannot show anything
   that only exists as a transition, and v6 has one that matters: the throw
   card latches at ATTACK and holds through GROUND and RECOVERY. Pinned at
   beat 6 the sim never passed through ATTACK, so the card is correctly shut
   and the hold is invisible. `#from=5` is the link that shows it. */
const hashArgs = new URLSearchParams(location.hash.slice(1));
const seekBeat = hashArgs.get('beat') ?? hashArgs.get('from');
if (seekBeat !== null) {
  const n = Number(seekBeat);
  if (Number.isFinite(n)) {
    state.beat = Math.min(BEATS.length - 1, Math.max(0, Math.trunc(n)));
    state.sig = { ...BEATS[state.beat].sig };
    state.hold = hashArgs.get('beat') !== null;
  }
}

/* ── Small helpers ───────────────────────────────────────────────────────── */
const lerp = (a, b, k) => a + (b - a) * k;
const pct = (v) => `${Math.round(v * 100)}%`;
const jitter = (v, amt) => v + (Math.random() - 0.5) * amt;

let lastText = {};
function setText(id, value, cls) {
  const el = $(id);
  if (!el) return;
  const s = String(value);
  if (lastText[id] !== s) {
    el.textContent = s;
    lastText[id] = s;
    if (cls !== false) {           // brief highlight on change
      el.classList.remove('tick');
      void el.offsetWidth;
      el.classList.add('tick');
    }
  }
}

/* ── Combat-state rolodex (vertical, bottom-docked) ─────────────────────────
   The drum carries every committed state at once and never re-orders — slot
   position is fixed so it becomes muscle memory. v3 runs it HORIZONTALLY:
   left-to-right matches the salience ramp it already encodes, and it costs no
   vertical room over the mat.

   v4 returns it to VERTICAL, which reads as a reel far more than the
   horizontal pass did, and docks it bottom-centre. Each slot is placed from
   its signed distance to the committed state; CSS turns that into the 3D
   rotation, so one property write per slot drives the whole spin. */
const REEL_ORDER = ['OPEN', 'ENGAGED', 'ATTACK', 'GROUND', 'RECOVERY'];

const reelEl = $('reel');
const reelItems = Array.from(document.querySelectorAll('.reel-item'));
let reelCommitted = null;

function spinReel(committed) {
  reelCommitted = committed;
  const idx = REEL_ORDER.indexOf(committed);
  if (idx < 0) return;
  const n = REEL_ORDER.length;
  const half = Math.floor(n / 2);   // 2 for the five display states

  reelItems.forEach((el, i) => {
    // THE DRUM WRAPS. Distance is the SHORTEST way round the barrel, so every
    // slot lands within +/-2 of the committed one and the two above OPEN are
    // filled by GROUND and RECOVERY coming back round rather than left blank.
    let d = i - idx;
    if (d >  half) d -= n;
    if (d < -half) d += n;

    // A slot that just wrapped is on the far side of the barrel, and easing it
    // there would slide it the long way across the whole drum in view. Land
    // that one instantly; everything else eases on the state curve.
    const wrapped = el._d !== undefined && Math.abs(d - el._d) > half;
    if (wrapped) el.style.transition = 'none';

    el._d = d;
    el.style.setProperty('--d', d);
    el.style.setProperty('--ad', Math.abs(d));
    el.classList.toggle('is-committed', d === 0);

    if (wrapped) {
      void el.offsetWidth;          // commit the jump before easing resumes
      el.style.transition = '';
    }
  });
}
spinReel('OPEN');   // seat the drum before the first frame

/* ── The raw-state ribbon ────────────────────────────────────────────────────
   One chip per raw state, built once and never re-ordered. Only the `is-live`
   class moves, so a state's position is a fixed landmark the operator can
   learn rather than a row that reshuffles under them. */
const ribbonEl = $('ribbon');
const chipEls = {};
for (const raw of RAW_STATES) {
  const el = document.createElement('span');
  el.className = 'chip';
  el.dataset.raw = raw;
  el.textContent = raw.replace(/_/g, ' ');
  el.title = `raw: ${raw} -> ${DISPLAY_WORD[raw]}`;
  ribbonEl.appendChild(el);
  chipEls[raw] = el;
}

let ribbonLive = null;
function setRibbon(raw) {
  if (ribbonLive === raw) return;
  if (ribbonLive && chipEls[ribbonLive]) {
    chipEls[ribbonLive].classList.remove('is-live', 'is-hot');
  }
  const el = chipEls[raw];
  if (el) {
    el.classList.add('is-live');
    el.classList.toggle('is-hot', RAW_HOT.includes(raw));
  }
  ribbonLive = raw;
}

/* ── ASCII accents ───────────────────────────────────────────────────────────
   Texture, never data. These are decorative rails in the spirit of the
   reference boards — they must never be mistaken for a readout, so nothing
   here is ever derived from a real value. */
const BLOCKS = '▁▂▃▄▅▆▇█▉▊▋▌▍▎▏';
const randOf = (s) => s[Math.floor(Math.random() * s.length)];

function fillAscii() {
  document.querySelectorAll('[data-ascii]').forEach((el) => {
    const n = Number(el.dataset.n || 12);
    const kind = el.dataset.ascii;
    let out = '';
    if (kind === 'bin') {
      const rows = [];
      for (let r = 0; r < n; r++) {
        let line = '';
        for (let b = 0; b < 8; b++) line += Math.random() < 0.5 ? '0' : '1';
        rows.push(line);
      }
      out = rows.join(' ');
    } else {
      for (let i = 0; i < n; i++) out += randOf(BLOCKS);
    }
    el.textContent = out;
  });
}
fillAscii();
// Only the element marked `scan` re-rolls, and slowly — a rail that flickers
// constantly reads as data changing, which is exactly the lie to avoid.
setInterval(() => {
  document.querySelectorAll('[data-ascii="scan"]').forEach((el) => {
    let out = '';
    for (let i = 0; i < Number(el.dataset.n || 12); i++) out += randOf(BLOCKS);
    el.textContent = out;
  });
}, 900);

/* ── THROW DETECTED — legacy frame-sequence player ───────────────────────────
   Plays `assets/<name>/frame_NNNN.png`, the same sequence the reviewer overlay
   uses. Nothing here is pinned to this particular export:

     - the frame COUNT is probed at runtime by walking frame_0001, 0002 … until
       one fails to load, so a re-export with a different length needs no code
       change (same convention as docs/design_preview/index.html);
     - folder, fps and hold-frame come off data-attributes in the markup;
     - the content-band crop lives in CSS custom properties.

   Frames are fetched lazily in the background after first paint so the page
   does not stall on ~47MB of PNGs, and the slot says LOADING SEQUENCE until
   enough of them have decoded to play. */
const ANIM_ROOT = '../../../assets';

const throwSlot = $('throwSlot');
const throwAnim = $('throwAnim');
const throwImg  = $('throwFrame');

const anim = {
  name:  throwSlot.dataset.anim || 'throw_detected',
  fps:   Number(throwSlot.dataset.fps || 24),
  hold:  Number(throwSlot.dataset.hold || 0),
  frames: [],          // decoded Image objects, in order
  count: 0,            // frames confirmed to exist
  ready: false,
  playing: false,
  idx: 0,
  lastStep: 0,
};

const framePath = (n) =>
  `${ANIM_ROOT}/${anim.name}/frame_${String(n).padStart(4, '0')}.png`;

function loadFrame(n) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);   // a miss is how we find the end
    img.src = framePath(n);
  });
}

async function loadSequence() {
  // Probe + preload in one walk. Stop at the first gap: that is the end of the
  // sequence, not an error.
  for (let n = 1; n <= 999; n++) {
    const img = await loadFrame(n);
    if (!img) break;
    anim.frames.push(img);
    anim.count = n;
    // Playable as soon as the reveal has landed; the tail keeps loading behind.
    if (n === Math.max(anim.hold, 12)) {
      anim.ready = true;
      throwAnim.classList.remove('is-waiting');
      throwImg.src = anim.frames[0].src;
    }
  }
  if (anim.count > 0) {
    anim.ready = true;
    throwAnim.classList.remove('is-waiting');
    setText('throwNote', `${anim.name} · ${anim.count}f @ ${anim.fps}fps`, false);
  } else {
    setText('throwNote', `${anim.name} — no frames found`, false);
  }
}

throwAnim.classList.add('is-waiting');
setText('throwNote', 'loading…', false);
// Kick off after first paint so the HUD renders immediately.
requestAnimationFrame(() => setTimeout(loadSequence, 0));

/* `#frame=N` pins the sequence to one frame so a specific beat of the reveal
   can be linked for review — same idea as `#beat=`. */
const pinnedFrame = (() => {
  const v = new URLSearchParams(location.hash.slice(1)).get('frame');
  const n = Number(v);
  return v !== null && Number.isFinite(n) ? Math.max(1, Math.trunc(n)) : null;
})();

function startThrowAnim() {
  if (!anim.ready || anim.playing) return;
  anim.playing = true;
  anim.idx = pinnedFrame ? Math.min(pinnedFrame, anim.count) - 1 : 0;
  anim.lastStep = performance.now();
  const f = anim.frames[anim.idx];
  if (f) throwImg.src = f.src;
}
function stopThrowAnim() { anim.playing = false; }

function stepThrowAnim(now) {
  if (!anim.playing || !anim.count || pinnedFrame) return;
  const dt = now - anim.lastStep;
  const step = 1000 / anim.fps;
  if (dt < step) return;
  anim.lastStep = now;
  // Advance to the hold frame, then stay there — the reveal settles rather
  // than looping, which is what the legacy asset was authored to do.
  const last = Math.min(anim.hold || anim.count, anim.count) - 1;
  if (anim.idx < last) anim.idx += 1;
  const f = anim.frames[anim.idx];
  if (f) throwImg.src = f.src;
}

/* ── Theme ───────────────────────────────────────────────────────────────────
   Dark and light cards at the SAME low tint. The light theme is not a colour
   inversion: it needs its own backdrop filter and a darker token set, because
   the worst case flips from a blown-out frame to a black one. See
   contrast_audit.py — both themes are verified at both ends of the range. */
const viewportEl = $('viewport');
function setTheme(mode) {
  if (mode === 'light') viewportEl.setAttribute('data-theme', 'light');
  else viewportEl.removeAttribute('data-theme');
  setText('themeName', mode.toUpperCase(), false);
  try { localStorage.setItem('magi-theme', mode); } catch (e) { /* private mode */ }
}
// v9: light mode is retired for now. The theme machinery stays intact — the
// tokens and the audit still cover both — but the app ships dark only, so the
// toggle is gone and the control is optional rather than assumed.
let themeMode = 'dark';
setTheme(themeMode);
const themeBtn = $('themeBtn');
if (themeBtn) {
  themeBtn.addEventListener('click', () => {
    themeMode = themeMode === 'light' ? 'dark' : 'light';
    setTheme(themeMode);
  });
}

/* ── Collapsible panels ──────────────────────────────────────────────────────
   Each panel shuts in place, without resizing the window. The TITLE BAR stays
   visible when collapsed so the operator never loses track of what is shut. */
document.querySelectorAll('.panel-head').forEach((head) => {
  head.addEventListener('click', () => {
    const panel = head.closest('.panel');
    const open = head.getAttribute('aria-expanded') === 'true';
    head.setAttribute('aria-expanded', String(!open));
    panel.classList.toggle('is-collapsed', open);
  });
});

// The bar stays; only the raw-state ribbon under it collapses. The committed
// word lives on the bar, so shutting the ribbon never hides the claim itself —
// it hides the evidence, which is the operator's call to make.
$('reelToggle').addEventListener('click', () => {
  const head = $('reelToggle');
  const open = head.getAttribute('aria-expanded') === 'true';
  head.setAttribute('aria-expanded', String(!open));
  $('cardCombat').classList.toggle('is-collapsed', open);
});

/* ── Meters ──────────────────────────────────────────────────────────────── */
const meterEls = {};
document.querySelectorAll('.meter').forEach((m) => {
  meterEls[m.dataset.sig] = {
    fill: m.querySelector('.meter-fill'),
    val: m.querySelector('.val'),
  };
});

/* ── Main loop ───────────────────────────────────────────────────────────── */
let prev = performance.now();

function frame(now) {
  const dt = Math.min((now - prev) / 1000, 0.1);
  prev = now;
  const t = (now - state.t0) / 1000;

  // Advance the beat sheet
  state.beatT += dt;
  const beat = BEATS[state.beat];
  if (!state.hold && state.beatT >= beat.dur) {
    state.beatT = 0;
    state.beat = (state.beat + 1) % BEATS.length;
  }
  const target = BEATS[state.beat].sig;

  // Ease every signal toward its beat target (this is where "easy ease" shows
  // up in the data, not just the CSS — nothing in the HUD ever snaps).
  const k = 1 - Math.pow(0.0015, dt);
  for (const key of Object.keys(WEIGHTS)) {
    state.sig[key] = lerp(state.sig[key], target[key], k);
  }

  const raw = BEATS[state.beat].s;
  const committed = smoother.update(t, raw);
  const pulsing = smoother.pulseActive(t);

  // Weighted throw score — the real formula
  let score = 0;
  for (const [key, w] of Object.entries(WEIGHTS)) score += state.sig[key] * w;

  /* ── Capture status ──────────────────────────────────────────────── */
  state.fps = lerp(state.fps, jitter(9.4, 1.6), 0.06);
  const nPersons = state.sig.engagement > 0.2 ? 2 : 2;
  if (state.recording) state.frames += state.fps * dt;
  state.totalFrames += 1;
  state.stableRun = state.sig.engagement > 0.15 && committed !== 'GROUND'
    ? state.stableRun + 1 : 0;

  // v13: LIVE is a bottom rail rather than a card, so the recording class
  // lands on whichever element is carrying it. Guarded so the engine survives
  // either arrangement.
  const st = $('cardStatus') || document.querySelector('.live-strip');
  if (st) st.classList.toggle('is-recording', state.recording);
  setText('statusWord', state.recording ? '● REC' : 'LIVE', false);
  setText('vFps', state.fps.toFixed(1), false);
  setText('vPersons', `${nPersons}p`);
  setText('vFrames', state.recording ? `${Math.floor(state.frames)}f` : '—', false);
  setText('vBoth', pct(Math.min(0.99, 0.72 + state.sig.engagement * 0.25)), false);
  setText('vStable', String(state.stableRun), false);
  setText('vSwaps', String(state.swaps));
  setText('vCpu', `${Math.round(jitter(46, 8))}%`, false);

  /* ── Session stats ───────────────────────────────────────────────── */
  setText('vSession', SESSION.id);
  setText('vPlan', SESSION.plan);
  setText('vProfile', SESSION.profile);
  setText('vConsent', SESSION.consent);
  setText('vPower', SESSION.power);
  const el = Math.floor(t);
  setText('vElapsed', `${String(Math.floor(el / 60)).padStart(2, '0')}:${String(el % 60).padStart(2, '0')}`, false);

  /* ── Combat state ────────────────────────────────────────────────── */
  const card = $('cardCombat');
  // The raw stream, shown under the word it maps onto.
  setRibbon(raw);
  // Published on the HUD root so elements OUTSIDE the combat card — the throw
  // title, over in the feed window — can take the committed state's colour
  // without the card having to be their ancestor.
  hudEl.dataset.state = committed;
  if (reelCommitted !== committed) {
    const wasCollapsed = card.classList.contains('is-collapsed');
    card.className = `c-combat state-${committed}` + (wasCollapsed ? ' is-collapsed' : '');
    setText('reelNow', committed, false);
    spinReel(committed);
  }
  const hot = committed === 'ATTACK' || committed === 'GROUND';
  card.classList.toggle('is-hot', hot);
  $('cardAnalysis').classList.toggle('is-hot', hot);
  $('pulseChip').classList.toggle('on', pulsing);

  // ThrowScore: entry_type, probable_attacker, probable_receiver
  const entryType = state.sig.best_entry_signal > 0.55
    ? (state.sig.knee_asymmetry > 0.5 ? 'PENETRATION' : 'ROTATIONAL')
    : (state.sig.entry > 0.4 ? 'LATERAL' : '—');

  /* ── Meters ──────────────────────────────────────────────────────── */
  for (const [key, m] of Object.entries(meterEls)) {
    const v = state.sig[key];
    m.fill.style.width = `${(v * 100).toFixed(1)}%`;
    m.fill.classList.toggle('hot', v >= 0.6);
    m.val.textContent = pct(v);
  }

  /* ── Athletes ────────────────────────────────────────────────────── */
  // Tori keeps support longer; uke loses it as the throw develops.
  const balA = Math.min(0.95, state.sig.entry * 0.35);
  const balB = Math.min(0.99, state.sig.support_loss);
  const supA = balA > 0.6 ? 'single_support' : 'double_support';
  const supB = committed === 'GROUND' ? 'airborne'
             : balB > 0.75 ? 'airborne'
             : balB > 0.45 ? 'light_support'
             : balB > 0.25 ? 'single_support' : 'double_support';

  // Binder: uke goes tentative at impact when the two bodies merge — the
  // known `uke_unbound_or_occluded` failure the roster has to make legible.
  const bindB = committed === 'GROUND' ? 'unbound'      // person-merge at impact
              : committed === 'RECOVERY' ? 'tentative'   // slot recovering
              : 'bound';
  // Only a BOUND uke slot may show derived uke values. An unbound slot shows
  // the em-dash and the reason — never a stale number that reads as evidence.
  const bOk = bindB === 'bound';
  const bVal = (v) => (bOk ? v : '—');

  setText('aTrack', `#${state.trackA}`);
  setText('bTrack', bindB === 'unbound' ? '—' : `#${state.trackB}`);
  setText('aSupport', supA.replace(/_/g, ' '));
  setText('bSupport', bOk ? supB.replace(/_/g, ' ') : 'uke unbound');
  setText('aBal', pct(balA), false);
  setText('bBal', bVal(pct(balB)), false);

  // Angles: knees flex through the entry, elbows drive the kuzushi.
  const kA = 176 - state.sig.entry * 62;
  const kB = 172 - state.sig.support_loss * 78;
  const eA = 168 - state.sig.best_entry_signal * 74;
  const eB = 160 - state.sig.engagement * 46;
  setText('aKnee', `${kA.toFixed(0)}° / ${(kA - state.sig.knee_asymmetry * 34).toFixed(0)}°`, false);
  setText('bKnee', bVal(`${kB.toFixed(0)}° / ${(kB + 6).toFixed(0)}°`), false);
  setText('aElbow', `${eA.toFixed(0)}° / ${(eA + 9).toFixed(0)}°`, false);
  setText('bElbow', bVal(`${eB.toFixed(0)}° / ${(eB - 5).toFixed(0)}°`), false);
  setText('aHead', state.sig.engagement > 0.5 ? 'inside' : 'unknown');
  setText('bHead', bOk && state.sig.engagement > 0.5 ? 'outside' : 'unknown');

  const aB = $('aBind'), bB = $('bBind');
  aB.className = 'v bind bound';
  bB.className = `v bind ${bindB}`;
  setText('aBind', 'bound', false);
  setText('bBind', bindB, false);

  /* ── Truth discipline (design_direction.md) ──────────────────────────
     P0/P1 is the DEFAULT identity language. TORI/UKE and ATK/RCV are
     role claims — they may only appear when the slot evidence supports
     them (uke_status == bound). When the binder drops or defers the uke
     slot, the roster must stop showing derived uke numbers rather than
     let stale values read as confident pair evidence. */
  const ukeBound = bindB === 'bound';
  // The roster rim goes red only when the uke slot is actually lost — the one
  // condition on this panel worth spending an accent on.
  $('cardRoster').classList.toggle('is-hot', bindB === 'unbound');
  // Session rollup counts BOUND frames only — a tentative slot is not a bound
  // one, and rolling them together would overstate uke_bound %.
  if (ukeBound) state.ukeBoundFrames += 1;
  $('athA').classList.toggle('role-tori', ukeBound);
  $('athB').classList.toggle('role-uke', ukeBound);
  // A role the system has not earned still occupies its slot: an empty gap
  // reads as a rendering fault, a grey `---` reads as "no claim". The row also
  // stops reflowing every time the binder drops.
  const roleA = $('roleA'), roleB = $('roleB');
  roleA.textContent = ukeBound ? 'TORI' : '---';
  roleB.textContent = ukeBound ? 'UKE'  : '---';
  roleA.classList.toggle('is-none', !ukeBound);
  roleB.classList.toggle('is-none', !ukeBound);
  $('athB').classList.toggle('is-unbound', !ukeBound);

  // THROW DETECTED: a BOUND tori committing ATTACK. Both halves are required —
  // an ATTACK with an unbound uke has no confident attacker to attribute it to,
  // so the loudest element in the interface stays shut.
  //
  // AND IT HOLDS. v5 shut the card the instant ATTACK stopped being committed,
  // which is a fraction of a second — the loudest thing in the system was also
  // the briefest, and an operator watching the mat rather than the screen
  // could miss it entirely. The card now latches at ATTACK and stays up
  // through GROUND and RECOVERY, releasing when the system returns to calm.
  //
  // This narrates one event, it does not extend the claim: display_state's
  // RECOVERY_REQUIRES already guarantees RECOVERY only commits after real
  // drama, so every state the card holds through is aftermath OF this throw.
  if (ukeBound && committed === 'ATTACK') state.throwLatch = true;
  if (committed === 'OPEN' || committed === 'ENGAGED') state.throwLatch = false;
  const throwing = state.throwLatch;
  $('athA').classList.toggle('is-throwing', throwing);
  // The panel is permanently mounted in v7; `is-open` now switches its
  // CONTENT between the empty state and a live claim, not its existence.
  throwSlot.classList.toggle('is-open', throwing);
  $('cardCombat').classList.toggle('is-throwing', throwing);
  if (throwing) {
    setText('throwEntry', entryType, false);
    startThrowAnim();
  } else {
    // No claim, stated as one. The stats below stay live either way — they
    // are the evidence a throw would be judged on, and they are worth reading
    // before one happens.
    setText('throwEntry', '—', false);
    stopThrowAnim();
  }
  stepThrowAnim(now);

  // ATK/RCV need confident role evidence AND a bound uke slot.
  const roleKnown = score > 0.35 && ukeBound;
  $('pillScore').innerHTML = `SCORE <b>${pct(score)}</b>`;
  $('pillAtk').innerHTML = `ATK <b>${roleKnown ? 'A' : '?'}</b>`;
  $('pillRcv').innerHTML = `RCV <b>${roleKnown ? 'B' : '?'}</b>`;
  $('pillEntry').innerHTML = `ENTRY <b>${entryType}</b>`;
  // THROW_SCORE_THRESH = 0.60
  $('pillScore').classList.toggle('hot', score >= 0.60);
  $('pillEntry').classList.toggle('hot', score >= 0.60);

  /* ── Bottom strip ────────────────────────────────────────────────── */
  const pairDist = lerp(0.42, 0.09, state.sig.engagement);
  setText('sPair', pairDist.toFixed(3), false);
  setText('sHeading', `${Math.round(lerp(12, 148, state.sig.best_entry_signal))}°`, false);
  setText('sEngage', state.sig.engagement > 0.55 ? 'chest-chest' : 'offset');
  setText('sStance', state.sig.engagement > 0.4 ? 'AI-YOTSU (R)' : '—');
  setText('sGrip', pct(Math.min(0.97, 0.4 + state.sig.engagement * 0.55)), false);
  setText('sBinder', `v2 · ${bindB === 'bound' ? 'committed' : bindB === 'tentative' ? 'deferring' : 'empty slot'}`);
  setText('sUke', `${(state.ukeBoundFrames / Math.max(state.totalFrames, 1) * 100).toFixed(1)}%`, false);

  requestAnimationFrame(frame);
}

/* ── Feed fallback ───────────────────────────────────────────────────────── */
const feed = $('feed');
feed.addEventListener('error', () => {
  feed.hidden = true;
  $('feedFallback').hidden = false;
});
feed.addEventListener('loadeddata', () => { feed.playbackRate = 0.85; });

/* ── Harness ──────────────────────────────────────────────────────────────
   The harness is a preview affordance, not part of the product: an embed that
   ships without it must still run. Wiring it unguarded killed the whole engine
   the first time this build was embedded, exactly as the theme button and the
   LIVE card did before it. */
const btnRec = $('btnRec');
if (btnRec) {
  btnRec.addEventListener('click', () => {
    state.recording = !state.recording;
    if (!state.recording) state.frames = 0;
  });
}
const btnScene = $('btnScene');
if (btnScene) {
  btnScene.addEventListener('click', () => {
    state.beat = (state.beat + 1) % BEATS.length;
    state.beatT = 0;
  });
}

requestAnimationFrame(frame);


/* ── v8 export ───────────────────────────────────────────────────────────────
   The dashboard is a second view over the SAME engine, not a mockup beside it.
   Everything it reports (throws, frames, uke-bound %, peak signals) is read
   from here while the loop runs. Nothing below changes HUD behaviour.
   Re-syncing this file from hud_v1 means re-appending this block. */
window.MAGI = {
  state,
  smoother,
  SESSION,
  BEATS,
  WEIGHTS,   // throw_scoring.THROW_SCORE_WEIGHTS - the dashboard scores the same way
  SIG_LABELS: { engagement: 'ENGAGEMENT', entry: 'ENTRY', best_entry_signal: 'BEST ENTRY',
                knee_asymmetry: 'KNEE ASYM', support_loss: 'SUPPORT LOSS', descent: 'DESCENT' },
  get committed() { return smoother.committed; },
  get recording() { return state.recording; },
  setRecording(on) {
    if (state.recording === on) return;
    state.recording = on;
    if (!on) state.frames = 0;
  },
  ukeBoundPct() {
    return state.totalFrames ? (100 * state.ukeBoundFrames / state.totalFrames) : 0;
  }
};
