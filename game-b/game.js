/* ECHO CITY — game.js
   A GTA-shaped open city with one twist: every run you make is replayed back at you
   as a solid past self. The vault needs four bodies. You only have one — but you
   have four passes at the same eighty seconds. */

import * as THREE from 'three';
import { CFG, buildCity, roadCenter, snapToRoad, mulberry, sunDir, groundY } from './world.js';
import {
  Car, Traffic, Police, Ped, makeCar, makePerson, animatePerson,
  makeRelay, makeVault, makeLoot, makeMarker, angleDelta,
} from './actors.js';
import { Sound } from './audio.js';

/* ------------------------------------------------------------------ config */

const LOOP_LEN   = 115;     // seconds per loop — the map is 1.3km across
const MAX_LOOPS  = 6;
const REC_HZ     = 20;
const RELAY_R    = 4.0;     // radius you must stand inside
const VAULT_HOLD = 1.6;     // seconds to crack it once all relays are live
const LOOT_HOLD  = 1.2;
const BUST_R     = 8.5;
const BUST_TIME  = 2.6;
const WORLD_SEED = 20260823;

const KEYS = [
  ['W A S D', 'move / drive'],
  ['Mouse', 'look around'],
  ['Shift', 'sprint / handbrake'],
  ['Space', 'brake'],
  ['F', 'enter / leave car'],
  ['R', 'rewind the loop early'],
  ['Esc', 'pause'],
  ['M', 'mute'],
  ['I', 'invert look'],
];

/* ------------------------------------------------------------------- setup */

/* Coarse pointer = phone/tablet: touch controls, lighter scene, no pointer lock. */
const TOUCH = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
if (TOUCH) document.body.classList.add('touch');

const canvas = document.getElementById('gl');
const stage = document.getElementById('stage');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err){
  window.__echoFail?.('This browser can\'t open a WebGL context',
    'ECHO CITY renders in 3D and needs WebGL. The browser reported: <code>' +
    (err && err.message ? err.message : String(err)) + '</code>',
    'Usually this means hardware acceleration is switched off, or the GPU is blocklisted. ' +
    'Check chrome://gpu (or about:support in Firefox).');
  throw err;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, TOUCH ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.98;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xc2ced9, 0.00115);  // daylight haze over a 1.3km city

const camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.25, CFG.WORLD * 1.3);
camera.position.set(0, 8, 20);

/* Midday rig: sky fill from the environment map, plus one hard sun that
   actually casts shadows. The shadow camera is small and follows the player,
   so a 700m city gets sharp shadows from a single 2k map. */
scene.add(new THREE.HemisphereLight(0xbcd6f2, 0x8d8578, 0.55));

const sun = new THREE.DirectionalLight(0xfff4e0, 2.5);
sun.castShadow = true;
const SHADOW_SPAN = TOUCH ? 60 : 95;
sun.shadow.mapSize.set(TOUCH ? 1024 : 2048, TOUCH ? 1024 : 2048);
sun.shadow.camera.left = -SHADOW_SPAN; sun.shadow.camera.right = SHADOW_SPAN;
sun.shadow.camera.top  =  SHADOW_SPAN; sun.shadow.camera.bottom = -SHADOW_SPAN;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 520;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.9;
scene.add(sun, sun.target);

const world = buildCity(scene, renderer);
const P = world.plaza;

const sound = new Sound();

/* ------------------------------------------------------------------- input */

const keys = new Set();
let mouseDX = 0, mouseDY = 0, locked = false;

addEventListener('keydown', e => {
  if (e.code === 'Escape'){ if (S.mode === 'play') pause(); else if (S.mode === 'paused') resume(); return; }
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'Tab') e.preventDefault();
  if (S.mode !== 'play') return;
  if (e.code === 'KeyF') toggleVehicle();
  if (e.code === 'KeyR') endLoop('rewind');
  if (e.code === 'KeyM'){ sound.setMuted(!sound.muted); toast(sound.muted ? 'Muted' : 'Sound on'); }
  if (e.code === 'KeyI'){ setInvert(!invertY); toast('Invert look: ' + (invertY ? 'on' : 'off')); }
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

const lockPointer = () => { if (!TOUCH && canvas.requestPointerLock) { try { canvas.requestPointerLock(); } catch {} } };
canvas.addEventListener('click', () => { if (S.mode === 'play') lockPointer(); });
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; });
addEventListener('mousemove', e => {
  if (!locked) return;
  mouseDX += e.movementX; mouseDY += e.movementY;
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ---------------------------------------------------------- touch controls */


/* Vertical look. The natural convention is: drag/move up => look up, which
   means the camera pitch goes DOWN. Some people want the opposite, so it is a
   remembered preference rather than a hard-coded choice. */
let invertY = false;
try { invertY = localStorage.getItem('echocity.invertY') === '1'; } catch {}

function setInvert(v){
  invertY = v;
  try { localStorage.setItem('echocity.invertY', v ? '1' : '0'); } catch {}
  for (const b of document.querySelectorAll('[data-tog="invert"]'))
    b.innerHTML = 'Invert look: <b>' + (v ? 'on' : 'off') + '</b>';
}

const touch = { x: 0, y: 0, brake: false, active: false };
const stickEl = document.getElementById('stick');
const knobEl  = document.getElementById('knob');
const STICK_R = 58;

if (TOUCH){
  let moveId = null, lookId = null, ox = 0, oy = 0, lx = 0, ly = 0;

  const isBtn = t => t.target && t.target.closest && t.target.closest('.tb, .btn');

  stage.addEventListener('touchstart', e => {
    for (const t of e.changedTouches){
      if (isBtn(t)) continue;
      // left half drives, right half looks
      if (t.clientX < innerWidth * .5 && moveId === null){
        moveId = t.identifier; ox = t.clientX; oy = t.clientY;
        stickEl.style.left = ox + 'px'; stickEl.style.top = oy + 'px';
        stickEl.classList.add('on');
        touch.active = true;
      } else if (lookId === null){
        lookId = t.identifier; lx = t.clientX; ly = t.clientY;
      }
    }
    if (S.mode === 'play') e.preventDefault();
  }, { passive: false });

  stage.addEventListener('touchmove', e => {
    for (const t of e.changedTouches){
      if (t.identifier === moveId){
        let dx = t.clientX - ox, dy = t.clientY - oy;
        const d = Math.hypot(dx, dy);
        if (d > STICK_R){ dx *= STICK_R / d; dy *= STICK_R / d; }
        knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        touch.x =  dx / STICK_R;
        touch.y = -dy / STICK_R;          // up on screen = forward
      } else if (t.identifier === lookId){
        mouseDX += (t.clientX - lx) * 2.1;
        mouseDY += (t.clientY - ly) * 2.1;
        lx = t.clientX; ly = t.clientY;
      }
    }
    if (S.mode === 'play') e.preventDefault();
  }, { passive: false });

  const endTouch = e => {
    for (const t of e.changedTouches){
      if (t.identifier === moveId){
        moveId = null; touch.x = touch.y = 0; touch.active = false;
        stickEl.classList.remove('on');
        knobEl.style.transform = 'translate(-50%,-50%)';
      } else if (t.identifier === lookId) lookId = null;
    }
  };
  stage.addEventListener('touchend', endTouch);
  stage.addEventListener('touchcancel', endTouch);

  const bind = (id, down, up) => {
    const b = document.getElementById(id);
    b.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); b.classList.add('held'); down(); }, { passive: false });
    const off = e => { e.stopPropagation(); b.classList.remove('held'); up && up(); };
    b.addEventListener('touchend', off);
    b.addEventListener('touchcancel', off);
  };
  bind('tb-brake', () => { touch.brake = true; }, () => { touch.brake = false; });
  bind('tb-car',   () => { if (S.mode === 'play') toggleVehicle(); });
  bind('tb-rew',   () => { if (S.mode === 'play') endLoop('rewind'); });
  bind('tb-pause', () => { if (S.mode === 'play') pause(); else if (S.mode === 'paused') resume(); });
}

