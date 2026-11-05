// Plays the real construction recordings in bursts and reports how loud it is right now,
// so the picture can shake in time with what you actually hear. Also the cat's purr.
window.Noise = (() => {
  let ac = null, bus = null, analyser = null, level = null, noiseBuf = null;
  let buffers = [];
  let purr = null;

  async function load(sounds) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error('Web Audio is not supported');
    ac = new Ctx();
    if (ac.state === 'suspended') await ac.resume();
    bus = ac.createGain();
    bus.gain.value = 0.9;
    analyser = ac.createAnalyser();
    analyser.fftSize = 1024;
    level = new Float32Array(analyser.fftSize);
    bus.connect(analyser);
    bus.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    buffers = await Promise.all(sounds.map(async s => {
      const res = await fetch(s.file);
      if (!res.ok) throw new Error(`${s.file}: ${res.status}`);
      return ac.decodeAudioData(await res.arrayBuffer());
    }));
  }

  // Play `dur` seconds from somewhere inside recording i, faded in and out
  function burst(i, dur) {
    if (!ac) return;
    const buf = buffers[i];
    const len = Math.min(dur, buf.duration);
    const offset = Math.random() * Math.max(0, buf.duration - len);
    const t = ac.currentTime + 0.02;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + 0.08);
    g.gain.setValueAtTime(1, t + len - 0.25);
    g.gain.linearRampToValueAtTime(0, t + len);
    src.connect(g).connect(bus);
    src.start(t, offset, len + 0.05);
    return len;
  }

  // RMS of what's playing right now, roughly 0..1
  function loudness() {
    if (!analyser) return 0;
    analyser.getFloatTimeDomainData(level);
    let s = 0;
    for (const v of level) s += v * v;
    return Math.min(1, Math.sqrt(s / level.length) * 4.5);
  }

  // The cat purring on your lap: a soft rumble, quieter than the works
  function setPurr(isOn) {
    if (!ac) return;
    if (isOn && !purr) {
      const src = ac.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 110;
      const g = ac.createGain();
      g.gain.value = 0;
      const lfo = ac.createOscillator();
      lfo.frequency.value = 24;
      const amt = ac.createGain();
      amt.gain.value = 0.3;
      lfo.connect(amt).connect(g.gain);
      src.connect(lp).connect(g).connect(ac.destination);
      src.start();
      lfo.start();
      purr = { src, lfo, g };
      g.gain.setTargetAtTime(0.3, ac.currentTime, 0.3);
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

  return { load, burst, loudness, setPurr };
})();
