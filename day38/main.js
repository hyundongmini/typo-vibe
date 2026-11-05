// Two hands, four ears: schedules the construction noise, lets you drag your hands onto
// ears, and works out how stressed you and the cat are. scene.js draws, noise.js plays.
(() => {
  const N = window.NOISE;
  const UI = N.ui;
  const $ = s => document.querySelector(s);
  const svg = $('#scene');
  const hint = $('#hint');

  const SNAP = 58;
  const EAR_NAMES = ['myLeft', 'myRight', 'catLeft', 'catRight'];
  const isCatEar = name => name.startsWith('cat');

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const hands = Scene.REST.map(p => ({ x: p.x, y: p.y, ear: null, since: 0, patience: rand(...N.catPatience), pointer: null }));
  const state = {
    burst: null, // { kind, until, nextWord, nextHit }
    nextBurst: performance.now() + 1500,
    pulse: 0, // hammer blows spike the level, then it falls away
    meStress: 0,
    catStress: 0,
    nextBubble: 0,
    nextPurrWord: 0,
    hasCovered: false,
    last: performance.now(),
  };

  Scene.init(svg, UI);
  svg.setAttribute('aria-label', UI.sceneLabel);

  /* ---------- ears and hands ---------- */

  const coveredBy = name => hands.findIndex(h => h.ear === name);
  const isCovered = name => coveredBy(name) >= 0;

  function place(i) {
    const h = hands[i];
    Scene.setHand(i, h.x, h.y, h.ear);
  }

  function cover(i, ear) {
    const h = hands[i];
    h.ear = ear;
    if (ear) {
      h.x = Scene.EARS[ear].x;
      h.y = Scene.EARS[ear].y;
      h.since = performance.now();
      h.patience = rand(...N.catPatience);
      if (!state.hasCovered) {
        state.hasCovered = true;
        hint.classList.add('gone');
      }
    } else {
      h.x = Scene.REST[i].x;
      h.y = Scene.REST[i].y;
    }
    place(i);
    renderEarButtons();
  }

  // Dragging: a hand follows the pointer and snaps onto the nearest free ear when let go
  Scene.hands.forEach((g, i) => {
    g.addEventListener('pointerdown', e => {
      e.preventDefault();
      Noise.unlock();
      g.setPointerCapture(e.pointerId);
      hands[i].pointer = e.pointerId;
      hands[i].ear = null;
      g.classList.add('dragging');
      renderEarButtons();
    });
    g.addEventListener('pointermove', e => {
      if (hands[i].pointer !== e.pointerId) return;
      const p = Scene.toSvg(e.clientX, e.clientY);
      hands[i].x = clamp(p.x, 300, 700);
      hands[i].y = clamp(p.y, 160, 560);
      place(i);
    });
    const drop = e => {
      if (hands[i].pointer !== e.pointerId) return;
      hands[i].pointer = null;
      g.classList.remove('dragging');
      const h = hands[i];
      let best = null, bestD = SNAP;
      EAR_NAMES.forEach(name => {
        if (isCovered(name)) return;
        const d = Math.hypot(Scene.EARS[name].x - h.x, Scene.EARS[name].y - h.y);
        if (d < bestD) {
          best = name;
          bestD = d;
        }
      });
      cover(i, best);
    };
    g.addEventListener('pointerup', drop);
    g.addEventListener('pointercancel', drop);
  });

  // Keyboard: each ear is a button; it takes the free hand, or the one that's been busy longest
  const earButtons = EAR_NAMES.map(name => {
    const p = Scene.EARS[name];
    const b = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    b.setAttribute('cx', p.x);
    b.setAttribute('cy', p.y);
    b.setAttribute('r', 26);
    b.setAttribute('class', 'ear-button');
    b.setAttribute('tabindex', '0');
    b.setAttribute('role', 'button');
    b.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      Noise.unlock();
      const holder = coveredBy(name);
      if (holder >= 0) return cover(holder, null);
      const free = hands.findIndex(h => !h.ear);
      const i = free >= 0 ? free : hands[0].since < hands[1].since ? 0 : 1;
      cover(i, name);
    });
    svg.appendChild(b);
    return { name, b };
  });

  function renderEarButtons() {
    earButtons.forEach(({ name, b }) => b.setAttribute('aria-label', UI.earButton(UI.ears[name], isCovered(name))));
  }

  document.addEventListener('pointerdown', () => Noise.unlock());

  /* ---------- noise ---------- */

  function startBurst(now) {
    const kinds = Object.entries(N.kinds);
    let r = Math.random() * kinds.reduce((s, [, k]) => s + k.weight, 0);
    const [kind, cfg] = kinds.find(([, k]) => (r -= k.weight) < 0) || kinds[0];
    const dur = rand(...cfg.dur);
    state.burst = { kind, cfg, until: now + dur * 1000, nextWord: now, nextHit: now };
    Noise.start(kind, dur);
  }

  function level(now) {
    const b = state.burst;
    if (!b) return state.pulse * 0.5;
    if (b.kind === 'hammer') return Math.max(0.25, state.pulse);
    // A short swell in and out, so bursts don't start and stop like a switch
    const left = (b.until - now) / 1000;
    return b.cfg.level * clamp(left / 0.3, 0, 1);
  }

  function burstTick(now, myHearing, myMuffle) {
    const b = state.burst;
    if (!b) {
      if (now >= state.nextBurst) startBurst(now);
      return;
    }
    if (now >= b.until) {
      state.burst = null;
      state.nextBurst = now + rand(...N.rest) * 1000;
      return;
    }
    if (b.kind === 'hammer' && now >= b.nextHit) {
      b.nextHit = now + rand(...b.cfg.hitEvery) * 1000;
      state.pulse = 1;
      Noise.blow();
      Scene.blow(myHearing);
      Scene.word(myMuffle > 0.9 ? 'muffled' : 'hammer', pick(myMuffle > 0.9 ? N.words.muffled : N.words.hammer), myHearing);
      return;
    }
    const every = { drill: 0.34, grind: 0.5, motor: 0.7, hammer: Infinity }[b.kind];
    if (now >= b.nextWord) {
      // With both ears covered the words come slower and turn into a dull hum
      const isMuffled = myMuffle > 0.9;
      b.nextWord = now + every * (isMuffled ? 2 : 1) * 1000;
      Scene.word(isMuffled ? 'muffled' : b.kind, pick(isMuffled ? N.words.muffled : N.words[b.kind]), myHearing);
    }
  }

  /* ---------- moods ---------- */

  function moods(now, dt, loud) {
    const myL = isCovered('myLeft'), myR = isCovered('myRight');
    const catL = isCovered('catLeft'), catR = isCovered('catRight');
    const myHearing = loud * (1 - N.muffle.me * (myL + myR));
    const catHearing = loud * (1 - N.muffle.cat * (catL + catR));
    state.meStress = clamp(state.meStress + (myHearing - 0.25) * dt * 0.9, 0, 1);
    state.catStress = clamp(state.catStress + (catHearing - 0.25) * dt * 1.1, 0, 1);

    const me = myL && myR ? 'relieved' : state.meStress < 0.2 ? 'calm' : state.meStress < 0.45 ? 'bothered' : state.meStress < 0.75 ? 'pained' : 'frantic';
    Scene.setMe(me);
    const purring = catL && catR && state.catStress < 0.35;
    const cs = state.catStress;
    Scene.setCat({
      mood: purring ? 'calm' : cs < 0.25 ? 'grumpy' : cs < 0.6 ? 'alarmed' : 'panic',
      flat: clamp((cs - 0.2) / 0.5, 0, 1),
      puff: clamp((cs - 0.6) / 0.35, 0, 1),
    });
    Noise.setPurr(purring);
    if (purring && now >= state.nextPurrWord) {
      state.nextPurrWord = now + 1300;
      Scene.word('purr', pick(N.words.purr), 0.4);
    }

    // Now and then someone says something about it
    if (loud > 0.5 && now >= state.nextBubble) {
      state.nextBubble = now + N.bubbleEvery * 1000;
      const mine = myL + myR, cats = catL + catR;
      if (mine === 1 && cats === 1) Scene.bubble('me', pick(N.lines.half));
      else if (cats === 2 && mine === 0) Scene.bubble('me', pick(N.lines.sacrifice));
      else if (mine >= 1 && cats === 0 && cs > 0.3) Scene.bubble('cat', pick(N.lines.catComplains));
      else if (mine === 0 && cats === 0) Scene.bubble('me', pick(N.lines.nobody));
    }

    // A hand on the cat's ear for too long gets shaken off
    hands.forEach((h, i) => {
      if (h.ear && isCatEar(h.ear) && now - h.since > h.patience * 1000) {
        Scene.catShake();
        Scene.bubble('cat', pick(N.lines.shakeOff));
        cover(i, null);
      }
    });
    Noise.setEars([myL, myR]);
    return { myHearing, myMuffle: (myL + myR) / 2 };
  }

  /* ---------- loop ---------- */

  function tick(now) {
    const dt = Math.min((now - state.last) / 1000, 0.1);
    state.last = now;
    state.pulse *= Math.exp(-dt * 6);
    const loud = level(now);
    const { myHearing, myMuffle } = moods(now, dt, loud);
    burstTick(now, myHearing, myMuffle);
    Scene.frame(dt, now, myHearing, myMuffle);
    requestAnimationFrame(tick);
  }

  hint.textContent = UI.hint;
  document.title = `${UI.title} — typo-vibe`;
  hands.forEach((_, i) => place(i));
  renderEarButtons();
  document.documentElement.classList.toggle('preview', window.self !== window.top);
  requestAnimationFrame(tick);
})();