const held = c => keys.has(c);
const dead = v => Math.abs(v) < .16 ? 0 : v;
const axisX = () => dead(touch.x) ||
  ((held('KeyD') || held('ArrowRight') ? 1 : 0) - (held('KeyA') || held('ArrowLeft') ? 1 : 0));
const axisY = () => dead(touch.y) ||
  ((held('KeyW') || held('ArrowUp') ? 1 : 0) - (held('KeyS') || held('ArrowDown') ? 1 : 0));
const brakeHeld = () => touch.brake || held('Space');
const handHeld  = () => touch.brake || held('ShiftLeft') || held('ShiftRight');

/* ------------------------------------------------------------------- state */

const S = {
  mode: 'title',
  loop: 1,
  t: 0,                 // time within the current loop
  echoes: [],           // finished recordings from previous loops
  rec: null,            // the recording in progress
  recAcc: 0,
  wanted: 0,
  bust: 0,
  hasLoot: false,
  won: false,
  stats: { crashes: 0, busts: 0, best: 0 },
};

/* ----------------------------------------------------------- player entity */

const playerMesh = makePerson({ shirt: 0x2f6f8f, pants: 0x14171f });
scene.add(playerMesh);

const player = {
  pos: new THREE.Vector3(),
  yaw: 0,
  speed: 0,
  car: null,          // Car instance when driving
  camYaw: 0,
  camPitch: 0.12,
};

const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();

/* ----------------------------------------------------------------- traffic */

const traffic = [];     // live traffic this loop (shrinks when you carjack)
const peds = [];
const police = [];
const parked = [];      // Car instances sitting at the kerb, free to steal

let rnd = mulberry(WORLD_SEED);

const trafficBase = [];
for (let i = 0; i < (TOUCH ? 20 : 38); i++) trafficBase.push(new Traffic(scene, mulberry(WORLD_SEED + i * 77)));
for (let i = 0; i < (TOUCH ? 20 : 40); i++) peds.push(new Ped(scene, mulberry(WORLD_SEED + 5000 + i * 31)));

const parkedBase = [];
for (let i = 0; i < (TOUCH ? 22 : 34); i++){
  const hue = [0x7a2f3a, 0x243f6b, 0x2c5a45, 0x5c5f6a, 0x6f5a2a, 0x40315c,
               0x8c8f94, 0x1f2b3a, 0x94734a];
  const c = new Car(makeCar({ body: hue[i % hue.length] }), {});
  scene.add(c.mesh);
  parkedBase.push(c);
}

/* ------------------------------------------------------------- mission set */

const relayColors = [0x39e6ff, 0xb56bff, 0x5dffa8];
const relays = [];
for (let k = 0; k < 3; k++){
  const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
  const R = 330;
  const x = snapToRoad(P.x + Math.cos(a) * R);
  const z = snapToRoad(P.z + Math.sin(a) * R);
  const mesh = makeRelay(relayColors[k]);
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  relays.push({ x, z, mesh, held: false, color: relayColors[k], everHeld: false, label: 'ABC'[k] });
}

const vault = makeVault();
vault.position.set(P.x, 0, P.vaultZ + 4.6);
scene.add(vault);
const vaultPos = new THREE.Vector3(P.x, 0, P.vaultZ + 7.5);

const loot = makeLoot();
loot.position.set(vaultPos.x, 1.4, vaultPos.z);
loot.visible = false;
scene.add(loot);

/* getaway van + zone, out at the southern edge — also where each loop starts */
const vanX = snapToRoad(P.x + 92), vanZ = snapToRoad(P.z + 414);
const van = makeCar({ body: 0x21313f, van: true });
van.position.set(vanX, 0, vanZ);
van.rotation.y = Math.PI;
scene.add(van);
const vanZone = makeMarker(0x5dffa8, 5.5);
vanZone.position.set(vanX, 0, vanZ);
scene.add(vanZone);

const vaultZone = makeMarker(0xffc861, 4.2);
vaultZone.position.copy(vaultPos);
scene.add(vaultZone);

const mission = { open: 0, cracking: 0, lootTimer: 0, alarm: false };

/* ------------------------------------------------------------------ echoes */

