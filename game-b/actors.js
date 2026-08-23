/* ECHO CITY — actors.js
   Meshes and behaviour for cars, people, police, traffic, pedestrians and mission props. */

import * as THREE from 'three';
import { CFG, roadCenter, snapToRoad, groundY } from './world.js';

const TAU = Math.PI * 2;
export const angleDelta = (a, b) => ((b - a + Math.PI * 3) % TAU) - Math.PI;

/* ------------------------------------------------------------------ meshes */

/* ---- shared bits ------------------------------------------------------- */

/* Scale the vertices above the mid-line, so a box becomes a tapered volume.
   This is what turns "box car" into something with a real silhouette. */
function taper(geo, topX, topZ, frontZ = 1, backZ = 1){
  const p = geo.attributes.position;
  let minY = Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < p.count; i++){
    minY = Math.min(minY, p.getY(i)); maxY = Math.max(maxY, p.getY(i));
    maxZ = Math.max(maxZ, Math.abs(p.getZ(i)));
  }
  for (let i = 0; i < p.count; i++){
    const t = (p.getY(i) - minY) / (maxY - minY || 1);          // 0 bottom .. 1 top
    const sx = 1 + (topX - 1) * t;
    const sz = 1 + (topZ - 1) * t;
    const zf = p.getZ(i) > 0 ? frontZ : backZ;
    p.setXYZ(i, p.getX(i) * sx, p.getY(i), p.getZ(i) * sz * (1 + (zf - 1) * t));
  }
  geo.computeVertexNormals();
  return geo;
}

const TYRE_GEO = new THREE.CylinderGeometry(.35, .35, .27, 20);
TYRE_GEO.rotateZ(Math.PI / 2);
const RIM_GEO = new THREE.CylinderGeometry(.215, .215, .285, 12);
RIM_GEO.rotateZ(Math.PI / 2);
const TYRE_MAT = new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: .92, metalness: .05 });
const RIM_MAT  = new THREE.MeshStandardMaterial({ color: 0xb9bec6, roughness: .28, metalness: .95,
                                                  envMapIntensity: 1.4 });

