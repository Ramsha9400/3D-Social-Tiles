/* =========================================================
   3D Social Tiles - behaviour
   - Hover: the tile tilts toward the cursor and shows its brand colour
   - Click: selects the tile (saved between visits); a short sound plays
   - Search: typing hides tiles that do not match
   - Keyboard: Tab / arrows to move, Enter or Space to select, R to reset
   - Motion is eased once per animation frame; reduced-motion users get instant changes
   ========================================================= */

(function () {
  'use strict';

  const STORAGE_KEY = 'social-tiles:selected';
  const SOUND_KEY = 'social-tiles:sound';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const EASE = reduceMotion ? 1 : 0.18;   // 1 = jump straight to the target

  const stage = document.getElementById('stage');
  const search = document.getElementById('search');
  const resetBtn = document.getElementById('reset');
  const soundBtn = document.getElementById('sound');
  const hint = document.getElementById('hint');
  const tiles = Array.from(stage.querySelectorAll('.tile'));

  // Per-tile animation state: current values move toward the targets each frame
  const state = new Map();
  tiles.forEach((tile) => {
    state.set(tile, {
      lift: 0, hide: 0, hideTarget: 0,
      rx: 0, ry: 0, tx: 0, ty: 0,     // tilt now and target
      hover: false, selected: false,
    });
  });

  /* ---------- Saved state (storage can fail, so guard it) ---------- */
  function loadSaved() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch (err) { return []; }
  }
  function saveSelected() {
    const ids = tiles.filter((t) => state.get(t).selected).map((t) => t.dataset.id);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)); } catch (err) { /* forget silently */ }
  }
  function loadSoundPref() {
    try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch (err) { return true; }
  }
  function saveSoundPref(on) {
    try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch (err) { /* ignore */ }
  }

  /* ---------- Sound: short synthesized tones (no audio files needed) ---------- */
  let audioCtx = null;
  let soundOn = loadSoundPref();

  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  // A tone that glides from freqA to freqB and fades out
  function tone(freqA, freqB, dur, vol) {
    if (!soundOn) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freqA, now);
    osc.frequency.exponentialRampToValueAtTime(freqB, now + dur);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(vol, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }
  const playSelect = () => tone(520, 880, 0.12, 0.18);
  const playReset = () => tone(880, 440, 0.22, 0.14);

  function setSoundButton() {
    soundBtn.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
    soundBtn.textContent = 'Sound: ' + (soundOn ? 'On' : 'Off');
  }

  /* ---------- Helpers ---------- */
  function setPressed(tile, on) { tile.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  function selectedCount() { return tiles.filter((t) => state.get(t).selected).length; }
  function updateHint(message) {
    hint.textContent = message || (selectedCount() + ' selected. Press R to reset.');
  }

  /* ---------- Actions ---------- */
  function toggleTile(tile) {
    const s = state.get(tile);
    s.selected = !s.selected;
    setPressed(tile, s.selected);
    saveSelected();
    playSelect();
    updateHint(tile.dataset.label + (s.selected ? ' selected. ' : ' cleared. ') + selectedCount() + ' selected.');
  }

  function applySearch() {
    const q = search.value.trim().toLowerCase();
    tiles.forEach((t) => {
      const match = q === '' || t.dataset.label.toLowerCase().includes(q);
      state.get(t).hideTarget = match ? 0 : 1;
      t.dataset.match = match ? 'yes' : 'no';
    });
    const visible = tiles.filter((t) => t.dataset.match === 'yes').length;
    updateHint(q ? visible + ' tile(s) match "' + search.value.trim() + '".' : undefined);
  }

  function resetAll() {
    search.value = '';
    tiles.forEach((t) => { state.get(t).selected = false; setPressed(t, false); });
    saveSelected();
    applySearch();
    playReset();
    updateHint('Reset. Hover a tile to see its brand colour.');
  }

  /* ---------- Pointer tilt: the tile leans toward the cursor ---------- */
  function tiltFromPointer(tile, e) {
    const r = tile.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;    // -0.5..0.5
    const py = (e.clientY - r.top) / r.height - 0.5;
    const s = state.get(tile);
    s.tx = py * -16;    // rotateX (degrees)
    s.ty = px * 16;     // rotateY (degrees)
  }

  /* ---------- Events ---------- */
  tiles.forEach((tile) => {
    tile.addEventListener('click', () => { ensureAudio(); toggleTile(tile); });
    tile.addEventListener('pointerenter', (e) => { state.get(tile).hover = true; tiltFromPointer(tile, e); });
    tile.addEventListener('pointermove', (e) => tiltFromPointer(tile, e));
    tile.addEventListener('pointerleave', () => { const s = state.get(tile); s.hover = false; s.tx = 0; s.ty = 0; });
    tile.addEventListener('focus', () => { state.get(tile).hover = true; });
    tile.addEventListener('blur', () => { state.get(tile).hover = false; });
  });

  stage.addEventListener('keydown', (e) => {
    const idx = tiles.indexOf(document.activeElement);
    if (idx < 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = (idx + (e.key === 'ArrowRight' ? 1 : tiles.length - 1)) % tiles.length;
      tiles[next].focus();
    }
  });

  search.addEventListener('input', applySearch);
  resetBtn.addEventListener('click', () => { ensureAudio(); resetAll(); });
  soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    saveSoundPref(soundOn);
    setSoundButton();
    if (soundOn) { ensureAudio(); playSelect(); }
  });

  document.addEventListener('keydown', (e) => {
    const typing = e.target instanceof HTMLInputElement;
    if (!typing && (e.key === 'r' || e.key === 'R')) resetAll();
  });

  /* ---------- Restore saved selection ---------- */
  const saved = loadSaved();
  tiles.forEach((t) => {
    const on = saved.includes(t.dataset.id);
    state.get(t).selected = on;
    setPressed(t, on);
  });
  setSoundButton();
  updateHint();

  /* ---------- Animation loop: ease every value toward its target once per frame ---------- */
  function frame() {
    tiles.forEach((tile) => {
      const s = state.get(tile);
      const liftTarget = s.selected ? 1 : s.hover ? 0.6 : 0;

      s.lift += (liftTarget - s.lift) * EASE;
      s.hide += (s.hideTarget - s.hide) * EASE;
      s.rx += (s.tx - s.rx) * EASE;
      s.ry += (s.ty - s.ry) * EASE;

      if (Math.abs(liftTarget - s.lift) < 0.001) s.lift = liftTarget;
      if (Math.abs(s.hideTarget - s.hide) < 0.001) s.hide = s.hideTarget;

      tile.style.setProperty('--rx', s.rx.toFixed(3) + 'deg');
      tile.style.setProperty('--ry', s.ry.toFixed(3) + 'deg');
      const slot = tile.parentElement;   // lift and hide live on the slot
      slot.style.setProperty('--lift', s.lift.toFixed(4));
      slot.style.setProperty('--hide', s.hide.toFixed(4));
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
