// Pixel scene renderer. Draws in grayscale on an offscreen buffer, then
// ordered-dithers to pure black/white. Animates at a choppy 12fps.
window.Scene = (() => {
  const W = 192, H = 128;
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  const HOLE = { x: 96, y: 62, rx: 44, ry: 34 };
  const INK = 0.04;
  const FPS = 12;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let out, ctx, bricks;
  let mode = { type: 'empty' };
  let knockStart = 0, knockAt = [];
  let lastFrame = 0;

  function init(canvas) {
    canvas.width = W;
    canvas.height = H;
    out = canvas.getContext('2d');
    const buf = document.createElement('canvas');
    buf.width = W;
    buf.height = H;
    ctx = buf.getContext('2d', { willReadFrequently: true });
    bricks = paintBricks();
    requestAnimationFrame(loop);
  }

  // Seeded PRNG so textures stay identical between frames
  function rng(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const gray = v => {
    const c = Math.round(Math.max(0, Math.min(1, v)) * 255);
    return `rgb(${c},${c},${c})`;
  };
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const easeOut = p => 1 - Math.pow(1 - clamp01(p), 3);

  function ell(x, y, rx, ry, v) {
    ctx.fillStyle = gray(v);
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function line(points, v, width) {
    ctx.strokeStyle = gray(v);
    ctx.lineWidth = width;
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }

  function outline(v = INK, width = 1) {
    ctx.strokeStyle = gray(v);
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function zoom(cx, cy, k) {
    ctx.translate(cx, cy);
    ctx.scale(k, k);
    ctx.translate(-cx, -cy);
  }

  function dither() {
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const on = d[i] / 255 > BAYER[(y & 3) * 4 + (x & 3)] ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = on;
        d[i + 3] = 255;
      }
    }
    out.putImageData(img, 0, 0);
  }

  /* ---------- wall & hole ---------- */

  const holePoints = (() => {
    const r = rng(7);
    const pts = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const k = 0.86 + r() * 0.22;
      pts.push([HOLE.x + Math.cos(a) * HOLE.rx * k, HOLE.y + Math.sin(a) * HOLE.ry * k]);
    }
    return pts;
  })();

  function holePath() {
    ctx.beginPath();
    holePoints.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  }

  function paintBricks() {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    const r = rng(3);
    g.fillStyle = gray(0.12);
    g.fillRect(0, 0, W, H);
    const bh = 10, bw = 26;
    for (let row = 0, y = 0; y < H; row++, y += bh) {
      for (let x = row % 2 ? -bw / 2 : 0; x < W; x += bw) {
        g.fillStyle = gray(0.8 + r() * 0.1);
        g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
        if (r() < 0.3) {
          g.fillStyle = gray(0.35);
          g.fillRect(x + 3 + r() * (bw - 8), y + 2 + r() * (bh - 5), 2, 1);
        }
      }
    }
    return c;
  }

  // Candlelight flickers: the lit radius breathes irregularly
  function wall(sec) {
    ctx.drawImage(bricks, 0, 0);
    const flick = 0.5 + 0.5 * Math.sin(sec * 7.3) * Math.sin(sec * 2.9 + 1.3);
    const grad = ctx.createRadialGradient(HOLE.x, HOLE.y, 42 + flick * 14, HOLE.x, HOLE.y, 130);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${0.42 + (1 - flick) * 0.12})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  function holeRim() {
    holePath();
    outline(1, 6);
    outline(0, 2);
  }

  function insideHole(draw) {
    ctx.save();
    holePath();
    ctx.clip();
    draw();
    const grad = ctx.createRadialGradient(HOLE.x, HOLE.y, HOLE.ry * 0.7, HOLE.x, HOLE.y, HOLE.rx * 1.1);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function dust(sec) {
    const r = rng(41);
    for (let i = 0; i < 14; i++) {
      const bx = r() * W, by = r() * H, sp = 2 + r() * 4, ph = r() * 6;
      const x = (bx + sec * sp) % W;
      const y = by + Math.sin(sec * 0.8 + ph) * 4;
      ell(x, y, 0.6, 0.6, 0.75);
    }
  }

  /* ---------- views through the hole ---------- */

  function fur(skin, seed) {
    const r = rng(seed);
    for (let i = 0; i < 300; i++) {
      const x = HOLE.x - 46 + r() * 92;
      const y = HOLE.y - 36 + r() * 72;
      line([[x, y], [x + (r() - 0.5) * 3, y + 3 + r() * 3]], skin + (r() - 0.5) * 0.35, 1);
    }
  }

  function silhouette(c, sec, enterP) {
    ctx.fillStyle = gray(0.04);
    ctx.fillRect(0, 0, W, H);
    if (!c) return;
    const off = c.seed || 0;
    const slide = (1 - easeOut(enterP)) * 60;
    const cx = HOLE.x + Math.sin(sec * 0.9 + off) * 2.5 + slide;
    const cy = HOLE.y + 8 + Math.sin(sec * 1.8 + off) * 1;
    const kind = c.lion ? 'lion' : c.silhouette;
    if (kind === 'lion') {
      const br = 1 + Math.sin(sec * 2.2) * 0.04;
      ell(cx, cy + 2, 32 * br, 28 * br, 0.29);
      ell(cx - 17, cy - 18, 6, 6, 0.38);
      ell(cx + 17, cy - 18, 6, 6, 0.38);
      ell(cx, cy, 18, 15, 0.38);
      // Eyes catching the candle
      if ((sec + off) % 4 > 0.2) {
        ell(cx - 7, cy - 3, 2, 1.4, 0.9);
        ell(cx + 7, cy - 3, 2, 1.4, 0.9);
      }
      return;
    }
    if (kind === 'scarf') {
      ell(cx, cy + 6, 30, 24, 0.28);
      ell(cx, cy + 2, 14, 17, 0.36);
    } else if (kind === 'cap') {
      ell(cx, cy + 4, 15, 19, 0.36);
      ell(cx, cy - 14, 17, 6, 0.43);
      ell(cx + 14, cy - 6, 5, 5, 0.33);
    } else {
      ctx.fillStyle = gray(0.28);
      ctx.beginPath();
      ctx.moveTo(cx - 26, cy + 40);
      ctx.quadraticCurveTo(cx - 28, cy - 30, cx, cy - 26);
      ctx.quadraticCurveTo(cx + 28, cy - 30, cx + 26, cy + 40);
      ctx.fill();
      ell(cx, cy + 2, 14, 18, 0.37);
    }
    ell(cx, cy + 34, 26, 12, 0.3);
  }

  function almond(cx, cy, rx, ry) {
    ctx.beginPath();
    ctx.moveTo(cx - rx, cy);
    ctx.quadraticCurveTo(cx, cy - ry * 2, cx + rx, cy);
    ctx.quadraticCurveTo(cx, cy + ry * 1.6, cx - rx, cy);
    ctx.closePath();
  }

  // Both eyes; moles always sit under the viewer's right eye
  function eyeView(c, sec) {
    const t = c.traits;
    const off = c.seed || 0;
    const cy = HOLE.y + 2;
    const rx = t.eyeShape === 'narrow' ? 15 : 12;
    const ry = t.eyeShape === 'narrow' ? 4 : 8;
    const blink = (sec + off) % 3.7 < 0.16;
    const lookX = Math.round(Math.sin(sec * 0.7 + off) * 2.4);
    const lookY = Math.round(Math.sin(sec * 0.45 + off * 2) * 1);
    ctx.fillStyle = gray(c.skin);
    ctx.fillRect(0, 0, W, H);
    if (c.lion) fur(c.skin, 11);

    [-21, 21].forEach(dx => {
      const cx = HOLE.x + dx;
      const thick = t.brow === 'thick';
      line([[cx - rx, cy - ry - 6], [cx - 3, cy - ry - 11], [cx + rx, cy - ry - 7]],
        c.lion ? 0.4 : INK, thick ? 3.5 : 1);

      if (blink) {
        ctx.beginPath();
        ctx.moveTo(cx - rx, cy);
        ctx.quadraticCurveTo(cx, cy + ry * 0.8, cx + rx, cy);
        outline(INK, 2);
        return;
      }
      ctx.fillStyle = gray(c.lion ? 0.25 : 0.98);
      almond(cx, cy, rx, ry);
      ctx.fill();
      ctx.save();
      almond(cx, cy, rx, ry);
      ctx.clip();
      const ir = c.lion ? 9 : Math.min(7, ry + 2);
      ell(cx + lookX, cy + lookY, ir, ir, c.lion ? 0.95 : 0.22);
      if (c.lion) {
        const sw = 2 + Math.sin(sec * 1.3) * 1.2;
        ctx.fillStyle = gray(0);
        ctx.fillRect(cx + lookX - sw / 2, cy - ry * 2, sw, ry * 4);
      } else {
        ell(cx + lookX, cy + lookY, ir * 0.45, ir * 0.45, 0);
        ell(cx + lookX + 2, cy + lookY - 2, 1.2, 1.2, 1);
      }
      ctx.restore();
      almond(cx, cy, rx, ry);
      outline(INK, 1.5);
    });

    if (c.lion) return;
    const mx = HOLE.x + 23, my = cy + ry + 7;
    if (t.mole === 'one') ell(mx, my, 1.8, 1.8, INK);
    if (t.mole === 'two') {
      ell(mx - 4, my, 1.8, 1.8, INK);
      ell(mx + 4, my + 1, 1.8, 1.8, INK);
    }
  }

  function mouthView(c, sec) {
    const t = c.traits;
    const cx = HOLE.x, cy = HOLE.y + 4;
    const breath = Math.sin(sec * 1.6 + (c.seed || 0)) * 1.2;
    ctx.fillStyle = gray(c.skin);
    ctx.fillRect(0, 0, W, H);

    if (c.lion) {
      fur(c.skin, 13);
      const pant = Math.abs(Math.sin(sec * 3)) * 3;
      ctx.fillStyle = gray(0.1);
      ctx.beginPath();
      ctx.moveTo(cx - 8, cy - 18);
      ctx.lineTo(cx + 8, cy - 18);
      ctx.lineTo(cx, cy - 9);
      ctx.fill();
      line([[cx, cy - 9], [cx, cy - 3]], 0.1, 1);
      ell(cx, cy + 4 + pant / 2, 20, 3 + pant, 0.05);
      line([[cx - 24, cy + 2], [cx - 10, cy - 1], [cx, cy - 3], [cx + 10, cy - 1], [cx + 24, cy + 2]], INK, 2);
      ctx.fillStyle = gray(1);
      [-11, 11].forEach(dx => {
        ctx.beginPath();
        ctx.moveTo(cx + dx - 3, cy - 1);
        ctx.lineTo(cx + dx + 3, cy - 1);
        ctx.lineTo(cx + dx, cy + 11);
        ctx.fill();
      });
      const r = rng(17);
      for (let i = 0; i < 7; i++) ell(cx - 26 + r() * 52, cy + 6 + r() * 14, 1.5 + r() * 2.5, 1 + r() * 2, 0.12);
      return;
    }

    const tone = { stained: 0.1, rouge: 0.42, plain: 0.82 }[t.lip];
    const s = t.smile === 'up' ? -6 : 0;
    const hw = 24;
    const low = 16 + s / 2 + breath;

    ctx.beginPath();
    ctx.moveTo(cx - hw, cy + s);
    ctx.quadraticCurveTo(cx - 12, cy - 9, cx - 3, cy - 7);
    ctx.lineTo(cx, cy - 5);
    ctx.lineTo(cx + 3, cy - 7);
    ctx.quadraticCurveTo(cx + 12, cy - 9, cx + hw, cy + s);
    ctx.quadraticCurveTo(cx, cy + low, cx - hw, cy + s);
    ctx.fillStyle = gray(tone);
    ctx.fill();
    outline(INK, 1.5);
    ctx.beginPath();
    ctx.moveTo(cx - hw, cy + s);
    ctx.quadraticCurveTo(cx, cy + (t.smile === 'up' ? 8 : 2) + breath * 0.6, cx + hw, cy + s);
    outline(t.lip === 'stained' ? 0.7 : INK, 1.5);

    if (t.lip === 'stained') {
      ell(cx + hw + 2, cy + s + 2, 2.5, 2, 0.2);
      ell(cx - hw - 1, cy + s + 3, 2, 1.5, 0.25);
      ell(cx + 12, cy + 14, 1.3, 1.3, 0.2);
    }
    if (t.lip === 'rouge') {
      // Gloss glint drifts with the candle
      const g = Math.sin(sec * 2) * 2;
      ell(cx - 6 + g, cy + 6 + s / 3, 7, 1.6, 1);
      ell(cx + 5, cy - 4, 3, 1, 1);
    }
  }

  // Fingers left→right: pinky, ring, middle, index; thumb on the right
  const FINGERS = { pinky: 0, ring: 1 };
  const RINGS = {
    silverRing: { metal: 'silver', finger: 'ring' },
    silverPinky: { metal: 'silver', finger: 'pinky' },
    goldRing: { metal: 'gold', finger: 'ring' },
  };

  function handView(c, sec, enterP) {
    const t = c.traits;
    const off = c.seed || 0;
    const reach = (1 - easeOut(enterP)) * 18;
    const cx = HOLE.x + Math.sin(sec * 9 + off) * 0.4;
    const cy = HOLE.y + 6 + Math.sin(sec * 1.2 + off) * 1.5 + reach;
    insideHole(() => {
      ctx.fillStyle = gray(0.04);
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = gray(c.skin * 0.75);
      ctx.fillRect(cx - 14, cy, 28, 40);
    });
    holeRim();

    ctx.save();
    if (c.lion) {
      zoom(cx, cy, 1.4);
      ell(cx, cy - 2, 22, 15, c.skin);
      [-15, -5, 5, 15].forEach((dx, i) => {
        const flex = Math.max(0, Math.sin(sec * 2 + i)) * 2;
        ell(cx + dx, cy - 14, 6, 6, c.skin + 0.05);
        ctx.fillStyle = gray(1);
        ctx.beginPath();
        ctx.moveTo(cx + dx - 2, cy - 18);
        ctx.quadraticCurveTo(cx + dx, cy - 30 - flex, cx + dx + 3, cy - 27 - flex);
        ctx.lineTo(cx + dx + 2, cy - 18);
        ctx.fill();
      });
      const r = rng(19);
      for (let i = 0; i < 80; i++) {
        const x = cx - 20 + r() * 40, y = cy - 16 + r() * 28;
        line([[x, y], [x + (r() - 0.5) * 2, y + 3]], c.skin - 0.15 + r() * 0.3, 1);
      }
      ctx.restore();
      return;
    }

    zoom(cx, cy, 1.5);
    const lengths = [15, 21, 24, 21];
    ell(cx, cy, 15, 13, c.skin);
    outline();
    lengths.forEach((len, i) => {
      // Fingers curl a little, one after another
      const curl = Math.max(0, Math.sin(sec * 1.4 + i * 0.6 + off)) * 2;
      const x = cx - 13 + i * 7;
      ctx.fillStyle = gray(c.skin);
      ctx.beginPath();
      ctx.roundRect(x, cy - 6 - len + curl, 6, len + 8 - curl, 3);
      ctx.fill();
      outline();
      ell(x + 3, cy - 3 - len + curl, 1.8, 2.2, Math.min(1, c.skin + 0.12));
    });
    ctx.fillStyle = gray(c.skin);
    ctx.beginPath();
    ctx.ellipse(cx + 17, cy - 2, 5, 10, -0.6, 0, Math.PI * 2);
    ctx.fill();
    outline();

    if (t.bracelet === 'beads') {
      for (let x = -12; x <= 12; x += 4) {
        ctx.beginPath();
        ctx.arc(cx + x, cy + 12, 2, 0, Math.PI * 2);
        ctx.fillStyle = gray(1);
        ctx.fill();
        outline();
      }
    }

    const ring = RINGS[t.ring];
    if (ring) {
      const fx = cx - 13 + FINGERS[ring.finger] * 7;
      const fy = cy - 12;
      if (ring.metal === 'silver') {
        ctx.fillStyle = gray(INK);
        ctx.fillRect(fx - 1, fy - 1, 8, 5);
        ctx.fillStyle = gray(1);
        ctx.fillRect(fx, fy, 6, 3);
      } else {
        ctx.fillStyle = gray(0.5);
        ctx.fillRect(fx - 1, fy - 1, 8, 5);
        ell(fx + 3, fy + 1, 3.2, 3.2, INK);
        ell(fx + 2, fy, 1, 1, 1);
      }
    }
    ctx.restore();
  }

  /* ---------- endings ---------- */

  const berries = (() => {
    const r = rng(37);
    const list = [];
    while (list.length < 46) {
      const x = 70 + r() * 110, y = 22 + r() * 58;
      const dx = (x - 125) / 54, dy = (y - 50) / 30;
      if (dx * dx + dy * dy < 1) list.push([x, y]);
    }
    return list;
  })();

  function tree(ripe, sec) {
    ctx.fillStyle = gray(0.06);
    ctx.fillRect(0, 0, W, H);
    ell(30, 22, 10, 10, 0.96);
    ell(34, 19, 9, 9, 0.06);
    ctx.fillStyle = gray(0.22);
    ctx.fillRect(0, 104, W, 24);
    ctx.fillStyle = gray(0.48);
    ctx.fillRect(12, 70, 36, 34);
    ctx.fillStyle = gray(0.62);
    ctx.fillRect(8, 64, 44, 7);
    line([[18, 80], [42, 80]], 0.3, 1);
    ctx.fillStyle = gray(0.1);
    ctx.beginPath();
    ctx.moveTo(118, 106);
    ctx.lineTo(122, 70);
    ctx.lineTo(112, 52);
    ctx.lineTo(118, 52);
    ctx.lineTo(126, 66);
    ctx.lineTo(136, 50);
    ctx.lineTo(141, 52);
    ctx.lineTo(130, 72);
    ctx.lineTo(134, 106);
    ctx.fill();
    const sway = Math.sin(sec * 0.8) * 1.5;
    [[100, 46, 28, 20], [148, 44, 30, 22], [125, 30, 34, 20], [124, 58, 40, 16]]
      .forEach(([x, y, rx, ry]) => ell(x + sway, y, rx, ry, 0.3));
    const dark = Math.round(berries.length * ripe);
    berries.forEach(([x, y], i) => ell(x + sway, y, 1.6, 1.6, i < dark ? 0.02 : 1));
  }

  function sealed() {
    insideHole(() => {
      ctx.fillStyle = gray(0.4);
      ctx.fillRect(0, 0, W, H);
      const r = rng(31);
      for (let i = 0; i < 40; i++) ell(HOLE.x - 34 + r() * 68, HOLE.y - 26 + r() * 52, 1 + r() * 3, 1 + r() * 2, 0.25 + r() * 0.3);
    });
    holeRim();
  }

  // Comic-style impact lines beside the hole for each knock, readable with sound off
  function knockMarks(now) {
    if (!knockStart) return;
    const since = (now - knockStart) / 1000;
    const hit = knockAt.some(t => since >= t && since < t + 0.12);
    if (!hit) return;
    const x = HOLE.x + HOLE.rx + 10, y = HOLE.y - HOLE.ry + 6;
    [-0.9, -0.3, 0.3].forEach(a => {
      const ang = a - Math.PI / 4;
      const seg = [[x + Math.cos(ang) * 6, y + Math.sin(ang) * 6], [x + Math.cos(ang) * 16, y + Math.sin(ang) * 16]];
      // White halo keeps the marks legible over the mortar lines
      line(seg, 1, 6);
      line(seg, 0.02, 3);
    });
    ell(x, y, 5, 5, 1);
    ell(x, y, 3.5, 3.5, 0.02);
  }

  /* ---------- loop ---------- */

  function render(now) {
    const sec = now / 1000;
    const since = (now - (mode.since || 0)) / 1000;
    if (mode.type === 'tree') {
      const ripe = mode.animate ? clamp01((since - 0.9) / 3.2) : mode.ripe;
      tree(ripe, sec);
      if (mode.animate && ripe >= 1 && mode.onDone) {
        const cb = mode.onDone;
        mode.onDone = null;
        cb();
      }
    } else {
      wall(sec);
      const enterP = since / 0.45;
      if (mode.type === 'sealed') {
        sealed();
      } else if (mode.type === 'candidate' && mode.view === 'hand') {
        handView(mode.c, sec, enterP);
      } else {
        insideHole(() => {
          const c = mode.c;
          if (mode.type === 'candidate' && (mode.view === 'eye' || mode.view === 'mouth')) {
            // Focus pull when the view changes
            const k = 1 + 0.18 * (1 - easeOut(since / 0.3));
            ctx.save();
            zoom(HOLE.x, HOLE.y, k);
            mode.view === 'eye' ? eyeView(c, sec) : mouthView(c, sec);
            ctx.restore();
          } else {
            silhouette(mode.type === 'candidate' ? c : null, sec, enterP);
            dust(sec);
          }
        });
        holeRim();
      }
    }
    if (!reduceMotion) knockMarks(now);
    dither();
  }

  function loop(now) {
    if (now - lastFrame >= 1000 / FPS) {
      lastFrame = now;
      render(reduceMotion ? 0 : now);
    }
    requestAnimationFrame(loop);
  }

  function set(next) {
    mode = { ...next, since: performance.now() };
    if (reduceMotion) mode.since = -1e6;
    render(reduceMotion ? 0 : performance.now());
  }

  return {
    init,
    knock: times => { knockStart = performance.now(); knockAt = times; },
    show: (c, view) => set({ type: 'candidate', c, view }),
    showEmpty: () => set({ type: 'empty' }),
    showSealed: () => set({ type: 'sealed' }),
    showTree: ripe => set({ type: 'tree', ripe, animate: false }),
    playTree: onDone => (reduceMotion ? (set({ type: 'tree', ripe: 1 }), onDone()) : set({ type: 'tree', animate: true, onDone })),
    size: { w: W, h: H },
  };
})();
