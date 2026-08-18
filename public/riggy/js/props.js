/* ============================================================
   props.js — every object on (and beside) the track, drawn as
   projected 3D boxes / billboards. Nothing here knows about game
   rules; it just paints what world.js and game.js ask for.

   The projector `P(x, y, z)` returns {sx, sy, s} in screen space
   (y is UP in world space, ground = 0).
   ============================================================ */
'use strict';

const Props = (() => {

  /* ---------- generic projected box ---------- */
  function box3d(P, ctx, o) {
    const { x, y, z, w, h, d } = o;
    const top = o.top || '#8899aa', front = o.front || '#667788', side = o.side || '#556677';
    const line = o.line || 'rgba(0,0,0,.45)';
    const hw = w / 2;
    const zN = z - d / 2, zF = z + d / 2;   // near / far
    const yB = y, yT = y + h;

    const c = {
      nbl: P(x - hw, yB, zN), nbr: P(x + hw, yB, zN), ntl: P(x - hw, yT, zN), ntr: P(x + hw, yT, zN),
      fbl: P(x - hw, yB, zF), fbr: P(x + hw, yB, zF), ftl: P(x - hw, yT, zF), ftr: P(x + hw, yT, zF)
    };
    for (const k in c) if (!c[k]) return null;

    const quad = (a, b, cc, dd, fill, alpha = 1) => {
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.lineTo(cc.sx, cc.sy); ctx.lineTo(dd.sx, dd.sy);
      ctx.closePath();
      ctx.globalAlpha *= alpha; ctx.fillStyle = fill; ctx.fill();
      ctx.globalAlpha /= alpha;
      if (o.outline !== false) { ctx.strokeStyle = line; ctx.lineWidth = o.lw || 1.6; ctx.stroke(); }
    };

    // far face (usually hidden, painted for silhouette safety)
    quad(c.fbl, c.fbr, c.ftr, c.ftl, U.shade(front, -.35));
    // visible side wall
    if (o.camX > x + hw) quad(c.nbr, c.fbr, c.ftr, c.ntr, side);
    else if (o.camX < x - hw) quad(c.nbl, c.fbl, c.ftl, c.ntl, side);
    // top
    if (o.camY > yT) quad(c.ntl, c.ntr, c.ftr, c.ftl, top);
    else quad(c.nbl, c.nbr, c.fbr, c.fbl, U.shade(front, -.5)); // underside
    // near face
    quad(c.nbl, c.nbr, c.ntr, c.ntl, front);

    return c;
  }

  /* ---------- OBSTACLES ---------- */

  // low red/white barricade — jump it
  function barrier(P, ctx, o, camX, camY) {
    const c = box3d(P, ctx, {
      x: o.x, y: 0, z: o.z, w: 118, h: 58, d: 22,
      top: '#e8ecf2', front: '#f2f4f8', side: '#c3cad4',
      camX, camY, line: 'rgba(0,0,0,.5)'
    });
    if (!c) return;
    // hazard stripes on the near face
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(c.nbl.sx, c.nbl.sy); ctx.lineTo(c.nbr.sx, c.nbr.sy);
    ctx.lineTo(c.ntr.sx, c.ntr.sy); ctx.lineTo(c.ntl.sx, c.ntl.sy); ctx.closePath();
    ctx.clip();
    const w = c.nbr.sx - c.nbl.sx, hgt = c.nbl.sy - c.ntl.sy;
    ctx.fillStyle = o.contrast ? '#ff2d2d' : '#e5262b';
    for (let i = -2; i < 8; i++) {
      ctx.save();
      ctx.translate(c.ntl.sx + (i * w) / 5, c.ntl.sy);
      ctx.transform(1, 0, -0.45, 1, 0, 0);
      ctx.fillRect(0, 0, w / 10, hgt);
      ctx.restore();
    }
    ctx.restore();
    // legs
    const legs = [P(o.x - 46, 0, o.z), P(o.x + 46, 0, o.z)];
    legs.forEach(l => { if (l) { ctx.fillStyle = '#5b6470'; ctx.fillRect(l.sx - 3 * l.s * 4, l.sy - 1, 24 * l.s, 6 * l.s); } });
  }

  // hanging sign / beam — roll under it
  function beam(P, ctx, o, camX, camY) {
    box3d(P, ctx, {
      x: o.x, y: 78, z: o.z, w: 132, h: 76, d: 20,
      top: '#3a4657', front: o.contrast ? '#ffdd00' : '#ffb020', side: '#c07f0f',
      camX, camY
    });
    // support posts
    [-1, 1].forEach(sd => box3d(P, ctx, {
      x: o.x + sd * 64, y: 0, z: o.z, w: 12, h: 158, d: 12,
      top: '#8d97a5', front: '#6f7885', side: '#59616d', camX, camY
    }));
    const c = P(o.x, 116, o.z);
    if (c) U.text(ctx, 'DUCK', c.sx, c.sy, { size: Math.max(8, 30 * c.s), color: '#2a1a00', outline: '#fff', lw: 3 });
  }

  // rolling dumpster / crate stack — dodge or jump
  function crates(P, ctx, o, camX, camY) {
    box3d(P, ctx, {
      x: o.x, y: 0, z: o.z, w: 112, h: 96, d: 96,
      top: '#c98a45', front: '#a86f34', side: '#8a5a29', camX, camY
    });
    const c = P(o.x, 50, o.z - 48);
    if (c) {
      ctx.save();
      ctx.strokeStyle = 'rgba(70,40,10,.6)'; ctx.lineWidth = Math.max(1, 4 * c.s);
      ctx.beginPath();
      ctx.moveTo(c.sx - 52 * c.s, c.sy - 40 * c.s); ctx.lineTo(c.sx + 52 * c.s, c.sy + 40 * c.s);
      ctx.moveTo(c.sx + 52 * c.s, c.sy - 40 * c.s); ctx.lineTo(c.sx - 52 * c.s, c.sy + 40 * c.s);
      ctx.stroke(); ctx.restore();
    }
  }

  // cone cluster — clip it and you stumble, not die
  function cones(P, ctx, o, camX, camY) {
    [-30, 0, 30].forEach((dx, i) => {
      const b = P(o.x + dx, 0, o.z + (i - 1) * 12), tp = P(o.x + dx, 52, o.z + (i - 1) * 12);
      if (!b || !tp) return;
      const w = 26 * b.s;
      ctx.beginPath();
      ctx.moveTo(tp.sx, tp.sy); ctx.lineTo(b.sx + w, b.sy); ctx.lineTo(b.sx - w, b.sy); ctx.closePath();
      U.ink(ctx, '#ff6a00', 1.6, 'rgba(0,0,0,.5)');
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.fillRect(b.sx - w * .62, b.sy - 22 * b.s, w * 1.24, 7 * b.s);
      ctx.fillStyle = 'rgba(40,40,40,.75)';
      ctx.fillRect(b.sx - w * 1.15, b.sy - 3 * b.s, w * 2.3, 5 * b.s);
    });
  }

  // train carriage — long, deadly, rideable on top
  function train(P, ctx, o, camX, camY) {
    const pal = o.pal || { top: '#e9eef5', front: '#cfd8e4', side: '#b3bfd0', stripe: '#e5262b' };
    const c = box3d(P, ctx, {
      x: o.x, y: 0, z: o.z, w: 128, h: 132, d: o.d,
      top: pal.top, front: pal.front, side: pal.side, camX, camY, lw: 2
    });
    if (!c) return;

    // side stripe + windows along the visible wall
    const sideSign = camX > o.x ? 1 : -1;
    const zN = o.z - o.d / 2, zF = o.z + o.d / 2;
    ctx.save();
    for (let k = 0; k < 6; k++) {
      const t0 = k / 6 + .03, t1 = (k + 1) / 6 - .03;
      const z0 = U.lerp(zN, zF, t0), z1 = U.lerp(zN, zF, t1);
      const a = P(o.x + sideSign * 64, 96, z0), b = P(o.x + sideSign * 64, 96, z1);
      const a2 = P(o.x + sideSign * 64, 56, z0), b2 = P(o.x + sideSign * 64, 56, z1);
      if (!a || !b || !a2 || !b2) continue;
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.lineTo(b2.sx, b2.sy); ctx.lineTo(a2.sx, a2.sy);
      ctx.closePath();
      ctx.fillStyle = 'rgba(30,60,90,.75)'; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1.4; ctx.stroke();
    }
    ctx.restore();

    // front face detail (windshield + light + stripe)
    const fw = c.nbr.sx - c.nbl.sx, fh = c.nbl.sy - c.ntl.sy;
    if (fw > 6) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(c.nbl.sx, c.nbl.sy); ctx.lineTo(c.nbr.sx, c.nbr.sy);
      ctx.lineTo(c.ntr.sx, c.ntr.sy); ctx.lineTo(c.ntl.sx, c.ntl.sy); ctx.closePath(); ctx.clip();
      // windshield
      ctx.fillStyle = 'rgba(24,48,74,.85)';
      ctx.fillRect(c.ntl.sx + fw * .12, c.ntl.sy + fh * .12, fw * .76, fh * .34);
      // stripe
      ctx.fillStyle = pal.stripe;
      ctx.fillRect(c.ntl.sx, c.ntl.sy + fh * .58, fw, fh * .12);
      // headlights
      ctx.fillStyle = '#fff6c9';
      ctx.beginPath(); ctx.arc(c.ntl.sx + fw * .2, c.ntl.sy + fh * .82, fw * .07, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(c.ntl.sx + fw * .8, c.ntl.sy + fh * .82, fw * .07, 0, 7); ctx.fill();
      ctx.restore();
    }

    // roof ribs so rooftop running reads clearly
    for (let k = 0; k <= 8; k++) {
      const zz = U.lerp(zN, zF, k / 8);
      const a = P(o.x - 64, 132, zz), b = P(o.x + 64, 132, zz);
      if (!a || !b) continue;
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy);
      ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1.4; ctx.stroke();
    }
    if (o.moving) {
      const t = P(o.x, 150, o.z - o.d / 2);
      if (t && t.s > .25) U.text(ctx, '!', t.sx, t.sy - 20, { size: 34 * t.s, color: '#ffd23f', outline: '#7a4a00', lw: 5 });
    }
  }

  // ramp — launches you up on to the roofs
  function ramp(P, ctx, o, camX, camY) {
    const zN = o.z - 70, zF = o.z + 70;
    const pts = [P(o.x - 62, 0, zN), P(o.x + 62, 0, zN), P(o.x + 62, 86, zF), P(o.x - 62, 86, zF)];
    if (pts.some(p => !p)) return;
    ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy));
    ctx.closePath();
    const g = ctx.createLinearGradient(pts[0].sx, pts[0].sy, pts[2].sx, pts[2].sy);
    g.addColorStop(0, '#ffd23f'); g.addColorStop(1, '#ff8a00');
    U.ink(ctx, g, 2, 'rgba(0,0,0,.5)');
    // chevrons
    for (let k = 1; k <= 3; k++) {
      const t = k / 4;
      const a = P(o.x - 40, 86 * t, U.lerp(zN, zF, t)), b = P(o.x, 86 * t + 6, U.lerp(zN, zF, t) + 10), cc = P(o.x + 40, 86 * t, U.lerp(zN, zF, t));
      if (!a || !b || !cc) continue;
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.lineTo(cc.sx, cc.sy);
      ctx.strokeStyle = 'rgba(60,30,0,.7)'; ctx.lineWidth = Math.max(1.5, 6 * (a.s)); ctx.stroke();
    }
  }

  // tunnel arch / gantry — pure decoration but sells the speed
  function gantry(P, ctx, o, camX, camY) {
    [-1, 1].forEach(sd => box3d(P, ctx, {
      x: sd * 300, y: 0, z: o.z, w: 26, h: 300, d: 26,
      top: '#6d7684', front: '#59616d', side: '#454c56', camX, camY
    }));
    box3d(P, ctx, {
      x: 0, y: 300, z: o.z, w: 640, h: 34, d: 22,
      top: '#8d97a5', front: '#6d7684', side: '#59616d', camX, camY
    });
    const c = P(0, 316, o.z);
    if (c && c.s > .2) {
      const sz = Math.min(40 * c.s, 64);
      U.text(ctx, o.label || 'DANNO CAL', c.sx, c.sy, { size: sz, color: '#ffd23f', outline: '#3a2400', lw: sz * .12 + 1 });
    }
  }

  /* ---------- PICKUPS ---------- */
  function coin(P, ctx, o, t) {
    const p = P(o.x, o.y, o.z);
    if (!p || p.s < .05) return;
    const r = 18 * p.s;
    const spin = Math.cos(t * 7 + o.phase);
    ctx.save();
    ctx.translate(p.sx, p.sy);
    // glow
    const g = ctx.createRadialGradient(0, 0, r * .2, 0, 0, r * 2.4);
    g.addColorStop(0, 'rgba(255,206,60,.55)'); g.addColorStop(1, 'rgba(255,206,60,0)');
    ctx.fillStyle = g; ctx.fillRect(-r * 2.4, -r * 2.4, r * 4.8, r * 4.8);

    ctx.scale(Math.max(.18, Math.abs(spin)), 1);
    U.ellipse(ctx, 0, 0, r, r);
    const gg = ctx.createLinearGradient(-r, -r, r, r);
    gg.addColorStop(0, '#fff3bd'); gg.addColorStop(.45, '#ffc21c'); gg.addColorStop(1, '#c98505');
    U.ink(ctx, gg, Math.max(1, r * .16), '#8d5b02');
    if (r > 7) {
      U.ellipse(ctx, 0, 0, r * .6, r * .6);
      ctx.strokeStyle = 'rgba(141,91,2,.55)'; ctx.lineWidth = r * .1; ctx.stroke();
      U.text(ctx, 'R', 0, r * .06, { size: r * .95, color: '#a86c05', outline: 'rgba(255,255,255,.6)', lw: r * .1 });
    }
    ctx.restore();
  }

  const PU_STYLE = {
    magnet: { c1: '#ff6b6b', c2: '#c31f1f', glyph: 'U' },
    jetpack: { c1: '#ffb04d', c2: '#e06d00', glyph: 'J' },
    x2: { c1: '#ffe066', c2: '#e0a400', glyph: '2' },
    sneakers: { c1: '#6bf39a', c2: '#17913f', glyph: 'S' },
    shield: { c1: '#7fe9ff', c2: '#1698c4', glyph: 'O' },
    hoverboard: { c1: '#ff8ec4', c2: '#c2185b', glyph: 'H' }
  };

  function powerup(P, ctx, o, t) {
    const p = P(o.x, o.y + Math.sin(t * 3 + o.phase) * 8, o.z);
    if (!p || p.s < .05) return;
    const r = 34 * p.s;
    const st = PU_STYLE[o.kind] || PU_STYLE.x2;
    ctx.save();
    ctx.translate(p.sx, p.sy);
    const g = ctx.createRadialGradient(0, 0, r * .2, 0, 0, r * 2.6);
    g.addColorStop(0, U.rgba(st.c1, .5)); g.addColorStop(1, U.rgba(st.c1, 0));
    ctx.fillStyle = g; ctx.fillRect(-r * 2.6, -r * 2.6, r * 5.2, r * 5.2);
    ctx.rotate(Math.sin(t * 2 + o.phase) * .25);
    // bubble
    U.ellipse(ctx, 0, 0, r, r);
    const bg = ctx.createLinearGradient(-r, -r, r, r);
    bg.addColorStop(0, U.shade(st.c1, .35)); bg.addColorStop(1, st.c2);
    U.ink(ctx, bg, Math.max(1.5, r * .14), 'rgba(20,20,30,.8)');
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    U.ellipse(ctx, -r * .3, -r * .38, r * .3, r * .18, -.6); ctx.fill();
    if (r > 9) {
      // little icon
      ctx.save(); ctx.scale(r / 34, r / 34);
      ctx.lineWidth = 4; ctx.strokeStyle = '#22232b'; ctx.fillStyle = '#22232b';
      switch (o.kind) {
        case 'magnet':
          ctx.beginPath(); ctx.arc(0, 2, 13, Math.PI, 0); ctx.lineWidth = 9; ctx.strokeStyle = '#f2f2f2'; ctx.stroke();
          ctx.lineWidth = 9; ctx.strokeStyle = '#e02b2b';
          ctx.beginPath(); ctx.moveTo(-13, 2); ctx.lineTo(-13, 12); ctx.moveTo(13, 2); ctx.lineTo(13, 12); ctx.stroke();
          break;
        case 'jetpack':
          U.roundRect(ctx, -12, -14, 10, 24, 4); U.ink(ctx, '#eef3f8', 3, '#22232b');
          U.roundRect(ctx, 2, -14, 10, 24, 4); U.ink(ctx, '#eef3f8', 3, '#22232b');
          U.poly(ctx, [[-10, 10], [-4, 22], [2, 10]]); U.ink(ctx, '#ffd23f', 2, '#c15b00');
          break;
        case 'x2': U.text(ctx, 'x2', 0, 1, { size: 30, color: '#3a2400', outline: '#fff6d0', lw: 5 }); break;
        case 'sneakers':
          U.poly(ctx, [[-16, 6], [2, 6], [14, 0], [18, 8], [-16, 12]]); U.ink(ctx, '#fff', 3, '#22232b');
          U.poly(ctx, [[-16, -8], [-2, -8], [6, -2], [-16, 0]]); U.ink(ctx, '#3ddc6b', 3, '#22232b');
          break;
        case 'shield':
          U.poly(ctx, [[0, -16], [15, -8], [12, 10], [0, 18], [-12, 10], [-15, -8]]);
          U.ink(ctx, 'rgba(255,255,255,.85)', 3, '#22232b');
          break;
        case 'hoverboard':
          U.roundRect(ctx, -18, -4, 36, 10, 5); U.ink(ctx, '#ff5fa2', 3, '#22232b');
          break;
      }
      ctx.restore();
    }
    ctx.restore();
  }

  /* ---------- HOVERBOARD under the player ---------- */
  function hoverboard(P, ctx, sx, sy, s, t) {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(s, s);
    // thruster glow
    const g = ctx.createRadialGradient(0, 14, 4, 0, 14, 70);
    g.addColorStop(0, 'rgba(120,220,255,.75)'); g.addColorStop(1, 'rgba(120,220,255,0)');
    ctx.fillStyle = g; ctx.fillRect(-80, -20, 160, 90);
    U.roundRect(ctx, -56, -6, 112, 20, 10);
    const bg = ctx.createLinearGradient(-56, 0, 56, 0);
    bg.addColorStop(0, '#ff8ec4'); bg.addColorStop(.5, '#ff2f86'); bg.addColorStop(1, '#a3125b');
    U.ink(ctx, bg, 4, '#10161f');
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.fillRect(-44, -3, 88, 4);
    for (let i = -1; i <= 1; i += 2) {
      U.ellipse(ctx, i * 34, 16 + Math.sin(t * 20 + i) * 2, 12, 6);
      ctx.fillStyle = 'rgba(150,235,255,.8)'; ctx.fill();
    }
    ctx.restore();
  }

  /* ---------- JETPACK on the player's back ---------- */
  function jetpack(ctx, sx, sy, s, t) {
    ctx.save();
    ctx.translate(sx, sy); ctx.scale(s, s);
    U.roundRect(ctx, -30, -60, 22, 56, 8); U.ink(ctx, '#e6ecf3', 4, '#10161f');
    U.roundRect(ctx, 8, -60, 22, 56, 8); U.ink(ctx, '#e6ecf3', 4, '#10161f');
    for (let i = -1; i <= 1; i += 2) {
      const fl = 26 + Math.sin(t * 30 + i * 2) * 12;
      U.poly(ctx, [[i * 19 - 9, -4], [i * 19, fl], [i * 19 + 9, -4]]);
      U.ink(ctx, '#ffb638', 0);
      U.poly(ctx, [[i * 19 - 5, -4], [i * 19, fl * .62], [i * 19 + 5, -4]]);
      U.ink(ctx, '#fff3bd', 0);
    }
    ctx.restore();
  }

  /* ---------- SHIELD bubble ---------- */
  function shieldBubble(ctx, sx, sy, r, t) {
    ctx.save();
    ctx.translate(sx, sy);
    const g = ctx.createRadialGradient(0, 0, r * .5, 0, 0, r);
    g.addColorStop(0, 'rgba(120,230,255,0)');
    g.addColorStop(.75, 'rgba(120,230,255,.18)');
    g.addColorStop(1, 'rgba(160,240,255,.55)');
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = `rgba(190,245,255,${.5 + Math.sin(t * 8) * .2})`;
    ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  }

  return { box3d, barrier, beam, crates, cones, train, ramp, gantry, coin, powerup, hoverboard, jetpack, shieldBubble, PU_STYLE };
})();
