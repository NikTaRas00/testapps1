/* ECHO CITY — world.js
   Daylit city: sky + image-based lighting, concrete/glass facades, street
   furniture, trees, and a uniform-grid collision broadphase. */

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

/* the sun's compass direction, shared by the light and the sky's sun disc */
export const SUN = { az: 2.32, el: 0.62 };
export const sunDir = new THREE.Vector3(
  Math.cos(SUN.el) * Math.sin(SUN.az),
  Math.sin(SUN.el),
  Math.cos(SUN.el) * Math.cos(SUN.az)
);

export function mulberry(seed){
  return function(){
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

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

/* Equirectangular daytime sky: gradient, sun, and banded cumulus.
   Doubles as the environment map, so glass and paint reflect the real sky. */
function skyTexture(){
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0.00, '#2f6fc4');
  grd.addColorStop(0.30, '#5c9bdd');
  grd.addColorStop(0.48, '#9dc6ec');
  grd.addColorStop(0.52, '#cfe0ee');   // horizon haze
  grd.addColorStop(0.62, '#b9c8d4');
  grd.addColorStop(1.00, '#8d9aa6');   // ground bounce
  g.fillStyle = grd; g.fillRect(0, 0, W, H);

  // sun, positioned to match the directional light
  const su = ((SUN.az / (Math.PI * 2)) + 0.75) % 1 * W;
  const sv = (0.5 - SUN.el / Math.PI) * H;
  const halo = g.createRadialGradient(su, sv, 0, su, sv, 190);
  halo.addColorStop(0, 'rgba(255,250,232,1)');
  halo.addColorStop(0.06, 'rgba(255,246,214,.92)');
  halo.addColorStop(0.30, 'rgba(255,238,198,.28)');
  halo.addColorStop(1, 'rgba(255,238,198,0)');
  g.fillStyle = halo; g.fillRect(su - 200, sv - 200, 400, 400);

  // cumulus: clusters of soft blobs, denser toward the horizon
  const rnd = mulberry(4242);
  g.globalCompositeOperation = 'source-over';
  for (let n = 0; n < 110; n++){
    const cx = rnd() * W;
    const cy = H * (0.06 + Math.pow(rnd(), 1.7) * 0.40);
    const scale = 0.5 + rnd() * 1.5;
    const puffs = 5 + (rnd() * 7 | 0);
    for (let q = 0; q < puffs; q++){
      const px = cx + (rnd() - .5) * 130 * scale;
      const py = cy + (rnd() - .5) * 26 * scale;
      const r = (16 + rnd() * 30) * scale;
      const cl = g.createRadialGradient(px, py, 0, px, py, r);
      const a = 0.30 + rnd() * 0.42;
      cl.addColorStop(0, `rgba(255,255,255,${a})`);
      cl.addColorStop(0.55, `rgba(246,249,253,${a * .5})`);
      cl.addColorStop(1, 'rgba(240,246,252,0)');
      g.fillStyle = cl;
      g.beginPath(); g.arc(px, py, r, 0, 7); g.fill();
    }
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}

/* Building facade: concrete piers with recessed glazing. Tiles at 1 unit = 4.6m. */
function facadeTexture(kind){
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const rnd = mulberry(kind * 977 + 13);

  const concrete = ['#c9c4bb', '#d6d2c9', '#b9b4ab', '#cfc7ba', '#c2bfc0'][kind % 5];
  g.fillStyle = concrete; g.fillRect(0, 0, S, S);

  // subtle blotching so flat walls aren't dead flat
  for (let n = 0; n < 900; n++){
    const x = rnd() * S, y = rnd() * S, r = 8 + rnd() * 46;
    g.fillStyle = rnd() > .5 ? 'rgba(255,255,255,.045)' : 'rgba(90,86,80,.05)';
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }

  const cols = 4, rows = 4, cw = S / cols, ch = S / rows;
  for (let y = 0; y < rows; y++){
    for (let x = 0; x < cols; x++){
      const px = x * cw, py = y * ch;
      const mx = cw * .13, my = ch * .18;
      const w = cw - mx * 2, h = ch - my * 2;

      // reveal / shadow line around the opening
      g.fillStyle = 'rgba(60,58,54,.30)';
      g.fillRect(px + mx - 3, py + my - 3, w + 6, h + 6);

      // glazing, tinted and lightly varied pane to pane
      const tint = 0.5 + rnd() * 0.5;
      const gl = g.createLinearGradient(px + mx, py + my, px + mx + w, py + my + h);
      gl.addColorStop(0, `rgba(${(120 * tint) | 0},${(150 * tint) | 0},${(172 * tint) | 0},1)`);
      gl.addColorStop(0.45, `rgba(${(158 * tint) | 0},${(186 * tint) | 0},${(206 * tint) | 0},1)`);
      gl.addColorStop(0.5, 'rgba(226,238,247,.95)');   // sky glint
      gl.addColorStop(1, `rgba(${(96 * tint) | 0},${(122 * tint) | 0},${(146 * tint) | 0},1)`);
      g.fillStyle = gl;
      g.fillRect(px + mx, py + my, w, h);

      // mullion
      g.strokeStyle = 'rgba(70,72,74,.55)';
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(px + mx + w / 2, py + my); g.lineTo(px + mx + w / 2, py + my + h);
      g.stroke();

      // spandrel below the glass
      g.fillStyle = 'rgba(150,146,138,.5)';
      g.fillRect(px + mx, py + my + h, w, my * .8);
    }
  }
  // floor slab band
  g.fillStyle = 'rgba(255,255,255,.12)';
  for (let y = 0; y < rows; y++) g.fillRect(0, y * ch, S, 3);

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* Top-down street network: asphalt, kerbs, markings, crossings. */
function streetTexture(){
  const S = 2048, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const k = S / CFG.WORLD;
  const M = v => (v + CFG.HALF) * k;
  const rnd = mulberry(77);

  g.fillStyle = '#8d9384'; g.fillRect(0, 0, S, S);        // grass / lots

  // pavement
  g.fillStyle = '#c6c3bc';
  for (let i = 0; i <= CFG.N; i++){
    const a = M(roadStart(i) - CFG.SIDEWALK), w = (CFG.ROAD + CFG.SIDEWALK * 2) * k;
    g.fillRect(a, 0, w, S); g.fillRect(0, a, S, w);
  }
  // paving slab joints
  g.strokeStyle = 'rgba(120,118,112,.35)'; g.lineWidth = 1;
  for (let p = 0; p < S; p += Math.round(1.6 * k)){
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(S, p); g.stroke();
  }

  // asphalt
  g.fillStyle = '#57585a';
  for (let i = 0; i <= CFG.N; i++){
    const a = M(roadStart(i)), w = CFG.ROAD * k;
    g.fillRect(a, 0, w, S); g.fillRect(0, a, S, w);
  }
  // aggregate speckle + tyre polish down the lanes
  g.globalAlpha = .06;
  for (let n = 0; n < 9000; n++){
    g.fillStyle = rnd() > .5 ? '#9a9a99' : '#2e2f31';
    g.fillRect(rnd() * S, rnd() * S, 2, 2);
  }
  g.globalAlpha = .05; g.fillStyle = '#2b2c2e';
  for (let i = 0; i <= CFG.N; i++){
    for (const off of [-CFG.ROAD * .26, CFG.ROAD * .26]){
      const a = M(roadCenter(i) + off), w = 2.2 * k;
      g.fillRect(a - w / 2, 0, w, S); g.fillRect(0, a - w / 2, S, w);
    }
  }
  g.globalAlpha = 1;

  // centre line, dashed white
  g.strokeStyle = '#eceae2'; g.globalAlpha = .85;
  g.lineWidth = Math.max(1.6, .36 * k);
  g.setLineDash([5.5 * k, 6.5 * k]);
  for (let i = 0; i <= CFG.N; i++){
    const a = M(roadCenter(i));
    g.beginPath(); g.moveTo(a, 0); g.lineTo(a, S); g.stroke();
    g.beginPath(); g.moveTo(0, a); g.lineTo(S, a); g.stroke();
  }
  g.setLineDash([]);

  // kerb edge line
  g.globalAlpha = .5; g.lineWidth = Math.max(1.2, .22 * k);
  for (let i = 0; i <= CFG.N; i++){
    for (const e of [roadStart(i) + .8, roadStart(i) + CFG.ROAD - .8]){
      const a = M(e);
      g.beginPath(); g.moveTo(a, 0); g.lineTo(a, S); g.stroke();
      g.beginPath(); g.moveTo(0, a); g.lineTo(S, a); g.stroke();
    }
  }
  g.globalAlpha = 1;

  // zebra crossings + stop bars
  g.fillStyle = '#f1efe8'; g.globalAlpha = .9;
  const bar = 1.05 * k, gap = 1.05 * k, len = 3.2 * k;
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

  // kerb shadow so the pavement reads as raised
  g.strokeStyle = 'rgba(60,58,54,.45)'; g.lineWidth = Math.max(1.5, .3 * k);
  for (let i = 0; i <= CFG.N; i++){
    for (const e of [roadStart(i), roadStart(i) + CFG.ROAD]){
      const a = M(e);
      g.beginPath(); g.moveTo(a, 0); g.lineTo(a, S); g.stroke();
      g.beginPath(); g.moveTo(0, a); g.lineTo(S, a); g.stroke();
    }
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}

/* ------------------------------------------------- geometry merge helpers */

function boxWithWorldUV(w, h, d, unit){
  const geo = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const uv = geo.attributes.uv;
  const size = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
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
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
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

export function buildCity(scene, renderer){
  const rnd = mulberry(20260823);
  const colliders = [];
  const shellsByType = [[], [], [], []];   // one bucket per facade material
  const glassTowers = [];
  const roofs = [], roofKit = [];
  const trunks = [], leaves = [];

  const PLAZA = { i: 4, j: 4 };
  const addCollider = (x, z, hx, hz) => colliders.push({ x, z, hx, hz });

  /* --- sky + image-based lighting --------------------------------------- */
  const sky = skyTexture();
  scene.background = sky;
  if (renderer){
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    scene.environment = pmrem.fromEquirectangular(sky).texture;
    pmrem.dispose();
  }

  /* --- buildings -------------------------------------------------------- */
  for (let i = 0; i < CFG.N; i++){
    for (let j = 0; j < CFG.N; j++){
      if (i === PLAZA.i && j === PLAZA.j) continue;

      const x0 = blockMin(i) + 1.6, x1 = blockMax(i) - 1.6;
      const z0 = blockMin(j) + 1.6, z1 = blockMax(j) - 1.6;

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

      const dc = Math.hypot(i - PLAZA.i, j - PLAZA.j) / (CFG.N * .62);

      for (const [ax, az, bx, bz] of lots){
        const w = bx - ax, d = bz - az;
        if (w < 8 || d < 8) continue;
        if (rnd() < .07){ addCollider((ax + bx) / 2, (az + bz) / 2, 0.01, 0.01); continue; }

        const tall = Math.max(0, 1 - dc) ** 1.5;
        let h = 11 + rnd() * 16 + tall * (46 + rnd() * 70);
        h = Math.round(h / 3.4) * 3.4;

        const cx = (ax + bx) / 2, cz = (az + bz) / 2;
        const glassy = h > 62 && rnd() > .5;

        const g = boxWithWorldUV(w, h, d, 4.6);
        g.translate(cx, h / 2, cz);
        (glassy ? glassTowers : shellsByType[(rnd() * 4) | 0]).push(g);
        addCollider(cx, cz, w / 2, d / 2);

        if (h > 56 && rnd() > .45){
          const w2 = w * .62, d2 = d * .62, h2 = h * (.16 + rnd() * .2);
          const g2 = boxWithWorldUV(w2, h2, d2, 4.6);
          g2.translate(cx, h + h2 / 2, cz);
          (glassy ? glassTowers : shellsByType[(rnd() * 4) | 0]).push(g2);
        }

        // parapet
        const cap = new THREE.BoxGeometry(w + .6, 1.1, d + .6).toNonIndexed();
        cap.translate(cx, h + .55, cz);
        roofs.push(cap);

        // rooftop plant: a couple of boxes so skylines aren't razor flat
        const units = 1 + (rnd() * 3 | 0);
        for (let u = 0; u < units; u++){
          const uw = 2 + rnd() * 5, ud = 2 + rnd() * 5, uh = 1.4 + rnd() * 3.4;
          const box = new THREE.BoxGeometry(uw, uh, ud).toNonIndexed();
          box.translate(cx + (rnd() - .5) * (w - uw - 2), h + 1.1 + uh / 2, cz + (rnd() - .5) * (d - ud - 2));
          roofKit.push(box);
        }
      }
    }
  }

  const facadeMats = [0, 1, 2, 3].map(k => new THREE.MeshStandardMaterial({
    map: facadeTexture(k), roughness: .74, metalness: .06, envMapIntensity: .55,
  }));
  shellsByType.forEach((list, k) => {
    if (!list.length) return;
    const m = new THREE.Mesh(mergeAll(list), facadeMats[k]);
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    scene.add(m);
  });

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x8fa9bd, roughness: .09, metalness: .92, envMapIntensity: 1.35,
  });
  if (glassTowers.length){
    const gm = new THREE.Mesh(mergeAll(glassTowers), glassMat);
    gm.castShadow = true; gm.receiveShadow = true; gm.frustumCulled = false;
    scene.add(gm);
  }

  const concreteMat = new THREE.MeshStandardMaterial({ color: 0xb8b4ab, roughness: .9, metalness: .04 });
  for (const [list, mat] of [[roofs, concreteMat], [roofKit, new THREE.MeshStandardMaterial({
      color: 0x9fa3a6, roughness: .6, metalness: .5, envMapIntensity: .7 })]]){
    if (!list.length) continue;
    const m = new THREE.Mesh(mergeAll(list), mat);
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    scene.add(m);
  }

  /* --- ground ----------------------------------------------------------- */
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CFG.WORLD, CFG.WORLD),
    new THREE.MeshStandardMaterial({ map: streetTexture(), roughness: .88, metalness: .02,
                                     envMapIntensity: .35 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  /* --- street furniture: lamps + trees ---------------------------------- */
  const poleGeos = [], headGeos = [];
  for (let i = 0; i <= CFG.N; i++){
    for (let j = 0; j <= CFG.N; j++){
      const cx = roadCenter(i), cz = roadCenter(j);
      const off = CFG.ROAD / 2 + 1.4;
      for (const [px, pz] of [[cx - off, cz - off], [cx + off, cz - off],
                              [cx - off, cz + off], [cx + off, cz + off]]){
        if (Math.abs(px) > CFG.HALF - 2 || Math.abs(pz) > CFG.HALF - 2) continue;
        const pole = new THREE.CylinderGeometry(.14, .19, 7.6, 8).toNonIndexed();
        pole.translate(px, 3.8, pz);
        poleGeos.push(pole);
        const arm = new THREE.BoxGeometry(1.5, .22, .5).toNonIndexed();
        arm.translate(px + (px < cx ? .65 : -.65), 7.5, pz);
        headGeos.push(arm);
      }
    }
  }
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x5d6367, roughness: .45, metalness: .8,
                                                    envMapIntensity: 1 });
  for (const list of [poleGeos, headGeos]){
    const m = new THREE.Mesh(mergeAll(list), metalMat);
    m.castShadow = true; m.frustumCulled = false;
    scene.add(m);
  }

  // street trees down every block edge
  const tr = mulberry(5150);
  for (let i = 0; i <= CFG.N; i++){
    for (const side of [-1, 1]){
      const lane = roadCenter(i) + side * (CFG.ROAD / 2 + 2.2);
      for (let t = -CFG.HALF + 12; t < CFG.HALF - 12; t += 15 + tr() * 9){
        for (const [px, pz] of [[lane, t], [t, lane]]){
          if (Math.abs(px) > CFG.HALF - 6 || Math.abs(pz) > CFG.HALF - 6) continue;
          if (tr() < .35) continue;
          // Street trees are pruned high in real cities, and it keeps the
          // canopy clear of the chase camera at ~3m.
          const th = 5.0 + tr() * 1.8;
          const trunk = new THREE.CylinderGeometry(.16, .26, th, 6).toNonIndexed();
          trunk.translate(px, th / 2, pz);
          trunks.push(trunk);
          const blobs = 2 + (tr() * 2 | 0);
          for (let b = 0; b < blobs; b++){
            const r = 1.6 + tr() * 1.0;
            const leaf = new THREE.IcosahedronGeometry(r, 0).toNonIndexed();
            leaf.translate(px + (tr() - .5) * 1.6, th + 1.0 + tr() * 1.3, pz + (tr() - .5) * 1.6);
            leaves.push(leaf);
          }
        }
      }
    }
  }
  if (trunks.length){
    const m = new THREE.Mesh(mergeAll(trunks),
      new THREE.MeshStandardMaterial({ color: 0x6b5741, roughness: .95 }));
    m.castShadow = true; m.frustumCulled = false; scene.add(m);
    const l = new THREE.Mesh(mergeAll(leaves),
      new THREE.MeshStandardMaterial({ color: 0x5f8b47, roughness: .92, flatShading: true }));
    l.castShadow = true; l.receiveShadow = true; l.frustumCulled = false; scene.add(l);
  }

  /* --- the plaza block: Nakamura Tower + vault -------------------------- */
  const px = blockMid(PLAZA.i), pz = blockMid(PLAZA.j);
  const towerH = 132, tw = 26;
  const tg = boxWithWorldUV(tw, towerH, tw, 4.6);
  tg.translate(px, towerH / 2, pz);
  const tower = new THREE.Mesh(tg, glassMat);
  tower.castShadow = true; tower.receiveShadow = true;
  scene.add(tower);
  addCollider(px, pz, tw / 2, tw / 2);

  const crown = new THREE.Mesh(
    new THREE.BoxGeometry(tw + 1.6, 2.2, tw + 1.6),
    new THREE.MeshStandardMaterial({ color: 0xd8d4cb, roughness: .6, metalness: .3 })
  );
  crown.position.set(px, towerH + 1.1, pz);
  crown.castShadow = true;
  scene.add(crown);

  const deck = new THREE.Mesh(
    new THREE.PlaneGeometry(CFG.BLOCK - 4, CFG.BLOCK - 4),
    new THREE.MeshStandardMaterial({ color: 0xbfbcb4, roughness: .8, metalness: .03 })
  );
  deck.rotation.x = -Math.PI / 2; deck.position.set(px, .06, pz);
  deck.receiveShadow = true;
  scene.add(deck);

  const vaultZ = pz + tw / 2 + 4.5;
  const house = new THREE.Mesh(
    new THREE.BoxGeometry(13, 8, 9),
    new THREE.MeshStandardMaterial({ color: 0xa8a49b, roughness: .72, metalness: .1 })
  );
  house.position.set(px, 4, vaultZ);
  house.castShadow = true; house.receiveShadow = true;
  scene.add(house);
  addCollider(px, vaultZ, 6.5, 4.5);

  /* --- collision broadphase -------------------------------------------- */
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
    materials: { facadeMats, glassMat },
    sky,
  };
}
