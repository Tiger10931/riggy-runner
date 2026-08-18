/* ============================================================
   world.js — biomes, sky, parallax backdrops, the track surface,
   trackside scenery and weather.
   ============================================================ */
'use strict';

const World = (() => {

  const LANE_W = 150;          // world units between lane centres
  const LANES = [-LANE_W, 0, LANE_W];

  /* ---------------------------------------------------------
     BIOMES
     --------------------------------------------------------- */
  const BIOMES = [
    {
      id: 'city', name: 'Downtown',
      sky: ['#7cc7ff', '#bfe6ff', '#e9f7ff'],
      sun: '#fff6c9', sunY: .22, cloudy: .8,
      ground: '#6f7683', groundAlt: '#656c78', gravel: '#8c93a0',
      rail: '#c9d2de', wall: '#8d97a5',
      fog: '#cfe9ff', light: 1,
      scenery: ['building', 'building', 'lamp', 'billboard', 'tree'],
      weather: null
    },
    {
      id: 'sunset', name: 'Sunset Strip',
      sky: ['#ff7a4d', '#ffb36b', '#ffe0a3'],
      sun: '#fff0b0', sunY: .40, cloudy: .5,
      ground: '#6b5a63', groundAlt: '#5f5058', gravel: '#8b7480',
      rail: '#ffd9a8', wall: '#7c5f6d',
      fog: '#ffc48a', light: .92,
      scenery: ['palm', 'building', 'billboard', 'lamp'],
      weather: null
    },
    {
      id: 'tunnel', name: 'Deep Tunnel',
      sky: ['#0b0f18', '#131a28', '#1b2436'],
      sun: null, cloudy: 0,
      ground: '#3b414d', groundAlt: '#343a45', gravel: '#4a515e',
      rail: '#9aa6b5', wall: '#2b313c',
      fog: '#141a26', light: .55, tunnel: true,
      scenery: ['pipe', 'lamp', 'grate', 'pipe'],
      weather: 'spark'
    },
    {
      id: 'desert', name: 'Sunbaked Canyon',
      sky: ['#4fb0e8', '#9fd8f5', '#ffe9c2'],
      sun: '#fffbe0', sunY: .18, cloudy: .25,
      ground: '#c79a5c', groundAlt: '#bb8e52', gravel: '#dcb87f',
      rail: '#e8d7b6', wall: '#a9713c',
      fog: '#f0d6a8', light: 1.05,
      scenery: ['cactus', 'rock', 'mesa', 'cactus'],
      weather: 'dust'
    },
    {
      id: 'neon', name: 'Neon District',
      sky: ['#08061a', '#191047', '#3b1470'],
      sun: null, cloudy: .3,
      ground: '#25233a', groundAlt: '#1f1d33', gravel: '#332f4d',
      rail: '#ff5fd1', wall: '#2a2350',
      fog: '#2b1a52', light: .7, neon: true,
      scenery: ['neonSign', 'building', 'neonSign', 'lamp'],
      weather: 'rain'
    },
    {
      id: 'snow', name: 'Frozen Yard',
      sky: ['#8fb8d8', '#c8dcea', '#eef6fb'],
      sun: '#ffffff', sunY: .3, cloudy: .9,
      ground: '#dfe9f2', groundAlt: '#d2dee9', gravel: '#eaf2f8',
      rail: '#a7b6c4', wall: '#b8c8d6',
      fog: '#e8f2fa', light: 1.02,
      scenery: ['pine', 'pine', 'lamp', 'rock'],
      weather: 'snow'
    }
  ];

  /* ---------------------------------------------------------
     SKY + parallax
     --------------------------------------------------------- */
  const clouds = [];
  for (let i = 0; i < 16; i++) clouds.push({ x: Math.random(), y: Math.random() * .7, s: .5 + Math.random(), sp: .2 + Math.random() * .5 });

  const stars = [];
  for (let i = 0; i < 90; i++) stars.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.6 + .4, tw: Math.random() * 6 });

  function drawSky(ctx, B, Bnext, blend, t, W, H, horizon, camXn) {
    const c0 = Bnext ? U.mix(B.sky[0], Bnext.sky[0], blend) : B.sky[0];
    const c1 = Bnext ? U.mix(B.sky[1], Bnext.sky[1], blend) : B.sky[1];
    const c2 = Bnext ? U.mix(B.sky[2], Bnext.sky[2], blend) : B.sky[2];
    const g = ctx.createLinearGradient(0, 0, 0, horizon + 40);
    g.addColorStop(0, c0); g.addColorStop(.62, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, horizon + 42);

    const dark = (B.id === 'neon' || B.id === 'tunnel') ? 1 : 0;
    if (dark) {
      stars.forEach(s => {
        const a = .35 + Math.abs(Math.sin(t * .8 + s.tw)) * .65;
        ctx.fillStyle = `rgba(255,255,255,${a * .9})`;
        ctx.fillRect((s.x * W - camXn * 22 + W) % W, s.y * horizon * .8, s.r, s.r);
      });
      // moon
      ctx.save();
      ctx.beginPath(); ctx.arc(W * .78 - camXn * 26, horizon * .28, 42, 0, 7);
      ctx.fillStyle = 'rgba(240,246,255,.95)'; ctx.shadowColor = 'rgba(200,225,255,.8)'; ctx.shadowBlur = 40; ctx.fill();
      ctx.restore();
    }

    if (B.sun) {
      const sx = W * .68 - camXn * 30, sy = horizon * B.sunY;
      const rg = ctx.createRadialGradient(sx, sy, 8, sx, sy, 190);
      rg.addColorStop(0, U.rgba(B.sun, .95)); rg.addColorStop(.25, U.rgba(B.sun, .5)); rg.addColorStop(1, U.rgba(B.sun, 0));
      ctx.fillStyle = rg; ctx.fillRect(sx - 200, sy - 200, 400, 400);
      ctx.beginPath(); ctx.arc(sx, sy, 44, 0, 7); ctx.fillStyle = B.sun; ctx.fill();
    }

    // clouds
    if (B.cloudy > 0) {
      clouds.forEach((c, i) => {
        const x = ((c.x + t * .004 * c.sp) % 1.25 - .12) * W - camXn * 40 * c.sp;
        const y = c.y * horizon * .72 + 12;
        const s = c.s * (28 + i % 3 * 10);
        ctx.save();
        ctx.globalAlpha = .55 * B.cloudy;
        ctx.fillStyle = '#ffffff';
        [[0, 0, 1], [-.8, .2, .72], [.85, .18, .78], [-.35, -.35, .62], [.4, -.3, .66]].forEach(o => {
          ctx.beginPath(); ctx.arc(x + o[0] * s, y + o[1] * s, s * o[2], 0, 7); ctx.fill();
        });
        ctx.restore();
      });
    }
  }

  /* far parallax silhouettes: skyline / mountains */
  function drawBackdrop(ctx, B, t, W, H, horizon, scroll, camXn) {
    const layers = [
      { depth: .06, alpha: .35, h: 150, col: U.mix(B.fog, '#000000', .18) },
      { depth: .12, alpha: .55, h: 110, col: U.mix(B.fog, '#000000', .35) },
      { depth: .22, alpha: .8, h: 82, col: U.mix(B.fog, '#000000', .5) }
    ];
    layers.forEach((L, li) => {
      ctx.save();
      ctx.globalAlpha = L.alpha;
      ctx.fillStyle = L.col;
      const off = (scroll * L.depth + camXn * 60 * L.depth) % 240;
      if (B.id === 'desert' || B.id === 'snow') {
        // rolling hills / mesas
        ctx.beginPath(); ctx.moveTo(-100, horizon + 4);
        for (let x = -100; x <= W + 100; x += 20) {
          const y = horizon - L.h * (.45 + .55 * Math.abs(Math.sin((x + off * 3) * .0032 + li)));
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W + 100, horizon + 4); ctx.closePath(); ctx.fill();
      } else if (B.id === 'tunnel') {
        ctx.fillRect(0, horizon - L.h, W, L.h + 6);
      } else {
        // skyline of towers
        for (let i = -2; i < 26; i++) {
          const seed = Math.abs(Math.sin((i + li * 31) * 12.9898) * 43758.5453) % 1;
          const bw = 46 + seed * 54;
          const bh = L.h * (.45 + seed * .95);
          const bx = i * 120 - off * 3.4;
          if (bx > W + 130 || bx < -160) continue;
          ctx.fillRect(bx, horizon - bh, bw, bh + 6);
          if (B.id === 'neon' || B.id === 'city') {
            ctx.save(); ctx.globalAlpha = L.alpha * (B.id === 'neon' ? .8 : .35);
            ctx.fillStyle = B.id === 'neon' ? '#ffe98a' : '#fff9d6';
            for (let wy = horizon - bh + 10; wy < horizon - 12; wy += 16)
              for (let wx = bx + 8; wx < bx + bw - 8; wx += 14)
                if (((wx * 31 + wy * 17 + li) % 7) < 3) ctx.fillRect(wx, wy, 5, 7);
            ctx.restore();
          }
        }
      }
      ctx.restore();
    });
  }

  /* ---------------------------------------------------------
     GROUND / TRACK
     --------------------------------------------------------- */
  function drawGround(ctx, P, B, camX, camY, camZ, W, H, horizon, dist) {
    // base plane
    const far = camZ + 5200, near = camZ + 30;
    const a = P(-9000, 0, far), b = P(9000, 0, far), c = P(9000, 0, near), d = P(-9000, 0, near);
    if (a && b && c && d) {
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.lineTo(c.sx, c.sy); ctx.lineTo(d.sx, d.sy);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, horizon, 0, H);
      g.addColorStop(0, U.mix(B.ground, B.fog, .65));
      g.addColorStop(.25, B.ground);
      g.addColorStop(1, U.shade(B.ground, -.12));
      ctx.fillStyle = g; ctx.fill();
    }

    // gravel bed under the track
    const gA = P(-260, 0.2, far), gB = P(260, 0.2, far), gC = P(260, 0.2, near), gD = P(-260, 0.2, near);
    if (gA && gB && gC && gD) {
      ctx.beginPath();
      ctx.moveTo(gA.sx, gA.sy); ctx.lineTo(gB.sx, gB.sy); ctx.lineTo(gC.sx, gC.sy); ctx.lineTo(gD.sx, gD.sy);
      ctx.closePath();
      const g2 = ctx.createLinearGradient(0, horizon, 0, H);
      g2.addColorStop(0, U.mix(B.gravel, B.fog, .7)); g2.addColorStop(.3, B.gravel); g2.addColorStop(1, U.shade(B.gravel, -.1));
      ctx.fillStyle = g2; ctx.fill();
    }

    // sleepers (the moving rungs that sell the speed)
    const SP = 62;
    const z0 = Math.ceil((camZ + 40) / SP) * SP;
    for (let z = z0; z < camZ + 3400; z += SP) {
      const p1 = P(-230, 1, z), p2 = P(230, 1, z), p3 = P(230, 1, z + 22), p4 = P(-230, 1, z + 22);
      if (!p1 || !p2 || !p3 || !p4) continue;
      const fade = U.clamp(1 - (z - camZ) / 3000, 0, 1);
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy); ctx.lineTo(p2.sx, p2.sy); ctx.lineTo(p3.sx, p3.sy); ctx.lineTo(p4.sx, p4.sy);
      ctx.closePath();
      ctx.fillStyle = U.rgba(B.groundAlt, .85 * fade + .1);
      ctx.fill();
    }

    // rails: two per lane
    ctx.save();
    LANES.forEach(lx => {
      [-52, 52].forEach(off => {
        const p1 = P(lx + off, 4, camZ + 40), p2 = P(lx + off, 4, camZ + 3400);
        if (!p1 || !p2) return;
        ctx.beginPath(); ctx.moveTo(p1.sx, p1.sy); ctx.lineTo(p2.sx, p2.sy);
        const grad = ctx.createLinearGradient(p1.sx, p1.sy, p2.sx, p2.sy);
        grad.addColorStop(0, B.rail); grad.addColorStop(1, U.rgba(B.rail, 0));
        ctx.strokeStyle = grad; ctx.lineWidth = 4.5; ctx.stroke();
      });
      // faint lane centre guide
      const q1 = P(lx, 2, camZ + 40), q2 = P(lx, 2, camZ + 2200);
      if (q1 && q2) {
        ctx.beginPath(); ctx.moveTo(q1.sx, q1.sy); ctx.lineTo(q2.sx, q2.sy);
        ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 2; ctx.stroke();
      }
    });
    ctx.restore();

    // side walls / platform edges
    [-1, 1].forEach(sd => {
      const wA = P(sd * 262, 0, camZ + 30), wB = P(sd * 262, 0, camZ + 3000),
        wC = P(sd * 262, 78, camZ + 3000), wD = P(sd * 262, 78, camZ + 30);
      if (!wA || !wB || !wC || !wD) return;
      ctx.beginPath();
      ctx.moveTo(wA.sx, wA.sy); ctx.lineTo(wB.sx, wB.sy); ctx.lineTo(wC.sx, wC.sy); ctx.lineTo(wD.sx, wD.sy);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, horizon, 0, H);
      g.addColorStop(0, U.mix(B.wall, B.fog, .7)); g.addColorStop(1, B.wall);
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1.5; ctx.stroke();
    });

    // tunnel ceiling
    if (B.tunnel) {
      const cA = P(-320, 430, camZ + 30), cB = P(320, 430, camZ + 30),
        cC = P(320, 430, camZ + 2600), cD = P(-320, 430, camZ + 2600);
      if (cA && cB && cC && cD) {
        ctx.beginPath();
        ctx.moveTo(cA.sx, cA.sy); ctx.lineTo(cB.sx, cB.sy); ctx.lineTo(cC.sx, cC.sy); ctx.lineTo(cD.sx, cD.sy);
        ctx.closePath();
        ctx.fillStyle = '#1a2030'; ctx.fill();
      }
      // ceiling lamps whipping past
      for (let z = Math.ceil((camZ + 60) / 420) * 420; z < camZ + 2600; z += 420) {
        const l = P(0, 420, z);
        if (!l) continue;
        const r = 40 * l.s;
        const g = ctx.createRadialGradient(l.sx, l.sy, 2, l.sx, l.sy, r * 3);
        g.addColorStop(0, 'rgba(255,240,190,.85)'); g.addColorStop(1, 'rgba(255,240,190,0)');
        ctx.fillStyle = g; ctx.fillRect(l.sx - r * 3, l.sy - r * 3, r * 6, r * 6);
      }
    }
  }

  /* horizon fog band so distant geometry melts away */
  function drawFog(ctx, B, W, horizon) {
    const g = ctx.createLinearGradient(0, horizon - 70, 0, horizon + 150);
    g.addColorStop(0, U.rgba(B.fog, 0));
    g.addColorStop(.42, U.rgba(B.fog, .85));
    g.addColorStop(1, U.rgba(B.fog, 0));
    ctx.fillStyle = g; ctx.fillRect(0, horizon - 70, W, 220);
  }

  /* ---------------------------------------------------------
     TRACKSIDE SCENERY
     --------------------------------------------------------- */
  function drawScenery(P, ctx, o, camX, camY, B) {
    const side = o.side;
    const BASE = { building: 540, mesa: 620, billboard: 430, neonSign: 420, grate: 300 };
    const x = side * ((BASE[o.kind] || 350) + o.off);
    switch (o.kind) {
      case 'building': {
        Props.box3d(P, ctx, {
          x, y: 0, z: o.z, w: 220, h: o.h, d: 220,
          top: U.shade(o.col, .25), front: o.col, side: U.shade(o.col, -.25),
          camX, camY, lw: 1.2
        });
        // windows on the near face
        const rows = Math.floor(o.h / 90);
        for (let r = 0; r < rows; r++) for (let cc = -1; cc <= 1; cc++) {
          const p = P(x + cc * 62, 60 + r * 90, o.z - 110);
          if (!p || p.s < .05) continue;
          const w = 34 * p.s, h = 40 * p.s;
          ctx.fillStyle = (r * 7 + cc * 3 + o.seed) % 5 < 2 ? 'rgba(255,236,160,.85)' : 'rgba(40,60,90,.7)';
          ctx.fillRect(p.sx - w / 2, p.sy - h / 2, w, h);
        }
        break;
      }
      case 'lamp': {
        Props.box3d(P, ctx, { x, y: 0, z: o.z, w: 14, h: 220, d: 14, top: '#7d8794', front: '#666f7c', side: '#525a66', camX, camY, lw: 1 });
        const head = P(x - side * 40, 230, o.z);
        if (head) {
          const r = 22 * head.s;
          ctx.beginPath(); ctx.ellipse(head.sx, head.sy, r, r * .5, 0, 0, 7);
          ctx.fillStyle = '#ffe9a8'; ctx.fill();
          const g = ctx.createRadialGradient(head.sx, head.sy, 1, head.sx, head.sy, r * 6);
          g.addColorStop(0, 'rgba(255,225,150,.5)'); g.addColorStop(1, 'rgba(255,225,150,0)');
          ctx.fillStyle = g; ctx.fillRect(head.sx - r * 6, head.sy - r * 6, r * 12, r * 12);
        }
        break;
      }
      case 'billboard': {
        Props.box3d(P, ctx, { x, y: 0, z: o.z, w: 12, h: 150, d: 12, top: '#5c646f', front: '#4c535d', side: '#3f454e', camX, camY, lw: 1 });
        Props.box3d(P, ctx, { x, y: 150, z: o.z, w: 250, h: 130, d: 14, top: '#dfe6ef', front: o.col, side: '#8f97a3', camX, camY, lw: 1.4 });
        const p = P(x, 214, o.z - 8);
        if (p && p.s > .12) U.text(ctx, o.text || 'RIGGY', p.sx, p.sy, { size: 62 * p.s, color: '#fff', outline: '#10161f', lw: 7 * p.s + 1 });
        break;
      }
      case 'neonSign': {
        Props.box3d(P, ctx, { x, y: 0, z: o.z, w: 12, h: 190, d: 12, top: '#3a2b5c', front: '#2c2148', side: '#221a38', camX, camY, lw: 1 });
        const p = P(x, 250, o.z);
        if (p && p.s > .1) {
          ctx.save();
          ctx.shadowColor = o.col; ctx.shadowBlur = 30 * p.s + 6;
          U.roundRect(ctx, p.sx - 110 * p.s, p.sy - 55 * p.s, 220 * p.s, 110 * p.s, 14 * p.s);
          ctx.strokeStyle = o.col; ctx.lineWidth = 5 * p.s + 1; ctx.stroke();
          U.text(ctx, o.text || 'DASH', p.sx, p.sy, { size: 52 * p.s, color: o.col, outline: 'rgba(0,0,0,.6)', lw: 4 * p.s });
          ctx.restore();
        }
        break;
      }
      case 'tree': case 'pine': {
        const trunk = P(x, 0, o.z), top = P(x, o.h, o.z);
        if (!trunk || !top) return;
        ctx.fillStyle = '#6b4a2a';
        ctx.fillRect(trunk.sx - 9 * trunk.s, top.sy, 18 * trunk.s, trunk.sy - top.sy);
        if (o.kind === 'pine') {
          for (let k = 0; k < 3; k++) {
            const yy = o.h * (.45 + k * .2);
            const b = P(x, yy - o.h * .3, o.z), tp2 = P(x, yy + o.h * .18, o.z);
            if (!b || !tp2) continue;
            const w = (95 - k * 22) * b.s;
            ctx.beginPath(); ctx.moveTo(tp2.sx, tp2.sy); ctx.lineTo(b.sx + w, b.sy); ctx.lineTo(b.sx - w, b.sy); ctx.closePath();
            ctx.fillStyle = k === 0 ? '#1f6b3a' : '#2b8049'; ctx.fill();
            if (B.id === 'snow') { ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fill(); ctx.globalAlpha = 1; }
          }
        } else {
          const cr = 78 * trunk.s;
          [[0, -.1, 1], [-.55, .12, .72], [.55, .12, .72]].forEach(oo => {
            ctx.beginPath(); ctx.arc(top.sx + oo[0] * cr, top.sy + oo[1] * cr, cr * oo[2], 0, 7);
            ctx.fillStyle = '#2f9e52'; ctx.fill();
          });
        }
        break;
      }
      case 'palm': {
        const base = P(x, 0, o.z), top = P(x + side * 18, o.h, o.z);
        if (!base || !top) return;
        ctx.beginPath(); ctx.moveTo(base.sx, base.sy);
        ctx.quadraticCurveTo(base.sx + side * 20 * base.s, (base.sy + top.sy) / 2, top.sx, top.sy);
        ctx.strokeStyle = '#8a6236'; ctx.lineWidth = 14 * base.s; ctx.lineCap = 'round'; ctx.stroke();
        for (let k = 0; k < 6; k++) {
          const a = Math.PI + k * (Math.PI / 5.5);
          ctx.beginPath(); ctx.moveTo(top.sx, top.sy);
          ctx.quadraticCurveTo(top.sx + Math.cos(a) * 60 * base.s, top.sy + Math.sin(a) * 40 * base.s - 20 * base.s,
            top.sx + Math.cos(a) * 96 * base.s, top.sy + Math.sin(a) * 62 * base.s + 8 * base.s);
          ctx.strokeStyle = '#2e8b4f'; ctx.lineWidth = 9 * base.s; ctx.stroke();
        }
        break;
      }
      case 'cactus': {
        Props.box3d(P, ctx, { x, y: 0, z: o.z, w: 40, h: o.h, d: 40, top: '#3f8f4d', front: '#357f43', side: '#2a6a37', camX, camY, lw: 1 });
        Props.box3d(P, ctx, { x: x - 40, y: o.h * .45, z: o.z, w: 46, h: 24, d: 24, top: '#3f8f4d', front: '#357f43', side: '#2a6a37', camX, camY, lw: 1 });
        Props.box3d(P, ctx, { x: x - 58, y: o.h * .45, z: o.z, w: 22, h: 70, d: 24, top: '#3f8f4d', front: '#357f43', side: '#2a6a37', camX, camY, lw: 1 });
        break;
      }
      case 'rock': {
        const b = P(x, 0, o.z);
        if (!b) return;
        const r = o.h * .5 * b.s;
        ctx.beginPath();
        for (let k = 0; k < 7; k++) {
          const a = k / 7 * Math.PI * 2;
          const rr = r * (.7 + ((k * 37 + o.seed) % 10) / 22);
          ctx[k ? 'lineTo' : 'moveTo'](b.sx + Math.cos(a) * rr, b.sy + Math.sin(a) * rr * .6 - r * .3);
        }
        ctx.closePath(); U.ink(ctx, B.id === 'snow' ? '#c9d7e2' : '#9c7a53', 1.5, 'rgba(0,0,0,.35)');
        break;
      }
      case 'mesa': {
        Props.box3d(P, ctx, { x: x + side * 260, y: 0, z: o.z, w: 520, h: o.h * 2.2, d: 420, top: '#c98a52', front: '#b0713f', side: '#8f5a30', camX, camY, lw: 1 });
        break;
      }
      case 'pipe': {
        const a = P(x, 210, o.z - 400), b = P(x, 210, o.z + 400);
        if (!a || !b) return;
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy);
        ctx.strokeStyle = '#5b636f'; ctx.lineWidth = Math.max(2, 30 * b.s); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = Math.max(1, 9 * b.s); ctx.stroke();
        break;
      }
      case 'grate': {
        Props.box3d(P, ctx, { x, y: 6, z: o.z, w: 120, h: 6, d: 120, top: '#4c545f', front: '#3d444d', side: '#333940', camX, camY, lw: 1 });
        break;
      }
    }
  }

  /* ---------------------------------------------------------
     WEATHER (screen-space particles)
     --------------------------------------------------------- */
  const wp = [];
  for (let i = 0; i < 220; i++) wp.push({ x: Math.random(), y: Math.random(), v: .4 + Math.random(), s: Math.random() });

  function drawWeather(ctx, kind, t, W, H, speedK) {
    if (!kind) return;
    ctx.save();
    wp.forEach((p, i) => {
      switch (kind) {
        case 'rain': {
          const y = (p.y + t * (1.4 + p.v) * (0.6 + speedK)) % 1;
          const len = 18 + p.v * 26 + speedK * 26;
          ctx.strokeStyle = `rgba(180,220,255,${.2 + p.s * .35})`;
          ctx.lineWidth = 1 + p.s;
          ctx.beginPath();
          ctx.moveTo(p.x * W, y * H); ctx.lineTo(p.x * W - 6, y * H + len); ctx.stroke();
          break;
        }
        case 'snow': {
          const y = (p.y + t * (.12 + p.v * .12)) % 1;
          const x = (p.x + Math.sin(t * .8 + i) * .012) % 1;
          ctx.fillStyle = `rgba(255,255,255,${.35 + p.s * .55})`;
          ctx.beginPath(); ctx.arc(x * W, y * H, 1.2 + p.s * 2.6, 0, 7); ctx.fill();
          break;
        }
        case 'dust': {
          const x = (p.x - t * (.3 + p.v * .5)) % 1;
          const y = (p.y * .7 + .3 + Math.sin(t + i) * .01) % 1;
          ctx.fillStyle = `rgba(226,196,140,${.1 + p.s * .22})`;
          ctx.fillRect(((x + 1) % 1) * W, y * H, 26 + p.v * 40, 2);
          break;
        }
        case 'spark': {
          if (i % 3) break;
          const y = (p.y - t * (.6 + p.v)) % 1;
          ctx.fillStyle = `rgba(255,${180 + p.s * 60 | 0},90,${.25 + p.s * .5})`;
          ctx.fillRect(p.x * W, ((y + 1) % 1) * H, 2.5, 2.5 + p.v * 3);
          break;
        }
      }
    });
    ctx.restore();
  }

  /* speed lines that kick in at high velocity */
  function drawSpeedLines(ctx, W, H, k, t) {
    if (k <= 0) return;
    ctx.save();
    ctx.globalAlpha = U.clamp(k, 0, 1) * .5;
    ctx.strokeStyle = '#ffffff';
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + Math.sin(t * 2 + i) * .05;
      const r0 = 210 + (i % 4) * 30, r1 = r0 + 120 + k * 180;
      ctx.lineWidth = 1 + (i % 3);
      ctx.beginPath();
      ctx.moveTo(W / 2 + Math.cos(a) * r0, H / 2 + Math.sin(a) * r0 * .8);
      ctx.lineTo(W / 2 + Math.cos(a) * r1, H / 2 + Math.sin(a) * r1 * .8);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* vignette + colour grade */
  function drawVignette(ctx, W, H, amt = .55) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .34, W / 2, H / 2, Math.max(W, H) * .78);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${amt})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  return { LANE_W, LANES, BIOMES, drawSky, drawBackdrop, drawGround, drawFog, drawScenery, drawWeather, drawSpeedLines, drawVignette };
})();
