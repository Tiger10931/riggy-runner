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
    mode: 'normal',
    bestByMode: { easy: 0, normal: 0, hard: 0, insane: 0 },
    owned: ['classic'],
    secretsFound: [],
    board: 'pinky',
    ownedBoards: ['pinky'],
    hoverboards: 3,
    upgrades: { magnet: 0, jetpack: 0, x2: 0, sneakers: 0, shield: 0, headstart: 0 },
    missions: null,
    missionSet: 0,
    rank: 1,
    runsLog: [],
    revives: 0,
    opts: { music: true, sfx: true, shake: true, blur: true, fps: false, contrast: false, season: 'auto' },
    /* level mode: 50 levels per difficulty. stars[i] = 0..3 for level i+1 */
    levels: {
      easy: { unlocked: 1, stars: [] }, normal: { unlocked: 1, stars: [] },
      hard: { unlocked: 1, stars: [] }, insane: { unlocked: 1, stars: [] }
    },
    seenTutorial: false,
    rhythmLast: '',
    rhythmBest: 0,
    rhythmDiff: 'normal',
    rhythmScroll: 'up',
    rhythmStyle: 'arrow',
    rhythmKeys: [['arrowleft', 'd'], ['arrowdown', 'f'], ['arrowup', 'j'], ['arrowright', 'k']]
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
      /* level progress: merge per difficulty so old saves just start at level 1 */
      const lv = structuredClone(DEFAULT.levels);
      ['easy', 'normal', 'hard', 'insane'].forEach(m => {
        const src = (parsed.levels || {})[m];
        if (!src) return;
        lv[m].unlocked = Math.max(1, Math.min(50, Math.floor(src.unlocked) || 1));
        lv[m].stars = Array.isArray(src.stars) ? src.stars.slice(0, 50).map(n => Math.max(0, Math.min(3, n | 0))) : [];
      });
      merged.levels = lv;
      if (!['auto', 'spring', 'summer', 'autumn', 'winter'].includes(merged.opts.season)) merged.opts.season = 'auto';
      // rhythm key bindings: 4 lanes x 2 slots, each a lowercase key name or ''
      const rk = parsed.rhythmKeys;
      merged.rhythmKeys = (Array.isArray(rk) && rk.length === 4 && rk.every(l => Array.isArray(l) && l.length === 2))
        ? rk.map(l => l.map(k => (typeof k === 'string' ? k : '')))
        : structuredClone(DEFAULT.rhythmKeys);
      /* difficulty modes: older saves had one global best — treat it as the Normal best */
      merged.bestByMode = Object.assign(structuredClone(DEFAULT.bestByMode), parsed.bestByMode || {});
      if (!parsed.bestByMode) merged.bestByMode.normal = parsed.best || 0;
      if (!['easy', 'normal', 'hard', 'insane'].includes(merged.mode)) merged.mode = 'normal';
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
  { id: 'punk', name: 'Punk Riggy', price: 6000, desc: 'Studded collar, mohawk, three chords and a lane change. Volume knob welded to eleven.', perk: 'Perk: super sneakers last 35% longer.', perkKey: 'sneakers' },
  { id: 'cadet', name: 'Cadet Riggy', price: 8500, desc: 'Fishbowl helmet, zero training. Claims the track is technically a low orbit.', perk: 'Perk: x2 score windows last 35% longer.', perkKey: 'x2' },
  { id: 'shadow', name: 'Shadow Riggy', price: 10000, desc: 'A rumour with a cape. Nobody is sure he is actually there until you check the leaderboard.', perk: 'Perk: near-miss combos are worth double.', perkKey: 'near' },
  { id: 'ranger', name: 'Ranger Riggy', price: 12000, desc: 'Wide-brim hat, sensible backpack, encyclopedic knowledge of every shortcut in the canyon.', perk: 'Perk: every run starts 300m down the track.', perkKey: 'headstart' },
  { id: 'golden', name: 'Golden Riggy', price: 20000, desc: 'The trophy version. Every coin you touch feels personally flattered.', perk: 'Perk: +25% coin value, always.', perkKey: 'coins' },
  { id: 'phantom', name: 'Phantom Riggy', price: 30000, desc: 'Half here, half elsewhere. Death is more of a scheduling conflict than an ending.', perk: 'Perk: second chances cost half as many coins.', perkKey: 'cheaprevive' },
  { id: 'rosy', name: 'Rosy Rabbit', price: 11000, desc: "Riggy's neighbour from two burrows over. Green sundress, fluffy wrist cuff, ears that clear the treeline.", perk: 'Perk: every run starts 150m down the track.', perkKey: 'hop' },
  { id: 'ferrick', name: 'Ferrick the Fox', price: 9500, desc: "Riggy's hiking buddy. Blue hoodie, packed backpack, green trail pants — always ready for one more lap of the canyon.", perk: 'Perk: can take 2 hits — survives one crash per run.', perkKey: 'twohits' },
  /* SECRET — hidden from the Characters screen until the player types "neegy" (see ui.js) */
  { id: 'neegy', name: 'Neegy', price: 20000, secret: true, desc: 'A solid gold legend of unknown origin. He does not run so much as he is admired while moving.', perk: 'Perk: none — pure drip.', perkKey: null }
];

