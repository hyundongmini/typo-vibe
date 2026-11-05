// One working day of elevator works. You hold the cat's ears on screen (a pointer or F/J
// held down per ear); your own ears are left to your real hands, if you can spare them.
(() => {
  const N = window.NOISE;
  const UI = N.ui;
  const $ = s => document.querySelector(s);
  const svg = $('#scene');
  const els = {
    intro: $('#intro'),
    introText: $('#intro-text'),
    introNote: $('#intro-note'),
    start: $('#start'),
    startError: $('#start-error'),
    end: $('#end'),
    endTitle: $('#end-title'),
    endSub: $('#end-sub'),
    endStats: $('#end-stats'),
    again: $('#again'),
    hint: $('#hint'),
    clock: $('#clock'),
    credit: $('#credit'),
  };

  const SNAP = 120;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // hands[i]: who holds it (a pointer id or a key), where it is, which ear it covers
  const hands = [0, 1].map(() => ({ by: null, x: 0, y: 0, ear: null, since: 0, patience: rand(...N.catPatience), isShaken: false }));
  const state = {
    phase: 'intro', // intro | day | end
    t0: 0,
    burstUntil: 0,
    nextBurst: 0,
    kind: 'drill',
    stress: 0,
    panicFor: 0,
    awayUntil: 0,
    fled: 0,
    loudTime: 0,
    coveredLoud: 0,
    nextWord: 0,
    nextBubble: 0,
    nextPurr: 0,
    hasHeld: false,
    last: performance.now(),
  };

  const sceneReady = Scene.init(svg, UI, N.photo);
  svg.setAttribute('aria-label', UI.sceneLabel);

  /* ---------- holding the cat's ears ---------- */

  const isCatHere = () => performance.now() >= state.awayUntil;

  function render(i) {
    const h = hands[i];
    Scene.setHand(i, h.by === null ? null : { x: h.x, y: h.y }, h.ear);
  }

  function moveHand(i, x, y) {
    const h = hands[i];
    h.x = clamp(x, 60, 940);
    h.y = clamp(y, 90, 680);
    // Close to an ear (and the cat is here): the hand cups it
    let ear = null, best = SNAP;
    if (isCatHere() && !h.isShaken) {
      Scene.EARS.forEach((p, e) => {
        const other = hands[1 - i];
        if (other.ear === e) return;
        const d = Math.hypot(p.x - h.x, p.y - h.y);
        if (d < best) {
          ear = e;
          best = d;
        }
      });
    }
    if (ear !== h.ear) {
      h.ear = ear;
      h.since = performance.now();
      h.patience = rand(...N.catPatience);
      if (ear !== null && !state.hasHeld) {
        state.hasHeld = true;
        els.hint.classList.add('gone');
      }
    }
    if (ear !== null) {
      h.x = Scene.EARS[ear].x;
      h.y = Scene.EARS[ear].y + 10;
    }
    render(i);
  }

  function releaseHand(i) {
    const h = hands[i];
    h.by = null;
    h.ear = null;
    h.isShaken = false;
    render(i);
  }

  // A press picks the hand on that side of the screen, or the other one if that's busy
  svg.addEventListener('pointerdown', e => {
    if (state.phase !== 'day') return;
    e.preventDefault();
    const p = Scene.toSvg(e.clientX, e.clientY);
    let i = p.x < 500 ? 0 : 1;
    if (hands[i].by !== null) i = 1 - i;
    if (hands[i].by !== null) return;
    svg.setPointerCapture(e.pointerId);
    hands[i].by = e.pointerId;
    moveHand(i, p.x, p.y);
  });
  svg.addEventListener('pointermove', e => {
    const i = hands.findIndex(h => h.by === e.pointerId);
    if (i < 0) return;
    const p = Scene.toSvg(e.clientX, e.clientY);
    moveHand(i, p.x, p.y);
  });
  const lift = e => {
    const i = hands.findIndex(h => h.by === e.pointerId);
    if (i >= 0) releaseHand(i);
  };
  svg.addEventListener('pointerup', lift);
  svg.addEventListener('pointercancel', lift);

  // Keyboard: hold F for the left ear, J for the right
  const KEYS = { f: 0, j: 1 };
  document.addEventListener('keydown', e => {
    const i = KEYS[e.key.toLowerCase()];
    if (i === undefined || e.repeat || state.phase !== 'day' || hands[i].by !== null) return;
    hands[i].by = `key-${e.key.toLowerCase()}`;
    moveHand(i, Scene.EARS[i].x, Scene.EARS[i].y);
  });
  document.addEventListener('keyup', e => {
    const i = KEYS[e.key.toLowerCase()];
    if (i !== undefined && hands[i].by === `key-${e.key.toLowerCase()}`) releaseHand(i);
  });

  /* ---------- the day ---------- */

  function pickSound() {
    const total = N.sounds.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * total;
    return N.sounds.findIndex(x => (r -= x.weight) < 0);
  }

  function noiseTick(now, elapsed) {
    if (now < state.burstUntil || now < state.nextBurst) return;
    // No new burst once the working day is over
    if (elapsed >= N.daySeconds) return;
    const i = pickSound();
    const len = Noise.burst(i, rand(...N.burst));
    state.kind = N.sounds[i].kind;
    state.burstUntil = now + len * 1000;
    state.nextBurst = state.burstUntil + rand(...N.rest) * 1000;
  }

  function catTick(now, dt, loud) {
    const here = isCatHere();
    const covered = here ? hands.filter(h => h.ear !== null).length : 0;
    const hearing = loud * (1 - N.muffle * covered);
    state.loudTime += loud * dt;
    state.coveredLoud += loud * dt * (covered / 2);

    if (!here) {
      Scene.setAway(true);
      Noise.setPurr(false);
      // Coming back a little calmer
      if (now + dt * 1000 >= state.awayUntil) state.stress = 0.3;
      return;
    }
    Scene.setAway(false);
    // Builds over a few seconds of din, eases off in the quiet
    state.stress = clamp(state.stress + (hearing - 0.22) * dt * (hearing > 0.22 ? 0.35 : 0.5), 0, 1);
    const s = state.stress;
    const purring = covered === 2 && s < 0.3;
    Scene.setCat({
      mood: purring ? 'calm' : s < 0.3 ? 'grumpy' : s < 0.7 ? 'alarmed' : 'panic',
      flat: clamp((s - 0.25) / 0.5, 0, 1),
      puff: clamp((s - 0.65) / 0.3, 0, 1),
    });
    Noise.setPurr(purring);
    if (purring && now >= state.nextPurr) {
      state.nextPurr = now + 1300;
      Scene.word('purr', pick(N.words.purr), 0.4);
    }
    if (covered < 2 && loud > 0.4 && s > 0.45 && now >= state.nextBubble) {
      state.nextBubble = now + 3200;
      Scene.bubble(pick(N.lines.catUpset));
    }

    // At its wits' end for too long, the cat bolts under the bed
    state.panicFor = s > 0.95 ? state.panicFor + dt : 0;
    if (state.panicFor > N.panicToFlee) {
      state.panicFor = 0;
      state.fled++;
      state.awayUntil = now + rand(...N.awaySeconds) * 1000;
      Scene.word('flee', N.words.flee, 1);
      Scene.bubble(UI.away);
      hands.forEach(h => {
        h.ear = null;
      });
      hands.forEach((_, i) => render(i));
      return;
    }

    // Held too long while it's quiet: it shakes your hand off
    hands.forEach((h, i) => {
      if (h.ear !== null && loud < 0.3 && now - h.since > h.patience * 1000) {
        Scene.catShake();
        Scene.bubble(pick(N.lines.shakeOff));
        h.ear = null;
        h.isShaken = true;
        h.y += 90;
        render(i);
      }
    });
  }

  function wordsTick(now, loud) {
    if (loud < 0.12 || now < state.nextWord) return;
    state.nextWord = now + (0.55 - 0.4 * loud) * 1000;
    Scene.word(state.kind, pick(N.words[state.kind]), loud);
  }

  function setClock(elapsed) {
    const [h0, h1] = N.dayHours;
    const hours = h0 + (h1 - h0) * clamp(elapsed / N.daySeconds, 0, 1);
    els.clock.textContent = UI.clock(Math.floor(hours), Math.floor((hours % 1) * 60 / 10) * 10);
  }

  function endDay() {
    state.phase = 'end';
    hands.forEach((_, i) => releaseHand(i));
    Noise.setPurr(false);
    const pct = state.loudTime > 0 ? Math.round((state.coveredLoud / state.loudTime) * 100) : 0;
    els.endStats.innerHTML = '';
    [UI.stats.covered(pct), UI.stats.fled(state.fled)].forEach(line => {
      const li = document.createElement('li');
      li.textContent = line;
      els.endStats.appendChild(li);
    });
    const you = document.createElement('li');
    you.className = 'you';
    you.textContent = UI.stats.you;
    els.endStats.appendChild(you);
    els.end.hidden = false;
    els.again.focus();
  }

  function startDay() {
    Object.assign(state, {
      phase: 'day', t0: performance.now(), burstUntil: 0, nextBurst: performance.now() + 1200,
      stress: 0, panicFor: 0, awayUntil: 0, fled: 0, loudTime: 0, coveredLoud: 0, hasHeld: false,
    });
    els.intro.hidden = true;
    els.end.hidden = true;
    els.hint.classList.remove('gone');
  }

  /* ---------- loop ---------- */

  function tick(now) {
    const dt = Math.min((now - state.last) / 1000, 0.1);
    state.last = now;
    const loud = Noise.loudness();
    if (state.phase === 'day') {
      const elapsed = (now - state.t0) / 1000;
      setClock(elapsed);
      noiseTick(now, elapsed);
      catTick(now, dt, loud);
      wordsTick(now, loud);
      if (elapsed >= N.daySeconds && now >= state.burstUntil) endDay();
    }
    Scene.frame(dt, now, loud);
    requestAnimationFrame(tick);
  }

  /* ---------- boot ---------- */

  els.introText.innerHTML = '';
  UI.intro.forEach(line => {
    const p = document.createElement('p');
    p.textContent = line;
    els.introText.appendChild(p);
  });
  els.introNote.textContent = UI.speakerNote;
  els.start.textContent = UI.start;
  els.endTitle.textContent = UI.endTitle;
  els.endSub.textContent = UI.endSub;
  els.again.textContent = UI.again;
  els.hint.innerHTML = '';
  [UI.hold, UI.keys].forEach((line, i) => {
    const span = document.createElement('span');
    span.textContent = line;
    if (i) span.className = 'keys';
    els.hint.appendChild(span);
  });
  els.credit.textContent = N.credit;
  els.credit.href = N.creditUrl;
  document.documentElement.classList.toggle('preview', window.self !== window.top);
  setClock(0);

  let isLoaded = false;
  els.start.addEventListener('click', async () => {
    if (!isLoaded) {
      els.start.disabled = true;
      els.startError.textContent = '';
      try {
        await Promise.all([Noise.load(N.sounds), sceneReady]);
        isLoaded = true;
      } catch (err) {
        console.error('Could not load the sounds or the photo', err);
        els.startError.textContent = '소리를 불러오지 못했어요. 새로고침해 주세요.';
        els.start.disabled = false;
        return;
      }
      els.start.disabled = false;
    }
    startDay();
  });
  els.again.addEventListener('click', startDay);
  requestAnimationFrame(tick);
})();
