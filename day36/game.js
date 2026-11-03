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
    walletOpen: $('#wallet-open'),
    walletHint: $('#wallet-hint'),
    slotCards: [...document.querySelectorAll('.slot-card')],
    cardTip: $('#card-tip'),
    kioskOpen: $('#kiosk-open'),
    kioskTitle: $('#kiosk-title'),
    kioskScreen: $('#kiosk-screen'),
    kioskPad: $('#kiosk-pad'),
    kioskSlot: $('#kiosk-slot'),
    kioskHint: $('#kiosk-hint'),
    kioskItems: [...document.querySelectorAll('.kiosk-item')],
    charge: $('#charge'),
    resetView: $('#reset-view'),
    turnLeft: $('#turn-left'),
    webcam: $('#webcam'),
    outfit: $('#outfit'),
    webcamNote: $('#webcam-note'),
    turnRight: $('#turn-right'),
    hint: $('#hint'),
    modal: $('#modal'),
    modalLine: $('#modal-line'),
    modalTitle: $('#modal-title'),
    modalText: $('#modal-text'),
    modalList: $('#modal-list'),
    modalPhotos: $('#modal-photos'),
    flash: $('#flash'),
    polaroid: $('#polaroid'),
    modalBtn: $('#modal-btn'),
  };

  const state = {
    gate: 0,
    clock: S.startClock,
    balance: S.startBalance,
    awkwardTotal: 0,
    awkwardHere: 0,
    heat: 0, // slow extra redness while you stay stuck and get shoved
    queue: 0,
    hand: 'card',
    isCharged: false,
    hasSeenShort: false, // the kiosk button shows up only after the reader says the balance is short
    phase: 'intro', // intro | sign | gate | aside | passing | end
    log: [],
    photos: [], // { url, alt, name }
  };

  // Card position is the pointer position plus a decaying shove from the crowd
  const drag = {
    isActive: false,
    pointerId: null,
    x: 0, y: 0,
    pushX: 0, pushY: 0,
    nextPush: 0,
    keySide: null,
    captureEl: null,
    pointerType: null,
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

  function modal({ line, color, title, text, list, photos, button, onClose }) {
    els.modalPhotos.innerHTML = '';
    els.modal.classList.toggle('has-photos', !!(photos && photos.length));
    (photos || []).forEach(photo => {
      const fig = document.createElement('figure');
      const img = document.createElement('img');
      img.src = photo.url;
      img.alt = photo.alt;
      const save = document.createElement('a');
      save.href = photo.url;
      save.download = photo.name;
      save.textContent = UI.savePhoto;
      save.className = 'btn';
      fig.append(img, save);
      els.modalPhotos.appendChild(fig);
    });
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

  // Transfer stops count as passed once you are past the gate before them
  function renderRoute() {
    els.route.innerHTML = '';
    let lastGate = 0;
    S.route.forEach(stop => {
      const reachedAt = stop.gate ?? lastGate + 1;
      if (stop.gate !== undefined) lastGate = stop.gate;
      const li = document.createElement('li');
      li.innerHTML = '<span class="dot"></span><span></span>';
      li.lastChild.textContent = stop.via ? `${stop.name}(${stop.via})` : stop.name;
      if (stop.via) li.classList.add('via');
      const isCurrent = stop.gate === state.gate && state.phase !== 'end' && state.phase !== 'intro';
      const isPassed = state.phase === 'end' || reachedAt < state.gate || (stop.via && reachedAt <= state.gate && state.gate > 0);
      if (isPassed && !isCurrent) li.classList.add('done');
      if (isCurrent) li.setAttribute('aria-current', 'step');
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
    if (isWallet) els.cardTip.textContent = UI.walletTip;
    els.holding.textContent = isWallet ? UI.holdingWallet : UI.holdingCard;
    els.takeOut.hidden = !isWallet;
    els.takeOut.textContent = `${UI.takeOut} (+${S.penalty.takeOut}초)`;
    els.charge.hidden = !g.kiosk || !state.hasSeenShort;
    els.charge.textContent = `${g.kind === 'exit' ? UI.settle : UI.charge} (+${S.penalty.charge}초)`;
    els.charge.disabled = state.isCharged;
    const canAct = state.phase === 'gate';
    els.takeOut.disabled = !canAct;
    if (!isWallet || !canAct) closeWallet();
    if (!canAct) closeKiosk();
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
    drag.y = st.height * 0.9 - ch / 2;
    drag.pushX = drag.pushY = 0;
    applyCard();
  }

  function applyCard() {
    els.card.style.transform = `translate(${drag.x + drag.pushX}px, ${drag.y + drag.pushY}px)`;
  }

  /* ---------- holding the card ---------- */

  // Contact when the card covers the reader's center, like laying a card flat on the pad
  function readerUnderCard() {
    const st = els.stage.getBoundingClientRect();
    const left = st.left + drag.x + drag.pushX, top = st.top + drag.y + drag.pushY;
    const right = left + els.card.offsetWidth, bottom = top + els.card.offsetHeight;
    for (const side of ['left', 'right']) {
      const r = els.readers[side].getBoundingClientRect();
      const rx = r.left + r.width / 2, ry = r.top + r.height / 2;
      if (rx >= left && rx <= right && ry >= top && ry <= bottom) return side;
    }
    return null;
  }

  // Fill a ring on the reader while it reads, so you know to keep holding
  function showProgress(side, ratio) {
    ['left', 'right'].forEach(s => els.readers[s].style.setProperty('--p', s === side ? ratio : 0));
  }

  function setContact(side, now) {
    if (side === drag.contact) return;
    if (side) drag.didTouch = true;
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
    const el = drag.captureEl;
    if (el && drag.pointerId !== null && el.hasPointerCapture(drag.pointerId)) {
      el.releasePointerCapture(drag.pointerId);
    }
    drag.captureEl = null;
    drag.isActive = false;
    drag.pointerId = null;
    drag.keySide = null;
    if (drag.contact) setReader(drag.contact, null);
    World.reach(null);
    drag.contact = null;
    showProgress(null, 0);
    els.card.classList.remove('dragging');
    drag.pushX = drag.pushY = 0;
    // A mouse keeps the card under the cursor; a lifted finger or key sends it back to the hand
    if (drag.pointerType === 'mouse') {
      applyCard();
    } else {
      els.card.classList.add('returning');
      placeCardHome();
    }
    drag.pointerType = null;
  }

  // The card is the cursor: it follows the pointer over the stage, and pressing lays it down
  function cardToPointer(e) {
    const st = els.stage.getBoundingClientRect();
    drag.x = e.clientX - st.left - els.card.offsetWidth / 2;
    drag.y = e.clientY - st.top - els.card.offsetHeight / 2;
    els.card.classList.remove('returning');
    if (!drag.isActive) applyCard();
  }

  els.stage.addEventListener('pointermove', e => {
    if (drag.keySide || (drag.isActive && e.pointerId !== drag.pointerId)) return;
    cardToPointer(e);
  });

  els.stage.addEventListener('pointerdown', e => {
    // Right button is for turning the camera
    if (e.button !== 0 || drag.keySide) return;
    if (World.isCinematic()) return World.skipCinematic();
    if (state.phase !== 'gate' || drag.isActive) return;
    e.preventDefault();
    els.stage.setPointerCapture(e.pointerId);
    drag.captureEl = els.stage;
    drag.pointerType = e.pointerType;
    cardToPointer(e);
    drag.isActive = true;
    drag.pointerId = e.pointerId;
    drag.downAt = performance.now();
    drag.didTouch = false;
    drag.nextPush = performance.now() + (gate().push ? rand(...gate().push.gap) * 1000 : Infinity);
    els.card.classList.add('dragging');
  });

  const release = e => {
    if (!drag.isActive || e.pointerId !== drag.pointerId) return;
    setContact(null, performance.now());
    if (drag.isActive) endHold();
    // A quick click that never touched a reader opens the wallet in your hand
    const isClick = !drag.didTouch && performance.now() - drag.downAt < 350;
    if (isClick && state.hand === 'wallet' && state.phase === 'gate') openWallet();
  };
  els.stage.addEventListener('pointerup', release);
  els.stage.addEventListener('pointercancel', release);
  els.stage.addEventListener('pointerleave', e => {
    if (!drag.isActive && e.pointerType === 'mouse') placeCardHome();
  });

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
    state.heat = Math.min(0.35, state.heat + 0.02);
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
    const key = g.kind === 'enter' ? 'enter' : g.kind === 'exit' ? (g.fare ? 'exitFare' : 'exit') : g.fare ? 'transferFare' : 'transfer';
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
    if (kind === 'balance' && !state.hasSeenShort) {
      state.hasSeenShort = true;
      renderHand();
    }
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
      World.neighborPass(side, p => bubble(pick(S.reactions.neighbor), p));
      Sound.sfx('flapOpen');
      led('idle', 'error', { blink: true });
    } else {
      flashLed(kind, 'error');
      World.bump();
      Sound.sfx('flapBump');
    }
    if (kind !== 'neighbor') bubble(pick(S.reactions[kind]));
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
    }, World.cinemaRemaining() * 1000);
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

  // Redness builds within a gate, creeps up while you stay stuck, and a little carries over
  const blushLevel = () => Math.min(1, state.awkwardHere * 0.28 + state.awkwardTotal * 0.06 + state.heat);

  /* ---------- wallet ---------- */

  const pull = { el: null, startY: 0, isDone: false };

  function openWallet() {
    if (state.phase !== 'gate' || state.hand !== 'wallet' || drag.isActive) return;
    els.slotCards.forEach(c => {
      c.textContent = UI.walletCards[c.dataset.card];
      c.classList.remove('snap');
      c.style.transform = '';
    });
    els.walletHint.textContent = UI.walletHint;
    els.walletOpen.hidden = false;
    els.card.classList.add('away');
    Sound.sfx('walletOpen');
    els.slotCards.find(c => c.dataset.card === 'transit').focus();
  }

  function closeWallet() {
    if (els.walletOpen.hidden) return;
    els.walletOpen.hidden = true;
    els.card.classList.remove('away');
    pull.el = null;
  }

  function snapBack(el) {
    el.classList.add('snap');
    el.style.transform = '';
  }

  function pulledOut(el) {
    pull.isDone = true;
    if (el.dataset.card === 'credit') {
      snapBack(el);
      els.walletHint.textContent = UI.walletWrong;
      return;
    }
    el.classList.add('snap');
    el.style.transform = 'translateY(-150%) rotate(-6deg)';
    Sound.sfx('cardOut');
    setTimeout(() => {
      closeWallet();
      takeOut();
    }, 260);
  }

  els.walletOpen.addEventListener('pointerdown', e => {
    // Keep the stage from treating this as a tap
    e.stopPropagation();
    if (e.target === els.walletOpen) closeWallet();
  });
  els.walletOpen.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeWallet();
  });
  els.slotCards.forEach(el => {
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      el.classList.remove('snap');
      pull.el = el;
      pull.startY = e.clientY;
      pull.isDone = false;
    });
    el.addEventListener('pointermove', e => {
      if (pull.el !== el || pull.isDone) return;
      const dy = Math.min(0, e.clientY - pull.startY);
      el.style.transform = `translateY(${dy}px) rotate(${(dy / el.offsetHeight) * 4}deg)`;
      if (dy < -el.offsetHeight * 0.7) pulledOut(el);
    });
    const letGo = () => {
      if (pull.el !== el) return;
      if (!pull.isDone) snapBack(el);
      pull.el = null;
    };
    el.addEventListener('pointerup', letGo);
    el.addEventListener('pointercancel', letGo);
    // Keyboard (Enter/Space) pulls the card out in one go; pointer clicks have detail > 0
    el.addEventListener('click', e => {
      if (e.detail === 0) pulledOut(el);
    });
  });

  function takeOut() {
    if (state.phase !== 'gate' || state.hand !== 'wallet') return;
    state.hand = 'card';
    state.clock += S.penalty.takeOut;
    renderHand();
    renderHud();
    // Nudge: the card is out, now tap it
    els.cardTip.textContent = UI.cardOutTip;
    els.card.classList.add('tip-on');
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => els.card.classList.remove('tip-on'), 2500);
  }
  let tipTimer = 0;

  /* ---------- kiosk ---------- */

  const kiosk = { step: 'card', item: null, startX: 0, startY: 0 };

  function openKiosk() {
    if (state.phase !== 'gate' || state.isCharged || drag.isActive) return;
    closeWallet();
    kiosk.step = 'card';
    els.kioskTitle.textContent = UI.kioskTitle;
    // The machine first repeats what the gate said, then asks for the card
    els.kioskScreen.textContent = S.led.balance;
    els.kioskScreen.classList.remove('done');
    els.kioskScreen.classList.add('warn');
    els.kioskHint.textContent = '';
    setTimeout(() => {
      if (kiosk.step !== 'card' || els.kioskOpen.hidden) return;
      els.kioskScreen.classList.remove('warn');
      els.kioskScreen.textContent = UI.kioskPlaceCard;
      els.kioskHint.textContent = UI.kioskHintCard;
    }, 1200);
    els.kioskItems.forEach(el => {
      el.textContent = el.dataset.item === 'card' ? UI.kioskCard : UI.kioskBill(S.chargeAmount);
      el.hidden = false;
      el.classList.remove('snap');
      el.style.transform = '';
    });
    els.kioskPad.classList.add('target');
    els.kioskSlot.classList.remove('target');
    els.kioskOpen.hidden = false;
    els.card.classList.add('away');
    els.kioskItems[0].focus();
  }

  function closeKiosk() {
    if (els.kioskOpen.hidden) return;
    els.kioskOpen.hidden = true;
    els.card.classList.remove('away');
    kiosk.item = null;
  }

  // Dropped an item: on its target it goes in, anywhere else it springs back
  function kioskDrop(el, isOnTarget) {
    const isCard = el.dataset.item === 'card';
    if (!isCard && kiosk.step === 'card' && isOnTarget !== false) {
      els.kioskHint.textContent = UI.kioskCardFirst;
      isOnTarget = false;
    }
    if (!isOnTarget) {
      el.classList.add('snap');
      el.style.transform = '';
      return;
    }
    el.hidden = true;
    el.style.transform = '';
    if (isCard) {
      // The card now lies on the pad and the screen reads it
      kiosk.step = 'bill';
      els.kioskPad.textContent = UI.kioskCard;
      els.kioskPad.classList.remove('target');
      els.kioskSlot.classList.add('target');
      els.kioskScreen.textContent = UI.kioskShort(state.balance, gate().fare);
      els.kioskHint.textContent = UI.kioskHintBill;
      Sound.sfx('ok');
      els.kioskItems[1].focus();
      return;
    }
    kiosk.step = 'done';
    els.kioskSlot.classList.remove('target');
    Sound.sfx('billIn');
    setTimeout(() => {
      els.kioskScreen.textContent = UI.kioskDone(state.balance + S.chargeAmount);
      els.kioskScreen.classList.add('done');
      els.kioskHint.textContent = '';
    }, 500);
    setTimeout(() => {
      els.kioskPad.textContent = '';
      closeKiosk();
      charge();
    }, 1500);
  }

  const kioskTarget = el => (el.dataset.item === 'card' ? els.kioskPad : els.kioskSlot);
  const isInside = (e, box) => {
    const r = box.getBoundingClientRect();
    const pad = 16;
    return e.clientX > r.left - pad && e.clientX < r.right + pad && e.clientY > r.top - pad && e.clientY < r.bottom + pad;
  };

  els.kioskOpen.addEventListener('pointerdown', e => {
    // Keep the stage from treating this as a tap
    e.stopPropagation();
    if (e.target === els.kioskOpen && kiosk.step !== 'done') closeKiosk();
  });
  els.kioskOpen.addEventListener('keydown', e => {
    if (e.key === 'Escape' && kiosk.step !== 'done') closeKiosk();
  });
  els.kioskItems.forEach(el => {
    el.addEventListener('pointerdown', e => {
      if (kiosk.step === 'done') return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      el.classList.remove('snap');
      kiosk.item = el;
      kiosk.startX = e.clientX;
      kiosk.startY = e.clientY;
    });
    el.addEventListener('pointermove', e => {
      if (kiosk.item !== el) return;
      el.style.transform = `translate(${e.clientX - kiosk.startX}px, ${e.clientY - kiosk.startY}px) rotate(-4deg)`;
    });
    el.addEventListener('pointerup', e => {
      if (kiosk.item !== el) return;
      kiosk.item = null;
      kioskDrop(el, isInside(e, kioskTarget(el)));
    });
    el.addEventListener('pointercancel', () => {
      if (kiosk.item !== el) return;
      kiosk.item = null;
      kioskDrop(el, false);
    });
    // Keyboard (Enter/Space) puts the item in directly; pointer clicks have detail > 0
    el.addEventListener('click', e => {
      if (e.detail === 0 && kiosk.step !== 'done') kioskDrop(el, true);
    });
  });

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
      heat: 0,
      hand: 'card',
      isCharged: false,
      hasSeenShort: false,
      log: [],
      photos: [],
    });
    Sound.startAmbience();
    // Your own face is the default; the first game asks for the camera, later ones keep your choice
    if (!hasAskedCamera) {
      hasAskedCamera = true;
      startWebcam();
    }
    showSign();
  }

  function showSign() {
    const g = gate();
    state.phase = 'sign';
    state.clock += g.travel * 60;
    state.awkwardHere = 0;
    state.heat *= 0.4;
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
      photos: state.photos,
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
      // Standing there stuck slowly makes it worse
      if (state.awkwardHere > 0) state.heat = Math.min(0.35, state.heat + dt * 0.012);
      World.setBlush(blushLevel());
    }
    if (drag.isActive && state.phase === 'gate') {
      crowdPush(now);
      const k = Math.exp(-dt / PUSH_DECAY);
      drag.pushX *= k;
      drag.pushY *= k;
      applyCard();
      const side = drag.keySide || readerUnderCard();
      setContact(side, now);
      if (drag.contact) {
        const ratio = (now - drag.contactSince) / 1000 / gate().read;
        showProgress(drag.contact, Math.min(1, ratio));
        if (ratio >= 1) resolve(drag.contact);
      }
    }
    requestAnimationFrame(tick);
  }

  /* ---------- ride photos ---------- */

  // Frame a captured close-up like an amusement-park ride photo
  function ridePhoto(shot, info) {
    const c = document.createElement('canvas');
    c.width = 800;
    c.height = 640;
    const g = c.getContext('2d');
    g.fillStyle = '#141414';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#ffd400';
    g.fillRect(0, 0, c.width, 64);
    g.fillStyle = '#111';
    g.font = '900 30px Pretendard, sans-serif';
    g.textBaseline = 'middle';
    g.fillText(UI.photoBrand, 24, 33);
    g.textAlign = 'right';
    g.font = '700 18px Pretendard, sans-serif';
    g.fillText(UI.photoTagline, c.width - 24, 33);
    g.textAlign = 'left';
    g.fillStyle = '#fff';
    g.fillRect(20, 80, 760, 507);
    g.drawImage(shot, 26, 86, 748, 495);
    // Bottom strip: photo number, where and when, what went wrong
    g.fillStyle = '#ffd400';
    g.font = '24px Galmuri11, monospace';
    g.fillText(`No.${String(info.number).padStart(2, '0')}`, 24, 614);
    g.fillStyle = '#fff';
    g.font = '700 20px Pretendard, sans-serif';
    g.fillText(`${info.station} · ${info.time}`, 150, 614);
    g.textAlign = 'right';
    g.fillStyle = '#ff5a4a';
    g.font = '800 20px Pretendard, sans-serif';
    g.fillText(info.what, c.width - 24, 614);
    // Rotated sticker in the lower-left corner, clear of the pop-up word over your head
    g.save();
    g.translate(118, 530);
    g.rotate(-0.15);
    g.fillStyle = '#e8262b';
    g.beginPath();
    g.ellipse(0, 0, 78, 40, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.font = '900 36px Pretendard, sans-serif';
    g.fillText(UI.photoSticker, 0, 2);
    g.restore();
    return c.toDataURL('image/jpeg', 0.9);
  }

  function onPhoto(shot, kind) {
    if (state.photos.length >= S.maxPhotos) return;
    const g = gate();
    const number = state.photos.length + 1;
    const info = { number, station: g.station, time: fmtClock(state.clock).slice(0, -3), what: S.failNames[kind] };
    const url = ridePhoto(shot, info);
    state.photos.push({ url, alt: UI.photoAlt(info), name: `mussuk-${String(number).padStart(2, '0')}.jpg` });
    Sound.sfx('shutter');
    retriggerClass(els.flash, 'on');
    els.polaroid.src = url;
    retriggerClass(els.polaroid, 'on');
  }

  function retriggerClass(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  /* ---------- webcam face ---------- */

  let webcamStream = null;
  let hasAskedCamera = false;

  function toggleWebcam() {
    if (!webcamStream) return startWebcam();
    webcamStream.getTracks().forEach(t => t.stop());
    webcamStream = null;
    if (window.FaceTrack) FaceTrack.stop();
    World.setPlayerVideo(null);
    els.webcam.textContent = UI.webcamOn;
    els.webcam.setAttribute('aria-pressed', 'false');
    els.webcamNote.textContent = '';
  }

  async function startWebcam() {
    if (webcamStream) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      els.webcamNote.textContent = UI.webcamUnsupported;
      return;
    }
    try {
      webcamStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 480, height: 360 }, audio: false });
    } catch (err) {
      console.error('Webcam unavailable', err);
      els.webcamNote.textContent = err.name === 'NotAllowedError' ? UI.webcamDenied : UI.webcamFailed;
      return;
    }
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = webcamStream;
    await video.play();
    World.setPlayerVideo(video);
    els.webcam.textContent = UI.webcamOff;
    els.webcam.setAttribute('aria-pressed', 'true');
    // Zoom onto the face once the detector loads; without it the center of the frame is shown
    if (!window.FaceTrack) {
      els.webcamNote.textContent = UI.faceTrackFailed;
      return;
    }
    try {
      await FaceTrack.start(video, box => World.setFaceBox(box));
    } catch (err) {
      console.error('Face detection unavailable', err);
      els.webcamNote.textContent = UI.faceTrackFailed;
    }
  }

  /* ---------- outfit ---------- */

  const OUTFITS = ['catTote', 'catBackpack', 'coat'];
  const OUTFIT_KEY = 'typo-vibe-day36-outfit';
  let outfit = OUTFITS[0];

  function setOutfit(name) {
    outfit = OUTFITS.includes(name) ? name : OUTFITS[0];
    World.setOutfit(outfit);
    els.outfit.textContent = UI.outfits[outfit];
    els.outfit.setAttribute('aria-label', UI.outfitLabel(UI.outfits[outfit]));
    try {
      localStorage.setItem(OUTFIT_KEY, outfit);
    } catch {
      // Storage may be blocked (private mode); the outfit still applies for this visit
    }
  }

  function savedOutfit() {
    try {
      return localStorage.getItem(OUTFIT_KEY);
    } catch {
      return null;
    }
  }

  /* ---------- wiring ---------- */

  els.takeOut.addEventListener('click', openWallet);
  els.outfit.addEventListener('click', () => {
    const i = OUTFITS.indexOf(outfit);
    setOutfit(OUTFITS[(i + 1) % OUTFITS.length]);
  });
  els.resetView.addEventListener('click', () => World.resetView());
  els.turnLeft.addEventListener('click', () => World.turnView(-0.5));
  els.webcam.textContent = UI.webcamOn;
  els.webcam.addEventListener('click', toggleWebcam);
  els.turnRight.addEventListener('click', () => World.turnView(0.5));
  els.charge.addEventListener('click', openKiosk);
  els.sound.setAttribute('aria-pressed', String(Sound.isEnabled()));
  els.sound.addEventListener('click', () => els.sound.setAttribute('aria-pressed', String(Sound.toggle())));
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
    World.onPhoto = onPhoto;
    setOutfit(savedOutfit());
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
