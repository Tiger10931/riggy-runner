/* ============================================================
   rebirth.js — prestige. Once your Riggy Rank is high enough you can
   REBIRTH: coins, upgrades, unlocks, levels and rank reset, but you keep
   your records and earn Rebirth Points (RP) to spend on permanent perks,
   plus a small permanent coin bonus per rebirth.

   Everything goes through Save.d + Save.save(), so the signed save stays valid.
   ============================================================ */
'use strict';

const Rebirth = (() => {

  /* permanent perks, bought with RP. cost of the next level = 1 + current level */
  const PERKS = [
    { id: 'coin',   icon: '$', name: 'Golden Touch',   desc: '+10% coins banked from every run', max: 10 },
    { id: 'head',   icon: '»', name: 'Jump Start',     desc: '+100m head start in endless runs',  max: 10 },
    { id: 'boards', icon: 'B', name: 'Spare Boards',   desc: '+1 hoverboard at the start of every run', max: 5 },
    { id: 'power',  icon: 'P', name: 'Long Lasting',   desc: '+10% power-up duration', max: 8 },
    { id: 'thrift', icon: '%', name: 'Haggler',        desc: '-5% upgrade prices', max: 8 },
    { id: 'medic',  icon: '+', name: 'Second Wind',    desc: '-10% second-chance cost', max: 5 },
    { id: 'jam',    icon: '♪', name: 'Stage Presence', desc: '+20% Daily Jam coins', max: 5 },
    { id: 'xp',     icon: 'X', name: 'Quick Learner',  desc: '+15% character XP from every run', max: 8 },
    { id: 'magnet', icon: 'M', name: 'Super Magnet',   desc: '+20% coin magnet duration', max: 5 },
    { id: 'luck',   icon: '?', name: 'Lucky Charm',    desc: '+10% power-up spawn rate', max: 5 },
    { id: 'life',   icon: '♥', name: 'Spare Life',     desc: '+1 extra life at the start of every run', max: 3 },
    { id: 'combo',  icon: '×', name: 'Combo King',     desc: 'Score multipliers build +10% faster', max: 5 },
    { id: 'start',  icon: '¢', name: 'Seed Money',     desc: '+500 coins after every rebirth', max: 10 },
    { id: 'fast',   icon: '↑', name: 'Fast Track',     desc: '-1 Riggy Rank needed for the next rebirth (min 5)', max: 5 }
  ];

  /* one-time chests for reaching rebirth counts */
  const MILESTONES = [
    { n: 1,  rp: 2 },
    { n: 3,  rp: 4,  boards: 5 },
    { n: 5,  rp: 6,  coins: 100000 },
    { n: 8,  rp: 8,  boards: 10 },
    { n: 10, rp: 12, coins: 500000 },
    { n: 15, rp: 15, boards: 15 },
    { n: 20, rp: 20, coins: 2000000 },
    { n: 30, rp: 30, boards: 30 }
  ];
  const claimed = n => (Save.d.rbClaimed || []).includes(n);
  const mText = m => [m.rp + ' RP', m.boards && m.boards + ' hoverboards', m.coins && U.fmt(m.coins) + ' coins'].filter(Boolean).join(' · ');
  function claim(n) {
    const m = MILESTONES.find(x => x.n === n);
    if (!m || claimed(n) || count() < n) return false;
    const s = d();
    s.rbClaimed = (s.rbClaimed || []).concat(n);
    s.rp = (s.rp || 0) + m.rp; s.rpTotal = (s.rpTotal || 0) + m.rp;
    if (m.boards) s.hoverboards = (s.hoverboards || 0) + m.boards;
    if (m.coins) Save.addCoins(m.coins);
    Save.save();
    return true;
  }

  const TITLES = ['Newcomer', 'Reborn', 'Ascendant', 'Radiant', 'Eternal', 'Mythic', 'Cosmic', 'Boundless', 'Legend'];
  const title = n => TITLES[Math.min(TITLES.length - 1, n)] + (n >= TITLES.length ? ' ' + (n - TITLES.length + 2) : '');

  const d = () => Save.d;
  const lv = id => Math.max(0, Math.floor((d().rpPerks || {})[id] || 0));
  const count = () => Math.max(0, Math.floor(d().rebirths || 0));
  const need = (n = count()) => Math.max(5, Math.min(40, 8 + n * 2) - lv('fast'));          // rank required for the next rebirth
  const gain = () => 1 + Math.floor((d().rank || 1) / 5);          // RP for rebirthing right now
  const can = () => (d().rank || 1) >= need();

  /* multipliers used by the game */
  const coinMul = () => 1 + count() * 0.05 + lv('coin') * 0.10;
  const powerMul = () => 1 + lv('power') * 0.10;
  const discount = () => Math.max(0.2, 1 - lv('thrift') * 0.05);
  const reviveMul = () => Math.max(0.2, 1 - lv('medic') * 0.10);
  const jamMul = () => 1 + lv('jam') * 0.20;
  const perkCost = id => 1 + lv(id);

  function buy(id) {
    const p = PERKS.find(x => x.id === id);
    if (!p || lv(id) >= p.max) return false;
    const c = perkCost(id);
    if ((d().rp || 0) < c) return false;
    d().rp -= c;
    d().rpPerks = d().rpPerks || {};
    d().rpPerks[id] = lv(id) + 1;
    Save.save();
    return true;
  }

  /* what the reset keeps: records, stats, options, secrets, rhythm data, admin-only unlocks */
  function perform() {
    const s = d();
    const keepChars = (s.owned || []).filter(id => (CHARACTERS.find(c => c.id === id) || {}).admin);
    const keepBoards = (s.ownedBoards || []).filter(id => (BOARDS.find(b => b.id === id) || {}).admin);
    const got = gain();
    s.rp = (s.rp || 0) + got;
    s.rpTotal = (s.rpTotal || 0) + got;
    s.rebirths = count() + 1;
    s.coins = 1000 * s.rebirths + 500 * lv('start');               // starter pack
    s.hoverboards = 3;
    s.upgrades = { magnet: 0, jetpack: 0, x2: 0, sneakers: 0, shield: 0, headstart: 0 };
    s.owned = ['classic', ...keepChars];
    s.ownedBoards = ['pinky', ...keepBoards];
    if (!s.owned.includes(s.character)) s.character = 'classic';
    if (!s.ownedBoards.includes(s.board)) s.board = 'pinky';
    MODE_ORDER.forEach(m => { s.levels[m] = { unlocked: 1, stars: [] }; });
    s.rank = 1; s.missionSet = 0; s.missions = null;
    Missions.ensure();
    Save.save();
    return got;
  }

  /* ---------------- UI ---------------- */
  const h = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html !== undefined) n.innerHTML = html; return n; };

  function refreshButton() {
    const b = document.getElementById('rebirthBtn');
    if (!b) return;
    const n = count();
    b.textContent = n ? 'REBIRTH ×' + n : 'REBIRTH';
    b.classList.toggle('ready', can());
  }

  function build() {
    const root = document.getElementById('rbWrap');
    if (!root) return;
    root.innerHTML = '';
    const n = count(), rank = d().rank || 1, ok = can();

    const head = h('div', 'rb-card rb-head');
    head.append(
      h('div', 'rb-title', 'REBIRTH ' + (n ? '×' + n : '') + ' <small>· ' + title(n) + '</small>'),
      h('div', 'rb-pts', '<b>' + (d().rp || 0) + '</b> RP to spend <span>(' + (d().rpTotal || 0) + ' earned in total)</span>'),
      h('div', 'rb-bonus', 'Permanent coin bonus: <b>+' + Math.round((coinMul() - 1) * 100) + '%</b> on every run')
    );
    root.append(head);

    const act = h('div', 'rb-card');
    act.append(h('div', 'rb-need', 'Riggy Rank <b>' + rank + '</b> / <b>' + need() + '</b> needed' +
      '<div class="rb-bar"><div style="width:' + Math.min(100, Math.round(100 * rank / need())) + '%"></div></div>'));
    act.append(h('div', 'rb-what',
      'Rebirthing <b>resets</b> your coins, upgrades, characters, boards, levels and rank.<br>' +
      'You <b>keep</b> high scores, stats, settings, secrets, Daily Jam data and your RP perks.<br>' +
      'You get <b>+' + gain() + ' RP</b> and a starter pack of <b>' + U.fmt(1000 * (n + 1) + 500 * lv('start')) + ' coins</b>.<br>Your characters keep their levels and ★ stars.'));
    const btn = h('button', 'big-btn small rb-go', ok ? 'REBIRTH NOW' : 'LOCKED');
    btn.disabled = !ok;
    btn.onclick = () => {
      if (!ok) return;
      Sound.sfx.button();
      if (!confirm('Rebirth now? You will lose your coins, upgrades, unlocks, levels and rank.\nYou will gain ' + gain() + ' Rebirth Points.')) return;
      const got = perform();
      Sound.sfx.buy && Sound.sfx.buy();
      UI.toast('REBIRTH! +' + got + ' RP', 'gold');
      UI.refreshStats(); UI.buildModes(); UI.buildCharacters(); UI.buildShop(); UI.buildMissions(); UI.buildLevels();
      build();
    };
    act.append(btn);
    root.append(act);

    root.append(h('div', 'rb-sec', 'PERMANENT PERKS'));
    const grid = h('div', 'rb-grid');
    PERKS.forEach(p => {
      const L = lv(p.id), maxed = L >= p.max, cost = perkCost(p.id), afford = (d().rp || 0) >= cost;
      const card = h('div', 'rb-perk' + (maxed ? ' maxed' : ''));
      card.append(
        h('div', 'rb-icon', p.icon),
        h('div', 'rb-pinfo', '<b>' + p.name + '</b><span>' + p.desc + '</span><i>' +
          Array.from({ length: p.max }, (_, i) => '<u class="' + (i < L ? 'on' : '') + '"></u>').join('') + '</i>')
      );
      const b = h('button', 'rb-buy' + (afford && !maxed ? ' can' : ''), maxed ? 'MAX' : cost + ' RP');
      b.disabled = maxed || !afford;
      b.onclick = () => {
        if (buy(p.id)) { Sound.sfx.buy && Sound.sfx.buy(); UI.toast(p.name + ' → level ' + lv(p.id), 'good'); UI.refreshStats(); build(); }
        else Sound.sfx.deny && Sound.sfx.deny();
      };
      card.append(b);
      grid.append(card);
    });
    root.append(grid);

    root.append(h('div', 'rb-sec', 'REBIRTH CHESTS'));
    const ms = h('div', 'rb-grid');
    MILESTONES.forEach(m => {
      const got = claimed(m.n), ready = !got && n >= m.n;
      const card = h('div', 'rb-perk' + (got ? ' maxed' : ''));
      card.append(h('div', 'rb-icon', m.n), h('div', 'rb-pinfo', '<b>Rebirth ×' + m.n + '</b><span>' + mText(m) + '</span>'));
      const b = h('button', 'rb-buy' + (ready ? ' can' : ''), got ? 'CLAIMED' : ready ? 'CLAIM' : 'LOCKED');
      b.disabled = !ready;
      b.onclick = () => { if (claim(m.n)) { Sound.sfx.buy && Sound.sfx.buy(); UI.toast('Chest opened: ' + mText(m), 'gold'); UI.refreshStats(); build(); } };
      card.append(b); ms.append(card);
    });
    root.append(ms);
  }

  return { PERKS, MILESTONES, claim, claimed, lv, count, need, gain, can, coinMul, powerMul, discount, reviveMul, jamMul, perkCost, buy, perform, build, refreshButton, title };
})();
