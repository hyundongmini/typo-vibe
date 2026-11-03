// 3D station seen from above at an angle: three gate lanes, you at the middle
// reader, and the line behind you that grows and gets visibly impatient.
import * as THREE from 'three';

const LANE_W = 1.15;
const BODY_W = 0.4;
const BODY_D = 1.6;
const BODY_H = 1.0;
const READER_R = 0.17;
const READER_Z = 0.5;
const PLAYER_Z = 1.25;
const QUEUE_Z = 2.35;
const QUEUE_GAP = 1.05;
const WALK_SPEED = 1.6;
const HIT_SCALE = 1.35; // touch targets a bit larger than the drawn reader

// Camera sits past the gates looking back at the line, so every face is visible
const CAM_POS = { x: 0.5, y: 3.0, z: -2.9 };
const PLAYER_HAIR = 0.6;
const CAM_LOOK = new THREE.Vector3(0, 1.15, 2.4);

// Left to right: B0 | L lane | B1 | mine | B2 | R lane | B3
const LANE_X = { left: -(LANE_W + BODY_W), mine: 0, right: LANE_W + BODY_W };
const BODY_X = [-1.5, -0.5, 0.5, 1.5].map(k => k * (LANE_W + BODY_W));
const READER_BODY = { left: 1, right: 2 };

const COATS = [0x3b4a6b, 0x6b3b3b, 0x2f5d50, 0x5a5a5a, 0x7a6243, 0x44365e, 0x284b63, 0x6d4c41, 0x37474f, 0x4e5d3a];
const SKIN = [0xf1c9a5, 0xe0ac86, 0xc98e66, 0xf6d6bd];
const HAIR = [0x1c1c1c, 0x3a2a1f, 0x5b4636, 0x2b2b33];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });

let renderer, scene, camera, container, clock;
let player, queue = [], sideQueues = { left: [], right: [] };
// People who left a side queue and are walking through; still animated until they're gone
let passers = [];
let lanes = {}, readers = {}, signTex, signMat, stripeMat, guideMat;
let readerEls = null, mood = 0, nextAmbient = 0, shake = 0;
// User orbit offsets and the close-up "awkward cam" envelope
const view = { yaw: 0, pitch: 0, yawTarget: 0, pitchTarget: 0, dragging: false, lastX: 0, lastY: 0 };
let cinema = { start: -10, dur: 0 };
// Ride-photo capture scheduled for the peak of a close-up
let pendingShot = null;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();

/* ---------- textures ---------- */

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function floorTexture() {
  const tex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#c9c4ba';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#b3ada2';
    g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.stroke();
      g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  return tex;
}

// Station sign in the style of the real ones: a band in the line color with the station
// number, the name, and the neighboring stops on either side
function drawSign(g, w, h, gate) {
  const sign = gate.sign || {};
  g.fillStyle = gate.color;
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255, 255, 255, 0.9)';
  g.fillRect(0, 0, w, h * 0.06);
  g.fillRect(0, h * 0.94, w, h * 0.06);
  g.textBaseline = 'middle';
  const badge = (x, text, r) => {
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(x, h / 2, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = gate.color;
    g.textAlign = 'center';
    g.font = `800 ${r * 0.8}px Pretendard, sans-serif`;
    g.fillText(text, x, h / 2 + 1);
  };
  const side = h * 0.26;
  if (sign.prev) {
    badge(h * 0.45, sign.prev[0], side);
    g.fillStyle = '#fff';
    g.textAlign = 'left';
    g.font = `700 ${h * 0.24}px Pretendard, sans-serif`;
    g.fillText(sign.prev[1], h * 0.8, h / 2 + 1);
  }
  if (sign.next) {
    g.fillStyle = '#fff';
    g.textAlign = 'right';
    g.font = `700 ${h * 0.24}px Pretendard, sans-serif`;
    g.fillText(sign.next[1], w - h * 0.8, h / 2 + 1);
    badge(w - h * 0.45, sign.next[0], side);
  }
  // Center: arrow toward the previous stop, the station number and name
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.font = `900 ${h * 0.44}px Pretendard, sans-serif`;
  const name = gate.station;
  const nameW = g.measureText(name).width;
  g.font = `700 ${h * 0.24}px Pretendard, sans-serif`;
  const subW = sign.sub ? g.measureText(`(${sign.sub})`).width + h * 0.1 : 0;
  const cx = w / 2;
  g.font = `900 ${h * 0.44}px Pretendard, sans-serif`;
  g.fillText(name, cx - subW / 2, h / 2 + 2);
  if (sign.sub) {
    g.font = `700 ${h * 0.24}px Pretendard, sans-serif`;
    g.textAlign = 'left';
    g.fillText(`(${sign.sub})`, cx - subW / 2 + nameW / 2 + h * 0.1, h / 2 + 4);
  }
  const numberX = cx - subW / 2 - nameW / 2 - h * 0.45;
  if (sign.number) badge(numberX, sign.number, side * 1.05);
  if (sign.prev) {
    // Arrow halfway between the previous stop's name and this station's number
    g.font = `700 ${h * 0.24}px Pretendard, sans-serif`;
    const prevEnd = h * 0.8 + g.measureText(sign.prev[1]).width;
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.font = `700 ${h * 0.4}px sans-serif`;
    g.fillText('←', (prevEnd + numberX - side) / 2, h / 2);
  }
}