export function makeCar(opts = {}){
  const {
    body = 0x2b3d63, roof = null, ghost = false, police = false, van = false,
  } = opts;

  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial(
    ghost
      ? { color: 0x0aa8d6, roughness: .35, metalness: .1, transparent: true, opacity: .5,
          emissive: 0x0a7fae, emissiveIntensity: .85 }
      // clearcoat look: smooth, fairly metallic, strong sky reflection
      : { color: body, roughness: .22, metalness: .55, envMapIntensity: 1.5 });
  const dark = new THREE.MeshStandardMaterial(
    ghost ? { color: 0x0aa8d6, transparent: true, opacity: .4, roughness: .5 }
          : { color: 0x1b1e24, roughness: .55, metalness: .35 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: ghost ? 0x0aa8d6 : 0x1d2a35, roughness: .04, metalness: .5,
    envMapIntensity: 2.0, transparent: true, opacity: ghost ? .3 : .72 });

  const L = van ? 5.4 : 4.42, W = van ? 2.06 : 1.84;
  const sillY = .46, hullH = van ? .96 : .58;

  // ---- lower hull, slightly tapered and pinched at the tail
  const hull = taper(new THREE.BoxGeometry(W, hullH, L, 1, 1, 3).toNonIndexed(),
                     .965, 1, .985, .955);
  hull.translate(0, sillY + hullH / 2, 0);
  g.add(new THREE.Mesh(hull, paint));

  // ---- bonnet and boot decks
  const deckY = sillY + hullH;
  if (!van){
    const bonnet = taper(new THREE.BoxGeometry(W * .93, .17, L * .3).toNonIndexed(), .94, 1, .9, 1);
    bonnet.translate(0, deckY + .07, L * .29);
    g.add(new THREE.Mesh(bonnet, paint));

    const boot = taper(new THREE.BoxGeometry(W * .93, .2, L * .24).toNonIndexed(), .95, 1, 1, .93);
    boot.translate(0, deckY + .08, -L * .33);
    g.add(new THREE.Mesh(boot, paint));
  }

  // ---- greenhouse: narrower at the roof, raked front and back
  const cabH = van ? .92 : .60;
  const cabD = van ? L * .5 : L * .42;
  const cabZ = van ? -.12 : -.22;
  const cab = taper(new THREE.BoxGeometry(W * .93, cabH, cabD).toNonIndexed(),
                    van ? .97 : .84, 1, van ? .95 : .72, van ? .98 : .86);
  cab.translate(0, deckY + cabH / 2 + .02, cabZ);
  g.add(new THREE.Mesh(cab, roof !== null ? new THREE.MeshStandardMaterial(
    { color: roof, roughness: .25, metalness: .5, envMapIntensity: 1.4 }) : paint));

  // glazing sits just inside the greenhouse
  const glass = taper(new THREE.BoxGeometry(W * .945, cabH * .66, cabD * 1.006).toNonIndexed(),
                      van ? .97 : .845, 1, van ? .95 : .725, van ? .98 : .865);
  glass.translate(0, deckY + cabH * .58, cabZ);
  g.add(new THREE.Mesh(glass, glassMat));

  // ---- bumpers and sills
  for (const [z, dz] of [[L / 2 - .07, 1], [-L / 2 + .07, -1]]){
    const bump = taper(new THREE.BoxGeometry(W * .99, .3, .3).toNonIndexed(), .9, 1);
    bump.translate(0, sillY + .06, z);
    g.add(new THREE.Mesh(bump, dark));
  }
  const sill = new THREE.BoxGeometry(W * 1.01, .16, L * .62).toNonIndexed();
  sill.translate(0, sillY - .03, 0);
  g.add(new THREE.Mesh(sill, dark));

  // ---- wheels, set into arches
  const wheels = [];
  const wz = L * .315, wx = W * .5 - .07;
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]){
    const hubGrp = new THREE.Group();
    hubGrp.position.set(sx * wx, .35, sz * wz);
    const tyre = new THREE.Mesh(TYRE_GEO, TYRE_MAT);
    const rim = new THREE.Mesh(RIM_GEO, RIM_MAT);
    hubGrp.add(tyre, rim);
    g.add(hubGrp);
    wheels.push(hubGrp);

    // arch flare over each wheel
    const arch = new THREE.Mesh(new THREE.BoxGeometry(.1, .34, 1.02), paint);
    arch.position.set(sx * (W * .5 + .01), sillY + .14, sz * wz);
    g.add(arch);
  }

  // ---- mirrors
  if (!ghost){
    for (const sx of [-1, 1]){
      const m = new THREE.Mesh(new THREE.BoxGeometry(.2, .11, .09), dark);
      m.position.set(sx * (W * .5 + .07), deckY + cabH * .62, cabZ + cabD * .42);
      g.add(m);
    }
  }

  const lightMat = c => new THREE.MeshStandardMaterial({ color: c, emissive: c,
    emissiveIntensity: .5, roughness: .18, metalness: .1,
    transparent: ghost, opacity: ghost ? .45 : 1 });

  const heads = [];
  for (const sx of [-1, 1]){
    const h = new THREE.Mesh(new THREE.BoxGeometry(.42, .16, .1), lightMat(0xf5f2e2));
    h.position.set(sx * W * .3, sillY + hullH * .72, L / 2 + .02);
    g.add(h); heads.push(h);
  }
  const tails = [];
  for (const sx of [-1, 1]){
    const t = new THREE.Mesh(new THREE.BoxGeometry(.38, .15, .09), lightMat(0x8c1522));
    t.position.set(sx * W * .3, sillY + hullH * .76, -L / 2 - .02);
    g.add(t); tails.push(t);
  }

  let bar = null;
  if (police){
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(W + .03, .3, L * .74), dark);
    stripe.position.y = sillY + hullH * .42; g.add(stripe);

    bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(.46, .16, .26), lightMat(0xff2233));
    const blu = new THREE.Mesh(new THREE.BoxGeometry(.46, .16, .26), lightMat(0x2f6bff));
    const spine = new THREE.Mesh(new THREE.BoxGeometry(1.2, .07, .28), dark);
    red.position.x = -.3; blu.position.x = .3; spine.position.y = -.1;
    bar.add(red, blu, spine);
    bar.position.set(0, deckY + cabH + .1, cabZ);
    g.add(bar);
    bar.userData = { red, blu };
  }

  if (!ghost) g.traverse(o => { if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
  g.userData = { wheels, heads, tails, bar, L, W, ghost };
  return g;
}

const SKIN = 0xd9a884;
export function makePerson(opts = {}){
  const { shirt = 0x3a4a72, pants = 0x1b1f2c, ghost = false, cop = false } = opts;
  const g = new THREE.Group();
  const mat = c => new THREE.MeshStandardMaterial(
    ghost ? { color: 0x0aa8d6, roughness: .45, transparent: true, opacity: .52,
              emissive: 0x0a7fae, emissiveIntensity: .95 }
          : { color: c, roughness: .86, metalness: .02, envMapIntensity: .7 });

  const top = cop ? 0x1e2a4d : shirt;

  // rounded torso rather than a slab
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.20, .34, 4, 12), mat(top));
  torso.scale.set(1.18, 1, .78);
  torso.position.y = 1.02; g.add(torso);

  const hips = new THREE.Mesh(new THREE.CapsuleGeometry(.18, .1, 4, 10), mat(pants));
  hips.scale.set(1.1, 1, .82);
  hips.position.y = .76; g.add(hips);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.07, .08, .1, 8), mat(SKIN));
  neck.position.y = 1.33; g.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(.135, 16, 12), mat(ghost ? top : SKIN));
  head.scale.set(1, 1.14, 1.02);
  head.position.y = 1.47; g.add(head);

  if (cop){
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.145, .15, .07, 12), mat(0x11162a));
    cap.position.y = 1.58; g.add(cap);
    const peak = new THREE.Mesh(new THREE.BoxGeometry(.26, .022, .12), mat(0x11162a));
    peak.position.set(0, 1.55, .14); g.add(peak);
  }

  const arms = [], legs = [];
  for (const s of [-1, 1]){
    const a = new THREE.Mesh(new THREE.CapsuleGeometry(.055, .40, 4, 8), mat(top));
    a.geometry.translate(0, -.25, 0);
    a.position.set(s * .235, 1.20, 0);
    g.add(a); arms.push(a);

    const l = new THREE.Mesh(new THREE.CapsuleGeometry(.075, .44, 4, 8), mat(pants));
    l.geometry.translate(0, -.29, 0);
    l.position.set(s * .105, .74, 0);
    g.add(l); legs.push(l);

    const shoe = new THREE.Mesh(new THREE.BoxGeometry(.13, .07, .25), mat(0x23252b));
    shoe.position.set(s * .105, .035, .03);
    g.add(shoe); l.userData.shoe = shoe;
  }

  if (!ghost) g.traverse(o => { if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
  g.userData = { arms, legs, phase: Math.random() * TAU, ghost };
  return g;
}

export function animatePerson(mesh, speed, dt, baseY = 0){
  const u = mesh.userData;
  u.phase += dt * (2.4 + speed * 1.55);
  const amp = Math.min(1, speed / 3.4) * .95;
  const s = Math.sin(u.phase) * amp;
  u.legs[0].rotation.x = s;  u.legs[1].rotation.x = -s;
  u.arms[0].rotation.x = -s * .85; u.arms[1].rotation.x = s * .85;
  // feet follow the leg swing
  for (let i = 0; i < 2; i++){
    const shoe = u.legs[i].userData.shoe;
    if (!shoe) continue;
    const sw = i === 0 ? s : -s;
    shoe.position.z = .03 + Math.sin(sw) * .42;
    shoe.position.y = .035 + Math.max(0, Math.sin(sw)) * .12;
  }
  mesh.position.y = baseY + Math.abs(Math.sin(u.phase)) * .04 * amp;
}

/* -------------------------------------------------------------- car physics */

export class Car {
  constructor(mesh, tuning = {}){
    this.mesh = mesh;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector2();     // world-space (x, z)
    this.yaw = 0;
    this.spin = 0;
    this.t = {
      accel: 20, brake: 34, top: 46, drag: .34, grip: .90, turn: 2.35, ...tuning,
    };
    this.crashImpulse = 0;
  }

  get speed(){ return this.vel.length(); }

  /* input: {throttle -1..1, steer -1..1, hand: bool} */
  step(dt, input, world){
    const t = this.t;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    let vLong = this.vel.x * fx + this.vel.y * fz;
    let vLat  = this.vel.x * fz - this.vel.y * fx;

    const th = input.throttle || 0;
    if (th > 0){
      vLong += t.accel * th * dt * Math.max(.14, 1 - Math.max(0, vLong) / t.top);
    } else if (th < 0){
      if (vLong > .5) vLong -= t.brake * (-th) * dt;              // braking
      else            vLong -= t.accel * .5 * (-th) * dt;         // reverse
      vLong = Math.max(vLong, -t.top * .3);
    }

    if (input.hand) vLong -= Math.sign(vLong) * t.brake * .7 * dt;

    vLong *= (1 - t.drag * dt);
    vLat  *= (1 - (input.hand ? 2.4 : 7.5) * dt);

    // steering authority peaks at mid speed and fades when nearly stopped
    const sp = Math.abs(vLong);
    const auth = Math.min(1, sp / 5.5) * (1 - Math.min(.55, sp / t.top * .55));
    const steer = (input.steer || 0) * t.turn * auth * Math.sign(vLong || 1);
    this.yaw += steer * dt;

    // drifting: some of the turn goes sideways instead of forward
    vLat += steer * vLong * (input.hand ? .55 : .16) * dt * 4;

    const nfx = Math.sin(this.yaw), nfz = Math.cos(this.yaw);
    this.vel.set(nfx * vLong + nfz * vLat, nfz * vLong - nfx * vLat);

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;

    const hit = world.resolve(this.pos, 1.5);
    if (hit){
      const along = this.vel.x * hit.x + this.vel.y * hit.z;
      if (along < 0){
        this.crashImpulse = Math.min(1, -along / 16);
        this.vel.x -= hit.x * along * 1.35;
        this.vel.y -= hit.z * along * 1.35;
        this.vel.multiplyScalar(.55);
      }
    }

    this.spin += vLong * dt * 2.6;
    this.applyToMesh(dt, input);
    return hit;
  }

  applyToMesh(dt, input = {}){
    const m = this.mesh;
    m.position.copy(this.pos);
    m.rotation.y = this.yaw;

    const u = m.userData;
    if (u.wheels){
      for (let i = 0; i < 4; i++){
        u.wheels[i].rotation.x = this.spin;
        if (i < 2) u.wheels[i].rotation.y = (input.steer || 0) * .48;
      }
    }
    // body roll + squat
    const lat = this.vel.x * Math.cos(this.yaw) - this.vel.y * Math.sin(this.yaw);
    m.rotation.z = THREE.MathUtils.lerp(m.rotation.z, -lat * .022, Math.min(1, dt * 8));
    if (u.tails){
      const on = (input.throttle || 0) < 0 || input.hand;
      for (const t of u.tails) t.material.color.setHex(on ? 0xff5566 : 0x8c1522);
    }
  }
}

/* ------------------------------------------------------------- AI drivers */

/* Traffic: drives lanes on the road grid, turns at random at junctions. */
export class Traffic {
  constructor(scene, rnd){
    const hue = [0x8b2740, 0x2b4a7a, 0x27604a, 0x6a6a72, 0x7a5a26, 0x38304f];
    this.car = new Car(makeCar({ body: hue[(rnd() * hue.length) | 0] }),
                       { accel: 11, top: 19, turn: 2.1 });
    scene.add(this.car.mesh);
    this.dir = (rnd() * 4) | 0;
    this.rnd = rnd;
    this.target = new THREE.Vector2();
    this.alive = true;
    this.stunned = 0;
  }
  placeRandom(rnd){
    const i = (rnd() * (CFG.N + 1)) | 0, j = (rnd() * (CFG.N + 1)) | 0;
    this.car.pos.set(roadCenter(i), 0, roadCenter(j));
    this.dir = (rnd() * 4) | 0;
    this.car.yaw = this.dir * Math.PI / 2;
    this.pickTarget();
  }
  pickTarget(){
    const d = [[0, 1], [1, 0], [0, -1], [-1, 0]][this.dir];
    const nx = snapToRoad(this.car.pos.x) + d[0] * CFG.CELL;
    const nz = snapToRoad(this.car.pos.z) + d[1] * CFG.CELL;
    const lim = CFG.HALF - 4;
    if (Math.abs(nx) > lim || Math.abs(nz) > lim){
      this.dir = (this.dir + 2) % 4;
      return this.pickTarget();
    }
    this.target.set(nx, nz);
  }
  step(dt, world, avoid){
    const c = this.car;
    if (this.stunned > 0){ this.stunned -= dt; }
    const dx = this.target.x - c.pos.x, dz = this.target.y - c.pos.z;
    if (dx * dx + dz * dz < 36){
      // choose a new heading at the junction (rarely a U-turn)
      const r = this.rnd();
      this.dir = (this.dir + (r < .5 ? 0 : r < .78 ? 1 : r < .98 ? 3 : 2)) % 4;
      this.pickTarget();
    }
    const want = Math.atan2(this.target.x - c.pos.x, this.target.y - c.pos.z);
    const steer = THREE.MathUtils.clamp(angleDelta(c.yaw, want) * 1.8, -1, 1);

    // brake for whatever is directly ahead
    let throttle = this.stunned > 0 ? 0 : .62;
    if (avoid){
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
      const ax = avoid.x - c.pos.x, az = avoid.z - c.pos.z;
      const ahead = ax * fx + az * fz;
      if (ahead > 0 && ahead < 13 && Math.abs(ax * fz - az * fx) < 3.4) throttle = -.5;
    }
    c.step(dt, { throttle, steer }, world);
  }
}

/* Police: pursues a target position, rams and boxes in. */
export class Police {
  constructor(scene){
    this.car = new Car(makeCar({ body: 0xe8eef8, police: true }),
                       { accel: 22, top: 45, turn: 2.5 });
    scene.add(this.car.mesh);
    this.blink = 0;
    this.target = null;
    this.spawnGrace = 1.2;
  }
  step(dt, world, targetPos){
    const c = this.car;
    this.blink += dt;
    const u = c.mesh.userData.bar?.userData;
    if (u){
      const on = (this.blink * 6 | 0) % 2 === 0;
      u.red.material.color.setHex(on ? 0xff2233 : 0x3a0a10);
      u.blu.material.color.setHex(on ? 0x0a1030 : 0x2f6bff);
    }
    if (this.spawnGrace > 0) this.spawnGrace -= dt;

    if (!targetPos){ c.step(dt, { throttle: 0, steer: 0 }, world); return; }

    const dx = targetPos.x - c.pos.x, dz = targetPos.z - c.pos.z;
    const dist = Math.hypot(dx, dz);

    // Head for the target, but bias onto the road grid when far away so they
    // don't grind along building walls.
    let aimX = targetPos.x, aimZ = targetPos.z;
    if (dist > 30){
      const sx = snapToRoad(c.pos.x), sz = snapToRoad(c.pos.z);
      if (Math.abs(c.pos.x - sx) < Math.abs(c.pos.z - sz)) aimX = sx; else aimZ = sz;
    }
    const want = Math.atan2(aimX - c.pos.x, aimZ - c.pos.z);
    const off = angleDelta(c.yaw, want);
    const steer = THREE.MathUtils.clamp(off * 1.9, -1, 1);
    let throttle = Math.abs(off) > 2.3 ? -.7 : .95;
    if (dist < 7) throttle = .3;
    c.step(dt, { throttle, steer, hand: Math.abs(off) > 1.5 && c.speed > 12 }, world);
  }
}

/* Pedestrians: wander the pavement, flinch from traffic. */
export class Ped {
  constructor(scene, rnd){
    const shirts = [0x6a4a7a, 0x2f5f5a, 0x7a3a3a, 0x2c3e6a, 0x6a6338, 0x8a8a95];
    this.mesh = makePerson({ shirt: shirts[(rnd() * shirts.length) | 0] });
    scene.add(this.mesh);
    this.rnd = rnd;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.dir = (rnd() * 4) | 0;
    this.knocked = 0;
    this.target = new THREE.Vector2();
  }
  placeRandom(rnd){
    const i = (rnd() * (CFG.N + 1)) | 0, j = (rnd() * (CFG.N + 1)) | 0;
    const off = CFG.ROAD / 2 + 1.5;
    this.pos.set(roadCenter(i) + (rnd() > .5 ? off : -off), 0, roadCenter(j) + (rnd() - .5) * 20);
    this.pickTarget();
  }
  pickTarget(){
    const d = [[0, 1], [1, 0], [0, -1], [-1, 0]][this.dir];
    this.target.set(this.pos.x + d[0] * CFG.CELL, this.pos.z + d[1] * CFG.CELL);
    const lim = CFG.HALF - 8;
    if (Math.abs(this.target.x) > lim || Math.abs(this.target.y) > lim){
      this.dir = (this.dir + 2) % 4;
      const e = [[0, 1], [1, 0], [0, -1], [-1, 0]][this.dir];
      this.target.set(this.pos.x + e[0] * CFG.CELL, this.pos.z + e[1] * CFG.CELL);
    }
  }
  step(dt, world, threat){
    if (this.knocked > 0){
      this.knocked -= dt;
      this.mesh.rotation.z = Math.min(Math.PI / 2, this.mesh.rotation.z + dt * 6);
      this.mesh.position.copy(this.pos);
      this.mesh.position.y = groundY(this.pos.x, this.pos.z) + .3;
      return;
    }
    this.mesh.rotation.z = 0;

    let speed = 1.6;
    let tx = this.target.x, tz = this.target.y;
    if (threat){
      const dx = this.pos.x - threat.x, dz = this.pos.z - threat.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 210){ tx = this.pos.x + dx * 4; tz = this.pos.z + dz * 4; speed = 4.6; }
    }
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    if (d < 3 && speed < 2){ this.dir = (this.dir + (this.rnd() > .5 ? 1 : 3)) % 4; this.pickTarget(); }

    this.pos.x += dx / d * speed * dt;
    this.pos.z += dz / d * speed * dt;
    world.resolve(this.pos, .45);
    this.yaw = Math.atan2(dx, dz);

    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    animatePerson(this.mesh, speed, dt, groundY(this.pos.x, this.pos.z));
  }
}

