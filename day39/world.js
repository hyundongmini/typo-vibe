// What you see: a bright bedroom built from simple shapes (wood floor, a window with
// sheer curtains and the sun coming in, a nightstand with a lamp and a plant), the cat in
// front of you on the bed, and the meshes for your arms. Matte materials, a little bloom.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CFG } from './config.js';

const COLORS = {
  wall: 0xf3efe7,
  trim: 0xfbfaf6,
  ceiling: 0xfbfaf7,
  duvet: 0xbfe3d5,
  sheet: 0xf7f6f2,
  pillow: 0xfdfcf8,
  wood: 0xc8a57c,
  rug: 0xe9e3d6,
  pot: 0xe8e2d6,
  leaf: 0x7fb59b,
  shade: 0xfff6e6,
  cat: 0xf7f6f1,
  catGrey: 0x9a9893,
  catInner: 0xf3cfd2,
  eye: 0x1f2d2a,
  nose: 0xe9a9b0,
  mole: 0x808287,
  sleeve: 0x9ed8c3,
  skin: 0xf6ece4,
};

// The room: x left-right, y up, z toward you. You sit at the foot of the bed.
const ROOM = { left: -1.7, right: 1.7, back: -2.35, front: 0.9, height: 2.4 };
const WINDOW = { z0: -1.85, z1: -0.55, y0: 0.75, y1: 2.05 };

const matte = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0, ...extra });

function canvasTexture(w, h, paint, { repeat = [1, 1], isColor = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(...repeat);
  tex.anisotropy = 8;
  return tex;
}

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.wall);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.32;

  const camera = new THREE.PerspectiveCamera(CFG.camera.fov, 1, 0.02, 20);
  camera.position.set(...CFG.camera.pos);
  camera.lookAt(...CFG.camera.lookAt);
  camera.updateMatrixWorld();
  scene.add(camera);

  // Morning sun through the window on the left, a soft fill from the room
  scene.add(new THREE.HemisphereLight(0xf6fbff, 0xd9c4a6, 0.75));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
  sun.position.set(-4.2, 3.1, -0.9);
  sun.target.position.set(0.1, 0.5, -0.9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -2.6, right: 2.6, top: 2.2, bottom: -2.2, near: 0.5, far: 9 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  // The bedside lamp, on but faint in daylight
  const lamp = new THREE.PointLight(0xffd9a8, 0.6, 2.2, 2);
  lamp.position.set(1.05, 0.98, -2.0);
  scene.add(lamp);

  buildRoom(scene);
  const cat = buildCat(scene);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.18, 0.5, 0.9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    // Keep the cat's head in frame on a tall phone
    camera.fov = w / h < 0.8 ? CFG.camera.fov * 1.25 : CFG.camera.fov;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  return { renderer, scene, camera, cat, render: () => composer.render(), makeArmMeshes: () => makeArmMeshes(scene) };
}

