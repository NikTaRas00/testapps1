/* ECHO CITY — world.js
   Procedural night city: street atlas, merged building shells, props, collision grid. */

import * as THREE from 'three';

export const CFG = {
  N: 9,            // blocks per axis
  CELL: 76,        // block pitch (block + road)
  ROAD: 17,        // road width
  get BLOCK(){ return this.CELL - this.ROAD },
  get WORLD(){ return this.N * this.CELL + this.ROAD },
  get HALF(){ return this.WORLD / 2 },
  SIDEWALK: 3.0,
};

export const roadStart  = i => -CFG.HALF + i * CFG.CELL;
export const roadCenter = i => roadStart(i) + CFG.ROAD / 2;
export const blockMin   = i => -CFG.HALF + i * CFG.CELL + CFG.ROAD;
export const blockMax   = i => -CFG.HALF + (i + 1) * CFG.CELL;
export const blockMid   = i => (blockMin(i) + blockMax(i)) / 2;

/* deterministic RNG so the city is the same every session */
export function mulberry(seed){
  return function(){
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* Nearest road centre-line coordinate to a world coord (for traffic + navigation) */
export function snapToRoad(v){
  const i = Math.round((v + CFG.HALF) / CFG.CELL);
  return roadCenter(Math.max(0, Math.min(CFG.N, i)));
}
export function onRoad(x, z){
  const fx = ((x + CFG.HALF) % CFG.CELL + CFG.CELL) % CFG.CELL;
  const fz = ((z + CFG.HALF) % CFG.CELL + CFG.CELL) % CFG.CELL;
  return fx < CFG.ROAD || fz < CFG.ROAD;
}

/* ---------------------------------------------------------------- textures */

function windowTexture(){
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#05070d'; g.fillRect(0, 0, S, S);

  const cols = 8, rows = 8, cw = S / cols, ch = S / rows;
  const warm = ['#ffd9a0', '#ffc06a', '#fff0cf', '#9fd8ff', '#cfe6ff', '#ffb37a'];
  for (let y = 0; y < rows; y++){
    for (let x = 0; x < cols; x++){
      const lit = Math.random();
      const px = x * cw + cw * .22, py = y * ch + ch * .18;
      const w = cw * .56, h = ch * .5;
      if (lit > .58){
        const col = warm[(Math.random() * warm.length) | 0];
        g.fillStyle = col;
        g.globalAlpha = .5 + Math.random() * .5;
        g.fillRect(px, py, w, h);
        g.globalAlpha = .13;
        g.fillRect(px - 4, py - 4, w + 8, h + 8);   // cheap bloom halo
        g.globalAlpha = 1;
      } else {
        g.fillStyle = '#0d1220';
        g.fillRect(px, py, w, h);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* One big top-down texture for the whole street network. */
function streetTexture(){
  const S = 2048, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const k = S / CFG.WORLD;                 // pixels per metre
  const M = v => (v + CFG.HALF) * k;       // world -> pixel

  g.fillStyle = '#0a0c14'; g.fillRect(0, 0, S, S);   // block interiors / dirt

  // sidewalks (a slightly wider band under each road)
  g.fillStyle = '#191d2a';
  for (let i = 0; i <= CFG.N; i++){
    const a = M(roadStart(i) - CFG.SIDEWALK), w = (CFG.ROAD + CFG.SIDEWALK * 2) * k;
    g.fillRect(a, 0, w, S); g.fillRect(0, a, S, w);
  }
  // asphalt
  g.fillStyle = '#0e1119';
  for (let i = 0; i <= CFG.N; i++){
    const a = M(roadStart(i)), w = CFG.ROAD * k;
    g.fillRect(a, 0, w, S); g.fillRect(0, a, S, w);
  }
  // asphalt speckle
  g.globalAlpha = .05;
  for (let n = 0; n < 5000; n++){
    const x = Math.random() * S, y = Math.random() * S;
    g.fillStyle = Math.random() > .5 ? '#5a6480' : '#000';
    g.fillRect(x, y, 2, 2);
  }
  g.globalAlpha = 1;

  // lane dashes down the middle of every road
  g.strokeStyle = '#c9d2e6'; g.globalAlpha = .34;
  g.lineWidth = Math.max(1.4, .34 * k);
  g.setLineDash([5.5 * k, 6.5 * k]);
  for (let i = 0; i <= CFG.N; i++){
    const a = M(roadCenter(i));
    g.beginPath(); g.moveTo(a, 0); g.lineTo(a, S); g.stroke();
    g.beginPath(); g.moveTo(0, a); g.lineTo(S, a); g.stroke();
  }
  g.setLineDash([]);

  // crosswalks + stop bars at every intersection
  g.globalAlpha = .5; g.fillStyle = '#d5deee';
  const bar = 1.05 * k, gap = 1.05 * k, len = 3.0 * k;
  for (let i = 0; i <= CFG.N; i++){
    for (let j = 0; j <= CFG.N; j++){
      const cx = M(roadCenter(i)), cz = M(roadCenter(j)), half = CFG.ROAD * k / 2;
      for (let s = -1; s <= 1; s += 2){
        for (let b = -3; b <= 3; b++){
          const off = b * (bar + gap);
          g.fillRect(cx + off, cz + s * half - (s > 0 ? 0 : len), bar, len);
          g.fillRect(cx + s * half - (s > 0 ? 0 : len), cz + off, len, bar);
        }
      }
    }
  }
  g.globalAlpha = 1;

  // kerb lines
  g.strokeStyle = '#2b3347'; g.lineWidth = Math.max(1, .3 * k); g.globalAlpha = .8;
  for (let i = 0; i <= CFG.N; i++){
    for (const a of [M(roadStart(i)), M(roadStart(i) + CFG.ROAD)]){
      g.beginPath(); g.moveTo(a, 0); g.lineTo(a, S); g.stroke();
      g.beginPath(); g.moveTo(0, a); g.lineTo(S, a); g.stroke();
    }
  }
  g.globalAlpha = 1;

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function skyTexture(){
  const c = document.createElement('canvas');
  c.width = 8; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0.00, '#03040a');
  grd.addColorStop(0.42, '#070b1c');
  grd.addColorStop(0.68, '#141a38');
  grd.addColorStop(0.85, '#2a2650');
  grd.addColorStop(1.00, '#4a2f52');
  g.fillStyle = grd; g.fillRect(0, 0, 8, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------- geometry merge helpers */

function boxWithWorldUV(w, h, d, unit){
  // Box whose UVs are proportional to real size, so window rows never stretch.
  const geo = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const uv = geo.attributes.uv;
  const size = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // +x -x +y -y +z -z
  for (let f = 0; f < 6; f++){
    const [su, sv] = size[f];
    for (let i = 0; i < 6; i++){
      const idx = f * 6 + i;
      uv.setXY(idx, uv.getX(idx) * su / unit, uv.getY(idx) * sv / unit);
    }
  }
  return geo;
}

function mergeAll(list){
  let count = 0;
  for (const g of list) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  let o = 0;
  for (const g of list){
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    uv.set(g.attributes.uv.array, o * 2);
    o += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

/* ------------------------------------------------------------ city build */

export function buildCity(scene){
  const rnd = mulberry(20260823);
  const colliders = [];          // {x,z,hx,hz} axis-aligned, for everything solid
  const shells = [];             // geometry for the merged building pass
  const roofs = [];
  const neonPieces = [];

  const PLAZA = { i: 4, j: 4 };  // the block that holds Nakamura Tower + the vault

  const addCollider = (x, z, hx, hz) => colliders.push({ x, z, hx, hz });

  /* --- buildings ------------------------------------------------------- */
  for (let i = 0; i < CFG.N; i++){
    for (let j = 0; j < CFG.N; j++){
      if (i === PLAZA.i && j === PLAZA.j) continue;             // plaza handled below

      const x0 = blockMin(i) + 1.6, x1 = blockMax(i) - 1.6;
      const z0 = blockMin(j) + 1.6, z1 = blockMax(j) - 1.6;

      // split the block into 1, 2 or 4 lots
      const lots = [];
      const r = rnd();
      if (r < .26){
        lots.push([x0, z0, x1, z1]);
      } else if (r < .62){
        const vert = rnd() > .5;
        const t = .38 + rnd() * .24;
        if (vert){ const m = x0 + (x1 - x0) * t; lots.push([x0, z0, m - 1.4, z1], [m + 1.4, z0, x1, z1]); }
        else     { const m = z0 + (z1 - z0) * t; lots.push([x0, z0, x1, m - 1.4], [x0, m + 1.4, x1, z1]); }
      } else {
        const mx = x0 + (x1 - x0) * (.4 + rnd() * .2);
        const mz = z0 + (z1 - z0) * (.4 + rnd() * .2);
        lots.push([x0, z0, mx - 1.4, mz - 1.4], [mx + 1.4, z0, x1, mz - 1.4],
                  [x0, mz + 1.4, mx - 1.4, z1], [mx + 1.4, mz + 1.4, x1, z1]);
      }

      // distance from the centre drives the skyline: tall downtown, low outskirts
      const dc = Math.hypot(i - PLAZA.i, j - PLAZA.j) / (CFG.N * .62);

      for (const [ax, az, bx, bz] of lots){
        const w = bx - ax, d = bz - az;
        if (w < 8 || d < 8) continue;
        if (rnd() < .07){                                  // occasional empty lot / car park
          addCollider((ax + bx) / 2, (az + bz) / 2, 0.01, 0.01);
          continue;
        }
        const tall = Math.max(0, 1 - dc) ** 1.5;
        let h = 11 + rnd() * 16 + tall * (46 + rnd() * 70);
        h = Math.round(h / 3.4) * 3.4;                     // snap to floor heights

        const cx = (ax + bx) / 2, cz = (az + bz) / 2;
        const g = boxWithWorldUV(w, h, d, 4.6);
        g.translate(cx, h / 2, cz);
        shells.push(g);
        addCollider(cx, cz, w / 2, d / 2);

        // stepped setback on the tallest towers
        if (h > 56 && rnd() > .45){
          const w2 = w * .62, d2 = d * .62, h2 = h * (.16 + rnd() * .2);
          const g2 = boxWithWorldUV(w2, h2, d2, 4.6);
          g2.translate(cx, h + h2 / 2, cz);
          shells.push(g2);
        }
        // roof cap
        const cap = new THREE.BoxGeometry(w + .5, .9, d + .5).toNonIndexed();
        cap.translate(cx, h + .45, cz);
        roofs.push(cap);

        // rooftop aerial light
        if (h > 40 && rnd() > .55) neonPieces.push({ x: cx, y: h + 3.2, z: cz, kind: 'beacon' });
        // street-level neon strip facing the road
        if (rnd() > .42){
          neonPieces.push({ x: cx, y: 5.5 + rnd() * 8, z: cz, w, d, kind: 'strip',
                            hue: rnd() });
        }
      }
    }
  }

  const winTex = windowTexture();
  const shellMat = new THREE.MeshStandardMaterial({
    color: 0x161a26, roughness: .82, metalness: .12,
    emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 1.15,
  });
  shellMat.map = null;
  const shellMesh = new THREE.Mesh(mergeAll(shells), shellMat);
  shellMesh.castShadow = false; shellMesh.receiveShadow = false;
  shellMesh.frustumCulled = false;
  scene.add(shellMesh);

  const roofMesh = new THREE.Mesh(mergeAll(roofs),
    new THREE.MeshStandardMaterial({ color: 0x0b0e16, roughness: .95 }));
  roofMesh.frustumCulled = false;
  scene.add(roofMesh);

  /* --- ground ---------------------------------------------------------- */
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CFG.WORLD, CFG.WORLD),
    new THREE.MeshStandardMaterial({ map: streetTexture(), roughness: .55, metalness: .28 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = false;
  scene.add(ground);

  // wet-tarmac sheen: a very dark mirror-ish plane just below, gives depth to lights
  const gloss = new THREE.Mesh(
    new THREE.PlaneGeometry(CFG.WORLD, CFG.WORLD),
    new THREE.MeshStandardMaterial({ color: 0x05070f, roughness: .18, metalness: .9,
                                     transparent: true, opacity: .34 })
  );
  gloss.rotation.x = -Math.PI / 2; gloss.position.y = 0.012;
  scene.add(gloss);

  /* --- neon ------------------------------------------------------------ */
  const neonGeos = [];
  const beaconGeos = [];
  for (const p of neonPieces){
    if (p.kind === 'beacon'){
      const g = new THREE.SphereGeometry(.62, 8, 6).toNonIndexed();
      g.translate(p.x, p.y, p.z);
      beaconGeos.push(g);
    } else {
      // a lit strip on each of the two faces that look onto a street
      const horiz = p.w > p.d;
      for (const s of [-1, 1]){
        const g = horiz
          ? new THREE.BoxGeometry(p.w * .74, .8, .35).toNonIndexed()
          : new THREE.BoxGeometry(.35, .8, p.d * .74).toNonIndexed();
        g.translate(p.x + (horiz ? 0 : s * (p.w / 2 + .2)),
                    p.y,
                    p.z + (horiz ? s * (p.d / 2 + .2) : 0));
        neonGeos.push({ g, hue: p.hue });
      }
    }
  }
  // group neon into three colour families for three cheap draw calls
  const fams = [[], [], []];
  for (const n of neonGeos) fams[(n.hue * 3) | 0 % 3].push(n.g);
  const famColor = [0xff3d7a, 0x39e6ff, 0xb56bff];
  fams.forEach((list, k) => {
    if (!list.length) return;
    const m = new THREE.Mesh(mergeAll(list),
      new THREE.MeshBasicMaterial({ color: famColor[k], toneMapped: false }));
    m.frustumCulled = false;
    scene.add(m);
  });
  if (beaconGeos.length){
    const b = new THREE.Mesh(mergeAll(beaconGeos),
      new THREE.MeshBasicMaterial({ color: 0xff4455, toneMapped: false }));
    b.frustumCulled = false;
    scene.add(b);
    b.userData.beacon = true;
  }

  /* --- street lamps ---------------------------------------------------- */
  const poleGeos = [], headGeos = [];
  for (let i = 0; i <= CFG.N; i++){
    for (let j = 0; j <= CFG.N; j++){
      const cx = roadCenter(i), cz = roadCenter(j);
      // four lamps around each intersection, set back onto the pavement
      const off = CFG.ROAD / 2 + 1.4;
      const spots = [[cx - off, cz - off], [cx + off, cz - off], [cx - off, cz + off], [cx + off, cz + off]];
      for (const [px, pz] of spots){
        if (Math.abs(px) > CFG.HALF - 2 || Math.abs(pz) > CFG.HALF - 2) continue;
        const pole = new THREE.CylinderGeometry(.16, .2, 7.2, 6).toNonIndexed();
        pole.translate(px, 3.6, pz);
        poleGeos.push(pole);
        const head = new THREE.BoxGeometry(1.5, .28, .6).toNonIndexed();
        head.translate(px + (px < cx ? .6 : -.6), 7.2, pz);
        headGeos.push(head);
      }
    }
  }
  const poles = new THREE.Mesh(mergeAll(poleGeos),
    new THREE.MeshStandardMaterial({ color: 0x20242f, roughness: .7, metalness: .5 }));
  poles.frustumCulled = false; scene.add(poles);
  const heads = new THREE.Mesh(mergeAll(headGeos),
    new THREE.MeshBasicMaterial({ color: 0xffd9a8, toneMapped: false }));
  heads.frustumCulled = false; scene.add(heads);

  // pooled light discs on the tarmac under each lamp — fakes lamp spill for free
  const spillGeo = [];
  for (let i = 0; i <= CFG.N; i++){
    for (let j = 0; j <= CFG.N; j++){
      const g = new THREE.CircleGeometry(6.5, 12).toNonIndexed();
      g.rotateX(-Math.PI / 2);
      g.translate(roadCenter(i), 0.03, roadCenter(j));
      spillGeo.push(g);
    }
  }
  const spill = new THREE.Mesh(mergeAll(spillGeo), new THREE.MeshBasicMaterial({
    color: 0xffcf9a, transparent: true, opacity: .085, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false,
  }));
  spill.frustumCulled = false; scene.add(spill);

  /* --- the plaza block: Nakamura Tower + vault ------------------------- */
  const plaza = new THREE.Group();
  const px = blockMid(PLAZA.i), pz = blockMid(PLAZA.j);

  const towerH = 132, tw = 26;
  const tg = boxWithWorldUV(tw, towerH, tw, 4.6);
  tg.translate(px, towerH / 2, pz);
  const tower = new THREE.Mesh(tg, shellMat);
  plaza.add(tower);
  addCollider(px, pz, tw / 2, tw / 2);

  // glowing crown
  const crown = new THREE.Mesh(
    new THREE.BoxGeometry(tw + 1.2, 1.6, tw + 1.2),
    new THREE.MeshBasicMaterial({ color: 0xffc861, toneMapped: false })
  );
  crown.position.set(px, towerH + 1, pz);
  plaza.add(crown);

  // plaza deck
  const deck = new THREE.Mesh(
    new THREE.PlaneGeometry(CFG.BLOCK - 4, CFG.BLOCK - 4),
    new THREE.MeshStandardMaterial({ color: 0x171b27, roughness: .45, metalness: .35 })
  );
  deck.rotation.x = -Math.PI / 2; deck.position.set(px, .05, pz);
  plaza.add(deck);

  // vault housing, on the south face of the tower
  const vaultZ = pz + tw / 2 + 4.5;
  const house = new THREE.Mesh(
    new THREE.BoxGeometry(13, 8, 9),
    new THREE.MeshStandardMaterial({ color: 0x11141d, roughness: .6, metalness: .55 })
  );
  house.position.set(px, 4, vaultZ);
  plaza.add(house);
  addCollider(px, vaultZ, 6.5, 4.5);

  scene.add(plaza);

  /* --- sky + stars ----------------------------------------------------- */
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(CFG.WORLD * .95, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, depthWrite: false, fog: false })
  );
  scene.add(sky);

  const starN = 900, sp = new Float32Array(starN * 3);
  for (let i = 0; i < starN; i++){
    const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * .82 + .04);
    const R = CFG.WORLD * .88;
    sp[i * 3]     = Math.sin(ph) * Math.cos(th) * R;
    sp[i * 3 + 1] = Math.cos(ph) * R;
    sp[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * R;
  }
  const stars = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(sp, 3)),
    new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.9, sizeAttenuation: true,
                               transparent: true, opacity: .75, fog: false, depthWrite: false })
  );
  scene.add(stars);

  // moon
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(16, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xdfe4ff, fog: false, toneMapped: false })
  );
  moon.position.set(-CFG.WORLD * .5, CFG.WORLD * .34, -CFG.WORLD * .42);
  scene.add(moon);

  /* --- collision broadphase: bucket colliders into a uniform grid ------- */
  const GRID = CFG.CELL;
  const buckets = new Map();
  const key = (gx, gz) => gx * 1000 + gz;
  for (const c of colliders){
    if (c.hx < .05) continue;
    const gx0 = Math.floor((c.x - c.hx + CFG.HALF) / GRID), gx1 = Math.floor((c.x + c.hx + CFG.HALF) / GRID);
    const gz0 = Math.floor((c.z - c.hz + CFG.HALF) / GRID), gz1 = Math.floor((c.z + c.hz + CFG.HALF) / GRID);
    for (let gx = gx0; gx <= gx1; gx++)
      for (let gz = gz0; gz <= gz1; gz++){
        const k = key(gx, gz);
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(c);
      }
  }
  function near(x, z){
    const gx = Math.floor((x + CFG.HALF) / GRID), gz = Math.floor((z + CFG.HALF) / GRID);
    const out = [];
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++){
        const l = buckets.get(key(gx + a, gz + b));
        if (l) out.push(...l);
      }
    return out;
  }

  /* Push a circle of radius r out of any solid it overlaps.
     Returns the collision normal (or null) so vehicles can bleed off speed. */
  function resolve(p, r){
    let hit = null;
    for (const c of near(p.x, p.z)){
      const dx = p.x - c.x, dz = p.z - c.z;
      const ox = c.hx + r - Math.abs(dx);
      const oz = c.hz + r - Math.abs(dz);
      if (ox > 0 && oz > 0){
        if (ox < oz){ p.x += Math.sign(dx || 1) * ox; hit = { x: Math.sign(dx || 1), z: 0 }; }
        else        { p.z += Math.sign(dz || 1) * oz; hit = { x: 0, z: Math.sign(dz || 1) }; }
      }
    }
    // keep everyone inside the city limits
    const lim = CFG.HALF - r - 1;
    if (p.x < -lim){ p.x = -lim; hit = { x: 1, z: 0 }; }
    if (p.x >  lim){ p.x =  lim; hit = { x: -1, z: 0 }; }
    if (p.z < -lim){ p.z = -lim; hit = { x: 0, z: 1 }; }
    if (p.z >  lim){ p.z =  lim; hit = { x: 0, z: -1 }; }
    return hit;
  }

  return {
    colliders, resolve, near,
    plaza: { x: px, z: pz, vaultZ, towerH },
    materials: { shellMat, winTex },
    sky, stars, moon,
  };
}
