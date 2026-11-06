// 어느 귀를 막을까: the cat's ears or your own. Hold a mouse button and that hand's palm
// is sprung toward where the pointer points; the din next door fills two gauges meanwhile.
import * as THREE from 'three';
import { CFG, UI } from './config.js';
import { createWorld } from './world.js';
import { createDrill } from './audio.js';

const $ = s => document.querySelector(s);
const els = {
  canvas: $('#view'),
  intro: $('#intro'),
  introText: $('#intro-text'),
  controls: $('#controls'),
  note: $('#intro-note'),
  start: $('#start'),
  error: $('#start-error'),
  hud: $('#hud'),
  catBar: $('#gauge-cat'),
  earBar: $('#gauge-ear'),
  catLabel: $('#label-cat'),
  earLabel: $('#label-ear'),
  chips: { catL: $('#chip-catL'), catR: $('#chip-catR'), myL: $('#chip-myL'), myR: $('#chip-myR') },
  hint: $('#hint'),
  end: $('#end'),
  endTitle: $('#end-title'),
  endStats: $('#end-stats'),
  again: $('#again'),
};
const isPreview = window.self !== window.top;
const clamp01 = v => Math.min(1, Math.max(0, v));
const smooth = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function fillText() {
  document.title = `${UI.title} — typo-vibe`;
  const lines = (box, list) => {
    box.textContent = '';
    list.forEach(line => {
      const p = document.createElement('p');
      p.textContent = line;
      box.appendChild(p);
    });
  };
  lines(els.introText, UI.intro);
  lines(els.controls, [...UI.controls, UI.touch]);
  els.note.textContent = UI.headphones;
  els.start.textContent = UI.loading;
  els.catLabel.textContent = UI.gauges.cat;
  els.earLabel.textContent = UI.gauges.ear;
  Object.entries(els.chips).forEach(([k, chip]) => (chip.textContent = UI.ears[k]));
  els.hint.textContent = matchMedia('(pointer: coarse)').matches ? UI.touchHint : UI.hint;
  els.again.textContent = UI.again;
}

