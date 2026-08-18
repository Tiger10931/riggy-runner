/* ============================================================
   data.js — persistent save file, unlockables, shop and missions
   ============================================================ */
'use strict';

const Save = (() => {
  const KEY = 'riggy-runner-save-v1';

  const DEFAULT = {
    coins: 0,
    best: 0,
    bestDist: 0,
    runs: 0,
    totalCoins: 0,
    totalDist: 0,
    totalJumps: 0,
    totalRolls: 0,
    totalTricks: 0,
    nearMisses: 0,
    character: 'classic',
    owned: ['classic'],
    board: 'pinky',
    ownedBoards: ['pinky'],
    hoverboards: 3,
    upgrades: { magnet: 0, jetpack: 0, x2: 0, sneakers: 0, shield: 0, headstart: 0 },
    missions: null,
    missionSet: 0,
    rank: 1,
    runsLog: [],
    revives: 0,
    opts: { music: true, sfx: true, shake: true, blur: true, fps: false, contrast: false },
    seenTutorial: false
  };

  let data = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEFAULT);
      const parsed = JSON.parse(raw);
      const merged = Object.assign(structuredClone(DEFAULT), parsed);
      merged.upgrades = Object.assign(structuredClone(DEFAULT.upgrades), parsed.upgrades || {});
      merged.opts = Object.assign(structuredClone(DEFAULT.opts), parsed.opts || {});
      if (!Array.isArray(merged.runsLog)) merged.runsLog = [];
      return merged;
    } catch (e) {
      console.warn('save corrupt, starting fresh', e);
      return structuredClone(DEFAULT);
    }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* private mode */ }
  }
  function reset() { data = structuredClone(DEFAULT); save(); }

  return {
    get d() { return data; },
    save, reset,
    addCoins(n) { data.coins += n; data.totalCoins += n; save(); },
    spend(n) { if (data.coins < n) return false; data.coins -= n; save(); return true; },
    /* keeps a local top-5 leaderboard of best runs */
    pushRun(entry) {
      data.runsLog.push(entry);
      data.runsLog.sort((a, b) => b.score - a.score);
      data.runsLog = data.runsLog.slice(0, 5);
      save();
      return data.runsLog;
    }
  };
})();

/* ============================================================
   CHARACTERS
   ============================================================ */
const CHARACTERS = [
  { id: 'classic', name: 'Classic Riggy', price: 0, desc: 'The original Danno Cal mascot. Blue, bouncy and completely unbothered by oncoming trains.', perk: 'Perk: none — pure skill.', perkKey: null },
  { id: 'coach', name: 'Coach Riggy', price: 1200, desc: 'Clipboard energy, whistle around the neck, permanently disappointed in your lane choices.', perk: 'Perk: +1 hoverboard at the start of every run.', perkKey: 'board' },
  { id: 'neon', name: 'Neon Riggy', price: 2500, desc: 'Riggy after a long night in the arcade district. Glows in the dark, refuses to explain why.', perk: 'Perk: coin magnet lasts 25% longer.', perkKey: 'magnet' },
  { id: 'retro', name: 'Retro Riggy', price: 3500, desc: '8-bit soul, 128-bit attitude. Ships with headphones nobody has ever seen him remove.', perk: 'Perk: score multipliers build 20% faster.', perkKey: 'combo' },
  { id: 'frost', name: 'Frost Riggy', price: 5000, desc: 'Chilled to exactly the right temperature. Leaves a trail of snowflakes and mild regret.', perk: 'Perk: start each run with a bubble shield.', perkKey: 'shield' },
  { id: 'inferno', name: 'Inferno Riggy', price: 7500, desc: 'Runs so fast the track complains. Goggles are non-negotiable safety equipment.', perk: 'Perk: jetpacks burn 30% longer.', perkKey: 'jetpack' },
  { id: 'shadow', name: 'Shadow Riggy', price: 10000, desc: 'A rumour with a cape. Nobody is sure he is actually there until you check the leaderboard.', perk: 'Perk: near-miss combos are worth double.', perkKey: 'near' },
  { id: 'golden', name: 'Golden Riggy', price: 20000, desc: 'The trophy version. Every coin you touch feels personally flattered.', perk: 'Perk: +25% coin value, always.', perkKey: 'coins' }
];

/* ============================================================
   BOARDS (cosmetic + small handling perks)
   ============================================================ */
const BOARDS = [
  { id: 'pinky', name: 'Pinky', price: 0, col: '#ff2f86', desc: 'Standard issue. Bubblegum pink, surprisingly rigid.', dur: 20 },
  { id: 'wave', name: 'Wave Rider', price: 1500, col: '#20c5ff', desc: 'Surf-shaped deck. Rides 4 seconds longer.', dur: 24 },
  { id: 'bolt', name: 'Bolt', price: 3000, col: '#ffd23f', desc: 'Lightning trim. Lane changes are instant.', dur: 22, snap: true },
  { id: 'toxic', name: 'Toxic', price: 4500, col: '#7cff4d', desc: 'Emits a suspicious green haze. Coins stick to it.', dur: 22, magnetish: true },
  { id: 'void', name: 'Void', price: 9000, col: '#9b5cff', desc: 'Made of night. Survives two crashes instead of one.', dur: 26, tough: true }
];

