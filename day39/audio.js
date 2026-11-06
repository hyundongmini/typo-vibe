// A synthesised jackhammer next door: a loop of hammer blows (the du-du-du) over a motor
// hum, switched on and off in bursts. Each of your ears gets its own channel, so covering
// one low-passes and quietens only that side.
import { CFG } from './config.js';

const rand = (a, b) => a + Math.random() * (b - a);

// One seconds-long loop of blows at a slightly wandering rate
function hammerLoop(ac, seconds) {
  const sr = ac.sampleRate;
  const buf = ac.createBuffer(1, Math.round(sr * seconds), sr);
  const d = buf.getChannelData(0);
  let t = 0;
  while (t < seconds) {
    const start = Math.round(t * sr);
    const hit = rand(0.75, 1);
    for (let i = 0; i < sr * 0.06 && start + i < d.length; i++) {
      const s = i / sr;
      d[start + i] +=
        hit * (
          (Math.random() * 2 - 1) * Math.exp(-s / 0.012) * 0.55 +
          Math.sin(2 * Math.PI * 68 * s) * Math.exp(-s / 0.03) * 0.8 +
          Math.sin(2 * Math.PI * 190 * s) * Math.exp(-s / 0.01) * 0.35
        );
    }
    t += 1 / rand(...CFG.noise.rate);
  }
  return buf;
}

export function createDrill() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ac = new Ctx();
  const gate = ac.createGain();
  gate.gain.value = 0;

  const loop = ac.createBufferSource();
  loop.buffer = hammerLoop(ac, 4);
  loop.loop = true;
  const tone = ac.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 2600;
  loop.connect(tone).connect(gate);

  const motor = ac.createOscillator();
  motor.type = 'sawtooth';
  motor.frequency.value = 96;
  const motorLp = ac.createBiquadFilter();
  motorLp.type = 'lowpass';
  motorLp.frequency.value = 420;
  const motorGain = ac.createGain();
  motorGain.gain.value = 0.12;
  motor.connect(motorLp).connect(motorGain).connect(gate);

  // The shaft is on your right: that side is a little louder
  const merger = ac.createChannelMerger(2);
  const master = ac.createGain();
  master.gain.value = 0.8;
  const ears = [0.8, 1].map((base, ch) => {
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = CFG.muffle.open;
    const g = ac.createGain();
    g.gain.value = base;
    gate.connect(lp).connect(g).connect(merger, 0, ch);
    return { lp, g, base, isCovered: false };
  });
  merger.connect(master).connect(ac.destination);
  loop.start();
  motor.start();

  const state = { on: false, until: 0, level: 0, target: 0, t: 0 };

  return {
    resume: () => ac.resume(),

    // Advances the burst pattern; returns how loud it is right now, 0..1
    tick(dt) {
      state.t += dt;
      if (state.t >= state.until) {
        state.on = !state.on;
        state.until = state.t + rand(...(state.on ? CFG.noise.burst : CFG.noise.rest));
        state.target = state.on ? rand(0.75, 1) : 0;
        gate.gain.setTargetAtTime(state.target, ac.currentTime, state.on ? 0.05 : 0.12);
      }
      state.level += (state.target - state.level) * Math.min(1, dt / (state.on ? 0.05 : 0.12));
      return state.level;
    },

    setCovered(ch, isCovered) {
      const e = ears[ch];
      if (e.isCovered === isCovered) return;
      e.isCovered = isCovered;
      const now = ac.currentTime;
      e.lp.frequency.setTargetAtTime(isCovered ? CFG.muffle.covered : CFG.muffle.open, now, 0.04);
      e.g.gain.setTargetAtTime(e.base * (isCovered ? CFG.muffle.coveredGain : 1), now, 0.04);
    },

    restart() {
      state.on = false;
      state.until = state.t + 1;
      state.target = 0;
      gate.gain.setTargetAtTime(0, ac.currentTime, 0.05);
    },

    silence() {
      state.target = 0;
      state.until = Infinity;
      gate.gain.setTargetAtTime(0, ac.currentTime, 0.2);
    },
  };
}