function buildRoom(scene) {
  const put = (geo, mat, pos, { rot, cast = true, receive = true } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    m.castShadow = cast;
    m.receiveShadow = receive;
    scene.add(m);
    return m;
  };
  const box = (w, h, d, mat, pos, opts) => put(new THREE.BoxGeometry(w, h, d), mat, pos, opts);
  const { left, right, back, front, height } = ROOM;
  const W = right - left, D = front - back;
  const wall = matte(COLORS.wall, { roughness: 1 });
  const trim = matte(COLORS.trim);

  // Light oak planks
  const planks = canvasTexture(1024, 1024, (ctx, w, h) => {
    const rows = 8;
    for (let r = 0; r < rows; r++) {
      let x = -Math.random() * 300;
      while (x < w) {
        const len = 260 + Math.random() * 380;
        const l = 70 + Math.random() * 10;
        ctx.fillStyle = `hsl(32, ${34 + Math.random() * 8}%, ${l - 8}%)`;
        ctx.fillRect(x, (r * h) / rows, len, h / rows);
        ctx.strokeStyle = 'rgba(110, 76, 44, 0.12)';
        for (let k = 0; k < 6; k++) {
          const y = (r * h) / rows + Math.random() * (h / rows);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.bezierCurveTo(x + len / 3, y + 4, x + (2 * len) / 3, y - 4, x + len, y);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(80, 55, 30, 0.35)';
        ctx.fillRect(x, (r * h) / rows, 2, h / rows);
        x += len;
      }
      ctx.fillStyle = 'rgba(80, 55, 30, 0.3)';
      ctx.fillRect(0, (r * h) / rows, w, 2);
    }
  }, { repeat: [2.2, 2.2] });
  put(new THREE.PlaneGeometry(W, D), matte(0xffffff, { map: planks, roughness: 0.7 }), [0, 0, (back + front) / 2], { rot: [-Math.PI / 2, 0, 0], cast: false });
  put(new THREE.PlaneGeometry(W, D), matte(COLORS.ceiling, { roughness: 1 }), [0, height, (back + front) / 2], { rot: [Math.PI / 2, 0, 0], cast: false });

  // Back and right walls, the front wall behind you
  put(new THREE.PlaneGeometry(W, height), wall, [0, height / 2, back], { cast: false });
  put(new THREE.PlaneGeometry(D, height), wall, [right, height / 2, (back + front) / 2], { rot: [0, -Math.PI / 2, 0], cast: false });
  put(new THREE.PlaneGeometry(W, height), wall, [0, height / 2, front], { rot: [0, Math.PI, 0], cast: false });

  // The left wall is built around the window so the sun only comes in through it
  const { z0, z1, y0, y1 } = WINDOW;
  const lw = (za, zb, ya, yb) => box(0.12, yb - ya, zb - za, wall, [left - 0.06, (ya + yb) / 2, (za + zb) / 2], { receive: true });
  lw(back, z0, 0, height);
  lw(z1, front, 0, height);
  lw(z0, z1, 0, y0);
  lw(z0, z1, y1, height);
  // Window frame, a cross bar, the glass with a bright morning outside
  const frame = matte(COLORS.trim, { roughness: 0.6 });
  const zc = (z0 + z1) / 2, yc = (y0 + y1) / 2, wz = z1 - z0, wy = y1 - y0;
  box(0.08, 0.05, wz + 0.1, frame, [left + 0.02, y0 - 0.02, zc]);
  box(0.08, 0.05, wz + 0.1, frame, [left + 0.02, y1 + 0.02, zc]);
  box(0.08, wy, 0.05, frame, [left + 0.02, yc, z0 - 0.02]);
  box(0.08, wy, 0.05, frame, [left + 0.02, yc, z1 + 0.02]);
  box(0.05, wy, 0.035, frame, [left + 0.01, yc, zc]);
  box(0.05, 0.035, wz, frame, [left + 0.01, y0 + wy * 0.62, zc]);
  box(0.16, 0.03, wz + 0.2, frame, [left + 0.06, y0 - 0.05, zc]);
  const sky = canvasTexture(512, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#cfe8f6');
    g.addColorStop(0.65, '#f4f9fb');
    g.addColorStop(1, '#e6f1e4');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.filter = 'blur(14px)';
    ctx.fillStyle = '#a9cfae';
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * w, h * (0.78 + Math.random() * 0.15), 50 + Math.random() * 70, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  put(new THREE.PlaneGeometry(wz, wy), new THREE.MeshBasicMaterial({ map: sky, toneMapped: false }), [left - 0.05, yc, zc], { rot: [0, Math.PI / 2, 0], cast: false, receive: false });

  // Sheer curtains, gathered at either side, and their rod
  box(0.025, 0.025, wz + 0.7, matte(0xd8d2c6, { roughness: 0.4, metalness: 0.3 }), [left + 0.1, y1 + 0.12, zc], { cast: false });
  const sheer = matte(0xffffff, { transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 1 });
  [[z0 - 0.3, z0 + 0.18], [z1 - 0.18, z1 + 0.3]].forEach(([za, zb]) => {
    const geo = new THREE.PlaneGeometry(zb - za, y1 + 0.1, 40, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 55) * 0.025);
    geo.computeVertexNormals();
    const curtain = put(geo, sheer, [left + 0.12, (y1 + 0.1) / 2 + 0.06, (za + zb) / 2], { rot: [0, Math.PI / 2, 0], receive: false });
    curtain.castShadow = false;
  });

  // Skirting all round
  box(W, 0.08, 0.015, trim, [0, 0.04, back + 0.008], { cast: false });
  box(0.015, 0.08, D, trim, [right - 0.008, 0.04, (back + front) / 2], { cast: false });
  box(0.015, 0.08, D, trim, [left + 0.008, 0.04, (back + front) / 2], { cast: false });

  // The bed: mattress, a mint duvet over it, a headboard and two pillows
  const bedZ = -1.25, bedL = 2.1;
  put(new RoundedBoxGeometry(1.5, 0.34, bedL, 4, 0.05), matte(COLORS.sheet, { roughness: 1 }), [0, 0.3, bedZ]);
  put(new RoundedBoxGeometry(1.5, 0.08, bedL, 4, 0.05), matte(0xb69673), [0, 0.1, bedZ]);
  put(new RoundedBoxGeometry(1.56, 0.07, bedL * 0.7, 6, 0.035), matte(COLORS.duvet, { roughness: 1 }), [0, 0.5, bedZ + bedL * 0.15]);
  put(new RoundedBoxGeometry(1.6, 0.9, 0.08, 4, 0.03), matte(0xe7dccb, { roughness: 0.9 }), [0, 0.6, back + 0.06]);
  [-0.36, 0.36].forEach(x => {
    const p = put(new THREE.SphereGeometry(1, 32, 16), matte(COLORS.pillow, { roughness: 1 }), [x, 0.55, back + 0.32]);
    p.scale.set(0.3, 0.08, 0.18);
    p.rotation.x = -0.25;
  });

  // Nightstand on the right with a lamp and a little plant
  const oak = matte(COLORS.wood, { roughness: 0.75 });
  box(0.45, 0.5, 0.38, oak, [1.05, 0.25, back + 0.22]);
  box(0.4, 0.005, 0.005, matte(0x7a5b3c), [1.05, 0.33, back + 0.413], { cast: false });
  put(new THREE.CylinderGeometry(0.055, 0.075, 0.2, 24), matte(COLORS.pot), [1.12, 0.6, back + 0.2]);
  put(new THREE.CylinderGeometry(0.008, 0.008, 0.25, 8), matte(0x8a7a66), [1.12, 0.82, back + 0.2]);
  put(new THREE.CylinderGeometry(0.09, 0.13, 0.15, 32, 1, true), matte(COLORS.shade, { emissive: 0xffe2b8, emissiveIntensity: 0.25, side: THREE.DoubleSide, roughness: 1 }), [1.12, 0.98, back + 0.2]);
  put(new THREE.CylinderGeometry(0.05, 0.04, 0.09, 20), matte(0xd9cbb5), [0.92, 0.545, back + 0.25]);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const leaf = put(new THREE.SphereGeometry(1, 16, 10), matte(COLORS.leaf), [0.92 + Math.cos(a) * 0.035, 0.63 + (i % 3) * 0.02, back + 0.25 + Math.sin(a) * 0.035]);
    leaf.scale.set(0.022, 0.06, 0.012);
    leaf.rotation.set(Math.sin(a) * 0.6, a, Math.cos(a) * 0.6);
  }

  // Two prints above the bed and a round rug on the floor
  const print = (paint, w, h, pos) => {
    box(w + 0.04, h + 0.04, 0.025, matte(0xf8f6f1), pos, { cast: false });
    put(new THREE.PlaneGeometry(w, h), matte(0xffffff, { map: canvasTexture(256, Math.round((256 * h) / w), paint), roughness: 1 }), [pos[0], pos[1], pos[2] + 0.014], { cast: false });
  };
  print((ctx, w, h) => {
    ctx.fillStyle = '#f2ede3';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#9ed8c3';
    ctx.beginPath();
    ctx.arc(w * 0.45, h * 0.42, w * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e9b8a6';
    ctx.fillRect(w * 0.2, h * 0.66, w * 0.6, h * 0.12);
  }, 0.42, 0.55, [-0.3, 1.55, back + 0.02]);
  print((ctx, w, h) => {
    ctx.fillStyle = '#f2ede3';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#6f8f84';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(w * 0.15, h * 0.75);
    ctx.bezierCurveTo(w * 0.35, h * 0.2, w * 0.6, h * 0.9, w * 0.85, h * 0.3);
    ctx.stroke();
  }, 0.32, 0.42, [0.28, 1.5, back + 0.02]);
  const rug = put(new THREE.CircleGeometry(0.75, 48), matte(COLORS.rug, { roughness: 1 }), [1.0, 0.004, -0.6], { rot: [-Math.PI / 2, 0, 0], cast: false });
  rug.receiveShadow = true;
}

// White fur with a grey cap over the forehead, parted a little right of the middle.
// Sphere UVs: u = 0.25 faces forward, u grows to the viewer's right; v = 0 is the crown.
function catHeadTexture() {
  return canvasTexture(1024, 512, (ctx, w, h) => {
    ctx.fillStyle = '#f7f6f1';
    ctx.fillRect(0, 0, w, h);
    const grey = '#' + COLORS.catGrey.toString(16).padStart(6, '0');
    ctx.filter = 'blur(10px)';
    ctx.fillStyle = grey;
    // Over the crown and down each side of the forehead, stopping above the eyes
    ctx.beginPath();
    ctx.ellipse(w * 0.25, 0, w * 0.17, h * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(0, 0, w, h * 0.08);
    // The parting: a pale line from the crown down the forehead, narrowing as it goes
    ctx.filter = 'blur(4px)';
    ctx.fillStyle = '#f2f0ea';
    ctx.beginPath();
    ctx.moveTo(w * 0.258, h * 0.02);
    ctx.lineTo(w * 0.27, h * 0.02);
    ctx.lineTo(w * 0.263, h * 0.37);
    ctx.lineTo(w * 0.259, h * 0.37);
    ctx.closePath();
    ctx.fill();
  }, { repeat: [1, 1] });
}

// A white cat built from spheres and cones, sitting up and looking at you
function buildCat(scene) {
  const white = matte(COLORS.cat);
  const g = new THREE.Group();
  g.position.set(...CFG.cat.base);
  scene.add(g);
  const add = (geo, mat, pos, scale, parent = g) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    if (scale) m.scale.set(...scale);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const sphere = new THREE.SphereGeometry(1, 40, 24);
  const body = add(sphere, white, [0, 0.12, 0], [0.13, 0.145, 0.12]);
  add(sphere, white, [0, 0.17, 0.055], [0.085, 0.1, 0.08]);
  [-1, 1].forEach(s => add(sphere, white, [s * 0.05, 0.018, 0.1], [0.032, 0.022, 0.045]));
  [-1, 1].forEach(s => add(sphere, white, [s * 0.11, 0.05, -0.02], [0.05, 0.05, 0.08]));

  const head = new THREE.Group();
  head.position.set(0, 0.34, 0.02);
  g.add(head);
  const r = CFG.cat.headRadius;
  const skull = add(sphere, matte(0xffffff, { map: catHeadTexture() }), [0, 0, 0], [r * 1.08, r, r * 0.95], head);
  [-1, 1].forEach(s => add(sphere, white, [s * 0.016, -0.03, 0.068], [0.024, 0.019, 0.02], head));
  add(sphere, matte(COLORS.nose), [0, -0.017, 0.082], [0.009, 0.007, 0.006], head);
  // Its own little beauty spot, on the right of the nose
  add(sphere, matte(COLORS.mole, { roughness: 1 }), [0.029, -0.025, 0.0832], [0.0038, 0.0034, 0.0016], head);
  const eyes = [-1, 1].map(s => add(sphere, matte(COLORS.eye, { roughness: 0.4 }), [s * 0.034, 0.012, 0.074], [0.015, 0.016, 0.008], head));

  // Ears hinge at the base so they can fold back
  const cone = new THREE.ConeGeometry(1, 1, 24);
  const ears = [-1, 1].map(s => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.05, 0.055, -0.005);
    pivot.rotation.z = -s * 0.32;
    head.add(pivot);
    add(cone, white, [0, 0.035, 0], [0.033, 0.07, 0.022], pivot);
    add(cone, matte(COLORS.catInner), [0, 0.03, 0.009], [0.02, 0.05, 0.01], pivot);
    return { pivot, side: s };
  });

  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.08, 0.02, -0.1), new THREE.Vector3(0.18, 0.015, -0.02),
    new THREE.Vector3(0.2, 0.02, 0.08), new THREE.Vector3(0.12, 0.03, 0.14),
  ]);
  const tail = new THREE.Group();
  g.add(tail);
  add(new THREE.TubeGeometry(tailCurve, 24, 0.022, 10, false), white, [0, 0, 0], null, tail);

  g.updateMatrixWorld(true);
  // Where each ear is at rest, for the ear sensors
  const earWorld = ears.map(e => e.pivot.localToWorld(new THREE.Vector3(0, 0.035, 0)));
  const headWorld = head.getWorldPosition(new THREE.Vector3());
  const bodyWorld = body.getWorldPosition(new THREE.Vector3());

  // stress 0..1, loud 0..1, t seconds
  function update(stress, loud, t, isGone) {
    g.visible = !isGone;
    ears.forEach(e => {
      // Folding back and out as the din gets to it
      e.pivot.rotation.x = -stress * 1.1;
      e.pivot.rotation.z = -e.side * (0.32 + stress * 0.9);
    });
    const squint = 1 - Math.min(1, stress * loud * 1.4) * 0.75;
    eyes.forEach(m => (m.scale.y = 0.016 * squint));
    const tremble = loud * stress * 0.012;
    head.position.x = Math.sin(t * 47) * tremble;
    head.rotation.z = Math.sin(t * 31) * tremble * 3;
    // Breathing, faster when upset
    body.scale.y = 0.145 * (1 + Math.sin(t * (2 + stress * 5)) * 0.015);
    tail.rotation.y = Math.sin(t * (1.2 + stress * 4)) * (0.15 + stress * 0.35);
  }

  return {
    group: g,
    hitMeshes: [skull, ...ears.flatMap(e => e.pivot.children), body],
    earWorld,
    headWorld,
    bodyWorld,
    bodyRadius: 0.13,
    update,
  };
}