class Echo {
  constructor(frames, index){
    this.frames = frames;
    this.index = index;
    this.person = makePerson({ shirt: 0x2f6f8f, pants: 0x1b2430, ghost: true });
    this.car = makeCar({ body: 0x1d5f7a, ghost: true });
    scene.add(this.person, this.car);
    this.pos = new THREE.Vector3();
    this.inCar = false;
    this.arrested = 0;
    this.gone = false;
    this.trail = null;
  }
  reset(){
    this.gone = false; this.arrested = 0;
    this.person.visible = true; this.car.visible = false;
  }
  sample(t){
    const f = this.frames;
    if (!f.length) return null;
    const idx = t * REC_HZ;
    if (idx >= f.length - 1) return f[f.length - 1];
    const i = Math.floor(idx), a = f[i], b = f[i + 1], u = idx - i;
    return {
      x: a.x + (b.x - a.x) * u,
      z: a.z + (b.z - a.z) * u,
      yaw: a.yaw + angleDelta(a.yaw, b.yaw) * u,
      v: a.v,
      done: false,
    };
  }
  step(t, dt){
    if (this.gone){ this.person.visible = this.car.visible = false; return; }
    const s = this.sample(t);
    if (!s){ this.person.visible = this.car.visible = false; return; }
    const past = t * REC_HZ >= this.frames.length - 1;
    this.pos.set(s.x, 0, s.z);
    this.inCar = !!s.v;

    this.person.visible = !this.inCar && !past;
    this.car.visible = this.inCar && !past;

    const m = this.inCar ? this.car : this.person;
    m.position.set(s.x, 0, s.z);
    m.rotation.y = s.yaw;
    if (!this.inCar && !past){
      const sp = Math.hypot(s.x - this.px || 0, s.z - this.pz || 0) / Math.max(dt, .001);
      animatePerson(this.person, Math.min(6, sp), dt, groundY(s.x, s.z));
    }
    this.px = s.x; this.pz = s.z;

    // shimmer so echoes read as unreal even at a glance
    const pulse = .28 + Math.sin(t * 4 + this.index) * .07;
    for (const obj of [this.person, this.car]){
      obj.traverse(o => { if (o.material && o.material.transparent && o.material.opacity < .9) o.material.opacity = pulse + .1; });
    }
  }
  dispose(){ scene.remove(this.person, this.car); }
}

let liveEchoes = [];

/* --------------------------------------------------------------- HUD utils */

const el = id => document.getElementById(id);
const hud = el('hud');
const toastEl = el('toast');
let toastT = 0;

function toast(main, sub = ''){
  toastEl.innerHTML = main + (sub ? `<small>${sub}</small>` : '');
  toastEl.classList.add('on');
  toastT = 2.6;
}

const starsWrap = el('stars');
for (let i = 0; i < 5; i++){
  const d = document.createElement('div'); d.className = 'star'; starsWrap.appendChild(d);
}
const echobar = el('echobar');
for (let i = 0; i < MAX_LOOPS - 1; i++){
  const d = document.createElement('div'); d.className = 'pip'; echobar.appendChild(d);
}

const OBJ_DEFS = [
  { id: 'relay', text: () => `Hold all three relays — ${relays.filter(r => r.held).length}/3 live` },
  { id: 'vault', text: () => 'Crack the vault under Nakamura Tower' },
  { id: 'loot',  text: () => 'Take the case' },
  { id: 'van',   text: () => 'Get it to the van' },
];
const objsWrap = el('objs');
const objEls = OBJ_DEFS.map(() => {
  const d = document.createElement('div'); d.className = 'obj';
  d.innerHTML = '<span class="box"></span><span class="tx"></span>';
  objsWrap.appendChild(d);
  return d;
});

for (const list of [el('keylist'), el('keylist2')]){
  list.innerHTML = KEYS.map(([k, v]) => `<div class="k"><kbd>${k}</kbd>${v}</div>`).join('');
}
el('loopmax').textContent = MAX_LOOPS;

/* ------------------------------------------------------------- loop resets */

