/* ============================================================
   admin.js — hidden admin panel.

   Open it: type the admin code anywhere in the game, then press ENTER.
   (Step 2: a PIN prompt appears — type the PIN and press Enter.
   Both the code and the PIN are only stored as hashes below, so it is not sitting in
   plain text in view-source. To change it, run in the console:
       AdminPanel.hash('my new code')
   and paste the result into CODE_HASH, and set CODE_LEN to its length.)

   Everything that touches progress goes through Save.d + Save.save(), so
   the save stays correctly signed and the anti-tamper lockdown never fires.
   Live-run tweaks go through Game.admin (see game.js) and last for the
   session only.
   ============================================================ */
'use strict';

const AdminPanel = (() => {

  const CODE_HASH = '13lvsia.1wm4r42';
  const CODE_LEN = 16;
  const PIN_HASH = '173a6ld.36a7ez';        // second factor: after the code + Enter you must type the PIN + Enter
  const DEFAULT_HOOKS = { god: false, noObstacles: false, timeScale: 1, speedMul: 1, jumpMul: 1, gravMul: 1, coinMul: 1, biome: null, freezeTrains: false, gapMul: 1, puMul: 1, extraJumps: 0, auto: false, hidePlayer: false, powerMul: 1, goalMul: 1, playerScale: 1, headStart: 0 };
  const hash = s => {
    let a = 0x243f6a88, b = 0x85a308d3;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      a = Math.imul(a ^ c, 0x9e3779b1); b = Math.imul(b ^ c, 0x85ebca6b);
      a ^= b >>> 13; b ^= a >>> 11;
    }
    a = Math.imul(a ^ (a >>> 16), 0x7feb352d); b = Math.imul(b ^ (b >>> 15), 0x846ca68b);
    return (a >>> 0).toString(36) + '.' + (b >>> 0).toString(36);
  };

  const D = () => Save.d;                       // never cache: Save.reset() swaps the object
  const H = () => Game.admin.hooks;
  const S = () => Game.state;
  const MODES_LIST = ['easy', 'normal', 'hard', 'insane'];
  const PU_KINDS = ['magnet', 'jetpack', 'x2', 'sneakers', 'shield'];
  const PU_NAMES = { magnet: 'Coin Magnet', jetpack: 'Jetpack / Fly', x2: 'Score x2', sneakers: 'Super Sneakers', shield: 'Shield' };
  const clamp = U.clamp;

  /* ---------------- tiny DOM helper ---------------- */
  const h = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    }
    kids.flat(Infinity).forEach(c => { if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(c)); });
    return n;
  };

  const LOG = [], ERRS = [];
  const logIt = m => { LOG.unshift(new Date().toLocaleTimeString() + '  ' + m); if (LOG.length > 250) LOG.pop(); };
  window.addEventListener('error', e => { ERRS.unshift(new Date().toLocaleTimeString() + '  ' + e.message); if (ERRS.length > 50) ERRS.pop(); });
  const toast = (m, k = 'gold') => { logIt(m); UI.toast(m, k); };
  const click = () => { try { Sound.sfx.button(); } catch (e) { /* audio not ready */ } };

  /* re-sync every game screen with the save */
  function sync() {
    UI.refreshStats(); UI.buildModes(); UI.buildCharacters(); UI.buildShop();
    UI.buildMissions(); UI.bindSettings(); UI.buildLevels();
  }

  /* run a save-changing action: persist, refresh the game UI and this tab */
  function act(fn, msg, kind) {
    try { if (fn() === false) return; }
    catch (e) { console.error(e); toast('Admin error: ' + e.message, 'bad'); return; }
    Save.save(); sync(); render();
    click();
    if (msg) toast(msg, kind || 'good');
  }

  /* ---------------- reusable controls ---------------- */
  const sec = (t, hint) => h('div', { class: 'adm-sec' }, h('b', { text: t }), hint ? h('small', { text: hint }) : null);
  const note = t => h('div', { class: 'adm-note', text: t });

  function btn(label, fn, cls = '') { return h('button', { class: 'adm-btn ' + cls, type: 'button', onclick: fn, text: label }); }
  const btns = list => h('div', { class: 'adm-btnrow' }, list.map(([l, f, c]) => btn(l, f, c)));

  /* number box: commits on change, clamps, no tab re-render so keyboard flow survives */
  function num(label, get, set, min, max, step = 1) {
    const inp = h('input', { type: 'number', min, max, step, value: get() });
    inp.addEventListener('change', () => {
      let v = Number(inp.value);
      if (!isFinite(v)) v = get();
      v = clamp(step >= 1 ? Math.round(v) : v, min, max);
      try { set(v); } catch (e) { console.error(e); }
      Save.save(); sync(); inp.value = get(); click();
    });
    return h('label', { class: 'adm-row' }, h('span', { text: label }), inp);
  }

  function select(label, options, get, set) {
    const s = h('select', {}, options.map(([v, t]) => h('option', { value: v, text: t })));
    s.value = String(get());
    s.addEventListener('change', () => set(s.value));
    return h('label', { class: 'adm-row' }, h('span', { text: label }), s);
  }

  /* switch styled like the game's own settings toggles */
  function toggle(label, get, set, hint) {
    const inp = h('input', { type: 'checkbox' });
    inp.checked = !!get();
    inp.addEventListener('change', () => { set(inp.checked); click(); });
    return h('label', { class: 'toggle-row adm-toggle' }, h('span', {}, label, hint ? h('small', { text: hint }) : null), inp, h('i'));
  }

  function slider(label, min, max, step, get, set, fmt = v => v, def) {
    const out = h('b', { text: fmt(get()) });
    const inp = h('input', { type: 'range', min, max, step, value: get() });
    inp.addEventListener('input', () => { const v = Number(inp.value); set(v); out.textContent = fmt(v); });
    const reset = def === undefined ? null : h('button', {
      class: 'adm-mini', type: 'button', title: 'Reset', text: '↺',
      onclick: () => { set(def); inp.value = def; out.textContent = fmt(def); click(); }
    });
    return h('div', { class: 'adm-slider' }, h('div', { class: 'adm-slider-top' }, h('span', { text: label }), out, reset), inp);
  }

  /* ============================================================
     TABS
     ============================================================ */

  /* ---------- PLAYER ---------- */
  function tabPlayer() {
    const out = [];
    out.push(sec('Wallet'));
    out.push(num('Coins', () => D().coins, v => { D().coins = v; }, 0, 999999999));
    out.push(btns([
      ['+1K', () => act(() => Save.addCoins(1000), '+1,000 coins')],
      ['+10K', () => act(() => Save.addCoins(10000), '+10,000 coins')],
      ['+100K', () => act(() => Save.addCoins(100000), '+100,000 coins')],
      ['+1M', () => act(() => Save.addCoins(1000000), '+1,000,000 coins')],
      ['MAX', () => act(() => { D().coins = 999999999; }, 'Coins maxed', 'gold'), 'gold'],
      ['ZERO', () => act(() => { D().coins = 0; }, 'Coins zeroed', 'bad'), 'red']
    ]));
    out.push(num('Hoverboards', () => D().hoverboards, v => { D().hoverboards = v; }, 0, 9999));

    out.push(sec('Loadout'));
    out.push(select('Character', CHARACTERS.map(c => [c.id, c.name + (D().owned.includes(c.id) ? '' : ' (locked)')]),
      () => D().character,
      v => act(() => { const d = D(); if (!d.owned.includes(v)) d.owned.push(v); d.character = v; }, 'Character equipped')));
    out.push(select('Hoverboard', BOARDS.map(b => [b.id, b.name + (D().ownedBoards.includes(b.id) ? '' : ' (locked)')]),
      () => D().board,
      v => act(() => { const d = D(); if (!d.ownedBoards.includes(v)) d.ownedBoards.push(v); d.board = v; }, 'Board equipped')));
    out.push(select('Difficulty', MODES_LIST.map(m => [m, MODES[m].name]),
      () => D().mode, v => act(() => { D().mode = v; }, 'Difficulty: ' + MODES[v].name)));

    out.push(sec('Progress'));
    out.push(num('Riggy rank', () => D().rank, v => { D().rank = v; }, 1, 9999));
    out.push(num('Best score (overall)', () => D().best, v => { D().best = v; }, 0, 2e9));
    out.push(num('Best distance (m)', () => D().bestDist, v => { D().bestDist = v; }, 0, 1e7));
    out.push(num('Runs played', () => D().runs, v => { D().runs = v; }, 0, 1e7));
    MODES_LIST.forEach(m => out.push(num('Best · ' + MODES[m].name, () => (D().bestByMode || {})[m] || 0,
      v => { (D().bestByMode || (D().bestByMode = {}))[m] = v; }, 0, 2e9)));

    out.push(sec('Lifetime stats'));
    [['Total coins earned', 'totalCoins'], ['Total distance (m)', 'totalDist'], ['Total jumps', 'totalJumps'],
      ['Total rolls', 'totalRolls'], ['Total tricks', 'totalTricks'], ['Near misses', 'nearMisses'], ['Second chances used', 'revives']]
      .forEach(([l, k]) => out.push(num(l, () => D()[k] || 0, v => { D()[k] = v; }, 0, 2e9)));

    out.push(sec('Quick add'));
    let custom = 5000;
    out.push(h('label', { class: 'adm-row' }, h('span', { text: 'Add custom coins' }),
      h('input', { type: 'number', min: 0, max: 999999999, step: 1, value: custom, onchange: e => { custom = clamp(Math.round(Number(e.target.value) || 0), 0, 999999999); e.target.value = custom; } })));
    out.push(btns([
      ['ADD', () => act(() => Save.addCoins(custom), '+' + U.fmt(custom) + ' coins')],
      ['TESTER PACK', () => act(() => { unlockEverything(); const d = D(); d.coins = Math.max(d.coins, 10000000); d.hoverboards = 99; }, 'Tester pack: everything + 10M coins + 99 boards', 'gold'), 'gold']
    ]));

    out.push(sec('Daily Jam & misc'));
    out.push(num('Daily Jam best score', () => D().rhythmBest || 0, v => { D().rhythmBest = v; }, 0, 2e9));
    out.push(btns([
      ['RESET TODAY\'S JAM', () => act(() => { D().rhythmLast = ''; }, 'Daily Jam can be played again', 'gold'), 'gold'],
      ['MARK TUTORIAL SEEN', () => act(() => { D().seenTutorial = true; }, 'Tutorial marked as seen')]
    ]));

    out.push(sec('Shortcuts'));
    out.push(btns([
      ['UNLOCK EVERYTHING', () => act(unlockEverything, 'Everything unlocked, maxed and 3-starred', 'gold'), 'gold wide']
    ]));
    return out;
  }

  function unlockEverything() {
    const d = D();
    d.owned = CHARACTERS.map(c => c.id);
    d.secretsFound = CHARACTERS.filter(c => c.secret).map(c => c.id);
    d.ownedBoards = BOARDS.map(b => b.id);
    UPGRADES.forEach(u => { d.upgrades[u.id] = u.max; });
    MODES_LIST.forEach(m => { d.levels[m] = { unlocked: Levels.COUNT, stars: Array(Levels.COUNT).fill(3) }; });
  }

  /* ---------- UNLOCKS ---------- */
  function tabUnlocks() {
    const out = [];
    out.push(sec('Characters'));
    out.push(btns([
      ['UNLOCK ALL', () => act(() => { const d = D(); d.owned = CHARACTERS.map(c => c.id); d.secretsFound = CHARACTERS.filter(c => c.secret).map(c => c.id); }, 'All characters unlocked', 'gold'), 'gold'],
      ['LOCK ALL', () => act(() => { const d = D(); d.owned = ['classic']; d.character = 'classic'; }, 'Only Classic Riggy left', 'bad'), 'red']
    ]));
    CHARACTERS.forEach(c => {
      const own = D().owned.includes(c.id), eq = D().character === c.id;
      out.push(h('div', { class: 'adm-item' + (own ? ' on' : '') },
        h('div', { class: 'adm-item-main' }, h('b', { text: c.name + (c.admin ? ' · ADMIN ONLY' : c.secret ? ' ★ secret' : '') }), h('small', { text: c.perk })),
        btn(own ? 'OWNED' : 'OWN IT', () => act(() => {
          const d = D();
          if (d.owned.includes(c.id)) {
            if (c.id === 'classic') return false;
            d.owned = d.owned.filter(x => x !== c.id);
            if (d.character === c.id) d.character = 'classic';
          } else { d.owned.push(c.id); if (c.secret && !d.secretsFound.includes(c.id)) d.secretsFound.push(c.id); }
        }), own ? 'green' : ''),
        btn(eq ? 'EQUIPPED' : 'EQUIP', () => act(() => { const d = D(); if (!d.owned.includes(c.id)) d.owned.push(c.id); d.character = c.id; }), eq ? 'gold' : '')
      ));
    });

    out.push(sec('Hoverboards'));
    out.push(btns([
      ['UNLOCK ALL', () => act(() => { D().ownedBoards = BOARDS.map(b => b.id); }, 'All boards unlocked', 'gold'), 'gold'],
      ['LOCK ALL', () => act(() => { D().ownedBoards = ['pinky']; D().board = 'pinky'; }, 'Only Pinky left', 'bad'), 'red']
    ]));
    BOARDS.forEach(b => {
      const own = D().ownedBoards.includes(b.id), eq = D().board === b.id;
      out.push(h('div', { class: 'adm-item' + (own ? ' on' : '') },
        h('div', { class: 'adm-item-main' }, h('b', { text: b.name + (b.admin ? ' · ADMIN ONLY' : '') }), h('small', { text: b.desc })),
        btn(own ? 'OWNED' : 'OWN IT', () => act(() => {
          const d = D();
          if (d.ownedBoards.includes(b.id)) {
            if (b.id === 'pinky') return false;
            d.ownedBoards = d.ownedBoards.filter(x => x !== b.id);
            if (d.board === b.id) d.board = 'pinky';
          } else d.ownedBoards.push(b.id);
        }), own ? 'green' : ''),
        btn(eq ? 'EQUIPPED' : 'EQUIP', () => act(() => { const d = D(); if (!d.ownedBoards.includes(b.id)) d.ownedBoards.push(b.id); d.board = b.id; }), eq ? 'gold' : '')
      ));
    });

    out.push(sec('Upgrades'));
    out.push(btns([
      ['MAX ALL', () => act(() => UPGRADES.forEach(u => { D().upgrades[u.id] = u.max; }), 'All upgrades maxed', 'gold'), 'gold'],
      ['RESET ALL', () => act(() => UPGRADES.forEach(u => { D().upgrades[u.id] = 0; }), 'Upgrades reset', 'bad'), 'red']
    ]));
    UPGRADES.forEach(u => out.push(num(u.name + ' (0–' + u.max + ')', () => D().upgrades[u.id] || 0, v => { D().upgrades[u.id] = v; }, 0, u.max)));
    return out;
  }

  /* ---------- LEVELS ---------- */
  let playMode = null, playLevelN = 1;
  function tabLevels() {
    const out = [];
    if (!playMode) playMode = D().mode;
    out.push(sec('Play any level', 'ignores the unlock ladder'));
    out.push(select('Difficulty', MODES_LIST.map(m => [m, MODES[m].name]), () => playMode, v => { playMode = v; }));
    out.push(num('Level (1–' + Levels.COUNT + ')', () => playLevelN, v => { playLevelN = v; }, 1, Levels.COUNT));
    out.push(btns([
      ['▶ PLAY LEVEL', () => { if (noEscape()) return; D().mode = playMode; Save.save(); close(); Game.admin.playAnyLevel(playLevelN); }, 'gold'],
      ['▶ ENDLESS', () => { if (noEscape()) return; D().mode = playMode; Save.save(); close(); Game.playEndless(); }, 'purple']
    ]));

    out.push(sec('All difficulties'));
    out.push(btns([
      ['UNLOCK ALL LEVELS', () => act(() => MODES_LIST.forEach(m => { D().levels[m].unlocked = Levels.COUNT; }), 'All levels unlocked', 'gold'), 'gold'],
      ['3★ EVERYTHING', () => act(() => MODES_LIST.forEach(m => { D().levels[m] = { unlocked: Levels.COUNT, stars: Array(Levels.COUNT).fill(3) }; }), 'Every level 3-starred', 'gold'), 'gold'],
      ['RESET ALL LEVELS', () => act(() => MODES_LIST.forEach(m => { D().levels[m] = { unlocked: 1, stars: [] }; }), 'Level progress reset', 'bad'), 'red']
    ]));

    out.push(sec('Star editor · ' + MODES[playMode].name, 'tap a level to cycle 0–3 stars'));
    const grid = h('div', { class: 'adm-grid' });
    for (let n = 1; n <= Levels.COUNT; n++) {
      const st = Levels.starsFor(playMode, n), lock = n > Levels.unlocked(playMode);
      grid.append(h('button', {
        class: 'adm-cell' + (lock ? ' lock' : '') + (st ? ' s' + st : ''), type: 'button', title: 'Level ' + n,
        onclick: () => act(() => {
          const inf = D().levels[playMode], next = ((inf.stars[n - 1] || 0) + 1) % 4;
          while (inf.stars.length < n) inf.stars.push(0);
          inf.stars[n - 1] = next;
          if (next > 0) inf.unlocked = Math.max(inf.unlocked, Math.min(Levels.COUNT, n + 1));
        })
      }, h('i', { text: n }), h('b', { text: st ? '★'.repeat(st) : lock ? '🔒' : '·' })));
    }
    out.push(grid);

    MODES_LIST.forEach(m => {
      out.push(sec(MODES[m].name, Levels.totalStars(m) + ' / ' + Levels.COUNT * 3 + ' stars'));
      out.push(num('Unlocked up to level', () => D().levels[m].unlocked, v => { D().levels[m].unlocked = v; }, 1, Levels.COUNT));
      out.push(btns([
        ['UNLOCK', () => act(() => { D().levels[m].unlocked = Levels.COUNT; }, MODES[m].name + ' unlocked')],
        ['3★ ALL', () => act(() => { D().levels[m] = { unlocked: Levels.COUNT, stars: Array(Levels.COUNT).fill(3) }; }, MODES[m].name + ' 3-starred', 'gold')],
        ['CLEAR ★', () => act(() => { D().levels[m].stars = []; }, 'Stars cleared', 'bad'), 'red'],
        ['RESET', () => act(() => { D().levels[m] = { unlocked: 1, stars: [] }; }, MODES[m].name + ' reset', 'bad'), 'red']
      ]));
    });
    return out;
  }

  /* ---------- LIVE RUN ---------- */
  const flags = { inf: {}, infBoards: false, comboLock: false, forceMult: 0, vacuum: false, scoreMul: 1, lastScore: 0 };

  function needRun() {
    const m = S().mode;
    if (m === 'play' || m === 'pause' || m === 'countdown') return true;
    toast('Start a run first', 'bad');
    return false;
  }
  const withRun = fn => () => { if (needRun()) { fn(); click(); } };
  const resume = () => { if (S().mode === 'pause') Game.togglePause(); };
  /* the HACKER lockdown is meant to be inescapable, so the panel never starts a different run from inside it */
  const noEscape = () => { if (S().hacker) { toast('There is no escape from HACKER mode.', 'bad'); return true; } return false; };

  function tabRun() {
    const out = [];
    const A = Game.admin, hk = H();

    out.push(note('These work on the run in progress. The panel pauses the game while it is open — close it and press RESUME.'));

    out.push(sec('Survival'));
    out.push(toggle('God mode', () => hk.god, v => { hk.god = v; }, 'crashes and stumbles do nothing'));
    out.push(toggle('No obstacles', () => hk.noObstacles, v => { hk.noObstacles = v; if (v) A.clearObstacles(); }, 'clears the road (ramps stay)'));
    out.push(toggle('Infinite hoverboards', () => flags.infBoards, v => { flags.infBoards = v; }));
    out.push(btns([
      ['CRASH NOW', () => { A.crash(); close(); }, 'red'],
      ['FREE REVIVE', () => { if (A.freeRevive()) { close(); toast('Revived for free', 'gold'); } else toast('Only works after a crash', 'bad'); }, 'green'],
      ['DEPLOY BOARD', withRun(() => { if (S().boards <= 0) S().boards = 1; close(); resume(); Game.deployBoard(); }), '']
    ]));

    out.push(sec('Power-ups', 'tap to grab now · switch = always active'));
    PU_KINDS.forEach(k => {
      out.push(h('div', { class: 'adm-item on' },
        h('div', { class: 'adm-item-main' }, h('b', { text: PU_NAMES[k] })),
        btn('GRAB', withRun(() => A.grab(k)), 'blue'),
        h('label', { class: 'adm-mini-toggle' },
          h('input', { type: 'checkbox', checked: !!flags.inf[k], onchange: e => { flags.inf[k] = e.target.checked; click(); } }), h('i'))
      ));
    });
    out.push(btns([
      ['GRAB ALL', withRun(() => PU_KINDS.forEach(k => A.grab(k))), 'gold'],
      ['+5 BOARDS', withRun(() => { S().boards += 5; }), ''],
      ['ALWAYS ON: ALL', () => { PU_KINDS.forEach(k => { flags.inf[k] = true; }); render(); click(); }, ''],
      ['ALWAYS ON: NONE', () => { PU_KINDS.forEach(k => { flags.inf[k] = false; }); render(); click(); }, '']
    ]));

    out.push(sec('Scoring'));
    out.push(slider('Force score multiplier', 0, 100, 1, () => flags.forceMult, v => { flags.forceMult = v; }, v => v ? '×' + v : 'off', 0));
    out.push(toggle('Combo never expires', () => flags.comboLock, v => { flags.comboLock = v; }));
    out.push(slider('Coin value', 1, 100, 1, () => hk.coinMul, v => { hk.coinMul = v; }, v => '×' + v, 1));
    out.push(btns([
      ['COMBO ×5', withRun(() => setCombo(5))], ['COMBO ×10', withRun(() => setCombo(10))],
      ['COMBO ×25', withRun(() => setCombo(25))], ['COMBO ×50', withRun(() => setCombo(50))]
    ]));
    out.push(btns([
      ['+1K SCORE', withRun(() => { S().score += 1000; })], ['+100K SCORE', withRun(() => { S().score += 100000; })],
      ['+100 COINS', withRun(() => { S().coins += 100; })], ['+1000 COINS', withRun(() => { S().coins += 1000; })]
    ]));

    out.push(sec('Physics'));
    out.push(slider('Run speed', 0.2, 3, 0.05, () => hk.speedMul, v => { hk.speedMul = v; }, v => '×' + v.toFixed(2), 1));
    out.push(slider('Jump power', 0.4, 3, 0.05, () => hk.jumpMul, v => { hk.jumpMul = v; }, v => '×' + v.toFixed(2), 1));
    out.push(slider('Gravity', 0.1, 3, 0.05, () => hk.gravMul, v => { hk.gravMul = v; }, v => '×' + v.toFixed(2), 1));
    out.push(slider('Time scale', 0.1, 3, 0.05, () => hk.timeScale, v => { hk.timeScale = v; }, v => '×' + v.toFixed(2), 1));
    out.push(btns([
      ['MOON JUMP', () => { hk.gravMul = 0.25; hk.jumpMul = 1.1; render(); click(); toast('Low gravity'); }],
      ['SLOW-MO', () => { hk.timeScale = 0.4; render(); click(); }],
      ['TURBO', () => { hk.speedMul = 1.8; render(); click(); }],
      ['RESET PHYSICS', () => { Object.assign(hk, { speedMul: 1, jumpMul: 1, gravMul: 1, timeScale: 1, coinMul: 1, gapMul: 1, puMul: 1, extraJumps: 0 }); render(); click(); }, 'red']
    ]));

    out.push(sec('Presets'));
    out.push(btns([
      ['GHOST', () => { Object.assign(hk, { god: true, noObstacles: true }); A.clearObstacles(); render(); toast('Ghost preset on'); click(); }],
      ['ZEN', () => { Object.assign(hk, { god: true, noObstacles: true, speedMul: 0.6, coinMul: 5 }); A.clearObstacles(); render(); toast('Zen preset on'); click(); }],
      ['CHAOS', () => { Object.assign(hk, { speedMul: 1.6, gapMul: 0.45, gravMul: 0.5, extraJumps: 3 }); render(); toast('Chaos preset on', 'bad'); click(); }],
      ['AUTO RUN', () => { Object.assign(hk, { auto: true, god: false }); render(); toast('Autopilot on'); click(); }, 'green'],
      ['ALL OFF', () => { Object.assign(hk, DEFAULT_HOOKS); render(); toast('Tweaks cleared'); click(); }, 'red']
    ]));

    out.push(sec('Extras'));
    out.push(toggle('Autopilot', () => hk.auto, v => { hk.auto = v; }, 'dodges, jumps and rolls for you'));
    out.push(toggle('Hide the runner', () => hk.hidePlayer, v => { hk.hidePlayer = v; }, 'cosmetic: invisible Riggy'));
    out.push(toggle('Freeze moving trains', () => hk.freezeTrains, v => { hk.freezeTrains = v; }));
    out.push(slider('Air jumps (extra)', 0, 20, 1, () => hk.extraJumps, v => { hk.extraJumps = v; }, v => '+' + v, 0));
    out.push(slider('Power-up duration', 1, 10, 0.5, () => hk.puMul, v => { hk.puMul = v; }, v => '×' + v.toFixed(1), 1));
    out.push(slider('Power-up spawn rate', 0, 20, 0.5, () => hk.powerMul, v => { hk.powerMul = v; }, v => '×' + v.toFixed(1), 1));
    out.push(slider('Level length (new level runs)', 0.1, 5, 0.1, () => hk.goalMul, v => { hk.goalMul = v; }, v => '×' + v.toFixed(1), 1));
    out.push(slider('Score gain', 1, 50, 1, () => flags.scoreMul, v => { flags.scoreMul = v; }, v => '×' + v, 1));
    out.push(toggle('Coin vacuum', () => flags.vacuum, v => { flags.vacuum = v; }, 'every coin ahead flies to you'));
    out.push(slider('Obstacle spacing', 0.4, 4, 0.1, () => hk.gapMul, v => { hk.gapMul = v; }, v => '×' + v.toFixed(1), 1));
    out.push(btns([
      ['+1 EXTRA LIFE', withRun(() => { S().extraLife = (S().extraLife || 0) + 1; toast('+1 extra life', 'good'); }), 'green'],
      ['+3 LIVES', withRun(() => { S().extraLife = (S().extraLife || 0) + 3; toast('+3 extra lives', 'good'); }), 'green'],
      ['◀ LANE', withRun(() => setLane(0))], ['● LANE', withRun(() => setLane(1))], ['LANE ▶', withRun(() => setLane(2))]
    ]));

    out.push(sec('Track'));
    out.push(btns([
      ['SKIP +50m', withRun(() => A.skip(50))], ['SKIP +250m', withRun(() => A.skip(250))], ['SKIP +1000m', withRun(() => A.skip(1000))]
    ]));
    out.push(btns([
      ['FINISH LEVEL', () => { if (needRun()) { if (A.finish()) { close(); resume(); toast('Heading for the line!', 'gold'); } else toast('Only works in numbered levels', 'bad'); } }, 'gold'],
      ['CLEAR OBSTACLES', withRun(() => { A.clearObstacles(); toast('Road cleared'); })],
      ['COIN SHOWER', withRun(() => { A.spawnCoins(60); toast('Coins ahead!'); })]
    ]));
    let spawnKind = 'magnet';
    out.push(select('Drop pickup ahead', [...PU_KINDS, 'hoverboard'].map(k => [k, PU_NAMES[k] || 'Hoverboard']), () => spawnKind, v => { spawnKind = v; }));
    out.push(btns([['DROP IT', withRun(() => { A.spawnPickup(spawnKind); toast('Dropped ' + spawnKind); })]]));
    return out;
  }

  function setLane(n) { const s = S(); s.lane = n; s.targetX = World.LANES[n]; s.laneT = 0; }

  function setCombo(mult) {
    const s = S();
    s.combo = (mult - 1) * 4; s.comboTimer = 3.2;
    s.multiplier = mult + (s.powers.x2 > 0 ? 1 : 0);
    s.maxCombo = Math.max(s.maxCombo, mult);
  }

  /* ---------- WORLD ---------- */
  const FX_DEFAULT = { hue: 0, sat: 100, bri: 100, inv: false, mirror: false, gray: 0, sepia: 0, con: 100, blur: 0, rot: 0, zoom: 100, flipY: false, disco: false };
  const fx = Object.assign({}, FX_DEFAULT);
  function applyFx() {
    const cv = document.getElementById('game');
    const idle = !fx.hue && fx.sat === 100 && fx.bri === 100 && !fx.inv && !fx.gray && !fx.sepia && fx.con === 100 && !fx.blur;
    cv.style.filter = idle ? '' : `hue-rotate(${fx.hue}deg) saturate(${fx.sat}%) brightness(${fx.bri}%) invert(${fx.inv ? 1 : 0}) grayscale(${fx.gray}%) sepia(${fx.sepia}%) contrast(${fx.con}%) blur(${fx.blur}px)`;
    const sx = (fx.mirror ? -1 : 1) * fx.zoom / 100, sy = (fx.flipY ? -1 : 1) * fx.zoom / 100;
    cv.style.transform = (sx === 1 && sy === 1 && !fx.rot) ? '' : `scale(${sx}, ${sy}) rotate(${fx.rot}deg)`;
  }

  function tabWorld() {
    const out = [];
    const hk = H();
    out.push(sec('Look'));
    out.push(select('Season', [['auto', 'Auto (calendar)'], ...World.SEASON_ORDER.map(s => [s, World.SEASONS[s].name])],
      () => D().opts.season, v => act(() => { D().opts.season = v; UI.paintSeason(); }, 'Season: ' + v.toUpperCase())));
    out.push(select('Force map', [['', 'Normal (by level / distance)'], ...World.BIOMES.map((b, i) => [i, b.name])],
      () => hk.biome === null ? '' : hk.biome, v => { hk.biome = v === '' ? null : Number(v); toast(v === '' ? 'Maps back to normal' : 'Map forced: ' + World.BIOMES[Number(v)].name); }));

    out.push(sec('Screen effects', 'cosmetic, session only'));
    out.push(slider('Hue shift', 0, 360, 5, () => fx.hue, v => { fx.hue = v; applyFx(); }, v => v + '°', 0));
    out.push(slider('Saturation', 0, 300, 5, () => fx.sat, v => { fx.sat = v; applyFx(); }, v => v + '%', 100));
    out.push(slider('Brightness', 30, 200, 5, () => fx.bri, v => { fx.bri = v; applyFx(); }, v => v + '%', 100));
    out.push(toggle('Invert colours', () => fx.inv, v => { fx.inv = v; applyFx(); }));
    out.push(toggle('Mirror the track', () => fx.mirror, v => { fx.mirror = v; applyFx(); }, 'visual only — controls are not flipped'));
    out.push(toggle('Hide HUD', () => UI.el.hud.style.visibility === 'hidden', v => { UI.el.hud.style.visibility = v ? 'hidden' : ''; }));
    out.push(btns([['RESET EFFECTS', () => { Object.assign(fx, FX_DEFAULT); applyFx(); UI.el.hud.style.visibility = ''; render(); click(); }, 'red']]));

    out.push(sec('Game options'));
    const o = () => D().opts;
    [['Music', 'music'], ['Sound effects', 'sfx'], ['Screen shake', 'shake'], ['Motion blur / speed lines', 'blur'], ['Show FPS', 'fps'], ['High contrast obstacles', 'contrast']]
      .forEach(([l, k]) => out.push(toggle(l, () => o()[k], v => {
        o()[k] = v; Save.save();
        if (k === 'music') Sound.setMusic(v);
        if (k === 'sfx') Sound.setSfx(v);
        UI.bindSettings();
      })));
    return out;
  }

  /* ---------- MISSIONS ---------- */
  function tabMissions() {
    const out = [];
    out.push(sec('Missions', 'clear all three to rank up'));
    Missions.ensure().forEach((m, i) => {
      out.push(h('div', { class: 'adm-item' + (m.done ? ' on' : '') },
        h('div', { class: 'adm-item-main' }, h('b', { text: m.text }), h('small', { text: Math.floor(m.progress) + ' / ' + m.amount + (m.done ? ' · done' : '') })),
        btn(m.done ? 'DONE' : 'COMPLETE', () => act(() => { const x = Missions.ensure()[i]; x.progress = x.amount; x.done = true; }, 'Mission complete'), m.done ? 'green' : 'blue')
      ));
    });
    out.push(btns([
      ['COMPLETE ALL + CLAIM RANK', () => act(() => {
        Missions.ensure().forEach(x => { x.progress = x.amount; x.done = true; });
        const r = Missions.checkSetComplete();
        if (r) toast(`RANK ${r.rank}! +${U.fmt(r.bonus)} coins`, 'gold');
      }), 'gold wide'],
      ['RE-ROLL MISSIONS', () => act(() => { D().missions = Missions.roll(D().missionSet || 0); }, 'New missions rolled')],
      ['CLEAR PROGRESS', () => act(() => Missions.ensure().forEach(x => { x.progress = 0; x.done = false; }), 'Progress cleared', 'bad'), 'red']
    ]));
    out.push(num('Mission sets cleared', () => D().missionSet || 0, v => { D().missionSet = v; }, 0, 9999));
    out.push(num('Riggy rank', () => D().rank, v => { D().rank = v; }, 1, 9999));
    return out;
  }

  const SNAP_KEY = 'riggy-admin-snapshots';
  const readSnaps = () => { try { return JSON.parse(localStorage.getItem(SNAP_KEY)) || {}; } catch (e) { return {}; } };
  const writeSnaps = o => { try { localStorage.setItem(SNAP_KEY, JSON.stringify(o)); } catch (e) { toast('Could not store snapshot', 'bad'); } };

  /* ---------- DEBUG ---------- */
  let dbgBox = null;
  function tabDebug() {
    dbgBox = h('pre', { class: 'adm-pre' });
    paintDebug();
    let msg = 'Hello from the admin!';
    return [
      sec('Live state', 'updates 4×/second'), dbgBox,
      sec('Broadcast a toast'),
      h('input', { type: 'text', class: 'adm-text', value: msg, oninput: e => { msg = e.target.value; } }),
      btns([['SHOW', () => { toast(msg, 'gold'); click(); }, 'gold'], ['SHOW (RED)', () => toast(msg, 'bad'), 'red'], ['SHOW (GREEN)', () => toast(msg, 'good'), 'green']]),
      sec('Tools'),
      btns([
        ['TOGGLE FPS', () => act(() => { D().opts.fps = !D().opts.fps; }, 'FPS counter toggled')],
        ['SOUND TEST: COIN', () => { try { Sound.sfx.bigCoin(); } catch (e) { /* no audio */ } }],
        ['SOUND TEST: RECORD', () => { try { Sound.sfx.newRecord(); } catch (e) { /* no audio */ } }],
        ['LOG STATE TO CONSOLE', () => { console.log('Game.state', S(), 'Save.d', D(), 'hooks', H()); toast('Logged to the console'); }]
      ])
    ];
  }
  function paintDebug() {
    if (!dbgBox) return;
    const s = S(), c = Game.admin.counts();
    const f = v => typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : v;
    const rows = [
      ['mode', s.mode], ['level', s.level], ['dist (m)', f(s.dist)], ['speed', f(s.speed)], ['score', f(s.score)], ['coins', s.coins],
      ['lane', s.lane], ['y', f(s.y)], ['vy', f(s.vy)], ['combo', s.combo], ['multiplier', f(s.multiplier)], ['hits', s.hits],
      ['boards', s.boards], ['board time', f(s.boardT)], ['extra lives', s.extraLife], ['invuln', f(s.invuln)], ['near / tricks', s.near + ' / ' + s.tricks],
      ['powers', PU_KINDS.map(k => k + ':' + f(s.powers[k])).join(' ')],
      ['objects', `obs ${c.obstacles} · coins ${c.coins} · picks ${c.pickups} · scenery ${c.scenery} · fx ${c.particles}`],
      ['difficulty', Game.admin.mode.id], ['hooks', JSON.stringify(H())]
    ];
    dbgBox.textContent = rows.map(([k, v]) => k.padEnd(14) + v).join('\n');
  }

  /* ---------- DATA ---------- */
  function tabData() {
    const out = [];
    const json = JSON.stringify(D(), null, 2);
    out.push(sec('Export save', Math.round(json.length / 102.4) / 10 + ' KB'));
    const ex = h('textarea', { class: 'adm-text', readonly: true, rows: 6 }); ex.value = json;
    out.push(ex);
    out.push(btns([
      ['COPY', () => { ex.select(); (navigator.clipboard ? navigator.clipboard.writeText(json) : Promise.reject()).catch(() => document.execCommand('copy')); toast('Save copied'); click(); }],
      ['DOWNLOAD', () => {
        const a = h('a', { href: URL.createObjectURL(new Blob([json], { type: 'application/json' })), download: 'riggy-runner-save.json' });
        document.body.append(a); a.click(); a.remove(); click();
      }]
    ]));

    out.push(sec('Import save', 'replaces your save, then reloads'));
    const im = h('textarea', { class: 'adm-text', rows: 5, placeholder: 'Paste a save JSON here…', spellcheck: 'false' });
    out.push(im);
    out.push(btns([['IMPORT + RELOAD', () => {
      let p;
      try { p = JSON.parse(im.value); } catch (e) { toast('That is not valid JSON', 'bad'); return; }
      if (!p || typeof p !== 'object' || Array.isArray(p) || typeof p.coins !== 'number') { toast('Does not look like a Riggy save', 'bad'); return; }
      if (!confirm('Replace your current save with this one?')) return;
      const d = D();
      Object.keys(d).forEach(k => delete d[k]);
      Object.assign(d, p);
      Save.save();                    // re-signed, so the tamper check stays happy
      location.reload();
    }, 'gold']]));

    out.push(sec('Snapshots', 'quick save slots, kept in this browser'));
    const snaps = readSnaps();
    [1, 2, 3].forEach(i => {
      const sn = snaps[i];
      out.push(h('div', { class: 'adm-item' + (sn ? ' on' : '') },
        h('div', { class: 'adm-item-main' }, h('b', { text: 'Slot ' + i }),
          h('small', { text: sn ? new Date(sn.at).toLocaleString() + ' · ' + U.fmt(sn.data.coins || 0) + ' coins · rank ' + (sn.data.rank || 1) : 'empty' })),
        btn('SAVE', () => { snaps[i] = { at: Date.now(), data: JSON.parse(JSON.stringify(D())) }; writeSnaps(snaps); toast('Saved to slot ' + i, 'good'); render(); click(); }, 'blue'),
        btn('LOAD', () => {
          if (!sn || !confirm('Load slot ' + i + ' and reload the game?')) return;
          const d = D(); Object.keys(d).forEach(k => delete d[k]); Object.assign(d, sn.data); Save.save(); location.reload();
        }, sn ? 'gold' : '')
      ));
    });

    out.push(sec('Danger zone'));
    out.push(btns([
      ['CLEAR TOP RUNS', () => act(() => { D().runsLog = []; }, 'Leaderboard cleared', 'bad'), 'red'],
      ['RESET ADMIN TWEAKS', () => { Object.assign(H(), DEFAULT_HOOKS); flags.inf = {}; flags.infBoards = false; flags.comboLock = false; flags.forceMult = 0; flags.vacuum = false; flags.scoreMul = 1; Object.assign(fx, FX_DEFAULT); applyFx(); render(); toast('Session tweaks reset'); click(); }],
      ['RESET ALL PROGRESS', () => { if (confirm('Wipe every coin, unlock and high score?')) act(() => { Save.reset(); }, 'Progress reset', 'bad'); }, 'red']
    ]));
    return out;
  }

  /* ---------- PANEL (size / position) ---------- */
  function tabPanel() {
    const out = [];
    out.push(note('Drag the gold edge of the panel to resize it. Double-click the edge to reset. Your layout is remembered.'));
    out.push(sec('Size'));
    out.push(btns([
      ['SMALL', () => { pn.w = 340; pn.max = false; applyPanel(); render(); }],
      ['MEDIUM', () => { pn.w = 520; pn.max = false; applyPanel(); render(); }],
      ['LARGE', () => { pn.w = 780; pn.max = false; applyPanel(); render(); }],
      ['FULL SCREEN', () => { pn.max = true; applyPanel(); render(); }, 'gold']
    ]));
    out.push(slider('Width', 300, Math.max(400, window.innerWidth), 10, () => pn.w, v => { pn.w = v; pn.max = false; applyPanel(); }, v => v + 'px', 520));
    out.push(slider('Opacity', 35, 100, 5, () => pn.op, v => { pn.op = v; applyPanel(); }, v => v + '%', 100));
    out.push(slider('Text & button size', 70, 160, 5, () => pn.zoom, v => { pn.zoom = v; applyPanel(); }, v => v + '%', 100));
    out.push(sec('Accent colour'));
    out.push(btns([['GOLD', '#ffc21c'], ['MINT', '#3ddc9b'], ['PINK', '#ff6fb5'], ['SKY', '#4cc9ff'], ['VIOLET', '#a78bff'], ['RED', '#ff5a5a']].map(([l, c]) => [l, () => { pn.accent = c; applyPanel(); click(); }])));
    out.push(h('label', { class: 'adm-row' }, h('span', { text: 'Custom colour' }), h('input', { type: 'color', value: pn.accent || '#ffc21c', onchange: e => { pn.accent = e.target.value; applyPanel(); } })));
    out.push(sec('Position'));
    out.push(btns([
      ['DOCK LEFT', () => { pn.side = 'left'; applyPanel(); click(); }],
      ['DOCK RIGHT', () => { pn.side = 'right'; applyPanel(); click(); }],
      ['MINIMISE', () => { pn.min = true; applyPanel(); click(); }],
      ['RESET LAYOUT', () => { Object.assign(pn, PN_DEFAULT); applyPanel(); render(); click(); }, 'red']
    ]));
    return out;
  }

  /* ---------- REBIRTH ---------- */
  let chLvId = 'classic';
  function tabRebirth() {
    const out = [], d = D();
    out.push(note('Rebirth counters, points and perk levels. Tweaking these is saved normally and does not trip the anti-tamper check.'));
    out.push(sec('Status', 'rank ' + (d.rank || 1) + ' · needs ' + Rebirth.need() + ' for the next one'));
    out.push(num('Rebirths', () => D().rebirths || 0, v => { D().rebirths = v; }, 0, 999));
    out.push(num('Rebirth Points (to spend)', () => D().rp || 0, v => { D().rp = v; }, 0, 99999));
    out.push(num('Riggy Rank', () => D().rank || 1, v => { D().rank = v; }, 1, 999));
    out.push(btns([
      ['+10 RP', () => act(() => { D().rp = (D().rp || 0) + 10; D().rpTotal = (D().rpTotal || 0) + 10; }, '+10 RP', 'gold'), 'gold'],
      ['+100 RP', () => act(() => { D().rp = (D().rp || 0) + 100; D().rpTotal = (D().rpTotal || 0) + 100; }, '+100 RP', 'gold'), 'gold'],
      ['RANK = READY', () => act(() => { D().rank = Math.max(D().rank || 1, Rebirth.need()); }, 'Rank set to rebirth-ready'), 'green'],
      ['FORCE REBIRTH', () => act(() => { const g = Rebirth.perform(); toast('Reborn! +' + g + ' RP', 'gold'); }), 'red']
    ]));
    out.push(sec('Perk levels'));
    Rebirth.PERKS.forEach(p => {
      out.push(num(p.name + ' (max ' + p.max + ')', () => Rebirth.lv(p.id), v => { D().rpPerks = D().rpPerks || {}; D().rpPerks[p.id] = v; }, 0, p.max));
    });
    out.push(sec('Rebirth chests', 'milestones'));
    out.push(btns([
      ['CLAIM ALL READY', () => act(() => { Rebirth.MILESTONES.forEach(m => Rebirth.claim(m.n)); }, 'Chests claimed', 'gold'), 'gold'],
      ['RESET CHESTS', () => act(() => { D().rbClaimed = []; }, 'Chests locked again', 'bad'), 'red']
    ]));
    out.push(sec('Character levels', 'XP, level and ★ stars per character'));
    out.push(select('Character', CHARACTERS.map(c => [c.id, c.name]), () => chLvId, v => { chLvId = v; render(); }));
    out.push(num('Level (1–' + CharLv.MAX + ')', () => CharLv.info(chLvId).level, v => { CharLv.setLevel(chLvId, v); }, 1, CharLv.MAX));
    out.push(num('★ Rebirth stars (0–' + CharLv.MAX_REB + ')', () => CharLv.reb(chLvId), v => { CharLv.setReb(chLvId, v); }, 0, CharLv.MAX_REB));
    out.push(btns([
      ['MAX LEVEL', () => act(() => CharLv.setLevel(chLvId, CharLv.MAX), 'Max level', 'gold'), 'gold'],
      ['REBIRTH IT', () => act(() => { own(D().owned, chLvId); CharLv.setLevel(chLvId, CharLv.MAX); CharLv.rebirth(chLvId); }, 'Character reborn', 'gold'), 'gold'],
      ['RESET IT', () => act(() => { CharLv.setLevel(chLvId, 1); CharLv.setReb(chLvId, 0); }, 'Character reset', 'bad'), 'red']
    ]));
    out.push(btns([
      ['MAX ALL CHARACTERS', () => act(() => CHARACTERS.forEach(c => CharLv.setLevel(c.id, CharLv.MAX)), 'Everyone at max level', 'gold'), 'gold'],
      ['★ ALL TO MAX', () => act(() => CHARACTERS.forEach(c => { CharLv.setLevel(c.id, CharLv.MAX); CharLv.setReb(c.id, CharLv.MAX_REB); }), 'Everyone ★ maxed', 'gold'), 'gold'],
      ['RESET ALL', () => act(() => { D().charXp = {}; D().charReb = {}; }, 'All character levels reset', 'bad'), 'red']
    ]));
    out.push(btns([
      ['MAX ALL PERKS', () => act(() => { D().rpPerks = {}; Rebirth.PERKS.forEach(p => { D().rpPerks[p.id] = p.max; }); }, 'All rebirth perks maxed', 'gold'), 'gold'],
      ['CLEAR PERKS', () => act(() => { D().rpPerks = {}; }, 'Perks cleared', 'bad'), 'red']
    ]));
    return out;
  }

  /* ---------- DAILY JAM ---------- */
  function tabJam() {
    const out = [], d = D();
    out.push(sec('Daily Jam', d.rhythmLast ? 'last coin claim: ' + d.rhythmLast : 'never claimed'));
    out.push(select('Selected song', [['highscore', 'Highscore'], ...Songs.list.map(x => [x.id, x.name])], () => D().rhythmSong || 'highscore', v => { D().rhythmSong = v; Save.save(); }));
    out.push(select('Difficulty', ['easy', 'normal', 'hard', 'insane'].map(k => [k, k.toUpperCase()]), () => D().rhythmDiff || 'normal', v => { D().rhythmDiff = v; Save.save(); }));
    out.push(btns([
      ['RESET DAILY LOCK', () => act(() => { D().rhythmLast = ''; Rhythm.refreshButton(); }, 'You can claim Jam coins again', 'gold'), 'gold'],
      ['LOCK TODAY', () => act(() => { D().rhythmLast = new Date().getFullYear() + '-' + (new Date().getMonth() + 1) + '-' + new Date().getDate(); Rhythm.refreshButton(); }, 'Locked until tomorrow', 'bad'), 'red'],
      ['CLEAR JAM BESTS', () => act(() => { D().rhythmBests = {}; D().rhythmBest = 0; }, 'Jam bests cleared', 'bad'), 'red']
    ]));
    out.push(btns([['OPEN DAILY JAM', () => { close(); Game.toMenu && Game.toMenu(); Rhythm.open(); }, 'green wide']]));
    out.push(sec('Personal bests'));
    const bests = D().rhythmBests || {}, keys = Object.keys(bests);
    out.push(note(keys.length ? keys.map(k => k + ' → ' + U.fmt(bests[k])).join('   ·   ') : 'No songs cleared yet.'));
    return out;
  }


  /* ============================================================
     EXTRA TABS: CONSOLE · AUTO · FUN · SOUND · LOG · TOOLS
     ============================================================ */
  const PRESET_KEY = 'riggy-admin-presets', HOT_KEY = 'riggy-admin-hot';
  const readLS = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } };
  const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } };
  const hot = Object.assign({ on: true }, readLS(HOT_KEY, {}));

  /* ---------- CONSOLE: type commands ---------- */
  const conOut = ['Type  help  for a list of commands.'];
  const conHist = []; let conPos = 0;
  const say = m => { conOut.push(String(m)); if (conOut.length > 120) conOut.shift(); logIt('> ' + m); };
  const own = (list, id) => { if (!list.includes(id)) list.push(id); };
  const COMMANDS = {
    help: ['list commands', () => say(Object.keys(COMMANDS).map(k => k + ' – ' + COMMANDS[k][0]).join('\n'))],
    coins: ['coins N · set coins', a => { D().coins = clamp(Math.round(+a[0]) || 0, 0, 999999999); return 'coins = ' + D().coins; }],
    addcoins: ['addcoins N', a => { Save.addCoins(Math.round(+a[0]) || 0); return 'coins = ' + D().coins; }],
    boards: ['boards N · hoverboard count', a => { D().hoverboards = clamp(Math.round(+a[0]) || 0, 0, 9999); return 'boards = ' + D().hoverboards; }],
    rank: ['rank N', a => { D().rank = clamp(Math.round(+a[0]) || 1, 1, 9999); return 'rank = ' + D().rank; }],
    rebirths: ['rebirths N', a => { D().rebirths = clamp(Math.round(+a[0]) || 0, 0, 999); return 'rebirths = ' + D().rebirths; }],
    rp: ['rp N · rebirth points', a => { D().rp = clamp(Math.round(+a[0]) || 0, 0, 99999); return 'rp = ' + D().rp; }],
    char: ['char ID · own + equip (' + CHARACTERS.map(c => c.id).join(', ') + ')', a => {
      const c = CHARACTERS.find(x => x.id === (a[0] || '').toLowerCase()); if (!c) return 'unknown character';
      own(D().owned, c.id); if (c.secret) own(D().secretsFound, c.id); D().character = c.id; return 'equipped ' + c.name; }],
    board: ['board ID · own + equip (' + BOARDS.map(b => b.id).join(', ') + ')', a => {
      const b = BOARDS.find(x => x.id === (a[0] || '').toLowerCase()); if (!b) return 'unknown board';
      own(D().ownedBoards, b.id); D().board = b.id; return 'equipped ' + b.name; }],
    charlv: ['charlv ID N · character level', a => { const c = CHARACTERS.find(x => x.id === a[0]); if (!c) return 'unknown character'; CharLv.setLevel(c.id, +a[1] || 1); return c.name + ' level ' + CharLv.info(c.id).level; }],
    charreb: ['charreb ID N · character ★ stars', a => { const c = CHARACTERS.find(x => x.id === a[0]); if (!c) return 'unknown character'; CharLv.setReb(c.id, +a[1] || 0); return c.name + ' ★' + CharLv.reb(c.id); }],
    map: ['map N · force a map (0–' + (World.BIOMES.length - 1) + ', off = normal)', a => { if (a[0] === 'off') { H().biome = null; return 'maps normal'; } const i = +a[0]; if (!(i >= 0 && i < World.BIOMES.length)) return 'no such map'; H().biome = i; return 'map: ' + World.BIOMES[i].name; }],
    unlockall: ['unlock everything', () => { unlockEverything(); return 'everything unlocked'; }],
    mode: ['mode easy|normal|hard|insane', a => { if (!MODES[a[0]]) return 'unknown mode'; D().mode = a[0]; return 'mode = ' + a[0]; }],
    song: ['song ID (highscore, ' + Songs.list.map(s => s.id).join(', ') + ')', a => {
      if (a[0] !== 'highscore' && !Songs.list.some(s => s.id === a[0])) return 'unknown song'; D().rhythmSong = a[0]; return 'song = ' + a[0]; }],
    level: ['level N · play level N', a => { if (noEscape()) return 'locked'; close(); Game.admin.playAnyLevel(+a[0] || 1); return 'starting level'; }],
    god: ['god on|off', a => { H().god = a[0] !== 'off'; return 'god = ' + H().god; }],
    noobs: ['noobs on|off', a => { H().noObstacles = a[0] !== 'off'; if (H().noObstacles) Game.admin.clearObstacles(); return 'noObstacles = ' + H().noObstacles; }],
    speed: ['speed X', a => { H().speedMul = clamp(+a[0] || 1, .2, 3); return 'speed ×' + H().speedMul; }],
    jump: ['jump X', a => { H().jumpMul = clamp(+a[0] || 1, .4, 3); return 'jump ×' + H().jumpMul; }],
    grav: ['grav X', a => { H().gravMul = clamp(+a[0] || 1, .1, 3); return 'gravity ×' + H().gravMul; }],
    time: ['time X', a => { H().timeScale = clamp(+a[0] || 1, .1, 3); return 'time ×' + H().timeScale; }],
    scale: ['scale X · runner size', a => { H().playerScale = clamp(+a[0] || 1, .3, 4); return 'runner ×' + H().playerScale; }],
    coinmul: ['coinmul X', a => { H().coinMul = clamp(+a[0] || 1, 1, 100); return 'coin value ×' + H().coinMul; }],
    grab: ['grab magnet|jetpack|x2|sneakers|shield|all', a => { if (S().mode !== 'play') return 'start a run first';
      (a[0] === 'all' ? PU_KINDS : PU_KINDS.filter(k => k === a[0])).forEach(k => Game.admin.grab(k)); return 'grabbed'; }],
    skip: ['skip N · jump N metres ahead', a => { if (S().mode !== 'play') return 'start a run first'; Game.admin.skip(+a[0] || 100); return 'skipped'; }],
    vacuum: ['vacuum · pull coins in', () => { Game.admin.vacuum(); return 'vacuumed'; }],
    clear: ['clear · clear obstacles', () => { Game.admin.clearObstacles(); return 'road cleared'; }],
    revive: ['revive · free revive', () => (Game.admin.freeRevive() ? 'revived' : 'not dead')],
    score: ['score N · add to run score', a => { S().score += +a[0] || 0; return 'score = ' + Math.floor(S().score); }],
    runcoins: ['runcoins N · add to run coins', a => { S().coins += Math.round(+a[0]) || 0; return 'run coins = ' + S().coins; }],
    lives: ['lives N · extra lives', a => { S().extraLife = Math.max(0, Math.round(+a[0]) || 0); return 'extra lives = ' + S().extraLife; }],
    reset: ['reset · clear all live tweaks', () => { Object.assign(H(), DEFAULT_HOOKS); Object.assign(fx, FX_DEFAULT); applyFx(); return 'tweaks cleared'; }],
    toast: ['toast TEXT', a => { toast(a.join(' ') || 'hello', 'gold'); return 'sent'; }],
    verify: ['verify · check the save signature', () => 'save valid: ' + Save.verify()],
    cls: ['cls · clear this console', () => { conOut.length = 0; }]
  };
  function runCommand(line) {
    line = line.trim(); if (!line) return;
    conHist.push(line); conPos = conHist.length;
    conOut.push('› ' + line);
    const [cmd, ...args] = line.split(/\s+/), c = COMMANDS[cmd.toLowerCase()];
    if (!c) { say('unknown command — try help'); return; }
    try {
      const r = c[1](args);
      if (r) say(r);
      if (cmd.toLowerCase() !== 'help') { Save.save(); sync(); }
    } catch (e) { say('error: ' + e.message); }
  }
  function tabConsole() {
    const out = [], log = h('pre', { class: 'adm-pre adm-con' });
    log.textContent = conOut.join('\n');
    const inp = h('input', { class: 'adm-text', type: 'text', placeholder: 'e.g. coins 50000, char ember, speed 1.5, level 42', autocomplete: 'off', spellcheck: 'false' });
    const submit = () => { runCommand(inp.value); inp.value = ''; log.textContent = conOut.join('\n'); log.scrollTop = log.scrollHeight; };
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') submit();
      else if (e.key === 'ArrowUp') { conPos = Math.max(0, conPos - 1); inp.value = conHist[conPos] || ''; e.preventDefault(); }
      else if (e.key === 'ArrowDown') { conPos = Math.min(conHist.length, conPos + 1); inp.value = conHist[conPos] || ''; e.preventDefault(); }
    });
    out.push(note('A little command line. ↑/↓ recalls history. Only built-in commands run — nothing here evaluates raw code.'));
    out.push(log, h('div', { class: 'adm-btnrow' }, inp, btn('RUN', submit, 'gold')));
    out.push(sec('Quick commands'));
    out.push(btns(['help', 'verify', 'unlockall', 'coins 1000000', 'god on', 'speed 1.5', 'scale 2', 'reset', 'cls'].map(c => [c, () => { runCommand(c); render(); }])));
    setTimeout(() => { log.scrollTop = log.scrollHeight; }, 0);
    return out;
  }

  /* ---------- AUTO: automation, presets, hotkeys ---------- */
  const auto = { revive: false, keepLives: false, coinSec: 0, puSec: 0, warpSec: 0, warpM: 100, grabSec: 0, clearSec: 0, last: {} };
  const due = (k, sec) => { const n = performance.now(); if (!sec) return false; if (!auto.last[k] || n - auto.last[k] >= sec * 1000) { auto.last[k] = n; return true; } return false; };
  const presets = () => readLS(PRESET_KEY, {});
  const snapNow = () => ({ hooks: Object.assign({}, H()), inf: Object.assign({}, flags.inf), infBoards: flags.infBoards, comboLock: flags.comboLock, forceMult: flags.forceMult, vacuum: flags.vacuum, scoreMul: flags.scoreMul, fx: Object.assign({}, fx), auto: Object.assign({}, auto, { last: {} }) });
  function applySnap(p) {
    Object.assign(H(), DEFAULT_HOOKS, p.hooks || {});
    flags.inf = Object.assign({}, p.inf || {}); flags.infBoards = !!p.infBoards; flags.comboLock = !!p.comboLock;
    flags.forceMult = p.forceMult || 0; flags.vacuum = !!p.vacuum; flags.scoreMul = p.scoreMul || 1;
    Object.assign(fx, FX_DEFAULT, p.fx || {}); applyFx();
    Object.assign(auto, p.auto || {}, { last: {} });
  }
  const HOTKEYS = [['G', 'God mode'], ['N', 'No obstacles'], ['S', 'Slow-mo'], ['C', '+10K coins'], ['V', 'Coin vacuum'], ['K', 'Skip +250m'], ['R', 'Free revive'],
    ['F', 'Finish level'], ['D', 'Coin shower'], ['M', 'Combo ×10'], ['P', 'Grab all power-ups'], ['B', '+1 hoverboard']];
  const HOTFN = {
    KeyG: () => { H().god = !H().god; toast('God ' + (H().god ? 'ON' : 'off')); },
    KeyN: () => { H().noObstacles = !H().noObstacles; if (H().noObstacles) Game.admin.clearObstacles(); toast('No obstacles ' + (H().noObstacles ? 'ON' : 'off')); },
    KeyS: () => { H().timeScale = H().timeScale === 1 ? .4 : 1; toast('Time ×' + H().timeScale); },
    KeyC: () => { Save.addCoins(10000); Save.save(); sync(); toast('+10,000 coins'); },
    KeyV: () => { flags.vacuum = !flags.vacuum; toast('Vacuum ' + (flags.vacuum ? 'ON' : 'off')); },
    KeyK: () => { if (S().mode === 'play') Game.admin.skip(250); },
    KeyR: () => { if (!S().hacker && Game.admin.freeRevive()) toast('Revived', 'gold'); },
    KeyF: () => { if (S().mode === 'play') Game.admin.finish(); },
    KeyD: () => { if (S().mode === 'play') Game.admin.spawnCoins(60); },
    KeyM: () => { if (S().mode === 'play') setCombo(10); },
    KeyP: () => { if (S().mode === 'play') PU_KINDS.forEach(k => Game.admin.grab(k)); },
    KeyB: () => { if (S().mode === 'play') { S().boards += 1; toast('+1 hoverboard', 'good'); } }
  };
  window.addEventListener('keydown', e => {
    if (!hot.on || !e.altKey || e.ctrlKey || e.metaKey || !HOTFN[e.code]) return;
    if (!Save.d || (!isOpen && (document.getElementById('rhythm') && !document.getElementById('rhythm').classList.contains('hidden')))) return;
    e.preventDefault(); e.stopPropagation();
    try { HOTFN[e.code](); } catch (err) { console.error(err); }
  });

  function tabAuto() {
    const out = [];
    out.push(note('Things that keep happening by themselves while you run. All session-only.'));
    out.push(sec('Safety net'));
    out.push(toggle('Auto free revive', () => auto.revive, v => { auto.revive = v; }, 'instantly revives you after every crash (not in HACKER mode)'));
    out.push(toggle('Always keep 3 extra lives', () => auto.keepLives, v => { auto.keepLives = v; }));
    out.push(sec('Timed drops', 'seconds between events · 0 = off'));
    out.push(slider('Coin shower every', 0, 30, 1, () => auto.coinSec, v => { auto.coinSec = v; }, v => v ? v + 's' : 'off', 0));
    out.push(slider('Random power-up every', 0, 30, 1, () => auto.puSec, v => { auto.puSec = v; }, v => v ? v + 's' : 'off', 0));
    out.push(slider('Grab all power-ups every', 0, 60, 1, () => auto.grabSec, v => { auto.grabSec = v; }, v => v ? v + 's' : 'off', 0));
    out.push(slider('Clear the road every', 0, 30, 1, () => auto.clearSec, v => { auto.clearSec = v; }, v => v ? v + 's' : 'off', 0));
    out.push(slider('Warp forward every', 0, 60, 1, () => auto.warpSec, v => { auto.warpSec = v; }, v => v ? v + 's' : 'off', 0));
    out.push(slider('…warp distance', 25, 1000, 25, () => auto.warpM, v => { auto.warpM = v; }, v => v + 'm', 100));
    out.push(btns([['ALL AUTOMATION OFF', () => { Object.assign(auto, { revive: false, keepLives: false, coinSec: 0, puSec: 0, warpSec: 0, grabSec: 0, clearSec: 0 }); render(); click(); }, 'red']]));

    out.push(sec('Hotkeys', 'hold Alt'));
    out.push(toggle('Enable Alt-hotkeys', () => hot.on, v => { hot.on = v; writeLS(HOT_KEY, hot); }, 'work with the panel closed, mid-run'));
    out.push(note(HOTKEYS.map(([k, l]) => 'Alt+' + k + '  ' + l).join('   ·   ')));

    out.push(sec('My presets', 'save your whole tweak set under a name'));
    const nameIn = h('input', { class: 'adm-text', type: 'text', placeholder: 'preset name', maxlength: 24 });
    out.push(h('div', { class: 'adm-btnrow' }, nameIn, btn('SAVE', () => {
      const n = nameIn.value.trim(); if (!n) { toast('Give it a name first', 'bad'); return; }
      const all = presets(); all[n] = snapNow(); writeLS(PRESET_KEY, all); toast('Saved preset ' + n, 'gold'); render();
    }, 'gold')));
    const all = presets(), names = Object.keys(all);
    if (!names.length) out.push(note('No presets saved yet.'));
    names.forEach(n => out.push(h('div', { class: 'adm-item on' },
      h('div', { class: 'adm-item-main' }, h('b', { text: n })),
      btn('APPLY', () => { applySnap(all[n]); toast('Applied ' + n, 'good'); render(); }, 'green'),
      btn('✕', () => { const a = presets(); delete a[n]; writeLS(PRESET_KEY, a); render(); }, 'red'))));
    return out;
  }

  /* ---------- FUN: visuals + silly runner stuff ---------- */
  function tabFun() {
    const out = [], hk = H();
    out.push(sec('Runner'));
    out.push(slider('Runner size', 0.3, 4, 0.05, () => hk.playerScale, v => { hk.playerScale = v; }, v => '×' + v.toFixed(2), 1));
    out.push(btns([['TINY', () => { hk.playerScale = .5; render(); }], ['NORMAL', () => { hk.playerScale = 1; render(); }], ['BIG', () => { hk.playerScale = 1.8; render(); }], ['GIANT', () => { hk.playerScale = 3; render(); }, 'gold']]));
    out.push(toggle('Invisible runner', () => hk.hidePlayer, v => { hk.hidePlayer = v; }));
    out.push(slider('Extra head start', 0, 5000, 50, () => hk.headStart, v => { hk.headStart = v; }, v => v + 'm', 0));

    out.push(sec('Randomisers'));
    out.push(btns([
      ['RANDOM CHARACTER', () => act(() => { const o = CHARACTERS.filter(c => D().owned.includes(c.id)); D().character = o[Math.random() * o.length | 0].id; }, 'Random character')],
      ['RANDOM BOARD', () => act(() => { const o = BOARDS.filter(b => D().ownedBoards.includes(b.id)); D().board = o[Math.random() * o.length | 0].id; }, 'Random board')],
      ['RANDOM MAP', () => { hk.biome = Math.random() * World.BIOMES.length | 0; toast('Map: ' + World.BIOMES[hk.biome].name); render(); }],
      ['RANDOM SEASON', () => act(() => { const s = World.SEASON_ORDER; D().opts.season = s[Math.random() * s.length | 0]; UI.paintSeason(); }, 'Random season')]
    ]));

    out.push(sec('Screen filters', 'session only'));
    out.push(slider('Grayscale', 0, 100, 5, () => fx.gray, v => { fx.gray = v; applyFx(); }, v => v + '%', 0));
    out.push(slider('Sepia', 0, 100, 5, () => fx.sepia, v => { fx.sepia = v; applyFx(); }, v => v + '%', 0));
    out.push(slider('Contrast', 30, 250, 5, () => fx.con, v => { fx.con = v; applyFx(); }, v => v + '%', 100));
    out.push(slider('Blur', 0, 8, 0.5, () => fx.blur, v => { fx.blur = v; applyFx(); }, v => v + 'px', 0));
    out.push(slider('Tilt', -45, 45, 1, () => fx.rot, v => { fx.rot = v; applyFx(); }, v => v + '°', 0));
    out.push(slider('Zoom', 60, 200, 5, () => fx.zoom, v => { fx.zoom = v; applyFx(); }, v => v + '%', 100));
    out.push(toggle('Flip upside-down', () => fx.flipY, v => { fx.flipY = v; applyFx(); }, 'visual only'));
    out.push(toggle('Disco (cycling colours)', () => fx.disco, v => { fx.disco = v; if (!v) { fx.hue = 0; applyFx(); } }));
    out.push(btns([
      ['VAPORWAVE', () => { Object.assign(fx, { hue: 290, sat: 190, bri: 110 }); applyFx(); render(); }],
      ['NOIR', () => { Object.assign(fx, { gray: 100, con: 140 }); applyFx(); render(); }],
      ['OLD FILM', () => { Object.assign(fx, { sepia: 80, con: 120, bri: 90 }); applyFx(); render(); }],
      ['NEON', () => { Object.assign(fx, { sat: 280, con: 130 }); applyFx(); render(); }],
      ['RESET FILTERS', () => { Object.assign(fx, FX_DEFAULT); applyFx(); render(); click(); }, 'red']
    ]));

    out.push(sec('Toasts & party'));
    out.push(btns([
      ['CONFETTI TOASTS', () => ['gold', 'good', 'bad', 'gold', 'good'].forEach((k, i) => setTimeout(() => toast(['🎉 PARTY!', '⭐ SICK!', '🔥 ON FIRE!', '💎 RICH!', '🚀 ZOOM!'][i], k), i * 160))],
      ['FAKE NEW RECORD', () => { try { Sound.sfx.newRecord(); } catch (e) { /* audio not ready */ } toast('NEW RECORD!', 'gold'); }],
      ['COIN SHOWER NOW', () => { if (needRun()) { Game.admin.spawnCoins(90); toast('Coins ahead!'); } }, 'gold']
    ]));
    return out;
  }

  /* ---------- SOUND ---------- */
  function tabSound() {
    const out = [], o = () => D().opts;
    out.push(sec('Switches'));
    out.push(toggle('Music', () => o().music, v => { o().music = v; Save.save(); Sound.setMusic(v); UI.bindSettings(); }));
    out.push(toggle('Sound effects', () => o().sfx, v => { o().sfx = v; Save.save(); Sound.setSfx(v); UI.bindSettings(); }));
    out.push(sec('Sound test', 'plays every effect in the game'));
    const names = Object.keys(Sound.sfx).filter(k => typeof Sound.sfx[k] === 'function');
    out.push(h('div', { class: 'adm-btnrow' }, names.map(n => btn(n, () => { try { Sound.resume(); Sound.sfx[n](5); } catch (e) { toast('Could not play ' + n, 'bad'); } }))));
    out.push(sec('Jingles'));
    out.push(btns([
      ['VICTORY', () => { try { Sound.sfx.newRecord(); } catch (e) { /* noop */ } }],
      ['ARPEGGIO', () => { ['coin', 'bigCoin', 'powerup', 'buy', 'mission'].forEach((n, i) => setTimeout(() => { try { Sound.sfx[n](); } catch (e) { /* noop */ } }, i * 260)); }],
      ['CRASH + STUMBLE', () => { try { Sound.sfx.crash(); setTimeout(() => Sound.sfx.stumble(), 400); } catch (e) { /* noop */ } }]
    ]));
    return out;
  }

  /* ---------- LOG ---------- */
  function tabLog() {
    const out = [];
    out.push(sec('Action log', 'everything the panel and the game toasted this session'));
    out.push(btns([['CLEAR', () => { LOG.length = 0; render(); }, 'red'], ['COPY', () => { try { navigator.clipboard.writeText(LOG.join('\n')); toast('Log copied', 'good'); } catch (e) { toast('Could not copy', 'bad'); } }]]));
    const box = h('pre', { class: 'adm-pre adm-con' }); box.textContent = LOG.length ? LOG.join('\n') : 'Nothing yet.';
    out.push(box);
    out.push(sec('Script errors', 'caught since the page loaded'));
    const eb = h('pre', { class: 'adm-pre adm-con' }); eb.textContent = ERRS.length ? ERRS.join('\n') : 'None 🎉';
    out.push(eb);
    return out;
  }

  /* ---------- TOOLS: bulk helpers ---------- */
  let bulkN = 25;
  function tabTools() {
    const out = [], d = D();
    out.push(sec('Bulk level tools', 'applies to the selected difficulty below'));
    out.push(select('Difficulty', MODES_LIST.map(m => [m, MODES[m].name]), () => playMode || d.mode, v => { playMode = v; }));
    out.push(num('First N levels', () => bulkN, v => { bulkN = v; }, 1, Levels.COUNT));
    const lv = () => D().levels[playMode || D().mode];
    out.push(btns([
      ['UNLOCK FIRST N', () => act(() => { lv().unlocked = Math.max(lv().unlocked, bulkN); }, 'Unlocked ' + bulkN + ' levels')],
      ['3★ FIRST N', () => act(() => { const L = lv(); for (let i = 0; i < bulkN; i++) L.stars[i] = 3; L.unlocked = Math.max(L.unlocked, Math.min(Levels.COUNT, bulkN + 1)); }, 'Levels 1–' + bulkN + ' at 3 stars', 'gold'), 'gold'],
      ['CLEAR STARS', () => act(() => { lv().stars = []; }, 'Stars cleared', 'bad'), 'red'],
      ['RESET LEVELS', () => act(() => { D().levels[playMode || D().mode] = { unlocked: 1, stars: [] }; }, 'Levels reset', 'bad'), 'red']
    ]));
    out.push(btns([
      ['RANDOM LEVEL', () => { if (noEscape()) return; D().mode = playMode || D().mode; Save.save(); close(); Game.admin.playAnyLevel(1 + Math.random() * Levels.COUNT | 0); }, 'purple'],
      ['LAST LEVEL', () => { if (noEscape()) return; D().mode = playMode || D().mode; Save.save(); close(); Game.admin.playAnyLevel(Levels.COUNT); }, 'purple']
    ]));

    out.push(sec('Bulk shop tools'));
    out.push(btns([
      ['MAX UPGRADES', () => act(() => UPGRADES.forEach(u => { D().upgrades[u.id] = u.max; }), 'Upgrades maxed', 'gold'), 'gold'],
      ['RESET UPGRADES', () => act(() => UPGRADES.forEach(u => { D().upgrades[u.id] = 0; }), 'Upgrades reset', 'bad'), 'red'],
      ['OWN ALL BOARDS', () => act(() => { D().ownedBoards = BOARDS.map(b => b.id); }, 'All boards owned', 'gold')],
      ['OWN ALL NORMAL CHARS', () => act(() => { D().owned = Array.from(new Set([...D().owned, ...CHARACTERS.filter(c => !c.admin && !c.secret).map(c => c.id)])); }, 'All normal characters owned', 'gold')],
      ['OWN ALL ADMIN ITEMS', () => act(() => { const dd = D(); CHARACTERS.filter(c => c.admin).forEach(c => { own(dd.owned, c.id); own(dd.secretsFound, c.id); }); BOARDS.filter(b => b.admin).forEach(b => own(dd.ownedBoards, b.id)); }, 'All admin-only items owned', 'gold')]
    ]));
    out.push(btns([
      ['×2 COINS', () => act(() => { D().coins = Math.min(999999999, D().coins * 2); }, 'Coins doubled')],
      ['×10 COINS', () => act(() => { D().coins = Math.min(999999999, D().coins * 10); }, 'Coins ×10')],
      ['HALVE COINS', () => act(() => { D().coins = Math.floor(D().coins / 2); }, 'Coins halved', 'bad'), 'red']
    ]));

    out.push(sec('Secrets'));
    out.push(toggle('Secret characters revealed', () => (D().secretsFound || []).length > 0 && CHARACTERS.filter(c => c.secret).every(c => D().secretsFound.includes(c.id)),
      v => act(() => { D().secretsFound = v ? CHARACTERS.filter(c => c.secret).map(c => c.id) : []; }, v ? 'Secrets revealed' : 'Secrets hidden')));

    out.push(sec('System'));
    out.push(btns([
      ['VERIFY SAVE', () => toast(Save.verify() ? 'Save signature is valid ✔' : 'Save signature BROKEN', Save.verify() ? 'good' : 'bad')],
      ['COPY SAVE', () => { try { navigator.clipboard.writeText(JSON.stringify(D())); toast('Save copied', 'good'); } catch (e) { toast('Could not copy', 'bad'); } }],
      ['FULLSCREEN', () => { try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); } catch (e) { /* blocked */ } }],
      ['RELOAD GAME', () => location.reload(), 'red']
    ]));
    let bytes = 0; try { for (const k in localStorage) if (Object.prototype.hasOwnProperty.call(localStorage, k)) bytes += (k.length + String(localStorage[k]).length) * 2; } catch (e) { /* blocked */ }
    out.push(note('Browser storage used by this game: ' + (bytes / 1024).toFixed(1) + ' KB · save size ' + (JSON.stringify(D()).length / 1024).toFixed(1) + ' KB'));
    out.push(btns([['CLEAR PANEL SETTINGS', () => { try { [PN_KEY, PRESET_KEY, HOT_KEY].forEach(k => localStorage.removeItem(k)); } catch (e) { /* blocked */ } Object.assign(pn, PN_DEFAULT); applyPanel(); toast('Panel settings cleared'); render(); }, 'red']]));
    return out;
  }

  /* ---------- JAM cheats appended to the JAM tab ---------- */
  function jamExtras() {
    const out = [], A = Rhythm.admin;
    out.push(sec('Jam cheats', 'work while playing the rhythm game'));
    out.push(toggle('Never lose health', () => A.invincible, v => { A.invincible = v; }, 'health is held up so you can always finish'));
    out.push(toggle('Autoplay', () => A.autoplay, v => { A.autoplay = v; }, 'hits every note for you'));
    out.push(slider('Jam coin reward', 1, 50, 1, () => A.rewardMul, v => { A.rewardMul = v; }, v => '×' + v, 1));
    return out;
  }

  const tabLevels2 = () => tabLevels();
  const tabJam2 = () => [...tabJam(), ...jamExtras()];

  const TABS = [['player', 'PLAYER', tabPlayer], ['unlocks', 'UNLOCKS', tabUnlocks], ['levels', 'LEVELS', tabLevels], ['rebirth', 'REBIRTH', tabRebirth], ['jam', 'JAM', tabJam2], ['tools', 'TOOLS', tabTools], ['console', 'CONSOLE', tabConsole], ['auto', 'AUTO', tabAuto], ['fun', 'FUN', tabFun], ['sound', 'SOUND', tabSound],
    ['run', 'LIVE RUN', tabRun], ['world', 'WORLD', tabWorld], ['missions', 'MISSIONS', tabMissions], ['debug', 'DEBUG', tabDebug], ['panel', 'PANEL', tabPanel], ['data', 'DATA', tabData], ['log', 'LOG', tabLog]];

  /* ============================================================
     PANEL SHELL
     ============================================================ */
  const PN_KEY = 'riggy-admin-panel', PN_DEFAULT = { w: 520, side: 'right', max: false, min: false, op: 100, accent: '', zoom: 100 };
  const pn = Object.assign({}, PN_DEFAULT);
  try { Object.assign(pn, JSON.parse(localStorage.getItem(PN_KEY)) || {}); } catch (e) { /* first run */ }
  pn.min = false;                                   // always open fully expanded
  function applyPanel() {
    if (!root) return;
    pn.w = clamp(Math.round(pn.w) || 520, 300, 3000);
    root.style.width = pn.max ? '100vw' : Math.min(pn.w, window.innerWidth) + 'px';
    root.style.opacity = pn.op / 100;
    root.style.zoom = (pn.zoom || 100) / 100;
    if (pn.accent) root.style.setProperty('--gold', pn.accent); else root.style.removeProperty('--gold');
    root.classList.toggle('left', pn.side === 'left');
    root.classList.toggle('min', !!pn.min);
    if (btnMax) btnMax.textContent = pn.max ? '❐' : '⛶';
    try { localStorage.setItem(PN_KEY, JSON.stringify(pn)); } catch (e) { /* storage blocked */ }
  }
  window.addEventListener('resize', () => applyPanel());

  let root, body, tabBar, liveEl, btnMax, tab = 'player', isOpen = false, liveTimer = 0;

  function build() {
    tabBar = h('div', { class: 'adm-tabs' });
    liveEl = h('div', { class: 'adm-live' });
    body = h('div', { class: 'adm-body' });
    root = h('aside', { id: 'adminPanel', class: 'adm hidden', role: 'dialog', 'aria-label': 'Admin panel' },
      h('div', { class: 'adm-grip', title: 'Drag to resize · double-click to reset' }),
      h('div', { class: 'adm-head' },
        h('h2', { text: 'ADMIN' }), liveEl,
        h('div', { class: 'adm-hbtns' },
          h('button', { class: 'back-btn', type: 'button', title: 'Dock left / right', text: '⇆', onclick: () => { pn.side = pn.side === 'left' ? 'right' : 'left'; applyPanel(); click(); } }),
          btnMax = h('button', { class: 'back-btn', type: 'button', title: 'Full screen / restore', text: '⛶', onclick: () => { pn.max = !pn.max; applyPanel(); click(); } }),
          h('button', { class: 'back-btn', type: 'button', title: 'Minimise / expand', text: '▁', onclick: () => { pn.min = !pn.min; applyPanel(); click(); } }),
          h('button', { class: 'back-btn', type: 'button', title: 'Close (Esc)', text: '✕', onclick: () => close() }))),
      tabBar, body,
      h('div', { class: 'adm-foot', text: 'Progress edits are saved instantly and stay validly signed. Live-run tweaks reset on reload.' }));
    /* keep every key typed in here away from the game's own hotkeys */
    root.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') close(); });
    root.addEventListener('keyup', e => e.stopPropagation());
    document.body.append(root);

    /* drag the gold edge to resize */
    const grip = root.querySelector('.adm-grip');
    grip.addEventListener('pointerdown', e => {
      e.preventDefault(); grip.setPointerCapture(e.pointerId); pn.max = false; root.classList.add('sizing');
    });
    grip.addEventListener('pointermove', e => {
      if (!grip.hasPointerCapture(e.pointerId)) return;
      pn.w = clamp(pn.side === 'left' ? e.clientX : window.innerWidth - e.clientX, 300, window.innerWidth);
      applyPanel();
    });
    const stop = e => { if (grip.hasPointerCapture(e.pointerId)) grip.releasePointerCapture(e.pointerId); root.classList.remove('sizing'); if (tab === 'panel') render(); };
    grip.addEventListener('pointerup', stop); grip.addEventListener('pointercancel', stop);
    grip.addEventListener('dblclick', () => { pn.w = 520; pn.max = false; applyPanel(); if (tab === 'panel') render(); });
    applyPanel();
  }

  function render() {
    if (!root) return;
    const keep = body.scrollTop;
    tabBar.replaceChildren(...TABS.map(([id, label]) =>
      h('button', { class: 'adm-tab' + (id === tab ? ' active' : ''), type: 'button', text: label, onclick: () => { tab = id; body.scrollTop = 0; render(); click(); } })));
    const t = TABS.find(x => x[0] === tab);
    body.replaceChildren(...t[2]());
    body.scrollTop = keep;
  }

  function live() {
    const s = S(), hk = H();
    const on = [hk.god && 'GOD', hk.noObstacles && 'NO-OBS', hk.timeScale !== 1 && '⏱×' + hk.timeScale.toFixed(2), hk.speedMul !== 1 && '»×' + hk.speedMul.toFixed(2)].filter(Boolean);
    if (tab === 'debug') paintDebug();
    liveEl.textContent = `${s.mode.toUpperCase()} · ${Math.floor(s.dist)}m · ${U.fmt(s.score)} pts · ${s.coins} coins · ${Math.round(s.speed * 0.09)} km/h` + (on.length ? '  [' + on.join(' ') + ']' : '');
  }

  function open() {
    if (!root) build();
    pn.min = false; applyPanel();
    if (S().mode === 'play') Game.togglePause();        // never die while you are in the menu
    isOpen = true;
    root.classList.remove('hidden');
    render(); live();
    clearInterval(liveTimer); liveTimer = setInterval(live, 250);
    click(); toast('ADMIN PANEL', 'gold');
  }
  function close() {
    isOpen = false;
    if (root) root.classList.add('hidden');
    clearInterval(liveTimer);
  }

  /* ============================================================
     SECRET CODE: type the code anywhere, then press Enter
     ============================================================ */
  /* second step: a PIN prompt (typed or tapped), 3 wrong tries locks it for 30s */
  let pinEl = null, pinTries = 0, pinLockUntil = 0;
  function closePin() { if (pinEl) { pinEl.remove(); pinEl = null; } }
  function askPin() {
    if (S().mode === 'play') Game.togglePause();
    const wait = pinLockUntil - Date.now();
    if (wait > 0) { toast('Locked — try again in ' + Math.ceil(wait / 1000) + 's', 'bad'); return; }
    closePin();
    const inp = h('input', { type: 'password', inputmode: 'numeric', autocomplete: 'off', maxlength: 12, class: 'adm-pin-in', placeholder: '• • • • •' });
    const msg = h('div', { class: 'adm-pin-msg', text: 'Type the PIN, then press Enter' });
    const card = h('div', { class: 'adm-pin-card' });
    const submit = () => {
      if (hash(inp.value) === PIN_HASH) { pinTries = 0; closePin(); open(); return; }
      inp.value = '';
      if (++pinTries >= 3) { pinTries = 0; pinLockUntil = Date.now() + 30000; closePin(); toast('Too many wrong PINs — locked for 30s', 'bad'); return; }
      msg.textContent = 'Wrong PIN — ' + (3 - pinTries) + ' ' + (3 - pinTries === 1 ? 'try' : 'tries') + ' left';
      card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      try { Sound.sfx.deny(); } catch (e) { /* no audio */ }
      inp.focus();
    };
    const pad = h('div', { class: 'adm-pad' }, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].map(k =>
      h('button', { type: 'button', class: 'adm-key' + (k === 'OK' ? ' ok' : ''), text: k, onclick: () => {
        if (k === 'OK') submit(); else if (k === '⌫') inp.value = inp.value.slice(0, -1); else inp.value += k;
        inp.focus();
      } })));
    card.append(h('h3', { text: 'ADMIN PIN' }), inp, msg, pad, h('button', { type: 'button', class: 'adm-btn red', text: 'CANCEL', onclick: closePin }));
    pinEl = h('div', { class: 'adm-pin' }, card);
    pinEl.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      else if (e.key === 'Escape') closePin();
    });
    pinEl.addEventListener('keyup', e => e.stopPropagation());
    document.body.append(pinEl);
    inp.focus();
  }

  let buf = '';
  window.addEventListener('keydown', e => {
    if (pinEl) {                                        // PIN prompt up: nothing else may receive keys
      if (!pinEl.contains(e.target)) { e.stopImmediatePropagation(); e.preventDefault(); if (e.key === 'Escape') closePin(); }
      return;
    }
    if (isOpen) {                                       // panel open: only the panel may receive keys
      if (!root.contains(e.target)) { e.stopImmediatePropagation(); e.preventDefault(); if (e.key === 'Escape') close(); }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'Enter') {
      const hit = buf.length >= CODE_LEN && hash(buf.slice(-CODE_LEN)) === CODE_HASH;
      buf = '';
      if (hit) { e.preventDefault(); e.stopImmediatePropagation(); askPin(); }
      return;
    }
    if (e.key === 'Backspace') { buf = buf.slice(0, -1); return; }
    if (e.key.length === 1) buf = (buf + e.key.toLowerCase()).slice(-40);
  }, true);

  /* ============================================================
     BACKGROUND TICK — applies the "always on" live-run switches
     ============================================================ */
  setInterval(() => {
    const s = S();
    if (fx.disco) { fx.hue = (fx.hue + 4) % 360; applyFx(); }
    if (auto.revive && s.mode === 'dead' && !s.hacker) Game.admin.freeRevive();
    if (s.mode !== 'play' && s.mode !== 'pause') return;
    if (s.mode === 'play') {
      if (auto.keepLives) s.extraLife = Math.max(s.extraLife || 0, 3);
      if (due('coin', auto.coinSec)) Game.admin.spawnCoins(45);
      if (due('pu', auto.puSec)) Game.admin.spawnPickup(PU_KINDS[Math.random() * PU_KINDS.length | 0]);
      if (due('grab', auto.grabSec)) PU_KINDS.forEach(k => Game.admin.grab(k));
      if (due('clear', auto.clearSec)) Game.admin.clearObstacles();
      if (due('warp', auto.warpSec)) Game.admin.skip(auto.warpM);
    }
    PU_KINDS.forEach(k => {
      if (!flags.inf[k]) return;
      if (s.powers[k] <= 0 && s.mode === 'play') Game.admin.grab(k);     // proper pickup effects once…
      if (s.powers[k] > 0) s.powers[k] = Math.max(s.powers[k], 99);       // …then keep it topped up
    });
    if (flags.infBoards) { s.boards = Math.max(s.boards, 9); s.boardUsed = 0; }
    if (flags.comboLock && s.combo > 0) s.comboTimer = 3.2;
    if (flags.forceMult > 0) s.multiplier = flags.forceMult;
    if (flags.vacuum && s.mode === 'play') Game.admin.vacuum();
    if (flags.scoreMul > 1 && s.mode === 'play') { const dl = s.score - flags.lastScore; if (dl > 0 && dl < 5000) s.score += dl * (flags.scoreMul - 1); }
    flags.lastScore = s.score;
  }, 50);

  return { askPin, close, hash, get isOpen() { return isOpen; } };
})();
