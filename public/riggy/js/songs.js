/* ============================================================
   songs.js — original songs for the Daily Jam, synthesized in the browser.
   Each song is composed from a seeded generator (drums, bass, pad, arp, lead),
   rendered once to a 16-bit WAV blob, and its chart is generated from the lead
   melody. No audio files, no licensed music.

   Songs.list            -> [{id,name,bpm,desc,rewardMul}]
   Songs.ensure(id)      -> Promise<{url, meta:{bpm,offsetMs,lengthMs}}>
   Songs.chart(id, diff) -> [[timeMs, lane], ...]   (after ensure)
   ============================================================ */
'use strict';

const Songs = (() => {
  const SR = 22050;
  const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10], DORIAN = [0, 2, 3, 5, 7, 9, 10];

  const DEFS = [
    { id: 'neon',    name: 'Neon Canyon',    desc: 'Driving synthwave',  bpm: 118, root: 57, scale: MINOR,  prog: [0, 5, 2, 6], bars: 40, seed: 11, style: 'wave',  rewardMul: 1.0 },
    { id: 'sunrise', name: 'Sunrise Sprint', desc: 'Bright and bouncy',  bpm: 132, root: 60, scale: MAJOR,  prog: [0, 4, 5, 3], bars: 44, seed: 23, style: 'pop',   rewardMul: 1.1 },
    { id: 'metro',   name: 'Midnight Metro', desc: 'Late-night groove',  bpm: 100, root: 50, scale: DORIAN, prog: [0, 3, 0, 4], bars: 36, seed: 37, style: 'groove', rewardMul: 1.0 },
    { id: 'turbo',   name: 'Turbo Tunnel',   desc: 'Fast drum & bass',   bpm: 160, root: 52, scale: MINOR,  prog: [0, 0, 5, 6], bars: 56, seed: 49, style: 'dnb',   rewardMul: 1.4 },
    { id: 'lullaby', name: 'Lullaby Loop',   desc: 'Slow and gentle',    bpm: 84,  root: 53, scale: MAJOR,  prog: [0, 5, 3, 4], bars: 32, seed: 61, style: 'soft',  rewardMul: 0.8 }
  ];

  const cache = {};   // id -> { url, meta, charts }

  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const degMidi = (def, deg) => {                 // scale degree (may exceed 7 / go negative) -> midi
    const n = def.scale.length, o = Math.floor(deg / n), i = ((deg % n) + n) % n;
    return def.root + def.scale[i] + 12 * o;
  };

  /* ---------- compose + render ---------- */
  function render(def) {
    const R = rng(def.seed);
    const spb = 60 / def.bpm, bar = spb * 4;
    const len = def.bars * bar + 2;
    const buf = new Float32Array(Math.ceil(len * SR));
    const lead = [];                                // [timeSec, midi]

    const env = (i, n, a, r) => { const t = i / SR, d = n / SR; return Math.min(1, t / a) * Math.min(1, Math.max(0, (d - t) / r)); };
    function tone(t0, dur, freq, vol, type, a = 0.005, r = 0.06, vib = 0) {
      const s0 = Math.floor(t0 * SR), n = Math.floor((dur + r) * SR);
      let ph = 0;
      for (let i = 0; i < n && s0 + i < buf.length; i++) {
        const t = i / SR;
        ph += (freq * (1 + vib * Math.sin(t * 38))) / SR;
        const p = ph % 1;
        let v;
        if (type === 'sq') v = p < 0.5 ? 1 : -1;
        else if (type === 'saw') v = 2 * p - 1;
        else if (type === 'tri') v = 4 * Math.abs(p - 0.5) - 1;
        else v = Math.sin(p * 6.2832);
        const e = Math.min(1, t / a) * Math.min(1, Math.max(0, (dur + r - t) / r)) * (type === 'pluck' ? Math.exp(-t * 6) : 1);
        buf[s0 + i] += v * e * vol;
      }
    }
    function kick(t0, vol = 0.9) {
      const s0 = Math.floor(t0 * SR), n = Math.floor(0.22 * SR); let ph = 0;
      for (let i = 0; i < n && s0 + i < buf.length; i++) {
        const t = i / SR; ph += (48 + 110 * Math.exp(-t * 30)) / SR;
        buf[s0 + i] += Math.sin(ph * 6.2832) * Math.exp(-t * 14) * vol;
      }
    }
    function noise(t0, dur, vol, hp) {
      const s0 = Math.floor(t0 * SR), n = Math.floor(dur * SR); let last = 0;
      for (let i = 0; i < n && s0 + i < buf.length; i++) {
        const w = R() * 2 - 1, x = hp ? w - last * 0.6 : w; last = w;
        buf[s0 + i] += x * Math.exp(-(i / SR) * (5 / dur)) * vol;
      }
    }
    const snare = (t, v = 0.55) => { noise(t, 0.16, v, false); tone(t, 0.08, 190, v * 0.5, 'tri', 0.001, 0.05); };
    const hat = (t, v = 0.22) => noise(t, 0.05, v, true);

    /* melody phrases (8 eighth-note slots per bar) built once and re-used with small variations */
    const rhythms = def.style === 'dnb' || def.style === 'pop'
      ? [[1, 0, 1, 1, 0, 1, 1, 0], [1, 1, 0, 1, 1, 0, 1, 1], [1, 0, 1, 0, 1, 1, 0, 1], [1, 1, 1, 0, 1, 0, 1, 0]]
      : def.style === 'soft'
        ? [[1, 0, 0, 0, 1, 0, 1, 0], [1, 0, 1, 0, 0, 0, 1, 0], [1, 0, 0, 1, 0, 0, 1, 0]]
        : [[1, 0, 1, 0, 1, 1, 0, 0], [1, 0, 0, 1, 0, 1, 0, 1], [1, 1, 0, 1, 0, 0, 1, 0], [1, 0, 1, 1, 0, 1, 0, 0]];
    function makePhrase() {
      const out = []; let deg = 7 + (R() * 3 | 0);
      for (let b = 0; b < 4; b++) {
        const chordDeg = def.prog[b];
        const pat = rhythms[R() * rhythms.length | 0];
        const bars = [];
        for (let s = 0; s < 8; s++) {
          if (!pat[s]) continue;
          const tones = [chordDeg + 7, chordDeg + 9, chordDeg + 11, chordDeg + 14];
          let target = (s === 0 || R() < 0.4) ? tones[R() * tones.length | 0] : deg + (R() < 0.5 ? -1 : 1) * (1 + (R() * 2 | 0));
          target = Math.max(5, Math.min(15, target));
          deg = target; bars.push([s, deg]);
        }
        out.push(bars);
      }
      return out;
    }
    const A = makePhrase(), B = makePhrase();

    for (let b = 0; b < def.bars; b++) {
      const t0 = b * bar, sec = Math.floor(b / 8) % 4, chordDeg = def.prog[b % 4];
      const intro = b < 4, drop = b >= def.bars - 4;
      const full = !intro && !drop;
      const root = degMidi(def, chordDeg - 7), chord = [0, 2, 4].map(k => degMidi(def, chordDeg + k));

      /* pad */
      chord.forEach(m => tone(t0, bar * 0.98, mtof(m), def.style === 'soft' ? 0.05 : 0.035, def.style === 'soft' ? 'sin' : 'saw', 0.08, 0.3));

      /* drums */
      for (let q = 0; q < 4; q++) {
        const t = t0 + q * spb;
        if (def.style === 'dnb') {
          if (!intro || b >= 2) {
            if (q === 0 || (q === 2 && b % 2)) kick(t);
            if (q === 1 || q === 3) snare(t);
            if (b % 2 && q === 2) kick(t + spb * 0.5, 0.7);
          }
          for (let e = 0; e < 2; e++) hat(t + e * spb / 2, e ? 0.14 : 0.2);
        } else if (def.style === 'soft') {
          if (!intro) { if (q === 0 || q === 2) kick(t, 0.5); if (q === 1 || q === 3) hat(t, 0.12); }
        } else {
          if (!intro || b >= 2) { kick(t, 0.8); if (q === 1 || q === 3) snare(t, 0.45); }
          hat(t + spb / 2, 0.2); if (full && sec % 2) hat(t, 0.1);
        }
      }

      /* bass */
      for (let e = 0; e < 8; e++) {
        const t = t0 + e * spb / 2, m = root - 12 + ((e === 3 || e === 6) && def.style !== 'soft' ? 7 : 0);
        if (def.style === 'dnb') { if (e % 3 === 0 || e === 5) tone(t, spb * 0.4, mtof(m), 0.2, 'saw', 0.004, 0.05); }
        else if (def.style === 'soft') { if (e % 4 === 0) tone(t, spb * 1.6, mtof(m), 0.2, 'sin', 0.02, 0.2); }
        else if (!intro && (e % 2 === 0 || e === 7)) tone(t, spb * 0.45, mtof(m), 0.2, def.style === 'groove' ? 'tri' : 'sq', 0.004, 0.05);
      }

      /* arp in the "full" sections */
      if (full && sec >= 1 && def.style !== 'soft') {
        for (let e = 0; e < 8; e++) tone(t0 + e * spb / 2, spb * 0.3, mtof(chord[e % 3] + 12), 0.045, 'pluck', 0.002, 0.04);
      }

      /* lead */
      if (!intro) {
        const phrase = (Math.floor(b / 4) % 4 === 3 ? B : A)[b % 4];
        phrase.forEach(([s, deg]) => {
          const m = degMidi(def, deg + (sec === 2 ? 0 : 0)), t = t0 + s * spb / 2;
          tone(t, spb * 0.42, mtof(m), 0.11, def.style === 'soft' ? 'tri' : 'sq', 0.006, 0.08, 0.004);
          lead.push([t, m]);
        });
      }
    }

    /* soft-clip + normalise */
    let peak = 0;
    for (let i = 0; i < buf.length; i++) { buf[i] = Math.tanh(buf[i] * 1.3); peak = Math.max(peak, Math.abs(buf[i])); }
    const g = peak > 0 ? 0.92 / peak : 1;
    const pcm = new Int16Array(buf.length);
    for (let i = 0; i < buf.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, buf[i] * g * 32767));
    return { pcm, lead, lengthMs: Math.round((def.bars * bar) * 1000) };
  }

  function wavUrl(pcm) {
    const n = pcm.length * 2, b = new ArrayBuffer(44 + n), v = new DataView(b);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, 1, true); v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, n, true);
    new Int16Array(b, 44).set(pcm);
    return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
  }

  /* ---------- charts from the lead line ---------- */
  const GAPS = { easy: 480, normal: 300, hard: 200, insane: 130 };
  function makeChart(lead, diff, seed) {
    const R = rng(seed * 7 + diff.length), gap = GAPS[diff];
    /* thin the melody for easy, fill the gaps between notes for hard / insane so every level differs */
    let src = lead;
    if (diff === 'easy') src = lead.filter((_, i) => i % 2 === 0);
    else if (diff === 'hard' || diff === 'insane') {
      src = [];
      lead.forEach((n, i) => {
        src.push(n);
        const nx = lead[i + 1];
        if (nx && nx[0] - n[0] > (diff === 'hard' ? 0.5 : 0.3)) src.push([(n[0] + nx[0]) / 2, (n[1] + nx[1]) / 2 | 0]);
        if (diff === 'insane' && nx && nx[0] - n[0] > 0.9) src.push([n[0] + (nx[0] - n[0]) * 0.25, n[1] + 2]);
      });
      src.sort((x, y) => x[0] - y[0]);
    }
    const out = []; let lastT = -1e9, lastLane = 1, prevM = null, rep = 0;
    src.forEach(([t, m]) => {
      const ms = Math.round(t * 1000);
      if (ms - lastT < gap) return;
      let lane;
      if (prevM === null) lane = 1;
      else {
        const dm = m - prevM;
        if (dm > 0) lane = Math.min(3, lastLane + (dm > 4 ? 2 : 1));
        else if (dm < 0) lane = Math.max(0, lastLane + (dm < -4 ? -2 : -1));
        else lane = (lastLane + (R() < 0.5 ? 1 : 3)) % 4;
        if (lane === lastLane) lane = (lane + 1 + (R() * 3 | 0)) % 4;
      }
      rep = lane === lastLane ? rep + 1 : 0;
      if (rep >= 2) lane = (lane + 2) % 4;
      out.push([ms, lane]); lastT = ms; lastLane = lane; prevM = m;
    });
    return out;
  }

  function ensure(id) {
    const def = DEFS.find(d => d.id === id);
    if (!def) return Promise.reject(new Error('unknown song'));
    if (cache[id]) return Promise.resolve(cache[id]);
    return new Promise(res => setTimeout(() => {       // let the "rendering" message paint first
      const r = render(def);
      const charts = {};
      Object.keys(GAPS).forEach(d => { charts[d] = makeChart(r.lead, d, def.seed); });
      cache[id] = { url: wavUrl(r.pcm), meta: { bpm: def.bpm, offsetMs: 0, lengthMs: r.lengthMs }, charts };
      res(cache[id]);
    }, 30));
  }

  return {
    list: DEFS.map(d => ({ id: d.id, name: d.name, bpm: d.bpm, desc: d.desc, rewardMul: d.rewardMul })),
    ensure,
    chart: (id, diff) => (cache[id] && cache[id].charts[diff]) || [],
    meta: id => cache[id] && cache[id].meta
  };
})();
