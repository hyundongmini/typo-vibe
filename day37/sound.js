// Web Audio for the fridge (no audio files): compressor hum, expiry alarm, the static
// crackle when a feed is killed, and the door. Off until the viewer turns it on.
window.Sound = (() => {
  let ac = null, master = null, noise = null, hum = null;
  let isOn = false;

  function ensure() {
    if (ac) return true;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    ac = new Ctx();
    master = ac.createGain();
    master.gain.value = 0.5;
    master.connect(ac.destination);
    noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  function noiseSource(loop) {
    const src = ac.createBufferSource();
    src.buffer = noise;
    src.loop = !!loop;
    return src;
  }

  // Compressor: a 50 Hz drone with its harmonic, plus a low rumble that slowly breathes
  function startHum() {
    if (hum) return;
    const out = ac.createGain();
    out.gain.value = 0.0;
    out.gain.linearRampToValueAtTime(1, ac.currentTime + 1.2);
    out.connect(master);
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    lp.connect(out);
    const parts = [[50, 'sawtooth', 0.05], [100, 'sine', 0.035]].map(([f, type, vol]) => {
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const g = ac.createGain();
      g.gain.value = vol;
      o.connect(g).connect(lp);
      o.start();
      return o;
    });
    const rumble = noiseSource(true);
    const rlp = ac.createBiquadFilter();
    rlp.type = 'lowpass';
    rlp.frequency.value = 140;
    const rg = ac.createGain();
    rg.gain.value = 0.06;
    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ac.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain).connect(rg.gain);
    rumble.connect(rlp).connect(rg).connect(out);
    rumble.start();
    lfo.start();
    hum = { out, stop: [...parts, rumble, lfo] };
  }

  function stopHum() {
    if (!hum) return;
    hum.stop.forEach(n => n.stop());
    hum.out.disconnect();
    hum = null;
  }

  function beep(t, f, dur, vol) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'square';
    o.frequency.value = f;
    g.gain.setValueAtTime(vol, t);
    g.gain.setValueAtTime(vol, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function burst(t, dur, type, f, vol) {
    const src = noiseSource(false);
    const filter = ac.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = f;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  const SFX = {
    // Two-tone security alarm, three times
    alarm: t => [0, 0.22, 0.44].forEach(at => {
      beep(t + at, 1046, 0.1, 0.06);
      beep(t + at + 0.1, 784, 0.1, 0.06);
    }),
    // 치직: a crackle of static, then the tube's high whine dying
    off: t => {
      burst(t, 0.35, 'bandpass', 2400, 0.35);
      burst(t + 0.05, 0.25, 'highpass', 5000, 0.2);
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.frequency.setValueAtTime(9000, t + 0.3);
      o.frequency.exponentialRampToValueAtTime(1200, t + 0.7);
      g.gain.setValueAtTime(0.03, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
      o.connect(g).connect(master);
      o.start(t + 0.3);
      o.stop(t + 0.8);
    },
    // Door seal unsticking, then the thump of it closing
    doorOpen: t => burst(t, 0.3, 'lowpass', 900, 0.4),
    doorClose: t => {
      burst(t, 0.12, 'lowpass', 300, 0.6);
      beep(t, 70, 0.12, 0.08);
    },
  };

  function sfx(name) {
    if (!isOn || !ensure()) return;
    SFX[name](ac.currentTime + 0.01);
  }

  function toggle() {
    if (!ensure()) return false;
    isOn = !isOn;
    if (isOn) {
      if (ac.state === 'suspended') ac.resume();
      startHum();
    } else {
      stopHum();
    }
    return isOn;
  }

  return { sfx, toggle, isOn: () => isOn };
})();
