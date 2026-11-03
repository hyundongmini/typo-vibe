// Web Audio sound for the ticket gates (no audio files): reader beeps,
// flaps, a station ambience bed, and one short jingle per ending.
window.Sound = (() => {
  const STORAGE_KEY = 'typo-vibe-day36-sound';

  let ac = null, master = null, noise = null, ambience = null;
  let enabled = readPref();
  let wantsAmbience = false;

  function readPref() {
    try {
      return localStorage.getItem(STORAGE_KEY) !== 'off';
    } catch {
      return true;
    }
  }

  function writePref() {
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
    } catch {
      // Storage may be blocked (private mode); the toggle still works for this visit
    }
  }

  const freq = n => 440 * Math.pow(2, (n - 69) / 12);

  function ensureContext() {
    if (ac) return true;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    ac = new Ctx();
    master = ac.createGain();
    master.gain.value = 0.55;
    master.connect(ac.destination);
    noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  function ready() {
    if (!enabled || !ensureContext()) return false;
    if (ac.state === 'suspended') ac.resume();
    return true;
  }

  function tone(type, f, t, dur, vol) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function burst(t, dur, filterType, f, vol) {
    const src = ac.createBufferSource();
    src.buffer = noise;
    const filter = ac.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = f;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  function thud(t, f, vol) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.4, t + 0.12);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.18);
  }

  // [midi note, start offset s, duration s]
  const JINGLES = {
    pro: [[72, 0, 0.14], [76, 0.14, 0.14], [79, 0.28, 0.14], [84, 0.42, 0.5]],
    ok: [[79, 0, 0.35], [72, 0.32, 0.6]],
    late: [[67, 0, 0.3], [63, 0.3, 0.3], [60, 0.6, 0.8]],
    chime: [[76, 0, 0.3], [72, 0.28, 0.45]],
  };

  const SFX = {
    // The real reader beep is a single high square tone
    ok: t => tone('square', 1318, t, 0.14, 0.11),
    fail: t => {
      tone('square', 1760, t, 0.07, 0.1);
      tone('square', 1760, t + 0.11, 0.07, 0.1);
    },
    flapOpen: t => burst(t, 0.22, 'bandpass', 900, 0.25),
    flapBump: t => {
      thud(t, 140, 0.45);
      burst(t, 0.05, 'highpass', 2500, 0.12);
    },
    push: t => thud(t, 90, 0.3),
    charge: t => [0, 0.08, 0.16].forEach((at, i) => tone('square', 1046 + i * 262, t + at, 0.06, 0.06)),
    // Camera shutter: a click and a short mechanical swish
    shutter: t => {
      burst(t, 0.03, 'highpass', 4000, 0.3);
      burst(t + 0.05, 0.08, 'bandpass', 2200, 0.18);
    },
  };

  function sfx(name) {
    if (!ready()) return;
    SFX[name](ac.currentTime + 0.01);
  }

  function jingle(name) {
    if (!ready()) return;
    const t = ac.currentTime + 0.05;
    JINGLES[name].forEach(([n, at, dur]) => tone('triangle', freq(n), t + at, dur, 0.12));
  }

  // Low station rumble: filtered noise with a slow swell, like trains in the next tunnel
  function startAmbience() {
    wantsAmbience = true;
    if (!ready() || ambience) return;
    const src = ac.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    const g = ac.createGain();
    g.gain.value = 0.05;
    const lfo = ac.createOscillator();
    const lfoGain = ac.createGain();
    lfo.frequency.value = 0.08;
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(lp).connect(g).connect(master);
    src.start();
    lfo.start();
    ambience = { src, lfo };
  }

  function stopAmbience() {
    wantsAmbience = false;
    if (!ambience) return;
    ambience.src.stop();
    ambience.lfo.stop();
    ambience = null;
  }

  function toggle() {
    enabled = !enabled;
    writePref();
    if (enabled && wantsAmbience) startAmbience();
    if (!enabled && ambience) {
      ambience.src.stop();
      ambience.lfo.stop();
      ambience = null;
    }
    return enabled;
  }

  return { sfx, jingle, startAmbience, stopAmbience, toggle, isEnabled: () => enabled };
})();
