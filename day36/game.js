// Game flow: five gates on the way to work. Drag the card onto your reader
// and keep it there until the beep. Every failure makes the line behind you longer.
(() => {
  const S = window.STORY;
  const UI = S.ui;
  const $ = sel => document.querySelector(sel);
  const MIN_GRAZE = 0.12; // contact shorter than this is just the card passing over
  const PUSH_DECAY = 0.9;

  const els = {
    stage: $('#stage'),
    led: $('#led'),
    fare: $('#fare'),
    world: $('#world'),
    fade: $('#fade'),
    readers: { left: $('[data-reader="left"]'), right: $('[data-reader="right"]') },
    reactions: $('#reactions'),
    queueCount: $('#queue-count'),
    card: $('#card'),
    route: $('#route'),
    clock: $('#clock'),
    balance: $('#balance'),
    awkward: $('#awkward'),
    sound: $('#sound'),
    holding: $('#holding'),
    takeOut: $('#take-out'),
    charge: $('#charge'),
    resetView: $('#reset-view'),
    hint: $('#hint'),
    modal: $('#modal'),
    modalLine: $('#modal-line'),
    modalTitle: $('#modal-title'),
    modalText: $('#modal-text'),
    modalList: $('#modal-list'),
    modalBtn: $('#modal-btn'),
  };

  const state = {
    gate: 0,
    clock: S.startClock,
    balance: S.startBalance,
    awkwardTotal: 0,
    awkwardHere: 0,
    queue: 0,
    hand: 'card',
    isCharged: false,
    phase: 'intro', // intro | sign | gate | aside | passing | end
    log: [],
  };

  // Card position is the pointer position plus a decaying shove from the crowd
  const drag = {
    isActive: false,
    pointerId: null,
    grabX: 0, grabY: 0,
    x: 0, y: 0,
    pushX: 0, pushY: 0,
    nextPush: 0,
    keySide: null,
    contact: null,
    contactSince: 0,
  };

  let onModalClose = null;
  let ledTimer = null;
  let lastLed = null;

  /* ---------- helpers ---------- */

  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const rand = (a, b) => a + Math.random() * (b - a);
  const pad = n => String(n).padStart(2, '0');
  const gate = () => S.gates[state.gate];
  const otherSide = side => (side === 'left' ? 'right' : 'left');

  function fmtClock(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return `${h}:${pad(m)}:${pad(s)}`;
  }

  function led(key, tone, opts) {
    const text = S.led[key] || key;
    lastLed = [text, tone, opts];
    Led.show(text, tone, opts);
  }

  // Briefly show a result, then fall back to the idle prompt if still at the gate
  function flashLed(key, tone) {
    led(key, tone, { blink: true });
    clearTimeout(ledTimer);
    ledTimer = setTimeout(() => {
      if (state.phase === 'gate') led('idle', 'info');
    }, 1600);
  }

  // Speech bubble over someone's head; who: 'player' | 'front' | a person from World | undefined (anyone near the front)
  function bubble(text, who, isNote) {
    const at = World.headScreen(who);
    if (!at) return;
    const b = document.createElement('p');
    b.className = 'bubble' + (isNote ? ' note' : '');
    b.textContent = text;
    b.style.left = `${at.x}px`;
    b.style.top = `${at.y}px`;
    els.reactions.appendChild(b);
    while (els.reactions.children.length > 3) els.reactions.firstChild.remove();
    setTimeout(() => b.remove(), 2500);
  }

  function setReader(side, kind) {
    els.readers[side].className = 'reader' + (kind ? ` ${kind}` : '');
    World.readerState(side, kind);
  }

  function modal({ line, color, title, text, list, button, onClose }) {
    els.modalLine.textContent = line || '';
    if (color) document.documentElement.style.setProperty('--line-color', color);
    els.modalTitle.textContent = title;
    els.modalText.textContent = text;
    els.modalList.innerHTML = '';
    (list || []).forEach(item => {
      const li = document.createElement('li');
      li.textContent = item;
      els.modalList.appendChild(li);
    });
    els.modalBtn.textContent = button;
    onModalClose = onClose;
    els.modal.showModal();
    els.modalBtn.focus();
  }

  els.modalBtn.addEventListener('click', () => els.modal.close());
  els.modal.addEventListener('cancel', e => e.preventDefault());
  els.modal.addEventListener('close', () => {
    const cb = onModalClose;
    onModalClose = null;
    if (cb) cb();
  });

  /* ---------- render ---------- */

  function renderRoute() {
    els.route.innerHTML = '';
    S.gates.forEach((g, i) => {
      const li = document.createElement('li');
      li.innerHTML = '<span class="dot"></span><span></span>';
      li.lastChild.textContent = g.station;
      if (i < state.gate || state.phase === 'end') li.className = 'done';
      if (i === state.gate && state.phase !== 'end' && state.phase !== 'intro') li.setAttribute('aria-current', 'step');
      els.route.appendChild(li);
    });
  }

  function renderHud() {
    els.clock.textContent = fmtClock(state.clock);
    els.clock.classList.toggle('late', state.clock > S.deadline);
    els.balance.textContent = UI.balance(state.balance);
    // Gauge for this gate: fills toward stepping aside
    const gauge = '■'.repeat(state.awkwardHere) + '□'.repeat(S.maxAwkward - state.awkwardHere);
    els.awkward.textContent = `${UI.awkward(state.awkwardTotal)} ${gauge}`;
    els.awkward.setAttribute('aria-label', UI.awkwardLabel(state.awkwardTotal, state.awkwardHere, S.maxAwkward));
  }

  function renderHand() {
    const g = gate();
    const isWallet = state.hand === 'wallet';
    els.card.classList.toggle('wallet', isWallet);
    els.holding.textContent = isWallet ? UI.holdingWallet : UI.holdingCard;
    els.takeOut.hidden = !isWallet;
    els.takeOut.textContent = `${UI.takeOut} (+${S.penalty.takeOut}초)`;
    els.charge.hidden = !g.kiosk;
    els.charge.textContent = `${UI.charge} (+${S.penalty.charge / 60}분)`;
    els.charge.disabled = state.isCharged;
    const canAct = state.phase === 'gate';
    els.takeOut.disabled = !canAct;
    if (g.kiosk && !state.isCharged) els.charge.disabled = !canAct;
  }

  function renderQueue() {
    els.queueCount.textContent = UI.queue(state.queue);
    World.setQueue(state.queue);
  }

  function renderGate() {
    const g = gate();
    document.documentElement.style.setProperty('--line-color', g.color);
    ['left', 'right'].forEach(side => {
      els.readers[side].className = 'reader';
      els.readers[side].setAttribute('aria-label', UI.readerLabel(side, side === g.reader));
    });
    World.setGate(g, state.queue);
    els.fare.textContent = UI.fare(g.kind, g.fare);
    renderHand();
    renderQueue();
  }

  function placeCardHome() {
    const st = els.stage.getBoundingClientRect();
    const cw = els.card.offsetWidth, ch = els.card.offsetHeight;
    drag.x = st.width / 2 - cw / 2;
    drag.y = st.height * 0.83 - ch / 2;
    drag.pushX = drag.pushY = 0;
    applyCard();
  }

  function applyCard() {
    els.card.style.transform = `translate(${drag.x + drag.pushX}px, ${drag.y + drag.pushY}px)`;
  }

  /* ---------- holding the card ---------- */

  function readerUnderCard() {
    const st = els.stage.getBoundingClientRect();
    const cx = st.left + drag.x + drag.pushX + els.card.offsetWidth / 2;
    const cy = st.top + drag.y + drag.pushY + els.card.offsetHeight / 2;
    for (const side of ['left', 'right']) {
      const r = els.readers[side].getBoundingClientRect();
      const dx = cx - (r.left + r.width / 2), dy = cy - (r.top + r.height / 2);
      if (Math.hypot(dx, dy) <= r.width / 2) return side;
    }
    return null;
  }

  function setContact(side, now) {
    if (side === drag.contact) return;
    const prev = drag.contact;
    if (prev) {
      setReader(prev, null);
      World.reach(null);
      const held = (now - drag.contactSince) / 1000;
      // Lifted or slid off before the reader finished: the classic retry.
      // A key press is always deliberate, so any early release counts.
      if (held >= (drag.keySide ? 0 : MIN_GRAZE)) {
        drag.contact = null;
        return fail('retry', prev);
      }
    }
    drag.contact = side;
    drag.contactSince = now;
    if (side) {
      setReader(side, 'contact');
      World.reach(side);
      led('reading', 'info');
    } else if (state.phase === 'gate') {
      led('idle', 'info');
    }
  }

  function endHold() {
    if (drag.pointerId !== null && els.card.hasPointerCapture(drag.pointerId)) {
      els.card.releasePointerCapture(drag.pointerId);
    }
    drag.isActive = false;
    drag.pointerId = null;
    drag.keySide = null;
    if (drag.contact) setReader(drag.contact, null);
    World.reach(null);
    drag.contact = null;
    els.card.classList.remove('dragging');
    els.card.classList.add('returning');
    placeCardHome();
  }

  els.card.addEventListener('pointerdown', e => {
    if (World.isCinematic()) return World.skipCinematic();
    if (state.phase !== 'gate') return;
    e.preventDefault();
    els.card.setPointerCapture(e.pointerId);
    const st = els.stage.getBoundingClientRect();
    drag.isActive = true;
    drag.pointerId = e.pointerId;
    drag.grabX = e.clientX - st.left - drag.x;
    drag.grabY = e.clientY - st.top - drag.y;
    drag.nextPush = performance.now() + (gate().push ? rand(...gate().push.gap) * 1000 : Infinity);
    els.card.classList.remove('returning');
    els.card.classList.add('dragging');
  });

  els.card.addEventListener('pointermove', e => {
    if (!drag.isActive || e.pointerId !== drag.pointerId) return;
    const st = els.stage.getBoundingClientRect();
    drag.x = e.clientX - st.left - drag.grabX;
    drag.y = e.clientY - st.top - drag.grabY;
  });

  const release = e => {
    if (!drag.isActive || e.pointerId !== drag.pointerId) return;
    setContact(null, performance.now());
    if (drag.isActive) endHold();
  };
  els.card.addEventListener('pointerup', release);
  els.card.addEventListener('pointercancel', release);

  // Keyboard: hold Space/Enter on a reader button to hold the card there
  ['left', 'right'].forEach(side => {
    const r = els.readers[side];
    r.addEventListener('keydown', e => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      if (e.repeat || state.phase !== 'gate' || drag.isActive || World.isCinematic()) return;
      drag.isActive = true;
      drag.keySide = side;
      const st = els.stage.getBoundingClientRect();
      const rr = r.getBoundingClientRect();
      drag.x = rr.left - st.left + rr.width / 2 - els.card.offsetWidth / 2;
      drag.y = rr.top - st.top + rr.height / 2 - els.card.offsetHeight / 2;
      els.card.classList.remove('returning');
      setContact(side, performance.now());
    });
    r.addEventListener('keyup', e => {
      if ((e.key !== ' ' && e.key !== 'Enter') || drag.keySide !== side) return;
      setContact(null, performance.now());
      if (drag.isActive) endHold();
    });
    r.addEventListener('click', e => e.preventDefault());
  });

  function crowdPush(now) {
    const push = gate().push;
    if (!push || drag.keySide || now < drag.nextPush) return;
    const w = els.stage.clientWidth;
    // Shoves come from behind, so mostly upward with a sideways wobble
    const angle = -Math.PI / 2 + rand(-1.3, 1.3);
    drag.pushX += Math.cos(angle) * push.force * w;
    drag.pushY += Math.sin(angle) * push.force * w;
    drag.nextPush = now + rand(...push.gap) * 1000;
    Sound.sfx('push');
    World.shove();
    World.react('push');
    if (Math.random() < 0.35) bubble(pick(S.reactions.push), 'player');
  }

  /* ---------- outcomes ---------- */

  function resolve(side) {
    const g = gate();
    endHold();
    if (side !== g.reader) return fail('neighbor', side);
    if (state.hand === 'wallet') return fail('wallet', side);
    if (g.fare > state.balance) return fail('balance', side);
    succeed();
  }

  function succeed() {
    const g = gate();
    state.balance -= g.fare;
    state.phase = 'passing';
    const key = g.kind === 'enter' ? 'enter' : g.kind === 'exit' ? 'exit' : g.fare ? 'transferFare' : 'transfer';
    led(key, 'ok', { blink: true });
    setReader(g.reader, 'ok');
    World.react('ok');
    Sound.sfx('ok');
    Sound.sfx('flapOpen');
    renderHud();
    renderHand();
    World.passMine(() => {
      els.stage.classList.add('fading');
      setTimeout(nextGate, 450);
    });
  }

  function fail(kind, side) {
    const g = gate();
    if (drag.isActive) endHold();
    state.awkwardHere++;
    state.awkwardTotal++;
    state.clock += S.penalty.fail;
    state.queue++;
    state.log.push(`${g.station} — ${S.failNames[kind]}`);
    Sound.sfx('fail');
    setReader(side, 'bad');
    setTimeout(() => setReader(side, null), 900);

    if (kind === 'neighbor') {
      // Your tap opened the next lane and a stranger walked through
      World.neighborPass(side);
      Sound.sfx('flapOpen');
      led('idle', 'error', { blink: true });
    } else {
      flashLed(kind, 'error');
      World.bump();
      Sound.sfx('flapBump');
    }
    bubble(pick(S.reactions[kind]), kind === 'neighbor' ? 'player' : undefined);
    World.setMood(state.awkwardHere);
    World.react(kind);
    World.setBlush(blushLevel());
    renderHud();
    renderQueue();
    // From the second miss on, someone at the back gives up on your lane
    const defector = state.awkwardHere >= 2 ? World.defect() : null;
    if (defector) {
      state.queue--;
      setTimeout(() => bubble(S.reactions.defect, defector), 500);
      renderQueue();
    }

    if (state.awkwardHere >= S.maxAwkward) stepAside();
  }

  function stepAside() {
    state.phase = 'aside';
    state.awkwardHere = 0;
    state.clock += S.penalty.stepAside;
    // Let the close-up of the last blunder finish before walking out of line
    setTimeout(() => {
      bubble(S.reactions.stepAside, 'player', true);
      World.react('aside');
      World.stepAside(2);
    }, World.isCinematic() ? 1500 : 0);
    state.queue = Math.max(0, state.queue - 2);
    els.queueCount.textContent = UI.queue(state.queue);
    setTimeout(() => {
      state.queue = gate().queue;
      World.setMood(0);
      renderQueue();
      renderHud();
    }, 3700);
    setTimeout(() => {
      state.phase = 'gate';
      led('idle', 'info');
      renderHand();
    }, 4100);
    renderHand();
  }

  // Redness builds within a gate and a little carries over from earlier ones
  const blushLevel = () => Math.min(1, state.awkwardHere * 0.3 + state.awkwardTotal * 0.06);

  function takeOut() {
    if (state.phase !== 'gate' || state.hand !== 'wallet') return;
    state.hand = 'card';
    state.clock += S.penalty.takeOut;
    renderHand();
    renderHud();
  }

  function charge() {
    if (state.phase !== 'gate' || state.isCharged) return;
    state.isCharged = true;
    state.balance += S.chargeAmount;
    state.clock += S.penalty.charge;
    Sound.sfx('charge');
    flashLed('charged', 'ok');
    renderHand();
    renderHud();
  }

  /* ---------- flow ---------- */

  function newGame() {
    Object.assign(state, {
      gate: 0,
      clock: S.startClock,
      balance: S.startBalance,
      awkwardTotal: 0,
      hand: 'card',
      isCharged: false,
      log: [],
    });
    Sound.startAmbience();
    showSign();
  }

  function showSign() {
    const g = gate();
    state.phase = 'sign';
    state.clock += g.travel * 60;
    state.awkwardHere = 0;
    state.queue = g.queue;
    if (g.wallet) state.hand = 'wallet';
    els.stage.classList.remove('fading');
    renderGate();
    World.setBlush(blushLevel());
    renderRoute();
    renderHud();
    placeCardHome();
    led('idle', 'info');
    modal({
      line: g.line,
      color: g.color,
      title: g.station,
      text: `${g.intro}\n\n${UI.fare(g.kind, g.fare)} · ${UI.balance(state.balance)}`,
      button: UI.toGate,
      onClose: startGate,
    });
  }

  function startGate() {
    state.phase = 'gate';
    Sound.jingle('chime');
    renderHand();
    renderRoute();
  }

  function nextGate() {
    if (state.gate === S.gates.length - 1) return finish();
    state.gate++;
    showSign();
  }

  function finish() {
    state.phase = 'end';
    const isLate = state.clock > S.deadline;
    const kind = isLate ? 'late' : state.awkwardTotal === 0 ? 'pro' : 'ok';
    const ending = S.endings[kind];
    renderRoute();
    Sound.jingle(kind);
    modal({
      title: ending.title,
      text: `${S.endings.summary(fmtClock(state.clock).slice(0, -3), state.awkwardTotal)}\n\n${ending.text}`,
      list: [S.endings.logTitle + (state.log.length ? '' : ` — ${S.endings.clean}`), ...state.log],
      button: UI.retry,
      onClose: newGame,
    });
  }

  /* ---------- loop ---------- */

  let last = performance.now();
  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    // The close-up is a replay for the player, so the clock waits
    if ((state.phase === 'gate' || state.phase === 'aside') && !World.isCinematic()) {
      state.clock += dt;
      renderHud();
    }
    if (drag.isActive && state.phase === 'gate') {
      crowdPush(now);
      const k = Math.exp(-dt / PUSH_DECAY);
      drag.pushX *= k;
      drag.pushY *= k;
      applyCard();
      const side = drag.keySide || readerUnderCard();
      setContact(side, now);
      if (drag.contact && (now - drag.contactSince) / 1000 >= gate().read) resolve(drag.contact);
    }
    requestAnimationFrame(tick);
  }

  /* ---------- wiring ---------- */

  els.takeOut.addEventListener('click', takeOut);
  els.resetView.addEventListener('click', () => World.resetView());
  els.charge.addEventListener('click', charge);
  els.sound.setAttribute('aria-pressed', String(Sound.isEnabled()));
  els.sound.addEventListener('click', () => els.sound.setAttribute('aria-pressed', String(Sound.toggle())));
  els.hint.textContent = UI.hint;
  window.addEventListener('resize', () => {
    if (!drag.isActive) placeCardHome();
  });

  function boot() {
    // Canvas text in the 3D signs needs the fonts first; don't wait forever on a slow network
    const fonts = Promise.all([
      document.fonts.load('800 40px Pretendard', '역'),
      document.fonts.load('900 30px Pretendard', '나'),
      document.fonts.load('12px Galmuri11', '환승입니다'),
    ]);
    const timeout = new Promise(resolve => setTimeout(resolve, 1500));
    Promise.race([fonts, timeout]).finally(start);
  }

  function start() {
    if (!World.init(els.world)) {
      els.stage.classList.add('no-3d');
      els.hint.textContent = UI.no3d;
      return;
    }
    World.bindReaders(els.readers);
    Led.init(els.led);

    renderGate();
    renderRoute();
    renderHud();
    placeCardHome();
    led('idle', 'info');
    requestAnimationFrame(tick);

    // Index cards embed the page in an iframe: skip the intro dialog
    const isPreview = window.self !== window.top;
    document.documentElement.classList.toggle('preview', isPreview);
    if (!isPreview) modal({ title: S.intro.title, text: S.intro.text, button: UI.start, onClose: newGame });
  }

  // world.js is an ES module and runs after this classic script
  if (window.World) boot();
  else window.addEventListener('world-ready', boot, { once: true });
})();