async function boot() {
  document.documentElement.classList.toggle('preview', isPreview);
  fillText();
  let view;
  try {
    view = createWorld(els.canvas);
  } catch (err) {
    console.error('WebGL is not available', err);
    els.error.textContent = UI.noWebgl;
    return;
  }
  const { camera, cat } = view;

  // The archive's thumbnail only needs the still room and the cat
  if (isPreview) {
    const still = () => {
      cat.update(0, 0, performance.now() / 1000, false);
      view.render();
      requestAnimationFrame(still);
    };
    still();
    return;
  }

  let physics;
  try {
    const RAPIER = (await import('rapier')).default;
    await RAPIER.init();
    const { createPhysics } = await import('./physics.js');
    physics = createPhysics(RAPIER, camera, cat);
  } catch (err) {
    console.error('Could not start the physics engine', err);
    els.error.textContent = UI.loadError;
    return;
  }
  const armMeshes = [view.makeArmMeshes(), view.makeArmMeshes()];

  /* ---------- pointing ---------- */

  const mouse = { ndc: new THREE.Vector2(), buttons: 0 };
  const touches = new Map();
  const toNdc = (e, v) => v.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);

  els.canvas.addEventListener('contextmenu', e => e.preventDefault());
  els.canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    els.canvas.setPointerCapture(e.pointerId);
    if (e.pointerType === 'mouse') {
      mouse.buttons = e.buttons;
      toNdc(e, mouse.ndc);
      return;
    }
    // A finger on the left half drives the left hand, unless that one's already taken
    const taken = new Set([...touches.values()].map(t => t.side));
    let side = e.clientX < innerWidth / 2 ? 0 : 1;
    if (taken.has(side)) side = 1 - side;
    if (taken.has(side)) return;
    touches.set(e.pointerId, { side, ndc: toNdc(e, new THREE.Vector2()) });
  });
  els.canvas.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse') {
      // A second button pressed or let go during a drag only shows up here
      mouse.buttons = e.buttons;
      toNdc(e, mouse.ndc);
    } else if (touches.has(e.pointerId)) {
      toNdc(e, touches.get(e.pointerId).ndc);
    }
  });
  const lift = e => {
    if (e.pointerType === 'mouse') mouse.buttons = e.buttons;
    else touches.delete(e.pointerId);
  };
  els.canvas.addEventListener('pointerup', lift);
  els.canvas.addEventListener('pointercancel', lift);
  addEventListener('blur', () => {
    mouse.buttons = 0;
    touches.clear();
  });

  // Where the pointer points: on the cat if it's over the cat, otherwise in the plane of the
  // cat's head. Near a screen edge it bends round to your own ear on that side.
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane();
  const toCam = new THREE.Vector3();
  function project(ndc) {
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(cat.hitMeshes, false)[0];
    const p = new THREE.Vector3();
    if (hit) {
      p.copy(hit.point).add(toCam.copy(camera.position).sub(hit.point).setLength(0.03));
    } else {
      plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(toCam).negate(), cat.headWorld);
      if (!ray.ray.intersectPlane(plane, p)) p.copy(cat.headWorld);
    }
    const e = smooth(CFG.edge[0], CFG.edge[1], Math.abs(ndc.x));
    if (e > 0) p.lerp(physics.myEarWorld[ndc.x < 0 ? 0 : 1], e);
    return p;
  }

  const mirror = new THREE.Vector2();
  function targets() {
    const t = [null, null];
    touches.forEach(({ side, ndc }) => (t[side] = project(ndc)));
    const isLeft = mouse.buttons & 1, isRight = mouse.buttons & 2;
    if (isLeft && isRight) {
      // Both hands: mirror images of each other across the middle of the screen
      const here = project(mouse.ndc), there = project(mirror.set(-mouse.ndc.x, mouse.ndc.y));
      t[0] = mouse.ndc.x <= 0 ? here : there;
      t[1] = mouse.ndc.x <= 0 ? there : here;
    } else if (isLeft) {
      t[0] = project(mouse.ndc);
    } else if (isRight) {
      t[1] = project(mouse.ndc);
    }
    return t;
  }

  /* ---------- the day ---------- */

  const state = { phase: 'intro', cat: 0, ear: 0, played: 0, hasCovered: false };
  let drill = null;
  let cover = { cat: [false, false], me: [false, false] };

  function gauges(dt, loud) {
    const g = CFG.gauge;
    const nCat = cover.cat.filter(Boolean).length;
    const catHears = loud * (1 - ((1 - g.catCoveredShare) * nCat) / 2);
    state.cat = clamp01(state.cat + catHears * g.catRate * dt - (loud < 0.1 ? g.catRelax * dt : 0));
    const myHear = cover.me.reduce((s, isOn) => s + loud * (isOn ? g.earCoveredShare : 1), 0) / 2;
    state.ear = clamp01(state.ear + myHear * g.earRate * dt);
    if (state.cat >= 1) end(UI.endCat);
    else if (state.ear >= 1) end(UI.endEar);
  }

  function hud() {
    els.catBar.style.transform = `scaleX(${state.cat})`;
    els.earBar.style.transform = `scaleX(${state.ear})`;
    els.chips.catL.classList.toggle('on', cover.cat[0]);
    els.chips.catR.classList.toggle('on', cover.cat[1]);
    els.chips.myL.classList.toggle('on', cover.me[0]);
    els.chips.myR.classList.toggle('on', cover.me[1]);
  }

  function end(title) {
    state.phase = 'end';
    drill.silence();
    els.endTitle.textContent = title;
    els.endStats.textContent = '';
    UI.endStats(Math.round(state.played), Math.round(state.cat * 100), Math.round(state.ear * 100)).forEach(line => {
      const li = document.createElement('li');
      li.textContent = line;
      els.endStats.appendChild(li);
    });
    els.end.hidden = false;
    els.again.focus();
  }

  function play() {
    Object.assign(state, { phase: 'play', cat: 0, ear: 0, played: 0 });
    els.intro.hidden = true;
    els.end.hidden = true;
    els.hud.hidden = false;
  }

  els.start.textContent = UI.start;
  els.start.disabled = false;
  els.start.addEventListener('click', async () => {
    try {
      drill = drill || createDrill();
      await drill.resume();
    } catch (err) {
      console.error('Web Audio could not start', err);
    }
    play();
  });
  els.again.addEventListener('click', () => {
    drill.restart();
    play();
  });

  /* ---------- loop ---------- */

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const camHome = camera.position.clone();
  let last = performance.now(), acc = 0;
  function tick(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const aim = state.phase === 'play' ? targets() : [null, null];
    for (acc += dt; acc >= physics.timestep; acc -= physics.timestep) physics.step(aim);
    physics.sync(armMeshes);
    cover = physics.covered();
    if (drill) {
      drill.setCovered(0, cover.me[0]);
      drill.setCovered(1, cover.me[1]);
    }

    const loud = state.phase === 'play' && drill ? drill.tick(dt) : 0;
    if (state.phase === 'play') {
      state.played += dt;
      gauges(dt, loud);
      if (!state.hasCovered && [...cover.cat, ...cover.me].some(Boolean)) {
        state.hasCovered = true;
        els.hint.classList.add('gone');
      }
    }
    hud();
    cat.update(state.cat, loud, now / 1000, state.phase === 'end' && state.cat >= 1);

    // The whole room buzzes a little with each blow; only the picture moves, not the physics
    const amp = reduceMotion ? 0 : loud * 0.0018;
    camera.position.set(camHome.x + (Math.random() - 0.5) * amp, camHome.y + (Math.random() - 0.5) * amp, camHome.z);
    view.render();
    camera.position.copy(camHome);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

boot();