function arrowTexture(text, bg = '#16181c', fg = '#45f08a') {
  return canvasTexture(64, 64, (g, w, h) => {
    if (bg) {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
    }
    g.fillStyle = fg;
    g.font = 'bold 48px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

// Mood marks over heads so impatience reads at a glance: … then ! then an anger vein
let moodTextures = null;
function moodTexture(level) {
  if (!moodTextures) {
    moodTextures = [1, 2, 3].map(l => canvasTexture(64, 64, (g, w, h) => {
      g.lineCap = 'round';
      if (l === 1) {
        g.fillStyle = '#555';
        [18, 32, 46].forEach(x => { g.beginPath(); g.arc(x, 40, 5, 0, Math.PI * 2); g.fill(); });
      } else if (l === 2) {
        g.fillStyle = '#ff9f1a';
        g.font = '900 52px sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('!', w / 2, h / 2 + 2);
      } else {
        g.strokeStyle = '#e8262b';
        g.lineWidth = 7;
        [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([qx, qy]) => {
          const cx = qx ? 42 : 22, cy = qy ? 42 : 22, sx = qx ? 1 : -1, sy = qy ? 1 : -1;
          g.beginPath();
          g.moveTo(cx + sx * 12, cy);
          g.quadraticCurveTo(cx, cy, cx, cy + sy * 12);
          g.stroke();
        });
      }
    }));
  }
  return moodTextures[level - 1];
}

/* ---------- faces ---------- */

// eyes: dot | down | half | wide | squeeze | happy; brows: none | flat | raised | worried | angry
// mouth: flat | smile | frown | grit | grin | o | wavy
const FACES = {
  neutral: { eyes: 'dot', brows: 'none', mouth: 'flat' },
  phone: { eyes: 'down', brows: 'none', mouth: 'flat' },
  annoyed: { eyes: 'half', brows: 'flat', mouth: 'flat' },
  angry: { eyes: 'dot', brows: 'angry', mouth: 'frown' },
  fuming: { eyes: 'half', brows: 'angry', mouth: 'grit' },
  retry: { eyes: 'dot', brows: 'worried', mouth: 'grin', sweat: true },
  wallet: { eyes: 'wide', brows: 'raised', mouth: 'o' },
  neighbor: { eyes: 'wide', brows: 'raised', mouth: 'wavy', sweat: true },
  balance: { eyes: 'down', brows: 'worried', mouth: 'wavy', sweat: true },
  push: { eyes: 'squeeze', brows: 'worried', mouth: 'flat' },
  aside: { eyes: 'happy', brows: 'worried', mouth: 'grin', sweat: true },
  ok: { eyes: 'happy', brows: 'none', mouth: 'smile' },
  // Drawn over a live webcam face: only the blush and sweat
  // Live overlays are louder (live: true) so the embarrassment reads on a real face
  overlay: { eyes: 'none', brows: 'none', mouth: 'none', live: true },
  overlaySweat: { eyes: 'none', brows: 'none', mouth: 'none', sweat: true, live: true },
  overlayGloom: { eyes: 'none', brows: 'none', mouth: 'none', sweat: true, gloom: true, live: true },
};
const QUEUE_FACES = ['phone', 'annoyed', 'angry', 'fuming'];
const GLOOMY = new Set(['retry', 'balance', 'aside']);
// Big pop-up word over your head for each blunder
const SHOUTS = { retry: '삑삑…', wallet: '앗', neighbor: '어…?', balance: '헉', aside: '머쓱…', push: '읏' };
// Reactions that get the close-up camera, and the ones where you turn back to face the line
const CLOSE_UP = new Set(['retry', 'wallet', 'neighbor', 'balance']);
// The neighbor's walk-through plays in the wide view first; the close-up waits for it
const CLOSE_UP_DELAY = { neighbor: 2.2 };
const LOOK_BACK = new Set(['retry', 'wallet', 'neighbor', 'balance', 'aside']);
const faceCache = new Map();

function drawFace(g, f, blush) {
  const ink = '#2a1a12';
  g.clearRect(0, 0, 128, 128);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (f.gloom) {
    // Manga "gloom" lines down the forehead
    g.strokeStyle = 'rgba(70, 90, 200, 0.55)';
    g.lineWidth = 2.5;
    [48, 58, 68, 78].forEach((x, i) => { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 10 + (i % 2) * 4); g.stroke(); });
  }
  if (blush > 0 && !f.live) {
    const big = f.live ? 1.5 : 1;
    // Cheek height differs: on a live face the cheeks sit higher on the head patch
    const cy = f.live ? 64 : 80;
    g.fillStyle = `rgba(235, 50, 50, ${(0.25 + blush * 0.55) * (f.live ? 1.15 : 1)})`;
    [30, 98].forEach(x => { g.beginPath(); g.ellipse(x, cy, (14 + blush * 4) * big, (8 + blush * 2) * big, 0, 0, Math.PI * 2); g.fill(); });
    // Embarrassment hatching on the cheeks once it gets bad (sooner and denser on a live face)
    if (blush > (f.live ? 0.2 : 0.5)) {
      g.strokeStyle = 'rgba(190, 20, 20, 0.9)';
      g.lineWidth = f.live ? 3.5 : 2.5;
      const marks = f.live ? [-12, -4, 4, 12] : [-6, 0, 6];
      [30, 98].forEach(x => marks.forEach(d => { g.beginPath(); g.moveTo(x + d - 4, cy + 8); g.lineTo(x + d + 4, cy - 8); g.stroke(); }));
    }
  }
  g.strokeStyle = ink;
  g.fillStyle = ink;
  g.lineWidth = 5;
  [[42, 1], [86, -1]].forEach(([x, side]) => {
    const y = 56;
    g.beginPath();
    if (f.eyes === 'dot') g.arc(x, y, 5.5, 0, Math.PI * 2), g.fill();
    else if (f.eyes === 'down') g.arc(x, y + 4, 5, 0, Math.PI * 2), g.fill();
    else if (f.eyes === 'half') { g.moveTo(x - 8, y); g.lineTo(x + 8, y); g.stroke(); g.beginPath(); g.arc(x, y + 2, 4, 0, Math.PI); g.fill(); }
    else if (f.eyes === 'wide') { g.fillStyle = '#fff'; g.arc(x, y, 10, 0, Math.PI * 2); g.fill(); g.stroke(); g.fillStyle = ink; g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill(); }
    else if (f.eyes === 'squeeze') { g.moveTo(x - 8 * side, y - 6); g.lineTo(x + 6 * side, y); g.lineTo(x - 8 * side, y + 6); g.stroke(); }
    else if (f.eyes === 'happy') { g.arc(x, y + 4, 8, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
    g.beginPath();
    const by = 38;
    if (f.brows === 'flat') { g.moveTo(x - 10, by); g.lineTo(x + 10, by); g.stroke(); }
    else if (f.brows === 'raised') { g.arc(x, by + 4, 11, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
    else if (f.brows === 'worried') { g.moveTo(x - 10 * side, by + 2); g.lineTo(x + 9 * side, by - 6); g.stroke(); }
    else if (f.brows === 'angry') { g.moveTo(x - 10 * side, by - 6); g.lineTo(x + 9 * side, by + 3); g.stroke(); }
  });
  g.beginPath();
  const my = 92;
  if (f.mouth === 'flat') { g.moveTo(54, my); g.lineTo(74, my); g.stroke(); }
  else if (f.mouth === 'smile') { g.arc(64, my - 8, 13, Math.PI * 0.2, Math.PI * 0.8); g.stroke(); }
  else if (f.mouth === 'frown') { g.arc(64, my + 10, 11, Math.PI * 1.2, Math.PI * 1.8); g.stroke(); }
  else if (f.mouth === 'grit') { g.fillStyle = '#fff'; g.fillRect(50, my - 6, 28, 12); g.strokeRect(50, my - 6, 28, 12); g.moveTo(50, my); g.lineTo(78, my); g.stroke(); }
  else if (f.mouth === 'grin') {
    // The awkward "heh" smile: wide, teeth showing, corners pulled
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(46, my - 4); g.quadraticCurveTo(64, my + 12, 82, my - 4); g.closePath(); g.fill(); g.stroke();
  }
  else if (f.mouth === 'o') { g.arc(64, my, 7, 0, Math.PI * 2); g.stroke(); }
  else if (f.mouth === 'wavy') { g.moveTo(48, my); g.quadraticCurveTo(54, my - 7, 60, my); g.quadraticCurveTo(66, my + 7, 72, my); g.quadraticCurveTo(76, my - 5, 80, my); g.stroke(); }
  if (f.sweat) {
    g.fillStyle = '#7cc6ff';
    g.strokeStyle = '#2f7fc0';
    g.lineWidth = 2;
    const drop = (x, y, k) => {
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 10 * k, y + 18 * k, x, y + 24 * k); g.quadraticCurveTo(x - 10 * k, y + 18 * k, x, y); g.fill(); g.stroke();
    };
    drop(108, 20, 1);
    if (f.live) {
      drop(116, 50, 1.3);
      drop(16, 30, 0.9);
    }
  }
}

// Soft oval alpha so the webcam face fades into the head's skin at the edges
// Your t-shirt print: a photo of your cat
function catPrintTexture() {
  const tex = new THREE.TextureLoader().load('cat.jpg');
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function faceMask() {
  const tex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    g.save();
    g.translate(w / 2, h * 0.5);
    g.scale(0.92, 1);
    const grad = g.createRadialGradient(0, 0, 60, 0, 0, 128);
    grad.addColorStop(0, '#fff');
    grad.addColorStop(0.82, '#fff');
    grad.addColorStop(1, '#000');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 0, 128, 0, Math.PI * 2);
    g.fill();
    g.restore();
  });
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

// Drawn-face blush is cached in steps; enough of them that the flush looks gradual
const BLUSH_STEPS = 10;

function faceTexture(name, blush) {
  const step = Math.round(clamp(blush, 0, 1) * BLUSH_STEPS);
  const key = `${name}|${step}`;
  if (!faceCache.has(key)) faceCache.set(key, canvasTexture(128, 128, g => drawFace(g, FACES[name], step / BLUSH_STEPS)));
  return faceCache.get(key);
}

const shoutCache = new Map();
function shoutTexture(text) {
  if (!shoutCache.has(text)) {
    shoutCache.set(text, canvasTexture(256, 128, (g, w, h) => {
      g.font = '900 78px Pretendard, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = 14;
      g.strokeStyle = '#fff';
      g.strokeText(text, w / 2, h / 2);
      g.fillStyle = '#e8262b';
      g.fillText(text, w / 2, h / 2);
    }));
  }
  return shoutCache.get(text);
}

/* ---------- people ---------- */

function makePerson({ coat, isPlayer = false } = {}) {
  const group = new THREE.Group();
  const coatMat = mat(coat ?? pick(COATS));
  const skinMat = mat(pick(SKIN));
  const pantsMat = mat(0x2a2d33);

  const hipY = 0.78;
  const legs = [-0.09, 0.09].map(x => {
    const pivot = new THREE.Group();
    pivot.position.set(x, hipY, 0);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.62, 4, 8), pantsMat);
    leg.position.y = -0.38;
    leg.castShadow = true;
    pivot.add(leg);
    group.add(pivot);
    return pivot;
  });

  const torso = new THREE.Group();
  torso.position.y = hipY;
  group.add(torso);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 4, 12), coatMat);
  body.position.y = 0.36;
  body.scale.z = 0.7;
  body.castShadow = true;
  torso.add(body);

  const head = new THREE.Group();
  head.position.y = isPlayer ? 0.98 : 0.92;
  // Oversized heads keep expressions readable from the overview camera; yours most of all
  head.scale.setScalar(isPlayer ? 1.75 : 1.35);
  torso.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), skinMat);
  skull.castShadow = true;
  head.add(skull);
  // Front patch of a slightly larger sphere carries the drawn expression (model faces -z)
  const face = new THREE.Mesh(
    new THREE.SphereGeometry(0.1415, 24, 16, Math.PI * 1.5 - 0.95, 1.9, Math.PI / 2 - 0.8, 1.6),
    new THREE.MeshStandardMaterial({ map: faceTexture('neutral', 0), transparent: true, roughness: 0.8 }),
  );
  head.add(face);

  // Player only: your webcam face set into the front of the 3D head, oval with feathered
  // edges so it melts into the skin, under the 3D hair; a layer on top carries blush and sweat
  let videoFace = null, videoOverlay = null;
  if (isPlayer) {
    const patch = r => new THREE.SphereGeometry(r, 32, 24, Math.PI * 1.5 - 1.35, 2.7, Math.PI / 2 - 1.2, 2.25);
    videoFace = new THREE.Mesh(patch(0.1418), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, alphaMap: faceMask(), depthWrite: false }));
    videoOverlay = new THREE.Mesh(patch(0.1428), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
    videoFace.visible = videoOverlay.visible = false;
    head.add(videoFace, videoOverlay);
  }
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.147, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(pick(HAIR)));
  // Your bangs sit higher so more of the face shows
  hair.rotation.x = isPlayer ? PLAYER_HAIR : 0.25;
  head.add(hair);

  const arms = [-1, 1].map(side => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.25, 0.62, 0);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.46, 4, 8), coatMat);
    arm.position.y = -0.27;
    arm.castShadow = true;
    pivot.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), skinMat);
    hand.position.y = -0.54;
    pivot.add(hand);
    torso.add(pivot);
    return pivot;
  });

  // Phone in the right hand while still calm
  const phone = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.015), mat(0x111111, { emissive: 0x223355, emissiveIntensity: 0.6 }));
  phone.position.set(0, -0.58, -0.05);
  arms[1].add(phone);

  // Player only: the outfit pieces; dressPlayer() picks which are worn
  let outfit = null;
  if (isPlayer) {
    const shirtMat = mat(0xf5f5f2);
    const armSkin = skinMat.clone();
    const sleeves = arms.map(pivot => {
      const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.1, 4, 8), shirtMat);
      sleeve.position.y = -0.08;
      pivot.add(sleeve);
      return sleeve;
    });
    // Model faces -z, so the print sits on the -z side of the chest, turned to face out
    const catPrint = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3 * 385 / 512), new THREE.MeshStandardMaterial({ map: catPrintTexture(), roughness: 0.9 }));
    catPrint.position.set(0, 0.38, -0.143);
    catPrint.rotation.y = Math.PI;
    torso.add(catPrint);

    // Eco bag on the left shoulder, strap over the shoulder front and back
    const toteMat = mat(0xe8dcc0);
    const tote = new THREE.Group();
    const toteBody = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.27), toteMat);
    toteBody.position.set(-0.34, 0.18, 0.02);
    toteBody.castShadow = true;
    tote.add(toteBody);
    [-0.06, 0.08].forEach(z => {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.38, 0.03), toteMat);
      strap.position.set(-0.27, 0.5, z);
      strap.rotation.z = -0.38;
      tote.add(strap);
    });
    torso.add(tote);

    // Backpack, with its straps on the chest either side of the print
    const packMat = mat(0x3a4a5e);
    const backpack = new THREE.Group();
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.36, 0.14), packMat);
    pack.position.set(0, 0.42, 0.2);
    pack.castShadow = true;
    backpack.add(pack);
    [-0.15, 0.15].forEach(x => {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.42, 0.02), packMat);
      strap.position.set(x, 0.42, -0.1);
      backpack.add(strap);
    });
    torso.add(backpack);

    outfit = { body, coatMat, shirtMat, armSkin, sleeves, catPrint, tote, backpack, armMeshes: arms.map(a => a.children[0]) };
  }

  if (!isPlayer && Math.random() < 0.5) {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.14), mat(pick([0x222222, 0x5a3d2b, 0x2d3f5a])));
    bag.position.set(0, 0.42, 0.2);
    bag.castShadow = true;
    torso.add(bag);
  }

  if (isPlayer) {
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({
      map: canvasTexture(128, 64, (g, w, h) => {
        g.fillStyle = '#ffd400';
        g.beginPath();
        g.roundRect(8, 6, w - 16, h - 22, 14);
        g.fill();
        g.beginPath();
        g.moveTo(w / 2 - 10, h - 17); g.lineTo(w / 2 + 10, h - 17); g.lineTo(w / 2, h - 4);
        g.fill();
        g.fillStyle = '#111';
        g.font = '900 30px Pretendard, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('나', w / 2, 27);
      }),
      depthTest: false,
    }));
    tag.scale.set(0.5, 0.25, 1);
    tag.position.y = 2.42;
    tag.renderOrder = 10;
    group.add(tag);
    group.userData.tag = tag;

    const shout = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
    shout.renderOrder = 11;
    shout.visible = false;
    group.add(shout);
    group.userData.shout = shout;
  }

  const moodMark = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
  moodMark.scale.set(0.34, 0.34, 1);
  moodMark.position.y = 1.95;
  moodMark.renderOrder = 9;
  moodMark.visible = false;
  torso.add(moodMark);
  moodMark.position.y = 2.12 - hipY;

  group.traverse(o => { if (o.isMesh) o.receiveShadow = false; });
  scene.add(group);

  return {
    group, legs, torso, head, arms, phone, moodMark, face, hair, skinMat, videoFace, videoOverlay, outfit,
    baseSkin: skinMat.color.clone(),
    expr: 'neutral', exprUntil: 0, turnFrom: 0, turnUntil: 0, blush: 0, blushNow: 0, blushShown: -1, faceKey: '',
    seed: Math.random() * 100,
    target: null,
    onArrive: null,
    level: 0,
    lean: 0,
    reach: null,
    isPlayer,
  };
}