function resetLoop(){
  rnd = mulberry(WORLD_SEED);           // the city snaps back, exactly as it was
  S.t = 0;
  S.rec = [];
  S.recAcc = 0;
  S.wanted = 0;
  S.bust = 0;
  S.hasLoot = false;

  mission.open = 0; mission.cracking = 0; mission.lootTimer = 0; mission.alarm = false;
  loot.visible = false;
  for (const r of relays){ r.held = false; r.everHeld = false; }

  traffic.length = 0; traffic.push(...trafficBase);
  parked.length = 0;  parked.push(...parkedBase);

  for (const t of traffic){ t.placeRandom(rnd); t.stunned = 0; t.car.mesh.visible = true; }
  for (const p of peds){ p.placeRandom(rnd); p.knocked = 0; p.mesh.rotation.z = 0; }
  for (const c of police) scene.remove(c.car.mesh);
  police.length = 0;

  // parked cars along the kerb, same spots every loop
  const pr = mulberry(WORLD_SEED + 999);
  for (const c of parked){
    if (c === parked[0]){          // the car you start each loop in
      c.pos.set(vanX - 5.2, 0, vanZ + 9);
      c.yaw = Math.PI;
      c.vel.set(0, 0); c.spin = 0;
      c.mesh.visible = true;
      c.applyToMesh(.016, {});
      continue;
    }
    const i = (pr() * (CFG.N + 1)) | 0, j = (pr() * (CFG.N + 1)) | 0;
    const along = (pr() - .5) * (CFG.CELL - CFG.ROAD - 8);
    const side = (CFG.ROAD / 2 - 2.2) * (pr() > .5 ? 1 : -1);
    if (pr() > .5){
      c.pos.set(roadCenter(i) + side, 0, roadCenter(j) + along);
      c.yaw = side > 0 ? 0 : Math.PI;
    } else {
      c.pos.set(roadCenter(i) + along, 0, roadCenter(j) + side);
      c.yaw = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    c.vel.set(0, 0); c.spin = 0;
    c.mesh.visible = true;
    c.applyToMesh(0.016, {});
  }

  // Every loop begins behind the wheel of the getaway car, rolling.
  // This is a driving game; walking is what you do at the relays.
  player.car = parked[0];
  player.car.pos.set(vanX - 5.2, 0, vanZ + 9);
  player.car.yaw = Math.PI;
  player.car.vel.set(0, 0);
  player.pos.copy(player.car.pos);
  player.yaw = Math.PI;
  player.camYaw = 0;
  player.camPitch = .17;
  playerMesh.visible = false;

  liveEchoes = S.echoes.slice();
  for (const e of liveEchoes) e.reset();
  computeCoverage();
}

/* Where, on the loop's own clock, the echoes will be standing on each relay.
   This is the plan you're working against — read it, then fill the gaps. */
const COV_STEP = .25;
const COV_N = Math.ceil(LOOP_LEN / COV_STEP);
let coverage = relays.map(() => new Uint8Array(COV_N));

function computeCoverage(){
  coverage = relays.map(() => new Uint8Array(COV_N));
  for (const e of liveEchoes){
    const maxT = (e.frames.length - 1) / REC_HZ;
    for (let b = 0; b < COV_N; b++){
      const t = b * COV_STEP;
      if (t > maxT) break;
      const s = e.sample(t);
      if (!s || s.v) continue;                 // must be on foot to weigh the plate
      for (let k = 0; k < relays.length; k++){
        const r = relays[k];
        const dx = s.x - r.x, dz = s.z - r.z;
        if (dx * dx + dz * dz < RELAY_R * RELAY_R) coverage[k][b] = 1;
      }
    }
  }
}

const tlC = el('tl'), tg = tlC.getContext('2d');
function drawTimeline(){
  const W = tlC.width, H = tlC.height;
  const rowH = 14, gap = 5;
  tg.clearRect(0, 0, W, H);
  for (let k = 0; k < relays.length; k++){
    const y = k * (rowH + gap);
    tg.fillStyle = 'rgba(18,24,34,.10)';
    tg.fillRect(0, y, W, rowH);
    tg.fillStyle = '#' + relays[k].color.toString(16).padStart(6, '0');
    for (let b = 0; b < COV_N; b++){
      if (!coverage[k][b]) continue;
      tg.fillRect(b / COV_N * W, y, Math.ceil(W / COV_N) + .5, rowH);
    }
    // live state ticks on the left edge
    tg.fillStyle = relays[k].held ? '#12805a' : 'rgba(18,24,34,.25)';
    tg.fillRect(0, y, 3, rowH);
  }
  const px = S.t / LOOP_LEN * W;
  tg.fillStyle = '#12161d';
  tg.fillRect(px - 1, 0, 2, relays.length * (rowH + gap) - gap);
}

function startGame(){
  S.mode = 'play';
  S.loop = 1;
  S.won = false;
  for (const e of S.echoes) e.dispose();
  S.echoes = [];
  S.stats = { crashes: 0, busts: 0, best: 0 };
  resetLoop();
  hud.classList.add('on');
  showScreen(null);
  sound.init(); sound.resume();
  lockPointer();
  toast('LOOP 1', 'Steal a car. Learn the route. The clock resets, you don\'t.');
}

function endLoop(reason){
  if (S.mode !== 'play') return;

  if (reason === 'win'){
    S.won = true;
    sound.fanfare();
    finish(true, reason);
    return;
  }
  if (reason === 'busted'){ S.stats.busts++; sound.fail(); }
  else sound.rewind();

  // bank the run as an echo
  if (S.rec && S.rec.length > 8 && S.echoes.length < MAX_LOOPS - 1){
    S.echoes.push(new Echo(S.rec, S.echoes.length));
  }
  S.stats.best = Math.max(S.stats.best, relays.filter(r => r.everHeld).length);

  if (S.loop >= MAX_LOOPS){ finish(false, reason); return; }

  S.loop++;
  const fx = el('rewindfx');
  fx.classList.add('on');
  setTimeout(() => fx.classList.remove('on'), 60);
  resetLoop();

  const n = S.echoes.length;
  toast(`LOOP ${S.loop}`,
    n === 1 ? 'One echo is out there now. It repeats everything you just did.'
            : `${n} echoes on the street. Work with them.`);
}

function finish(won, reason){
  S.mode = 'end';
  if (!TOUCH) document.exitPointerLock?.();
  hud.classList.remove('on');
  el('end-title').textContent = won ? 'CLEAN GETAWAY' : (reason === 'busted' ? 'BUSTED' : 'OUT OF LOOPS');
  el('end-title').style.color = won ? 'var(--green)' : 'var(--red)';
  el('end-tag').textContent = won ? 'The loop lets you go' : 'The loop closes over you';
  el('end-body').innerHTML = won
    ? `Four of you walked out of Nakamura Plaza tonight. Three of them were memories, and the city
       will forget them by morning — but the case is real, and it's in the van.`
    : `The eightieth second comes for everyone. Your echoes are still down there repeating
       your mistakes, over and over, at exactly the same moment. Cut a cleaner route and run it again.`;
  el('end-stats').innerHTML = `
    <div><div class="n">${S.loop}</div><div class="l">Loops burned</div></div>
    <div><div class="n">${S.echoes.length}</div><div class="l">Echoes left behind</div></div>
    <div><div class="n">${S.stats.busts}</div><div class="l">Arrests</div></div>
    <div><div class="n">${won ? '100%' : Math.round(S.stats.best / 3 * 100) + '%'}</div><div class="l">Job complete</div></div>`;
  showScreen('scr-end');
}

/* ---------------------------------------------------------------- screens */

function showScreen(id){
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('on', s.id === id);
}
function pause(){
  if (S.mode !== 'play') return;
  S.mode = 'paused';
  if (!TOUCH) document.exitPointerLock?.();
  showScreen('scr-pause');
}
function resume(){
  if (S.mode !== 'paused') return;
  S.mode = 'play';
  showScreen(null);
  lockPointer();
}
for (const b of document.querySelectorAll('[data-tog="invert"]'))
  b.onclick = () => setInvert(!invertY);
setInvert(invertY);

el('btn-start').onclick = startGame;
el('btn-again').onclick = startGame;
el('btn-resume').onclick = resume;
el('btn-quit').onclick = () => { S.mode = 'title'; hud.classList.remove('on'); showScreen('scr-title'); };

/* -------------------------------------------------------------- vehicles */

function nearestCar(maxDist){
  let best = null, bd = maxDist * maxDist;
  const cars = [...parked.map(c => ({ c, kind: 'parked' })),
                ...traffic.map(t => ({ c: t.car, kind: 'traffic', t }))];
  for (const entry of cars){
    if (!entry.c.mesh.visible) continue;
    const dx = entry.c.pos.x - player.pos.x, dz = entry.c.pos.z - player.pos.z;
    const d = dx * dx + dz * dz;
    if (d < bd){ bd = d; best = entry; }
  }
  return best;
}

function toggleVehicle(){
  if (player.car){
    // step out on the driver's side
    const c = player.car;
    if (c.speed > 9){ toast('Too fast to bail'); return; }
    const side = new THREE.Vector3(Math.cos(c.yaw), 0, -Math.sin(c.yaw)).multiplyScalar(2.3);
    player.pos.copy(c.pos).add(side);
    world.resolve(player.pos, .5);
    player.yaw = c.yaw;
    c.vel.set(0, 0);
    playerMesh.visible = true;
    player.car = null;
    sound.blip(320, .1, 'square', .12);
  } else {
    const found = nearestCar(4.6);
    if (!found){ return; }
    if (found.kind === 'traffic'){
      // yank the driver out — the city notices
      found.t.alive = false;
      traffic.splice(traffic.indexOf(found.t), 1);
      parked.push(found.c);
      bumpWanted(1, 'Carjacking reported');
    }
    player.car = found.c;
    playerMesh.visible = false;
    sound.blip(520, .09, 'square', .14);
  }
}

/* ------------------------------------------------------------------ wanted */

function bumpWanted(n, why){
  const before = S.wanted;
  S.wanted = Math.min(5, S.wanted + n);
  if (S.wanted > before){
    sound.alarm();
    if (why) toast(why, `Wanted ${S.wanted}★`);
  }
}

function spawnPolice(){
  const want = S.wanted;
  while (police.length < want){
    const p = new Police(scene);
    const a = Math.random() * Math.PI * 2;
    const d = 110 + Math.random() * 60;
    p.car.pos.set(snapToRoad(player.pos.x + Math.cos(a) * d), 0,
                  snapToRoad(player.pos.z + Math.sin(a) * d));
    p.car.yaw = a + Math.PI;
    police.push(p);
  }
  while (police.length > want){
    const p = police.pop();
    scene.remove(p.car.mesh);
  }
}

/* ------------------------------------------------------------------- toast */

function bodyPositions(){
  const out = [{ pos: player.car ? player.car.pos : player.pos, isPlayer: true, onFoot: !player.car }];
  for (const e of liveEchoes) if (!e.gone && e.person.visible) out.push({ pos: e.pos, isPlayer: false, onFoot: true, echo: e });
  return out;
}

/* -------------------------------------------------------------------- tick */

const tmp = new THREE.Vector3();
let last = performance.now();
let shake = 0;
let crashFlash = 0;

/* Adaptive quality: a 1.3km city with shadows is a lot to ask of a phone.
   If we can't hold frame rate, step the cost down rather than stutter. */
const QUALITY = [
  { pr: TOUCH ? 1.5 : 2,   shadow: true,  span: TOUCH ? 60 : 95 },
  { pr: TOUCH ? 1.15 : 1.4, shadow: true,  span: 55 },
  { pr: 0.95,              shadow: false, span: 55 },
];
let qLevel = 0, fpsAcc = 0, fpsN = 0, qTimer = 0;

function applyQuality(){
  const q = QUALITY[qLevel];
  renderer.setPixelRatio(Math.min(devicePixelRatio, q.pr));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = q.shadow;
  sun.castShadow = q.shadow;
  sun.shadow.camera.left = -q.span; sun.shadow.camera.right = q.span;
  sun.shadow.camera.top = q.span;   sun.shadow.camera.bottom = -q.span;
  sun.shadow.camera.updateProjectionMatrix();
  scene.traverse(o => { if (o.isMesh && o.material) o.material.needsUpdate = true; });
}

function frame(now){
  requestAnimationFrame(frame);
  let dt = Math.min(.05, (now - last) / 1000);
  last = now;

  if (dt > 0.0005 && S.mode === 'play'){
    fpsAcc += 1 / dt; fpsN++; qTimer += dt;
    if (qTimer > 3){
      const fps = fpsAcc / fpsN;
      if (fps < 34 && qLevel < QUALITY.length - 1){ qLevel++; applyQuality(); }
      fpsAcc = 0; fpsN = 0; qTimer = 0;
    }
  }

  if (S.mode === 'play') update(dt);
  else { drift(dt); }

  renderer.render(scene, camera);
}

/* slow camera orbit behind the title / end screens */
let driftA = 0;
function drift(dt){
  driftA += dt * .035;
  const R = 245;
  camera.position.set(P.x + Math.cos(driftA) * R, 74 + Math.sin(driftA * .7) * 14, P.z + Math.sin(driftA) * R);
  camera.fov = 60; camera.updateProjectionMatrix();
  camera.lookAt(P.x, 40, P.z);
  animateProps(dt, performance.now() / 1000);
  if (toastT > 0){ toastT -= dt; if (toastT <= 0) toastEl.classList.remove('on'); }
}

function animateProps(dt, t){
  for (const r of relays){
    const u = r.mesh.userData;
    const lit = r.held;
    u.lamp.rotation.y += dt * (lit ? 3.4 : .8);
    u.lamp.rotation.x += dt * .5;
    const s = lit ? 1.25 + Math.sin(t * 9) * .12 : 1;
    u.lamp.scale.setScalar(s);
    u.ring.material.color.setHex(lit ? 0x5dffa8 : r.color);
    u.beam.material.opacity = lit ? .13 + Math.sin(t * 7) * .03 : .05;
    u.beam.material.color.setHex(lit ? 0x5dffa8 : r.color);
  }
  const vu = vault.userData;
  vu.spokes.rotation.z += dt * (mission.cracking > 0 ? 5.5 : .25);
  vu.door.position.x = -mission.open * 3.1;
  vu.door.position.z = .5 + mission.open * .4;
  for (let i = 0; i < 3; i++){
    const on = relays[i].held;
    vu.lights[i].material.color.setHex(on ? 0x5dffa8 : 0x551119);
  }
  loot.rotation.y += dt * 1.6;
  loot.position.y = 1.4 + Math.sin(t * 2.2) * .16;
  loot.userData.halo.scale.setScalar(1 + Math.sin(t * 3) * .08);
  vanZone.userData.fill.material.opacity = S.hasLoot ? .26 + Math.sin(t * 5) * .09 : .10;
  vaultZone.userData.fill.material.opacity = mission.open > .5 ? .26 : .10;
}

function update(dt){
  const t = S.t += dt;

  /* ---- camera look ---- */
  const sens = 0.0022;
  player.camYaw   -= mouseDX * sens;
  player.camPitch += (invertY ? -mouseDY : mouseDY) * sens;
  player.camPitch = THREE.MathUtils.clamp(player.camPitch, -.42, .78);
  mouseDX = mouseDY = 0;

  /* ---- player movement ---- */
  const inCar = !!player.car;
  if (inCar){
    const c = player.car;
    const input = {
      throttle: brakeHeld() ? -1 : axisY(),
      steer: axisX(),
      hand: handHeld(),
    };
    const hit = c.step(dt, input, world);
    if (hit && c.crashImpulse > .18){
      shake = Math.min(.8, c.crashImpulse);
      sound.crash(c.crashImpulse);
      S.stats.crashes++;
      crashFlash = Math.min(.6, .25 + c.crashImpulse * .5);
      c.crashImpulse = 0;
    }
    player.pos.copy(c.pos);
    player.yaw = c.yaw;
    player.speed = c.speed;
  } else {
    const ax = axisX(), ay = axisY();
    const sprint = held('ShiftLeft') || held('ShiftRight') || Math.hypot(touch.x, touch.y) > .92;
    const spd = sprint ? 7.6 : 4.3;
    if (ax || ay){
      // The camera sits at target + (sin c, cos c) * dist, so that vector points
      // BACK at the camera. Screen-forward is its negative; screen-right is
      // perpendicular to it. Build the basis explicitly rather than by angle.
      const c = player.camYaw, sc = Math.sin(c), cc = Math.cos(c);
      const mx = ax * cc - ay * sc;
      const mz = -ax * sc - ay * cc;
      const m = Math.hypot(mx, mz) || 1;
      player.pos.x += mx / m * spd * dt;
      player.pos.z += mz / m * spd * dt;
      const a = Math.atan2(mx, mz);
      player.yaw += angleDelta(player.yaw, a) * Math.min(1, dt * 12);
      player.speed = spd;
    } else player.speed = 0;
    world.resolve(player.pos, .5);
    playerMesh.position.copy(player.pos);
    playerMesh.rotation.y = player.yaw;
    animatePerson(playerMesh, player.speed, dt, groundY(player.pos.x, player.pos.z));
  }

  /* ---- record this frame for the next loop's echo ---- */
  S.recAcc += dt;
  while (S.recAcc >= 1 / REC_HZ){
    S.recAcc -= 1 / REC_HZ;
    S.rec.push({ x: player.pos.x, z: player.pos.z, yaw: player.yaw, v: inCar ? 1 : 0 });
  }

  /* ---- echoes ---- */
  for (const e of liveEchoes) e.step(t, dt);

  /* ---- traffic, pedestrians ---- */
  const threat = player.car && player.speed > 6 ? player.car.pos : null;
  for (const tr of traffic) tr.step(dt, world, player.car ? player.car.pos : null);
  for (const p of peds){
    p.step(dt, world, threat);
    if (p.knocked <= 0 && player.car && player.speed > 5){
      const dx = p.pos.x - player.car.pos.x, dz = p.pos.z - player.car.pos.z;
      if (dx * dx + dz * dz < 5){
        p.knocked = 6;
        sound.crash(.5);
        bumpWanted(1, 'You hit someone');
      }
    }
  }

  /* car-vs-car shoving, so traffic feels solid */
  if (player.car){
    const pc = player.car;
    for (const other of [...traffic.map(x => x.car), ...police.map(x => x.car), ...parked]){
      if (other === pc || !other.mesh.visible) continue;
      const dx = other.pos.x - pc.pos.x, dz = other.pos.z - pc.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 10 && d2 > .0001){
        const d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
        const push = (3.16 - d) * .5;
        other.pos.x += nx * push; other.pos.z += nz * push;
        pc.pos.x -= nx * push; pc.pos.z -= nz * push;
        const rel = pc.vel.x * nx + pc.vel.y * nz;
        if (rel > 5){
          other.vel.x += nx * rel * .8; other.vel.y += nz * rel * .8;
          pc.vel.multiplyScalar(.82);
          if (rel > 11){ sound.crash(Math.min(1, rel / 26)); shake = Math.min(.6, rel / 40); }
        }
      }
    }
  }

  /* ---- relays: any body on foot inside the ring holds it ---- */
  const bodies = bodyPositions();
  let heldCount = 0;
  for (const r of relays){
    let on = false;
    for (const b of bodies){
      if (!b.onFoot) continue;
      const dx = b.pos.x - r.x, dz = b.pos.z - r.z;
      if (dx * dx + dz * dz < RELAY_R * RELAY_R){ on = true; break; }
    }
    if (on && !r.held){
      sound.blip(700 + relays.indexOf(r) * 160, .16, 'sine', .18);
      if (!r.everHeld){
        r.everHeld = true;
        if (!mission.alarm){ mission.alarm = true; bumpWanted(1, 'Relay tripped — silent alarm'); }
      }
    }
    r.held = on;
    if (on) heldCount++;
  }

  /* ---- vault ---- */
  if (heldCount === 3 && mission.open < 1){
    mission.cracking += dt;
    mission.open = Math.min(1, mission.cracking / VAULT_HOLD);
    if (mission.open >= 1){
      loot.visible = true;
      sound.chime();
      bumpWanted(2, 'VAULT OPEN');
      toast('VAULT OPEN', 'Get to the case before the relays drop');
    }
  } else if (heldCount < 3 && mission.open < 1){
    mission.cracking = Math.max(0, mission.cracking - dt * 1.6);
    mission.open = mission.cracking / VAULT_HOLD;
  }

  /* ---- loot pickup ---- */
  if (loot.visible && !S.hasLoot){
    const d = Math.hypot(player.pos.x - vaultPos.x, player.pos.z - vaultPos.z);
    if (d < 4 && !player.car){
      mission.lootTimer += dt;
      if (mission.lootTimer >= LOOT_HOLD){
        S.hasLoot = true;
        loot.visible = false;
        sound.chime();
        bumpWanted(2, 'You have the case');
        toast('THE CASE IS YOURS', 'Now get it to the van');
      }
    } else mission.lootTimer = Math.max(0, mission.lootTimer - dt);
  }

  /* ---- getaway ---- */
  if (S.hasLoot){
    const d = Math.hypot(player.pos.x - vanX, player.pos.z - vanZ);
    if (d < 6.5){ endLoop('win'); return; }
  }

  /* ---- police ---- */
  spawnPolice();
  let nearestCop = 1e9, sirenLevel = 0;
  for (const p of police){
    // cops prefer the player, but will divert onto a closer echo
    let target = player.car ? player.car.pos : player.pos;
    let bd = p.car.pos.distanceTo(target);
    for (const b of bodies){
      if (b.isPlayer) continue;
      const d = p.car.pos.distanceTo(b.pos);
      if (d < bd * .55){ bd = d; target = b.pos; }
    }
    p.step(dt, world, target);

    const dp = p.car.pos.distanceTo(player.car ? player.car.pos : player.pos);
    nearestCop = Math.min(nearestCop, dp);
    sirenLevel = Math.max(sirenLevel, THREE.MathUtils.clamp(1 - dp / 95, 0, 1));

    // arrest an echo that lingers too close to a unit
    for (const b of bodies){
      if (b.isPlayer || !b.echo || b.echo.gone) continue;
      if (p.car.pos.distanceTo(b.pos) < 4.2){
        b.echo.arrested += dt;
        if (b.echo.arrested > 3){
          b.echo.gone = true;
          toast('An echo was taken', 'That relay is going cold');
          sound.fail();
        }
      } else b.echo.arrested = Math.max(0, b.echo.arrested - dt * .6);
    }
  }

  /* ---- arrest meter ---- */
  const closing = nearestCop < BUST_R && S.wanted > 0 && (!player.car || player.speed < 7);
  S.bust = THREE.MathUtils.clamp(S.bust + (closing ? dt : -dt * .8), 0, BUST_TIME);
  crashFlash = Math.max(0, crashFlash - dt * 3.2);
  el('dmg').style.opacity = Math.max(S.bust / BUST_TIME * .6, crashFlash).toFixed(3);
  if (S.bust >= BUST_TIME){ crashFlash = 0; el('dmg').style.opacity = 0; endLoop('busted'); return; }

  /* ---- wanted decay when nobody is near ---- */
  if (S.wanted > 0 && nearestCop > 130){
    S.heatCool = (S.heatCool || 0) + dt;
    if (S.heatCool > 9){ S.heatCool = 0; S.wanted--; }
  } else S.heatCool = 0;

  /* ---- loop clock ---- */
  if (t >= LOOP_LEN){ endLoop('timeout'); return; }

  /* ---- lights, camera ---- */
  updateCamera(dt);
  updateLights();
  animateProps(dt, t);

  /* ---- audio ---- */
  sound.drive(dt, {
    rpm: player.car ? Math.min(1, player.speed / 30) : 0,
    load: player.car ? Math.abs(axisY()) * .6 : 0,
    scrub: player.car ? Math.min(1, Math.abs(player.car.vel.x * Math.cos(player.car.yaw) - player.car.vel.y * Math.sin(player.car.yaw)) / 9) : 0,
    siren: sirenLevel,
    inCar: !!player.car,
  });

  updateHUD(heldCount, nearestCop);
  drawMap();
  drawTimeline();

  if (toastT > 0){ toastT -= dt; if (toastT <= 0) toastEl.classList.remove('on'); }
}

