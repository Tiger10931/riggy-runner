/* ============================================================
   charlevels.js — every character earns XP while equipped. Levels give
   small permanent bonuses; at level 20 a character can be REBORN (back to
   level 1, +1 star) for a bigger permanent coin / XP / power-up bonus and 1 RP.
   All stored in Save.d.charXp / Save.d.charReb (signed save).
   ============================================================ */
'use strict';

const CharLv = (() => {
  const MAX = 20, MAX_REB = 10;
  const need = lv => 120 + (lv - 1) * 80;                                   // xp to climb from lv to lv+1
  const total = lv => { let t = 0; for (let i = 1; i < lv; i++) t += need(i); return t; };
  const d = () => Save.d;
  const xpOf = id => Math.max(0, Math.floor((d().charXp || {})[id] || 0));
  const reb = id => Math.max(0, Math.min(MAX_REB, Math.floor((d().charReb || {})[id] || 0)));

  function info(id) {
    let xp = xpOf(id), lv = 1;
    while (lv < MAX && xp >= need(lv)) { xp -= need(lv); lv++; }
    return { level: lv, into: lv >= MAX ? 0 : xp, need: lv >= MAX ? 0 : need(lv), reb: reb(id), maxed: lv >= MAX };
  }
  const cur = () => info(d().character);
  const xpMul = () => 1 + cur().reb * 0.25 + (typeof Rebirth !== 'undefined' ? Rebirth.lv('xp') * 0.15 : 0);

  /* bonuses of the equipped character */
  const coinMul = () => { const c = cur(); return 1 + (c.level - 1) * 0.02 + c.reb * 0.10; };
  const head = () => Math.floor(cur().level / 5) * 50;                       // metres
  const boards = () => (cur().level >= 10 ? 1 : 0);
  const powerMul = () => { const c = cur(); return 1 + (c.level >= 15 ? 0.1 : 0) + c.reb * 0.05; };

  const BONUSES = [
    [1, '+2% coins per level'], [5, '+50m head start'], [10, '+1 hoverboard every run'],
    [15, '+10% power-up duration'], [20, 'ready to REBIRTH (+1★)']
  ];

  function gain(id, amount) {
    const before = info(id).level;
    const cap = total(MAX);
    d().charXp = d().charXp || {};
    d().charXp[id] = Math.min(cap, xpOf(id) + Math.max(0, Math.round(amount * xpMul())));
    return { from: before, to: info(id).level };
  }
  function setLevel(id, lv) { d().charXp = d().charXp || {}; d().charXp[id] = total(Math.max(1, Math.min(MAX, lv))); }
  function setReb(id, n) { d().charReb = d().charReb || {}; d().charReb[id] = Math.max(0, Math.min(MAX_REB, n)); }
  const canRebirth = id => (d().owned || []).includes(id) && info(id).maxed && reb(id) < MAX_REB;
  function rebirth(id) {
    if (!canRebirth(id)) return false;
    setReb(id, reb(id) + 1); d().charXp[id] = 0;
    d().rp = (d().rp || 0) + 1; d().rpTotal = (d().rpTotal || 0) + 1;
    Save.save();
    return true;
  }
  const stars = id => '★'.repeat(reb(id));
  const runXp = (coins, distM, score) => Math.max(5, Math.round(coins * 0.6 + distM / 8 + score / 400));

  /* the little panel under the character description */
  function panel(id) {
    const root = document.getElementById('charLv');
    if (!root) return;
    root.innerHTML = '';
    if (!(d().owned || []).includes(id)) { root.style.display = 'none'; return; }
    root.style.display = '';
    const c = info(id), cardTitle = document.createElement('div');
    cardTitle.className = 'cl-top';
    cardTitle.innerHTML = '<b>LEVEL ' + c.level + (c.maxed ? ' · MAX' : '') + '</b><span class="cl-stars">' + (stars(id) || '') + '</span><small>' +
      (c.maxed ? 'ready' : U.fmt(c.into) + ' / ' + U.fmt(c.need) + ' XP') + '</small>';
    const bar = document.createElement('div'); bar.className = 'cl-bar';
    bar.innerHTML = '<div style="width:' + (c.maxed ? 100 : Math.round(100 * c.into / c.need)) + '%"></div>';
    const list = document.createElement('div'); list.className = 'cl-list';
    list.innerHTML = BONUSES.map(([lv, t]) => '<span class="' + (c.level >= lv ? 'on' : '') + '">Lv ' + lv + ' · ' + t + '</span>').join('') +
      (c.reb ? '<span class="on">★' + c.reb + ' · +' + c.reb * 10 + '% coins · +' + c.reb * 25 + '% XP · +' + c.reb * 5 + '% power-up time</span>' : '');
    root.append(cardTitle, bar, list);
    const b = document.createElement('button');
    b.className = 'big-btn small cl-reb';
    b.textContent = reb(id) >= MAX_REB ? 'MAX STARS' : c.maxed ? 'REBIRTH THIS CHARACTER' : 'REBIRTH AT LEVEL ' + MAX;
    b.disabled = !canRebirth(id);
    b.onclick = () => {
      if (!canRebirth(id)) return;
      if (!confirm('Rebirth this character? It goes back to level 1 but earns a permanent ★ bonus and +1 Rebirth Point.')) return;
      if (rebirth(id)) { Sound.sfx.buy && Sound.sfx.buy(); UI.toast('★ Character reborn! +1 RP', 'gold'); UI.refreshStats(); UI.buildCharacters(); }
    };
    root.append(b);
  }

  return { MAX, MAX_REB, need, total, info, cur, xpMul, coinMul, head, boards, powerMul, gain, setLevel, setReb, canRebirth, rebirth, stars, runXp, panel, reb };
})();