function removePerson(p) {
  passers = passers.filter(x => x !== p);
  scene.remove(p.group);
  p.group.traverse(o => {
    if (o.isMesh) o.geometry.dispose();
  });
}

function walkTo(p, x, z, onArrive) {
  p.target = new THREE.Vector2(x, z);
  p.onArrive = onArrive || null;
}

function animatePerson(p, t, dt) {
  const g = p.group;
  const s = t + p.seed;
  let isWalking = false;

  if (p.target) {
    const dx = p.target.x - g.position.x, dz = p.target.y - g.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.02) {
      g.position.x = p.target.x;
      g.position.z = p.target.y;
      p.target = null;
      const cb = p.onArrive;
      p.onArrive = null;
      if (cb) cb();
    } else {
      const step = Math.min(dist, WALK_SPEED * dt);
      g.position.x += (dx / dist) * step;
      g.position.z += (dz / dist) * step;
      isWalking = true;
      // Face the walking direction (model faces -z)
      const want = Math.atan2(-dx, -dz);
      g.rotation.y += (want - g.rotation.y) * Math.min(1, dt * 10);
    }
  }
  if (!isWalking) g.rotation.y += ((p.faceY || 0) - g.rotation.y) * Math.min(1, dt * 6);
  // A sheepish glance back over the shoulder after a blunder; the face stays toward the camera
  const glance = p.turnFrom <= t && t < p.turnUntil && !p.reach ? 0.55 : 0;
  p.head.rotation.y += (glance - p.head.rotation.y) * Math.min(1, dt * 6);

  const faceName = p.isPlayer ? (p.exprUntil > t ? p.expr : 'neutral') : p.happy ? 'ok' : QUEUE_FACES[p.level];
  const isLive = !!(p.videoFace && p.videoFace.visible);
  // With a live face the real expression does the acting; only blush and sweat are drawn on top
  const drawn = isLive ? (GLOOMY.has(faceName) ? 'overlayGloom' : FACES[faceName].sweat ? 'overlaySweat' : 'overlay') : faceName;
  // Redness eases toward its target so the face flushes gradually
  p.blushNow += (p.blush - p.blushNow) * Math.min(1, dt * 1.2);
  const blush = p.blushNow;
  const faceKey = `${drawn}|${Math.round(blush * BLUSH_STEPS)}`;
  if (faceKey !== p.faceKey) {
    p.faceKey = faceKey;
    const target = isLive ? p.videoOverlay : p.face;
    target.material.map = faceTexture(drawn, blush);
    target.material.needsUpdate = true;
  }
  if (Math.abs(p.blushShown - blush) > 0.004) {
    p.blushShown = blush;
    // Embarrassment filter: the live face itself turns red
    if (p.videoFace) p.videoFace.material.color.setRGB(1, 1 - blush * 0.6, 1 - blush * 0.65);
    p.skinMat.color.copy(p.baseSkin).lerp(new THREE.Color(0xe2584a), blush * 0.55);
  }

  const [legL, legR] = p.legs;
  const [armL, armR] = p.arms;
  let headX = 0, headZ = 0, bodyScale = 1, offX = 0;
  let armLx = 0, armRx = 0, armLz = 0, armRz = 0;
  legL.rotation.x = legR.rotation.x = 0;
  p.phone.visible = false;

  if (isWalking) {
    const w = Math.sin(s * 9) * 0.55;
    legL.rotation.x = w;
    legR.rotation.x = -w;
    armLx = -w * 0.6;
    armRx = w * 0.6;
    g.position.y = Math.abs(Math.sin(s * 9)) * 0.03;
  } else {
    g.position.y = 0;
    const level = p.isPlayer ? 0 : p.level;
    if (p.isPlayer) {
      // Chin up so the overview camera catches the face
      headX = p.videoFace && p.videoFace.visible ? -0.4 : -0.2;
    } else if (level === 0) {
      // Calm: phone held in front of the chest, head down
      armRx = 0.75;
      armRz = -0.45;
      p.phone.visible = true;
      headX = 0.45;
    } else if (level === 1) {
      // Foot tapping
      legR.rotation.x = -Math.max(0, Math.sin(s * 11)) * 0.35;
      headX = -0.1;
    } else if (level === 2) {
      // Checking the watch every couple of seconds
      const look = Math.sin(s * 1.6) > 0.2;
      armLx = look ? 1.5 : 0;
      armLz = look ? -0.6 : 0;
      headX = look ? 0.5 : -0.1;
      headZ = look ? 0.25 : 0;
      legR.rotation.x = -Math.max(0, Math.sin(s * 13)) * 0.25;
    } else {
      // Sighing, then leaning out of line to see what's taking so long
      bodyScale = 1 + Math.max(0, Math.sin(s * 1.3)) * 0.06;
      headX = -0.2 + Math.max(0, Math.sin(s * 1.3)) * -0.15;
      const peek = Math.sin(s * 0.7) > 0.4;
      offX = peek ? 0.28 : 0;
      headZ = peek ? -0.35 : 0;
      armLz = -0.15;
      armRz = 0.15;
    }
  }

  // Reaching toward a reader
  if (p.reach) {
    const arm = p.reach === 'left' ? armL : armR;
    if (arm === armL) { armLx = 1.25; armLz = -0.45; } else { armRx = 1.25; armRz = 0.45; }
  }

  const shout = p.group.userData.shout;
  if (shout) {
    const left = (shout.userData.until || 0) - t;
    shout.visible = left > 0;
    if (shout.visible) {
      // Pop in, then bob while it lasts
      const age = t - shout.userData.from;
      const pop = Math.min(1, age / 0.15);
      shout.scale.set(0.66 * pop, 0.33 * pop, 1);
      // Model faces -z, so negative x lands on the screen's right of the head
      shout.position.set(-0.42, 2.12 + Math.sin(age * 8) * 0.03, 0);
    }
  }

  const markLevel = isWalking || p.isPlayer ? 0 : p.level;
  p.moodMark.visible = markLevel > 0;
  if (markLevel > 0 && p.moodMark.material.map !== moodTexture(markLevel)) {
    p.moodMark.material.map = moodTexture(markLevel);
    p.moodMark.material.needsUpdate = true;
  }
  if (markLevel === 3) p.moodMark.scale.setScalar(0.34 + Math.max(0, Math.sin(s * 6)) * 0.08);

  p.lean += ((p.bowUntil > t ? p.bow : 0) - p.lean) * Math.min(1, dt * 4);
  p.torso.rotation.x = p.lean;
  p.torso.position.x += (offX - p.torso.position.x) * Math.min(1, dt * 4);
  p.torso.scale.y = bodyScale;
  p.head.rotation.x += (headX - p.head.rotation.x) * Math.min(1, dt * 6);
  p.head.rotation.z += (headZ - p.head.rotation.z) * Math.min(1, dt * 6);
  armL.rotation.x += (armLx - armL.rotation.x) * Math.min(1, dt * 10);
  armR.rotation.x += (armRx - armR.rotation.x) * Math.min(1, dt * 10);
  armL.rotation.z += (armLz - armL.rotation.z) * Math.min(1, dt * 10);
  armR.rotation.z += (armRz - armR.rotation.z) * Math.min(1, dt * 10);
}