/* ------------------------------------------------------------------ camera */

function updateCamera(dt){
  const inCar = !!player.car;
  const target = inCar ? player.car.pos : player.pos;

  // in a car the camera trails the heading; on foot it follows the mouse freely
  let yaw = player.camYaw;
  if (inCar && player.speed > 4){
    const blend = Math.min(1, dt * (1.4 + player.speed * .05));
    player.camYaw += angleDelta(player.camYaw, player.car.yaw + Math.PI) * blend;
    yaw = player.camYaw;
  }

  const tall = camera.aspect < 1;
  const back = tall ? 1.28 : 1;
  const dist = (inCar ? 10.4 + Math.min(5.5, player.speed * .16) : 6.0) * back;
  const height = (inCar ? 4.3 : 3.0) * (tall ? 1.15 : 1);
  const pitch = player.camPitch;

  tmp.set(
    target.x + Math.sin(yaw) * dist * Math.cos(pitch),
    target.y + height + dist * Math.sin(pitch),
    target.z + Math.cos(yaw) * dist * Math.cos(pitch)
  );

  // pull the camera in along the boom rather than letting it pop through a wall
  const steps = 8;
  for (let i = steps; i >= 1; i--){
    const u = i / steps;
    const px = target.x + (tmp.x - target.x) * u;
    const pz = target.z + (tmp.z - target.z) * u;
    const probe = { x: px, z: pz };
    world.resolve(probe, .55);
    if (Math.abs(probe.x - px) < 1e-4 && Math.abs(probe.z - pz) < 1e-4){
      tmp.set(px, target.y + (tmp.y - target.y) * Math.max(.45, u), pz);
      break;
    }
    if (i === 1) tmp.set(target.x, target.y + height * .8, target.z);
  }

  const k = Math.min(1, dt * (inCar ? 7 : 13));
  camPos.lerp(tmp, k);
  camera.position.copy(camPos);

  if (shake > 0){
    camera.position.x += (Math.random() - .5) * shake;
    camera.position.y += (Math.random() - .5) * shake;
    shake = Math.max(0, shake - dt * 2.2);
  }

  camLook.lerp(tmp.set(target.x, target.y + (inCar ? 2.1 : 1.5), target.z), Math.min(1, dt * 14));
  camera.lookAt(camLook);

  const wantFov = (camera.aspect < 1 ? 78 : 62) + Math.min(24, player.speed * .72);
  camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 3);
  camera.updateProjectionMatrix();
}

