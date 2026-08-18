/* ============================================================
   audio.js — 100% synthesised sound. No files, no downloads.
   A tiny WebAudio engine: SFX blips + a looping chiptune track
   that layers in extra parts as your run speeds up.
   ============================================================ */
'use strict';

const Sound = (() => {
  let ctx = null, master = null, musicGain = null, sfxGain = null;
  let musicOn = true, sfxOn = true, started = false;
  let schedulerId = null, nextNoteTime = 0, step = 0, intensity = 0;

  const BPM = 132;
  const STEP = 60 / BPM / 4;          // 16th notes
  const LOOKAHEAD = 0.1;

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.24; musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.5; sfxGain.connect(master);
  }
  function resume() { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); }

  /* ---------------- primitive voices ---------------- */
  function blip(freq, dur, type = 'square', vol = .3, slideTo = null, delay = 0, dest = null) {
    if (!ctx || !sfxOn) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || sfxGain);
    o.start(t); o.stop(t + dur + .02);
  }

  function noise(dur, vol = .3, filterFreq = 1200, delay = 0, q = 1) {
    if (!ctx || !sfxOn) return;
    const t = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(sfxGain);
    src.start(t);
  }

  /* ---------------- game SFX ---------------- */
  const sfx = {
    coin() { blip(1180, .07, 'square', .22); blip(1760, .12, 'square', .18, null, .06); },
    bigCoin() { blip(880, .06, 'square', .25); blip(1320, .07, 'square', .25, null, .05); blip(1760, .16, 'square', .22, null, .1); },
    jump() { blip(320, .18, 'sine', .3, 720); noise(.06, .08, 900); },
    doubleJump() { blip(520, .2, 'triangle', .28, 1050); },
    roll() { noise(.22, .18, 500, 0, 3); blip(180, .14, 'sawtooth', .12, 90); },
    lane() { blip(600, .05, 'triangle', .16, 760); },
    crash() {
      noise(.5, .5, 700, 0, .8); blip(180, .5, 'sawtooth', .3, 45);
      blip(90, .7, 'square', .22, 30, .05);
    },
    stumble() { noise(.18, .3, 480); blip(220, .18, 'square', .18, 120); },
    powerup() { [523, 659, 784, 1047].forEach((f, i) => blip(f, .16, 'square', .22, null, i * .06)); },
    magnet() { blip(400, .3, 'sawtooth', .16, 1200); blip(1200, .3, 'sine', .12, 400, .1); },
    jetpack() { noise(1.2, .18, 380, 0, .6); blip(120, 1.0, 'sawtooth', .1, 260); },
    shield() { blip(700, .3, 'sine', .2, 1500); blip(1500, .35, 'sine', .14, 700, .1); },
    board() { blip(260, .35, 'sawtooth', .2, 900); noise(.4, .12, 1600); },
    trick() { [660, 880, 1100].forEach((f, i) => blip(f, .12, 'triangle', .2, null, i * .05)); },
    combo(n) { blip(500 + Math.min(n, 12) * 55, .12, 'square', .2, 900 + n * 40); },
    button() { blip(420, .06, 'square', .18, 620); },
    back() { blip(420, .07, 'square', .16, 260); },
    buy() { [784, 988, 1319].forEach((f, i) => blip(f, .18, 'square', .2, null, i * .07)); },
    deny() { blip(200, .18, 'square', .2, 120); },
    mission() { [659, 784, 988, 1319].forEach((f, i) => blip(f, .2, 'triangle', .22, null, i * .09)); },
    count() { blip(700, .12, 'square', .22); },
    go() { blip(900, .3, 'square', .28, 1400); },
    newRecord() { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => blip(f, .25, 'square', .22, null, i * .09)); },
    near() { noise(.16, .14, 2400, 0, 2); }
  };

  /* ---------------- music: 4-bar chiptune loop ---------------- */
  // scale degrees of an A-minor-ish riff, expressed as MIDI notes
  const BASS = [45, 45, 52, 45, 48, 48, 55, 48, 43, 43, 50, 43, 41, 41, 48, 52];
  const LEAD = [
    69, null, 72, 74, null, 76, 74, 72, 69, null, 67, 69, null, 72, null, null,
    69, null, 72, 76, null, 79, 76, 74, 72, null, 69, 67, null, 69, null, null,
    65, null, 69, 72, null, 74, 72, 69, 67, null, 64, 67, null, 69, null, null,
    64, null, 67, 71, null, 72, 71, 69, 67, null, 64, 62, null, 60, null, null
  ];
  const ARP = [76, 79, 84, 79, 76, 79, 84, 88];

  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function musicVoice(freq, dur, type, vol, when, detune = 0) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq; o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + .01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(musicGain);
    o.start(when); o.stop(when + dur + .02);
  }
  function kick(when) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(150, when);
    o.frequency.exponentialRampToValueAtTime(45, when + .12);
    g.gain.setValueAtTime(.5, when); g.gain.exponentialRampToValueAtTime(.0001, when + .18);
    o.connect(g); g.connect(musicGain); o.start(when); o.stop(when + .2);
  }
  function hat(when, open = false) {
    const len = Math.floor(ctx.sampleRate * (open ? .12 : .04));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ctx.createBufferSource(); s.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = ctx.createGain(); g.gain.value = open ? .16 : .1;
    s.connect(f); f.connect(g); g.connect(musicGain); s.start(when);
  }
  function snare(when) {
    const len = Math.floor(ctx.sampleRate * .18);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const s = ctx.createBufferSource(); s.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = .8;
    const g = ctx.createGain(); g.gain.value = .28;
    s.connect(f); f.connect(g); g.connect(musicGain); s.start(when);
  }

  function scheduleStep(s, when) {
    const bar16 = s % 16, pos = s % 64;
    // drums
    if (bar16 % 4 === 0) kick(when);
    if (bar16 === 4 || bar16 === 12) snare(when);
    if (intensity > .2 && bar16 % 2 === 0) hat(when, bar16 % 8 === 6);
    // bass
    const b = BASS[bar16];
    if (b) musicVoice(mtof(b - 12), STEP * 1.7, 'triangle', .3, when);
    // lead
    if (intensity > .12) {
      const n = LEAD[pos];
      if (n) {
        musicVoice(mtof(n), STEP * 2.4, 'square', .16 * Math.min(1, intensity * 1.5), when);
        musicVoice(mtof(n), STEP * 2.4, 'square', .07 * Math.min(1, intensity * 1.5), when, 9);
      }
    }
    // arpeggio layer once you're really moving
    if (intensity > .55) musicVoice(mtof(ARP[s % ARP.length] + 12), STEP * .9, 'sawtooth', .05, when);
  }

  function scheduler() {
    if (!ctx) return;
    while (nextNoteTime < ctx.currentTime + LOOKAHEAD) {
      if (musicOn) scheduleStep(step, nextNoteTime);
      nextNoteTime += STEP; step++;
    }
  }

  function startMusic() {
    init(); if (!ctx || started) return;
    started = true; step = 0; nextNoteTime = ctx.currentTime + .06;
    schedulerId = setInterval(scheduler, 25);
  }
  function stopMusic() {
    started = false; if (schedulerId) clearInterval(schedulerId); schedulerId = null;
  }
  function setIntensity(v) { intensity = U.clamp(v, 0, 1); }
  function duck(on) { if (musicGain && ctx) musicGain.gain.setTargetAtTime(on ? .06 : (musicOn ? .24 : 0), ctx.currentTime, .1); }

  function setMusic(on) {
    musicOn = on; init();
    if (musicGain && ctx) musicGain.gain.setTargetAtTime(on ? .24 : 0, ctx.currentTime, .05);
    if (on) startMusic();
  }
  function setSfx(on) { sfxOn = on; }

  return { init, resume, sfx, startMusic, stopMusic, setMusic, setSfx, setIntensity, duck, get ready() { return !!ctx; } };
})();