/* ---------- gates ---------- */

function makeBody(x) {
  const group = new THREE.Group();
  group.position.x = x;
  const shell = new THREE.Mesh(new THREE.BoxGeometry(BODY_W, BODY_H, BODY_D), mat(0xc5c9ce, { metalness: 0.6, roughness: 0.35 }));
  shell.position.y = BODY_H / 2;
  shell.castShadow = shell.receiveShadow = true;
  group.add(shell);
  const top = new THREE.Mesh(new THREE.BoxGeometry(BODY_W + 0.02, 0.05, BODY_D + 0.02), mat(0x2b2e33));
  top.position.y = BODY_H + 0.02;
  group.add(top);
  scene.add(group);
  return group;
}

function makeReader(bodyIndex) {
  const group = new THREE.Group();
  group.position.set(BODY_X[bodyIndex], BODY_H + 0.05, READER_Z);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(READER_R, READER_R, 0.03, 32), mat(0x3e6fc9, { emissive: 0x1a3d8a, emissiveIntensity: 0.5 }));
  group.add(pad);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(READER_R + 0.02, 0.018, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.02;
  group.add(ring);
  const arrow = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ map: arrowTexture('←') }));
  arrow.rotation.x = -Math.PI / 2;
  arrow.position.set(0, 0.006, -0.38);
  group.add(arrow);
  scene.add(group);
  return { group, ring, arrow };
}

