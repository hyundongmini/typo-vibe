// Fridge CCTV wall: each camera re-films a photo at low resolution, ages its item as the
// fast-forwarded clock runs, and latches a red tracking box onto whatever is going off.
(() => {
  const F = window.FRIDGE;
  const UI = F.ui;
  const $ = s => document.querySelector(s);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const COLS = 3, ROWS = 4;
  // Low capture resolution is what makes it read as CCTV
  const LOW = { grid: [176, 132], open: [400, 300] };

  const els = {
    stage: $('#stage'),
    screen: $('#screen'),
    cells: $('#cells'),
    info: $('#info'),
    infoList: $('#info-list'),
    infoClose: $('#info-close'),
    signal: $('#signal'),
    signalTitle: $('#signal-title'),
    signalSub: $('#signal-sub'),
  };
  const screen = els.screen.getContext('2d');
  const buf = document.createElement('canvas');
  const bctx = buf.getContext('2d', { willReadFrequently: true });

  const state = {
    simHours: 0,
    loopStart: 0,
    startMs: Date.now(),
    restockUntil: 0,
    open: -1,
    lastFrame: 0,
    lastTick: performance.now(),
  };

  /* ---------- helpers ---------- */

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, v) => {
    const t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
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
      flies: Array.from({ length: 4 }, () => ({ phase: r() * 10, speed: 0.6 + r() * 0.8, rx: 0.3 + r() * 0.4, ry: 0.2 + r() * 0.3 })),
      jitter: { x: 0, y: 0 },
      el: null,
      statusKey: '',
    };
  });

  // Crop each photo to the 4:3 camera frame, centered
  function cropFor(img) {
    const want = 4 / 3, have = img.width / img.height;
    if (have > want) {
      const w = img.height * want;
      return { x: (img.width - w) / 2, y: 0, w, h: img.height };
    }
    const h = img.width / want;
    return { x: 0, y: (img.height - h) / 2, w: img.width, h };
  }

  // The item's box in camera-frame fractions (0..1)
  function boxInFrame(cam) {
    const { img, crop } = cam;
    const [bx, by, bw, bh] = cam.box;
    return {
      x: (bx * img.width - crop.x) / crop.w,
      y: (by * img.height - crop.y) / crop.h,
      w: (bw * img.width) / crop.w,
      h: (bh * img.height) / crop.h,
    };
  }

  // Age as a share of shelf life: 1 is the expiry date
  const ripeness = cam => (state.simHours - state.loopStart) / cam.shelfHours;

  function statusOf(cam) {
    const r = ripeness(cam);
    if (cam.unknown && r >= F.watchFrom) return r >= 1.4 ? 'rotten' : 'unknown';
    if (r >= 1.4) return 'rotten';
    if (r >= 1) return 'expired';
    if (r >= F.watchFrom) return 'watch';
    return 'fresh';
  }

  /* ---------- drawing one camera ---------- */

  function ageItem(cam, w, h, t) {
    const r = ripeness(cam);
    const b = boxInFrame(cam);
    const x = b.x * w, y = b.y * h, bw = b.w * w, bh = b.h * h;
    const wear = smooth(0.75, 1.6, r);
    if (wear <= 0) return;
    bctx.save();
    bctx.beginPath();
    bctx.ellipse(x + bw / 2, y + bh / 2, bw / 2, bh / 2, 0, 0, Math.PI * 2);
    bctx.clip();
    // Discolouration fades out toward the edge of the item instead of stopping at a hard oval
    const tint = (op, rgb, alpha) => {
      bctx.globalCompositeOperation = op;
      bctx.save();
      bctx.translate(x + bw / 2, y + bh / 2);
      bctx.scale(bw / 2, bh / 2);
      const g = bctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, `rgba(${rgb}, ${alpha})`);
      g.addColorStop(0.55, `rgba(${rgb}, ${alpha * 0.85})`);
      g.addColorStop(1, `rgba(${rgb}, 0)`);
      bctx.fillStyle = g;
      bctx.fillRect(-1, -1, 2, 2);
      bctx.restore();
    };
    for (const kind of cam.decay) {
      if (kind === 'brown') {
        tint('multiply', '150, 105, 55', wear * 0.75);
        tint('saturation', '90, 80, 60', wear * 0.45);
      } else if (kind === 'grey') {
        tint('color', '115, 135, 100', wear * 0.9);
        tint('multiply', '160, 168, 140', wear * 0.75);
      } else if (kind === 'murky') {
        // Settles into a cloudy layer at the bottom
        bctx.globalCompositeOperation = 'source-over';
        const g = bctx.createLinearGradient(0, y, 0, y + bh);
        g.addColorStop(0, `rgba(200, 190, 150, ${wear * 0.15})`);
        g.addColorStop(1, `rgba(120, 105, 70, ${wear * 0.7})`);
        bctx.fillStyle = g;
        bctx.fillRect(x, y, bw, bh);
      } else if (kind === 'mold') {
        bctx.globalCompositeOperation = 'source-over';
        for (const m of cam.blobs) {
          const grow = clamp((r - m.start) / 0.5, 0, 1);
          if (grow <= 0) continue;
          const mx = x + m.x * bw, my = y + m.y * bh, mr = m.r * Math.min(bw, bh) * (0.3 + grow);
          // Dark green-grey stain under a pale fuzzy top, like real fridge mold
          const fuzz = m.tone > 0.65 ? '120, 140, 95' : m.tone > 0.3 ? '225, 230, 210' : '185, 195, 165';
          bctx.fillStyle = `rgba(60, 75, 50, ${0.45 * grow})`;
          bctx.beginPath();
          bctx.arc(mx, my, mr * 0.9, 0, Math.PI * 2);
          bctx.fill();
          bctx.fillStyle = `rgba(${fuzz}, ${0.95 * grow})`;
          for (const sp of m.specks) {
            bctx.beginPath();
            bctx.arc(mx + sp.dx * mr, my + sp.dy * mr, Math.max(0.6, mr * sp.s * 0.45), 0, Math.PI * 2);
            bctx.fill();
          }
        }
      }
    }
    bctx.restore();

    // Flies circling once it has gone properly bad (drawn outside the clip, they wander)
    if (cam.flies && r > 1.15) {
      bctx.fillStyle = 'rgba(20, 20, 20, 0.9)';
      const n = Math.min(cam.flies.length, 1 + Math.floor((r - 1.15) * 6));
      for (let i = 0; i < n; i++) {
        const f = cam.flies[i];
        const s = reduceMotion ? f.phase : f.phase + t * f.speed;
        const fx = x + bw / 2 + Math.cos(s * 2.1) * bw * f.rx + Math.sin(s * 5.3) * bw * 0.05;
        const fy = y + bh * 0.3 + Math.sin(s * 1.7) * bh * f.ry;
        bctx.fillRect(Math.round(fx), Math.round(fy), Math.max(1, w / 160), Math.max(1, w / 220));
      }
    }
  }

  // Cheap CCTV look on the low-res capture: oversharpened edges, chroma shift, noise, scanlines
  function cctvLook(w, h, t) {
    const frame = bctx.getImageData(0, 0, w, h);
    const src = frame.data;
    const out = new Uint8ClampedArray(src.length);
    const k = 0.6;
    let seed = reduceMotion ? 7 : (t * 1000) | 0;
    for (let y = 0; y < h; y++) {
      const scan = y % 2 ? 0.93 : 1;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const up = y > 0 ? i - w * 4 : i, dn = y < h - 1 ? i + w * 4 : i;
        const lf = x > 0 ? i - 4 : i, rt = x < w - 1 ? i + 4 : i;
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const noise = ((seed >>> 24) - 128) * 0.12;
        for (let c = 0; c < 3; c++) {
          let v = src[i + c] * (1 + 4 * k) - k * (src[up + c] + src[dn + c] + src[lf + c] + src[rt + c]);
          // Half of red comes from the pixel to the left: the colour bleed of cheap analog cameras
          if (c === 0) v = v * 0.55 + src[lf] * 0.45;
          v = (v - 128) * 1.08 + 128 + noise;
          out[i + c] = v * scan;
        }
        out[i + 3] = 255;
      }
    }
    // Push saturation a little, like the reference's loud colour
    for (let i = 0; i < out.length; i += 4) {
      const l = (out[i] + out[i + 1] + out[i + 2]) / 3;
      out[i] = l + (out[i] - l) * 1.25;
      out[i + 1] = l + (out[i + 1] - l) * 1.25;
      out[i + 2] = l + (out[i + 2] - l) * 1.25;
    }
    frame.data.set(out);
    bctx.putImageData(frame, 0, 0);
  }

  function capture(cam, w, h, t) {
    buf.width = w;
    buf.height = h;
    if (!cam.img) {
      bctx.fillStyle = '#111';
      bctx.fillRect(0, 0, w, h);
      return;
    }
    const { crop } = cam;
    // Slight handheld drift: the mount is never perfectly still
    const jx = reduceMotion ? 0 : Math.sin(t * 0.7 + cam.blobs[0].x * 9) * crop.w * 0.004;
    const jy = reduceMotion ? 0 : Math.cos(t * 0.5 + cam.blobs[1].y * 9) * crop.h * 0.004;
    bctx.drawImage(cam.img, crop.x + jx, crop.y + jy, crop.w, crop.h, 0, 0, w, h);
    ageItem(cam, w, h, t);
    cctvLook(w, h, t);
  }

  function staticNoise(w, h) {
    buf.width = w;
    buf.height = h;
    const frame = bctx.createImageData(w, h);
    const d = frame.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() * 255;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    bctx.putImageData(frame, 0, 0);
  }

  /* ---------- overlays ---------- */

  function buildCells() {
    cams.forEach((cam, i) => {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.innerHTML = `
        <span class="osd-label"><span>${UI.camera(cam.n)}</span><span>${cam.n}</span></span>
        <span class="osd-rec">${UI.rec}</span>
        <span class="track" hidden><span class="track-tag"></span></span>
        <span class="osd-time"></span>
        <span class="osd-extra"></span>`;
      cell.addEventListener('click', () => (state.open === i ? closeCam() : openCam(i)));
      els.cells.appendChild(cell);
      cam.el = {
        cell,
        track: cell.querySelector('.track'),
        tag: cell.querySelector('.track-tag'),
        time: cell.querySelector('.osd-time'),
        extra: cell.querySelector('.osd-extra'),
        rec: cell.querySelector('.osd-rec'),
      };
    });
  }

  function timeLeft(cam) {
    const left = cam.shelfHours - (state.simHours - state.loopStart);
    const hours = Math.floor(Math.abs(left));
    return { isOver: left < 0, d: Math.floor(hours / 24), h: hours % 24 };
  }

  function updateOverlay(cam, t) {
    const status = statusOf(cam);
    const isRestocking = state.restockUntil > 0;
    const { track, tag } = cam.el;
    const shows = !isRestocking && cam.img && status !== 'fresh';
    track.hidden = !shows;
    if (shows) {
      const b = boxInFrame(cam);
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
    cam.el.time.textContent = stamp(simDate(state.simHours));
    // REC blinks once a second of real time
    cam.el.rec.style.visibility = reduceMotion || Math.floor(t * 1.2) % 2 === 0 ? 'visible' : 'hidden';
    if (cam.overview) {
      const all = cams.map(statusOf);
      const watch = all.filter(s => s === 'watch' || s === 'unknown').length;
      const expired = all.filter(s => s === 'expired' || s === 'rotten').length;
      cam.el.extra.textContent = isRestocking ? '' : UI.overview(watch, expired);
    }
    // Screen readers get a label only when the status actually changes
    if (status !== cam.statusKey) {
      cam.statusKey = status;
      cam.el.cell.setAttribute('aria-label', UI.cellLabel(cam.n, cam.name, UI.status[status]));
      if (state.open === cams.indexOf(cam)) renderInfo();
    }
  }

  /* ---------- open one camera ---------- */

  function renderInfo() {
    const cam = cams[state.open];
    if (!cam) return;
    const I = UI.info;
    const status = statusOf(cam);
    const stocked = simDate(state.loopStart);
    const { isOver, d, h } = timeLeft(cam);
    const rows = [
      [I.item, cam.name],
      [I.stocked, day(stocked)],
      [I.expiry, cam.unknown ? I.unknownDate : day(simDate(state.loopStart + cam.shelfHours))],
      [I.left, cam.unknown ? I.unknownDate : isOver ? I.overTime(d, h) : I.leftTime(d, h)],
      [I.status, UI.status[status]],
    ];
    const isAlarm = status !== 'fresh';
    els.infoList.innerHTML = '';
    rows.forEach(([k, v], i) => {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      if (isAlarm && i >= 3) dd.className = 'alarm';
      els.infoList.append(dt, dd);
    });
  }

  function openCam(i) {
    state.open = i;
    els.stage.classList.add('has-open');
    cams.forEach((c, j) => c.el.cell.classList.toggle('is-open', j === i));
    els.info.hidden = false;
    renderInfo();
    state.lastFrame = 0;
  }

  function closeCam() {
    const was = state.open;
    state.open = -1;
    els.stage.classList.remove('has-open');
    cams.forEach(c => c.el.cell.classList.remove('is-open'));
    els.info.hidden = true;
    state.lastFrame = 0;
    if (cams[was]) cams[was].el.cell.focus();
  }

  els.infoClose.addEventListener('click', closeCam);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && state.open >= 0) closeCam();
  });

  /* ---------- loop ---------- */

  function fitScreen() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.round(els.stage.clientWidth * dpr);
    if (els.screen.width !== size) {
      els.screen.width = els.screen.height = size;
      state.lastFrame = 0;
    }
  }
  new ResizeObserver(fitScreen).observe(els.stage);

  function draw(t) {
    const S = els.screen.width;
    screen.imageSmoothingEnabled = true;
    screen.fillStyle = '#000';
    screen.fillRect(0, 0, S, S);
    const isRestocking = state.restockUntil > 0;
    const cellW = S / COLS, cellH = S / ROWS;
    const list = state.open >= 0 ? [state.open] : cams.map((_, i) => i);
    for (const i of list) {
      const isOpen = state.open >= 0;
      const [w, h] = isOpen ? LOW.open : LOW.grid;
      if (isRestocking) staticNoise(w >> 1, h >> 1);
      else capture(cams[i], w, h, t);
      const x = isOpen ? 0 : (i % COLS) * cellW;
      const y = isOpen ? 0 : Math.floor(i / COLS) * cellH;
      const dw = isOpen ? S : cellW, dh = isOpen ? S * 0.75 : cellH;
      screen.drawImage(buf, 0, 0, buf.width, buf.height, x, y, dw, dh);
    }
    // Thin black seams between monitors
    if (state.open < 0) {
      screen.fillStyle = '#000';
      const seam = Math.max(1, S / 400);
      for (let c = 1; c < COLS; c++) screen.fillRect(c * cellW - seam / 2, 0, seam, S);
      for (let r = 1; r < ROWS; r++) screen.fillRect(0, r * cellH - seam / 2, S, seam);
    }
  }

  function tick(now) {
    const dt = Math.min((now - state.lastTick) / 1000, 0.25);
    state.lastTick = now;
    const t = now / 1000;

    if (state.restockUntil > 0) {
      if (now >= state.restockUntil) {
        // Fresh groceries: everything starts its shelf life again from now
        state.restockUntil = 0;
        state.loopStart = state.simHours;
        els.signal.hidden = true;
        if (state.open >= 0) renderInfo();
      }
    } else {
      state.simHours += dt * F.hoursPerSecond;
      if (state.simHours - state.loopStart >= F.loopHours) {
        state.restockUntil = now + F.restockSeconds * 1000;
        els.signalTitle.textContent = UI.noSignal;
        els.signalSub.textContent = UI.restock;
        els.signal.hidden = false;
      }
    }

    // CCTV runs at a low frame rate; that stutter is part of the look
    if (now - state.lastFrame >= 1000 / F.fps) {
      state.lastFrame = now;
      draw(t);
      cams.forEach(c => updateOverlay(c, t));
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
        cam.crop = cropFor(img);
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

  buildCells();
  els.infoClose.textContent = UI.info.close;
  els.signalTitle.textContent = UI.noSignal;
  els.signalSub.textContent = UI.loading;
  els.signal.hidden = false;
  fitScreen();

  Promise.all(cams.map(loadImage)).then(results => {
    els.signal.hidden = results.every(Boolean);
    if (!results.every(Boolean)) els.signalSub.textContent = UI.loadFailed;
    state.lastTick = performance.now();
    requestAnimationFrame(tick);
  });
})();