// Sleeves for the upper and lower arm, a palm with fingers
function makeArmMeshes(scene) {
  const a = CFG.arm;
  const sleeve = matte(COLORS.sleeve);
  const skin = matte(COLORS.skin);
  const mk = (geo, mat) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    scene.add(m);
    return m;
  };
  const upper = mk(new THREE.CapsuleGeometry(a.upper.radius, a.upper.halfHeight * 2, 6, 18), sleeve);
  const fore = mk(new THREE.CapsuleGeometry(a.fore.radius, a.fore.halfHeight * 2, 6, 18), sleeve);
  const palm = new THREE.Group();
  scene.add(palm);
  const [hx, hy, hz] = a.palm.half;
  const pad = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), skin);
  pad.scale.set(hx * 1.1, hy * 0.85, hz * 1.4);
  pad.castShadow = true;
  palm.add(pad);
  const finger = new THREE.CapsuleGeometry(0.0085, 0.045, 4, 10);
  [-0.027, -0.009, 0.009, 0.027].forEach((x, i) => {
    const f = new THREE.Mesh(finger, skin);
    f.position.set(x, -hy - 0.02 + (i === 0 || i === 3 ? 0.008 : 0), 0);
    f.castShadow = true;
    palm.add(f);
  });
  return [upper, fore, palm];
}