/* ============================================================
   SHOP — upgrades and gear
   ============================================================ */
const UPGRADES = [
  { id: 'magnet', name: 'Coin Magnet', icon: 'U', base: 400, desc: 'Longer magnet duration', max: 5, per: '+2s' },
  { id: 'jetpack', name: 'Jetpack', icon: 'J', base: 500, desc: 'Longer jetpack flight', max: 5, per: '+1.5s' },
  { id: 'x2', name: 'Score Multiplier', icon: '2', base: 450, desc: 'Longer x2 window', max: 5, per: '+2s' },
  { id: 'sneakers', name: 'Super Sneakers', icon: 'S', base: 400, desc: 'Longer super jump window', max: 5, per: '+2s' },
  { id: 'shield', name: 'Bubble Shield', icon: 'O', base: 600, desc: 'Longer shield duration', max: 5, per: '+1.5s' },
  { id: 'headstart', name: 'Head Start', icon: 'H', base: 800, desc: 'Begin further down the track', max: 5, per: '+150m' }
];

const CONSUMABLES = [
  { id: 'hb1', name: 'Hoverboard', icon: 'B', price: 300, amount: 1, desc: 'One spare board for a crash.' },
  { id: 'hb5', name: 'Board 5-Pack', icon: 'B', price: 1250, amount: 5, desc: 'Five boards, slight bulk discount.' },
  { id: 'hb20', name: 'Board Crate', icon: 'B', price: 4200, amount: 20, desc: 'Twenty boards. Live dangerously.' }
];

function upgradeCost(id, level) {
  const u = UPGRADES.find(x => x.id === id);
  return Math.round(u.base * Math.pow(1.85, level));
}

/* ============================================================
   MISSIONS — three at a time, they roll over as you clear them
   ============================================================ */
const MISSION_POOL = [
  { id: 'coins', text: n => `Collect ${n} coins in one run`, amounts: [50, 90, 150, 220, 320], stat: 'runCoins' },
  { id: 'dist', text: n => `Run ${n}m in one go`, amounts: [600, 1000, 1600, 2400, 3400], stat: 'runDist' },
  { id: 'jump', text: n => `Jump ${n} times`, amounts: [20, 35, 55, 80, 120], stat: 'jumps' },
  { id: 'roll', text: n => `Roll ${n} times`, amounts: [15, 25, 40, 60, 90], stat: 'rolls' },
  { id: 'near', text: n => `Squeeze past ${n} near misses`, amounts: [10, 20, 35, 55, 80], stat: 'near' },
  { id: 'roof', text: n => `Spend ${n}s on train roofs`, amounts: [8, 15, 25, 40, 60], stat: 'roofTime' },
  { id: 'magnet', text: n => `Grab ${n} coin magnets`, amounts: [2, 4, 6, 9, 12], stat: 'magnets' },
  { id: 'score', text: n => `Score ${n} points in one run`, amounts: [4000, 9000, 18000, 32000, 55000], stat: 'runScore' },
  { id: 'combo', text: n => `Reach a x${n} combo`, amounts: [4, 6, 8, 10, 14], stat: 'maxCombo' },
  { id: 'trick', text: n => `Pull ${n} rooftop tricks`, amounts: [3, 6, 10, 16, 24], stat: 'tricks' },
  { id: 'board', text: n => `Ride a hoverboard ${n} times`, amounts: [2, 3, 5, 8, 12], stat: 'boards' },
  { id: 'biome', text: n => `Reach the ${n} biome`, amounts: [1, 2, 3, 4, 5], stat: 'biomeIdx' }
];

const Missions = (() => {
  function roll(set) {
    const pool = [...MISSION_POOL].sort(() => Math.random() - .5);
    const tier = U.clamp(Math.floor(set / 2), 0, 4);
    return pool.slice(0, 3).map(m => {
      const amount = m.amounts[U.clamp(tier + U.randInt(0, 1), 0, 4)];
      return { id: m.id, stat: m.stat, amount, progress: 0, done: false, text: m.text(m.id === 'biome' ? World.BIOMES[U.clamp(amount, 0, 5)].name : amount) };
    });
  }
  function ensure() {
    const d = Save.d;
    if (!d.missions || d.missions.length !== 3) { d.missions = roll(d.missionSet || 0); Save.save(); }
    return d.missions;
  }
  /* stats: an object of run stats; cumulative ones are handled by caller */
  function update(stats) {
    const ms = ensure();
    let completed = [];
    ms.forEach(m => {
      if (m.done) return;
      const v = stats[m.stat] || 0;
      if (v > m.progress) m.progress = Math.min(v, m.amount);
      if (m.progress >= m.amount) { m.done = true; completed.push(m); }
    });
    if (completed.length) Save.save();
    return completed;
  }
  function checkSetComplete() {
    const d = Save.d;
    const ms = ensure();
    if (ms.every(m => m.done)) {
      d.missionSet++; d.rank++;
      const bonus = 250 * d.rank;
      d.coins += bonus; d.totalCoins += bonus;
      d.missions = roll(d.missionSet);
      Save.save();
      return { rank: d.rank, bonus };
    }
    return null;
  }
  return { ensure, update, checkSetComplete, roll };
})();
