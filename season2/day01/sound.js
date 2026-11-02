// Procedural chiptune BGM + SFX with Web Audio (no audio files).
// Melody uses D Hijaz (D Eb F# G A Bb C) over a maqsum darbuka pattern.
window.Sound = (() => {
  const BPM = 78;
  const STEP = 60 / BPM / 4;
  const LOOKAHEAD = 0.12;
  const STORAGE_KEY = 'typo-vibe-s2-day01-sound';

  // 0 = rest; MIDI note numbers, 16 steps per bar, 4 bars
  const MELODY = [
    62, 0, 63, 0, 66, 0, 67, 66, 63, 0, 62, 0, 0, 0, 0, 0,
    69, 0, 70, 69, 67, 0, 66, 0, 67, 66, 63, 0, 62, 0, 0, 0,
    74, 0, 72, 70, 69, 0, 70, 69, 67, 0, 66, 67, 69, 0, 0, 0,
    70, 69, 67, 66, 63, 0, 66, 63, 62, 0, 0, 0, 57, 0, 0, 0,
  ];
  const BASS = [38, 38, 43, 45];
  const DUM = new Set([0, 8]);
  const TEK = new Set([2, 6, 12]);

  let ac = null, master = null, echo = null, noise = null;
  let enabled = readPref();
  let running = false, timer = null, step = 0, nextTime = 0;

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
    if (ac) return;
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain();
    master.gain.value = 0.6;
    master.connect(ac.destination);

    // Feedback delay for a cavernous, behind-the-wall feel
    echo = ac.createDelay(1);
    echo.delayTime.value = STEP * 3;
    const fb = ac.createGain();
    fb.gain.value = 0.32;
    const wet = ac.createGain();
    wet.gain.value = 0.3;
    echo.connect(fb).connect(echo);
    echo.connect(wet).connect(master);

    noise = ac.createBuffer(1, ac.sampleRate * 0.2, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function tone(type, f, t, dur, vol, toEcho = false) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    const lp = ac.createBiquadFilter();
    o.type = type;
    o.frequency.value = f;
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g).connect(master);
    if (toEcho) g.connect(echo);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function dum(t) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.16);
    g.gain.setValueAtTime(0.32, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.22);
  }

  function tek(t) {
    const src = ac.createBufferSource();
    src.buffer = noise;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3200;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.09, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(bp).connect(g).connect(master);
    src.start(t);
    src.stop(t + 0.06);
  }

  function scheduleStep(i, t) {
    const inBar = i % 16;
    const note = MELODY[i % MELODY.length];
    if (note) tone('square', freq(note), t, STEP * 1.8, 0.045, true);
    if (inBar === 0) tone('triangle', freq(BASS[Math.floor(i / 16) % BASS.length]), t, STEP * 14, 0.12);
    if (DUM.has(inBar)) dum(t);
    if (TEK.has(inBar)) tek(t);
  }

  function tick() {
    while (nextTime < ac.currentTime + LOOKAHEAD) {
      scheduleStep(step, nextTime);
      step++;
      nextTime += STEP;
    }
  }

  function start() {
    if (!enabled) return;
    ensureContext();
    if (ac.state === 'suspended') ac.resume();
    if (running) return;
    running = true;
    step = 0;
    nextTime = ac.currentTime + 0.05;
    timer = setInterval(tick, 25);
  }

  function stop() {
    running = false;
    clearInterval(timer);
  }

  const SFX = {
    peek: [[76, 0], [83, 0.05]],
    correct: [[62, 0], [66, 0.09], [69, 0.18], [74, 0.27]],
    wrong: [[63, 0], [62, 0.12], [57, 0.3]],
  };

  function sfx(name) {
    if (!enabled || !ac) return;
    const t = ac.currentTime + 0.01;
    SFX[name].forEach(([n, at]) => tone('square', freq(n), t + at, 0.16, 0.06));
  }

  // Knuckle on stone: a low thud plus a short click, slightly echoed through the wall
  function thud(t) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(80, t + 0.07);
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g).connect(master);
    g.connect(echo);
    o.start(t);
    o.stop(t + 0.12);
    const src = ac.createBufferSource();
    src.buffer = noise;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1100;
    const ng = ac.createGain();
    ng.gain.setValueAtTime(0.25, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    src.connect(bp).connect(ng).connect(master);
    src.start(t);
    src.stop(t + 0.05);
  }

  // times: seconds from now for each knock
  function knock(times) {
    if (!enabled) return;
    ensureContext();
    if (ac.state === 'suspended') ac.resume();
    const t0 = ac.currentTime + 0.02;
    times.forEach(at => thud(t0 + at));
  }

  function toggle() {
    enabled = !enabled;
    writePref();
    enabled ? start() : stop();
    return enabled;
  }

  return { start, stop, sfx, knock, toggle, isEnabled: () => enabled };
})();