/* ---------------------------------------------------------- mission props */

export function makeRelay(color = 0x39e6ff){
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 3.0, .3, 20),
    new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: .55, metalness: .6, envMapIntensity: 1 })
  );
  base.position.y = .16; g.add(base);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.35, .14, 8, 28),
    new THREE.MeshBasicMaterial({ color, toneMapped: false })
  );
  ring.rotation.x = -Math.PI / 2; ring.position.y = .34; g.add(ring);

  const pylon = new THREE.Mesh(
    new THREE.CylinderGeometry(.28, .42, 4.4, 8),
    new THREE.MeshStandardMaterial({ color: 0x3a4149, roughness: .45, metalness: .75, envMapIntensity: 1 })
  );
  pylon.position.y = 2.4; g.add(pylon);

  const lamp = new THREE.Mesh(
    new THREE.OctahedronGeometry(.7),
    new THREE.MeshBasicMaterial({ color, toneMapped: false })
  );
  lamp.position.y = 5.1; g.add(lamp);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.0, 2.4, 15, 18, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .07,
      side: THREE.FrontSide, depthWrite: false, toneMapped: false })
  );
  beam.position.y = 7.5; g.add(beam);

  g.userData = { ring, lamp, beam, color };
  return g;
}

export function makeVault(){
  const g = new THREE.Group();
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(7.4, 6.4, .7),
    new THREE.MeshStandardMaterial({ color: 0x555c66, roughness: .38, metalness: .85, envMapIntensity: 1.1 })
  );
  frame.position.y = 3.2; g.add(frame);

  const door = new THREE.Mesh(
    new THREE.CylinderGeometry(2.7, 2.7, .9, 28),
    new THREE.MeshStandardMaterial({ color: 0x9aa6bb, roughness: .3, metalness: .78,
                                     emissive: 0x1a2130, emissiveIntensity: 1 })
  );
  door.rotation.x = Math.PI / 2;
  door.position.set(0, 3.2, .5);
  g.add(door);

  const spokes = new THREE.Mesh(
    new THREE.TorusGeometry(1.5, .16, 8, 20),
    new THREE.MeshStandardMaterial({ color: 0x8d99ad, roughness: .3, metalness: 1 })
  );
  spokes.position.set(0, 3.2, 1.0); g.add(spokes);

  const lights = [];
  for (let i = 0; i < 3; i++){
    const l = new THREE.Mesh(new THREE.SphereGeometry(.22, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x551119, toneMapped: false }));
    l.position.set(-1.6 + i * 1.6, 6.6, .5);
    g.add(l); lights.push(l);
  }
  g.userData = { door, spokes, lights, open: 0 };
  return g;
}

