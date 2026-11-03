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
const QUEUE_Z = 2.05;
const QUEUE_GAP = 0.95;
const WALK_SPEED = 1.6;
const HIT_SCALE = 1.35; // touch targets a bit larger than the drawn reader

const CAM_POS = { x: 3.4, y: 8.4, z: 8.2 };
const CAM_LOOK = new THREE.Vector3(0, 0.3, 2.6);

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
let lanes = {}, readers = {}, signTex, signMat, stripeMat, guideMat;
let readerEls = null, mood = 0, nextAmbient = 0, shake = 0;

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

function drawSign(g, w, h, gate) {
  g.fillStyle = '#1f2328';
  g.fillRect(0, 0, w, h);
  g.fillStyle = gate.color;
  g.beginPath();
  g.arc(h / 2, h / 2, h * 0.32, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 ${h * 0.34}px Pretendard, sans-serif`;
  g.fillText(gate.line, h / 2, h / 2 + 2);
  g.textAlign = 'left';
  g.font = `800 ${h * 0.42}px Pretendard, sans-serif`;
  g.fillText(gate.station, h * 0.95, h / 2 + 2);
  g.textAlign = 'right';
  g.font = `600 ${h * 0.24}px Pretendard, sans-serif`;
  g.fillStyle = '#cfd3d8';
  g.fillText(gate.kind === 'exit' ? '나가는 곳' : gate.kind === 'enter' ? '타는 곳' : '갈아타는 곳', w - h * 0.3, h / 2 + 2);
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
  head.position.y = 0.86;
  torso.add(head);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), skinMat);
  face.castShadow = true;
  head.add(face);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.147, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(pick(HAIR)));
  hair.rotation.x = 0.25;
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
    tag.position.y = 2.05;
    tag.renderOrder = 10;
    group.add(tag);
  }

  const moodMark = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
  moodMark.scale.set(0.34, 0.34, 1);
  moodMark.position.y = 1.95;
  moodMark.renderOrder = 9;
  moodMark.visible = false;
  torso.add(moodMark);
  moodMark.position.y = 1.95 - hipY;

  group.traverse(o => { if (o.isMesh) o.receiveShadow = false; });
  scene.add(group);

  return {
    group, legs, torso, head, arms, phone, moodMark,
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
  if (!isWalking) g.rotation.y += (0 - g.rotation.y) * Math.min(1, dt * 6);

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
      headX = 0.1;
    } else if (level === 0) {
      // Calm: phone held in front of the chest, head down
      armRx = 0.75;
      armRz = -0.45;
      p.phone.visible = true;
      headX = 0.45;
    } else if (level === 1) {
      // Foot tapping
      legR.rotation.x = -Math.max(0, Math.sin(s * 11)) * 0.35;
      headX = 0.15;
    } else if (level === 2) {
      // Checking the watch every couple of seconds
      const look = Math.sin(s * 1.6) > 0.2;
      armLx = look ? 1.5 : 0;
      armLz = look ? -0.6 : 0;
      headX = look ? 0.5 : 0.1;
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

  const markLevel = isWalking || p.isPlayer ? 0 : p.level;
  p.moodMark.visible = markLevel > 0;
  if (markLevel > 0 && p.moodMark.material.map !== moodTexture(markLevel)) {
    p.moodMark.material.map = moodTexture(markLevel);
    p.moodMark.material.needsUpdate = true;
  }
  if (markLevel === 3) p.moodMark.scale.setScalar(0.34 + Math.max(0, Math.sin(s * 6)) * 0.08);

  p.lean += (0 - p.lean) * Math.min(1, dt * 4);
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
  scene.fog = new THREE.Fog(0xe9e7e2, 16, 30);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 6), mat(0xeeece7));
  wall.position.set(0, 3, -3.2);
  scene.add(wall);
  stripeMat = mat(0x00a84d);
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(30, 0.28), stripeMat);
  stripe.position.set(0, 1.6, -3.19);
  scene.add(stripe);

  signTex = canvasTexture(1024, 160, () => {});
  signMat = new THREE.MeshBasicMaterial({ map: signTex });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 0.75), signMat);
  sign.position.set(0, 2.55, -1.2);
  scene.add(sign);
  const rod = new THREE.Mesh(new THREE.BoxGeometry(4.9, 0.08, 0.08), mat(0x555a60));
  rod.position.set(0, 2.97, -1.2);
  scene.add(rod);

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

// isInstant: place people in their slots (scene start) instead of walking in from behind
function fillSideQueue(name, isInstant) {
  const list = sideQueues[name];
  while (list.length < 2) {
    const p = makePerson();
    const z = PLAYER_Z + list.length * QUEUE_GAP;
    p.group.position.set(LANE_X[name], 0, isInstant ? z : z + 2.5);
    walkTo(p, LANE_X[name], z);
    list.push(p);
  }
}

function reflowSide(name) {
  sideQueues[name].forEach((p, i) => walkTo(p, LANE_X[name], PLAYER_Z + i * QUEUE_GAP));
}

// The front person of a side lane taps and walks through without any trouble
function sidePass(name) {
  const list = sideQueues[name];
  const p = list.shift();
  if (!p) return;
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
  camera.fov = w / h < 1 ? 50 : 42;
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

  [player, ...queue, ...sideQueues.left, ...sideQueues.right].forEach(p => p && animatePerson(p, t, dt));

  if (!reduceMotion && clock.elapsedTime > nextAmbient) {
    sidePass(Math.random() < 0.5 ? 'left' : 'right');
    nextAmbient = clock.elapsedTime + 2.2 + Math.random() * 2.5;
  }

  // Bump shake on failure
  shake *= Math.exp(-dt * 8);
  camera.position.set(CAM_POS.x + (Math.random() - 0.5) * shake, CAM_POS.y, CAM_POS.z);
  camera.lookAt(CAM_LOOK);

  renderer.render(scene, camera);
  placeReaderButtons();
  requestAnimationFrame(tick);
}

/* ---------- public API ---------- */

const World = {
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
    World.setQueue(queueSize, true);
  },

  setQueue(n, isInstant) {
    while (queue.length > n) removePerson(queue.pop());
    while (queue.length < n) {
      const p = makePerson();
      const z = queueSlot(queue.length);
      p.group.position.set((Math.random() - 0.5) * 0.6, 0, isInstant ? z : z + 2.5);
      queue.push(p);
    }
    queue.forEach((p, i) => walkTo(p, 0, queueSlot(i)));
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
    walkTo(p, LANE_X[name], PLAYER_Z + (list.length - 1) * QUEUE_GAP);
    return p;
  },

  readerState(side, kind) {
    const colors = { contact: 0xffb93a, ok: 0x45f08a, bad: 0xff4b3a };
    readers[side].ring.material.color.set(colors[kind] || 0xffffff);
  },

  reach(side) {
    player.reach = side;
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

  // Your tap opened the side lane: its front person bows and walks through
  neighborPass(side) {
    const name = side === 'left' ? 'left' : 'right';
    const p = sideQueues[name][0];
    if (p) p.lean = 0.4;
    setTimeout(() => sidePass(name), 250);
  },

  passMine(onDone) {
    player.reach = null;
    setLaneOpen('mine', true, 1.6);
    walkTo(player, 0, -3.5);
    if (queue[0]) setTimeout(() => queue.forEach((p, i) => walkTo(p, p.group.position.x, queueSlot(i) - 0.8)), 400);
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
    queue.forEach((p, i) => walkTo(p, p.group.position.x, queueSlot(i)));
    setTimeout(() => {
      walkTo(player, 0, PLAYER_Z);
      queue.forEach((p, i) => walkTo(p, p.group.position.x, queueSlot(i)));
    }, 300 + count * 650);
  },

  // Screen point above someone's head, for speech bubbles
  headScreen(who) {
    const p = typeof who === 'object' && who ? who : who === 'player' ? player : who === 'front' ? queue[0] : pick(queue.slice(0, 5));
    if (!p) return null;
    const v = p.group.position.clone();
    v.y = 2.0;
    v.x += p.torso.position.x;
    return toScreen(v);
  },
};

window.World = World;
window.dispatchEvent(new Event('world-ready'));
