/* ============================================================
   ui.js — menus, sheets, HUD plumbing, toasts and the little
   spinning Riggy canvases in the menu / character screens.
   ============================================================ */
'use strict';

const UI = (() => {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  const el = {
    hud: $('#hud'), menu: $('#menu'), characters: $('#characters'), shop: $('#shop'),
    missions: $('#missions'), how: $('#how'), settings: $('#settings'),
    pause: $('#pause'), gameover: $('#gameover'), countdown: $('#countdown'),
    score: $('#scoreValue'), dist: $('#distValue'), speed: $('#speedValue'),
    coins: $('#coinCount'), multiChip: $('#multiChip'), multi: $('#multiValue'),
    powerupBar: $('#powerupBar'), comboPop: $('#comboPop'), missionToast: $('#missionToast'),
    hoverBtn: $('#hoverBtn'), hbCount: $('#hbCount'),
    toastHost: $('#toastHost'), countNum: $('#countNum'), fps: $('#fps')
  };

  let previewChar = Save.d.character;
  let shopTab = 'upgrades';
  const cardCanvases = [];       // {canvas, ctx, skinId}

  /* ---------------- screen switching ---------------- */
  function show(name) {
    ['menu', 'characters', 'shop', 'missions', 'how', 'settings', 'pause', 'gameover'].forEach(k => el[k].classList.add('hidden'));
    if (name) el[name].classList.remove('hidden');
  }
  function hideAllSheets() { ['characters', 'shop', 'missions', 'how', 'settings'].forEach(k => el[k].classList.add('hidden')); }

  function toast(msg, kind = '') {
    const d = document.createElement('div');
    d.className = 'toast ' + kind;
    d.textContent = msg;
    el.toastHost.appendChild(d);
    setTimeout(() => d.remove(), 2600);
  }

  /* ---------------- HUD ---------------- */
  let lastScoreShown = -1;
  function hud(state) {
    const sc = Math.floor(state.score);
    if (sc !== lastScoreShown) {
      el.score.textContent = U.fmt(sc);
      if (sc - lastScoreShown > 150) { el.score.classList.remove('bump'); void el.score.offsetWidth; el.score.classList.add('bump'); }
      lastScoreShown = sc;
    }
    el.dist.textContent = Math.floor(state.dist);
    el.speed.textContent = Math.round(state.speed);
    el.coins.textContent = U.fmt(state.coins);
    const m = state.multiplier;
    if (m > 1) { el.multiChip.classList.remove('hidden'); el.multi.textContent = m.toFixed(m % 1 ? 1 : 0); }
    else el.multiChip.classList.add('hidden');
    el.hbCount.textContent = state.boards;
    el.hoverBtn.classList.toggle('empty', state.boards <= 0 || state.onBoard);
  }

  /* powerup timer chips */
  const chips = new Map();
  function powerups(active) {
    // remove finished
    chips.forEach((node, key) => { if (!active[key] || active[key] <= 0) { node.remove(); chips.delete(key); } });
    Object.keys(active).forEach(key => {
      const t = active[key];
      if (t <= 0) return;
      let node = chips.get(key);
      if (!node) {
        node = document.createElement('div');
        node.className = 'pu-timer';
        const st = Props.PU_STYLE[key] || { c1: '#fff', c2: '#888' };
        node.innerHTML = `<div class="glyph" style="background:linear-gradient(180deg,${st.c1},${st.c2})"></div>
                          <div class="txt">${key.toUpperCase()}</div>
                          <div class="bar"><i style="background:linear-gradient(90deg,${st.c1},${st.c2})"></i></div>`;
        el.powerupBar.appendChild(node);
        chips.set(key, node);
        node.dataset.max = t;
      }
      const max = Math.max(Number(node.dataset.max) || t, t);
      node.dataset.max = max;
      node.querySelector('.bar i').style.width = (100 * t / max) + '%';
    });
  }

  function combo(n) {
    el.comboPop.textContent = 'x' + n + ' COMBO!';
    el.comboPop.classList.remove('show'); void el.comboPop.offsetWidth;
    el.comboPop.classList.add('show');
  }
  function missionToast(text) {
    el.missionToast.textContent = 'MISSION COMPLETE — ' + text;
    el.missionToast.classList.add('show');
    setTimeout(() => el.missionToast.classList.remove('show'), 2800);
  }

  /* ---------------- menu / stats ---------------- */
  function refreshStats() {
    const d = Save.d;
    $('#bestScore').textContent = U.fmt(d.best);
    $('#walletCoins').textContent = U.fmt(d.coins);
    $('#totalRuns').textContent = U.fmt(d.runs);
    $('#bestDist').textContent = U.fmt(d.bestDist);
    $$('.wallet').forEach(n => n.textContent = U.fmt(d.coins));
  }

  /* ---------------- character screen ---------------- */
  function buildCharacters() {
    const grid = $('#charGrid');
    grid.innerHTML = '';
    cardCanvases.length = 0;
    CHARACTERS.forEach(c => {
      const owned = Save.d.owned.includes(c.id);
      const card = document.createElement('div');
      card.className = 'char-card' + (Save.d.character === c.id ? ' active' : '');
      card.innerHTML = `<canvas width="220" height="200"></canvas>
        <div class="card-name">${c.name.toUpperCase()}</div>
        ${owned ? `<div class="card-owned">${Save.d.character === c.id ? 'EQUIPPED' : 'OWNED'}</div>`
          : `<div class="card-price">${U.fmt(c.price)} coins</div>`}
        ${owned ? '' : '<div class="card-lock">&#128274;</div>'}`;
      card.onclick = () => { Sound.sfx.button(); previewChar = c.id; renderCharPreview(); markActive(); };
      grid.appendChild(card);
      const cv = card.querySelector('canvas');
      cardCanvases.push({ canvas: cv, ctx: cv.getContext('2d'), skinId: c.id });
    });
    renderCharPreview();
  }
  function markActive() {
    $$('#charGrid .char-card').forEach((card, i) => {
      card.classList.toggle('active', CHARACTERS[i].id === previewChar);
    });
  }
  function renderCharPreview() {
    const c = CHARACTERS.find(x => x.id === previewChar);
    $('#charName').textContent = c.name;
    $('#charDesc').textContent = c.desc;
    $('#charPerk').textContent = c.perk;
    const owned = Save.d.owned.includes(c.id);
    const btn = $('#charAction');
    if (Save.d.character === c.id) { btn.textContent = 'EQUIPPED'; btn.disabled = true; btn.style.filter = 'grayscale(.6)'; }
    else if (owned) { btn.textContent = 'SELECT'; btn.disabled = false; btn.style.filter = ''; }
    else { btn.textContent = `BUY — ${U.fmt(c.price)}`; btn.disabled = false; btn.style.filter = ''; }
  }
  $('#charAction').onclick = () => {
    const c = CHARACTERS.find(x => x.id === previewChar);
    if (Save.d.owned.includes(c.id)) {
      Save.d.character = c.id; Save.save(); Sound.sfx.button();
      toast(c.name + ' equipped', 'good');
    } else if (Save.spend(c.price)) {
      Save.d.owned.push(c.id); Save.d.character = c.id; Save.save();
      Sound.sfx.buy(); toast('Unlocked ' + c.name + '!', 'gold');
    } else { Sound.sfx.deny(); toast('Not enough coins', 'bad'); return; }
    refreshStats(); buildCharacters();
  };

  /* ---------------- shop ---------------- */
  function buildShop() {
    const grid = $('#shopGrid');
    grid.innerHTML = '';
    if (shopTab === 'upgrades') {
      UPGRADES.forEach(u => {
        const lvl = Save.d.upgrades[u.id] || 0;
        const maxed = lvl >= u.max;
        const cost = upgradeCost(u.id, lvl);
        const card = document.createElement('div');
        card.className = 'shop-card';
        card.innerHTML = `<div class="shop-icon">${glyphFor(u.id)}</div>
          <div class="card-name">${u.name.toUpperCase()}</div>
          <div class="shop-desc">${u.desc} (${u.per} per level)</div>
          <div class="lvl-dots">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>
          <button class="buy-btn" ${maxed ? 'disabled' : ''}>${maxed ? 'MAXED' : U.fmt(cost) + ' COINS'}</button>`;
        card.querySelector('button').onclick = e => {
          e.stopPropagation();
          if (maxed) return;
          if (Save.spend(cost)) { Save.d.upgrades[u.id] = lvl + 1; Save.save(); Sound.sfx.buy(); toast(u.name + ' → level ' + (lvl + 1), 'good'); }
          else { Sound.sfx.deny(); toast('Not enough coins', 'bad'); }
          refreshStats(); buildShop();
        };
        grid.appendChild(card);
      });
    } else if (shopTab === 'boards') {
      BOARDS.forEach(b => {
        const owned = Save.d.ownedBoards.includes(b.id);
        const equipped = Save.d.board === b.id;
        const card = document.createElement('div');
        card.className = 'shop-card';
        card.innerHTML = `<div class="board-art" style="height:56px;display:grid;place-items:center">
            <div style="width:88px;height:20px;border-radius:12px;border:3px solid #fff;background:linear-gradient(180deg,${b.col},${U.shade(b.col, -.45)});box-shadow:0 10px 18px ${U.rgba(b.col, .5)}"></div>
          </div>
          <div class="card-name">${b.name.toUpperCase()}</div>
          <div class="shop-desc">${b.desc}</div>
          <button class="buy-btn" ${equipped ? 'disabled' : ''}>${equipped ? 'EQUIPPED' : owned ? 'EQUIP' : U.fmt(b.price) + ' COINS'}</button>`;
        card.querySelector('button').onclick = e => {
          e.stopPropagation();
          if (equipped) return;
          if (owned) { Save.d.board = b.id; Save.save(); Sound.sfx.button(); toast(b.name + ' equipped', 'good'); }
          else if (Save.spend(b.price)) { Save.d.ownedBoards.push(b.id); Save.d.board = b.id; Save.save(); Sound.sfx.buy(); toast('Unlocked ' + b.name, 'gold'); }
          else { Sound.sfx.deny(); toast('Not enough coins', 'bad'); }
          refreshStats(); buildShop();
        };
        grid.appendChild(card);
      });
    } else {
      CONSUMABLES.forEach(c => {
        const card = document.createElement('div');
        card.className = 'shop-card';
        card.innerHTML = `<div class="shop-icon">&#127939;</div>
          <div class="card-name">${c.name.toUpperCase()}</div>
          <div class="shop-desc">${c.desc}</div>
          <div class="card-price">You own ${Save.d.hoverboards}</div>
          <button class="buy-btn">${U.fmt(c.price)} COINS</button>`;
        card.querySelector('button').onclick = e => {
          e.stopPropagation();
          if (Save.spend(c.price)) { Save.d.hoverboards += c.amount; Save.save(); Sound.sfx.buy(); toast('+' + c.amount + ' hoverboard' + (c.amount > 1 ? 's' : ''), 'good'); }
          else { Sound.sfx.deny(); toast('Not enough coins', 'bad'); }
          refreshStats(); buildShop();
        };
        grid.appendChild(card);
      });
    }
  }
  function glyphFor(id) {
    return { magnet: '&#129522;', jetpack: '&#128640;', x2: '&#10006;2', sneakers: '&#128095;', shield: '&#128737;', headstart: '&#127937;' }[id] || '&#11088;';
  }
  $$('.shop-tabs .tab').forEach(t => t.onclick = () => {
    $$('.shop-tabs .tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active'); shopTab = t.dataset.tab; Sound.sfx.button(); buildShop();
  });

  /* ---------------- missions ---------------- */
  function buildMissions() {
    const ms = Missions.ensure();
    const list = $('#missionList');
    list.innerHTML = '';
    ms.forEach(m => {
      const row = document.createElement('div');
      row.className = 'mission-row' + (m.done ? ' done' : '');
      row.innerHTML = `<div class="mission-title">${m.done ? '&#10004; ' : ''}${m.text}</div>
        <div class="mission-prog"><i style="width:${100 * U.clamp(m.progress / m.amount, 0, 1)}%"></i></div>
        <div class="mission-val">${Math.floor(m.progress)} / ${m.amount}</div>`;
      list.appendChild(row);
    });
    const done = ms.filter(m => m.done).length;
    $('#rankBadge').textContent = Save.d.rank;
    $('#rankNum').textContent = Save.d.rank;
    $('#rankFill').style.width = (done / 3 * 100) + '%';
    $('#rankSub').textContent = `${done} / 3 missions this set — clear all three for ${U.fmt(250 * (Save.d.rank + 1))} bonus coins`;
  }

  /* ---------------- settings ---------------- */
  function bindSettings() {
    const o = Save.d.opts;
    const map = { optMusic: 'music', optSfx: 'sfx', optShake: 'shake', optBlur: 'blur', optFps: 'fps', optContrast: 'contrast' };
    Object.entries(map).forEach(([domId, key]) => {
      const input = document.getElementById(domId);
      input.checked = !!o[key];
      input.onchange = () => {
        o[key] = input.checked; Save.save();
        if (key === 'music') Sound.setMusic(input.checked);
        if (key === 'sfx') Sound.setSfx(input.checked);
        if (key === 'fps') el.fps.classList.toggle('hidden', !input.checked);
        Sound.sfx.button();
      };
    });
    el.fps.classList.toggle('hidden', !o.fps);
    $('#resetBtn').onclick = () => {
      if (confirm('Wipe every coin, unlock and high score?')) {
        Save.reset(); refreshStats(); buildCharacters(); buildShop(); buildMissions(); bindSettings();
        toast('Progress reset', 'bad');
      }
    };
  }

  /* ---------------- game over ---------------- */
  function gameOver(res) {
    $('#goScore').textContent = U.fmt(res.score);
    $('#goBest').textContent = 'BEST ' + U.fmt(Save.d.best);
    $('#goCoins').textContent = U.fmt(res.coins);
    $('#goDist').textContent = Math.floor(res.dist) + ' m';
    $('#goCombo').textContent = 'x' + res.maxCombo;
    $('#goNear').textContent = res.near;
    $('#goTricks').textContent = res.tricks;
    $('#goBiome').textContent = res.biome;
    const rib = $('#goRibbon');
    rib.textContent = res.record ? 'NEW RECORD!' : 'RUN OVER';
    rib.classList.toggle('record', !!res.record);


    /* second chance button */
    const rev = $('#reviveBtn');
    $('#reviveCost').textContent = U.fmt(res.reviveCost || 0);
    rev.classList.toggle('hidden', !res.canRevive);

    /* local top-5 leaderboard */
    const board = $('#goBoard');
    board.innerHTML = '<div class="board-head">YOUR TOP RUNS</div>' +
      (Save.d.runsLog || []).map((r, i) => {
        const mine = r.score === res.score && Math.floor(res.dist) === r.dist;
        return `<div class="brow${mine ? ' mine' : ''}"><span>${i + 1}</span><b>${U.fmt(r.score)}</b><i>${r.dist} m</i></div>`;
      }).join('');

    const mBox = $('#goMissions');
    mBox.innerHTML = '';
    Missions.ensure().forEach(m => {
      const r = document.createElement('div');
      r.className = 'mrow' + (m.done ? ' done' : '');
      r.innerHTML = `<span>${m.done ? '&#10004; ' : ''}${m.text}</span><b>${Math.floor(m.progress)}/${m.amount}</b>`;
      mBox.appendChild(r);
    });
    show('gameover');
  }

  /* ---------------- countdown ---------------- */
  function countdown(cb) {
    let n = 3;
    el.countdown.classList.remove('hidden');
    el.countNum.textContent = n;
    Sound.sfx.count();
    const step = () => {
      n--;
      if (n > 0) {
        el.countNum.textContent = n;
        el.countNum.style.animation = 'none'; void el.countNum.offsetWidth; el.countNum.style.animation = '';
        Sound.sfx.count();
        setTimeout(step, 700);
      } else {
        el.countNum.textContent = 'GO!';
        el.countNum.style.animation = 'none'; void el.countNum.offsetWidth; el.countNum.style.animation = '';
        Sound.sfx.go();
        setTimeout(() => { el.countdown.classList.add('hidden'); cb(); }, 520);
      }
    };
    setTimeout(step, 700);
  }

  /* ---------------- menu mascot animation ---------------- */
  const menuCv = $('#menuMascot'), menuCtx = menuCv.getContext('2d');
  const charCv = $('#charPreview'), charCtx = charCv.getContext('2d');
  let mascotT = 0;

  function animateMascots(dt) {
    mascotT += dt;
    if (!el.menu.classList.contains('hidden')) {
      menuCtx.clearRect(0, 0, menuCv.width, menuCv.height);
      const state = (Math.floor(mascotT / 4) % 3 === 1) ? 'cheer' : 'idle';
      Riggy.draw(menuCtx, {
        x: menuCv.width / 2, y: menuCv.height - 48, scale: 1.72, skinId: Save.d.character,
        state, t: mascotT, phase: mascotT * 8, view: 'front', shadow: true
      });
    }
    if (!el.characters.classList.contains('hidden')) {
      charCtx.clearRect(0, 0, charCv.width, charCv.height);
      Riggy.draw(charCtx, {
        x: charCv.width / 2, y: charCv.height - 34, scale: 1.62, skinId: previewChar,
        state: 'run', t: mascotT, phase: mascotT * 9, view: 'front', shadow: true
      });
      cardCanvases.forEach((c, i) => {
        c.ctx.clearRect(0, 0, c.canvas.width, c.canvas.height);
        Riggy.drawBust(c.ctx, c.canvas.width / 2, c.canvas.height * .62, 52, c.skinId, mascotT + i);
      });
    }
  }

  /* ---------------- wiring ---------------- */
  function bindButtons(Game) {
    const nav = (btn, fn) => { btn.onclick = () => { Sound.resume(); Sound.sfx.button(); fn(); }; };

    nav($('#playBtn'), () => Game.start());
    nav($('#charBtn'), () => { buildCharacters(); el.characters.classList.remove('hidden'); refreshStats(); });
    nav($('#shopBtn'), () => { buildShop(); el.shop.classList.remove('hidden'); refreshStats(); });
    nav($('#missionsBtn'), () => { buildMissions(); el.missions.classList.remove('hidden'); refreshStats(); });
    nav($('#howBtn'), () => el.how.classList.remove('hidden'));
    nav($('#settingsBtn'), () => { bindSettings(); el.settings.classList.remove('hidden'); });

    $$('[data-close]').forEach(b => b.onclick = () => { Sound.sfx.back(); hideAllSheets(); refreshStats(); });

    nav($('#pauseBtn'), () => Game.togglePause());
    nav($('#resumeBtn'), () => Game.togglePause());
    nav($('#restartBtn'), () => Game.start());
    nav($('#quitBtn'), () => Game.toMenu());
    nav($('#againBtn'), () => Game.start());
    nav($('#reviveBtn'), () => { if (Game.revive()) el.gameover.classList.add('hidden'); });
    nav($('#goMenuBtn'), () => Game.toMenu());
    nav($('#goShopBtn'), () => { buildShop(); el.gameover.classList.add('hidden'); Game.toMenu(); el.shop.classList.remove('hidden'); refreshStats(); });

    el.hoverBtn.onclick = () => Game.deployBoard();
  }

  return {
    el, show, hideAllSheets, toast, hud, powerups, combo, missionToast,
    refreshStats, buildCharacters, buildShop, buildMissions, bindSettings,
    gameOver, countdown, animateMascots, bindButtons,
    get previewChar() { return previewChar; }
  };
})();
