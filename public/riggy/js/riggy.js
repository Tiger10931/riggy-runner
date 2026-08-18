/* ============================================================
   riggy.js — the mascot, drawn 100% in code.

   Riggy is a round-headed blue cartoon critter with two tall
   rabbit-ish ears, big white eyes, thin arms with white gloves,
   red shorts and a long kinked tail (see reference art).

   drawRiggy(ctx, opts) draws him with his feet at (x, y),
   `scale` = 1 means roughly 200px tall.

   Everything is parametric so the same rig animates for
   run / jump / fall / roll / hover / jetpack / stumble / crash
   and the menu idle + cheer poses.
   ============================================================ */
'use strict';

const Riggy = (() => {

  /* ---------------------------------------------------------
     SKINS — each unlockable character is a palette + accessories
     --------------------------------------------------------- */
  const SKINS = {
    classic: {
      name: 'Classic Riggy',
      body: '#1b74d1', bodyLo: '#0f4c8f', bodyHi: '#63b3f7',
      shorts: '#e5262b', shortsLo: '#9c1114',
      glove: '#ffffff', shoe: '#ffffff', shoeLo: '#d7dde6',
      eye: '#ffffff', pupil: '#10161f', outline: '#10161f',
      accessories: []
    },
    neon: {
      name: 'Neon Riggy',
      body: '#16e0c8', bodyLo: '#0a8d7d', bodyHi: '#9dfff2',
      shorts: '#ff2ea6', shortsLo: '#a3126a',
      glove: '#eafffb', shoe: '#eafffb', shoeLo: '#a9d8d1',
      eye: '#ffffff', pupil: '#0a2530', outline: '#062028',
      glow: '#16e0c8',
      accessories: ['shades']
    },
    retro: {
      name: 'Retro Riggy',
      body: '#8b6bd8', bodyLo: '#513a8c', bodyHi: '#c3b0ff',
      shorts: '#ffb020', shortsLo: '#a86c05',
      glove: '#fff6df', shoe: '#fff6df', shoeLo: '#d3c6a9',
      eye: '#ffffff', pupil: '#1a1030', outline: '#160f2b',
      accessories: ['headphones']
    },
    golden: {
      name: 'Golden Riggy',
      body: '#ffc21c', bodyLo: '#b57f00', bodyHi: '#fff0b0',
      shorts: '#2a2a2a', shortsLo: '#111111',
      glove: '#fffdf2', shoe: '#fffdf2', shoeLo: '#ddd6bd',
      eye: '#ffffff', pupil: '#2b1d00', outline: '#4a3200',
      glow: '#ffc21c', sparkle: true,
      accessories: ['crown']
    },
    coach: {
      name: 'Coach Riggy',
      body: '#1b74d1', bodyLo: '#0f4c8f', bodyHi: '#63b3f7',
      shorts: '#1c2c4c', shortsLo: '#0b1526',
      glove: '#ffffff', shoe: '#ff5a3c', shoeLo: '#b83a24',
      eye: '#ffffff', pupil: '#10161f', outline: '#10161f',
      accessories: ['cap', 'whistle']
    },
    shadow: {
      name: 'Shadow Riggy',
      body: '#2b3140', bodyLo: '#171b24', bodyHi: '#556074',
      shorts: '#6b21f5', shortsLo: '#3d0da3',
      glove: '#c8ccd6', shoe: '#c8ccd6', shoeLo: '#8b909b',
      eye: '#ff4d6d', pupil: '#2a0008', outline: '#0a0c11',
      glow: '#6b21f5',
      accessories: ['cape']
    },
    frost: {
      name: 'Frost Riggy',
      body: '#a8e6ff', bodyLo: '#5da8cc', bodyHi: '#e7fbff',
      shorts: '#2f6fd0', shortsLo: '#164a97',
      glove: '#ffffff', shoe: '#ffffff', shoeLo: '#cfe6ef',
      eye: '#ffffff', pupil: '#123048', outline: '#1d3f55',
      glow: '#bdf0ff', frosty: true,
      accessories: ['scarf']
    },
    inferno: {
      name: 'Inferno Riggy',
      body: '#ff5a1f', bodyLo: '#a82c02', bodyHi: '#ffb26b',
      shorts: '#22252b', shortsLo: '#0d0f13',
      glove: '#ffe9c9', shoe: '#ffe9c9', shoeLo: '#d0b190',
      eye: '#fff3c2', pupil: '#3a1200', outline: '#4a1a00',
      glow: '#ff7a2f', flames: true,
      accessories: ['goggles']
    }
  };

  /* ---------------------------------------------------------
     POSE SOLVER — turns (state, phase) into joint positions
     Local space: feet at (0,0), up is -y, ~200 units tall.
     --------------------------------------------------------- */
  function solve(state, t, phase, extra = {}) {
    const p = phase;                                   // 0..2PI run cycle
    const s = Math.sin(p), c = Math.cos(p);
    const j = {
      root: { x: 0, y: -0 },        // pelvis offset
      lean: 0,                      // whole-body lean (radians)
      squash: 1, stretch: 1,
      head: { x: 0, y: -150, r: 42, tilt: 0, turn: extra.turn || 0 },
      ear: { l: -0.16, r: 0.16, flop: 0 },
      torso: { x: 0, y: -108 },
      hipL: { x: -12, y: -46 }, hipR: { x: 12, y: -46 },
      kneeL: { x: -14, y: -26 }, kneeR: { x: 14, y: -26 },
      footL: { x: -14, y: -4 }, footR: { x: 14, y: -4 },
      shL: { x: -20, y: -104 }, shR: { x: 20, y: -104 },
      elbL: { x: -32, y: -84 }, elbR: { x: 32, y: -84 },
      handL: { x: -30, y: -62 }, handR: { x: 30, y: -62 },
      tail: 0, tailWag: 0,
      blink: 0, mouth: 'smile', browAngry: 0,
      rot: 0, alphaGhost: 1
    };

    switch (state) {

      case 'run': {
        const bob = Math.abs(Math.sin(p)) * 6;
        j.root.y = -bob;
        j.head.y = -150 - bob * .5 + Math.sin(p * 2) * 1.5;
        j.head.tilt = s * .05;
        j.lean = 0.10 + Math.abs(s) * 0.02;
        j.ear.flop = -s * .30;
        j.ear.l = -0.16 - s * .07; j.ear.r = 0.16 - s * .07;

        // legs — big loping stride
        const strideF = 30, lift = 26;
        j.footL.x = -13 + s * strideF;
        j.footL.y = -4 - Math.max(0, s) * lift;
        j.kneeL.x = -14 + s * strideF * .55;
        j.kneeL.y = -26 - Math.max(0, s) * lift * .55 - Math.max(0, -s) * 6;

        j.footR.x = 13 - s * strideF;
        j.footR.y = -4 - Math.max(0, -s) * lift;
        j.kneeR.x = 14 - s * strideF * .55;
        j.kneeR.y = -26 - Math.max(0, -s) * lift * .55 - Math.max(0, s) * 6;

        // arms — counter swing
        j.handL.x = -26 - s * 8; j.handL.y = -66 - s * 26;
        j.elbL.x = -32 - s * 4; j.elbL.y = -86 - s * 10;
        j.handR.x = 26 + s * 8; j.handR.y = -66 + s * 26;
        j.elbR.x = 32 + s * 4; j.elbR.y = -86 + s * 10;

        j.tail = -0.5 + Math.sin(p * .5 + 1) * .25;
        j.tailWag = Math.sin(p + .6) * .35;
        j.mouth = 'determined';
        break;
      }

      case 'jump': {
        const up = U.clamp(extra.vy / 900, -1, 1);     // +1 rising
        j.lean = 0.06 - up * .06;
        j.head.y = -152; j.head.tilt = -up * .06;
        j.ear.flop = -0.55 - up * .35;
        j.ear.l = -0.30; j.ear.r = 0.30;
        j.stretch = 1 + up * .06;
        // tuck legs when rising, reach down when falling
        const tuck = U.clamp(up, 0, 1);
        j.kneeL = { x: -18, y: -34 - tuck * 8 };
        j.kneeR = { x: 18, y: -34 - tuck * 8 };
        j.footL = { x: -22 - tuck * 6, y: -18 - tuck * 20 };
        j.footR = { x: 22 + tuck * 6, y: -14 - tuck * 26 };
        // arms up in a whoop
        j.elbL = { x: -40, y: -110 }; j.handL = { x: -46, y: -140 - tuck * 10 };
        j.elbR = { x: 40, y: -110 }; j.handR = { x: 46, y: -140 - tuck * 10 };
        j.tail = -1.15; j.tailWag = Math.sin(t * 12) * .2;
        j.mouth = up > 0 ? 'open' : 'oh';
        break;
      }

      case 'roll': {
        j.rot = extra.rollT * Math.PI * 2.2;
        j.root.y = -22; j.squash = .82;
        j.head.y = -78; j.head.r = 42; j.head.tilt = .2;
        j.ear.flop = -1.15; j.ear.l = -.5; j.ear.r = .55;
        j.torso.y = -60;
        j.hipL = { x: -12, y: -40 }; j.hipR = { x: 12, y: -40 };
        j.kneeL = { x: -26, y: -58 }; j.kneeR = { x: 26, y: -56 };
        j.footL = { x: -8, y: -74 }; j.footR = { x: 10, y: -76 };
        j.shL = { x: -18, y: -62 }; j.shR = { x: 18, y: -62 };
        j.elbL = { x: -34, y: -46 }; j.handL = { x: -16, y: -34 };
        j.elbR = { x: 34, y: -46 }; j.handR = { x: 16, y: -34 };
        j.tail = -1.7;
        j.mouth = 'grit';
        break;
      }

      case 'hover': {
        const wob = Math.sin(t * 6) * 3;
        j.root.y = -6 + wob;
        j.lean = 0.16;
        j.head.y = -150 + wob * .5; j.head.tilt = .06;
        j.ear.flop = -0.7 + Math.sin(t * 5) * .12;
        j.kneeL = { x: -22, y: -30 }; j.kneeR = { x: 20, y: -30 };
        j.footL = { x: -34, y: -8 }; j.footR = { x: 26, y: -8 };
        j.elbL = { x: -42, y: -96 }; j.handL = { x: -56, y: -104 + wob };
        j.elbR = { x: 40, y: -96 }; j.handR = { x: 54, y: -92 - wob };
        j.tail = -0.9 + Math.sin(t * 4) * .2;
        j.mouth = 'smile';
        break;
      }

      case 'jet': {
        const wob = Math.sin(t * 9) * 2.5;
        j.lean = -0.14; j.root.y = wob;
        j.head.y = -150; j.head.tilt = -.08;
        j.ear.flop = -1.0 + Math.sin(t * 8) * .18;
        j.kneeL = { x: -16, y: -28 }; j.kneeR = { x: 16, y: -28 };
        j.footL = { x: -18, y: -2 + Math.sin(t * 7) * 3 };
        j.footR = { x: 18, y: -2 + Math.sin(t * 7 + 1.6) * 3 };
        j.elbL = { x: -44, y: -92 }; j.handL = { x: -58, y: -74 };
        j.elbR = { x: 44, y: -92 }; j.handR = { x: 58, y: -74 };
        j.tail = -0.4 + Math.sin(t * 6) * .25;
        j.mouth = 'open';
        break;
      }

      case 'stumble': {
        const f = Math.sin(t * 26);
        j.lean = 0.34; j.root.y = -3;
        j.head.y = -146; j.head.tilt = .18 + f * .08;
        j.ear.flop = -.2 + f * .5;
        j.kneeL = { x: -24, y: -30 }; j.kneeR = { x: 20, y: -24 };
        j.footL = { x: -34, y: -6 }; j.footR = { x: 26, y: -2 };
        j.elbL = { x: -44, y: -118 }; j.handL = { x: -52, y: -146 + f * 10 };
        j.elbR = { x: 44, y: -116 }; j.handR = { x: 54, y: -142 - f * 10 };
        j.tail = -1.4; j.tailWag = f * .5;
        j.mouth = 'oh'; j.browAngry = 1;
        break;
      }

      case 'crash': {
        const k = U.clamp(extra.crashT || 0, 0, 1);
        j.rot = -k * 1.9;
        j.root.y = -k * 12;
        j.lean = 0.2;
        j.head.y = -150 + k * 20; j.head.tilt = .4 * k;
        j.ear.flop = -1.4 * k;
        j.kneeL = { x: -30, y: -40 }; j.kneeR = { x: 26, y: -34 };
        j.footL = { x: -50 - k * 16, y: -40 - k * 22 };
        j.footR = { x: 44 + k * 12, y: -26 - k * 18 };
        j.elbL = { x: -48, y: -110 }; j.handL = { x: -66 - k * 12, y: -132 };
        j.elbR = { x: 48, y: -104 }; j.handR = { x: 66 + k * 12, y: -126 };
        j.tail = -1.9; j.mouth = 'x'; j.blink = 1; j.browAngry = 1;
        break;
      }

      case 'cheer': {
        const b = Math.sin(t * 3);
        j.root.y = -Math.abs(Math.sin(t * 3)) * 6;
        j.head.y = -152 + b * 2; j.head.tilt = b * .05;
        j.ear.flop = -0.12 + b * .16;
        j.elbL = { x: -40, y: -122 }; j.handL = { x: -50, y: -158 + b * 6 };
        j.elbR = { x: 40, y: -122 }; j.handR = { x: 50, y: -158 - b * 6 };
        j.footL = { x: -16, y: -4 }; j.footR = { x: 16, y: -4 };
        j.tail = -0.75 + Math.sin(t * 2.4) * .3;
        j.mouth = 'grin';
        break;
      }

      case 'idle':
      default: {
        const b = Math.sin(t * 2);
        j.root.y = b * 1.6;
        j.head.y = -150 + b * 2.6; j.head.tilt = Math.sin(t * .8) * .04;
        j.ear.flop = Math.sin(t * 1.6) * .1;
        j.elbL = { x: -30, y: -86 }; j.handL = { x: -30, y: -60 + b };
        j.elbR = { x: 30, y: -86 }; j.handR = { x: 30, y: -60 - b };
        j.tail = -0.6 + Math.sin(t * 1.3) * .35;
        j.tailWag = Math.sin(t * 1.3) * .3;
        j.mouth = 'smile';
        break;
      }
    }
    return j;
  }

  /* ---------------------------------------------------------
     PART DRAWING
     --------------------------------------------------------- */

  function limb(ctx, a, b, cP, w, skin, taper = .7) {
    // tapered quadratic limb with the cartoon outline
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = skin.outline; ctx.lineWidth = w + 6;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(cP.x, cP.y, b.x, b.y); ctx.stroke();
    ctx.strokeStyle = skin.body; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(cP.x, cP.y, b.x, b.y); ctx.stroke();
    // core shadow on the far side
    ctx.strokeStyle = U.rgba(skin.bodyLo, .45); ctx.lineWidth = w * .36;
    ctx.beginPath();
    ctx.moveTo(a.x + w * .22, a.y); ctx.quadraticCurveTo(cP.x + w * .24, cP.y, b.x + w * .22, b.y);
    ctx.stroke();
    // inner highlight
    ctx.strokeStyle = U.rgba(skin.bodyHi, .55); ctx.lineWidth = w * .3;
    ctx.beginPath();
    ctx.moveTo(a.x - w * .2, a.y); ctx.quadraticCurveTo(cP.x - w * .22, cP.y, b.x - w * .2, b.y);
    ctx.stroke();
    // joint cap so knees/elbows read round
    U.ellipse(ctx, cP.x, cP.y, w * .34, w * .34);
    ctx.fillStyle = U.rgba(skin.bodyLo, .25); ctx.fill();
    ctx.restore();
  }

  function glove(ctx, p, r, skin, rot = 0) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(rot);
    U.ellipse(ctx, 0, 0, r, r * .92); U.ink(ctx, skin.glove, 4.5, skin.outline);
    // cuff
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, r * .98, Math.PI * .15, Math.PI * .85); ctx.strokeStyle = skin.outline;
    ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
    // knuckle sheen
    U.ellipse(ctx, -r * .28, -r * .3, r * .3, r * .2, -.5);
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fill();
    ctx.restore();
  }

  function shoe(ctx, p, skin, flip = 1, angle = 0) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angle); ctx.scale(flip, 1);
    // chunky cartoon sneaker: rounded heel, sweeping toe
    ctx.beginPath();
    ctx.moveTo(-13, -4);
    ctx.quadraticCurveTo(-13, -13, -3, -12);
    ctx.quadraticCurveTo(9, -12, 15, -5);
    ctx.quadraticCurveTo(20, -1, 19, 3);
    ctx.lineTo(-13, 3);
    ctx.closePath();
    U.ink(ctx, skin.shoe, 4.5, skin.outline);
    // upper shading
    ctx.save(); ctx.clip();
    ctx.fillStyle = U.rgba(skin.shoeLo, .55); ctx.fillRect(-14, -2, 36, 8);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(-12, -12, 10, 6);
    ctx.restore();
    // midsole
    U.roundRect(ctx, -14, 0, 34, 7, 3.5);
    U.ink(ctx, skin.shoeLo, 3, skin.outline);
    // side swoosh
    ctx.beginPath();
    ctx.moveTo(-6, -1); ctx.quadraticCurveTo(4, -8, 14, -5);
    ctx.strokeStyle = U.rgba(skin.outline, .75); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.stroke();
    // laces
    ctx.strokeStyle = skin.outline; ctx.lineWidth = 2;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.moveTo(-6 + i * 5, -11 + i * 1.5); ctx.lineTo(-1 + i * 5, -6 + i * 1.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  function ear(ctx, baseX, baseY, len, w, tilt, flop, skin) {
    ctx.save();
    ctx.translate(baseX, baseY); ctx.rotate(tilt + flop);
    const tipX = Math.sin(flop * .8) * len * .18;
    ctx.beginPath();
    ctx.moveTo(-w / 2, 6);
    ctx.quadraticCurveTo(-w / 2 - 2, -len * .55, tipX - w / 2 + 1, -len);
    ctx.quadraticCurveTo(tipX, -len - w * .62, tipX + w / 2 - 1, -len);
    ctx.quadraticCurveTo(w / 2 + 2, -len * .55, w / 2, 6);
    ctx.closePath();
    U.ink(ctx, skin.body, 5, skin.outline);
    // inner ear shading
    ctx.beginPath();
    ctx.moveTo(-w * .12, 0);
    ctx.quadraticCurveTo(-w * .1, -len * .5, tipX, -len * .78);
    ctx.quadraticCurveTo(w * .22, -len * .5, w * .18, 0);
    ctx.closePath();
    ctx.fillStyle = U.rgba(skin.bodyLo, .55); ctx.fill();
    // rim light down the leading edge
    ctx.beginPath();
    ctx.moveTo(-w * .34, 0);
    ctx.quadraticCurveTo(-w * .42, -len * .55, tipX - w * .22, -len * .88);
    ctx.strokeStyle = U.rgba(skin.bodyHi, .6); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.stroke();
    ctx.restore();
  }

  function tail(ctx, angle, wag, skin, scaleFlip = 1) {
    // long, kinked, tapering tail exactly like the reference doodle
    ctx.save();
    ctx.translate(-4 * scaleFlip, -52);
    ctx.rotate(angle * .35 + wag * .2);
    const pts = [
      [0, 0],
      [-26 * scaleFlip, -6 + wag * 6],
      [-58 * scaleFlip, -14 + wag * 10],
      [-74 * scaleFlip, 10 + wag * 6],
      [-70 * scaleFlip, 42],
      [-58 * scaleFlip, 56 - wag * 4]
    ];
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = skin.outline; ctx.lineWidth = 17;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const xc = (pts[i][0] + pts[i + 1][0]) / 2, yc = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], xc, yc);
    }
    ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    ctx.stroke();
    ctx.strokeStyle = skin.body; ctx.lineWidth = 11; ctx.stroke();
    ctx.strokeStyle = U.rgba(skin.bodyHi, .45); ctx.lineWidth = 3.5; ctx.stroke();
    ctx.restore();
  }

  function shorts(ctx, skin) {
    U.poly(ctx, [[-25, -62], [25, -62], [29, -34], [12, -30], [0, -38], [-12, -30], [-29, -34]]);
    U.ink(ctx, skin.shorts, 5, skin.outline);
    // shading + waistband
    ctx.save(); ctx.clip();
    ctx.fillStyle = U.rgba(skin.shortsLo, .55);
    ctx.fillRect(4, -62, 30, 40);
    ctx.fillStyle = U.rgba('#ffffff', .18);
    ctx.fillRect(-26, -62, 12, 40);
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(-26, -58); ctx.lineTo(26, -58);
    ctx.strokeStyle = U.rgba(skin.outline, .5); ctx.lineWidth = 2.5; ctx.stroke();
  }

  function torso(ctx, j, skin) {
    U.poly(ctx, [
      [-14, -112], [14, -112], [20, -84], [22, -60], [-22, -60], [-20, -84]
    ]);
    U.ink(ctx, skin.body, 5, skin.outline);
    ctx.save(); ctx.clip();
    ctx.fillStyle = U.rgba(skin.bodyLo, .45); ctx.fillRect(6, -114, 24, 60);
    ctx.fillStyle = U.rgba(skin.bodyHi, .4); ctx.fillRect(-18, -114, 8, 60);
    ctx.restore();
  }

  function face(ctx, j, skin, t) {
    const r = j.head.r, turn = j.head.turn;   // turn: -1 (away) .. 1 (at camera)
    const cx = turn * r * .16;

    // head
    U.ellipse(ctx, 0, 0, r, r * .98);
    U.ink(ctx, skin.body, 5.5, skin.outline);

    // cheek shading + rim light
    ctx.save();
    U.ellipse(ctx, 0, 0, r, r * .98); ctx.clip();
    const g = ctx.createRadialGradient(-r * .35, -r * .4, r * .1, 0, 0, r * 1.2);
    g.addColorStop(0, U.rgba(skin.bodyHi, .55));
    g.addColorStop(.55, U.rgba(skin.body, 0));
    g.addColorStop(1, U.rgba(skin.bodyLo, .6));
    ctx.fillStyle = g; ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();

    if (turn < -0.2) {
      // back of head — a couple of scruffy hair lines and that's it
      ctx.strokeStyle = U.rgba(skin.bodyLo, .8); ctx.lineWidth = 3;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.arc(i * 10, -4, r * .55, Math.PI * .15, Math.PI * .55);
        ctx.stroke();
      }
      return;
    }

    const eyeGap = r * .40, eyeY = -r * .10;
    const ex = [cx - eyeGap * (1 - Math.abs(turn) * .28), cx + eyeGap * (1 + Math.abs(turn) * .06)];
    const eyeRX = r * .17, eyeRY = r * .30;

    // brows
    for (let i = 0; i < 2; i++) {
      const dir = i ? 1 : -1;
      ctx.save();
      ctx.translate(ex[i], eyeY - eyeRY - r * .16);
      ctx.rotate(dir * (0.28 + j.browAngry * 0.35));
      ctx.beginPath();
      ctx.moveTo(-r * .18, 0); ctx.quadraticCurveTo(0, -r * .12, r * .18, 0);
      ctx.strokeStyle = skin.outline; ctx.lineWidth = 4.6; ctx.lineCap = 'round'; ctx.stroke();
      ctx.restore();
    }

    // eyes
    for (let i = 0; i < 2; i++) {
      const blinkK = 1 - j.blink;
      if (j.mouth === 'x') {
        // dizzy X eyes on a crash
        ctx.save(); ctx.translate(ex[i], eyeY);
        ctx.strokeStyle = skin.outline; ctx.lineWidth = 4.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-7, -8); ctx.lineTo(7, 8); ctx.moveTo(7, -8); ctx.lineTo(-7, 8); ctx.stroke();
        ctx.restore(); continue;
      }
      U.ellipse(ctx, ex[i], eyeY, eyeRX, Math.max(1.5, eyeRY * blinkK));
      U.ink(ctx, skin.eye, 3.4, skin.outline);
      if (blinkK > .3) {
        // pupil, drifting slightly with the head turn
        const px = ex[i] + turn * eyeRX * .35;
        U.ellipse(ctx, px, eyeY + eyeRY * .12 * blinkK, eyeRX * .52, eyeRY * .5 * blinkK);
        ctx.fillStyle = skin.pupil; ctx.fill();
        U.ellipse(ctx, px - eyeRX * .22, eyeY - eyeRY * .22, eyeRX * .22, eyeRY * .16);
        ctx.fillStyle = '#fff'; ctx.fill();
      }
    }

    // nose dot
    U.ellipse(ctx, cx, eyeY + r * .30, r * .055, r * .045);
    ctx.fillStyle = skin.outline; ctx.fill();

    // mouth
    ctx.save();
    ctx.translate(cx, eyeY + r * .46);
    ctx.strokeStyle = skin.outline; ctx.lineWidth = 4.2; ctx.lineCap = 'round';
    ctx.fillStyle = '#3a1420';
    switch (j.mouth) {
      case 'open':
        U.ellipse(ctx, 0, r * .04, r * .17, r * .15); U.ink(ctx, '#3a1420', 4, skin.outline);
        U.ellipse(ctx, 0, r * .11, r * .1, r * .06); ctx.fillStyle = '#ff6d8a'; ctx.fill();
        break;
      case 'oh':
        U.ellipse(ctx, 0, r * .02, r * .12, r * .16); U.ink(ctx, '#3a1420', 4, skin.outline);
        break;
      case 'grit':
        U.roundRect(ctx, -r * .21, -r * .05, r * .42, r * .16, 3); U.ink(ctx, '#fff', 3.6, skin.outline);
        ctx.beginPath();
        for (let k = -2; k <= 2; k++) { ctx.moveTo(k * r * .085, -r * .05); ctx.lineTo(k * r * .085, r * .11); }
        ctx.lineWidth = 2; ctx.stroke();
        break;
      case 'grin':
        ctx.beginPath(); ctx.arc(0, -r * .04, r * .22, .18 * Math.PI, .82 * Math.PI);
        U.ink(ctx, '#3a1420', 4, skin.outline);
        break;
      case 'x':
        ctx.beginPath(); ctx.moveTo(-r * .13, r * .04); ctx.quadraticCurveTo(0, -r * .1, r * .13, r * .04); ctx.stroke();
        break;
      case 'determined':
        ctx.beginPath(); ctx.moveTo(-r * .17, 0); ctx.quadraticCurveTo(0, r * .1, r * .17, -r * .02); ctx.stroke();
        break;
      default: // smile
        ctx.beginPath(); ctx.arc(0, -r * .06, r * .2, .12 * Math.PI, .88 * Math.PI); ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------------- accessories ---------------- */
  const ACC = {
    cap(ctx, j, skin) {
      const r = j.head.r;
      ctx.save(); ctx.translate(0, -r * .62);
      ctx.beginPath(); ctx.arc(0, 0, r * .92, Math.PI, 0); ctx.closePath();
      U.ink(ctx, '#e5262b', 4.5, '#10161f');
      U.roundRect(ctx, -r * .2, -r * .06, r * 1.5, r * .3, 8);
      U.ink(ctx, '#b81b20', 4, '#10161f');
      U.ellipse(ctx, 0, -r * .9, r * .12, r * .12); U.ink(ctx, '#fff', 3, '#10161f');
      ctx.restore();
    },
    shades(ctx, j, skin) {
      const r = j.head.r;
      ctx.save(); ctx.translate(j.head.turn * r * .16, -r * .1);
      U.roundRect(ctx, -r * .62, -r * .22, r * .52, r * .42, 6); U.ink(ctx, '#10161f', 3, '#000');
      U.roundRect(ctx, r * .1, -r * .22, r * .52, r * .42, 6); U.ink(ctx, '#10161f', 3, '#000');
      ctx.beginPath(); ctx.moveTo(-r * .1, -r * .06); ctx.lineTo(r * .1, -r * .06);
      ctx.strokeStyle = '#10161f'; ctx.lineWidth = 4; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.45)';
      ctx.fillRect(-r * .56, -r * .18, r * .14, r * .1);
      ctx.fillRect(r * .16, -r * .18, r * .14, r * .1);
      ctx.restore();
    },
    goggles(ctx, j, skin) {
      const r = j.head.r;
      ctx.save(); ctx.translate(0, -r * .72);
      U.roundRect(ctx, -r * .95, -r * .16, r * 1.9, r * .34, 10); U.ink(ctx, '#5a3a1a', 4, '#10161f');
      U.ellipse(ctx, -r * .38, 0, r * .26, r * .22); U.ink(ctx, '#9fe8ff', 4, '#10161f');
      U.ellipse(ctx, r * .38, 0, r * .26, r * .22); U.ink(ctx, '#9fe8ff', 4, '#10161f');
      ctx.restore();
    },
    headphones(ctx, j, skin) {
      const r = j.head.r;
      ctx.save();
      ctx.beginPath(); ctx.arc(0, -r * .1, r * 1.02, Math.PI * 1.08, Math.PI * 1.92);
      ctx.strokeStyle = '#10161f'; ctx.lineWidth = 11; ctx.stroke();
      ctx.strokeStyle = '#ffb020'; ctx.lineWidth = 6; ctx.stroke();
      [-1, 1].forEach(s => {
        U.roundRect(ctx, s * r * .92 - (s > 0 ? 0 : r * .3), -r * .28, r * .3, r * .5, 6);
        U.ink(ctx, '#ffb020', 4, '#10161f');
      });
      ctx.restore();
    },
    crown(ctx, j, skin) {
      const r = j.head.r;
      ctx.save(); ctx.translate(0, -r * .84);
      U.poly(ctx, [[-r * .5, 0], [-r * .5, -r * .34], [-r * .22, -r * .12], [0, -r * .46],
      [r * .22, -r * .12], [r * .5, -r * .34], [r * .5, 0]]);
      U.ink(ctx, '#ffd94a', 4, '#7a5200');
      [-r * .32, 0, r * .32].forEach(x => { U.ellipse(ctx, x, -r * .04, 3.5, 3.5); U.ink(ctx, '#ff4d6d', 2, '#7a5200'); });
      ctx.restore();
    },
    whistle(ctx, j, skin) {
      ctx.save();
      ctx.beginPath(); ctx.moveTo(-16, -110); ctx.quadraticCurveTo(0, -86, 14, -108);
      ctx.strokeStyle = '#10161f'; ctx.lineWidth = 4; ctx.stroke();
      U.roundRect(ctx, -4, -92, 14, 9, 3); U.ink(ctx, '#c0c6d1', 3, '#10161f');
      ctx.restore();
    },
    scarf(ctx, j, skin, t) {
      ctx.save();
      U.roundRect(ctx, -22, -118, 44, 15, 7); U.ink(ctx, '#2f6fd0', 4, '#10161f');
      const w = Math.sin(t * 7) * 12;
      U.poly(ctx, [[8, -114], [30 + w * .4, -104 + w * .3], [48 + w, -88 + w], [40 + w, -78 + w], [22, -96], [8, -102]]);
      U.ink(ctx, '#2f6fd0', 4, '#10161f');
      ctx.restore();
    },
    cape(ctx, j, skin, t) {
      ctx.save();
      const w = Math.sin(t * 6) * 10;
      U.poly(ctx, [[-16, -116], [16, -116], [34 + w * .5, -60], [44 + w, -18], [10, -34], [-18, -30], [-34 - w * .4, -58]]);
      U.ink(ctx, '#6b21f5', 4.5, '#10161f');
      ctx.restore();
    }
  };
  // accessories drawn *behind* the body
  const BACK_ACC = new Set(['cape']);

  /* ---------------------------------------------------------
     MAIN DRAW
     --------------------------------------------------------- */
  function drawRiggy(ctx, opts) {
    const {
      x = 0, y = 0, scale = 1, skinId = 'classic', state = 'idle',
      t = 0, phase = 0, extra = {}, flip = 1, alpha = 1, shadow = true,
      view = 'front'
    } = opts;
    const skin = SKINS[skinId] || SKINS.classic;
    const j = solve(state, t, phase, Object.assign({ turn: view === 'back' ? 0.45 : 1 }, extra));

    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    ctx.scale(scale * flip, scale);

    // ground shadow
    if (shadow) {
      const sh = extra.shadowScale === undefined ? 1 : extra.shadowScale;
      ctx.save();
      U.ellipse(ctx, 0, 2, 44 * sh, 12 * sh);
      ctx.fillStyle = `rgba(0,0,0,${.28 * sh})`; ctx.fill();
      ctx.restore();
    }

    ctx.translate(j.root.x, j.root.y);
    if (j.rot) { ctx.translate(0, -60); ctx.rotate(j.rot); ctx.translate(0, 60); }
    ctx.rotate(-j.lean * .5);
    ctx.scale(1 / (j.stretch || 1), (j.stretch || 1) * (j.squash || 1));

    // aura / glow for special skins
    if (skin.glow) {
      ctx.save();
      const g = ctx.createRadialGradient(0, -100, 8, 0, -100, 130);
      g.addColorStop(0, U.rgba(skin.glow, .35)); g.addColorStop(1, U.rgba(skin.glow, 0));
      ctx.fillStyle = g; ctx.fillRect(-140, -240, 280, 260);
      ctx.restore();
    }

    // --- behind-the-body layer
    tail(ctx, j.tail, j.tailWag, skin, 1);
    skin.accessories.filter(a => BACK_ACC.has(a)).forEach(a => ACC[a] && ACC[a](ctx, j, skin, t));

    // far limbs (right side reads as "far" from our 3/4 view)
    limb(ctx, j.hipR, j.footR, j.kneeR, 15, skin);
    shoe(ctx, j.footR, skin, 1, (j.footR.y < -12 ? -.35 : 0));
    limb(ctx, j.shR, j.handR, j.elbR, 11, skin);
    glove(ctx, j.handR, 11, skin);

    // body
    torso(ctx, j, skin);
    shorts(ctx, skin);

    // near limbs
    limb(ctx, j.hipL, j.footL, j.kneeL, 16, skin);
    shoe(ctx, j.footL, skin, 1, (j.footL.y < -12 ? -.35 : 0));
    limb(ctx, j.shL, j.handL, j.elbL, 12, skin);
    glove(ctx, j.handL, 11.5, skin);

    // head group
    ctx.save();
    ctx.translate(j.head.x, j.head.y);
    ctx.rotate(j.head.tilt);
    ear(ctx, -14, -j.head.r * .78, 62, 15, j.ear.l, j.ear.flop, skin);
    ear(ctx, 15, -j.head.r * .78, 66, 15, j.ear.r, j.ear.flop * .86, skin);
    face(ctx, j, skin, t);
    skin.accessories.filter(a => !BACK_ACC.has(a)).forEach(a => ACC[a] && ACC[a](ctx, j, skin, t));
    ctx.restore();

    // front-of-body accessories that live on the torso
    if (skin.accessories.includes('whistle')) ACC.whistle(ctx, j, skin, t);
    if (skin.accessories.includes('scarf')) ACC.scarf(ctx, j, skin, t);

    // skin FX
    if (skin.sparkle) {
      for (let i = 0; i < 5; i++) {
        const a = t * 2 + i * 1.4;
        const sx = Math.cos(a) * 62, sy = -110 + Math.sin(a * 1.3) * 62;
        const s2 = 3 + Math.sin(a * 3) * 2;
        U.star(ctx, sx, sy, 4, s2 + 3, s2 * .4);
        ctx.fillStyle = 'rgba(255,245,190,.9)'; ctx.fill();
      }
    }
    if (skin.flames) {
      for (let i = 0; i < 6; i++) {
        const a = t * 4 + i;
        const fx = -20 + (i % 3) * 20, fy = -20 - ((a * 40) % 90);
        U.ellipse(ctx, fx + Math.sin(a * 3) * 5, fy, 6, 11);
        ctx.fillStyle = U.rgba(i % 2 ? '#ffb26b' : '#ff5a1f', .5); ctx.fill();
      }
    }
    if (skin.frosty) {
      for (let i = 0; i < 7; i++) {
        const a = t * 1.6 + i * .9;
        U.ellipse(ctx, Math.sin(a) * 55, -30 - ((a * 26) % 150), 2.6, 2.6);
        ctx.fillStyle = 'rgba(230,250,255,.85)'; ctx.fill();
      }
    }

    ctx.restore();
  }

  /* small silhouette used by the character cards */
  function drawBust(ctx, cx, cy, r, skinId, t = 0) {
    const skin = SKINS[skinId] || SKINS.classic;
    const j = solve('idle', t, 0, { turn: 1 });
    ctx.save(); ctx.translate(cx, cy); ctx.scale(r / 42, r / 42);
    tail(ctx, -0.6, Math.sin(t) * .3, skin, 1);
    ear(ctx, -14, -j.head.r * .78, 62, 15, -.18 + Math.sin(t) * .05, 0, skin);
    ear(ctx, 15, -j.head.r * .78, 66, 15, .18 + Math.sin(t) * .05, 0, skin);
    face(ctx, j, skin, t);
    skin.accessories.filter(a => !BACK_ACC.has(a)).forEach(a => ACC[a] && ACC[a](ctx, j, skin, t));
    ctx.restore();
  }

  return { draw: drawRiggy, drawBust, SKINS, solve };
})();
