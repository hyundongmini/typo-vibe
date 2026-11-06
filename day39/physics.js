// The physical side: two three-segment ragdoll arms (upper arm, forearm, palm) hanging from
// shoulders fixed to the camera, the cat and the bed as obstacles, and the ear sensors.
// A held palm is pulled to its target by a weakly damped spring, F = k (T - p) - c v;
// a free one is pulled more softly back to rest on the duvet.
import * as THREE from 'three';
import { CFG } from './config.js';

// Collision groups: (membership << 16) | filter
const ENV = 0x0001, ARM = 0x0002, SENSOR = 0x0004;
const group = (member, filter) => (member << 16) | filter;

export function createPhysics(RAPIER, camera, cat) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  const a = CFG.arm;

  const fixed = pos => world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z));
  const solid = (desc, body) => world.createCollider(desc.setCollisionGroups(group(ENV, ARM)), body);
  const sensor = (radius, body, offset) =>
    world.createCollider(
      RAPIER.ColliderDesc.ball(radius).setTranslation(offset.x, offset.y, offset.z).setSensor(true).setCollisionGroups(group(SENSOR, ARM)),
      body,
    );

  // The bed, the cat's body and head
  const ground = fixed(new THREE.Vector3(0, 0, 0));
  solid(RAPIER.ColliderDesc.cuboid(0.8, 0.25, 0.375).setTranslation(0, 0.3, -0.5), ground);
  solid(RAPIER.ColliderDesc.ball(cat.bodyRadius).setTranslation(cat.bodyWorld.x, cat.bodyWorld.y, cat.bodyWorld.z), ground);
  solid(RAPIER.ColliderDesc.ball(CFG.cat.headRadius).setTranslation(cat.headWorld.x, cat.headWorld.y, cat.headWorld.z), ground);
  const catEars = cat.earWorld.map(p => sensor(CFG.cat.earSensorRadius, ground, p));

  // Your head, so a hand can press against it but not pass through, and your ears beside it
  const head = fixed(camera.position);
  solid(RAPIER.ColliderDesc.ball(CFG.myHeadRadius), head);
  const myEarLocal = [-1, 1].map(s => new THREE.Vector3(s * CFG.myEars.pos[0], CFG.myEars.pos[1], CFG.myEars.pos[2]));
  const myEarWorld = myEarLocal.map(p => camera.localToWorld(p.clone()));
  const myEars = myEarWorld.map(p => sensor(CFG.myEars.radius, head, p.clone().sub(camera.position)));

  const segment = (halfHeight, radius, at) => {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(at.x, at.y, at.z).setAngularDamping(a.angularDamping).setLinearDamping(a.linearDamping),
    );
    world.createCollider(RAPIER.ColliderDesc.capsule(halfHeight, radius).setDensity(a.density).setCollisionGroups(group(ARM, ENV | SENSOR)), body);
    return body;
  };
  const joint = (b1, anchor1, b2, anchor2) =>
    world.createImpulseJoint(RAPIER.JointData.spherical(anchor1, anchor2), b1, b2, true);

  // Each arm starts hanging straight down from its shoulder
  const arms = [-1, 1].map(s => {
    const shoulder = camera.localToWorld(new THREE.Vector3(s * a.shoulder[0], a.shoulder[1], a.shoulder[2]));
    const anchor = fixed(shoulder);
    const U = a.upper.halfHeight, F = a.fore.halfHeight, P = a.palm.half[1];
    const upper = segment(U, a.upper.radius, { x: shoulder.x, y: shoulder.y - U, z: shoulder.z });
    const fore = segment(F, a.fore.radius, { x: shoulder.x, y: shoulder.y - 2 * U - F, z: shoulder.z });
    const palm = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(shoulder.x, shoulder.y - 2 * U - 2 * F - P, shoulder.z)
        .setAngularDamping(a.angularDamping).setLinearDamping(a.linearDamping).setCcdEnabled(true),
    );
    const palmCollider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(...a.palm.half).setDensity(a.density).setCollisionGroups(group(ARM, ENV | SENSOR)),
      palm,
    );
    joint(anchor, { x: 0, y: 0, z: 0 }, upper, { x: 0, y: U, z: 0 });
    joint(upper, { x: 0, y: -U, z: 0 }, fore, { x: 0, y: F, z: 0 });
    joint(fore, { x: 0, y: -F, z: 0 }, palm, { x: 0, y: P, z: 0 });
    return { bodies: [upper, fore, palm], palm, palmCollider, target: null };
  });

  const f = new THREE.Vector3();
  const rest = [-1, 1].map(s => new THREE.Vector3(-s * a.rest[0], a.rest[1], a.rest[2]));
  // targets[i]: a THREE.Vector3 the palm is pulled to, or null to let it rest on the duvet
  function step(targets) {
    const dt = world.timestep;
    arms.forEach((arm, i) => {
      arm.target = targets[i];
      const T = targets[i] || rest[i];
      const k = targets[i] ? a.k : a.restK, c = targets[i] ? a.c : a.restC;
      const p = arm.palm.translation(), v = arm.palm.linvel();
      f.set(k * (T.x - p.x) - c * v.x, k * (T.y - p.y) - c * v.y, k * (T.z - p.z) - c * v.z);
      if (f.length() > a.maxForce) f.setLength(a.maxForce);
      arm.palm.applyImpulse({ x: f.x * dt, y: f.y * dt, z: f.z * dt }, true);
    });
    world.step();
  }

  // Which ears a held palm is on: { cat: [l, r], me: [l, r] }
  function covered() {
    const on = sensors => sensors.map(s => arms.some(arm => arm.target && world.intersectionPair(s, arm.palmCollider)));
    return { cat: on(catEars), me: on(myEars) };
  }

  function sync(meshes) {
    arms.forEach((arm, i) => {
      arm.bodies.forEach((b, k) => {
        const m = meshes[i][k];
        const t = b.translation(), r = b.rotation();
        m.position.set(t.x, t.y, t.z);
        m.quaternion.set(r.x, r.y, r.z, r.w);
      });
    });
  }

  return { step, covered, sync, myEarWorld, timestep: world.timestep };
}
