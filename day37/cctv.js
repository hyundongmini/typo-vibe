// Fridge CCTV wall: runs the fast-forwarded fridge clock, decides what each monitor shows,
// and handles the surveillance events (tracking, auto zoom, door, disposal, alert log).
// render.js draws the feeds, alert.js types the log, sound.js makes the noises.
(() => {
  const F = window.FRIDGE;
  const UI = F.ui;
  const R = window.CctvRender;
  const $ = s => document.querySelector(s);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Low capture width is what makes it read as CCTV; height follows each frame's aspect
  const LOW = { grid: 176, open: 400 };
  // Full-wall layouts for 12 monitors: whichever keeps them closest to 4:3 for this window
  const GRIDS = [[4, 3], [3, 4], [6, 2], [2, 6]];
  const OFF_SECONDS = 0.8;
  const SWITCH_SECONDS = 0.25;

  const els = {
    wall: $('#wall'),
    stage: $('#stage'),
    screen: $('#screen'),
    cells: $('#cells'),
    openView: $('#open-view'),
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
    open: -1, // camera index shown full screen
    auto: null, // { i, until } while a feed is zoomed in by itself
    autoQueue: [],
    autoRestUntil: 0,
    door: null, // { from, until }
    nextDoor: performance.now() + 12000,
    lastFrame: 0,
    lastTick: performance.now(),
    isSplit: false,
    grid: { cols: 4, rows: 3 },
    slots: [], // monitors on the wall, each showing one camera
    nextRotate: performance.now() + F.rotateSeconds * 1000,
    rotateSlot: 0,
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
  const shortStamp = d => `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

  /* ---------- cameras ---------- */

  const cams = F.cams.map((c, i) => {
    const r = rng(i * 977 + 13);
    return {
      ...c,
      n: pad(i + 1),
      img: null,
      crop: null, // for its monitor on the wall
      cropOpen: null, // for the whole screen when opened
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
      fliesOn: false,
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

  const log = (text, isAlarm) => AlertLog.push(`${shortStamp(simDate(state.simHours))}  ${text}`, isAlarm);
  const camLog = (cam, event, isAlarm) => log(`CAM${cam.n} ${cam.code} ${event}`, isAlarm);

  /* ---------- on-screen display ---------- */

  const OSD_HTML = `
    <span class="osd-label"><span class="osd-cam"></span><span class="osd-num"></span></span>
    <span class="osd-rec">${UI.rec}</span>
    <span class="osd-auto">${UI.autoTrack}</span>
    <span class="track" hidden><span class="track-tag"></span></span>
    <span class="osd-center"></span>
    <span class="osd-door">${UI.doorOpen}</span>
    <span class="osd-time"></span>
    <span class="osd-extra"></span>`;

  function osdRefs(el) {
    return {
      el,
      cam: el.querySelector('.osd-cam'),
      num: el.querySelector('.osd-num'),
      track: el.querySelector('.track'),
      tag: el.querySelector('.track-tag'),
      center: el.querySelector('.osd-center'),
      time: el.querySelector('.osd-time'),
      extra: el.querySelector('.osd-extra'),
      rec: el.querySelector('.osd-rec'),
      shown: -1,
      labelKey: '',
    };
  }

  // Draw one camera's overlay into a monitor (or the open view)
  function paintOsd(o, i, crop, t, isSwitching) {
    const cam = cams[i];
    if (o.shown !== i) {
      o.shown = i;
      o.cam.textContent = UI.camera(cam.n);
      o.num.textContent = cam.n;
      o.labelKey = '';
    }
    const status = statusOf(cam);
    const isRestocking = state.restockUntil > 0;
    const isDead = cam.disposed || cam.offAt > 0;
    const shows = !isRestocking && !isDead && !isSwitching && cam.img && crop && status !== 'fresh';
    o.track.hidden = !shows;
    if (shows) {
      const b = R.boxInFrame(cam, crop);
      // Tracking wobbles a little, as if the detector keeps re-locking
      if (!reduceMotion) {
        cam.jitter.x += ((Math.random() - 0.5) * 0.02 - cam.jitter.x) * 0.5;
        cam.jitter.y += ((Math.random() - 0.5) * 0.02 - cam.jitter.y) * 0.5;
      }
      o.track.style.left = `${(b.x + cam.jitter.x) * 100}%`;
      o.track.style.top = `${(b.y + cam.jitter.y) * 100}%`;
      o.track.style.width = `${b.w * 100}%`;
      o.track.style.height = `${b.h * 100}%`;
      // Tag sits above the box unless that would run into the camera label at the top
      o.track.classList.toggle('tag-below', b.y < 0.15 && b.y + b.h < 0.85);
      o.track.classList.toggle('expired', status === 'expired' || status === 'rotten');
      const { isOver, d, h } = timeLeft(cam);
      o.tag.textContent = cam.unknown ? UI.tagUnknown(cam.code) : isOver ? UI.tagExpired(cam.code, d, h) : UI.tagLeft(cam.code, d, h);
    }
    o.center.textContent = cam.disposed && !isRestocking ? UI.noTarget : '';
    o.time.textContent = stamp(simDate(state.simHours));
    // REC blinks; a dead feed stops recording
    const recOn = !cam.disposed && (reduceMotion || Math.floor(t * 1.2) % 2 === 0);
    o.rec.style.visibility = recOn ? 'visible' : 'hidden';
    o.el.classList.toggle('is-auto', !!state.auto && state.auto.i === i);
    o.el.classList.toggle('dead', isDead);
    if (cam.overview) {
      const all = cams.map(statusOf);
      const watch = all.filter(s => s === 'watch' || s === 'unknown').length;
      const expired = all.filter(s => s === 'expired' || s === 'rotten').length;
      o.extra.textContent = isRestocking ? '' : UI.overview(watch, expired);
    } else {
      o.extra.textContent = '';
    }
    // Screen readers get a new label only when the status actually changes
    if (status !== o.labelKey) {
      o.labelKey = status;
      const word = status === 'disposed' ? UI.disposedStatus : UI.status[status];
      o.el.setAttribute('aria-label', UI.cellLabel(cam.n, cam.name, word));
    }
  }

  /* ---------- monitors ---------- */

  function buildSlots(count) {
    els.cells.innerHTML = '';
    state.slots = Array.from({ length: count }, (_, k) => {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.innerHTML = OSD_HTML;
      const slot = { cam: k, switchAt: -1e9, osd: osdRefs(cell) };
      cell.addEventListener('click', () => {
        Sound.unlock();
        const cam = cams[slot.cam];
        if (cam.disposed || cam.offAt) return;
        openCam(slot.cam, false);
      });
      els.cells.appendChild(cell);
      return slot;
    });
    state.rotateSlot = 0;
  }

  // With fewer monitors than cameras, one monitor at a time flips to a camera not on the wall
  function rotate(now) {
    if (state.slots.length >= cams.length || now < state.nextRotate) return;
    state.nextRotate = now + F.rotateSeconds * 1000;
    const shown = new Set(state.slots.map(s => s.cam));
    const k = state.rotateSlot % state.slots.length;
    state.rotateSlot++;
    const slot = state.slots[k];
    // Next camera after this one that isn't already up somewhere
    for (let step = 1; step <= cams.length; step++) {
      const next = (slot.cam + step) % cams.length;
      if (!shown.has(next)) {
        slot.cam = next;
        slot.switchAt = now;
        return;
      }
    }
  }

  // Passing a date sets off the alarm and queues that feed to zoom in by itself
  function checkEvents(cam, i) {
    if (cam.disposed || cam.offAt || state.restockUntil) return;
    const status = statusOf(cam);
    if (cam.lastStatus !== null && status !== cam.lastStatus) {
      if (status === 'watch' || status === 'unknown') camLog(cam, UI.log.watch);
      if (status === 'expired') {
        camLog(cam, UI.log.expired, true);
        Sound.sfx('alarm');
        if (!state.autoQueue.includes(i)) state.autoQueue.push(i);
      }
      if (status === 'rotten') camLog(cam, UI.log.rotten, true);
    }
    cam.lastStatus = status;
    const hasFlies = !!cam.flies && ripeness(cam) > 1.15;
    if (hasFlies && !cam.fliesOn) camLog(cam, UI.log.flies, true);
    cam.fliesOn = hasFlies;
  }

  /* ---------- open one camera ---------- */

  const openOsd = (() => {
    els.openView.insertAdjacentHTML('afterbegin', OSD_HTML);
    return osdRefs(els.openView);
  })();

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
    els.openView.hidden = false;
    els.info.hidden = false;
    renderInfo();
    state.lastFrame = 0;
  }

  function closeCam(shouldFocus) {
    const was = state.open;
    state.open = -1;
    state.auto = null;
    els.stage.classList.remove('has-open');
    els.openView.hidden = true;
    els.info.hidden = true;
    state.lastFrame = 0;
    if (shouldFocus) {
      const slot = state.slots.find(s => s.cam === was);
      if (slot) slot.osd.el.focus();
    }
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
    camLog(cam, UI.log.disposed, true);
    setTimeout(() => {
      cam.offAt = 0;
      cam.disposed = true;
      state.autoQueue = state.autoQueue.filter(q => q !== i);
      if (state.open === i) closeCam(true);
    }, OFF_SECONDS * 1000 + 300);
  }

  els.openView.addEventListener('click', () => closeCam(true));
  els.infoClose.addEventListener('click', () => closeCam(true));
  els.dispose.addEventListener('click', dispose);
  document.addEventListener('keydown', e => {
    Sound.unlock();
    if (e.key === 'Escape' && state.open >= 0) closeCam(true);
  });
  // Browsers only allow audio after a gesture: the first touch anywhere starts the hum
  document.addEventListener('pointerdown', () => Sound.unlock());

  /* ---------- layout ---------- */

  // Wide windows: 9 monitors + the alert screen. Otherwise all 12 monitors fill the window.
  function fitScreen() {
    const isSplit = innerWidth / innerHeight >= F.splitAspect && innerWidth >= F.splitMinWidth;
    els.wall.classList.toggle('split', isSplit);
    const cw = els.stage.clientWidth, ch = els.stage.clientHeight;
    if (!cw || !ch) return;
    let cols, rows;
    if (isSplit) {
      [cols, rows] = [3, 3];
    } else {
      [cols, rows] = GRIDS.reduce((best, g) => {
        const err = Math.abs(Math.log((cw / g[0]) / (ch / g[1]) / (4 / 3)));
        return err < best.err ? { g, err } : best;
      }, { g: GRIDS[0], err: Infinity }).g;
    }
    if (isSplit !== state.isSplit || !state.slots.length) {
      state.isSplit = isSplit;
      buildSlots(isSplit ? 9 : cams.length);
    }
    state.grid = { cols, rows };
    els.cells.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    els.cells.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    els.screen.width = Math.round(cw * dpr);
    els.screen.height = Math.round(ch * dpr);
    cams.forEach(c => {
      if (!c.img) return;
      c.crop = R.cropFor(c.img, (cw / cols) / (ch / rows), c.box);
      c.cropOpen = R.cropFor(c.img, cw / ch, c.box);
    });
    state.lastFrame = 0;
  }
  new ResizeObserver(fitScreen).observe(els.wall);

  /* ---------- drawing ---------- */

  // Door light: a white flash, then the picture stays blown out until it shuts
  function exposure(now) {
    // Restocking: the door stands open while the shopping goes in
    if (state.restockUntil > 0) return 1.6;
    if (!state.door) return 1;
    const e = (now - state.door.from) / 1000;
    if (e < 0.12) return 1.8;
    return 1.1 + 0.35 * Math.max(0, 1 - e / 0.6);
  }

  function drawStatic(x, y, dw, dh) {
    R.staticNoise(48, 36);
    screen.drawImage(R.buf, x, y, dw, dh);
  }

  function drawFeed(cam, crop, now, t, x, y, dw, dh, lowW) {
    const w = lowW, h = Math.max(2, Math.round((lowW * dh) / dw));
    if (cam.disposed || !crop) return;
    if (cam.offAt) {
      const e = (now - cam.offAt) / 1000;
      if (e < 0.3) {
        drawStatic(x, y, dw, dh);
      } else if (e < 0.55) {
        // Picture squeezes into a bright band
        const p = (e - 0.3) / 0.25;
        const bh = Math.max(2, dh * (1 - p));
        R.capture(cam, crop, ripeness(cam), w, h, t, 1 + p);
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
    R.capture(cam, crop, ripeness(cam), w, h, t, exposure(now));
    screen.drawImage(R.buf, x, y, dw, dh);
  }

  function draw(now, t) {
    const W = els.screen.width, H = els.screen.height;
    const { cols, rows } = state.grid;
    screen.imageSmoothingEnabled = true;
    screen.fillStyle = '#000';
    screen.fillRect(0, 0, W, H);
    if (state.open >= 0) {
      const cam = cams[state.open];
      drawFeed(cam, cam.cropOpen, now, t, 0, 0, W, H, LOW.open);
      return;
    }
    const cellW = W / cols, cellH = H / rows;
    state.slots.forEach((slot, k) => {
      const x = (k % cols) * cellW, y = Math.floor(k / cols) * cellH;
      // A monitor changing channel shows a blip of static first
      if (now - slot.switchAt < SWITCH_SECONDS * 1000) drawStatic(x, y, cellW, cellH);
      else drawFeed(cams[slot.cam], cams[slot.cam].crop, now, t, x, y, cellW, cellH, LOW.grid);
    });
    // Thin black seams between monitors
    screen.fillStyle = '#000';
    const seam = Math.max(1, Math.min(W, H) / 400);
    for (let c = 1; c < cols; c++) screen.fillRect(c * cellW - seam / 2, 0, seam, H);
    for (let r = 1; r < rows; r++) screen.fillRect(0, r * cellH - seam / 2, W, seam);
  }

  function paintOverlays(now, t) {
    state.slots.forEach(slot => {
      const cam = cams[slot.cam];
      paintOsd(slot.osd, slot.cam, cam.crop, t, now - slot.switchAt < SWITCH_SECONDS * 1000);
    });
    if (state.open >= 0) paintOsd(openOsd, state.open, cams[state.open].cropOpen, t, false);
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
      c.fliesOn = false;
    });
    els.signal.hidden = true;
    log(UI.log.restock);
  }

  function doorEvents(now) {
    if (state.door) {
      if (now >= state.door.until) {
        state.door = null;
        els.stage.classList.remove('door-open');
        Sound.sfx('doorClose');
        log(UI.log.doorClose);
        state.nextDoor = now + rand(...F.doorEvery) * 1000;
      }
    } else if (now >= state.nextDoor && !state.restockUntil) {
      state.door = { from: now, until: now + F.doorSeconds * 1000 };
      els.stage.classList.add('door-open');
      Sound.sfx('doorOpen');
      log(UI.log.doorOpen);
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
      rotate(now);
      draw(now, t);
      paintOverlays(now, t);
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
        resolve(true);
      };
      img.onerror = () => {
        console.error('Camera image failed to load', cam.file);
        resolve(false);
      };
      img.src = cam.file;
    });
  }

  document.documentElement.classList.toggle('preview', window.self !== window.top);
  els.infoClose.textContent = UI.info.close;
  els.dispose.textContent = UI.dispose;
  $('#alert-title').textContent = UI.alertTitle;
  $('#alert-sub').textContent = UI.alertSub;
  AlertLog.init($('#alert-log'));

  els.signalTitle.textContent = UI.loadingTitle;
  els.signalSub.textContent = UI.loading;
  els.signal.hidden = false;
  fitScreen();

  Promise.all(cams.map(loadImage)).then(results => {
    fitScreen();
    const isAllLoaded = results.every(Boolean);
    els.signal.hidden = isAllLoaded;
    if (!isAllLoaded) els.signalSub.textContent = UI.loadFailed;
    log(UI.log.online);
    state.lastTick = performance.now();
    requestAnimationFrame(tick);
  });
})();
