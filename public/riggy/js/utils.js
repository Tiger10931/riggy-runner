/* ============================================================
   utils.js — small maths / drawing helpers shared by everything
   ============================================================ */
'use strict';

const U = (() => {

  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const inv = (a, b, v) => (v - a) / (b - a);
  const rand = (a = 1, b = 0) => b + Math.random() * (a - b);
  const randInt = (a, b) => Math.floor(b === undefined ? Math.random() * a : a + Math.random() * (b - a + 1));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const chance = p => Math.random() < p;
  const ease = {
    outCubic: t => 1 - Math.pow(1 - t, 3),
    inCubic: t => t * t * t,
    outBack: t => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2),
    outElastic: t => t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - .75) * (2 * Math.PI / 3)) + 1,
    inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
    outQuad: t => 1 - (1 - t) * (1 - t)
  };

  /* Deterministic pseudo-random so a "seeded" world can repeat */
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* -------- colour helpers -------- */
  function hex2rgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  function rgb2hex(r, g, b) {
    return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  }
  function mix(c1, c2, t) {
    const a = hex2rgb(c1), b = hex2rgb(c2);
    return rgb2hex(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t));
  }
  function shade(c, amt) { // amt -1..1
    const [r, g, b] = hex2rgb(c);
    return amt >= 0 ? rgb2hex(lerp(r, 255, amt), lerp(g, 255, amt), lerp(b, 255, amt))
      : rgb2hex(r * (1 + amt), g * (1 + amt), b * (1 + amt));
  }
  function rgba(c, a) {
    const [r, g, b] = hex2rgb(c);
    return `rgba(${r},${g},${b},${a})`;
  }

  /* -------- canvas helpers -------- */
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function ellipse(ctx, x, y, rx, ry, rot = 0) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, Math.PI * 2);
  }
  function poly(ctx, pts, close = true) {
    ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    if (close) ctx.closePath();
  }
  /* stroked + filled shape with the thick cartoon outline Riggy uses */
  function ink(ctx, fill, lw = 4, stroke = '#10161f') {
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (lw > 0) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
  }
  function star(ctx, x, y, spikes, outer, inner) {
    let rot = Math.PI / 2 * 3, step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(x, y - outer);
    for (let i = 0; i < spikes; i++) {
      ctx.lineTo(x + Math.cos(rot) * outer, y + Math.sin(rot) * outer); rot += step;
      ctx.lineTo(x + Math.cos(rot) * inner, y + Math.sin(rot) * inner); rot += step;
    }
    ctx.closePath();
  }
  function text(ctx, str, x, y, opts = {}) {
    const { size = 20, weight = 900, color = '#fff', outline = '#10161f', lw = 5, align = 'center', baseline = 'middle', font = '"Trebuchet MS", Verdana, sans-serif' } = opts;
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.textAlign = align; ctx.textBaseline = baseline;
    ctx.lineJoin = 'round';
    if (lw > 0 && outline) { ctx.lineWidth = lw; ctx.strokeStyle = outline; ctx.strokeText(str, x, y); }
    ctx.fillStyle = color; ctx.fillText(str, x, y);
  }

  /* -------- misc -------- */
  const fmt = n => Math.floor(n).toLocaleString('en-US');
  const now = () => performance.now();

  function aabb(a, b) {
    return Math.abs(a.x - b.x) * 2 < a.w + b.w &&
      Math.abs(a.y - b.y) * 2 < a.h + b.h &&
      Math.abs(a.z - b.z) * 2 < a.d + b.d;
  }

  /* tiny object pool so the GC stays out of the frame budget */
  class Pool {
    constructor(factory, reset, size = 64) {
      this.factory = factory; this.reset = reset; this.free = [];
      for (let i = 0; i < size; i++) this.free.push(factory());
    }
    get() { return this.free.length ? this.free.pop() : this.factory(); }
    put(o) { this.reset(o); if (this.free.length < 512) this.free.push(o); }
  }

  return { clamp, lerp, inv, rand, randInt, pick, chance, ease, mulberry32, hex2rgb, rgb2hex, mix, shade, rgba, roundRect, ellipse, poly, ink, star, text, fmt, now, aabb, Pool };
})();