function makeLane(x) {
  // Two flaps meeting in the middle of the lane, hinged to the bodies
  const flaps = [-1, 1].map(side => {
    const pivot = new THREE.Group();
    pivot.position.set(x + side * (LANE_W / 2), 0.62, 0);
    const flap = new THREE.Mesh(
      new THREE.BoxGeometry(LANE_W / 2 - 0.02, 0.42, 0.04),
      new THREE.MeshStandardMaterial({ color: 0xf07828, transparent: true, opacity: 0.6, roughness: 0.2 }),
    );
    flap.position.x = -side * (LANE_W / 4);
    pivot.add(flap);
    scene.add(pivot);
    return pivot;
  });
  return { flaps, open: 0, target: 0, timer: 0 };
}

function setLaneOpen(name, isOpen, holdSec) {
  const lane = lanes[name];
  lane.target = isOpen ? 1 : 0;
  lane.timer = holdSec || 0;
}

/* ---------- scene setup ---------- */

function buildStation() {
  scene.background = new THREE.Color(0xe9e7e2);
  scene.fog = new THREE.Fog(0xe9e7e2, 18, 34);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 6), mat(0xeeece7));
  wall.position.set(0, 3, 12);
  wall.rotation.y = Math.PI;
  scene.add(wall);
  stripeMat = mat(0x00a84d);
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(30, 0.28), stripeMat);
  stripe.position.set(0, 1.6, 11.99);
  stripe.rotation.y = Math.PI;
  scene.add(stripe);

  signTex = canvasTexture(1600, 160, () => {});
  signMat = new THREE.MeshBasicMaterial({ map: signTex });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 1), signMat);
  sign.position.set(0, 3.2, 11.95);
  sign.rotation.y = Math.PI;
  scene.add(sign);


  BODY_X.forEach(makeBody);

  // Floor guide in your lane so your line reads as yours
  guideMat = new THREE.MeshBasicMaterial({ color: 0x00a84d, transparent: true, opacity: 0.35 });
  const guide = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 9), guideMat);
  guide.rotation.x = -Math.PI / 2;
  guide.position.set(0, 0.005, 5.3);
  scene.add(guide);
  for (let i = 0; i < 6; i++) {
    const chevron = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ map: arrowTexture('▲', null, '#ffffff'), transparent: true, opacity: 0.8 }));
    chevron.rotation.x = -Math.PI / 2;
    chevron.position.set(0, 0.007, 1.6 + i * 1.3);
    scene.add(chevron);
  }
  lanes = { left: makeLane(LANE_X.left), mine: makeLane(0), right: makeLane(LANE_X.right) };
  readers = { left: makeReader(READER_BODY.left), right: makeReader(READER_BODY.right) };

  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a958c, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(4, 9, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 10, bottom: -6, near: 1, far: 30 });
  sun.shadow.radius = 4;
  scene.add(sun);
}

