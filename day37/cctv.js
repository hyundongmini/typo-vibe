// Fridge CCTV wall: runs the fast-forwarded fridge clock, decides what each camera shows,
// and handles the surveillance events (tracking, auto zoom, door, disposal).
// render.js draws the feeds; sound.js makes the noises.
(() => {
  const F = window.FRIDGE;
  const UI = F.ui;
  const R = window.CctvRender;
  const $ = s => document.querySelector(s);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const COLS = 3, ROWS = 4;
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
  };
  const screen = els.screen.getContext('2d');

  const state = {
    simHours: 0,
    loopStart: 0,
    startMs: Date.now(),
    restockUntil: 0,
    open: -1,
    auto: null, // { i, until } while a feed is zoomed in by itself
    autoQueue: [],
    autoRestUntil: 0,
    door: null, // { from, until }
    nextDoor: performance.now() + 12000,
    lastFrame: 0,
    lastTick: performance.now(),
  };

  /* ---------- helpers ---------- */

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

  /* ---------- cameras ---------- */

  const cams = F.cams.map((c, i) => {
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
      disposed: false,
      offAt: 0,
      lastStatus: null,
      el: null,
      labelKey: '',
    };
  });

  const ripeness = cam => (state.simHours - state.loopStart) / cam.shelfHours;

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
    const left = cam.shelfHours - (state.simHours - state.loopStart);
    const hours = Math.floor(Math.abs(left));
    return { isOver: left < 0, d: Math.floor(hours / 24), h: hours % 24 };
  }

  /* ---------- cells ---------- */

  function buildCells() {
    cams.forEach((cam, i) => {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.innerHTML = `
        <span class="osd-label"><span>${UI.camera(cam.n)}</span><span>${cam.n}</span></span>
        <span class="osd-rec">${UI.rec}</span>
        <span class="osd-auto">${UI.autoTrack}</span>
        <span class="track" hidden><span class="track-tag"></span></span>
        <span class="osd-center"></span>
        <span class="osd-door">${UI.doorOpen}</span>
        <span class="osd-time"></span>
        <span class="osd-extra"></span>`;
      cell.addEventListener('click', () => {
        Sound.unlock();
        if (cam.disposed || cam.offAt) return;
        if (state.open === i) closeCam(true);
        else openCam(i, false);
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
    });
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
    cell.classList.toggle('is-auto', !!state.auto && state.auto.i === i);
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

  // Passing the date sets off the alarm and queues that feed to zoom in by itself
  function checkEvents(cam, i) {
    if (cam.disposed || cam.offAt || state.restockUntil) return;
    const status = statusOf(cam);
    if (cam.lastStatus !== null && status !== cam.lastStatus && status === 'expired') {
      Sound.sfx('alarm');
      if (!state.autoQueue.includes(i)) state.autoQueue.push(i);
    }
    cam.lastStatus = status;
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
      [I.stocked, day(simDate(state.loopStart))],
      [I.expiry, cam.unknown ? I.unknownDate : day(simDate(state.loopStart + cam.shelfHours))],
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

  function openCam(i, isAuto) {
    if (!isAuto) state.auto = null;
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
    state.auto = null;
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
    state.auto = null;
    cam.offAt = performance.now();
    els.dispose.disabled = true;
    Sound.sfx('off');
    setTimeout(() => {
      cam.offAt = 0;
      cam.disposed = true;
      state.autoQueue = state.autoQueue.filter(q => q !== i);
      if (state.open === i) closeCam(true);
    }, OFF_SECONDS * 1000 + 300);
  }

  els.infoClose.addEventListener('click', () => closeCam(true));
  els.dispose.addEventListener('click', dispose);
  document.addEventListener('keydown', e => {
    Sound.unlock();
    if (e.key === 'Escape' && state.open >= 0) closeCam(true);
  });
  // Browsers only allow audio after a gesture: the first touch anywhere starts the hum
  document.addEventListener('pointerdown', () => Sound.unlock());

  /* ---------- drawing ---------- */

  function fitScreen() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.round(els.stage.clientWidth * dpr);
    if (els.screen.width !== size) {
      els.screen.width = els.screen.height = size;
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
    if (cam.disposed) return;
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
    const S = els.screen.width;
    screen.imageSmoothingEnabled = true;
    screen.fillStyle = '#000';
    screen.fillRect(0, 0, S, S);
    if (state.open >= 0) {
      drawFeed(cams[state.open], now, t, 0, 0, S, S * 0.75, LOW.open);
      return;
    }
    const cellW = S / COLS, cellH = S / ROWS;
    cams.forEach((cam, i) => drawFeed(cam, now, t, (i % COLS) * cellW, Math.floor(i / COLS) * cellH, cellW, cellH, LOW.grid));
    // Thin black seams between monitors
    screen.fillStyle = '#000';
    const seam = Math.max(1, S / 400);
    for (let c = 1; c < COLS; c++) screen.fillRect(c * cellW - seam / 2, 0, seam, S);
    for (let r = 1; r < ROWS; r++) screen.fillRect(0, r * cellH - seam / 2, S, seam);
  }

  /* ---------- events ---------- */

  function restock(now) {
    state.restockUntil = now + F.restockSeconds * 1000;
    state.autoQueue = [];
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
      c.disposed = false;
      c.offAt = 0;
      c.lastStatus = null;
    });
    els.signal.hidden = true;
  }

  function doorEvents(now) {
    if (state.door) {
      if (now >= state.door.until) {
        state.door = null;
        els.stage.classList.remove('door-open');
        Sound.sfx('doorClose');
        state.nextDoor = now + rand(...F.doorEvery) * 1000;
      }
    } else if (now >= state.nextDoor && !state.restockUntil) {
      state.door = { from: now, until: now + F.doorSeconds * 1000 };
      els.stage.classList.add('door-open');
      Sound.sfx('doorOpen');
    }
  }

  function autoZoom(now) {
    if (state.auto && now >= state.auto.until) {
      if (state.open === state.auto.i) closeCam(false);
      state.auto = null;
      // Let the whole wall show for a moment before the next one zooms in
      state.autoRestUntil = now + F.autoRestSeconds * 1000;
    }
    const isResting = now < state.autoRestUntil;
    if (!state.auto && !isResting && state.open < 0 && state.autoQueue.length && !state.restockUntil) {
      const i = state.autoQueue.shift();
      const cam = cams[i];
      if (cam && !cam.disposed && !cam.offAt) {
        openCam(i, true);
        state.auto = { i, until: now + F.autoZoomSeconds * 1000 };
      }
    }
  }

  /* ---------- loop ---------- */

  function tick(now) {
    const dt = Math.min((now - state.lastTick) / 1000, 0.25);
    state.lastTick = now;
    const t = now / 1000;

    if (state.restockUntil > 0) {
      if (now >= state.restockUntil) finishRestock();
    } else {
      state.simHours += dt * F.hoursPerSecond;
      if (state.simHours - state.loopStart >= F.loopHours) restock(now);
    }
    doorEvents(now);

    // CCTV runs at a low frame rate; that stutter is part of the look
    if (now - state.lastFrame >= 1000 / F.fps) {
      state.lastFrame = now;
      cams.forEach(checkEvents);
      autoZoom(now);
      draw(now, t);
      cams.forEach((c, i) => updateOverlay(c, i, t));
      if (state.open >= 0) renderInfo();
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

  $('#caption-title').textContent = UI.title;
  $('#caption-meta').textContent = UI.caption;
  const credit = $('#credit');
  credit.textContent = F.credit.text;
  credit.href = F.credit.url;
  document.documentElement.classList.toggle('preview', window.self !== window.top);
  els.infoClose.textContent = UI.info.close;
  els.dispose.textContent = UI.dispose;

  buildCells();
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
