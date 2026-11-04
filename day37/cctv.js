// Fridge CCTV wall: runs the fast-forwarded fridge clock, decides what each camera shows,
// and handles the surveillance events (tracking, door, disposal, log).
// render.js draws the feeds; sound.js makes the noises.
(() => {
  const F = window.FRIDGE;
  const UI = F.ui;
  const R = window.CctvRender;
  const $ = s => document.querySelector(s);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const STORAGE_KEY = 'typo-vibe-day37-fridge';

  // Low capture resolution is what makes it read as CCTV
  const LOW = { grid: [176, 132], open: [400, 300] };
  const OFF_SECONDS = 0.8;

  const els = {
    stage: $('#stage'),
    screen: $('#screen'),
    cells: $('#cells'),
    info: $('#info'),
    infoList: $('#info-list'),
    infoClose: $('#info-close'),
    dispose: $('#dispose'),
    signal: $('#signal'),
    signalTitle: $('#signal-title'),
    signalSub: $('#signal-sub'),
    speed: $('#speed'),
    sound: $('#sound'),
    addMine: $('#add-mine'),
    mineFile: $('#mine-file'),
    mineForm: $('#mine-form'),
    minePreview: $('#mine-preview'),
    mineName: $('#mine-name'),
    mineShelf: $('#mine-shelf'),
    mineNote: $('#mine-note'),
    log: $('#log'),
  };
  const screen = els.screen.getContext('2d');

  const state = {
    simHours: 0,
    loopStart: 0,
    startMs: Date.now(),
    speed: F.defaultSpeed,
    // Real-time speed follows the wall clock from this anchor
    anchor: { sim: 0, real: Date.now() },
    restockUntil: 0,
    open: -1,
    door: null, // { from, until }
    nextDoor: performance.now() + 12000,
    lastFrame: 0,
    lastTick: performance.now(),
    lastSave: 0,
  };

  /* ---------- helpers ---------- */

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  // Seeded random so each camera's mold grows in the same places every loop
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pad = n => String(n).padStart(2, '0');
  const simDate = hours => new Date(state.startMs + hours * 3600 * 1000);
  const stamp = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const day = d => `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const shortStamp = d => `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const speedOf = id => F.speeds.find(s => s.id === id) || F.speeds[0];

  /* ---------- cameras ---------- */

  function makeCam(c, i) {
    const r = rng(i * 977 + 13);
    return {
      ...c,
      n: pad(i + 1),
      img: null,
      crop: null,
      // Mold colonies: where they sit in the item's oval, how big, and how late they start
      blobs: Array.from({ length: 22 }, () => {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.85;
        // Each colony is a clump of specks, so it reads as fuzz rather than a bubble
        const specks = Array.from({ length: 22 }, () => {
          const sa = r() * Math.PI * 2, sd = Math.sqrt(r());
          return { dx: Math.cos(sa) * sd, dy: Math.sin(sa) * sd, s: 0.15 + r() * 0.35 };
        });
        return { x: 0.5 + Math.cos(a) * d * 0.5, y: 0.5 + Math.sin(a) * d * 0.5, r: 0.05 + r() * 0.1, start: 1 + r() * 0.5, tone: r(), specks };
      }),
      // Paths for the flies; whether there are any is the config's flies flag
      flyPaths: Array.from({ length: 4 }, () => ({ phase: r() * 10, speed: 0.6 + r() * 0.8, rx: 0.3 + r() * 0.4, ry: 0.2 + r() * 0.3 })),
      jitter: { x: 0, y: 0 },
      stockedAt: 0,
      disposed: false,
      offAt: 0,
      lastStatus: null,
      fliesOn: false,
      el: null,
    };
  }

  const cams = F.cams.map(makeCam);

  // 12 feeds fill a 3 x 4 wall; your own camera makes it 4 x 4 with the spare slots dead
  const layout = () => (cams.length > 12 ? { cols: 4, rows: 4 } : { cols: 3, rows: 4 });

  const ripeness = cam => (state.simHours - cam.stockedAt) / cam.shelfHours;

  function statusOf(cam) {
    if (cam.disposed) return 'disposed';
    const r = ripeness(cam);
    if (cam.unknown && r >= F.watchFrom) return r >= 1.4 ? 'rotten' : 'unknown';
    if (r >= 1.4) return 'rotten';
    if (r >= 1) return 'expired';
    if (r >= F.watchFrom) return 'watch';
    return 'fresh';
  }

  function timeLeft(cam) {
    const left = cam.shelfHours - (state.simHours - cam.stockedAt);
    const hours = Math.floor(Math.abs(left));
    return { isOver: left < 0, d: Math.floor(hours / 24), h: hours % 24 };
  }

  /* ---------- log ---------- */

  function addLog(text, isAlarm) {
    const li = document.createElement('li');
    if (isAlarm) li.className = 'alarm';
    const time = document.createElement('time');
    time.textContent = shortStamp(simDate(state.simHours));
    li.append(time, ` ${text}`);
    els.log.prepend(li);
    while (els.log.children.length > F.maxLog) els.log.lastChild.remove();
  }
  const camLog = (cam, event, isAlarm) => addLog(`CAM${cam.n} ${cam.code} ${event}`, isAlarm);

  /* ---------- cells ---------- */

  function buildCells() {
    const { cols, rows } = layout();
    els.stage.style.setProperty('--aspect', `${(cols * 4) / (rows * 3)}`);
    els.stage.classList.toggle('wide', cols === 4);
    els.cells.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    els.cells.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    els.cells.innerHTML = '';
    for (let i = 0; i < cols * rows; i++) {
      const cam = cams[i];
      const n = pad(i + 1);
      if (!cam) {
        // A spare bay on the wall once your camera makes it 4 x 4: nothing mounted there
        const empty = document.createElement('div');
        empty.className = 'cell empty';
        empty.setAttribute('aria-hidden', 'true');
        els.cells.appendChild(empty);
        continue;
      }
      const cell = document.createElement('button');
      cell.className = 'cell';
      cell.innerHTML = `
        <span class="osd-label"><span>${UI.camera(n)}</span><span>${n}</span></span>
        <span class="osd-rec">${UI.rec}</span>
        <span class="track" hidden><span class="track-tag"></span></span>
        <span class="osd-center"></span>
        <span class="osd-door">${UI.doorOpen}</span>
        <span class="osd-time"></span>
        <span class="osd-extra"></span>`;
      cell.type = 'button';
      cell.addEventListener('click', () => {
        if (cam.disposed || cam.offAt) return;
        if (state.open === i) closeCam(true);
        else openCam(i);
      });
      els.cells.appendChild(cell);
      cam.el = {
        cell,
        track: cell.querySelector('.track'),
        tag: cell.querySelector('.track-tag'),
        center: cell.querySelector('.osd-center'),
        time: cell.querySelector('.osd-time'),
        extra: cell.querySelector('.osd-extra'),
        rec: cell.querySelector('.osd-rec'),
      };
      cam.labelKey = '';
    }
    state.lastFrame = 0;
  }

  function updateOverlay(cam, i, t) {
    const status = statusOf(cam);
    const isRestocking = state.restockUntil > 0;
    const isDead = cam.disposed || cam.offAt > 0;
    const { track, tag, cell } = cam.el;
    const shows = !isRestocking && !isDead && cam.img && status !== 'fresh';
    track.hidden = !shows;
    if (shows) {
      const b = R.boxInFrame(cam);
      // Tracking wobbles a little, as if the detector keeps re-locking
      if (!reduceMotion) {
        cam.jitter.x += ((Math.random() - 0.5) * 0.02 - cam.jitter.x) * 0.5;
        cam.jitter.y += ((Math.random() - 0.5) * 0.02 - cam.jitter.y) * 0.5;
      }
      track.style.left = `${(b.x + cam.jitter.x) * 100}%`;
      track.style.top = `${(b.y + cam.jitter.y) * 100}%`;
      track.style.width = `${b.w * 100}%`;
      track.style.height = `${b.h * 100}%`;
      // Tag sits above the box unless that would run into the camera label at the top
      track.classList.toggle('tag-below', b.y < 0.15 && b.y + b.h < 0.85);
      track.classList.toggle('expired', status === 'expired' || status === 'rotten');
      const { isOver, d, h } = timeLeft(cam);
      tag.textContent = cam.unknown ? UI.tagUnknown(cam.code) : isOver ? UI.tagExpired(cam.code, d, h) : UI.tagLeft(cam.code, d, h);
    }
    cam.el.center.textContent = cam.disposed && !isRestocking ? UI.noTarget : '';
    cam.el.time.textContent = stamp(simDate(state.simHours));
    // REC blinks; a dead feed stops recording
    const recOn = !cam.disposed && (reduceMotion || Math.floor(t * 1.2) % 2 === 0);
    cam.el.rec.style.visibility = recOn ? 'visible' : 'hidden';
    cell.classList.toggle('dead', isDead);
    if (cam.overview) {
      const all = cams.map(statusOf);
      const watch = all.filter(s => s === 'watch' || s === 'unknown').length;
      const expired = all.filter(s => s === 'expired' || s === 'rotten').length;
      cam.el.extra.textContent = isRestocking ? '' : UI.overview(watch, expired);
    }
    // Screen readers get a new label only when the status actually changes
    if (status !== cam.labelKey) {
      cam.labelKey = status;
      const word = status === 'disposed' ? UI.disposedStatus : UI.status[status];
      cell.setAttribute('aria-label', UI.cellLabel(cam.n, cam.name, word));
    }
  }

  // Status changes become log lines; passing the date sets off the alarm
  function checkEvents(cam, i) {
    if (cam.disposed || cam.offAt || state.restockUntil) return;
    const status = statusOf(cam);
    if (cam.lastStatus !== null && status !== cam.lastStatus) {
      if (status === 'watch' || status === 'unknown') camLog(cam, UI.log.watch);
      if (status === 'expired') {
        camLog(cam, UI.log.expired, true);
        Sound.sfx('alarm');
      }
      if (status === 'rotten') camLog(cam, UI.log.rotten, true);
    }
    cam.lastStatus = status;
    const hasFlies = !!cam.flies && ripeness(cam) > 1.15;
    if (hasFlies && !cam.fliesOn) camLog(cam, UI.log.flies, true);
    cam.fliesOn = hasFlies;
  }

  /* ---------- open one camera ---------- */

  function renderInfo() {
    const cam = cams[state.open];
    if (!cam) return;
    const I = UI.info;
    const status = statusOf(cam);
    const { isOver, d, h } = timeLeft(cam);
    const rows = [
      [I.item, cam.name],
      [I.stocked, day(simDate(cam.stockedAt))],
      [I.expiry, cam.unknown ? I.unknownDate : day(simDate(cam.stockedAt + cam.shelfHours))],
      [I.left, cam.unknown ? I.unknownDate : isOver ? I.overTime(d, h) : I.leftTime(d, h)],
      [I.status, status === 'disposed' ? UI.disposedStatus : UI.status[status]],
    ];
    const isAlarm = status !== 'fresh';
    els.infoList.innerHTML = '';
    rows.forEach(([k, v], r) => {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      if (isAlarm && r >= 3) dd.className = 'alarm';
      els.infoList.append(dt, dd);
    });
    els.dispose.disabled = cam.disposed || cam.offAt > 0;
  }

  function openCam(i) {
    state.open = i;
    els.stage.classList.add('has-open');
    cams.forEach((c, j) => c.el.cell.classList.toggle('is-open', j === i));
    els.info.hidden = false;
    renderInfo();
    state.lastFrame = 0;
  }

  function closeCam(shouldFocus) {
    const was = state.open;
    state.open = -1;
    els.stage.classList.remove('has-open');
    cams.forEach(c => c.el.cell.classList.remove('is-open'));
    els.info.hidden = true;
    state.lastFrame = 0;
    if (shouldFocus && cams[was]) cams[was].el.cell.focus();
  }

  // 치직: the feed crackles, collapses to a line like an old tube, and stays dark
  function dispose() {
    const i = state.open;
    const cam = cams[i];
    if (!cam || cam.disposed || cam.offAt) return;
    cam.offAt = performance.now();
    els.dispose.disabled = true;
    Sound.sfx('off');
    camLog(cam, UI.log.disposed, true);
    setTimeout(() => {
      cam.offAt = 0;
      cam.disposed = true;
      if (state.open === i) closeCam(true);
      save();
    }, OFF_SECONDS * 1000 + 300);
  }

  els.infoClose.addEventListener('click', () => closeCam(true));
  els.dispose.addEventListener('click', dispose);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && state.open >= 0) closeCam(true);
  });

  /* ---------- speed, sound ---------- */

  function renderSpeed() {
    els.speed.setAttribute('aria-label', UI.speedLabel);
    els.speed.innerHTML = '';
    F.speeds.forEach(s => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn';
      b.setAttribute('aria-pressed', String(s.id === state.speed));
      b.innerHTML = `<strong></strong><small></small>`;
      b.querySelector('strong').textContent = s.label;
      b.querySelector('small').textContent = s.hint;
      b.addEventListener('click', () => setSpeed(s.id, true));
      els.speed.appendChild(b);
    });
  }

  function setSpeed(id, shouldLog) {
    state.speed = speedOf(id).id;
    state.anchor = { sim: state.simHours, real: Date.now() };
    renderSpeed();
    if (shouldLog) addLog(UI.log.speed(speedOf(id).label));
    save();
  }

  function renderSound() {
    const isOn = Sound.isOn();
    els.sound.textContent = isOn ? UI.sound.on : UI.sound.off;
    els.sound.setAttribute('aria-pressed', String(isOn));
  }
  els.sound.addEventListener('click', () => {
    Sound.toggle();
    renderSound();
  });

  /* ---------- your own fridge photo ---------- */

  let pending = null; // { url, img } while the form is open

  function renderMineButton() {
    els.addMine.textContent = cams.some(c => c.isUser) ? UI.mine.replace : UI.mine.add;
  }

  els.addMine.addEventListener('click', () => els.mineFile.click());
  els.mineFile.addEventListener('change', () => {
    const file = els.mineFile.files[0];
    els.mineFile.value = '';
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (pending) URL.revokeObjectURL(pending.url);
      pending = { url, img };
      els.minePreview.src = url;
      els.mineName.value = '';
      els.mineNote.textContent = UI.mine.privacy;
      els.mineForm.hidden = false;
      els.mineName.focus();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      console.error('Your fridge photo could not be decoded', file.type);
      els.mineNote.textContent = UI.mine.failed;
      els.mineForm.hidden = false;
    };
    img.src = url;
  });

  function closeMineForm(shouldRevoke) {
    if (pending && shouldRevoke) URL.revokeObjectURL(pending.url);
    pending = null;
    els.mineForm.hidden = true;
    els.minePreview.removeAttribute('src');
  }

  els.mineForm.addEventListener('submit', e => {
    e.preventDefault();
    if (!pending) return;
    const days = Number(els.mineShelf.value);
    const old = cams.findIndex(c => c.isUser);
    const index = old >= 0 ? old : cams.length;
    const cam = makeCam({
      name: els.mineName.value.trim() || UI.mine.defaultName,
      code: UI.mine.code,
      shelfHours: days * 24,
      box: F.userBox,
      decay: ['brown', 'mold'],
      isUser: true,
    }, index);
    cam.img = pending.img;
    cam.url = pending.url;
    cam.crop = R.cropFor(pending.img);
    cam.stockedAt = state.simHours;
    if (old >= 0) {
      if (state.open === old) closeCam(false);
      URL.revokeObjectURL(cams[old].url);
      cams[old] = cam;
    } else {
      cams.push(cam);
    }
    closeMineForm(false);
    buildCells();
    renderMineButton();
    camLog(cam, UI.log.newCam);
  });
  els.mineForm.querySelector('#mine-cancel').addEventListener('click', () => closeMineForm(true));

  /* ---------- saving (per browser; only real-time speed resumes the fridge) ---------- */

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        speed: state.speed,
        simHours: state.simHours,
        loopStart: state.loopStart,
        startMs: state.startMs,
        savedAt: Date.now(),
        disposed: F.cams.map((_, i) => cams[i].disposed),
      }));
    } catch {
      // Storage may be blocked (private mode); the fridge just starts fresh next time
    }
  }

  function restore() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch {
      saved = null;
    }
    if (!saved) return;
    state.speed = speedOf(saved.speed).id;
    if (state.speed !== 'real') return;
    // Real time: the fridge kept going while the page was closed
    state.startMs = saved.startMs;
    state.loopStart = saved.loopStart;
    state.simHours = saved.simHours + (Date.now() - saved.savedAt) / 3600000;
    state.anchor = { sim: saved.simHours, real: saved.savedAt };
    cams.forEach((c, i) => {
      c.stockedAt = saved.loopStart;
      c.disposed = !!(saved.disposed && saved.disposed[i]);
    });
  }

  /* ---------- drawing ---------- */

  function fitScreen() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(els.stage.clientWidth * dpr), h = Math.round(els.stage.clientHeight * dpr);
    if (els.screen.width !== w || els.screen.height !== h) {
      els.screen.width = w;
      els.screen.height = h;
      state.lastFrame = 0;
    }
  }
  new ResizeObserver(fitScreen).observe(els.stage);

  // Door light: a white flash, then the picture stays blown out until it shuts
  function exposure(now) {
    // Restocking: the door stands open while the shopping goes in
    if (state.restockUntil > 0) return 1.6;
    if (!state.door) return 1;
    const e = (now - state.door.from) / 1000;
    if (e < 0.12) return 1.8;
    return 1.1 + 0.35 * Math.max(0, 1 - e / 0.6);
  }

  function drawFeed(cam, now, t, x, y, dw, dh, size) {
    const [w, h] = size;
    if (!cam || cam.disposed) return;
    if (cam.offAt) {
      const e = (now - cam.offAt) / 1000;
      if (e < 0.3) {
        R.staticNoise(w >> 1, h >> 1);
        screen.drawImage(R.buf, x, y, dw, dh);
      } else if (e < 0.55) {
        // Picture squeezes into a bright band
        const p = (e - 0.3) / 0.25;
        const bh = Math.max(2, dh * (1 - p));
        R.capture(cam, ripeness(cam), w, h, t, 1 + p);
        screen.drawImage(R.buf, x, y + (dh - bh) / 2, dw, bh);
        screen.fillStyle = `rgba(255, 255, 255, ${p * 0.8})`;
        screen.fillRect(x, y + (dh - bh) / 2, dw, bh);
      } else if (e < OFF_SECONDS) {
        // ...then a white line shrinking to a dot
        const q = (e - 0.55) / (OFF_SECONDS - 0.55);
        const lw = Math.max(2, dw * (1 - q));
        screen.fillStyle = '#fff';
        screen.fillRect(x + (dw - lw) / 2, y + dh / 2 - 1, lw, Math.max(2, dh * 0.012));
      }
      return;
    }
    R.capture(cam, ripeness(cam), w, h, t, exposure(now));
    screen.drawImage(R.buf, x, y, dw, dh);
  }

  function draw(now, t) {
    const W = els.screen.width, H = els.screen.height;
    const { cols, rows } = layout();
    screen.imageSmoothingEnabled = true;
    screen.fillStyle = '#000';
    screen.fillRect(0, 0, W, H);
    const cellW = W / cols, cellH = H / rows;
    if (state.open >= 0) {
      drawFeed(cams[state.open], now, t, 0, 0, W, W * 0.75, LOW.open);
      return;
    }
    for (let i = 0; i < cols * rows; i++) {
      drawFeed(cams[i], now, t, (i % cols) * cellW, Math.floor(i / cols) * cellH, cellW, cellH, LOW.grid);
    }
    // Thin black seams between monitors
    screen.fillStyle = '#000';
    const seam = Math.max(1, W / 400);
    for (let c = 1; c < cols; c++) screen.fillRect(c * cellW - seam / 2, 0, seam, H);
    for (let r = 1; r < rows; r++) screen.fillRect(0, r * cellH - seam / 2, W, seam);
  }

  /* ---------- loop ---------- */

  function restock(now) {
    state.restockUntil = now + F.restockSeconds * 1000;
    if (state.open >= 0) closeCam(false);
    els.signalTitle.textContent = UI.restockTitle;
    els.signalSub.textContent = UI.restock;
    els.signal.hidden = false;
  }

  function finishRestock() {
    // Fresh groceries: everything starts its shelf life again from now
    state.restockUntil = 0;
    state.loopStart = state.simHours;
    cams.forEach(c => {
      c.stockedAt = state.simHours;
      c.disposed = false;
      c.offAt = 0;
      c.lastStatus = null;
      c.fliesOn = false;
    });
    els.signal.hidden = true;
    addLog(UI.log.restock);
    save();
  }

  function doorEvents(now) {
    if (state.door) {
      if (now >= state.door.until) {
        state.door = null;
        els.stage.classList.remove('door-open');
        addLog(UI.log.doorClose);
        Sound.sfx('doorClose');
        state.nextDoor = now + rand(...F.doorEvery) * 1000;
      }
    } else if (now >= state.nextDoor && !state.restockUntil) {
      state.door = { from: now, until: now + F.doorSeconds * 1000 };
      els.stage.classList.add('door-open');
      addLog(UI.log.doorOpen);
      Sound.sfx('doorOpen');
    }
  }

  function tick(now) {
    const dt = Math.min((now - state.lastTick) / 1000, 0.25);
    state.lastTick = now;
    const t = now / 1000;

    if (state.restockUntil > 0) {
      if (now >= state.restockUntil) finishRestock();
    } else {
      if (state.speed === 'real') state.simHours = state.anchor.sim + (Date.now() - state.anchor.real) / 3600000;
      else state.simHours += dt * speedOf(state.speed).hoursPerSecond;
      if (state.simHours - state.loopStart >= F.loopHours) restock(now);
    }
    doorEvents(now);

    // CCTV runs at a low frame rate; that stutter is part of the look
    if (now - state.lastFrame >= 1000 / F.fps) {
      state.lastFrame = now;
      cams.forEach(checkEvents);
      draw(now, t);
      cams.forEach((c, i) => updateOverlay(c, i, t));
      if (state.open >= 0) renderInfo();
    }
    if (now - state.lastSave > 2000) {
      state.lastSave = now;
      save();
    }
    requestAnimationFrame(tick);
  }

  /* ---------- boot ---------- */

  function loadImage(cam) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        cam.img = img;
        cam.crop = R.cropFor(img);
        resolve(true);
      };
      img.onerror = () => {
        console.error('Camera image failed to load', cam.file);
        resolve(false);
      };
      img.src = cam.file;
    });
  }

  document.getElementById('title').textContent = UI.title;
  const credit = document.getElementById('credit');
  credit.textContent = F.credit.text;
  credit.href = F.credit.url;
  document.documentElement.classList.toggle('preview', window.self !== window.top);
  $('#log-title').textContent = UI.logTitle;
  els.infoClose.textContent = UI.info.close;
  els.dispose.textContent = UI.dispose;
  $('#mine-name-label').textContent = UI.mine.name;
  els.mineName.placeholder = UI.mine.namePlaceholder;
  $('#mine-shelf-label').textContent = UI.mine.shelf;
  F.userShelfDays.forEach(d => els.mineShelf.add(new Option(UI.mine.days(d), d)));
  $('#mine-submit').textContent = UI.mine.submit;
  $('#mine-cancel').textContent = UI.mine.cancel;
  document.addEventListener('visibilitychange', () => document.hidden && save());

  restore();
  buildCells();
  renderSpeed();
  renderSound();
  renderMineButton();
  els.signalTitle.textContent = UI.loadingTitle;
  els.signalSub.textContent = UI.loading;
  els.signal.hidden = false;
  fitScreen();

  Promise.all(cams.map(loadImage)).then(results => {
    const isAllLoaded = results.every(Boolean);
    els.signal.hidden = isAllLoaded;
    if (!isAllLoaded) els.signalSub.textContent = UI.loadFailed;
    state.lastTick = performance.now();
    requestAnimationFrame(tick);
  });
})();