export function makeLoot(){
  const g = new THREE.Group();
  const c = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, .8, .7),
    new THREE.MeshStandardMaterial({ color: 0xffc861, roughness: .3, metalness: .9,
      emissive: 0xffa726, emissiveIntensity: .55 })
  );
  g.add(c);
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(2.2, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0xffc861, transparent: true, opacity: .1,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
  );
  g.add(halo);
  g.userData = { halo };
  return g;
}

export function makeMarker(color, radius = 3.4){
  const g = new THREE.Group();
  // A painted ring reads as a marked bay; a filled disc reads as a puddle.
  const disc = new THREE.Mesh(
    new THREE.RingGeometry(radius * .80, radius, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .85,
      depthWrite: false, toneMapped: false, side: THREE.DoubleSide })
  );
  disc.rotation.x = -Math.PI / 2; disc.position.y = .06;
  g.add(disc);
  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(radius * .80, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .14,
      depthWrite: false, toneMapped: false })
  );
  fill.rotation.x = -Math.PI / 2; fill.position.y = .055;
  g.add(fill);
  const col = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * .74, radius * .86, 15, 22, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .055,
      side: THREE.FrontSide, depthWrite: false, toneMapped: false })
  );
  col.position.y = 7.5; g.add(col);
  g.userData = { disc, col, fill };
  return g;
}