function queueSlot(i) {
  return QUEUE_Z + i * QUEUE_GAP;
}

// Real lines wobble; alternating sideways offsets also keep heads from hiding behind each other
function queueX(i) {
  return i % 2 ? 0.2 : -0.2;
}

// isInstant: place people in their slots (scene start) instead of walking in from behind
function fillSideQueue(name, isInstant) {
  const list = sideQueues[name];
  while (list.length < 2) {
    const p = makePerson();
    const z = PLAYER_Z + list.length * QUEUE_GAP * 1.3;
    p.group.position.set(LANE_X[name], 0, isInstant ? z : z + 2.5);
    walkTo(p, LANE_X[name], z);
    list.push(p);
  }
}

function reflowSide(name) {
  sideQueues[name].forEach((p, i) => walkTo(p, LANE_X[name], PLAYER_Z + i * QUEUE_GAP * 1.3));
}

// The front person of a side lane taps and walks through without any trouble
function sidePass(name) {
  const list = sideQueues[name];
  const p = list.shift();
  if (!p) return;
  passers.push(p);
  setLaneOpen(name, true, 1.4);
  walkTo(p, LANE_X[name], -4, () => removePerson(p));
  reflowSide(name);
  setTimeout(() => fillSideQueue(name), 900);
}

function applyMood() {
  queue.forEach((p, i) => {
    p.level = clamp(mood - Math.floor(i / 4), 0, 3);
  });
}

/* ---------- loop ---------- */

function resize() {
  const w = container.clientWidth, h = container.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Portrait screens need to back off to keep all three lanes in view
  camera.fov = w / h < 1 ? 52 : 42;
  camera.updateProjectionMatrix();
}

const tmp = new THREE.Vector3();
function toScreen(v) {
  tmp.copy(v).project(camera);
  return { x: (tmp.x + 1) / 2 * container.clientWidth, y: (1 - tmp.y) / 2 * container.clientHeight };
}

function placeReaderButtons() {
  if (!readerEls) return;
  ['left', 'right'].forEach(side => {
    const r = readers[side];
    const c = r.group.getWorldPosition(new THREE.Vector3());
    const scale = r.group.scale.x;
    const p = toScreen(c);
    const px = toScreen(c.clone().add(new THREE.Vector3(READER_R * scale, 0, 0)));
    const pz = toScreen(c.clone().add(new THREE.Vector3(0, 0, READER_R * scale)));
    // Never smaller than a 44px touch target
    const rad = Math.max(22, (Math.hypot(px.x - p.x, px.y - p.y) + Math.hypot(pz.x - p.x, pz.y - p.y)) / 2 * HIT_SCALE);
    const el = readerEls[side];
    el.style.width = el.style.height = `${rad * 2}px`;
    el.style.transform = `translate(${p.x - rad}px, ${p.y - rad}px)`;
  });
}

function cinemaWeight() {
  const e = clock.elapsedTime - cinema.start;
  if (e < 0 || e > cinema.dur) return 0;
  const easeIn = clamp(e / 0.3, 0, 1), easeOut = clamp((cinema.dur - e) / 0.4, 0, 1);
  const k = Math.min(easeIn, easeOut);
  return k * k * (3 - 2 * k);
}

const sph = new THREE.Spherical();
function updateCamera(dt) {
  // The view stays where the player leaves it; buttons and reset ease toward their target
  const ease = Math.min(1, dt * 8);
  view.yaw += (view.yawTarget - view.yaw) * ease;
  view.pitch += (view.pitchTarget - view.pitch) * ease;
  sph.setFromVector3(new THREE.Vector3(CAM_POS.x, CAM_POS.y, CAM_POS.z).sub(CAM_LOOK));
  sph.theta += view.yaw;
  sph.phi = clamp(sph.phi + view.pitch, 0.2, 1.4);
  const normalPos = new THREE.Vector3().setFromSpherical(sph).add(CAM_LOOK);

  const head = player.head.getWorldPosition(new THREE.Vector3());
  const closePos = head.clone().add(new THREE.Vector3(0.22, 0.22, -1.2));
  const w = cinemaWeight();
  player.group.userData.tag.visible = w < 0.2;
  camPos.copy(normalPos).lerp(closePos, w);
  camLook.copy(CAM_LOOK).lerp(head, w);

  shake *= Math.exp(-dt * 8);
  camera.position.copy(camPos);
  camera.position.x += (Math.random() - 0.5) * shake;
  camera.lookAt(camLook);
}

// Right-button drag turns the camera; the left button belongs to the card
// Square region of the webcam frame shown in the round face, in 0..1 frame coordinates (y down)
const faceCrop = { video: null, target: null, now: null, lastSeen: 0 };