function updateLights(){
  const src = player.car ? player.car.pos : player.pos;
  // keep the shadow frustum centred a little ahead of the player
  const ax = src.x + Math.sin(player.yaw) * 12, az = src.z + Math.cos(player.yaw) * 12;
  sun.target.position.set(ax, 0, az);
  sun.position.set(ax + sunDir.x * 220, sunDir.y * 220, az + sunDir.z * 220);
  sun.target.updateMatrixWorld();
}

/* --------------------------------------------------------------------- HUD */

function updateHUD(heldCount, nearestCop){
  el('loopn').textContent = S.loop;
  const left = Math.max(0, LOOP_LEN - S.t);
  const m = Math.floor(left / 60), s = Math.floor(left % 60);
  const tEl = el('timer');
  tEl.textContent = `${m}:${String(s).padStart(2, '0')}`;
  tEl.className = 'val' + (left < 10 ? ' crit' : left < 22 ? ' warn' : '');

  const st = starsWrap.children;
  for (let i = 0; i < 5; i++) st[i].classList.toggle('on', i < S.wanted);
  el('heatnote').textContent = S.wanted === 0 ? 'clear'
    : nearestCop < 40 ? 'on you' : nearestCop < 120 ? 'closing' : 'searching';

  const pips = echobar.children;
  for (let i = 0; i < pips.length; i++) pips[i].classList.toggle('on', i < S.echoes.length);

  el('kph').textContent = Math.round(player.speed * 3.6);

  const state = [
    heldCount === 3 ? 'done' : heldCount > 0 ? 'live' : '',
    mission.open >= 1 ? 'done' : heldCount === 3 ? 'live' : '',
    S.hasLoot ? 'done' : mission.open >= 1 ? 'live' : '',
    S.hasLoot ? 'live' : '',
  ];
  objEls.forEach((d, i) => {
    d.className = 'obj' + (state[i] ? ' ' + state[i] : '');
    d.querySelector('.tx').textContent = OBJ_DEFS[i].text();
  });

  // contextual prompt
  const pr = el('prompt');
  let msg = '';
  if (!player.car){
    const near = nearestCar(4.6);
    if (near) msg = '<b>F</b> to take the car';
    else if (loot.visible && !S.hasLoot &&
             Math.hypot(player.pos.x - vaultPos.x, player.pos.z - vaultPos.z) < 4)
      msg = `Taking the case… ${Math.round(mission.lootTimer / LOOT_HOLD * 100)}%`;
  } else {
    msg = '<b>F</b> to get out';
  }
  if (TOUCH){
    const cb = document.getElementById('tb-car');
    cb.innerHTML = player.car ? 'GET<br>OUT' : 'GET<br>IN';
  }
  if (heldCount === 3 && mission.open < 1) msg = `Cracking the vault… ${Math.round(mission.open * 100)}%`;
  pr.innerHTML = msg;
  pr.classList.toggle('on', !!msg);
}

