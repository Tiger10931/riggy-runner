/* ============================================================
   game.js — the engine: camera, track generation, physics,
   collision, powerups, scoring and the render loop.

   World space: x = left/right (lane units), y = UP (ground = 0),
   z = forward. 40 world units == 1 metre.
   ============================================================ */
'use strict';

const Game = (() => {

  /* ---------------- constants ---------------- */
  const FOCAL = 720;
  const CAM_Y = 128;          // camera height above the rails
  const CAM_BACK = 305;       // how far behind the runner the camera sits
  const UNITS_PER_M = 40;

  const GRAV = 3000;
  const JUMP_V = 1180;
  const SUPER_JUMP_V = 1520;
  const ROLL_TIME = 0.52;
  const LANE_SNAP = 0.13;     // seconds to slide between lanes

  const SPEED_START = 880;
  const SPEED_MAX = 2450;
  const SPEED_RAMP = 12;      // units/s gained per second
  const BIOME_METRES = 620;

  const PLAYER = { w: 76, hStand: 132, hRoll: 62, d: 56 };

  /* ---------------- canvas ---------------- */
  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d', { alpha: false });
  let W = 1280, H = 720, DPR = 1, horizon = 300;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.floor(window.innerWidth);
    H = Math.floor(window.innerHeight);
    cv.width = Math.floor(W * DPR);
    cv.height = Math.floor(H * DPR);
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    horizon = Math.round(H * 0.42);
  }
  window.addEventListener('resize', resize);

  /* ---------------- state ---------------- */
  const S = {
    mode: 'menu',           // menu | countdown | play | pause | dead
    t: 0, dt: 0,
    z: 0, speed: SPEED_START, dist: 0,
    lane: 1, laneX: 0, targetX: 0, laneT: 1,
    y: 0, vy: 0, onGround: true, groundY: 0, support: null,
    rolling: 0, jumps: 0, maxJumps: 1,
    state: 'run', crashT: 0, stumbleT: 0, invuln: 0,
    score: 0, coins: 0, combo: 0, comboTimer: 0, multiplier: 1,
    powers: { magnet: 0, jetpack: 0, x2: 0, sneakers: 0, shield: 0 },
    boardT: 0, boards: 0, boardUsed: 0,
    shake: 0, flash: 0, hitFlash: 0,
    biome: 0, biomeBlend: 0,
    runStats: null,
    tricks: 0, near: 0, maxCombo: 1, roofTime: 0, magnets: 0,
    perk: {},
    camX: 0, camShakeX: 0, camShakeY: 0,
    lastMissionCheck: 0
  };

  let obstacles = [], coins = [], pickups = [], scenery = [], particles = [], floaters = [];
  let spawnZ = 0, scenerySpawnZ = 0, patternCount = 0;

  /* ---------------- projection ---------------- */
  let camZ = 0, camX = 0;
  function P(x, y, z) {
    const dz = z - camZ;
    if (dz < 22) return null;
    const s = FOCAL / dz;
    return {
      sx: W / 2 + (x - camX) * s + S.camShakeX,
      sy: horizon + (CAM_Y - y) * s + S.camShakeY,
      s
    };
  }

  /* ---------------- helpers ---------------- */
  const biome = () => World.BIOMES[S.biome % World.BIOMES.length];
  const nextBiome = () => World.BIOMES[(S.biome + 1) % World.BIOMES.length];
  const laneX = i => World.LANES[i];

  function puDuration(kind) {
    const lvl = Save.d.upgrades[kind] || 0;
    const base = { magnet: 9, jetpack: 7, x2: 10, sneakers: 10, shield: 8 }[kind] || 8;
    const per = { magnet: 2, jetpack: 1.5, x2: 2, sneakers: 2, shield: 1.5 }[kind] || 1.5;
    let d = base + lvl * per;
    if (kind === 'magnet' && S.perk.magnet) d *= 1.25;
    if (kind === 'jetpack' && S.perk.jetpack) d *= 1.3;
    return d;
  }

  /* ============================================================
     TRACK GENERATION
     ============================================================ */
  function addObstacle(o) {
    o.hit = false; o.passed = false; o.scored = false;
    obstacles.push(o);
  }
  function addCoin(x, y, z) { coins.push({ x, y, z, got: false, phase: Math.random() * 7, vx: 0, vy: 0, vz: 0, pull: 0 }); }
  function addCoinRun(x, y, z, n, step = 78, arc = 0) {
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0;
      const yy = y + Math.sin(t * Math.PI) * arc;
      addCoin(x, yy, z + i * step);
    }
  }
  function addPickup(kind, x, y, z) { pickups.push({ kind, x, y, z, got: false, phase: Math.random() * 7 }); }

  const TRAIN_PALS = [
    { top: '#eef2f7', front: '#d9e1ea', side: '#bcc7d5', stripe: '#e5262b' },
    { top: '#ffd86b', front: '#f4b73f', side: '#c98f21', stripe: '#2c3e50' },
    { top: '#8ee6a8', front: '#54c777', side: '#37a058', stripe: '#134d2a' },
    { top: '#a9c8ff', front: '#7ba4e8', side: '#5b81c0', stripe: '#12305e' },
    { top: '#f6a5c0', front: '#e2789e', side: '#b95b7c', stripe: '#4d1327' }
  ];

  /* every pattern returns the z-length it consumed */
  const PATTERNS = [
    /* 0: single jumpable barrier + coin arc over it */
    (z, d) => {
      const l = U.randInt(0, 2);
      addObstacle({ type: 'barrier', lane: l, x: laneX(l), z, w: 118, h: 58, d: 40, clear: 'jump', lethal: true });
      addCoinRun(laneX(l), 70, z - 190, 7, 62, 90);
      return 520;
    },
    /* 1: duck beam */
    (z, d) => {
      const l = U.randInt(0, 2);
      addObstacle({ type: 'beam', lane: l, x: laneX(l), z, w: 132, h: 78, y: 78, d: 40, clear: 'roll', lethal: true });
      addCoinRun(laneX(l), 26, z - 150, 6, 64);
      return 520;
    },
    /* 2: two barriers, one clean lane */
    (z, d) => {
      const free = U.randInt(0, 2);
      for (let l = 0; l < 3; l++) if (l !== free)
        addObstacle({ type: 'barrier', lane: l, x: laneX(l), z, w: 118, h: 58, d: 40, clear: 'jump', lethal: true });
      addCoinRun(laneX(free), 34, z - 160, 8, 70);
      return 540;
    },
    /* 3: a single train to dodge or ride */
    (z, d) => {
      const l = U.randInt(0, 2);
      const len = U.pick([620, 820, 1040]);
      addObstacle({
        type: 'train', lane: l, x: laneX(l), z: z + len / 2, w: 128, h: 132, d: len,
        roof: 132, lethal: true, pal: U.pick(TRAIN_PALS)
      });
      addCoinRun(laneX(l), 168, z + 60, Math.floor(len / 90), 90);
      return len + 420;
    },
    /* 4: two trains, single gap */
    (z, d) => {
      const free = U.randInt(0, 2);
      const len = U.pick([700, 900, 1150]);
      for (let l = 0; l < 3; l++) if (l !== free)
        addObstacle({
          type: 'train', lane: l, x: laneX(l), z: z + len / 2, w: 128, h: 132, d: len,
          roof: 132, lethal: true, pal: U.pick(TRAIN_PALS)
        });
      addCoinRun(laneX(free), 30, z, Math.floor(len / 80), 80);
      return len + 460;
    },
    /* 5: ramp on to a train roof */
    (z, d) => {
      const l = U.randInt(0, 2);
      addObstacle({ type: 'ramp', lane: l, x: laneX(l), z, w: 124, h: 86, d: 140, clear: 'none', lethal: false, launch: true });
      const len = 900;
      addObstacle({
        type: 'train', lane: l, x: laneX(l), z: z + 260 + len / 2, w: 128, h: 132, d: len,
        roof: 132, lethal: true, pal: U.pick(TRAIN_PALS)
      });
      addCoinRun(laneX(l), 190, z + 150, 12, 84, 40);
      return len + 700;
    },
    /* 6: cone slalom (stumble, not death) */
    (z, d) => {
      for (let i = 0; i < 3; i++) {
        const l = U.randInt(0, 2);
        addObstacle({ type: 'cones', lane: l, x: laneX(l), z: z + i * 240, w: 110, h: 52, d: 60, clear: 'jump', lethal: false });
        addCoin(laneX((l + 1) % 3), 34, z + i * 240);
      }
      return 900;
    },
    /* 7: tall wall — you must change lane */
    (z, d) => {
      const free = U.randInt(0, 2);
      for (let l = 0; l < 3; l++) if (l !== free)
        addObstacle({ type: 'wall', lane: l, x: laneX(l), z, w: 132, h: 236, d: 60, clear: 'none', lethal: true });
      addCoinRun(laneX(free), 34, z - 180, 6, 70);
      return 560;
    },
    /* 8: barrier + beam combo in the same lane (jump then roll) */
    (z, d) => {
      const l = U.randInt(0, 2);
      addObstacle({ type: 'barrier', lane: l, x: laneX(l), z, w: 118, h: 58, d: 40, clear: 'jump', lethal: true });
      addObstacle({ type: 'beam', lane: l, x: laneX(l), z: z + 480, w: 132, h: 78, y: 78, d: 40, clear: 'roll', lethal: true });
      addCoinRun(laneX(l), 74, z - 120, 5, 66, 60);
      addCoinRun(laneX(l), 26, z + 360, 5, 66);
      return 1000;
    },
    /* 9: crate stacks staggered across lanes */
    (z, d) => {
      const order = [0, 1, 2].sort(() => Math.random() - .5);
      order.slice(0, 2).forEach((l, i) => {
        addObstacle({
          type: 'crates', lane: l, x: laneX(l), z: z + i * 300, w: 112, h: 96, d: 96,
          roof: 96, clear: 'jump', lethal: true
        });
        addCoin(laneX(l), 150, z + i * 300);
      });
      return 800;
    },
    /* 10: pure coin gravy — a big arc across all three lanes */
    (z, d) => {
      for (let l = 0; l < 3; l++) addCoinRun(laneX(l), 34, z + l * 90, 6, 74);
      return 640;
    },
    /* 11: moving train that creeps toward you */
    (z, d) => {
      const l = U.randInt(0, 2);
      const len = 900;
      addObstacle({
        type: 'train', lane: l, x: laneX(l), z: z + 1400, w: 128, h: 132, d: len, roof: 132,
        lethal: true, moving: true, vz: -220 - Math.random() * 160, pal: U.pick(TRAIN_PALS)
      });
      addCoinRun(laneX((l + 1) % 3), 34, z, 8, 78);
      return 900;
    },
    /* 12: gauntlet — trains left+right with barriers in the gap */
    (z, d) => {
      const len = 1100;
      addObstacle({ type: 'train', lane: 0, x: laneX(0), z: z + len / 2, w: 128, h: 132, d: len, roof: 132, lethal: true, pal: U.pick(TRAIN_PALS) });
      addObstacle({ type: 'train', lane: 2, x: laneX(2), z: z + len / 2, w: 128, h: 132, d: len, roof: 132, lethal: true, pal: U.pick(TRAIN_PALS) });
      addObstacle({ type: 'barrier', lane: 1, x: 0, z: z + 260, w: 118, h: 58, d: 40, clear: 'jump', lethal: true });
      addObstacle({ type: 'beam', lane: 1, x: 0, z: z + 760, w: 132, h: 78, y: 78, d: 40, clear: 'roll', lethal: true });
      addCoinRun(0, 74, z + 120, 4, 62, 50);
      addCoinRun(0, 26, z + 620, 4, 62);
      return len + 520;
    }
  ];

  const EASY = [0, 1, 2, 3, 6, 10];

  function generateAhead() {
    const limit = S.z + 7000;
    while (spawnZ < limit) {
      const difficulty = U.clamp(S.dist / 2600, 0, 1);
      let idx;
      if (S.dist < 220) idx = U.pick([10, 0, 6]);
      else if (Math.random() > difficulty * .85) idx = U.pick(EASY);
      else idx = U.randInt(0, PATTERNS.length - 1);
      const consumed = PATTERNS[idx](spawnZ, difficulty);
      patternCount++;
      // powerup drop
      if (patternCount % 5 === 0 || U.chance(.10)) {
        const kinds = ['magnet', 'jetpack', 'x2', 'sneakers', 'shield', 'hoverboard'];
        const weights = [26, 14, 22, 16, 12, 10];
        let r = Math.random() * weights.reduce((a, b) => a + b, 0), k = 0;
        while (r > weights[k]) { r -= weights[k]; k++; }
        addPickup(kinds[k], laneX(U.randInt(0, 2)), 60, spawnZ + consumed * .55);
      }
      const gapScale = U.lerp(1.05, 0.72, difficulty);
      spawnZ += consumed * gapScale + U.rand(240, 90);
    }

    // trackside scenery
    while (scenerySpawnZ < limit) {
      const B = biome();
      [-1, 1].forEach(side => {
        if (U.chance(.82)) {
          const kind = U.pick(B.scenery);
          scenery.push({
            kind, side, z: scenerySpawnZ + U.rand(200, -100),
            off: U.rand(220, 0), h: 120 + Math.random() * 320,
            col: U.pick(['#8d97a5', '#b0757a', '#7d8a9a', '#9e8f6f', '#6f7f96', '#c07f6a']),
            text: U.pick(['RIGGY', 'DASH!', 'DANNO', 'CAL', 'GO GO', '3 LANES']),
            seed: U.randInt(0, 99)
          });
        }
      });
      scenerySpawnZ += 420;
    }
  }

  function cull() {
    const back = S.z - 700;
    obstacles = obstacles.filter(o => o.z + (o.d || 60) / 2 > back);
    coins = coins.filter(c => !c.got && c.z > back);
    pickups = pickups.filter(p => !p.got && p.z > back);
    scenery = scenery.filter(s => s.z > back);
  }

  /* ============================================================
     PARTICLES
     ============================================================ */
  function puff(x, y, z, n = 6, col = 'rgba(255,255,255,.7)', spread = 90) {
    for (let i = 0; i < n; i++) particles.push({
      x, y, z, vx: U.rand(spread, -spread), vy: U.rand(spread * 1.4, 10), vz: U.rand(spread, -spread),
      life: 1, decay: U.rand(2.4, 1.2), r: U.rand(16, 6), col
    });
  }
  function sparkle(x, y, z, col = 'rgba(255,214,80,.95)') {
    for (let i = 0; i < 8; i++) particles.push({
      x, y, z, vx: U.rand(170, -170), vy: U.rand(230, 20), vz: U.rand(120, -120),
      life: 1, decay: U.rand(3, 1.8), r: U.rand(8, 3), col, star: true
    });
  }
  function floatText(text, x, y, z, col = '#ffd23f') {
    floaters.push({ text, x, y, z, life: 1, col });
  }

  /* ============================================================
     RUN LIFECYCLE
     ============================================================ */
  function applyPerks() {
    S.perk = {};
    const c = CHARACTERS.find(x => x.id === Save.d.character);
    if (c && c.perkKey) S.perk[c.perkKey] = true;
  }

  function start() {
    Sound.resume();
    if (Save.d.opts.music) Sound.setMusic(true);
    UI.show(null);
    UI.hideAllSheets();
    UI.el.hud.classList.remove('hidden');

    applyPerks();

    obstacles = []; coins = []; pickups = []; scenery = []; particles = []; floaters = [];
    const headStart = (Save.d.upgrades.headstart || 0) * 150 * UNITS_PER_M;

    Object.assign(S, {
      mode: 'countdown', t: 0,
      z: headStart, speed: SPEED_START + (headStart > 0 ? 220 : 0), dist: headStart / UNITS_PER_M,
      lane: 1, laneX: 0, targetX: 0, laneT: 1,
      y: 0, vy: 0, onGround: true, groundY: 0, support: null,
      rolling: 0, jumps: 0, maxJumps: 1,
      state: 'run', crashT: 0, stumbleT: 0, invuln: 1.2,
      score: 0, coins: 0, combo: 0, comboTimer: 0, multiplier: 1,
      powers: { magnet: 0, jetpack: 0, x2: 0, sneakers: 0, shield: 0 },
      boardT: 0, boardUsed: 0,
      shake: 0, flash: 0, hitFlash: 0,
      biome: 0, biomeBlend: 0,
      tricks: 0, near: 0, maxCombo: 1, roofTime: 0, magnets: 0,
      camX: 0, camShakeX: 0, camShakeY: 0, lastMissionCheck: 0
    });
    S.boards = Save.d.hoverboards + (S.perk.board ? 1 : 0);
    if (S.perk.shield) S.powers.shield = puDuration('shield');

    S.runStats = { runCoins: 0, runDist: 0, jumps: 0, rolls: 0, near: 0, roofTime: 0, magnets: 0, runScore: 0, maxCombo: 1, tricks: 0, boards: 0, biomeIdx: 0 };

    S.coyote = 0; S.jumpBuf = 0;
    spawnZ = S.z + 1600;
    scenerySpawnZ = S.z;
    patternCount = 0;
    generateAhead();

    UI.countdown(() => { S.mode = 'play'; });
  }

  function toMenu() {
    S.mode = 'menu';
    UI.el.hud.classList.add('hidden');
    UI.show('menu');
    UI.refreshStats();
    Sound.setIntensity(0);
  }

  function togglePause() {
    if (S.mode === 'play') {
      S.mode = 'pause';
      document.getElementById('pauseScore').textContent = U.fmt(S.score);
      document.getElementById('pauseCoins').textContent = U.fmt(S.coins);
      document.getElementById('pauseDist').textContent = Math.floor(S.dist) + ' m';
      UI.show('pause');
      Sound.duck(true);
    } else if (S.mode === 'pause') {
      S.mode = 'play';
      UI.show(null);
      Sound.duck(false);
    }
  }

  function die() {
    if (S.mode !== 'play') return;
    S.mode = 'dead';
    S.state = 'crash'; S.crashT = 0;
    S.shake = 1; S.hitFlash = 1;
    Sound.sfx.crash();
    Sound.duck(true);
    puff(S.laneX, S.y + 60, S.z, 22, 'rgba(255,255,255,.85)', 220);

    const d = Save.d;
    const record = S.score > d.best;
    d.best = Math.max(d.best, Math.floor(S.score));
    d.bestDist = Math.max(d.bestDist, Math.floor(S.dist));
    d.runs++;
    d.totalDist += Math.floor(S.dist);
    d.hoverboards = Math.max(0, d.hoverboards - S.boardUsed);
    d.totalJumps += S.runStats.jumps;
    d.totalRolls += S.runStats.rolls;
    d.totalTricks += S.tricks;
    d.nearMisses += S.near;
    Save.addCoins(S.coins);

    S.runStats.runScore = Math.floor(S.score);
    S.runStats.runDist = Math.floor(S.dist);
    S.runStats.runCoins = S.coins;
    S.runStats.maxCombo = S.maxCombo;
    S.runStats.near = S.near;
    S.runStats.tricks = S.tricks;
    S.runStats.roofTime = S.roofTime;
    S.runStats.biomeIdx = S.biome;
    const done = Missions.update(S.runStats);
    const setDone = Missions.checkSetComplete();

    setTimeout(() => {
      UI.gameOver({
        score: Math.floor(S.score), coins: S.coins, dist: S.dist,
        maxCombo: S.maxCombo, near: S.near, tricks: S.tricks,
        biome: biome().name, record
      });
      if (record) Sound.sfx.newRecord();
      if (done.length) done.forEach(m => UI.toast('Mission done: ' + m.text, 'good'));
      if (setDone) UI.toast(`RANK ${setDone.rank}! +${setDone.bonus} coins`, 'gold');
      UI.refreshStats();
    }, 1300);
  }

  /* ============================================================
     PLAYER ACTIONS
     ============================================================ */
  function moveLane(dir) {
    if (S.mode !== 'play') return;
    const n = U.clamp(S.lane + dir, 0, 2);
    if (n === S.lane) {
      // little bump against the wall
      S.camShakeX += dir * 4;
      return;
    }
    S.lane = n;
    S.targetX = laneX(n);
    S.laneT = 0;
    Sound.sfx.lane();
    if (S.onGround) puff(S.laneX, 6, S.z - 20, 4, 'rgba(255,255,255,.5)', 50);
  }

  function jump() {
    if (S.mode !== 'play') return;
    if (S.powers.jetpack > 0) return;
    const superJ = S.powers.sneakers > 0;
    S.maxJumps = superJ ? 2 : 1;
    const coyote = S.onGround || S.coyote > 0;
    if (coyote || S.jumps < S.maxJumps) {
      const first = coyote;
      S.coyote = 0;
      S.vy = superJ ? SUPER_JUMP_V : JUMP_V;
      S.onGround = false;
      S.rolling = 0;
      S.jumps++;
      S.runStats.jumps++;
      first ? Sound.sfx.jump() : Sound.sfx.doubleJump();
      puff(S.laneX, S.groundY + 4, S.z, 7, 'rgba(255,255,255,.6)', 90);
    } else S.jumpBuf = 0.15;
  }

  function roll() {
    if (S.mode !== 'play') return;
    if (!S.onGround && S.powers.jetpack <= 0) {
      // fast-fall into a roll
      S.vy = Math.min(S.vy, -900);
    }
    S.rolling = ROLL_TIME;
    S.runStats.rolls++;
    Sound.sfx.roll();
    puff(S.laneX, S.groundY + 6, S.z - 10, 6, 'rgba(255,255,255,.5)', 110);
  }

  function deployBoard() {
    if (S.mode !== 'play' || S.boardT > 0 || S.boards <= 0) { Sound.sfx.deny(); return; }
    const b = BOARDS.find(x => x.id === Save.d.board) || BOARDS[0];
    S.boardT = b.dur;
    S.boards--; S.boardUsed++;
    S.runStats.boards++;
    Sound.sfx.board();
    UI.toast(b.name + ' deployed', 'good');
    puff(S.laneX, 20, S.z, 12, U.rgba(b.col, .8), 130);
  }

  /* ============================================================
     COLLISION
     ============================================================ */
  function playerBox() {
    const rolling = S.rolling > 0;
    const h = rolling ? PLAYER.hRoll : PLAYER.hStand;
    return { x: S.laneX, y: S.y, h, w: PLAYER.w, d: PLAYER.d, z: S.z };
  }

  function overlapZ(o, pz) {
    const half = (o.d || 60) / 2 + PLAYER.d / 2;
    return Math.abs(o.z - pz) < half;
  }
  function overlapX(o, px) {
    return Math.abs(o.x - px) < (o.w + PLAYER.w) / 2 - 20;
  }

  function survivesHit(reason) {
    if (S.invuln > 0) return true;
    if (S.boardT > 0) {
      const b = BOARDS.find(x => x.id === Save.d.board) || BOARDS[0];
      S.boardT = b.tough ? Math.max(0, S.boardT - 6) : 0;
      if (!b.tough) S.boardT = 0;
      S.invuln = 1.1;
      Sound.sfx.stumble();
      UI.toast('Board absorbed the hit!', 'good');
      puff(S.laneX, S.y + 40, S.z, 16, 'rgba(255,140,200,.85)', 180);
      S.shake = .6;
      breakCombo();
      return true;
    }
    if (S.powers.shield > 0) {
      S.powers.shield = 0;
      S.invuln = 1.2;
      Sound.sfx.shield();
      UI.toast('Shield popped!', 'good');
      puff(S.laneX, S.y + 60, S.z, 18, 'rgba(140,235,255,.9)', 200);
      S.shake = .5;
      breakCombo();
      return true;
    }
    return false;
  }

  function stumble() {
    if (S.invuln > 0) return;
    S.stumbleT = .55;
    S.speed = Math.max(SPEED_START * .8, S.speed * .72);
    S.invuln = .7;
    S.shake = .35;
    breakCombo();
    Sound.sfx.stumble();
  }

  function breakCombo() {
    S.combo = 0; S.comboTimer = 0; S.multiplier = 1 + (S.powers.x2 > 0 ? 1 : 0);
  }

  function addCombo(n = 1) {
    const boost = S.perk.combo ? 1.2 : 1;
    S.combo += n * (S.perk.near ? 2 : 1);
    S.comboTimer = 3.2;
    S.maxCombo = Math.max(S.maxCombo, comboMult());
    if (S.combo % 4 === 0) { UI.combo(comboMult()); Sound.sfx.combo(S.combo); }
    S.multiplier = comboMult() * boost + (S.powers.x2 > 0 ? 1 : 0);
  }
  function comboMult() { return 1 + Math.floor(S.combo / 4); }

  function collide() {
    const pz = S.z;
    let support = null;

    for (const o of obstacles) {
      if (o.type === 'ramp') {
        if (!o.hit && overlapZ(o, pz) && overlapX(o, S.laneX) && S.y < 90) {
          o.hit = true;
          S.vy = Math.max(S.vy, 1500);
          S.onGround = false; S.jumps = 1;
          Sound.sfx.trick();
          S.tricks++;
          S.runStats.tricks++;
          addCombo(2);
          floatText('RAMP! +150', S.laneX, 150, S.z, '#ffd23f');
          S.score += 150 * S.multiplier;
          puff(S.laneX, 40, S.z, 12, 'rgba(255,210,60,.9)', 150);
        }
        continue;
      }

      const oy = o.y || 0;
      const oTop = oy + o.h;
      const zOver = overlapZ(o, pz);
      const xOver = overlapX(o, S.laneX);

      /* --- roof support (trains, crates) --- */
      if (o.roof && xOver && zOver && S.vy <= 0 && S.y >= o.roof - 26 && S.powers.jetpack <= 0) {
        if (!support || o.roof > support.roof) support = o;
      }

      /* --- lethal contact --- */
      if (zOver && xOver && S.powers.jetpack <= 0 && !o.hit) {
        const pTop = S.y + (S.rolling > 0 ? PLAYER.hRoll : PLAYER.hStand);
        const pBot = S.y;
        const vertOverlap = pBot < oTop - 10 && pTop > oy + 10;
        const onRoof = o.roof && S.y >= o.roof - 26;
        if (vertOverlap && !onRoof) {
          o.hit = true;
          if (!o.lethal) { stumble(); }
          else if (!survivesHit(o.type)) { die(); return; }
        }
      }

      /* --- near miss / cleared scoring --- */
      if (!o.scored && o.z + (o.d || 60) / 2 < pz - 10) {
        o.scored = true;
        if (o.lethal) {
          const lateral = Math.abs(o.x - S.laneX);
          if (lateral < World.LANE_W * 1.05) {
            S.near++;
            S.runStats.near = S.near;
            addCombo(1);
            S.score += 40 * S.multiplier;
            Sound.sfx.near();
            if (lateral < 90) floatText('NEAR MISS!', S.laneX, 120, S.z + 60, '#8ef7ff');
          }
        }
      }
    }

    /* --- ground / roof resolution --- */
    const gy = support ? support.roof : 0;
    if (support !== S.support) {
      if (support && S.support == null && S.y > 20) {
        // landed on a roof
        S.tricks++; S.runStats.tricks++;
        S.score += 200 * S.multiplier;
        floatText('ROOFTOP! +200', S.laneX, gy + 130, S.z, '#ffd23f');
        Sound.sfx.trick();
        addCombo(2);
      }
      S.support = support;
    }
    S.groundY = gy;

    /* falling off the side of a train roof */
    if (S.support && !overlapX(S.support, S.laneX)) { S.support = null; S.groundY = 0; }
  }

  /* ============================================================
     UPDATE
     ============================================================ */
  function update(dt) {
    S.t += dt;

    if (S.mode === 'dead') {
      S.crashT = Math.min(1, S.crashT + dt * 2.4);
      S.speed = Math.max(0, S.speed - 2400 * dt);
      S.z += S.speed * dt;
      updateParticles(dt);
      camFollow(dt);
      return;
    }
    if (S.mode !== 'play') { updateParticles(dt); camFollow(dt); return; }

    /* speed + distance */
    const target = Math.min(SPEED_MAX, SPEED_START + S.t * SPEED_RAMP * 3);
    S.speed = U.lerp(S.speed, target * (S.boardT > 0 ? 1.06 : 1), 1 - Math.pow(.2, dt));
    S.z += S.speed * dt;
    S.dist = S.z / UNITS_PER_M;
    Sound.setIntensity(U.inv(SPEED_START, SPEED_MAX, S.speed));

    /* biome cycling */
    const bi = Math.floor(S.dist / BIOME_METRES);
    const frac = (S.dist / BIOME_METRES) % 1;
    if (bi !== S.biome) {
      S.biome = bi;
      UI.toast('Entering ' + biome().name, 'gold');
      S.flash = .5;
    }
    S.biomeBlend = U.clamp((frac - .86) / .14, 0, 1);

    /* score */
    S.score += S.speed * dt * .045 * S.multiplier;
    if (S.support) { S.roofTime += dt; S.score += 60 * dt * S.multiplier; }

    /* combo decay */
    if (S.comboTimer > 0) {
      S.comboTimer -= dt;
      if (S.comboTimer <= 0) breakCombo();
    }

    /* lane interpolation */
    const b = BOARDS.find(x => x.id === Save.d.board) || BOARDS[0];
    const snap = (S.boardT > 0 && b.snap) ? LANE_SNAP * .55 : LANE_SNAP;
    if (S.laneT < 1) {
      S.laneT = Math.min(1, S.laneT + dt / snap);
      const e = U.ease.outCubic(S.laneT);
      S.laneX = U.lerp(S.laneX, S.targetX, e * .55 + .25);
    } else S.laneX = U.lerp(S.laneX, S.targetX, 1 - Math.pow(.0005, dt));

    /* timers */
    for (const k in S.powers) if (S.powers[k] > 0) {
      S.powers[k] -= dt;
      if (S.powers[k] <= 0) {
        S.powers[k] = 0;
        if (k === 'x2') S.multiplier = comboMult();
        if (k === 'jetpack') { S.vy = -200; }
        UI.toast(k.toUpperCase() + ' expired');
      }
    }
    if (S.boardT > 0) { S.boardT -= dt; if (S.boardT <= 0) { S.boardT = 0; UI.toast('Board burned out'); } }
    if (S.invuln > 0) S.invuln -= dt;
    if (S.rolling > 0) S.rolling -= dt;
    if (S.stumbleT > 0) S.stumbleT -= dt;
    if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 2.2);
    if (S.flash > 0) S.flash = Math.max(0, S.flash - dt * 2);
    if (S.hitFlash > 0) S.hitFlash = Math.max(0, S.hitFlash - dt * 2.5);

    /* vertical physics */
    if (S.powers.jetpack > 0) {
      const targetY = 330;
      S.y = U.lerp(S.y, targetY, 1 - Math.pow(.02, dt));
      S.vy = 0; S.onGround = false; S.jumps = 0; S.rolling = 0;
      if (Math.random() < dt * 40) puff(S.laneX, S.y - 30, S.z - 20, 1, 'rgba(255,170,60,.7)', 40);
      // jetpack coin stream
      if (Math.random() < dt * 6) addCoin(S.laneX, 330 + U.rand(40, -40), S.z + 2600);
    } else {
      S.vy -= GRAV * dt * (S.boardT > 0 ? .82 : 1);
      S.y += S.vy * dt;
      if (S.y <= S.groundY) {
        if (!S.onGround && S.vy < -200) {
          puff(S.laneX, S.groundY + 4, S.z, 8, 'rgba(255,255,255,.55)', 110);
          if (S.vy < -1500) S.shake = Math.min(.4, S.shake + .18);
        }
        S.y = S.groundY; S.vy = 0; S.onGround = true; S.jumps = 0;
      } else S.onGround = false;
    }

    /* coyote time + buffered jump so near-miss inputs still feel fair */
    S.coyote = S.onGround ? 0.11 : Math.max(0, (S.coyote || 0) - dt);
    if (S.jumpBuf > 0) {
      S.jumpBuf = Math.max(0, S.jumpBuf - dt);
      if (S.onGround) { S.jumpBuf = 0; jump(); }
    }

    /* animation state */
    if (S.powers.jetpack > 0) S.state = 'jet';
    else if (S.boardT > 0 && S.onGround) S.state = 'hover';
    else if (S.rolling > 0) S.state = 'roll';
    else if (!S.onGround) S.state = 'jump';
    else if (S.stumbleT > 0) S.state = 'stumble';
    else S.state = 'run';

    /* world */
    obstacles.forEach(o => { if (o.vz) o.z += o.vz * dt; });
    generateAhead();
    cull();
    collide();
    if (S.mode !== 'play') return;

    updateCoins(dt);
    updatePickups(dt);
    updateParticles(dt);
    camFollow(dt);

    /* live mission progress */
    S.lastMissionCheck += dt;
    if (S.lastMissionCheck > .6) {
      S.lastMissionCheck = 0;
      S.runStats.runScore = Math.floor(S.score);
      S.runStats.runDist = Math.floor(S.dist);
      S.runStats.runCoins = S.coins;
      S.runStats.maxCombo = S.maxCombo;
      S.runStats.near = S.near;
      S.runStats.roofTime = S.roofTime;
      S.runStats.tricks = S.tricks;
      S.runStats.biomeIdx = S.biome;
      const done = Missions.update(S.runStats);
      done.forEach(m => { UI.missionToast(m.text); Sound.sfx.mission(); });
    }
  }

  function camFollow(dt) {
    camZ = S.z - CAM_BACK;
    camX = U.lerp(camX, S.laneX * .62, 1 - Math.pow(.0008, dt));
    S.camX = camX;
    const sh = S.shake * (Save.d.opts.shake ? 1 : 0);
    S.camShakeX = U.rand(1, -1) * 22 * sh;
    S.camShakeY = U.rand(1, -1) * 18 * sh;
  }

  function updateCoins(dt) {
    const magnetOn = S.powers.magnet > 0;
    const b = BOARDS.find(x => x.id === Save.d.board) || BOARDS[0];
    const magnetish = S.boardT > 0 && b.magnetish;
    const range = magnetOn ? 1500 : (magnetish ? 500 : 130);
    const goldenBoost = S.perk.coins ? 1.25 : 1;

    for (const c of coins) {
      if (c.got) continue;
      const dz = c.z - S.z;
      if (dz < -80) continue;
      if ((magnetOn || magnetish) && dz < range && dz > -40) {
        const k = 1 - U.clamp(dz / range, 0, 1);
        c.x = U.lerp(c.x, S.laneX, k * dt * 9);
        c.y = U.lerp(c.y, S.y + 60, k * dt * 9);
        c.pull = k;
      }
      const near = Math.abs(dz) < 70 &&
        Math.abs(c.x - S.laneX) < 92 &&
        Math.abs(c.y - (S.y + 62)) < 110;
      if (near) {
        c.got = true;
        const val = Math.round(1 * goldenBoost * (S.powers.x2 > 0 ? 2 : 1));
        S.coins += val;
        S.runStats.runCoins = S.coins;
        S.score += 12 * S.multiplier;
        sparkle(c.x, c.y, c.z);
        (S.coins % 25 === 0) ? Sound.sfx.bigCoin() : Sound.sfx.coin();
      }
    }
  }

  function updatePickups(dt) {
    for (const p of pickups) {
      if (p.got) continue;
      const dz = p.z - S.z;
      if (Math.abs(dz) < 90 && Math.abs(p.x - S.laneX) < 110 && Math.abs(p.y - (S.y + 60)) < 170) {
        p.got = true;
        grabPickup(p.kind);
      }
    }
  }

  function grabPickup(kind) {
    if (kind === 'hoverboard') {
      S.boards++;
      UI.toast('+1 Hoverboard', 'good');
      Sound.sfx.powerup();
      return;
    }
    const dur = puDuration(kind);
    S.powers[kind] = Math.max(S.powers[kind], dur);
    S.score += 100 * S.multiplier;
    switch (kind) {
      case 'magnet': Sound.sfx.magnet(); S.magnets++; S.runStats.magnets = S.magnets; UI.toast('COIN MAGNET!', 'gold'); break;
      case 'jetpack': Sound.sfx.jetpack(); UI.toast('JETPACK!', 'gold'); S.vy = 900; break;
      case 'x2': Sound.sfx.powerup(); UI.toast('SCORE x2!', 'gold'); S.multiplier = comboMult() + 1; break;
      case 'sneakers': Sound.sfx.powerup(); UI.toast('SUPER SNEAKERS!', 'good'); break;
      case 'shield': Sound.sfx.shield(); UI.toast('BUBBLE SHIELD!', 'good'); break;
    }
    S.flash = .3;
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vy -= 420 * dt;
      p.life -= p.decay * dt;
      if (p.life <= 0 || p.z < S.z - 500) particles.splice(i, 1);
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.y += 90 * dt; f.life -= dt * .9;
      if (f.life <= 0) floaters.splice(i, 1);
    }
  }

  /* ============================================================
     RENDER
     ============================================================ */
  function render() {
    const B = biome(), BN = nextBiome();
    const camXn = U.clamp(camX / 300, -1, 1);

    ctx.save();
    ctx.clearRect(0, 0, W, H);

    World.drawSky(ctx, B, BN, S.biomeBlend, S.t, W, H, horizon, camXn);
    World.drawBackdrop(ctx, B, S.t, W, H, horizon, S.z * .02, camXn);
    World.drawGround(ctx, P, B, camX, CAM_Y, camZ, W, H, horizon, S.dist);

    /* collect everything in the world and paint far → near */
    const items = [];
    for (const s of scenery) items.push({ z: s.z, kind: 's', o: s });
    for (const o of obstacles) items.push({ z: o.z + (o.d || 60) / 2, kind: 'o', o });
    for (const c of coins) if (!c.got) items.push({ z: c.z, kind: 'c', o: c });
    for (const p of pickups) if (!p.got) items.push({ z: p.z, kind: 'p', o: p });
    items.push({ z: S.z, kind: 'me', o: null });
    for (const p of particles) items.push({ z: p.z, kind: 'fx', o: p });
    for (const f of floaters) items.push({ z: f.z, kind: 'ft', o: f });
    items.sort((a, b) => b.z - a.z);

    const contrast = Save.d.opts.contrast;
    for (const it of items) {
      if (it.z < camZ + 20) continue;
      switch (it.kind) {
        case 's': World.drawScenery(P, ctx, it.o, camX, CAM_Y, B); break;
        case 'o': drawObstacle(it.o, contrast); break;
        case 'c': Props.coin(P, ctx, it.o, S.t); break;
        case 'p': Props.powerup(P, ctx, it.o, S.t); break;
        case 'me': drawPlayer(); break;
        case 'fx': drawParticle(it.o); break;
        case 'ft': drawFloater(it.o); break;
      }
    }

    World.drawFog(ctx, B, W, horizon);
    if (Save.d.opts.blur) World.drawSpeedLines(ctx, W, H, U.inv(SPEED_MAX * .62, SPEED_MAX, S.speed) * (S.boardT > 0 ? 1.3 : 1), S.t);
    World.drawWeather(ctx, B.weather, S.t, W, H, U.inv(SPEED_START, SPEED_MAX, S.speed));
    World.drawVignette(ctx, W, H, B.id === 'tunnel' || B.id === 'neon' ? .7 : .45);

    if (S.powers.magnet > 0) magnetOverlay();
    if (S.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${S.flash * .35})`; ctx.fillRect(0, 0, W, H); }
    if (S.hitFlash > 0) { ctx.fillStyle = `rgba(255,40,40,${S.hitFlash * .45})`; ctx.fillRect(0, 0, W, H); }

    ctx.restore();
  }

  function drawObstacle(o, contrast) {
    switch (o.type) {
      case 'barrier': Props.barrier(P, ctx, { x: o.x, z: o.z, contrast }, camX, CAM_Y); break;
      case 'beam': Props.beam(P, ctx, { x: o.x, z: o.z, contrast }, camX, CAM_Y); break;
      case 'crates': Props.crates(P, ctx, o, camX, CAM_Y); break;
      case 'cones': Props.cones(P, ctx, o, camX, CAM_Y); break;
      case 'train': Props.train(P, ctx, o, camX, CAM_Y); break;
      case 'ramp': Props.ramp(P, ctx, o, camX, CAM_Y); break;
      case 'wall':
        Props.box3d(P, ctx, {
          x: o.x, y: 0, z: o.z, w: o.w, h: o.h, d: o.d,
          top: contrast ? '#ff3b3b' : '#96604a', front: contrast ? '#ff5a5a' : '#a86b52',
          side: '#7c4b39', camX, camY: CAM_Y
        });
        // brick lines
        for (let r = 1; r < 5; r++) {
          const a = P(o.x - o.w / 2, o.h * r / 5, o.z - o.d / 2), b2 = P(o.x + o.w / 2, o.h * r / 5, o.z - o.d / 2);
          if (!a || !b2) continue;
          ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b2.sx, b2.sy);
          ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1.4; ctx.stroke();
        }
        break;
    }
  }

  function drawParticle(p) {
    const pr = P(p.x, p.y, p.z);
    if (!pr) return;
    const r = Math.max(.6, p.r * pr.s * p.life);
    ctx.globalAlpha = U.clamp(p.life, 0, 1);
    if (p.star) {
      U.star(ctx, pr.sx, pr.sy, 4, r * 2, r * .7);
      ctx.fillStyle = p.col; ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(pr.sx, pr.sy, r, 0, 7);
      ctx.fillStyle = p.col; ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFloater(f) {
    const pr = P(f.x, f.y, f.z);
    if (!pr) return;
    ctx.globalAlpha = U.clamp(f.life, 0, 1);
    const size = U.clamp(46 * pr.s, 12, 54);
    U.text(ctx, f.text, pr.sx, pr.sy, { size, color: f.col, outline: '#10161f', lw: size * .13 + 1 });
    ctx.globalAlpha = 1;
  }

  function magnetOverlay() {
    const pr = P(S.laneX, S.y + 60, S.z);
    if (!pr) return;
    ctx.save();
    ctx.globalAlpha = .25 + Math.sin(S.t * 8) * .08;
    const g = ctx.createRadialGradient(pr.sx, pr.sy, 20, pr.sx, pr.sy, 340);
    g.addColorStop(0, 'rgba(255,120,120,.5)'); g.addColorStop(1, 'rgba(255,120,120,0)');
    ctx.fillStyle = g; ctx.fillRect(pr.sx - 340, pr.sy - 340, 680, 680);
    ctx.restore();
  }

  function drawPlayer() {
    const pr = P(S.laneX, S.y, S.z);
    if (!pr) return;
    const s = pr.s * 0.66;
    const t = S.t;
    const phase = t * (6 + S.speed / 260) * (S.boardT > 0 ? .4 : 1);

    // ground shadow, projected on to whatever is below
    const gp = P(S.laneX, S.groundY, S.z);
    if (gp) {
      const air = U.clamp(1 - (S.y - S.groundY) / 340, .18, 1);
      ctx.save();
      U.ellipse(ctx, gp.sx, gp.sy, 52 * gp.s * air, 15 * gp.s * air);
      ctx.fillStyle = `rgba(0,0,0,${.34 * air})`; ctx.fill();
      ctx.restore();
    }

    // jetpack behind the body
    if (S.powers.jetpack > 0) Props.jetpack(ctx, pr.sx, pr.sy - 6 * s, s, t);

    Riggy.draw(ctx, {
      x: pr.sx, y: pr.sy, scale: s, skinId: Save.d.character,
      state: S.state, t, phase,
      extra: { vy: S.vy, rollT: 1 - S.rolling / ROLL_TIME, crashT: S.crashT, turn: .5, shadowScale: 0 },
      view: 'back', shadow: false,
      alpha: (S.invuln > 0 && S.mode === 'play' && Math.floor(t * 18) % 2) ? .45 : 1
    });

    if (S.boardT > 0) {
      const b = BOARDS.find(x => x.id === Save.d.board) || BOARDS[0];
      ctx.save();
      ctx.globalAlpha = S.boardT < 3 && Math.floor(t * 8) % 2 ? .45 : 1;
      Props.hoverboard(P, ctx, pr.sx, pr.sy + 4 * s, s * .95, t);
      ctx.restore();
    }
    if (S.powers.shield > 0) Props.shieldBubble(ctx, pr.sx, pr.sy - 78 * s, 118 * s, t);
    if (S.powers.sneakers > 0 && S.onGround && Math.random() < .5)
      puff(S.laneX, S.groundY + 4, S.z - 30, 1, 'rgba(120,255,170,.55)', 40);
  }

  /* ============================================================
     INPUT
     ============================================================ */
  function bindInput() {
    const keys = {};
    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if (keys[k] && k !== 'arrowleft' && k !== 'arrowright') return;
      keys[k] = true;
      Sound.resume();

      if (S.mode === 'menu') {
        if (k === 'enter' || k === ' ') { const anySheet = ['characters', 'shop', 'missions', 'how', 'settings'].some(id => !document.getElementById(id).classList.contains('hidden')); if (!anySheet) start(); }
        if (k === 'escape') UI.hideAllSheets();
        return;
      }
      switch (k) {
        case 'arrowleft': case 'a': moveLane(-1); break;
        case 'arrowright': case 'd': moveLane(1); break;
        case 'arrowup': case 'w': case ' ': jump(); break;
        case 'arrowdown': case 's': roll(); break;
        case 'shift': deployBoard(); break;
        case 'p': case 'escape': togglePause(); break;
        case 'enter': if (S.mode === 'dead') start(); break;
      }
    });
    window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

    /* touch: swipes + double tap for the board */
    let tx = 0, ty = 0, tt = 0, lastTap = 0;
    cv.addEventListener('touchstart', e => {
      const t0 = e.changedTouches[0];
      tx = t0.clientX; ty = t0.clientY; tt = performance.now();
      Sound.resume();
    }, { passive: true });
    cv.addEventListener('touchend', e => {
      const t0 = e.changedTouches[0];
      const dx = t0.clientX - tx, dy = t0.clientY - ty, dtms = performance.now() - tt;
      const adx = Math.abs(dx), ady = Math.abs(dy);
      if (adx < 26 && ady < 26 && dtms < 320) {
        const nowT = performance.now();
        if (nowT - lastTap < 320) deployBoard(); else jump();
        lastTap = nowT;
        return;
      }
      if (adx > ady) moveLane(dx > 0 ? 1 : -1);
      else if (dy < 0) jump();
      else roll();
    }, { passive: true });

    /* mouse drag works too, handy on a laptop */
    let mdown = false, mx = 0, my = 0;
    cv.addEventListener('mousedown', e => { mdown = true; mx = e.clientX; my = e.clientY; Sound.resume(); });
    window.addEventListener('mouseup', e => {
      if (!mdown) return; mdown = false;
      const dx = e.clientX - mx, dy = e.clientY - my;
      if (Math.abs(dx) < 24 && Math.abs(dy) < 24) { if (S.mode === 'play') jump(); return; }
      if (Math.abs(dx) > Math.abs(dy)) moveLane(dx > 0 ? 1 : -1);
      else if (dy < 0) jump(); else roll();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && S.mode === 'play') togglePause();
    });
  }

  /* ============================================================
     MAIN LOOP
     ============================================================ */
  let last = 0, fpsAcc = 0, fpsFrames = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!last) last = ts;
    let dt = (ts - last) / 1000;
    last = ts;
    dt = Math.min(dt, 1 / 20);        // never simulate a giant step
    S.dt = dt;

    if (S.mode === 'play' || S.mode === 'dead' || S.mode === 'countdown') update(dt);
    else { S.t += dt; camFollow(dt); }

    render();
    UI.animateMascots(dt);

    if (S.mode === 'play' || S.mode === 'dead' || S.mode === 'countdown') {
      UI.hud({
        score: S.score, dist: S.dist, speed: S.speed * 0.09,
        coins: S.coins, multiplier: S.multiplier, boards: S.boards, onBoard: S.boardT > 0
      });
      UI.powerups({
        magnet: S.powers.magnet, jetpack: S.powers.jetpack, x2: S.powers.x2,
        sneakers: S.powers.sneakers, shield: S.powers.shield, hoverboard: S.boardT
      });
    }

    if (Save.d.opts.fps) {
      fpsAcc += dt; fpsFrames++;
      if (fpsAcc > .35) {
        UI.el.fps.textContent = Math.round(fpsFrames / fpsAcc) + ' fps · ' +
          (obstacles.length + coins.length + pickups.length + scenery.length) + ' objs';
        fpsAcc = 0; fpsFrames = 0;
      }
    }
  }

  /* ============================================================
     BOOT
     ============================================================ */
  function boot() {
    resize();
    bindInput();
    UI.bindButtons(api);
    UI.refreshStats();
    UI.buildCharacters();
    UI.buildShop();
    UI.buildMissions();
    UI.bindSettings();
    Sound.setSfx(Save.d.opts.sfx);
    // the menu still renders the track behind the UI, gently drifting
    S.mode = 'menu'; S.speed = 520;
    spawnZ = 900; scenerySpawnZ = 0;
    generateAhead();
    (function idleTrack() {
      setInterval(() => {
        if (S.mode !== 'menu') return;
        S.z += 6; S.dist = S.z / UNITS_PER_M;
        generateAhead(); cull();
      }, 16);
    })();
    requestAnimationFrame(frame);
  }

  const api = { start, toMenu, togglePause, deployBoard, boot, get state() { return S; } };
  return api;
})();

window.addEventListener('load', () => Game.boot());
