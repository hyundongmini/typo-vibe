// First person: you look down at your cat on your lap; your hands come in from the bottom.
// Flat print style: a small palette on cream paper, one black ink outline on every shape.
window.Scene = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const INK = '#1b1916', CREAM = '#ece0c6', BRICK = '#a9412b', MUSTARD = '#e3b448', NAVY = '#28367a';
  const SKIN = '#f2d6bd', SLEEVE = '#f1ebdd', BLANKET = '#f4efe4';
  const CAT = '#f7f2e6', CAT_GREY = '#8a8a84', PINK = '#efa7b1', IRIS = '#c3c46a';

  // The cat's ear centres in the 1000 x 700 view (left / right of the screen)
  const EARS = [{ x: 404, y: 188 }, { x: 596, y: 188 }];
  // Where each arm comes in from, just below the screen
  const SHOULDERS = [{ x: 20, y: 780 }, { x: 980, y: 780 }];

  let svg, room, art, catG, words, bubbles, dust, clockHands, notice;
  const arms = [], hands = [], ears = [];
  const live = { words: [], dust: [], bubbles: [] };
  let shakeUntil = 0;
  let awayK = 0, isAway = false;

  const el = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  };

  /* ---------- build ---------- */

  function buildRoom(ui) {
    const still = el('g', { filter: 'url(#wobble)' }, art);
    el('rect', { width: 1000, height: 700, fill: CREAM, class: 'no-ink' }, still);
    // Solid black band across the ceiling, like the night sky in a print
    el('rect', { width: 1000, height: 70, fill: INK, class: 'no-ink' }, still);
    // The front door with the works notice, far side of the room
    el('rect', { x: 64, y: 120, width: 150, height: 330, rx: 3, fill: MUSTARD }, still);
    el('rect', { x: 92, y: 280, width: 94, height: 170, fill: NAVY }, still);
    el('circle', { cx: 194, cy: 300, r: 6, fill: INK }, still);
    notice = el('g', {}, art);
    el('rect', { x: 86, y: 152, width: 106, height: 84, fill: '#f7f1e3' }, notice);
    el('rect', { x: 126, y: 146, width: 26, height: 10, fill: '#e9d9a6' }, notice);
    ui.notice.forEach((line, i) => {
      const t = el('text', { x: 139, y: 172 + i * 17, 'text-anchor': 'middle', 'font-size': i === 0 ? 13 : 11, 'font-weight': i === 0 ? 900 : 600, fill: i === 0 ? BRICK : INK }, notice);
      t.textContent = line;
    });
    // Wall clock: the working day runs on it
    const clock = el('g', {}, art);
    el('circle', { cx: 840, cy: 180, r: 52, fill: '#f7f1e3' }, clock);
    for (let h = 0; h < 12; h++) {
      const a = (h / 12) * Math.PI * 2;
      el('line', { x1: 840 + Math.sin(a) * 40, y1: 180 - Math.cos(a) * 40, x2: 840 + Math.sin(a) * 46, y2: 180 - Math.cos(a) * 46, stroke: INK, 'stroke-width': 3 }, clock);
    }
    clockHands = {
      hour: el('line', { x1: 840, y1: 180, x2: 840, y2: 152, stroke: INK, 'stroke-width': 5, 'stroke-linecap': 'round' }, clock),
      minute: el('line', { x1: 840, y1: 180, x2: 840, y2: 140, stroke: BRICK, 'stroke-width': 3, 'stroke-linecap': 'round' }, clock),
    };
    el('circle', { cx: 840, cy: 180, r: 4, fill: INK }, clock);

    // Your lap under the duvet
    const bed = el('g', { filter: 'url(#wobble)' }, art);
    el('path', { d: 'M-20 470 Q200 410 500 430 Q800 410 1020 470 L1020 720 L-20 720 Z', fill: BLANKET }, bed);
    el('path', { d: 'M120 560 Q180 520 260 540 M760 540 Q830 520 890 570 M60 650 Q140 610 230 640 M790 640 Q860 610 950 650', fill: 'none', stroke: INK, 'stroke-width': 2.5, 'stroke-linecap': 'round' }, bed);
  }

  function buildCat() {
    catG = el('g', { id: 'cat' }, art);
    const body = el('g', { id: 'cat-body' }, catG);
    const bodyPath = 'M300 640 Q290 470 400 420 Q500 385 600 420 Q710 470 700 640 Z';
    el('clipPath', { id: 'cat-body-clip' }, body).appendChild(el('path', { d: bodyPath }));
    el('path', { d: bodyPath, fill: CAT }, body);
    // Grey saddle over the shoulder, like the photo
    el('ellipse', { cx: 660, cy: 470, rx: 70, ry: 60, fill: CAT_GREY, 'clip-path': 'url(#cat-body-clip)' }, body);
    // Chest fluff
    el('path', { d: 'M450 470 l10 16 l10 -14 l10 16 l10 -14 l10 16 l10 -14 l10 16', fill: 'none', stroke: INK, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }, body);
    // Front paws on the duvet
    [438, 562].forEach(x => {
      el('path', { d: `M${x - 44} 660 Q${x - 46} 610 ${x} 606 Q${x + 46} 610 ${x + 44} 660 Z`, fill: CAT }, body);
      el('path', { d: `M${x - 14} 646 v12 M${x + 14} 646 v12`, fill: 'none', stroke: INK, 'stroke-width': 2.5, 'stroke-linecap': 'round' }, body);
    });
    const tail = el('g', { id: 'cat-tail' }, catG);
    el('path', { d: 'M690 600 Q800 610 820 540 Q830 500 800 480', fill: 'none', stroke: INK, 'stroke-width': 40, 'stroke-linecap': 'round' }, tail);
    el('path', { d: 'M690 600 Q800 610 820 540 Q830 500 800 480', fill: 'none', stroke: CAT, 'stroke-width': 34, 'stroke-linecap': 'round' }, tail);
    el('path', { d: 'M822 520 Q828 498 800 480', fill: 'none', stroke: CAT_GREY, 'stroke-width': 34, 'stroke-linecap': 'round' }, tail);

    const head = el('g', { id: 'cat-head' }, catG);
    EARS.forEach((p, i) => {
      const side = i ? 1 : -1;
      const ear = el('g', {}, head);
      // Big pointed ears: grey outside, pink inside
      el('path', { d: `M${-46 * side} 52 Q${-40 * side} -40 ${-8 * side} -78 Q${30 * side} -30 ${50 * side} 40 Z`, fill: CAT_GREY }, ear);
      el('path', { d: `M${-26 * side} 36 Q${-22 * side} -20 ${-8 * side} -48 Q${16 * side} -14 ${28 * side} 30 Z`, fill: PINK }, ear);
      ears.push({ g: ear, x: p.x, y: p.y + 30, side });
    });
    const face = 'M350 300 Q350 210 430 196 Q500 186 570 196 Q650 210 650 300 Q664 380 600 420 Q500 452 400 420 Q336 380 350 300 Z';
    el('clipPath', { id: 'cat-head-clip' }, head).appendChild(el('path', { d: face }));
    el('path', { d: face, fill: CAT }, head);
    // Grey cap over the top of the head, reaching down past the left eye
    const cap = el('g', { 'clip-path': 'url(#cat-head-clip)' }, head);
    el('path', { d: 'M330 180 L520 180 Q500 230 470 250 Q440 270 430 330 Q400 340 360 330 Z', fill: CAT_GREY }, cap);
    el('path', { d: 'M560 180 L680 180 L680 270 Q630 260 600 230 Q580 210 560 180 Z', fill: CAT_GREY }, cap);
    // Whiskers
    el('path', { d: 'M412 384 L330 372 M412 396 L332 402 M588 384 L670 372 M588 396 L668 402', fill: 'none', stroke: INK, 'stroke-width': 2, 'stroke-linecap': 'round' }, head);
    el('g', { id: 'cat-face' }, head);
  }

  // A hand seen from your side: palm and four fingers pointing away, thumb in
  function handShape(g, side) {
    el('path', { d: 'M-34 -8 Q-36 40 0 46 Q36 40 34 -8 Z', fill: SKIN }, g);
    [-25, -9, 7, 23].forEach((x, k) => {
      const len = [34, 44, 42, 32][k];
      el('rect', { x: x - 7, y: -8 - len, width: 15, height: len + 14, rx: 7.5, fill: SKIN }, g);
    });
    el('rect', { x: side < 0 ? 22 : -40, y: 2, width: 18, height: 36, rx: 9, fill: SKIN, transform: `rotate(${side < 0 ? -38 : 38} ${side < 0 ? 31 : -31} 20)` }, g);
  }

  function buildHands() {
    const layer = el('g', {}, art);
    for (let i = 0; i < 2; i++) {
      // Ink outline underneath, sleeve on top: an outlined tube
      const outline = el('path', { fill: 'none', stroke: INK, 'stroke-width': 62, 'stroke-linecap': 'round' }, layer);
      const sleeve = el('path', { fill: 'none', stroke: SLEEVE, 'stroke-width': 56, 'stroke-linecap': 'round' }, layer);
      arms.push([outline, sleeve]);
      const g = el('g', { class: 'hand' }, layer);
      handShape(g, i ? 1 : -1);
      hands.push(g);
      setHand(i, null);
    }
  }

  function init(root, ui) {
    svg = root;
    el('defs', {}, svg).innerHTML = `
      <filter id="wobble" x="-2%" y="-2%" width="104%" height="104%">
        <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="7" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="3.5" xChannelSelector="R" yChannelSelector="G"/>
      </filter>
      <filter id="grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="3" stitchTiles="stitch"/>
        <feColorMatrix type="matrix" values="0 0 0 0 0.12  0 0 0 0 0.09  0 0 0 0 0.05  0 0 0 0.6 0"/>
      </filter>`;
    room = el('g', { id: 'room' }, svg);
    art = el('g', {}, room);
    buildRoom(ui);
    buildCat();
    dust = el('g', {}, room);
    words = el('g', { class: 'words' }, svg);
    buildHands();
    bubbles = el('g', {}, svg);
    el('rect', { width: 1000, height: 700, filter: 'url(#grain)', class: 'grain no-ink' }, svg);
    setCat({ mood: 'grumpy', flat: 0, puff: 0 });
  }

  /* ---------- the cat ---------- */

  const EYES = {
    // Looking up at you, unimpressed
    grumpy: (lx, rx) => `
      <circle cx="${lx}" cy="316" r="27" fill="${IRIS}"/><ellipse cx="${lx}" cy="312" rx="8" ry="18" fill="${INK}" class="no-ink"/>
      <circle cx="${rx}" cy="316" r="27" fill="${IRIS}"/><ellipse cx="${rx}" cy="312" rx="8" ry="18" fill="${INK}" class="no-ink"/>
      <path d="M${lx - 30} 298 L${lx + 28} 306 M${rx + 30} 298 L${rx - 28} 306" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`,
    alarmed: (lx, rx) => `
      <circle cx="${lx}" cy="314" r="30" fill="${IRIS}"/><circle cx="${lx}" cy="312" r="20" fill="${INK}" class="no-ink"/><circle cx="${lx - 7}" cy="304" r="5" fill="#fff" class="no-ink"/>
      <circle cx="${rx}" cy="314" r="30" fill="${IRIS}"/><circle cx="${rx}" cy="312" r="20" fill="${INK}" class="no-ink"/><circle cx="${rx - 7}" cy="304" r="5" fill="#fff" class="no-ink"/>`,
    panic: (lx, rx) => `
      <circle cx="${lx}" cy="312" r="33" fill="${IRIS}"/><circle cx="${lx}" cy="312" r="27" fill="${INK}" class="no-ink"/><circle cx="${lx - 9}" cy="302" r="6" fill="#fff" class="no-ink"/>
      <circle cx="${rx}" cy="312" r="33" fill="${IRIS}"/><circle cx="${rx}" cy="312" r="27" fill="${INK}" class="no-ink"/><circle cx="${rx - 9}" cy="302" r="6" fill="#fff" class="no-ink"/>`,
    calm: (lx, rx) => `
      <path d="M${lx - 24} 318 Q${lx} 334 ${lx + 24} 318 M${rx - 24} 318 Q${rx} 334 ${rx + 24} 318" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/>`,
  };
  const MOUTH = {
    closed: `<path d="M488 356 Q500 350 512 356 Q508 370 500 372 Q492 370 488 356 Z" fill="${PINK}"/>
      <path d="M482 390 Q492 398 500 386 Q508 398 518 390" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>
      <circle cx="532" cy="404" r="5" fill="#6f7277" class="no-ink"/>`,
    hiss: `<path d="M488 354 Q500 348 512 354 Q508 368 500 370 Q492 368 488 354 Z" fill="${PINK}"/>
      <path d="M476 384 Q500 424 524 384 Z" fill="#7a2e38"/><path d="M482 386 l4 10 l4 -10 M510 386 l4 10 l4 -10" fill="#fff"/>
      <circle cx="532" cy="404" r="5" fill="#6f7277" class="no-ink"/>`,
  };

  let catKey = '';
  // flat: 0 ears up .. 1 flattened sideways; puff: 0 .. 1 fur standing up
  function setCat({ mood, flat, puff }) {
    const key = `${mood}|${Math.round(flat * 10)}|${Math.round(puff * 10)}`;
    if (key === catKey) return;
    catKey = key;
    svg.querySelector('#cat-face').innerHTML = EYES[mood](446, 554) + (mood === 'panic' ? MOUTH.hiss : MOUTH.closed);
    ears.forEach(e => e.g.setAttribute('transform', `translate(${e.x} ${e.y + flat * 14}) rotate(${e.side * (6 + flat * 62)})`));
    svg.querySelector('#cat-body').setAttribute('transform', `translate(500 640) scale(${1 + puff * 0.1} ${1 + puff * 0.14}) translate(-500 -640)`);
  }

  function setAway(away) {
    isAway = away;
  }

  /* ---------- hands ---------- */

  // at: { x, y } where the hand is, or null to leave it resting out of view
  function setHand(i, at, coveringEar) {
    const s = SHOULDERS[i];
    const side = i ? 1 : -1;
    const p = at || { x: s.x - side * 60, y: 800 };
    // Arms come in from the sides of the screen with the elbow low, so they don't cover the cat's face
    const cx = s.x - side * 60, cy = Math.max(p.y + 120, 560);
    arms[i].forEach(a => a.setAttribute('d', `M${s.x} ${s.y} Q${cx} ${cy} ${p.x} ${p.y + 30}`));
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

  // The part of the room actually on screen (a phone crops the sides)
  function visible() {
    const r = svg.getBoundingClientRect();
    const a = toSvg(r.left, r.top), b = toSvg(r.right, r.bottom);
    return { x0: Math.max(0, a.x), y0: Math.max(0, a.y), x1: Math.min(1000, b.x), y1: Math.min(700, b.y) };
  }

  /* ---------- noise lettering, bubbles, room ---------- */

  const WORD_STYLE = {
    drill: { size: 90, fill: INK, life: 0.8 },
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
    const y = kind === 'purr' ? 470 : 110 + Math.random() * 300;
    live.words.push({ t, x, y, age: 0, life: st.life, kind, rot: (Math.random() - 0.5) * 18, drift: kind === 'purr' ? -30 : -80 - Math.random() * 60 });
  }

  function bubble(text) {
    const width = 30 + text.length * 22;
    const v = visible();
    const x = Math.min(640, v.x1 - width - 10), y = 150;
    const g = el('g', {}, bubbles);
    el('rect', { x, y: y - 30, width, height: 46, rx: 22, fill: '#f7f1e3', stroke: INK, 'stroke-width': 3 }, g);
    el('path', { d: `M${x + 16} ${y + 14} L${x - 10} ${y + 34} L${x + 34} ${y + 14} Z`, fill: '#f7f1e3', stroke: INK, 'stroke-width': 3, 'stroke-linejoin': 'round' }, g);
    el('rect', { x: x + 14, y: y + 8, width: 22, height: 8, fill: '#f7f1e3' }, g);
    const t = el('text', { x: x + width / 2, y: y + 2, 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 800, fill: INK }, g);
    t.textContent = text;
    live.bubbles.forEach(b => b.g.remove());
    live.bubbles = [{ g, age: 0 }];
  }

  function dustFall(strength) {
    for (let i = 0; i < Math.max(1, Math.round(3 * strength)); i++) {
      const d = el('rect', { width: 4, height: 4, fill: CREAM, class: 'no-ink' }, dust);
      live.dust.push({ d, x: Math.random() * 1000, y: 70, v: 70 + Math.random() * 90 });
    }
  }

  function setClock(hours) {
    const h = (hours % 12) / 12, m = hours % 1;
    clockHands.hour.setAttribute('transform', `rotate(${h * 360} 840 180)`);
    clockHands.minute.setAttribute('transform', `rotate(${m * 360} 840 180)`);
  }

  function catShake() {
    shakeUntil = performance.now() + 700;
  }

  // loud: 0..1 what's coming out of the speakers right now
  function frame(dt, now, loud) {
    const amp = reduceMotion ? 0 : loud * 9;
    room.setAttribute('transform', amp ? `translate(${(Math.random() - 0.5) * amp} ${(Math.random() - 0.5) * amp})` : '');
    notice.setAttribute('transform', reduceMotion ? '' : `rotate(${Math.sin(now / 60) * loud * 4} 139 150)`);

    // The cat slinks off under the bed when it's had enough, and creeps back later
    awayK += ((isAway ? 1 : 0) - awayK) * Math.min(1, dt * (isAway ? 6 : 2));
    const head = now < shakeUntil && !reduceMotion ? `rotate(${Math.sin(now / 35) * 10} 500 420)` : '';
    svg.querySelector('#cat-head').setAttribute('transform', head);
    catG.setAttribute('transform', `translate(0 ${awayK * 520})`);
    catG.style.opacity = String(1 - awayK);
    svg.querySelector('#cat-tail').setAttribute('transform', reduceMotion ? '' : `rotate(${Math.sin(now / 380) * 5 * (1 + loud * 4)} 690 600)`);

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

  return { init, EARS, setHand, setCat, setAway, setClock, toSvg, word, bubble, catShake, frame };
})();