/* ============================================================
   BOARDS (cosmetic + small handling perks)
   ============================================================ */

/* ============================================================
   DIFFICULTY MODES
   speedStart / speedMax / ramp : multipliers on the base run speed
   rampDist   : metres until obstacle patterns reach full difficulty
   diffBase   : starting difficulty (0..1), diffMax : cap on it
   gapStart/gapEnd : spacing between obstacle patterns (smaller = tighter)
   intro      : metres of gentle starter patterns
   score / coins : reward multipliers
   powerEvery / powerChance : how often power-ups spawn
   reviveMul / maxRevives : second-chance cost and allowance
   ============================================================ */
const MODES = {
  easy:   { id: 'easy',   name: 'EASY',   color: '#46d36b', desc: 'Slower, roomier, forgiving. Good for learning the track.',
            speedStart: .82, speedMax: .78, ramp: .65, rampDist: 4500, diffBase: 0,  diffMax: .55, gapStart: 1.30, gapEnd: 1.00, intro: 300,
            score: .8, coins: 1,   powerEvery: 4, powerChance: .14, reviveMul: .5, maxRevives: 3 },
  normal: { id: 'normal', name: 'NORMAL', color: '#3aa0ff', desc: 'The classic Riggy Runner experience.',
            speedStart: 1,   speedMax: 1,   ramp: 1,   rampDist: 2600, diffBase: 0,  diffMax: 1,   gapStart: 1.05, gapEnd: .72,  intro: 220,
            score: 1,  coins: 1,   powerEvery: 5, powerChance: .10, reviveMul: 1,  maxRevives: 3 },
  hard:   { id: 'hard',   name: 'HARD',   color: '#ff9a1f', desc: 'Faster, tighter patterns, fewer power-ups. +50% coins.',
            speedStart: 1.12, speedMax: 1.12, ramp: 1.3, rampDist: 1800, diffBase: .2, diffMax: 1,   gapStart: .92,  gapEnd: .62,  intro: 120,
            score: 1.5, coins: 1.5, powerEvery: 6, powerChance: .08, reviveMul: 1.5, maxRevives: 2 },
  insane: { id: 'insane', name: 'INSANE', color: '#ff2e4d', desc: 'Blistering speed, brutal patterns, almost no power-ups. 2.5x coins and score.',
            speedStart: 1.3, speedMax: 1.25, ramp: 1.8, rampDist: 1000, diffBase: .45, diffMax: 1,  gapStart: .78,  gapEnd: .5,   intro: 0,
            score: 2.5, coins: 2.5, powerEvery: 8, powerChance: .05, reviveMul: 3,  maxRevives: 1 }
};
const MODE_ORDER = ['easy', 'normal', 'hard', 'insane'];

