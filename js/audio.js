'use strict';
// Процедурный звук на WebAudio: ветер, шаги, стоны, удары, выстрелы, сердцебиение, колыбельная.
(function () {
  let ctx = null, master = null, windGain = null, noiseBuf = null;
  let heartTimer = 0;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return; }
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);

    // Буфер шума (2 сек) для ветра и ударов.
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02; // «коричневый» шум
      data[i] = last * 3.5;
    }

    // Ветер: шум → полосовой фильтр с медленным LFO.
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 400;
    bp.Q.value = 0.6;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 250;
    lfo.connect(lfoGain).connect(bp.frequency);
    windGain = ctx.createGain();
    windGain.gain.value = 0.18;
    src.connect(bp).connect(windGain).connect(master);
    src.start();
    lfo.start();
  }

  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  function noiseBurst(freq, q, peak, dur, type = 'lowpass') {
    if (!ctx) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    env(g, t, 0.005, peak, dur);
    s.connect(f).connect(g).connect(master);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.1);
  }

  function tone(type, f0, f1, peak, dur, delay = 0, filt = 2000) {
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = filt;
    const g = ctx.createGain();
    env(g, t, 0.02, peak, dur);
    o.connect(lp).connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  const A = {
    init,
    step(quiet) { noiseBurst(quiet ? 500 : 900, 1, quiet ? 0.05 : 0.12, 0.08); },
    swing() { noiseBurst(1800, 0.7, 0.12, 0.12, 'bandpass'); },
    hit() { noiseBurst(300, 1, 0.5, 0.18); tone('sine', 120, 50, 0.3, 0.15); },
    shot() { noiseBurst(2500, 0.3, 0.9, 0.35); tone('square', 150, 40, 0.4, 0.2, 0, 600); },
    click() { tone('square', 1200, 1100, 0.05, 0.03); },
    glass() { for (let i = 0; i < 4; i++) tone('triangle', 2500 + Math.random() * 2000, 1800, 0.06, 0.12, i * 0.03, 8000); },
    pickup() { tone('sine', 660, 880, 0.12, 0.1); tone('sine', 880, 990, 0.08, 0.1, 0.08); },
    hurt() { tone('sawtooth', 220, 90, 0.25, 0.3, 0, 900); noiseBurst(400, 1, 0.3, 0.2); },
    groan(vol = 0.15) {
      const f = 70 + Math.random() * 50;
      tone('sawtooth', f, f * 0.7, vol, 0.9 + Math.random() * 0.6, 0, 500);
    },
    sting() {
      // Диссонансный аккорд: героя заметили.
      [233, 247, 349].forEach((f, i) => tone('sawtooth', f, f * 0.98, 0.07, 1.4, i * 0.02, 1400));
    },
    heartbeat(intensity) {
      tone('sine', 60, 40, 0.25 * intensity, 0.12);
      tone('sine', 55, 35, 0.18 * intensity, 0.12, 0.18);
    },
    lullaby() {
      // Простая колыбельная — Маша.
      const notes = [523, 494, 440, 392, 440, 494, 440];
      notes.forEach((f, i) => tone('sine', f, f, 0.05, 0.5, i * 0.5, 3000));
    },
    explosion() { noiseBurst(200, 0.5, 1.0, 2.5); tone('sine', 60, 20, 0.8, 2.0); },
    alarm() { for (let i = 0; i < 3; i++) tone('square', 880, 870, 0.05, 0.25, i * 0.5, 3000); },

    // Вызывается каждый кадр: сердцебиение тем чаще, чем ближе опасность.
    update(dt, danger) {
      if (!ctx) return;
      if (danger <= 0.05) { heartTimer = 0; return; }
      heartTimer -= dt;
      if (heartTimer <= 0) {
        A.heartbeat(Math.min(1, danger));
        heartTimer = 1.1 - danger * 0.6;
      }
    },
    setWind(v) { if (windGain) windGain.gain.value = v; },
  };

  G.Audio = A;
})();
