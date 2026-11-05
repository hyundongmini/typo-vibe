// Web Audio construction noise (no audio files). Everything goes through two "ears":
// covering one muffles that side of the stereo image, the way a palm over the ear does.
window.Noise = (() => {
  let ac = null, master = null, bus = null, noiseBuf = null;
  const ears = [];
  let purr = null;

  function ensure() {
    if (ac) return true;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    ac = new Ctx();
    master = ac.createGain();
    // Loud enough to be annoying, kept well short of hurting
    master.gain.value = 0.3;
    master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // The works are on the right side of the flat; sources pan a little that way
    bus = ac.createStereoPanner();
    bus.pan.value = 0.3;
    const split = ac.createChannelSplitter(2);
    const merge = ac.createChannelMerger(2);
    bus.connect(split);
    for (let ch = 0; ch < 2; ch++) {
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 18000;
      const g = ac.createGain();
      split.connect(lp, ch);
      lp.connect(g).connect(merge, 0, ch);
      ears.push({ lp, g });
    }
    merge.connect(master);
    return true;
  }

  function noiseSource() {
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    return src;
  }

  // Attack, hold, release on a gain node
  function envelope(g, t, dur, vol) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.06);
    g.gain.setValueAtTime(vol, t + Math.max(0.07, dur - 0.15));
    g.gain.linearRampToValueAtTime(0, t + dur);
  }

  // Hammer drill: a grinding buzz chopped at ~30 Hz, with grit on top
  function drill(dur) {
    const t = ac.currentTime + 0.02;
    const out = ac.createGain();
    envelope(out, t, dur, 0.55);
    const shaper = ac.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) curve[i] = Math.tanh(((i / 128) - 1) * 3);
    shaper.curve = curve;
    const chop = ac.createGain();
    chop.gain.value = 0.5;
    const lfo = ac.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 30;
    const lfoAmt = ac.createGain();
    lfoAmt.gain.value = 0.5;
    lfo.connect(lfoAmt).connect(chop.gain);
    const saw = ac.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.value = 96;
    const grit = noiseSource();
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500;
    bp.Q.value = 0.7;
    const gritGain = ac.createGain();
    gritGain.gain.value = 0.6;
    saw.connect(chop);
    grit.connect(bp).connect(gritGain).connect(chop);
    chop.connect(shaper).connect(out).connect(bus);
    [lfo, saw, grit].forEach(n => {
      n.start(t);
      n.stop(t + dur + 0.05);
    });
  }

  // Angle grinder: a screaming narrow band of noise that wobbles
  function grind(dur) {
    const t = ac.currentTime + 0.02;
    const out = ac.createGain();
    envelope(out, t, dur, 0.35);
    const src = noiseSource();
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 4200;
    bp.Q.value = 7;
    const wob = ac.createOscillator();
    wob.frequency.value = 0.7;
    const wobAmt = ac.createGain();
    wobAmt.gain.value = 700;
    wob.connect(wobAmt).connect(bp.frequency);
    const tone = ac.createOscillator();
    tone.type = 'sawtooth';
    tone.frequency.value = 2100;
    const toneGain = ac.createGain();
    toneGain.gain.value = 0.04;
    src.connect(bp).connect(out);
    tone.connect(toneGain).connect(out);
    out.connect(bus);
    [src, wob, tone].forEach(n => {
      n.start(t);
      n.stop(t + dur + 0.05);
    });
  }

  // Hoist motor in the shaft winding up
  function motor(dur) {
    const t = ac.currentTime + 0.02;
    const out = ac.createGain();
    envelope(out, t, dur, 0.22);
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(160, t);
    o.frequency.linearRampToValueAtTime(420, t + dur * 0.7);
    o.frequency.linearRampToValueAtTime(300, t + dur);
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    o.connect(lp).connect(out).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // One blow on the shaft wall: a thud and a metal clang
  function hit() {
    const t = ac.currentTime + 0.01;
    const thud = ac.createOscillator();
    thud.frequency.setValueAtTime(70, t);
    thud.frequency.exponentialRampToValueAtTime(38, t + 0.25);
    const tg = ac.createGain();
    tg.gain.setValueAtTime(0.9, t);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    thud.connect(tg).connect(bus);
    thud.start(t);
    thud.stop(t + 0.32);
    const burst = noiseSource();
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    const bg = ac.createGain();
    bg.gain.setValueAtTime(0.7, t);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    burst.connect(lp).connect(bg).connect(bus);
    burst.start(t, Math.random());
    burst.stop(t + 0.17);
    [1870, 2630].forEach(f => {
      const o = ac.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + 0.47);
    });
  }

  const PLAY = { drill, grind, motor };

  function start(kind, dur) {
    if (!ac || ac.state !== 'running') return;
    if (kind === 'hammer') return;
    PLAY[kind](dur);
  }

  function blow() {
    if (!ac || ac.state !== 'running') return;
    hit();
  }

  // covered: [left, right] for your own ears
  function setEars(covered) {
    if (!ac) return;
    const t = ac.currentTime;
    ears.forEach((e, i) => {
      e.lp.frequency.setTargetAtTime(covered[i] ? 380 : 18000, t, 0.04);
      e.g.gain.setTargetAtTime(covered[i] ? 0.35 : 1, t, 0.04);
    });
  }

  // The cat purring on your lap: a soft, slow rumble
  function setPurr(isOn) {
    if (!ac || ac.state !== 'running') return;
    if (isOn && !purr) {
      const src = noiseSource();
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 120;
      const g = ac.createGain();
      g.gain.value = 0;
      const lfo = ac.createOscillator();
      lfo.frequency.value = 24;
      const amt = ac.createGain();
      amt.gain.value = 0.25;
      lfo.connect(amt).connect(g.gain);
      src.connect(lp).connect(g).connect(master);
      src.start();
      lfo.start();
      purr = { src, lfo, g };
      g.gain.setTargetAtTime(0.25, ac.currentTime, 0.3);
    } else if (!isOn && purr) {
      const p = purr;
      purr = null;
      p.g.gain.setTargetAtTime(0, ac.currentTime, 0.2);
      setTimeout(() => {
        p.src.stop();
        p.lfo.stop();
      }, 900);
    }
  }

  // Browsers only allow audio after a gesture
  function unlock() {
    if (!ensure()) return;
    if (ac.state === 'suspended') ac.resume();
  }

  return { unlock, start, blow, setEars, setPurr };
})();