const BOARDS = [
  { id: 'pinky', name: 'Pinky', price: 0, col: '#ff2f86', desc: 'Standard issue. Bubblegum pink, surprisingly rigid.', dur: 20, shape: 'deck', trail: 'dust' },
  { id: 'wave', name: 'Wave Rider', price: 1500, col: '#20c5ff', desc: 'Surf-shaped deck. Rides 4 seconds longer.', dur: 24, shape: 'surf', trail: 'foam' },
  { id: 'bolt', name: 'Bolt', price: 3000, col: '#ffd23f', desc: 'Lightning trim. Lane changes are instant.', dur: 22, snap: true, shape: 'arrow', trail: 'spark' },
  { id: 'toxic', name: 'Toxic', price: 4500, col: '#7cff4d', desc: 'Emits a suspicious green haze. Coins stick to it.', dur: 22, magnetish: true, shape: 'deck', trail: 'ooze' },
  { id: 'ember', name: 'Ember', price: 6000, col: '#ff6a2a', desc: 'Cast from a foundry reject. Leaves cinders in the lane.', dur: 23, shape: 'flame', trail: 'fire' },
  { id: 'saucer', name: 'Saucer', price: 7000, col: '#c9d6e4', desc: 'Round, chrome and mildly classified. Floats a touch higher.', dur: 24, shape: 'disc', trail: 'ring' },
  { id: 'delta', name: 'Delta Wing', price: 8000, col: '#00e5b0', desc: 'Twin-wing racer. Snappy lanes, teal jetwash.', dur: 24, snap: true, shape: 'wing', trail: 'spark' },
  { id: 'void', name: 'Void', price: 9000, col: '#9b5cff', desc: 'Made of night. Survives two crashes instead of one.', dur: 26, tough: true, shape: 'deck', trail: 'void' },
  { id: 'goldie', name: 'Solid Gold', price: 15000, col: '#ffc93c', desc: 'Absurdly expensive. Coins cling to it and it shrugs off a second crash.', dur: 28, tough: true, magnetish: true, shape: 'arrow', trail: 'gold' }
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


/* ============================================================
   LEVELS — 50 per difficulty, each one on a different map
   ============================================================ */
const Levels = (() => {
  const COUNT = 50;
  const clampLvl = n => Math.max(1, Math.min(COUNT, Math.floor(n) || 1));

  /* metres to the finish line */
  const goal = lvl => 500 + clampLvl(lvl) * 30;

  /* every difficulty starts on a different map so the four ladders never look identical */
  function mapIndex(lvl, mode) {
    const off = Math.max(0, MODE_ORDER.indexOf(mode)) * 3;
    return (clampLvl(lvl) - 1 + off) % World.BIOMES.length;
  }
  const mapName = (lvl, mode) => World.BIOMES[mapIndex(lvl, mode)].name;

  /* 0 → 1 across the ladder, used for speed and pattern difficulty */
  const progress = lvl => (clampLvl(lvl) - 1) / (COUNT - 1);

  const info = mode => Save.d.levels[mode] || Save.d.levels.normal;
  const unlocked = mode => info(mode).unlocked;
  const starsFor = (mode, lvl) => info(mode).stars[lvl - 1] || 0;
  const totalStars = mode => info(mode).stars.reduce((a, b) => a + b, 0);

  /* returns { first, newUnlock } */
  function complete(mode, lvl, stars) {
    const inf = info(mode);
    const prev = inf.stars[lvl - 1] || 0;
    while (inf.stars.length < lvl) inf.stars.push(0);
    inf.stars[lvl - 1] = Math.max(prev, stars);
    let newUnlock = false;
    if (lvl >= inf.unlocked && lvl < COUNT) { inf.unlocked = lvl + 1; newUnlock = true; }
    Save.save();
    return { first: prev === 0, newUnlock };
  }

  /* the level PLAY should drop you into: your furthest unlocked one */
  const current = mode => unlocked(mode);

  return { COUNT, goal, mapIndex, mapName, progress, unlocked, starsFor, totalStars, complete, current, clampLvl };
})();
