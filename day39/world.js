// What you see: a real flat around you (a 360 photo, which also lights the scene), the cat
// in front of you on the bed, and the meshes for your arms. Matte materials, a little bloom.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CFG } from './config.js';

const COLORS = {
  wall: 0xf3f8f6,
  bed: 0xbfe3d5,
  cat: 0xf7f6f1,
  catInner: 0xf3cfd2,
  eye: 0x1f2d2a,
  nose: 0xe9a9b0,
  sleeve: 0x9ed8c3,
  skin: 0xf6ece4,
};

const matte = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0, ...extra });

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  // Neutral tone mapping leaves the (already tone-mapped) photo nearly as it is
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.wall);
  new THREE.TextureLoader().load(CFG.room.file, tex => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
    scene.environment = tex;
    scene.environmentIntensity = CFG.room.light;
    scene.backgroundRotation.y = scene.environmentRotation.y = CFG.room.turn;
  });

  const camera = new THREE.PerspectiveCamera(CFG.camera.fov, 1, 0.02, 20);
  camera.position.set(...CFG.camera.pos);
  camera.lookAt(...CFG.camera.lookAt);
  camera.updateMatrixWorld();
  scene.add(camera);

  // Soft daylight from the window, a touch of fill
  scene.add(new THREE.HemisphereLight(0xf4fbff, 0xd8c6ad, 0.5));
  const sun = new THREE.DirectionalLight(0xfffaf2, 1.3);
  sun.position.set(-1.2, 2.6, 0.8);
  sun.target.position.set(0, 0.7, -0.45);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -1;
  sun.shadow.camera.right = 1;
  sun.shadow.camera.top = 1;
  sun.shadow.camera.bottom = -1;
  sun.shadow.bias = -0.0004;
  sun.shadow.radius = 6;
  scene.add(sun, sun.target);

  buildRoom(scene);
  const cat = buildCat(scene);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.16, 0.5, 0.92);
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
  // The bed you're sitting on, the cat in front of you on the duvet
  const bed = new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.5, 0.75, 6, 0.08), matte(COLORS.bed, { roughness: 1 }));
  bed.position.set(0, 0.3, -0.5);
  bed.receiveShadow = true;
  scene.add(bed);
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
  const skull = add(sphere, white, [0, 0, 0], [r * 1.08, r, r * 0.95], head);
  [-1, 1].forEach(s => add(sphere, white, [s * 0.016, -0.03, 0.068], [0.024, 0.019, 0.02], head));
  add(sphere, matte(COLORS.nose), [0, -0.017, 0.082], [0.009, 0.007, 0.006], head);
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
