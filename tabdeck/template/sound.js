// TabDeck sounds: synthesised with Web Audio, no audio files.
const TDSound = (() => {
  let ctx = null, master = null, noiseBuf = null;
  function init() {
    if (ctx) { if (ctx.state === "suspended") ctx.resume(); return ctx; }
    try { ctx = new AudioContext(); } catch (_) { return null; }
    master = ctx.createGain(); master.gain.value = .55; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  function env(g, t, a, peak, dur) { g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + dur); }
  function noise(t, dur, type, f0, f1, q, peak) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); env(g, t, .02, peak, dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + .05);
  }
  function tone(t, type, f0, f1, dur, peak) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); env(g, t, .005, peak, dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .05);
  }
  const lib = {
    whoosh: t => noise(t, .45, "bandpass", 350, 3200, 1.2, .9),
    swish: t => { noise(t, .3, "highpass", 5000, 900, .7, .7); noise(t + .05, .22, "bandpass", 2500, 1200, 2, .4); },
    crumple: t => { for (let i = 0; i < 9; i++) { const tt = t + i * .035 + Math.random() * .02; noise(tt, .05, "bandpass", 1200 + Math.random() * 3500, 1500 + Math.random() * 3000, 3, .55); } tone(t + .36, "sine", 180, 90, .12, .35); },
    chime: t => { tone(t, "sine", 1046.5, 0, .6, .28); tone(t + .06, "sine", 1568, 0, .55, .18); },
    pop: (t, k = 0) => { const f = 520 * Math.pow(1.122, k); tone(t, "sine", f * 2.2, f * .7, .09, .55); },
    kaching: t => { noise(t, .04, "highpass", 3000, 3000, .7, .5); tone(t + .02, "triangle", 1568, 0, .22, .35); tone(t + .1, "triangle", 2093, 0, .45, .35); tone(t + .1, "sine", 4186, 0, .3, .08); },
    blip: (t, k = 0) => { const f = 440 * Math.pow(1.189, k); tone(t, "square", f, 0, .07, .18); },
    fanfare: t => { [523.3, 659.3, 784, 1046.5].forEach((f, i) => { tone(t + i * .09, "triangle", f, 0, .5, .3); tone(t + i * .09, "sine", f * 2, 0, .3, .06); }); tone(t + .36, "triangle", 1318.5, 0, .9, .25); },
    rewind: t => tone(t, "sine", 900, 300, .25, .25)
  };
  function single(t, effect, sound) {
    const m = sound === "match" ? { plane: "whoosh", sweep: "swish", crumple: "crumple", fade: "chime" }[effect]
      : sound === "pop" ? "pop" : sound === "kaching" ? "kaching" : "blip";
    lib[m](t);
  }
  return {
    close(n, allGone, effect, sound) {
      if (sound === "off" || !init()) return;
      const t = ctx.currentTime + .01; single(t, effect, sound);
      if (n > 1) {
        const k = Math.min(n, 12), base = t + .12;
        for (let i = 0; i < k; i++) sound === "arcade" ? lib.blip(base + i * .06, i) : lib.pop(base + i * .06, i);
        if (n >= 5 && !allGone) lib.kaching(base + k * .06 + .04);
      }
      if (allGone) lib.fanfare(t + .25 + Math.min(n, 12) * .06);
    },
    rewind(sound) { if (sound === "off" || !init()) return; lib.rewind(ctx.currentTime + .01); },
    tick(i, sound) { if (sound === "off" || !init()) return; lib.pop(ctx.currentTime + .01, i + 2); }
  };
})();
