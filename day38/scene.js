// First person: your own cat on your lap looking up at you, printed like a riso poster from
// a real photo. The ears fold back and the pupils go wide as the din gets to it.
// Your hands come in from the sides; the lettering and bubbles sit on top.
window.Scene = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const INK = '#1b1916', PAPER = '#ece0c6', BRICK = '#a9412b', NAVY = '#28367a';
  // Pupil size per mood, as a share of each eye's dark core printed in key
  const PUPIL = { calm: 0.5, grumpy: 1, alarmed: 1.5, panic: 2 };
  const FLAT_STEPS = 4;

  // The cat's ear centres in the 1000 x 700 view; moved to match the photo on every layout
  const EARS = [{ x: 404, y: 188 }, { x: 596, y: 188 }];
  // Where each arm comes in from, just below the screen
  const SHOULDERS = [{ x: 20, y: 780 }, { x: 980, y: 780 }];

  let svg, canvas, ctx, words, bubbles, dust, photo;
  let img = null, src = null, place = null;
  const prints = new Map();
  const arms = [], hands = [];
  const live = { words: [], dust: [], bubbles: [] };
  const cat = { mood: 'grumpy', flat: 0, puff: 0 };
  let shakeUntil = 0;
  let awayK = 0, isAway = false;

  const el = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  };

  /* ---------- the printed cat ---------- */

  // Fit the photo: as big as the window allows with both ears well on screen, sitting on the
  // bottom. On a phone that means the body runs off the sides.
  function layout() {
    const v = visible();
    const { crop, ears } = photo;
    const ratio = crop.h / crop.w;
    const span = (ears[1].x - ears[0].x) / crop.w;
    const w = Math.min((v.y1 - v.y0) / ratio, (0.78 * (v.x1 - v.x0)) / span);
    const mid = ((ears[0].x + ears[1].x) / 2 - crop.x) / crop.w;
    place = { x: 500 - w * mid, y: v.y1 - w * ratio, w, h: w * ratio };
    ears.forEach((e, i) => {
      EARS[i].x = place.x + ((e.x - crop.x) / crop.w) * w;
      EARS[i].y = place.y + ((e.y - crop.y) / crop.h) * place.h;
    });
    // Print at about the size it's shown, within reason for a phone's CPU
    const css = place.w * svg.getScreenCTM().a;
    const width = Math.round(Math.min(1100, Math.max(420, css * Math.min(2, devicePixelRatio || 1))));
    if (!src || Math.abs(src.w - width) / width > 0.15) {
      const k = 1 / crop.w, kh = 1 / crop.h;
      src = Riso.prepare(img, crop, width, photo.eyes.map(e => ({
        x: (e.x - crop.x) * k, y: (e.y - crop.y) * kh, rx: e.r * k, ry: e.r * kh, ink: 'mustard', below: e.below, core: e.core,
      })));
      prints.clear();
      warmUp();
    }
  }

  // Ears bend back around their base, strongest at the ear and fading out into the head
  function earWarp(flat) {
    if (!flat) return undefined;
    const s = src.w / photo.crop.w;
    const ears = photo.ears.map((e, i) => ({
      cx: (e.x - photo.crop.x) * s, cy: (e.y - photo.crop.y) * s,
      px: (e.pivot[0] - photo.crop.x) * s, py: (e.pivot[1] - photo.crop.y) * s,
      r: photo.earRadius * s,
      a: (i ? 1 : -1) * flat * 0.75,
    }));
    return (x, y) => {
      let sx = x, sy = y;
      for (const e of ears) {
        const d = Math.hypot(x - e.cx, y - e.cy);
        if (d > e.r * 1.6) continue;
        const t = Math.min(1, Math.max(0, (e.r * 1.6 - d) / (e.r * 1.1)));
        const f = t * t * (3 - 2 * t);
        const a = -e.a * f, c = Math.cos(a), si = Math.sin(a);
        const dx = x - e.px, dy = y - e.py + e.r * 0.25 * f * Math.abs(e.a);
        sx = e.px + dx * c - dy * si;
        sy = e.py + dx * si + dy * c;
      }
      return [sx, sy];
    };
  }

  function printFor(flatStep, mood) {
    const key = `${flatStep}|${mood}`;
    if (!prints.has(key)) {
      const c = document.createElement('canvas');
      c.width = src.w;
      c.height = src.h;
      Riso.print(c.getContext('2d'), src, { sample: earWarp(flatStep / FLAT_STEPS), pupil: PUPIL[mood] });
      prints.set(key, c);
    }
    return prints.get(key);
  }

  // Ink the other expressions in the background, a few at a time, before they're needed
  let warmTimer = 0;
  function warmUp() {
    clearTimeout(warmTimer);
    const todo = [];
    for (let f = 0; f <= FLAT_STEPS; f++) Object.keys(PUPIL).forEach(m => todo.push([f, m]));
    const next = () => {
      const job = todo.shift();
      if (!job || !src) return;
      printFor(...job);
      warmTimer = setTimeout(next, 30);
    };
    warmTimer = setTimeout(next, 30);
  }

  function resizeCanvas() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    if (img && img.complete && img.naturalWidth) layout();
  }

  /* ---------- build ---------- */

  // A hand seen from your side: palm and four fingers pointing away, thumb in
  function handShape(g, side) {
    el('path', { d: 'M-34 -8 Q-36 40 0 46 Q36 40 34 -8 Z' }, g);
    [-25, -9, 7, 23].forEach((x, k) => {
      const len = [34, 44, 42, 32][k];
      el('rect', { x: x - 7, y: -8 - len, width: 15, height: len + 14, rx: 7.5 }, g);
    });
    el('rect', { x: side < 0 ? 22 : -40, y: 2, width: 18, height: 36, rx: 9, transform: `rotate(${side < 0 ? -38 : 38} ${side < 0 ? 31 : -31} 20)` }, g);
  }

  function buildHands() {
    // One flat ink for both arms, overprinted on the cat
    const layer = el('g', { class: 'hands', fill: BRICK }, svg);
    for (let i = 0; i < 2; i++) {
      arms.push(el('path', { fill: 'none', stroke: BRICK, 'stroke-width': 58, 'stroke-linecap': 'round' }, layer));
      const g = el('g', {}, layer);
      handShape(g, i ? 1 : -1);
      hands.push(g);
      setHand(i, null);
    }
  }

  // Resolves once the photo is printed and the ears are where the photo has them
  function init(root, ui, photoConfig) {
    svg = root;
    photo = photoConfig;
    canvas = document.getElementById('print');
    ctx = canvas.getContext('2d');
    el('defs', {}, svg).innerHTML = `
      <filter id="grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="3" stitchTiles="stitch"/>
        <feColorMatrix type="matrix" values="0 0 0 0 0.12  0 0 0 0 0.09  0 0 0 0 0.05  0 0 0 0.6 0"/>
      </filter>`;
    dust = el('g', {}, svg);
    words = el('g', { class: 'words' }, svg);
    buildHands();
    bubbles = el('g', {}, svg);
    el('rect', { x: -500, y: -500, width: 2000, height: 1700, filter: 'url(#grain)', class: 'grain' }, svg);
    addEventListener('resize', resizeCanvas);
    resizeCanvas();
    img = new Image();
    img.src = photo.file;
    return img.decode().then(() => {
      layout();
      printFor(0, cat.mood);
    });
  }

  /* ---------- the cat ---------- */

  // flat: 0 ears up .. 1 folded back; puff: 0 .. 1 fur standing up
  function setCat({ mood, flat, puff }) {
    cat.mood = mood;
    cat.flat = flat;
    cat.puff = puff;
  }

  function setAway(away) {
    isAway = away;
  }

  function drawCat(now, loud) {
    const m = svg.getScreenCTM();
    const dpr = canvas.width / innerWidth;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!src || awayK > 0.995) return;
    const pr = printFor(Math.round(cat.flat * FLAT_STEPS), cat.mood);
    const amp = reduceMotion ? 0 : loud * 9;
    ctx.setTransform(m.a * dpr, 0, 0, m.d * dpr, m.e * dpr, m.f * dpr);
    // Pivot at the bottom middle of the photo: the cat sits on your lap
    const bx = place.x + place.w / 2, by = place.y + place.h;
    ctx.translate(bx + (Math.random() - 0.5) * amp, by + (Math.random() - 0.5) * amp + awayK * place.h * 0.8);
    if (now < shakeUntil && !reduceMotion) ctx.rotate(Math.sin(now / 35) * 0.06);
    const breathe = cat.mood === 'calm' && !reduceMotion ? Math.sin(now / 700) * 0.006 : 0;
    ctx.scale(1 + cat.puff * 0.05, 1 + cat.puff * 0.07 + breathe);
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 1 - awayK;
    ctx.drawImage(pr, -place.w / 2, -place.h, place.w, place.h);
  }

  /* ---------- hands ---------- */

  // at: { x, y } where the hand is, or null to leave it resting out of view
  function setHand(i, at, coveringEar) {
    const s = SHOULDERS[i];
    const side = i ? 1 : -1;
    const p = at || { x: s.x - side * 60, y: 800 };
    // Arms come in from the sides of the screen with the elbow low, so they don't cover the cat's face
    const cx = s.x - side * 60, cy = Math.max(p.y + 120, 560);
    arms[i].setAttribute('d', `M${s.x} ${s.y} Q${cx} ${cy} ${p.x} ${p.y + 30}`);
    // Over an ear the hand turns to cup it
    const isCupping = coveringEar !== null && coveringEar !== undefined;
    const tilt = isCupping ? side * 24 : side * -8;
    hands[i].setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${tilt}) scale(${isCupping ? 1.2 : 1})`);
  }

  function toSvg(clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  // The part of the view actually on screen (a phone crops the sides)
  function visible() {
    const r = svg.getBoundingClientRect();
    const a = toSvg(r.left, r.top), b = toSvg(r.right, r.bottom);
    return { x0: Math.max(0, a.x), y0: Math.max(0, a.y), x1: Math.min(1000, b.x), y1: Math.min(700, b.y) };
  }

  /* ---------- noise lettering, bubbles, dust ---------- */

  const WORD_STYLE = {
    drill: { size: 90, fill: INK, life: 0.8 },
    hammer: { size: 100, fill: BRICK, life: 0.7 },
    purr: { size: 30, fill: BRICK, life: 1.6 },
    flee: { size: 80, fill: NAVY, life: 1.2 },
  };

  function word(kind, text, loud) {
    const st = WORD_STYLE[kind];
    const t = el('text', { 'text-anchor': 'middle', 'font-weight': 900, fill: st.fill, 'font-size': (st.size * (0.5 + loud * 0.7)).toFixed(0) }, words);
    t.textContent = text;
    const v = visible();
    const w = v.x1 - v.x0;
    // The shaft is beyond the right-hand wall; the din comes from there
    const x = kind === 'purr' ? 500 + (Math.random() - 0.5) * 120 : v.x0 + w * (0.35 + Math.random() * 0.6);
    const y = kind === 'purr' ? place.y + place.h * 0.62 : v.y0 + 110 + Math.random() * 300;
    live.words.push({ t, x, y, age: 0, life: st.life, kind, rot: (Math.random() - 0.5) * 18, drift: kind === 'purr' ? -30 : -80 - Math.random() * 60 });
  }

  function bubble(text) {
    const width = 30 + text.length * 22;
    const v = visible();
    const x = Math.min(640, v.x1 - width - 10), y = Math.max(v.y0 + 70, place.y + 40);
    const g = el('g', {}, bubbles);
    el('rect', { x, y: y - 30, width, height: 46, rx: 22, fill: '#f7f1e3', stroke: INK, 'stroke-width': 3 }, g);
    el('path', { d: `M${x + 16} ${y + 14} L${x - 10} ${y + 34} L${x + 34} ${y + 14} Z`, fill: '#f7f1e3', stroke: INK, 'stroke-width': 3, 'stroke-linejoin': 'round' }, g);
    el('rect', { x: x + 14, y: y + 8, width: 22, height: 8, fill: '#f7f1e3' }, g);
    const t = el('text', { x: x + width / 2, y: y + 2, 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 800, fill: INK }, g);
    t.textContent = text;
    live.bubbles.forEach(b => b.g.remove());
    live.bubbles = [{ g, age: 0 }];
  }

  // Plaster dust shaken loose from the ceiling
  function dustFall(strength) {
    const v = visible();
    for (let i = 0; i < Math.max(1, Math.round(3 * strength)); i++) {
      const d = el('rect', { width: 3, height: 3, fill: INK }, dust);
      live.dust.push({ d, x: v.x0 + Math.random() * (v.x1 - v.x0), y: v.y0, v: 70 + Math.random() * 90 });
    }
  }

  function catShake() {
    shakeUntil = performance.now() + 700;
  }

  // loud: 0..1 what's coming out of the speakers right now
  function frame(dt, now, loud) {
    // The cat slinks off under the bed when it's had enough, and creeps back later
    awayK += ((isAway ? 1 : 0) - awayK) * Math.min(1, dt * (isAway ? 6 : 2));
    drawCat(now, loud);
    const amp = reduceMotion ? 0 : loud * 6;
    words.setAttribute('transform', amp ? `translate(${(Math.random() - 0.5) * amp} ${(Math.random() - 0.5) * amp})` : '');

    if (!reduceMotion && Math.random() < loud * dt * 6) dustFall(loud);

    live.words = live.words.filter(w => {
      w.age += dt;
      const k = w.age / w.life;
      if (k >= 1) {
        w.t.remove();
        return false;
      }
      const pop = Math.min(1, w.age / 0.1);
      const jit = reduceMotion ? 0 : (Math.random() - 0.5) * 8 * (w.kind === 'purr' ? 0.2 : 1);
      w.t.setAttribute('transform', `translate(${w.x + w.drift * k + jit} ${w.y + jit}) rotate(${w.rot}) scale(${0.6 + pop * 0.4})`);
      w.t.setAttribute('opacity', (1 - k * k).toFixed(2));
      return true;
    });
    live.dust = live.dust.filter(p => {
      p.y += p.v * dt;
      p.d.setAttribute('x', p.x.toFixed(1));
      p.d.setAttribute('y', p.y.toFixed(1));
      if (p.y > 700) {
        p.d.remove();
        return false;
      }
      return true;
    });
    live.bubbles = live.bubbles.filter(b => {
      b.age += dt;
      b.g.setAttribute('opacity', Math.min(1, (2.2 - b.age) / 0.4).toFixed(2));
      if (b.age > 2.2) {
        b.g.remove();
        return false;
      }
      return true;
    });
  }

  return { init, EARS, setHand, setCat, setAway, toSvg, word, bubble, catShake, frame };
})();