function centerCrop(video) {
  const aspect = (video.videoWidth || 4) / (video.videoHeight || 3);
  const w = Math.min(1, 1 / aspect), h = Math.min(1, aspect);
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

// Mirrored like a selfie: u=0 maps to the crop's right edge
function applyCrop(tex) {
  const c = faceCrop.now;
  tex.repeat.set(-c.w, c.h);
  tex.offset.set(c.x + c.w, 1 - (c.y + c.h));
}

function updateFaceCrop(dt) {
  const tex = player.videoFace && player.videoFace.material.map;
  if (!tex || !faceCrop.now) return;
  // Lost the face for a while: ease back out to the plain center crop
  if (clock.elapsedTime - faceCrop.lastSeen > 1.5) faceCrop.target = centerCrop(faceCrop.video);
  const k = Math.min(1, dt * 6);
  ['x', 'y', 'w', 'h'].forEach(key => { faceCrop.now[key] += (faceCrop.target[key] - faceCrop.now[key]) * k; });
  applyCrop(tex);
}

function bindOrbit(el) {
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('pointerdown', e => {
    if (e.button !== 2) return;
    view.dragging = true;
    view.lastX = e.clientX;
    view.lastY = e.clientY;
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', e => {
    if (!view.dragging) return;
    view.yawTarget = clamp(view.yawTarget - (e.clientX - view.lastX) * 0.008, -2.6, 2.6);
    view.pitchTarget = clamp(view.pitchTarget - (e.clientY - view.lastY) * 0.005, -0.8, 0.5);
    view.lastX = e.clientX;
    view.lastY = e.clientY;
  });
  const stop = () => { view.dragging = false; };
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointercancel', stop);
}

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = reduceMotion ? 0 : clock.elapsedTime;

  Object.values(lanes).forEach(lane => {
    if (lane.timer > 0) {
      lane.timer -= dt;
      if (lane.timer <= 0) lane.target = 0;
    }
    lane.open += (lane.target - lane.open) * Math.min(1, dt * 9);
    lane.flaps.forEach(f => { f.scale.x = 1 - lane.open * 0.9; });
  });

  [player, ...queue, ...sideQueues.left, ...sideQueues.right, ...passers].forEach(p => p && animatePerson(p, t, dt));

  if (!reduceMotion && clock.elapsedTime > nextAmbient) {
    sidePass(Math.random() < 0.5 ? 'left' : 'right');
    nextAmbient = clock.elapsedTime + 2.2 + Math.random() * 2.5;
  }

  updateCamera(dt);
  updateFaceCrop(dt);

  renderer.render(scene, camera);
  if (pendingShot && clock.elapsedTime >= pendingShot.at) takeShot();
  placeReaderButtons();
  requestAnimationFrame(tick);
}

// Copy the frame just rendered (still in the drawing buffer this task) as a 3:2 crop
function takeShot() {
  const { kind } = pendingShot;
  pendingShot = null;
  if (!World.onPhoto) return;
  const src = renderer.domElement;
  const shot = document.createElement('canvas');
  shot.width = 720;
  shot.height = 480;
  const sw = Math.min(src.width, src.height * 1.5), sh = sw / 1.5;
  shot.getContext('2d').drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, shot.width, shot.height);
  World.onPhoto(shot, kind);
}

/* ---------- public API ---------- */

