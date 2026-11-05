// The flat illustration: a room by the elevator shaft, you on the sofa, your cat on your lap.
// Drawn as SVG once; main.js moves the hands and sets moods, this file animates the rest.
window.Scene = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SKIN = '#f6d8c4', SLEEVE = '#f4f2ee', HAIR = '#3a2a24';
  // White short-haired cat with a grey cap and grey ears
  const CAT = '#fbfbf8', CAT_SHADE = '#dedfdc', CAT_GREY = '#8f9297';

  // Ear centres in the 1000 x 700 view; "left" means the left side of the screen (a mirror)
  const EARS = {
    myLeft: { x: 434, y: 262 },
    myRight: { x: 566, y: 262 },
    catLeft: { x: 470, y: 386 },
    catRight: { x: 530, y: 386 },
  };
  const SHOULDERS = [{ x: 434, y: 352 }, { x: 566, y: 352 }];
  // Hands resting on the cat's back
  const REST = [{ x: 446, y: 498 }, { x: 554, y: 498 }];

  let svg, room, words, dust, bubbles, lamp, frame;
  const arms = [], hands = [];
  const live = { words: [], dust: [], bubbles: [] };
  const swing = { lamp: 0, lampV: 0, frame: 0 };
  let catShakeUntil = 0;

  /* ---------- helpers ---------- */

  const el = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  };

  // A fluffy outline: an ellipse whose edge ripples, for the long-haired cat
  function fluff(cx, cy, rx, ry, bumps, amp) {
    let d = '';
    const n = bumps * 6;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = 1 + Math.sin(a * bumps) * amp + Math.sin(a * bumps * 2.3) * amp * 0.4;
      const x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k;
      d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return d + 'Z';
  }

  /* ---------- build ---------- */

  function buildRoom(notice) {
    el('rect', { width: 1000, height: 700, fill: '#efe6d8' }, room);
    // Faint wallpaper stripes
    for (let x = 20; x < 1000; x += 40) el('rect', { x, y: 0, width: 14, height: 580, fill: '#e9dfcf' }, room);
    el('rect', { y: 580, width: 1000, height: 120, fill: '#c9a983' }, room);
    el('rect', { y: 572, width: 1000, height: 10, fill: '#b8956c' }, room);

    // Front door with the works notice taped on
    el('rect', { x: 70, y: 200, width: 150, height: 380, rx: 4, fill: '#b98b5e' }, room);
    el('rect', { x: 82, y: 212, width: 126, height: 356, rx: 3, fill: 'none', stroke: '#a67a4f', 'stroke-width': 3 }, room);
    el('circle', { cx: 198, cy: 400, r: 7, fill: '#e6c56a' }, room);
    const paper = el('g', { transform: 'rotate(-3 145 290)' }, room);
    el('rect', { x: 92, y: 244, width: 106, height: 96, fill: '#fffdf7', stroke: '#ddd6c8' }, paper);
    el('rect', { x: 132, y: 238, width: 26, height: 10, fill: 'rgba(230, 220, 170, 0.8)' }, paper);
    notice.forEach((line, i) => {
      const t = el('text', { x: 145, y: 262 + i * 17, 'text-anchor': 'middle', 'font-size': i === 0 ? 13 : 10.5, 'font-weight': i === 0 ? 900 : 600, fill: i === 0 ? '#c0392b' : '#333' }, paper);
      t.textContent = line;
    });

    // Picture frame that goes crooked with every blow
    frame = el('g', {}, room);
    el('rect', { x: 770, y: 170, width: 120, height: 96, fill: '#7a5a3a' }, frame);
    el('rect', { x: 780, y: 180, width: 100, height: 76, fill: '#dfe8ee' }, frame);
    el('path', { d: fluff(830, 230, 26, 20, 7, 0.06), fill: '#fff' }, frame);
    el('path', { d: 'M812 214 L818 196 L826 212 M834 212 L842 196 L848 214', fill: '#fff', stroke: '#fff', 'stroke-width': 3, 'stroke-linejoin': 'round' }, frame);

    // Ceiling lamp, swinging from the top
    lamp = el('g', {}, room);
    el('line', { x1: 500, y1: 0, x2: 500, y2: 92, stroke: '#555', 'stroke-width': 3 }, lamp);
    el('path', { d: 'M466 92 L534 92 L556 132 L444 132 Z', fill: '#f3d27a' }, lamp);
    el('ellipse', { cx: 500, cy: 134, rx: 56, ry: 6, fill: '#fff3c4' }, lamp);
  }

  function buildSofaAndMe() {
    // Sofa
    el('rect', { x: 270, y: 330, width: 460, height: 180, rx: 44, fill: '#5b8c85' }, room);
    el('rect', { x: 236, y: 410, width: 84, height: 160, rx: 32, fill: '#527f79' }, room);
    el('rect', { x: 680, y: 410, width: 84, height: 160, rx: 32, fill: '#527f79' }, room);
    el('rect', { x: 296, y: 486, width: 408, height: 86, rx: 22, fill: '#4d7a74' }, room);
    [300, 690].forEach(x => el('rect', { x, y: 568, width: 14, height: 18, fill: '#3b2f26' }, room));

    // You
    el('rect', { x: 412, y: 480, width: 176, height: 64, rx: 26, fill: '#4a5568' }, room);
    [440, 530].forEach(x => el('rect', { x, y: 540, width: 30, height: 40, rx: 10, fill: '#4a5568' }, room));
    [436, 526].forEach(x => el('ellipse', { cx: x + 19, cy: 584, rx: 24, ry: 10, fill: '#f5f5f5' }, room));
    // Long hair falling behind the shoulders
    el('path', { d: 'M434 236 Q426 166 500 164 Q574 166 566 236 L584 336 Q544 352 500 346 Q456 352 416 336 Z', fill: HAIR }, room);
    el('rect', { x: 418, y: 326, width: 164, height: 176, rx: 64, fill: SLEEVE, stroke: '#dcd8d0', 'stroke-width': 2 }, room);
    el('rect', { x: 486, y: 296, width: 28, height: 40, fill: SKIN }, room);
    Object.entries({ myLeft: EARS.myLeft, myRight: EARS.myRight }).forEach(([, p]) => {
      el('ellipse', { cx: p.x, cy: p.y, rx: 12, ry: 18, fill: SKIN }, room);
      el('ellipse', { cx: p.x, cy: p.y, rx: 5, ry: 9, fill: '#e3a989' }, room);
    });
    el('circle', { cx: 500, cy: 250, r: 64, fill: SKIN }, room);
    // Hair on top, with strands swept to one side over the forehead
    el('path', { d: 'M437 248 Q432 180 500 176 Q568 180 563 248 Q558 214 534 202 Q516 214 486 210 Q458 214 437 248 Z', fill: HAIR }, room);
    el('path', { d: 'M486 204 Q462 214 452 262 Q446 226 462 204 Z', fill: HAIR }, room);
    el('g', { id: 'me-face' }, room);
  }

  function buildCat() {
    const cat = el('g', { id: 'cat' }, room);
    const tail = el('g', { id: 'cat-tail' }, cat);
    el('path', { d: 'M594 500 Q650 492 646 446 Q644 420 624 414', fill: 'none', stroke: CAT_SHADE, 'stroke-width': 24, 'stroke-linecap': 'round' }, tail);
    el('path', { d: 'M594 500 Q650 492 646 446 Q644 420 624 414', fill: 'none', stroke: CAT, 'stroke-width': 19, 'stroke-linecap': 'round' }, tail);
    el('path', { d: 'M636 428 Q630 416 622 414', fill: 'none', stroke: CAT_GREY, 'stroke-width': 17, 'stroke-linecap': 'round' }, tail);
    const body = el('g', { id: 'cat-body' }, cat);
    const bodyPath = fluff(500, 482, 104, 46, 9, 0.025);
    el('clipPath', { id: 'cat-body-clip' }, body).appendChild(el('path', { d: bodyPath }));
    el('path', { d: bodyPath, fill: CAT, stroke: CAT_SHADE, 'stroke-width': 2 }, body);
    // A grey saddle on the back
    el('ellipse', { cx: 574, cy: 452, rx: 46, ry: 20, fill: CAT_GREY, 'clip-path': 'url(#cat-body-clip)' }, body);
    [470, 530].forEach(x => el('ellipse', { cx: x, cy: 520, rx: 18, ry: 11, fill: CAT, stroke: CAT_SHADE, 'stroke-width': 2 }, body));
    const head = el('g', { id: 'cat-head' }, cat);
    ['catLeft', 'catRight'].forEach((name, i) => {
      const p = EARS[name];
      const ear = el('g', { id: `cat-ear-${i}`, transform: `translate(${p.x} ${p.y + 6})` }, head);
      // Big pointed ears, grey outside and pink inside
      el('path', { d: 'M-19 10 Q-12 -30 -2 -40 Q8 -30 19 10 Z', fill: CAT_GREY }, ear);
      el('path', { d: 'M-10 6 Q-6 -18 -2 -26 Q4 -18 10 6 Z', fill: '#f1b9c0' }, ear);
    });
    const headPath = fluff(500, 428, 52, 44, 8, 0.02);
    el('clipPath', { id: 'cat-head-clip' }, head).appendChild(el('path', { d: headPath }));
    el('path', { d: headPath, fill: CAT, stroke: CAT_SHADE, 'stroke-width': 2 }, head);
    // Grey cap over the top of the head, reaching down past the left eye
    const cap = el('g', { 'clip-path': 'url(#cat-head-clip)' }, head);
    el('ellipse', { cx: 468, cy: 394, rx: 34, ry: 24, fill: CAT_GREY }, cap);
    el('ellipse', { cx: 532, cy: 390, rx: 30, ry: 18, fill: CAT_GREY }, cap);
    el('ellipse', { cx: 470, cy: 414, rx: 16, ry: 12, fill: CAT_GREY }, cap);
    // The little grey spot by the mouth
    el('circle', { cx: 511, cy: 451, r: 3.2, fill: '#6f7277' }, head);
    el('g', { id: 'cat-face' }, head);
  }

  function buildArms() {
    const layer = el('g', {}, room);
    for (let i = 0; i < 2; i++) {
      arms.push(el('path', { fill: 'none', stroke: SLEEVE, 'stroke-width': 30, 'stroke-linecap': 'round' }, layer));
    }
    for (let i = 0; i < 2; i++) {
      const g = el('g', { class: 'hand', 'data-hand': i }, layer);
      // A bigger invisible circle makes the hand easy to grab with a finger
      el('circle', { r: 44, fill: 'transparent' }, g);
      el('ellipse', { rx: 25, ry: 28, fill: SKIN, stroke: '#d9a982', 'stroke-width': 2 }, g);
      el('ellipse', { cx: i ? -20 : 20, cy: 6, rx: 9, ry: 14, fill: SKIN, stroke: '#d9a982', 'stroke-width': 2, transform: `rotate(${i ? 30 : -30} ${i ? -20 : 20} 6)` }, g);
      hands.push(g);
    }
  }

  function init(root, ui) {
    svg = root;
    el('defs', {}, svg).innerHTML = `
      <filter id="muffle" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur id="muffle-blur" stdDeviation="0"/></filter>`;
    room = el('g', { id: 'room' }, svg);
    buildRoom(ui.notice);
    buildSofaAndMe();
    buildCat();
    buildArms();
    dust = el('g', {}, room);
    words = el('g', { filter: 'url(#muffle)', class: 'words' }, svg);
    bubbles = el('g', {}, svg);
    setMe('calm');
    setCat({ mood: 'grumpy', flat: 0, puff: 0 });
  }

  /* ---------- faces ---------- */

  const ME_FACES = {
    calm: `<circle cx="478" cy="257" r="6" fill="#5a3a2c"/><circle cx="522" cy="257" r="6" fill="#5a3a2c"/>
      <circle cx="480" cy="255" r="1.8" fill="#fff"/><circle cx="524" cy="255" r="1.8" fill="#fff"/>
      <path d="M468 252 Q478 246 489 252 M511 252 Q522 246 532 252" stroke="#2b2422" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M466 240 L489 238 M511 238 L534 240" stroke="#5a4036" stroke-width="3" fill="none" stroke-linecap="round"/>
      <ellipse cx="468" cy="276" rx="9" ry="5" fill="#f2a9a9" opacity="0.45"/><ellipse cx="532" cy="276" rx="9" ry="5" fill="#f2a9a9" opacity="0.45"/>
      <path d="M490 285 Q500 290 510 285" stroke="#c0706a" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    bothered: `<ellipse cx="478" cy="257" rx="4.5" ry="4" fill="#2b2422"/><ellipse cx="522" cy="257" rx="4.5" ry="4" fill="#2b2422"/>
      <path d="M465 238 L489 245 M535 238 L511 245" stroke="#2b2422" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <path d="M489 288 L511 288" stroke="#8a4b3a" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    pained: `<path d="M469 250 L483 256 L469 262 M531 250 L517 256 L531 262" stroke="#2b2422" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M465 236 L489 246 M535 236 L511 246" stroke="#2b2422" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <rect x="486" y="280" width="28" height="12" rx="3" fill="#fff" stroke="#8a4b3a" stroke-width="2.5"/>
      <path d="M495 280 V292 M505 280 V292" stroke="#8a4b3a" stroke-width="2"/>`,
    frantic: `<path d="M469 250 L483 256 L469 262 M531 250 L517 256 L531 262" stroke="#2b2422" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M464 234 L489 246 M536 234 L511 246" stroke="#2b2422" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M484 290 q4 -8 8 0 t8 0 t8 0 t8 0" stroke="#8a4b3a" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M556 222 q6 10 0 16 q-6 -6 0 -16 Z" fill="#7ec4ef"/><path d="M548 206 q5 8 0 13 q-5 -5 0 -13 Z" fill="#7ec4ef"/>
      <path d="M528 206 l10 0 M533 201 l0 10 M540 210 l8 0" stroke="#e74c3c" stroke-width="3" stroke-linecap="round"/>`,
    // Both your ears covered: the world goes soft
    relieved: `<path d="M470 257 Q478 251 486 257 M514 257 Q522 251 530 257" stroke="#2b2422" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <path d="M466 240 Q478 236 489 240 M511 240 Q522 236 534 240" stroke="#2b2422" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M492 286 Q500 290 508 286" stroke="#8a4b3a" stroke-width="3" fill="none" stroke-linecap="round"/>
      <ellipse cx="468" cy="274" rx="9" ry="5" fill="#f2a1a1" opacity="0.6"/><ellipse cx="532" cy="274" rx="9" ry="5" fill="#f2a1a1" opacity="0.6"/>`,
  };

  let meMood = '';
  function setMe(mood) {
    if (mood === meMood) return;
    meMood = mood;
    svg.querySelector('#me-face').innerHTML = ME_FACES[mood];
  }

  const CAT_EYES = {
    // Half-lidded, like the photo: unimpressed
    grumpy: `<circle cx="481" cy="426" r="8" fill="#c3c46a"/><ellipse cx="481" cy="427" rx="3" ry="6" fill="#222"/>
      <circle cx="519" cy="426" r="8" fill="#c3c46a"/><ellipse cx="519" cy="427" rx="3" ry="6" fill="#222"/>
      <path d="M471 419 L492 424 M529 419 L508 424" stroke="#9a948a" stroke-width="5" stroke-linecap="round"/>`,
    alarmed: `<circle cx="481" cy="426" r="10" fill="#c3c46a"/><circle cx="481" cy="426" r="7" fill="#222"/>
      <circle cx="519" cy="426" r="10" fill="#c3c46a"/><circle cx="519" cy="426" r="7" fill="#222"/>
      <circle cx="478" cy="423" r="2" fill="#fff"/><circle cx="516" cy="423" r="2" fill="#fff"/>`,
    panic: `<circle cx="481" cy="425" r="11.5" fill="#c3c46a"/><circle cx="481" cy="425" r="9" fill="#222"/>
      <circle cx="519" cy="425" r="11.5" fill="#c3c46a"/><circle cx="519" cy="425" r="9" fill="#222"/>
      <circle cx="477" cy="421" r="2.5" fill="#fff"/><circle cx="515" cy="421" r="2.5" fill="#fff"/>`,
    calm: `<path d="M472 426 Q481 432 490 426 M510 426 Q519 432 528 426" stroke="#8a8378" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
  };
  const CAT_MOUTH = {
    closed: `<path d="M494 436 Q500 433 506 436 Q504 443 500 444 Q496 443 494 436 Z" fill="#f0a3ae"/><path d="M493 448 Q500 452 500 444 Q500 452 507 448" stroke="#8a8378" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    hiss: `<path d="M496 437 L504 437 L500 442 Z" fill="#e8909c"/><path d="M490 446 Q500 462 510 446 Z" fill="#7a2e38"/><path d="M493 447 l2 5 l2 -5 M503 447 l2 5 l2 -5" fill="#fff"/>`,
  };

  let catKey = '';
  // flat: 0 ears up .. 1 flattened sideways; puff: 0 .. 1 fur standing up
  function setCat({ mood, flat, puff }) {
    const key = `${mood}|${Math.round(flat * 8)}|${Math.round(puff * 8)}`;
    if (key === catKey) return;
    catKey = key;
    svg.querySelector('#cat-face').innerHTML = CAT_EYES[mood] + (mood === 'panic' ? CAT_MOUTH.hiss : CAT_MOUTH.closed);
    ['catLeft', 'catRight'].forEach((name, i) => {
      const p = EARS[name];
      const side = i ? 1 : -1;
      svg.querySelector(`#cat-ear-${i}`).setAttribute('transform', `translate(${p.x} ${p.y + 6 + flat * 6}) rotate(${side * (8 + flat * 58)})`);
    });
    const s = 1 + puff * 0.12;
    svg.querySelector('#cat-body').setAttribute('transform', `translate(500 482) scale(${s} ${1 + puff * 0.18}) translate(-500 -482)`);
  }

  /* ---------- hands ---------- */

  // covering: the ear the hand sits on, or null
  function setHand(i, x, y, covering) {
    const s = SHOULDERS[i];
    const side = i ? 1 : -1;
    // Elbow bows outward so the arm reads as an arm, not a stick
    const cx = (i ? Math.max(s.x, x) : Math.min(s.x, x)) + side * 70;
    const cy = (s.y + y) / 2 + 30;
    arms[i].setAttribute('d', `M${s.x} ${s.y} Q${cx} ${cy} ${x} ${y}`);
    const scale = covering ? 1.08 : 1;
    const tilt = covering ? side * -10 : 0;
    hands[i].setAttribute('transform', `translate(${x} ${y}) rotate(${tilt}) scale(${scale})`);
    hands[i].classList.toggle('covering', !!covering);
  }

  // The part of the 1000 x 700 room actually on screen (a phone crops the sides)
  function visible() {
    const r = svg.getBoundingClientRect();
    const a = toSvg(r.left, r.top), b = toSvg(r.right, r.bottom);
    return { x0: Math.max(0, a.x), y0: Math.max(0, a.y), x1: Math.min(1000, b.x), y1: Math.min(700, b.y) };
  }

  function toSvg(clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  /* ---------- noise typography, bubbles, room motion ---------- */

  const WORD_STYLE = {
    drill: { size: 64, weight: 900, fill: '#1e1e1e', life: 0.9 },
    hammer: { size: 120, weight: 900, fill: '#c0392b', life: 0.7 },
    grind: { size: 58, weight: 800, fill: '#2b4a9e', life: 1.1 },
    motor: { size: 50, weight: 700, fill: '#555', life: 1.2 },
    muffled: { size: 46, weight: 500, fill: '#8a8070', life: 1.3 },
    purr: { size: 22, weight: 600, fill: '#b08a5a', life: 1.6 },
  };

  // loud: 0..1, how loud it is to you; the works are on the right, so words come from that side
  function word(kind, text, loud) {
    const st = WORD_STYLE[kind];
    const t = el('text', {
      'text-anchor': 'middle',
      'font-weight': st.weight,
      fill: st.fill,
      'font-size': (st.size * (0.55 + loud * 0.6)).toFixed(0),
    }, words);
    t.textContent = text;
    // From the right-hand side of whatever is on screen, where the shaft is
    const v = visible();
    const w = v.x1 - v.x0;
    const x = kind === 'purr' ? 560 + Math.random() * 40 : v.x0 + w * (0.45 + Math.random() * 0.45);
    const y = kind === 'purr' ? 470 + Math.random() * 20 : 90 + Math.random() * 440;
    live.words.push({ t, x, y, age: 0, life: st.life, kind, rot: (Math.random() - 0.5) * 16, drift: kind === 'purr' ? -20 : -60 - Math.random() * 60 });
  }

  function bubble(who, text) {
    const width = 26 + text.length * 17;
    const at = who === 'cat' ? { x: 610, y: 372 } : { x: 600, y: 196 };
    // Keep the bubble on screen when a narrow window crops the room
    at.x = Math.min(at.x, visible().x1 - width - 8);
    const g = el('g', { class: 'bubble' }, bubbles);
    el('rect', { x: at.x, y: at.y - 24, width, height: 36, rx: 16, fill: '#fff', stroke: '#222', 'stroke-width': 2 }, g);
    el('path', { d: `M${at.x + 12} ${at.y + 10} L${at.x - 6} ${at.y + 22} L${at.x + 24} ${at.y + 10} Z`, fill: '#fff', stroke: '#222', 'stroke-width': 2, 'stroke-linejoin': 'round' }, g);
    el('rect', { x: at.x + 10, y: at.y + 6, width: 18, height: 6, fill: '#fff' }, g);
    const t = el('text', { x: at.x + width / 2, y: at.y + 1, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700, fill: '#222' }, g);
    t.textContent = text;
    // Only one bubble per speaker at a time
    live.bubbles = live.bubbles.filter(b => {
      if (b.who !== who) return true;
      b.g.remove();
      return false;
    });
    live.bubbles.push({ g, who, age: 0 });
  }

  // A blow on the shaft: the lamp swings, the frame tilts, dust comes down
  function blow(strength) {
    swing.lampV += (Math.random() < 0.5 ? -1 : 1) * 1.6 * strength;
    swing.frame += (Math.random() - 0.4) * 2.5 * strength;
    swing.frame = Math.max(-14, Math.min(14, swing.frame));
    for (let i = 0; i < 5; i++) {
      const d = el('rect', { width: 3, height: 3, fill: '#a89c88' }, dust);
      live.dust.push({ d, x: 300 + Math.random() * 600, y: 0, v: 60 + Math.random() * 80 });
    }
  }

  function catShake() {
    catShakeUntil = performance.now() + 600;
  }

  // shake: 0..1 how hard the room trembles to you; muffle: 0..1 how covered your ears are
  function frameUpdate(dt, now, shake, muffle) {
    const amp = reduceMotion ? 0 : shake * 7;
    room.setAttribute('transform', amp ? `translate(${(Math.random() - 0.5) * amp} ${(Math.random() - 0.5) * amp})` : '');
    svg.querySelector('#muffle-blur').setAttribute('stdDeviation', (muffle * 5).toFixed(2));
    words.style.opacity = String(1 - muffle * 0.45);

    // Lamp on a spring
    swing.lampV += -swing.lamp * 9 * dt;
    swing.lampV *= Math.exp(-dt * 0.8);
    swing.lamp += swing.lampV * dt * 10;
    lamp.setAttribute('transform', `rotate(${reduceMotion ? 0 : swing.lamp.toFixed(2)} 500 0)`);
    frame.setAttribute('transform', `rotate(${swing.frame.toFixed(2)} 830 170)`);

    const head = svg.querySelector('#cat-head');
    head.setAttribute('transform', now < catShakeUntil && !reduceMotion ? `rotate(${Math.sin(now / 30) * 12} 500 470)` : '');
    const tail = svg.querySelector('#cat-tail');
    tail.setAttribute('transform', reduceMotion ? '' : `rotate(${Math.sin(now / 400) * 6 * (1 + shake * 3)} 594 500)`);

    live.words = live.words.filter(w => {
      w.age += dt;
      const k = w.age / w.life;
      if (k >= 1) {
        w.t.remove();
        return false;
      }
      const pop = Math.min(1, w.age / 0.12);
      const jit = w.kind === 'drill' && !reduceMotion ? (Math.random() - 0.5) * 6 : 0;
      w.t.setAttribute('transform', `translate(${w.x + w.drift * k + jit} ${w.y + jit}) rotate(${w.rot}) scale(${0.6 + pop * 0.4})`);
      w.t.setAttribute('opacity', (1 - Math.pow(k, 2)).toFixed(2));
      return true;
    });
    live.dust = live.dust.filter(p => {
      p.y += p.v * dt;
      p.x += Math.sin(p.y / 20) * 0.4;
      p.d.setAttribute('x', p.x.toFixed(1));
      p.d.setAttribute('y', p.y.toFixed(1));
      if (p.y > 580) {
        p.d.remove();
        return false;
      }
      return true;
    });
    live.bubbles = live.bubbles.filter(b => {
      b.age += dt;
      b.g.setAttribute('opacity', Math.min(1, (2.4 - b.age) / 0.4).toFixed(2));
      if (b.age > 2.4) {
        b.g.remove();
        return false;
      }
      return true;
    });
  }

  return { init, EARS, REST, setHand, setMe, setCat, toSvg, word, bubble, blow, catShake, frame: frameUpdate, hands };
})();