/* ----------------------------------------------------------------- minimap */

const mapC = el('map'), mg = mapC.getContext('2d');
function drawMap(){
  const W = mapC.width, sc = W / CFG.WORLD;
  const M = v => (v + CFG.HALF) * sc;

  mg.fillStyle = '#dfe5ea'; mg.fillRect(0, 0, W, W);
  mg.strokeStyle = '#ffffff'; mg.lineWidth = CFG.ROAD * sc;
  for (let i = 0; i <= CFG.N; i++){
    const a = M(roadCenter(i));
    mg.beginPath(); mg.moveTo(a, 0); mg.lineTo(a, W); mg.stroke();
    mg.beginPath(); mg.moveTo(0, a); mg.lineTo(W, a); mg.stroke();
  }

  const dot = (x, z, r, col) => {
    mg.fillStyle = col;
    mg.beginPath(); mg.arc(M(x), M(z), r, 0, 7); mg.fill();
  };

  // objectives
  for (const r of relays) dot(r.x, r.z, 4, r.held ? '#5dffa8' : '#' + r.color.toString(16).padStart(6, '0'));
  dot(vaultPos.x, vaultPos.z, 4.5, mission.open >= 1 ? '#e09a12' : '#9b8757');
  dot(vanX, vanZ, 5, S.hasLoot ? '#12b57c' : '#5d8f77');

  for (const e of liveEchoes) if (!e.gone) dot(e.pos.x, e.pos.z, 3, 'rgba(10,150,196,.95)');
  for (const p of police) dot(p.car.pos.x, p.car.pos.z, 3, '#d32438');

  // player arrow
  const px = M(player.pos.x), pz = M(player.pos.z), a = player.yaw;
  mg.fillStyle = '#12161d';
  mg.beginPath();
  mg.moveTo(px + Math.sin(a) * 6, pz + Math.cos(a) * 6);
  mg.lineTo(px + Math.sin(a + 2.5) * 4.5, pz + Math.cos(a + 2.5) * 4.5);
  mg.lineTo(px + Math.sin(a - 2.5) * 4.5, pz + Math.cos(a - 2.5) * 4.5);
  mg.closePath(); mg.fill();
}

/* -------------------------------------------------------------------- boot */

resetLoop();
S.mode = 'title';
el('loading').classList.add('off');
requestAnimationFrame(frame);

/* Dev hook — only when you ask for it with #debug in the URL. */
if (location.hash === '#debug'){
  window.__echo = { S, player, relays, mission, vaultPos, vanX, vanZ, resetLoop, Echo,
                    get liveEchoes(){ return liveEchoes }, LOOP_LEN, REC_HZ };
}
