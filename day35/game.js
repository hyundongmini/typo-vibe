// Game flow: each night several candidates line up at the hole.
// Peeking at a part of someone costs a candle; text clues say what Thisbe
// looks like. Pick the real Thisbe among them.
(() => {
  const S = window.STORY;
  const UI = S.ui;
  const $ = sel => document.querySelector(sel);
  const TRAIT_KEYS = Object.keys(S.traits);
  const SILHOUETTES = ['veil', 'scarf', 'cap'];
  const CAPTION_LINES = 40;

  const els = {
    canvas: $('#scene'),
    sceneBox: $('#scene-box'),
    caption: $('#caption'),
    clues: $('#clues'),
    nightName: $('#night-name'),
    hearts: $('#hearts'),
    candles: $('#candles'),
    nights: $('#nights'),
    people: $('#people'),
    probes: [...document.querySelectorAll('[data-probe]')],
    accuse: $('#accuse'),
    sound: $('#sound'),
    modal: $('#modal'),
    modalTitle: $('#modal-title'),
    modalMark: $('#modal-mark'),
    modalText: $('#modal-text'),
    modalList: $('#modal-list'),
    modalBtn: $('#modal-btn'),
  };

  const state = {
    night: 0,
    hearts: S.maxHearts,
    thisbe: null,
    clueOrder: [],
    candidates: [],
    selected: 0,
    view: 'idle',
    candles: 0,
    seen: new Set(),
    // Player's notes: `${clueKey}:${candidateIndex}` -> 'o' | 'x'
    marks: new Map(),
    results: [],
    phase: 'intro',
  };

  let onModalClose = null;

  /* ---------- helpers ---------- */

  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = arr => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const valuesOf = key => Object.keys(S.traits[key].values);
  const nightCfg = () => S.nights[state.night];
  const knownClues = () => state.clueOrder.slice(0, nightCfg().clues);
  const current = () => state.candidates[state.selected];

  // Knock rhythm as dots: one dot per knock, a wider gap per pause
  function knockSvg(pattern) {
    let x = 0;
    const dots = [];
    [...pattern].forEach(ch => {
      if (ch === 'o') dots.push(`<circle cx="${x + 2}" cy="2" r="1.6"/>`);
      x += ch === 'o' ? 4 : 3;
    });
    return `<svg viewBox="0 0 ${x} 4" height="8" fill="currentColor" aria-hidden="true">${dots.join('')}</svg>`;
  }

  function knockTimes(pattern) {
    const times = [];
    let t = 0;
    [...pattern].forEach(ch => {
      if (ch === 'o') times.push(t);
      t += ch === 'o' ? S.knockBeat : S.knockRest;
    });
    return times;
  }

  function knock(c) {
    const times = knockTimes(c.knock.pattern);
    Sound.knock(times);
    Scene.knock(times);
  }

  function say(text, className) {
    els.caption.querySelectorAll('.latest').forEach(p => p.classList.remove('latest'));
    const p = document.createElement('p');
    p.textContent = text;
    p.className = `latest ${className || ''}`;
    els.caption.appendChild(p);
    while (els.caption.children.length > CAPTION_LINES) els.caption.firstChild.remove();
    els.caption.scrollTop = els.caption.scrollHeight;
  }

  // Lines added in the same action stay highlighted together
  function sayGroup(lines) {
    els.caption.querySelectorAll('.latest').forEach(p => p.classList.remove('latest'));
    lines.forEach(([text, cls]) => {
      const p = document.createElement('p');
      p.textContent = text;
      p.className = `latest ${cls || ''}`;
      els.caption.appendChild(p);
    });
    els.caption.scrollTop = els.caption.scrollHeight;
  }

  function modal({ title, mark = '', markClass = '', text = '', list = [], button, onClose }) {
    els.modalTitle.textContent = title;
    els.modalMark.textContent = mark;
    els.modalMark.className = `modal-mark ${markClass}`;
    els.modalText.textContent = text;
    els.modalList.innerHTML = '';
    list.forEach(({ icon, who, note, highlight }) => {
      const li = document.createElement('li');
      if (highlight) li.className = 'is-thisbe';
      li.innerHTML = icon || '';
      const w = document.createElement('span');
      w.className = 'who';
      w.textContent = who;
      li.appendChild(w);
      if (note) {
        const n = document.createElement('span');
        n.className = 'note';
        n.textContent = note;
        li.appendChild(n);
      }
      els.modalList.appendChild(li);
    });
    els.modalBtn.textContent = button;
    onModalClose = onClose;
    els.modal.showModal();
    els.modalBtn.focus();
  }

  els.modal.addEventListener('close', () => {
    const cb = onModalClose;
    onModalClose = null;
    if (cb) cb();
  });
  els.modalBtn.addEventListener('click', () => els.modal.close());

  /* ---------- generation ---------- */

  function rollThisbe() {
    const traits = {};
    TRAIT_KEYS.forEach(k => (traits[k] = S.traits[k].fixed || pick(valuesOf(k))));
    return traits;
  }

  // First clues cover three different parts so night one is fair
  function rollClueOrder() {
    for (;;) {
      const order = shuffle(TRAIT_KEYS);
      const parts = new Set(order.slice(0, 3).map(k => S.traits[k].part));
      if (parts.size === 3) return order;
    }
  }

  function rollImpostor(known, diffRange) {
    const traits = {};
    TRAIT_KEYS.forEach(k => {
      // Fixed traits (the password) stay matched until clued, so talking alone can't expose impostors
      if (known.includes(k)) traits[k] = state.thisbe[k];
      else traits[k] = S.traits[k].fixed || pick(valuesOf(k));
    });
    const [min, max] = diffRange;
    const count = Math.min(known.length, min + Math.floor(Math.random() * (max - min + 1)));
    shuffle(known).slice(0, count).forEach(k => {
      traits[k] = pick(valuesOf(k).filter(v => v !== state.thisbe[k]));
    });
    return traits;
  }

  const signature = traits => TRAIT_KEYS.map(k => traits[k]).join('|');

  function rollLineup() {
    const cfg = nightCfg();
    const known = knownClues();
    const names = shuffle(S.impostors);
    const list = [{ traits: { ...state.thisbe }, isThisbe: true, name: '티스베' }];
    const used = new Set([signature(state.thisbe)]);
    const rhythmOf = k => (k.pattern.includes('-') ? 'pause' : 'steady');
    const pool = r => S.knocks.filter(k => rhythmOf(k) === r).length;
    const taken = r => list.filter(c => c.traits.rhythm === r).length;
    while (list.length < cfg.people) {
      const traits = rollImpostor(known, cfg.diff);
      const sig = signature(traits);
      // Each person needs a distinct knock of their rhythm
      if (used.has(sig) || taken(traits.rhythm) >= pool(traits.rhythm)) continue;
      used.add(sig);
      list.push({ traits, isThisbe: false, name: names[list.length - 1] });
    }
    if (cfg.lion) Object.assign(list[list.length - 1], { lion: true, name: S.lionName, skin: 0.74 });
    const knocks = shuffle(S.knocks);
    return shuffle(list).map(c => ({
      skin: 0.84 + Math.random() * 0.12,
      silhouette: pick(SILHOUETTES),
      seed: Math.random() * 10,
      ...c,
      knock: knocks.splice(knocks.findIndex(k => rhythmOf(k) === c.traits.rhythm), 1)[0],
    }));
  }

  /* ---------- render ---------- */

  const MARK_CYCLE = { '': 'o', o: 'x', x: '' };
  const MARK_TEXT = { '': '?', o: '○', x: '×' };
  const markOf = (k, i) => state.marks.get(`${k}:${i}`) || '';
  const isRuledOut = i => knownClues().some(k => markOf(k, i) === 'x');

  // Memo board: one row per clue, one cell per candidate the player fills in
  function renderClues() {
    const focusKey = document.activeElement && document.activeElement.dataset.mark;
    const cols = state.candidates.length;
    const inNight = state.phase === 'night';
    els.clues.innerHTML = '';
    els.clues.style.setProperty('--cols', cols);

    const head = document.createElement('div');
    head.className = 'memo-row memo-head';
    head.innerHTML = '<span class="memo-clue"></span>';
    state.candidates.forEach((c, i) => {
      const cell = document.createElement('span');
      cell.className = 'memo-col' + (i === state.selected ? ' is-current' : '');
      cell.innerHTML = knockSvg(c.knock.pattern);
      cell.title = c.knock.name;
      head.appendChild(cell);
    });
    els.clues.appendChild(head);

    const known = knownClues();
    let shown = 0;
    S.nights.slice(0, state.night + 1).forEach((cfg, n) => {
      const keys = known.slice(shown, cfg.clues);
      shown = cfg.clues;
      if (!keys.length) return;
      const h = document.createElement('h3');
      h.textContent = cfg.source;
      els.clues.appendChild(h);
      keys.forEach(k => {
        const row = document.createElement('div');
        row.className = 'memo-row' + (n === state.night && state.night > 0 ? ' new' : '');
        const clue = document.createElement('span');
        clue.className = 'memo-clue';
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = S.parts[S.traits[k].part];
        const text = document.createElement('span');
        text.className = 'clue-text';
        text.textContent = S.traits[k].values[state.thisbe[k]];
        clue.append(tag, text);
        row.appendChild(clue);
        state.candidates.forEach((c, i) => {
          const mark = markOf(k, i);
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `mark mark-${mark || 'none'}` + (i === state.selected ? ' is-current' : '');
          btn.dataset.mark = `${k}:${i}`;
          btn.textContent = MARK_TEXT[mark];
          btn.setAttribute('aria-label', `${c.knock.label} 두드린 사람, ${S.parts[S.traits[k].part]} 단서: ${UI.markNames[mark]}`);
          btn.disabled = !inNight;
          btn.addEventListener('click', () => cycleMark(k, i));
          row.appendChild(btn);
        });
        els.clues.appendChild(row);
      });
    });
    if (focusKey) {
      const again = els.clues.querySelector(`[data-mark="${focusKey}"]`);
      if (again) again.focus();
    }
  }

  function cycleMark(k, i) {
    if (state.phase !== 'night') return;
    const next = MARK_CYCLE[markOf(k, i)];
    next ? state.marks.set(`${k}:${i}`, next) : state.marks.delete(`${k}:${i}`);
    renderStatus();
  }

  function renderPeople() {
    els.people.innerHTML = '';
    state.candidates.forEach((c, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'person';
      btn.setAttribute('aria-pressed', String(i === state.selected));
      const isExcluded = isRuledOut(i);
      if (isExcluded) btn.classList.add('excluded');
      const seenParts = Object.keys(S.parts).filter(p => state.seen.has(`${i}:${p}`));
      btn.innerHTML = `${knockSvg(c.knock.pattern)}<span class="name"></span><span class="seen"></span>`;
      btn.querySelector('.name').textContent = c.knock.name;
      btn.querySelector('.seen').textContent = seenParts.map(p => S.parts[p]).join('·');
      btn.setAttribute('aria-label', `${c.knock.label} 두드린 사람${isExcluded ? ' (제외)' : ''}`);
      btn.disabled = state.phase !== 'night';
      btn.addEventListener('click', () => select(i));
      els.people.appendChild(btn);
    });
  }

  function renderStatus() {
    const inNight = state.phase === 'night';
    const cfg = nightCfg();
    els.nightName.textContent = cfg ? `${cfg.name} (${state.night + 1}/${S.nights.length})` : '';
    els.hearts.textContent = '♥'.repeat(state.hearts) + '♡'.repeat(S.maxHearts - state.hearts);
    els.hearts.setAttribute('aria-label', `사랑 ${state.hearts} / ${S.maxHearts}`);

    els.candles.innerHTML = '';
    const total = state.phase === 'intro' ? 0 : cfg.candles;
    for (let i = 0; i < total; i++) {
      const c = document.createElement('span');
      c.className = 'candle' + (i < state.candles ? '' : ' spent');
      els.candles.appendChild(c);
    }
    els.candles.setAttribute('aria-label', `촛불 ${state.candles} / ${total}`);

    els.nights.innerHTML = '';
    S.nights.forEach((n, i) => {
      const li = document.createElement('li');
      let mark = '□', status = '남음';
      if (i < state.results.length) [mark, status] = state.results[i] ? ['■', '맞힘'] : ['×', '놓침'];
      else if (i === state.night && inNight) [mark, status] = ['▶', '지금'];
      li.textContent = mark;
      li.title = `${n.name}: ${status}`;
      li.setAttribute('aria-label', li.title);
      if (i === state.night && inNight) li.setAttribute('aria-current', 'step');
      els.nights.appendChild(li);
    });

    const known = state.phase === 'intro' ? [] : knownClues();
    els.probes.forEach(btn => {
      const part = btn.dataset.probe;
      const isSeen = state.seen.has(`${state.selected}:${part}`);
      const count = known.filter(k => S.traits[k].part === part).length;
      btn.innerHTML = `${S.parts[part]}<small>${UI.clueCount(count)}</small>`;
      btn.disabled = !inNight || (!isSeen && state.candles <= 0);
      btn.classList.toggle('is-seen', isSeen && state.view === part);
    });
    const who = current();
    els.accuse.disabled = !inNight;
    els.accuse.textContent = UI.accuse(who ? who.knock.name : '');
    renderPeople();
    if (state.phase !== 'intro') renderClues();
  }

  function draw() {
    const c = current();
    Scene.show(c, state.view);
    const part = S.parts[state.view];
    els.canvas.setAttribute('aria-label', part ? `${c.knock.name} 하고 두드린 사람의 ${part}` : `구멍 너머, ${c.knock.name} 하고 두드린 그림자`);
  }

  // Keep pixels crisp: integer scale when there is room, capped by viewport height
  function fitCanvas() {
    const { w, h } = Scene.size;
    const availW = els.sceneBox.clientWidth - 16;
    const availH = Math.max(h * 1.5, window.innerHeight - 190);
    const fit = Math.min(availW / w, availH / h);
    const scale = fit >= 2 ? Math.floor(fit) : fit;
    els.canvas.style.width = `${w * scale}px`;
    els.canvas.style.height = `${h * scale}px`;
  }

  /* ---------- flow ---------- */

  function newGame() {
    state.night = 0;
    state.hearts = S.maxHearts;
    state.results = [];
    state.thisbe = rollThisbe();
    state.clueOrder = rollClueOrder();
    els.caption.innerHTML = '';
    Sound.start();
    startNight();
  }

  function startNight() {
    const cfg = nightCfg();
    state.phase = 'night';
    state.candidates = rollLineup();
    state.selected = 0;
    state.view = 'idle';
    state.candles = cfg.candles;
    state.seen.clear();
    state.marks.clear();
    sayGroup([[`— ${cfg.name} —`, 'heading'], [UI.nightIntro(UI.counts[cfg.people])]]);
    draw();
    knock(current());
    renderStatus();
  }

  function select(i) {
    if (state.phase !== 'night') return;
    state.selected = i;
    state.view = 'idle';
    draw();
    knock(current());
    renderStatus();
  }

  function probe(part) {
    if (state.phase !== 'night') return;
    const key = `${state.selected}:${part}`;
    const isSeen = state.seen.has(key);
    if (!isSeen) {
      if (state.candles <= 0) return;
      state.candles--;
      state.seen.add(key);
      Sound.sfx('peek');
    }
    const c = current();
    const lines = [[UI.peek(c.knock.name, S.parts[part]), 'act']];
    if (part === 'talk') {
      state.view = 'idle';
      if (c.lion) {
        lines.push([S.talk.lion, 'voice']);
      } else {
        c.talkLine = c.talkLine || pick(S.talk.password[c.traits.password]);
        lines.push([S.talk.call[c.traits.call], 'voice'], [S.talk.ask], [c.talkLine, 'voice']);
      }
    } else {
      state.view = part;
    }
    if (!isSeen && state.candles === 0) lines.push([UI.noCandle, 'hint']);
    if (!isSeen || part === 'talk') sayGroup(lines);
    draw();
    renderStatus();
  }

  function mismatchLines(chosen) {
    if (chosen.lion) return UI.lionMismatch;
    const diffs = knownClues().filter(k => chosen.traits[k] !== state.thisbe[k]);
    return [UI.mismatchLead, ...diffs.map(k => `[${S.parts[S.traits[k].part]}] ${S.traits[k].values[state.thisbe[k]]}`)].join('\n');
  }

  function accuse() {
    if (state.phase !== 'night') return;
    const chosen = current();
    const correct = chosen.isThisbe;
    const isLast = state.night === S.nights.length - 1;
    state.results.push(correct);
    if (!correct) state.hearts--;
    state.phase = 'result';
    Sound.sfx(correct ? 'correct' : 'wrong');

    const reaction = correct ? S.reactions.correct : chosen.lion ? S.reactions.lion : S.reactions.wrong(chosen.name);
    sayGroup([[`> ${UI.accuse(chosen.knock.name)}`, 'act'], [reaction]]);
    Scene.showEmpty();
    renderStatus();

    if (isLast) return finish(correct ? 'true' : 'silent');
    if (state.hearts <= 0) return finish('sealed');

    modal({
      title: nightCfg().name,
      mark: correct ? UI.correct : UI.wrong,
      markClass: correct ? 'good' : 'bad',
      text: correct ? reaction : `${reaction}\n\n${mismatchLines(chosen)}`,
      list: state.candidates.map(c => ({
        icon: knockSvg(c.knock.pattern),
        who: `${c.knock.name} — ${c.name}`,
        note: c.isThisbe ? UI.thisbeNote : c === chosen ? UI.chosenNote : '',
        highlight: c.isThisbe,
      })),
      button: UI.next,
      onClose: () => {
        state.night++;
        startNight();
      },
    });
  }

  function finish(kind) {
    state.phase = 'end';
    const ending = S.endings[kind];
    const score = S.endings.score(state.results.filter(Boolean).length, S.nights.length);
    say(`— ${ending.title} —`, 'heading');
    Sound.start(kind, 1.2);
    renderStatus();

    const showModal = () => modal({
      title: ending.title,
      text: `${ending.text}\n\n${score}`,
      button: UI.retry,
      onClose: newGame,
    });

    if (kind === 'sealed') {
      Scene.showSealed();
      return showModal();
    }
    if (kind === 'silent') {
      Scene.showTree(0);
      return showModal();
    }
    // True ending: the white berries slowly turn dark
    Scene.playTree(showModal);
  }

  /* ---------- wiring ---------- */

  els.probes.forEach(btn => btn.addEventListener('click', () => probe(btn.dataset.probe)));
  els.accuse.addEventListener('click', accuse);
  els.sound.setAttribute('aria-pressed', String(Sound.isEnabled()));
  els.sound.addEventListener('click', () => {
    els.sound.setAttribute('aria-pressed', String(Sound.toggle()));
  });

  Scene.init(els.canvas);
  fitCanvas();
  new ResizeObserver(fitCanvas).observe(els.sceneBox);
  window.addEventListener('resize', fitCanvas);
  Scene.showEmpty();
  renderStatus();
  // Index cards embed the page in an iframe: skip the intro dialog so the wall shows
  const isPreview = window.self !== window.top;
  document.documentElement.classList.toggle('preview', isPreview);
  if (!isPreview) modal({ title: S.intro.title, text: S.intro.text, button: UI.start, onClose: newGame });
})();