const World = {
  // Set by the game: (canvas, kind) => void, called when a ride photo is taken
  onPhoto: null,

  init(el) {
    container = el;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch (err) {
      console.error('WebGL unavailable', err);
      return false;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    bindOrbit(renderer.domElement);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
    clock = new THREE.Clock();
    buildStation();
    player = makePerson({ coat: 0xe0b100, isPlayer: true });
    player.group.position.set(0, 0, PLAYER_Z);
    fillSideQueue('left', true);
    fillSideQueue('right', true);
    resize();
    new ResizeObserver(resize).observe(container);
    requestAnimationFrame(tick);
    return true;
  },

  bindReaders(els) {
    readerEls = els;
  },

  setGate(gate, queueSize) {
    const draw = g => drawSign(g, signTex.image.width, signTex.image.height, gate);
    draw(signTex.image.getContext('2d'));
    signTex.needsUpdate = true;
    stripeMat.color.set(gate.color);
    guideMat.color.set(gate.color);
    // Each reader's arrow points at the lane it opens
    const arrowText = gate.reader === 'right' ? '←' : '→';
    ['left', 'right'].forEach(side => {
      readers[side].group.scale.setScalar(gate.scale);
      readers[side].arrow.material.map = arrowTexture(arrowText);
      readers[side].ring.material.color.set(0xffffff);
    });
    Object.keys(lanes).forEach(n => setLaneOpen(n, false));
    mood = 0;
    player.group.position.set(0, 0, PLAYER_Z);
    player.target = null;
    player.reach = null;
    queue.forEach(removePerson);
    queue = [];
    [...passers].forEach(removePerson);
    World.setQueue(queueSize, true);
  },

  setQueue(n, isInstant) {
    while (queue.length > n) removePerson(queue.pop());
    while (queue.length < n) {
      const p = makePerson();
      const z = queueSlot(queue.length);
      p.group.position.set(queueX(queue.length), 0, isInstant ? z : z + 2.5);
      queue.push(p);
    }
    queue.forEach((p, i) => walkTo(p, queueX(i), queueSlot(i)));
    applyMood();
  },

  setMood(level) {
    mood = level;
    applyMood();
  },

  // A back-of-line person gives up and moves to a side lane
  defect() {
    if (queue.length < 3) return null;
    const p = queue.pop();
    const name = Math.random() < 0.5 ? 'left' : 'right';
    const list = sideQueues[name];
    list.push(p);
    p.level = 1;
    walkTo(p, LANE_X[name], PLAYER_Z + (list.length - 1) * QUEUE_GAP * 1.3);
    return p;
  },

  readerState(side, kind) {
    const colors = { contact: 0xffb93a, ok: 0x45f08a, bad: 0xff4b3a };
    readers[side].ring.material.color.set(colors[kind] || 0xffffff);
  },

  reach(side) {
    player.reach = side;
  },

  // Player's face for a situation: close-up camera first, then a sheepish look back at the line
  react(kind) {
    const t = clock.elapsedTime;
    if (SHOUTS[kind]) {
      const shout = player.group.userData.shout;
      shout.material.map = shoutTexture(SHOUTS[kind]);
      shout.material.needsUpdate = true;
      shout.userData.until = t + (kind === 'push' ? 0.8 : 2.2);
      shout.userData.from = t;
    }
    player.expr = kind;
    player.exprUntil = t + (kind === 'push' ? 0.9 : 3.4);
    const delay = CLOSE_UP_DELAY[kind] || 0;
    if (LOOK_BACK.has(kind)) {
      // Turn around only after the close-up, so the camera sees the face first
      player.turnFrom = t + delay + (CLOSE_UP.has(kind) ? 1.7 : 0);
      player.turnUntil = player.turnFrom + 1.6;
    }
    if (CLOSE_UP.has(kind) && !reduceMotion) cinema = { start: t + delay, dur: 1.6 };
    if (CLOSE_UP.has(kind)) pendingShot = { at: t + delay + (reduceMotion ? 0.1 : 0.75), kind };
  },

  setBlush(v) {
    player.blush = clamp(v, 0, 1);
  },

  // video: a playing <video> of the webcam, or null to go back to the drawn face
  setPlayerVideo(video) {
    const { videoFace, videoOverlay, face } = player;
    if (!videoFace) return;
    if (videoFace.material.map) videoFace.material.map.dispose();
    if (video) {
      const tex = new THREE.VideoTexture(video);
      tex.colorSpace = THREE.SRGBColorSpace;
      videoFace.material.map = tex;
      faceCrop.video = video;
      faceCrop.target = centerCrop(video);
      faceCrop.now = { ...faceCrop.target };
      applyCrop(tex);
    } else {
      videoFace.material.map = null;
      faceCrop.video = faceCrop.target = faceCrop.now = null;
    }
    videoFace.material.needsUpdate = true;
    videoFace.visible = videoOverlay.visible = !!video;
    face.visible = !video;
    // Sweep the 3D hair back so it frames the forehead instead of covering the face
    player.hair.rotation.x = video ? 1.15 : PLAYER_HAIR;
    player.faceKey = '';
  },

  // box: detected face in video pixels, or null when none is found
  setFaceBox(box) {
    const v = faceCrop.video;
    if (!v || !box || !v.videoWidth) return;
    const W = v.videoWidth, H = v.videoHeight;
    // Square from forehead to chin; the 3D hair supplies everything above
    const size = Math.min(Math.max(box.w, box.h) * 1.3, W, H);
    const cx = box.x + box.w / 2, cy = box.y + box.h * 0.46;
    const x = clamp(cx - size / 2, 0, W - size), y = clamp(cy - size / 2, 0, H - size);
    faceCrop.target = { x: x / W, y: y / H, w: size / W, h: size / H };
    faceCrop.lastSeen = clock.elapsedTime;
  },

  // True for the whole close-up, including its first frame and the wait before a delayed one
  isCinematic() {
    return clock.elapsedTime - cinema.start < cinema.dur;
  },

  // Seconds until the close-up (and any wait before it) is over
  cinemaRemaining() {
    return Math.max(0, cinema.start + cinema.dur - clock.elapsedTime);
  },

  // Cut the close-up short (fade out from now); a close-up still waiting is dropped
  skipCinematic() {
    const e = clock.elapsedTime - cinema.start;
    if (e < 0) cinema.dur = 0;
    else if (e < cinema.dur) cinema.dur = Math.min(cinema.dur, e + 0.4);
    player.turnFrom = Math.min(player.turnFrom, clock.elapsedTime + 0.4);
    player.turnUntil = player.turnFrom + 1.2;
  },

  // name: 'catTote' | 'catBackpack' | 'coat'
  setOutfit(name) {
    const o = player.outfit;
    const isTee = name !== 'coat';
    o.body.material = isTee ? o.shirtMat : o.coatMat;
    o.armMeshes.forEach(m => { m.material = isTee ? o.armSkin : o.coatMat; });
    o.sleeves.forEach(s => { s.visible = isTee; });
    o.catPrint.visible = isTee;
    o.tote.visible = name === 'catTote';
    o.backpack.visible = name === 'catBackpack';
  },

  resetView() {
    view.yawTarget = 0;
    view.pitchTarget = 0;
  },

  turnView(delta) {
    view.yawTarget = clamp(view.yawTarget + delta, -2.6, 2.6);
  },

  bump() {
    shake = 0.25;
    player.lean = -0.25;
    setLaneOpen('mine', false);
  },

  shove() {
    player.lean = 0.3;
    if (queue[0]) queue[0].lean = 0.35;
  },

  // Your tap opened the side lane: its front person steps up to the open flaps, turns to
  // bow to you (in view, before the gate), then walks through. onBow(person) fires at the bow.
  neighborPass(side, onBow) {
    const name = side === 'left' ? 'left' : 'right';
    const list = sideQueues[name];
    const p = list.shift();
    if (!p) return;
    passers.push(p);
    p.happy = true;
    p.head.rotation.y = 0;
    setLaneOpen(name, true, 3.2);
    setTimeout(() => walkTo(p, LANE_X[name], 0.5, () => {
      // Side-on toward your lane so the bow reads from the front camera
      p.faceY = name === 'left' ? -Math.PI / 2 : Math.PI / 2;
      setTimeout(() => {
        // Negative lean tips the torso forward (rotation.x > 0 leans back)
        p.bow = -0.7;
        p.bowUntil = clock.elapsedTime + 0.7;
        if (onBow) onBow(p);
      }, 250);
      setTimeout(() => {
        p.faceY = 0;
        walkTo(p, LANE_X[name] * 1.6, -4.5, () => removePerson(p));
      }, 1100);
    }), 200);
    reflowSide(name);
    setTimeout(() => fillSideQueue(name), 1200);
  },

  passMine(onDone) {
    player.reach = null;
    setLaneOpen('mine', true, 1.6);
    walkTo(player, 0, -3.5);
    if (queue[0]) setTimeout(() => queue.forEach((p, i) => walkTo(p, queueX(i), queueSlot(i) - 0.8)), 400);
    setTimeout(onDone, 1500);
  },

  // Step out of line; the next people go through first
  stepAside(count) {
    player.reach = null;
    walkTo(player, 0.95, PLAYER_Z + 0.6);
    for (let i = 0; i < count && queue.length; i++) {
      const p = queue.shift();
      setTimeout(() => {
        setLaneOpen('mine', true, 1.2);
        walkTo(p, 0, -4, () => removePerson(p));
      }, 300 + i * 650);
    }
    queue.forEach((p, i) => walkTo(p, queueX(i), queueSlot(i)));
    setTimeout(() => {
      walkTo(player, 0, PLAYER_Z);
      queue.forEach((p, i) => walkTo(p, queueX(i), queueSlot(i)));
    }, 300 + count * 650);
  },

  // Screen point above someone's head, for speech bubbles
  headScreen(who) {
    const p = typeof who === 'object' && who ? who : who === 'player' ? player : who === 'front' ? queue[0] : pick(queue.slice(0, 5));
    if (!p) return null;
    const v = p.group.position.clone();
    v.y = 2.2;
    v.x += p.torso.position.x;
    return toScreen(v);
  },
};

window.World = World;
window.dispatchEvent(new Event('world-ready'));
