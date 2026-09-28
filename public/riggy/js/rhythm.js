/* ============================================================
   rhythm.js — "Daily Jam", an FNF-style 4-lane rhythm minigame.

   Hit the arrows as they scroll up to the receptors, in time with
   the song (audio/Highscore.mp3). Reach the end of the song with health
   left to win 1000 coins — claimable once per calendar day.

   Chart data lives in rhythm_chart.js (RHYTHM_CHART).
   ============================================================ */
'use strict';

const Rhythm = (() => {
  const SONG_URL = 'audio/Highscore.mp3';
  /* difficulty: note chart density, hit windows (ms), scroll speed, health lost
     on a missed note and on a stray key press (anti-spam), and the coin reward */
  const DIFFS = {
    easy:   { label: 'EASY',   reward: 250,  color: '#5fe36f', travel: 1500, win: { sick: 55, good: 105, bad: 150, miss: 180 }, miss: -3, ghost: -1.5 },
    normal: { label: 'NORMAL', reward: 500,  color: '#4cc9ff', travel: 1400, win: { sick: 45, good: 90,  bad: 135, miss: 166 }, miss: -5, ghost: -2 },
    hard:   { label: 'HARD',   reward: 750,  color: '#ffb02e', travel: 1250, win: { sick: 38, good: 75,  bad: 112, miss: 135 }, miss: -6, ghost: -2.5 },
    insane: { label: 'INSANE', reward: 1000, color: '#ff3b4d', travel: 1100, win: { sick: 30, good: 60,  bad: 90,  miss: 110 }, miss: -8, ghost: -3.5 }
  };
  const DIFF_ORDER = ['easy', 'normal', 'hard', 'insane'];
  const HEALTH = { sick: 2.2, good: 1.6, bad: 0.8, start: 50 };
  let D = DIFFS.normal, WIN = D.win, TRAVEL_MS = D.travel;
  function setDiff(k) {
    if (!DIFFS[k]) k = 'normal';
    Save.d.rhythmDiff = k; Save.save();
    D = DIFFS[k]; WIN = D.win; TRAVEL_MS = D.travel;
  }
  const COLORS = ['#c24b99', '#00cbff', '#12fa05', '#f9393f'];   // left, down, up, right
  const LANE_NAMES = ['LEFT', 'DOWN', 'UP', 'RIGHT'];
  const DEFAULT_KEYS = [['arrowleft', 'd'], ['arrowdown', 'f'], ['arrowup', 'j'], ['arrowright', 'k']];
  // rating look + how long the player's reaction animation lasts (ms)
  const RATING = {
    sick:  { text: 'SICK!!',  color: '#7ffcff', anim: 480 },
    good:  { text: 'GOOD',    color: '#8dff8d', anim: 320 },
    bad:   { text: 'BAD',     color: '#ffb35c', anim: 300 },
    miss:  { text: 'FUCKED',  color: '#ff3b4d', anim: 520 }
  };
  let KEYS = {};                          // key name -> lane, rebuilt from Save.d.rhythmKeys
  function rebuildKeys() {
    KEYS = {};
    Save.d.rhythmKeys.forEach((slots, lane) => slots.forEach(k => { if (k) KEYS[k] = lane; }));
  }
  function keyLabel(k) {
    if (!k) return '\u2014';
    const m = { arrowleft: '\u2190', arrowdown: '\u2193', arrowup: '\u2191', arrowright: '\u2192', ' ': 'SPACE', escape: 'ESC', enter: 'ENTER', backspace: '\u232b', tab: 'TAB' };
    return m[k] || k.toUpperCase();
  }
  const MODIFIERS = ['shift', 'control', 'alt', 'meta', 'capslock', 'dead', 'altgraph', 'os', 'contextmenu'];

  const $ = s => document.querySelector(s);
  let layer, cv, ctx, overlay, W = 0, H = 0, DPR = 1;
  let audio = null, raf = 0;
  let phase = 'closed';                   // closed | intro | count | play | paused | done
  let notes = [], pressedAt = [0, 0, 0, 0];
  let S = null;                           // run state
  let lastA = 0, lastP = 0, prevPos = 0, countStart = 0, pausedFrom = 'play';
  let listening = null;                   // { lane, slot } while waiting for a rebind key press
  const CHEAT_CODE = 'iwanttocheat1';     // type during the minigame: invincible, but no coins
  let cheat = false, cheatBuf = '';
  let inControls = false, controlsBack = null;

  /* ---------------- daily lock ---------------- */
  function todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  function doneToday() { return Save.d.rhythmLast === todayKey(); }
  function untilTomorrow() {
    const n = new Date(), t = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1);
    const m = Math.max(1, Math.round((t - n) / 60000));
    return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
  }
  function refreshButton() {
    const b = $('#rhythmBtn'); if (!b) return;
    if (doneToday()) {
      b.textContent = 'DAILY JAM \u2713 \u00b7 NEXT IN ' + untilTomorrow();
      b.classList.add('done');
    } else {
      b.textContent = 'DAILY JAM \u00b7 UP TO +1000 COINS';
      b.classList.remove('done');
    }
  }

  /* ---------------- setup ---------------- */
  function init() {
    if (layer) return;
    layer = $('#rhythm'); cv = $('#rhythmCv'); ctx = cv.getContext('2d'); overlay = $('#rhOverlay');
    $('#rhPauseBtn').onclick = () => togglePause();
    cv.addEventListener('pointerdown', e => {
      if (phase !== 'play') return;
      e.preventDefault();
      const lane = laneAtX(e.clientX);
      if (lane >= 0) press(lane);
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && phase === 'play') togglePause(); });
    window.addEventListener('blur', () => { if (phase === 'play') togglePause(); });
  }

  function open() {
    init();
    if (doneToday()) { UI.toast('Daily Jam done — come back tomorrow!', 'good'); return; }
    rebuildKeys(); setDiff(Save.d.rhythmDiff);
    Sound.resume();
    Sound.setMusic(false);
    UI.el.menu.classList.add('hidden');
    layer.classList.remove('hidden');
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKeyUp, true);
    if (!audio) {
      audio = new Audio(SONG_URL);
      audio.preload = 'auto';
      audio.volume = 0.9;
    }
    audio.pause(); audio.currentTime = 0;
    phase = 'intro';
    showIntro();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function close() {
    listening = null; inControls = false; cheat = false; cheatBuf = '';
    if (audio) audio.pause();
    phase = 'closed';
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKeyUp, true);
    layer.classList.add('hidden');
    overlay.classList.add('hidden');
    UI.el.menu.classList.remove('hidden');
    Sound.setMusic(Save.d.opts.music);
    UI.refreshStats();
  }

  /* ---------------- overlays ---------------- */
  function setOverlay(title, html, buttons) {
    $('#rhTitle').textContent = title;
    $('#rhText').innerHTML = html;
    const row = $('#rhButtons'); row.innerHTML = '';
    buttons.forEach(([label, cls, fn]) => {
      const b = document.createElement('button');
      b.className = cls; b.textContent = label;
      b.onclick = () => { Sound.sfx.button(); fn(); };
      row.appendChild(b);
    });
    overlay.classList.remove('hidden');
  }
  function keysHtml() {
    const ks = Save.d.rhythmKeys;
    const set = i => ks.map(l => keyLabel(l[i])).join(' ');
    const a = set(0), b = set(1);
    return '<span>' + a + '</span>' + (b.replace(/\u2014| /g, '') ? ' or <span>' + b + '</span>' : '') + ' or tap the lanes';
  }
  function diffHtml() {
    return '<div class="rh-diffs">' + DIFF_ORDER.map(k => {
      const d = DIFFS[k];
      return '<button class="rh-diff' + (D === d ? ' sel' : '') + '" data-diff="' + k + '" style="--dc:' + d.color + '">' +
        '<b>' + d.label + '</b><span>+' + d.reward + '</span></button>';
    }).join('') + '</div>';
  }
  function showIntro() {
    inControls = false;
    setOverlay('DAILY JAM',
      'Hit the arrows in time with the beat. Finish the song without running out of health to win <b>' + D.reward + ' coins</b> (once per day).<br>' +
      '<span class="rh-warn">Mashing keys with no arrow there drains your health!</span>' +
      diffHtml() +
      '<div class="rh-rate"><b style="color:' + RATING.sick.color + '">SICK</b> <b style="color:' + RATING.good.color + '">GOOD</b> <b style="color:' + RATING.bad.color + '">BAD</b> <b style="color:' + RATING.miss.color + '">FUCKED</b> (a miss)</div>' +
      '<div class="rh-keys">' + keysHtml() + '</div>',
      [['START', 'big-btn small', startSong], ['SETTINGS', 'mid-btn', () => showSettings(showIntro)], ['BACK', 'mid-btn ghost', close]]);
    $('#rhText').querySelectorAll('.rh-diff').forEach(b => {
      b.onclick = () => { Sound.sfx.button(); setDiff(b.dataset.diff); showIntro(); };
    });
  }
  function showSettings(back) {
    inControls = true; controlsBack = back;
    const html = '<div class="rh-set-h">SCROLL</div><div class="rh-seg">' +
      ['up', 'down'].map(k => '<button class="rh-opt' + (Save.d.rhythmScroll === k ? ' sel' : '') + '" data-scroll="' + k + '">' + (k === 'up' ? '\u2191 UPSCROLL' : '\u2193 DOWNSCROLL') + '</button>').join('') + '</div>' +
      '<div class="rh-set-h">ARROW STYLE</div><div class="rh-styles">' +
      STYLE_ORDER.map(k => '<button class="rh-style' + (Save.d.rhythmStyle === k ? ' sel' : '') + '" data-style="' + k + '"><canvas width="112" height="60"></canvas><span>' + STYLE_NAMES[k] + '</span></button>').join('') + '</div>';
    setOverlay('SETTINGS', html, [
      ['DONE', 'big-btn small', back],
      ['CONTROLS', 'mid-btn', () => showControls(() => showSettings(back))]
    ]);
    const root = $('#rhText');
    root.querySelectorAll('.rh-opt').forEach(b => { b.onclick = () => { Sound.sfx.button(); Save.d.rhythmScroll = b.dataset.scroll; Save.save(); showSettings(back); }; });
    root.querySelectorAll('.rh-style').forEach(b => {
      b.onclick = () => { Sound.sfx.button(); Save.d.rhythmStyle = b.dataset.style; Save.save(); showSettings(back); };
      // little live preview: an idle receptor and a note for two lanes
      const cv2 = b.querySelector('canvas'), c2 = cv2 && cv2.getContext && cv2.getContext('2d');
      if (c2) [[0, 3, false], [1, 2, false]].forEach(([i, lane], n) => {
        drawArrow(28 + n * 56, 30, 40, lane, COLORS[lane], '#ffffff', 1, false, c2, b.dataset.style);
      });
    });
  }
  function showPause() {
    inControls = false;
    setOverlay('PAUSED', 'Take a breath.', [
      ['RESUME', 'big-btn small', togglePause],
      ['SETTINGS', 'mid-btn', () => showSettings(showPause)],
      ['QUIT', 'mid-btn ghost', close]
    ]);
  }

  /* ---------------- rebinding ---------------- */
  function controlsHtml() {
    const ks = Save.d.rhythmKeys;
    let h = '<div class="rh-bind-hint">Click a key box, then press the key you want.<br>Backspace clears a box, Esc cancels.</div><div class="rh-bind">';
    ks.forEach((slots, lane) => {
      h += '<div class="rh-bind-row"><span class="rh-bind-lane" style="color:' + COLORS[lane] + '">' + LANE_NAMES[lane] + '</span>';
      slots.forEach((k, slot) => {
        const on = listening && listening.lane === lane && listening.slot === slot;
        h += '<button class="rh-keybtn' + (on ? ' listening' : '') + '" data-lane="' + lane + '" data-slot="' + slot + '">' + (on ? 'PRESS A KEY' : keyLabel(k)) + '</button>';
      });
      if (!slots.some(Boolean)) h += '<span class="rh-bind-warn">tap only</span>';
      h += '</div>';
    });
    return h + '</div>';
  }
  function showControls(back) {
    inControls = true; controlsBack = back;
    setOverlay('CONTROLS', controlsHtml(), [
      ['DONE', 'big-btn small', () => { listening = null; back(); }],
      ['RESET', 'mid-btn ghost', () => {
        listening = null;
        Save.d.rhythmKeys = structuredClone(DEFAULT_KEYS); Save.save(); rebuildKeys();
        showControls(back);
      }]
    ]);
    rewireKeyBtns();
  }
  function rewireKeyBtns() {
    $('#rhText').querySelectorAll('.rh-keybtn').forEach(b => {
      b.onclick = () => {
        Sound.sfx.button();
        listening = { lane: +b.dataset.lane, slot: +b.dataset.slot };
        $('#rhText').innerHTML = controlsHtml(); rewireKeyBtns();
      };
    });
  }
  function bindKey(k) {
    const { lane, slot } = listening; listening = null;
    if (k !== '') {
      // a key can only live in one box: pull it out of wherever it was
      Save.d.rhythmKeys.forEach(l => l.forEach((x, i) => { if (x === k) l[i] = ''; }));
    }
    Save.d.rhythmKeys[lane][slot] = k;
    Save.save(); rebuildKeys();
    $('#rhText').innerHTML = controlsHtml(); rewireKeyBtns();
  }

  /* ---------------- run control ---------------- */
  function startSong() {
    overlay.classList.add('hidden');
    const chart = (RHYTHM_CHART.difficulties && RHYTHM_CHART.difficulties[Save.d.rhythmDiff]) || RHYTHM_CHART.notes;
    notes = chart.map(n => ({ t: n[0], lane: n[1], hit: false, missed: false, flash: 0 }));
    S = {
      health: HEALTH.start, score: 0, combo: 0, maxCombo: 0,
      counts: { sick: 0, good: 0, bad: 0, miss: 0, spam: 0 },
      popups: [], pStateT: 0, pState: 'idle', pDur: 1, oppT: 0, oState: 'idle', oStateT: 0,
      glow: [0, 0, 0, 0], flash: [null, null, null, null]
    };
    pressedAt = [0, 0, 0, 0];
    audio.pause(); audio.currentTime = 0;
    lastA = 0; lastP = performance.now(); prevPos = 0;
    countStart = performance.now();
    phase = 'count';
  }

  function beginPlayback() {
    const p = audio.play();
    if (p && p.catch) p.catch(() => { UI.toast("Couldn't play the song", 'bad'); close(); });
    lastA = audio.currentTime * 1000; lastP = performance.now(); prevPos = 0;
    phase = 'play';
  }

  function togglePause() {
    if (phase === 'play') {
      audio.pause(); phase = 'paused';
      showPause();
    } else if (phase === 'paused') {
      overlay.classList.add('hidden');
      countStart = performance.now();
      phase = 'resume';                 // short 3-2-1 before audio resumes
    }
  }

  function finish(win) {
    audio.pause(); phase = 'done';
    const c = S.counts, total = notes.length;
    const acc = total ? (c.sick + c.good * .7 + c.bad * .4) / total : 0;
    const rank = acc >= .95 ? 'S' : acc >= .85 ? 'A' : acc >= .7 ? 'B' : 'C';
    const stats = '<div class="rh-stats">' +
      '<div><span>Score</span><b>' + U.fmt(S.score) + '</b></div>' +
      '<div><span>Accuracy</span><b>' + (acc * 100).toFixed(1) + '%</b></div>' +
      '<div><span>Max combo</span><b>' + S.maxCombo + '</b></div>' +
      '<div><span>Sick / Good / Bad / Fucked</span><b>' + c.sick + ' / ' + c.good + ' / ' + c.bad + ' / ' + c.miss + '</b></div>' +
      '<div><span>Stray presses</span><b>' + c.spam + '</b></div>' +
      '<div><span>Difficulty</span><b style="color:' + D.color + '">' + D.label + '</b></div>' +
      '</div>';
    if (win && cheat) {
      setOverlay('SONG CLEARED!  RANK ' + rank,
        stats + '<div class="rh-note">Cheat was on \u2014 no coins earned.</div>',
        [['BACK TO MENU', 'big-btn small', close]]);
    } else if (win) {
      Save.addCoins(D.reward);
      Save.d.rhythmLast = todayKey();
      Save.d.rhythmBest = Math.max(Save.d.rhythmBest || 0, S.score);
      Save.save();
      UI.refreshStats();
      Sound.sfx.mission && Sound.sfx.mission();
      setOverlay('SONG CLEARED!  RANK ' + rank,
        stats + '<div class="rh-reward">+' + D.reward + ' COINS</div><div class="rh-note">Come back tomorrow for another jam.</div>',
        [['BACK TO MENU', 'big-btn small', close]]);
    } else {
      setOverlay('YOU BLEW IT', stats + '<div class="rh-note">Health ran out — no coins spent, try again!</div>',
        [['RETRY', 'big-btn small', () => { audio.currentTime = 0; startSong(); }], ['DIFFICULTY', 'mid-btn', () => { phase = 'intro'; showIntro(); }], ['BACK', 'mid-btn ghost', close]]);
    }
  }

  /* ---------------- timing ---------------- */
  function songPos() {
    const a = audio.currentTime * 1000, now = performance.now();
    if (a !== lastA) { lastA = a; lastP = now; }
    const p = lastA + (audio.paused ? 0 : Math.min(now - lastP, 120));
    prevPos = Math.max(prevPos, p);
    return prevPos;
  }

  /* ---------------- input ---------------- */
  function onKey(e) {
    const k = e.key.toLowerCase();
    if (phase === 'closed') return;
    e.stopImmediatePropagation();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    if (listening) {                              // rebinding: next key press goes to the chosen box
      if (e.repeat || MODIFIERS.includes(k)) return;
      if (k === 'escape') { listening = null; $('#rhText').innerHTML = controlsHtml(); rewireKeyBtns(); return; }
      bindKey(k === 'backspace' ? '' : k);
      return;
    }
    if (!e.repeat && k.length === 1) {            // cheat code listener
      cheatBuf = (cheatBuf + k).slice(-CHEAT_CODE.length);
      if (!cheat && cheatBuf === CHEAT_CODE) {
        cheat = true;
        UI.toast('Cheat on: invincible (no coins)', 'good');
      }
    }
    if (inControls) { if (k === 'escape') controlsBack(); return; }
    if (k === 'escape' || (k === 'p' && !(k in KEYS))) { if (phase === 'play' || phase === 'paused') togglePause(); return; }
    if (e.repeat) return;
    if (phase === 'play' && k in KEYS) press(KEYS[k]);
  }
  function onKeyUp(e) {
    if (phase === 'closed') return;
    e.stopImmediatePropagation();
    const k = e.key.toLowerCase();
    if (k in KEYS) pressedAt[KEYS[k]] = 0;
  }

  function press(lane) {
    pressedAt[lane] = performance.now();
    S.glow[lane] = 1;
    const pos = songPos();
    let best = null, bd = 1e9;
    for (const n of notes) {
      if (n.lane !== lane || n.hit || n.missed) continue;
      const d = Math.abs(n.t - pos);
      if (n.t - pos > WIN.miss) break;
      if (d < bd) { bd = d; best = n; }
    }
    if (!best || bd > WIN.miss) { strayPress(lane); return; }   // nothing to hit: costs health
    best.hit = true;
    const r = bd <= WIN.sick ? 'sick' : bd <= WIN.good ? 'good' : 'bad';
    S.counts[r]++;
    S.health = Math.min(100, S.health + HEALTH[r]);
    S.score += r === 'sick' ? 350 : r === 'good' ? 200 : 50;
    S.combo = r === 'bad' ? 0 : S.combo + 1;
    S.maxCombo = Math.max(S.maxCombo, S.combo);
    rate(r, lane);
  }

  /* pressing a lane with no arrow in range: drains health, breaks the combo and
     briefly stumbles, so button mashing loses instead of farming ratings */
  function strayPress(lane) {
    S.counts.spam++;
    S.health = Math.max(0, S.health + D.ghost);
    S.combo = 0; S.score = Math.max(0, S.score - 25);
    S.popups.push({ text: 'NO!', color: '#c9c9d6', lane, t: 0 });
    if (S.pStateT <= 0 || S.pState === 'idle') { S.pState = 'stumble'; S.pStateT = S.pDur = 180; }
  }

  /* one place for everything a rating causes: popup, lane flash, and how the
     characters react (each rating gets its own animation) */
  function rate(r, lane) {
    const R = RATING[r];
    S.popups.push({ text: R.text, color: R.color, lane, t: 0 });
    S.flash[lane] = { color: R.color, t: 0 };
    // player: sick = flip, good = cheer, bad = stumble, fucked = crash
    S.pState = r === 'sick' ? 'roll' : r === 'good' ? 'cheer' : r === 'bad' ? 'stumble' : 'crash';
    S.pStateT = S.pDur = R.anim;
    // opponent: gloats when you're fucked, gets rattled by a sick hit
    if (r === 'miss') { S.oState = 'cheer'; S.oStateT = 520; }
    else if (r === 'sick') { S.oState = 'stumble'; S.oStateT = 300; }
  }

  function laneMetrics() {
    const lw = Math.max(58, Math.min(W * 0.21, 100));
    const total = lw * 4;
    const gap = Math.max(84, H * 0.15), down = Save.d.rhythmScroll === 'down';
    return { lw, x0: (W - total) / 2, recY: down ? H - gap : gap, down };
  }
  function laneAtX(x) {
    const m = laneMetrics();
    return Math.max(0, Math.min(3, Math.floor((x - m.x0) / m.lw)));
  }

  /* ---------------- update ---------------- */
  function update(dt) {
    if (phase === 'count' || phase === 'resume') {
      if (performance.now() - countStart >= 2000) {
        if (phase === 'count') beginPlayback();
        else { audio.play(); lastA = audio.currentTime * 1000; lastP = performance.now(); phase = 'play'; }
      }
      return;
    }
    if (phase !== 'play') return;
    const pos = songPos();
    for (const n of notes) {
      if (n.hit || n.missed) continue;
      if (n.t < pos - WIN.miss) {
        n.missed = true;
        S.counts.miss++; S.combo = 0;
        S.health += D.miss;
        rate('miss', n.lane);
      } else if (n.t > pos) break;
    }
    S.pStateT -= dt; if (S.pStateT <= 0) S.pState = 'idle';
    S.oStateT -= dt; if (S.oStateT <= 0) S.oState = 'idle';
    S.flash.forEach(f => { if (f) f.t += dt; });
    for (let i = 0; i < 4; i++) S.glow[i] = Math.max(0, S.glow[i] - dt / 140);
    S.popups.forEach(p => p.t += dt);
    S.popups = S.popups.filter(p => p.t < 700);
    if (cheat) S.health = 100;                   // cheat: can't die
    if (S.health <= 0) { S.health = 0; finish(false); return; }
    if (pos >= RHYTHM_CHART.lengthMs - 400 || audio.ended) finish(true);
  }

  /* ---------------- drawing ---------------- */
  function arrowPath(c, s) {
    c.beginPath();
    c.moveTo(0, -s * .5);
    c.lineTo(s * .5, s * .06);
    c.lineTo(s * .2, s * .06);
    c.lineTo(s * .2, s * .5);
    c.lineTo(-s * .2, s * .5);
    c.lineTo(-s * .2, s * .06);
    c.lineTo(-s * .5, s * .06);
    c.closePath();
  }
  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  const ROT = [-Math.PI / 2, Math.PI, 0, Math.PI / 2];
  const EMOJI = ['\u{1F448}', '\u{1F447}', '\u{1F446}', '\u{1F449}'];   // pointing hands: left, down, up, right
  const STYLE_ORDER = ['arrow', 'circle', 'inverted', 'emoji', 'amongus', 'bar', 'box'];
  const STYLE_NAMES = { arrow: 'Arrows', circle: 'Circles', inverted: 'Inverted', emoji: 'Emojis', amongus: 'Crewmates', bar: 'Bars', box: 'Boxes' };

  /* one function draws every note/receptor style. `idle` marks an un-pressed
     receptor (dim); `c` lets the settings screen reuse it for small previews */
  function drawArrow(x, y, s, lane, fill, stroke, alpha = 1, idle = false, c = ctx, style = Save.d.rhythmStyle) {
    c.save(); c.translate(x, y);
    c.globalAlpha = alpha;
    c.lineJoin = 'round'; c.lineWidth = Math.max(3, s * .07);
    c.fillStyle = fill; c.strokeStyle = stroke;
    switch (style) {
      case 'circle':
        c.beginPath(); c.arc(0, 0, s * .5, 0, Math.PI * 2); c.fill(); c.stroke();
        c.beginPath(); c.arc(-s * .1, -s * .12, s * .22, Math.PI * 1.1, Math.PI * 1.75);
        c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = Math.max(2, s * .06); c.lineCap = 'round'; c.stroke();
        break;
      case 'inverted':               // colors swapped: bright body, colored outline
        c.rotate(ROT[lane]); arrowPath(c, s);
        c.fillStyle = idle ? 'rgba(190,196,230,.9)' : '#ffffff';
        c.fill();
        c.strokeStyle = idle ? 'rgba(40,44,70,.95)' : COLORS[lane]; c.lineWidth = Math.max(4, s * .12); c.stroke();
        break;
      case 'emoji':
        c.beginPath(); c.arc(0, 0, s * .5, 0, Math.PI * 2); c.fill(); c.stroke();
        c.font = Math.round(s * .62) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.globalAlpha = alpha * (idle ? .5 : 1);
        c.fillText(EMOJI[lane], 0, s * .04);
        break;
      case 'amongus': {
        const body = idle ? 'rgba(40,44,70,.85)' : fill, line = stroke;
        c.fillStyle = body; c.strokeStyle = line;
        // backpack sits on the side opposite the way the crewmate faces
        if (lane === 3 || lane === 1) { rr(c, -s * .5, -s * .16, s * .24, s * .46, s * .08); c.fill(); c.stroke(); }
        else if (lane === 0) { rr(c, s * .26, -s * .16, s * .24, s * .46, s * .08); c.fill(); c.stroke(); }
        else { rr(c, -s * .3, -s * .34, s * .6, s * .5, s * .12); c.fill(); c.stroke(); }   // seen from behind
        // legs
        rr(c, -s * .24, s * .16, s * .19, s * .32, s * .07); c.fill(); c.stroke();
        rr(c, s * .05, s * .16, s * .19, s * .32, s * .07); c.fill(); c.stroke();
        // body
        rr(c, -s * .27, -s * .46, s * .54, s * .7, s * .26); c.fill(); c.stroke();
        // visor (none when facing away)
        if (lane !== 2) {
          const vx = lane === 0 ? -s * .1 : lane === 3 ? s * .1 : 0;
          c.beginPath(); c.ellipse ? c.ellipse(vx, -s * .22, s * .19, s * .12, 0, 0, Math.PI * 2) : c.arc(vx, -s * .22, s * .14, 0, Math.PI * 2);
          c.fillStyle = idle ? 'rgba(150,170,210,.6)' : '#a8e6ff'; c.fill(); c.strokeStyle = line; c.stroke();
        }
        break;
      }
      case 'bar':
        rr(c, -s * .5, -s * .17, s, s * .34, s * .12); c.fill(); c.stroke();
        c.fillStyle = 'rgba(255,255,255,.35)'; rr(c, -s * .42, -s * .1, s * .84, s * .08, s * .04); c.fill();
        break;
      case 'box':
        rr(c, -s * .42, -s * .42, s * .84, s * .84, s * .09); c.fill(); c.stroke();
        c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = Math.max(2, s * .05);
        rr(c, -s * .28, -s * .28, s * .56, s * .56, s * .05); c.stroke();
        break;
      default:                       // classic arrow
        c.rotate(ROT[lane]); arrowPath(c, s);
        c.fill(); c.stroke();
    }
    c.restore();
  }

  function draw(now) {
    const pos = S ? prevPos : 0;
    const beatMs = 60000 / RHYTHM_CHART.bpm;
    const beatF = ((pos - RHYTHM_CHART.offsetMs) / beatMs) % 1;
    const pulse = phase === 'play' ? Math.pow(1 - (beatF < 0 ? beatF + 1 : beatF), 3) : 0;

    // background
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1a1240'); g.addColorStop(.6, '#2b1a5c'); g.addColorStop(1, '#0d0a24');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const rg = ctx.createRadialGradient(W / 2, H * .55, 20, W / 2, H * .55, Math.max(W, H) * .7);
    rg.addColorStop(0, 'rgba(255,120,200,' + (.12 + pulse * .16) + ')'); rg.addColorStop(1, 'rgba(255,120,200,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    // stage floor
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, H * .86, W, H * .14);

    // characters
    const t = now / 1000;
    const sc = Math.max(.6, Math.min(H * .4 / 200, 1.7));
    const pId = Save.d.character, oId = pId === 'classic' ? 'ferrick' : 'classic';
    const bop = 1 + pulse * .04;
    const oppCheer = phase === 'play' && Math.floor((pos - RHYTHM_CHART.offsetMs) / beatMs) % 4 === 0 && beatF < .3;
    const oState = S && S.oStateT > 0 ? S.oState : (oppCheer ? 'cheer' : 'idle');
    ctx.save(); ctx.translate(W * .2, H * .94); ctx.scale(1, bop); ctx.translate(-W * .2, -H * .94);
    Riggy.draw(ctx, { x: W * .2, y: H * .94, scale: sc, skinId: oId, state: oState, t, phase: t * 6, extra: { turn: 1 } });
    ctx.restore();
    // player reaction: progress k (0..1) drives the flip / crash animations
    const pState = S ? S.pState : 'idle';
    const k = S && S.pDur ? Math.max(0, Math.min(1, 1 - S.pStateT / S.pDur)) : 0;
    const pExtra = { turn: 1 };
    let py = H * .94;
    if (pState === 'roll') {                       // SICK: hop + full flip
      const arc = Math.sin(k * Math.PI);
      pExtra.rollT = k; pExtra.shadowScale = 1 - arc * .5;
      py -= arc * 70 * sc;
    } else if (pState === 'crash') {               // FUCKED: fall over, then get back up
      pExtra.crashT = k < .7 ? Math.min(1, k / .4) : Math.max(0, (1 - k) / .3);
    }
    ctx.save(); ctx.translate(W * .8, H * .94); ctx.scale(1, bop); ctx.translate(-W * .8, -H * .94);
    Riggy.draw(ctx, { x: W * .8, y: py, scale: sc, skinId: pId, state: pState, t, phase: t * 6, extra: pExtra });
    ctx.restore();

    // lane backing
    const m = laneMetrics();
    ctx.fillStyle = 'rgba(0,0,0,.42)';
    ctx.fillRect(m.x0 - 6, 0, m.lw * 4 + 12, H);

    const size = m.lw * .84;
    // receptors
    for (let i = 0; i < 4; i++) {
      const cx = m.x0 + m.lw * (i + .5);
      const down = S && (S.glow[i] > 0 || pressedAt[i] > 0);
      if (down) drawArrow(cx, m.recY, size * (1 + .06 * (S ? S.glow[i] : 0)), i, COLORS[i], '#ffffff', .95);
      else drawArrow(cx, m.recY, size, i, 'rgba(40,44,70,.85)', 'rgba(190,196,230,.9)', 1, true);
      // rating ring: flashes in the color of how well the arrow was hit
      const fl = S && S.flash[i];
      if (fl && fl.t < 320) {
        const fk = fl.t / 320;
        ctx.save(); ctx.globalAlpha = (1 - fk) * .9;
        ctx.strokeStyle = fl.color; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(cx, m.recY, size * (.55 + fk * .5), 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }
    // per-arrow rating text floating off the receptor
    if (S) {
      S.popups.forEach(p => {
        if (p.lane === undefined) return;
        const pk = p.t / 700;
        const cx = m.x0 + m.lw * (p.lane + .5);
        ctx.save(); ctx.globalAlpha = 1 - pk * pk;
        ctx.font = '900 ' + Math.max(12, Math.round(m.lw * .2)) + 'px "Trebuchet MS", sans-serif';
        ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.fillStyle = p.color;
        const ty = m.down ? m.recY + size * .82 + pk * 14 : m.recY - size * .62 - pk * 14;
        ctx.strokeText(p.text, cx, ty); ctx.fillText(p.text, cx, ty);
        ctx.restore();
      });
    }

    // notes
    if (S) {
      const speed = ((m.down ? m.recY : H - m.recY) + size) / TRAVEL_MS;
      for (const n of notes) {
        if (n.hit) continue;
        const y = m.down ? m.recY - (n.t - pos) * speed : m.recY + (n.t - pos) * speed;
        if (m.down ? y < -size : y > H + size) break;
        if (m.down ? y > H + size : y < -size) continue;
        const cx = m.x0 + m.lw * (n.lane + .5);
        drawArrow(cx, y, size, n.lane, COLORS[n.lane], '#ffffff', n.missed ? .3 : 1);
      }
    }

    // progress bar
    if (S) {
      const pr = Math.max(0, Math.min(1, pos / RHYTHM_CHART.lengthMs));
      ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(0, 0, W, 5);
      ctx.fillStyle = '#ffc21c'; ctx.fillRect(0, 0, W * pr, 5);
    }

    // health bar + icons
    if (S) {
      const bw = Math.min(W * .7, 420), bx = (W - bw) / 2, by = m.down ? 18 : H - 46, bh = 16;
      ctx.fillStyle = '#e5262b'; ctx.fillRect(bx, by, bw, bh);
      const px = bx + bw * (1 - S.health / 100);
      ctx.fillStyle = '#3ddc6b'; ctx.fillRect(px, by, bx + bw - px, bh);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 4; ctx.strokeRect(bx, by, bw, bh);
      Riggy.drawBust(ctx, px + 16, by + bh / 2, 17, pId, t);
      Riggy.drawBust(ctx, px - 16, by + bh / 2, 17, oId, t);
      const total = S.counts.sick + S.counts.good + S.counts.bad + S.counts.miss;
      const acc = total ? (S.counts.sick + S.counts.good * .7 + S.counts.bad * .4) / total * 100 : 100;
      ctx.font = '800 15px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.fillStyle = '#fff';
      const line = 'Score ' + S.score + '   Misses ' + S.counts.miss + '   Acc ' + acc.toFixed(0) + '%';
      ctx.strokeText(line, W / 2, by + bh + 20); ctx.fillText(line, W / 2, by + bh + 20);
      if (cheat) {
        ctx.fillStyle = '#ff3b4d';
        ctx.strokeText('INVINCIBLE (NO COINS)', W / 2, by + bh + 40); ctx.fillText('INVINCIBLE (NO COINS)', W / 2, by + bh + 40);
        ctx.fillStyle = '#fff';
      }

      // rating popups + combo
      S.popups.forEach(p => {
        const k = p.t / 700;
        ctx.save(); ctx.globalAlpha = 1 - k * k;
        ctx.font = '900 ' + Math.round(30 + (1 - k) * 8) + 'px "Trebuchet MS", sans-serif';
        ctx.textAlign = 'center'; ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.fillStyle = p.color;
        const y = H * .5 - k * 26;
        ctx.strokeText(p.text, W / 2, y); ctx.fillText(p.text, W / 2, y);
        ctx.restore();
      });
      if (S.combo >= 5) {
        ctx.font = '900 26px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center';
        ctx.lineWidth = 5; ctx.strokeStyle = '#000'; ctx.fillStyle = '#ffd84a';
        ctx.strokeText(S.combo + ' COMBO', W / 2, H * .5 + 34); ctx.fillText(S.combo + ' COMBO', W / 2, H * .5 + 34);
      }
    }

    // countdown
    if (phase === 'count' || phase === 'resume') {
      const el = performance.now() - countStart;
      const n = 3 - Math.floor(el / 667);
      if (n >= 1 && n <= 3) {
        const k = (el % 667) / 667;
        ctx.save(); ctx.globalAlpha = 1 - k * .6;
        ctx.font = '900 ' + Math.round(120 - k * 20) + 'px "Trebuchet MS", sans-serif';
        ctx.textAlign = 'center'; ctx.lineWidth = 10; ctx.strokeStyle = '#000'; ctx.fillStyle = '#fff';
        ctx.strokeText(String(n), W / 2, H * .5); ctx.fillText(String(n), W / 2, H * .5);
        ctx.restore();
      }
    }
  }

  let lastFrame = 0;
  function frame(now) {
    if (phase === 'closed') return;
    const w = window.innerWidth, h = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w !== W || h !== H || dpr !== DPR) {
      W = w; H = h; DPR = dpr;
      cv.width = Math.floor(W * DPR); cv.height = Math.floor(H * DPR);
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
    }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const dt = Math.min(50, now - (lastFrame || now)); lastFrame = now;
    update(dt);
    draw(now);
    raf = requestAnimationFrame(frame);
  }

  return { open, close, refreshButton, doneToday };
})();
