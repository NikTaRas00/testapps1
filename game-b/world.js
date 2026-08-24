/* ECHO CITY — world.js
   A 1.3km drivable city.

   Everything the player gets close to is built from tiling detail textures and
   real geometry — kerbs you can see, painted markings that sit on the tarmac,
   storefronts at street level. Nothing is baked into one giant map texture,
   because at city scale that gives you ~3 pixels per metre and it reads as mush.

   Static geometry is merged per material AND per chunk, so both the camera and
   the shadow pass can frustum-cull whole districts. */

import * as THREE from 'three';

export const CFG = {
  N: 14,           // blocks per axis
  CELL: 92,        // block pitch (block + road)
  ROAD: 24,        // kerb to kerb: two lanes each way
  KERB: 0.16,      // pavement height above the tarmac
  SIDEWALK: 5.0,
  get BLOCK(){ return this.CELL - this.ROAD },
  get WORLD(){ return this.N * this.CELL + this.ROAD },
  get HALF(){ return this.WORLD / 2 },
  CHUNKS: 5,       // districts per axis, for culling
};

export const roadStart  = i => -CFG.HALF + i * CFG.CELL;
export const roadCenter = i => roadStart(i) + CFG.ROAD / 2;
export const blockMin   = i => -CFG.HALF + i * CFG.CELL + CFG.ROAD;
export const blockMax   = i => -CFG.HALF + (i + 1) * CFG.CELL;
export const blockMid   = i => (blockMin(i) + blockMax(i)) / 2;

export const SUN = { az: 2.32, el: 0.58 };
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
/* Ground height: the tarmac is at 0, every block is a raised pavement. */
export function groundY(x, z){ return onRoad(x, z) ? 0 : CFG.KERB; }

/* lane centre for a given road index and direction, for traffic to track */
export function laneOffset(dirSign){ return dirSign * CFG.ROAD * 0.25; }

/* ------------------------------------------------------- tiling textures */

function noiseCanvas(S, base, spots){
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  return { c, g };
}


/* ---------------------------------------------- derived surface maps

   A colour map alone makes every surface look like printed paper: aggregate,
   slab joints and window reveals don't catch the sun because the shading has
   no idea they have relief. These derive a tangent-space normal map and a
   roughness map from the albedo's own luminance, treating it as a height
   field. Sampling wraps, so tiling stays seamless.                        */

function lumaField(canvas, S){
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.drawImage(canvas, 0, 0, S, S);
  const d = g.getImageData(0, 0, S, S).data;
  const h = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++){
    h[i] = (d[i * 4] * .299 + d[i * 4 + 1] * .587 + d[i * 4 + 2] * .114) / 255;
  }
  return { c, g, h };
}

function normalMap(canvas, strength = 2.2, S = 512){
  const { c, g, h } = lumaField(canvas, S);
  const out = g.createImageData(S, S);
  const o = out.data;
  // Precomputed wrap tables: the modulo in the inner loop dominated the cost.
  const xm = new Int32Array(S), xp = new Int32Array(S);
  const ym = new Int32Array(S), yp = new Int32Array(S);
  for (let i = 0; i < S; i++){
    xm[i] = i === 0 ? S - 1 : i - 1;  xp[i] = i === S - 1 ? 0 : i + 1;
    ym[i] = (i === 0 ? S - 1 : i - 1) * S;
    yp[i] = (i === S - 1 ? 0 : i + 1) * S;
  }
  for (let y = 0; y < S; y++){
    const rowC = y * S, rowU = ym[y], rowD = yp[y];
    for (let x = 0; x < S; x++){
      const xl = xm[x], xr = xp[x];
      // Sobel over the height field
      const dx = (h[rowU + xr] + 2 * h[rowC + xr] + h[rowD + xr]
                - h[rowU + xl] - 2 * h[rowC + xl] - h[rowD + xl]) * strength;
      const dy = (h[rowD + xl] + 2 * h[rowD + x] + h[rowD + xr]
                - h[rowU + xl] - 2 * h[rowU + x] - h[rowU + xr]) * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (rowC + x) * 4;
      o[i]     = (-dx * inv * .5 + .5) * 255;
      o[i + 1] = (-dy * inv * .5 + .5) * 255;
      o[i + 2] = (inv * .5 + .5) * 255;
      o[i + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);   // normals stay linear: no colorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/* Darker, pitted areas read as rougher; polished/bright areas as smoother. */
function roughnessMap(canvas, lo = .55, hi = 1.0, S = 256){
  const { c, g, h } = lumaField(canvas, S);
  const out = g.createImageData(S, S);
  const o = out.data;
  for (let i = 0; i < S * S; i++){
    const v = Math.round((hi - (hi - lo) * h[i]) * 255);
    o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = v;
    o[i * 4 + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/* Asphalt: one 8m tile at 512px = 64 px/m. Wraps seamlessly. */
function asphaltTexture(){
  const S = 512;
  const { c, g } = noiseCanvas(S, '#5a5c5f');
  const rnd = mulberry(31);

  // aggregate
  for (let n = 0; n < 26000; n++){
    const x = rnd() * S, y = rnd() * S, r = .4 + rnd() * 1.5;
    const v = rnd();
    g.fillStyle = v > .62 ? `rgba(150,150,148,${.10 + rnd() * .22})`
               : v > .3  ? `rgba(36,37,39,${.10 + rnd() * .26})`
                         : `rgba(96,97,99,${.08 + rnd() * .16})`;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  // patches and tonal drift (wrapped so tiles stay seamless)
  for (let n = 0; n < 26; n++){
    const x = rnd() * S, y = rnd() * S, r = 24 + rnd() * 80;
    for (const [ox, oy] of [[0,0],[S,0],[-S,0],[0,S],[0,-S]]){
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      const a = .05 + rnd() * .07;
      gr.addColorStop(0, rnd() > .5 ? `rgba(112,112,110,${a})` : `rgba(42,43,45,${a})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(x + ox, y + oy, r, 0, 7); g.fill();
    }
  }
  // hairline cracks
  g.strokeStyle = 'rgba(30,31,33,.30)';
  for (let n = 0; n < 14; n++){
    g.lineWidth = .5 + rnd();
    g.beginPath();
    let x = rnd() * S, y = rnd() * S;
    g.moveTo(x, y);
    for (let k = 0; k < 7; k++){ x += (rnd() - .5) * 70; y += (rnd() - .5) * 70; g.lineTo(x, y); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}

/* Pavement: 4m tile of slabs at 512px = 128 px/m. */
function pavementTexture(){
  const S = 512;
  const { c, g } = noiseCanvas(S, '#b9b6ae');
  const rnd = mulberry(57);
  const cells = 4, cw = S / cells;                 // 1m slabs

  for (let y = 0; y < cells; y++){
    for (let x = 0; x < cells; x++){
      const sh = .93 + rnd() * .14;
      const base = Math.round(184 * sh);
      g.fillStyle = `rgb(${base},${base - 3},${base - 11})`;
      g.fillRect(x * cw + 1, y * cw + 1, cw - 2, cw - 2);
    }
  }
  // grout
  g.strokeStyle = 'rgba(120,117,110,.55)'; g.lineWidth = 2;
  for (let i = 0; i <= cells; i++){
    g.beginPath(); g.moveTo(i * cw, 0); g.lineTo(i * cw, S); g.stroke();
    g.beginPath(); g.moveTo(0, i * cw); g.lineTo(S, i * cw); g.stroke();
  }
  // grime
  for (let n = 0; n < 9000; n++){
    g.fillStyle = rnd() > .5 ? 'rgba(255,255,255,.06)' : 'rgba(96,92,86,.07)';
    g.fillRect(rnd() * S, rnd() * S, 1.6, 1.6);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}

function grassTexture(){
  const S = 256;
  const { c, g } = noiseCanvas(S, '#6f7f52');
  const rnd = mulberry(91);
  for (let n = 0; n < 20000; n++){
    const x = rnd() * S, y = rnd() * S;
    const v = rnd();
    g.strokeStyle = v > .6 ? `rgba(126,148,86,${.3 + rnd() * .5})`
                  : v > .3 ? `rgba(78,96,54,${.3 + rnd() * .5})`
                           : `rgba(96,112,64,${.3 + rnd() * .4})`;
    g.lineWidth = .8;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - .5) * 3, y - 2 - rnd() * 3); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* Facade: one 1024px tile covering 7.2m x 7.2m => 142 px/m, two storeys wide. */
function facadeTexture(kind){
  const S = 1024, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const rnd = mulberry(kind * 977 + 13);

  const tones = [['#cdc7bc', '#b6b0a4'], ['#d8d4cb', '#c0bcb2'],
                 ['#b3ada2', '#9d978c'], ['#c7c9cc', '#aeb1b5']];
  const [wall, trim] = tones[kind % tones.length];
  g.fillStyle = wall; g.fillRect(0, 0, S, S);

  // fine concrete grain
  for (let n = 0; n < 30000; n++){
    g.fillStyle = rnd() > .5 ? 'rgba(255,255,255,.035)' : 'rgba(80,76,70,.045)';
    g.fillRect(rnd() * S, rnd() * S, 2, 2);
  }
  // broad staining
  for (let n = 0; n < 30; n++){
    const x = rnd() * S, y = rnd() * S, r = 40 + rnd() * 150;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(96,90,82,${.03 + rnd() * .05})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }

  const cols = 4, rows = 2, cw = S / cols, ch = S / rows;   // 1.8m x 3.6m bays
  for (let y = 0; y < rows; y++){
    for (let x = 0; x < cols; x++){
      const bx = x * cw, by = y * ch;
      const mx = cw * .16, my = ch * .17;
      const w = cw - mx * 2, h = ch * .56;

      // pier shading either side of the opening
      const pg = g.createLinearGradient(bx, 0, bx + cw, 0);
      pg.addColorStop(0, 'rgba(255,255,255,.10)');
      pg.addColorStop(.5, 'rgba(0,0,0,0)');
      pg.addColorStop(1, 'rgba(60,56,50,.12)');
      g.fillStyle = pg; g.fillRect(bx, by, cw, ch);

      // deep reveal
      g.fillStyle = 'rgba(48,46,42,.55)';
      g.fillRect(bx + mx - 6, by + my - 6, w + 12, h + 12);
      g.fillStyle = trim;
      g.fillRect(bx + mx - 3, by + my - 3, w + 6, h + 6);

      // glazing with a sky gradient and a sharp glint
      const tint = .55 + rnd() * .45;
      const gl = g.createLinearGradient(bx + mx, by + my, bx + mx + w, by + my + h);
      gl.addColorStop(0,   `rgb(${(96*tint)|0},${(126*tint)|0},${(152*tint)|0})`);
      gl.addColorStop(.42, `rgb(${(140*tint)|0},${(172*tint)|0},${(196*tint)|0})`);
      gl.addColorStop(.47, 'rgb(232,242,250)');
      gl.addColorStop(.53, `rgb(${(120*tint)|0},${(150*tint)|0},${(176*tint)|0})`);
      gl.addColorStop(1,   `rgb(${(74*tint)|0},${(98*tint)|0},${(122*tint)|0})`);
      g.fillStyle = gl;
      g.fillRect(bx + mx, by + my, w, h);

      // frame + mullions + transom
      g.strokeStyle = 'rgba(58,60,62,.75)'; g.lineWidth = 3;
      g.strokeRect(bx + mx, by + my, w, h);
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(bx + mx + w / 2, by + my); g.lineTo(bx + mx + w / 2, by + my + h);
      g.moveTo(bx + mx, by + my + h * .34); g.lineTo(bx + mx + w, by + my + h * .34);
      g.stroke();

      // sill
      g.fillStyle = 'rgba(255,255,255,.22)';
      g.fillRect(bx + mx - 4, by + my + h + 4, w + 8, 5);
    }
    // floor slab band
    g.fillStyle = 'rgba(70,66,60,.20)'; g.fillRect(0, (y + 1) * ch - 7, S, 7);
    g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(0, (y + 1) * ch - 12, S, 5);
  }

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}

/* Ground-floor storefronts. One 1024px tile spans 9m, so three units of ~3m —
   real shopfront width. Buildings sample this at a random U offset, so
   neighbours never line up into a repeating ribbon. */
function storefrontTexture(){
  const S = 1024, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const rnd = mulberry(404);

  // pier / structure behind everything
  g.fillStyle = '#a9a49b'; g.fillRect(0, 0, S, S);
  for (let n = 0; n < 14000; n++){
    g.fillStyle = rnd() > .5 ? 'rgba(255,255,255,.04)' : 'rgba(84,80,74,.05)';
    g.fillRect(rnd() * S, rnd() * S, 2, 2);
  }

  const units = 3, uw = S / units;
  // muted, believable retail colours rather than primaries
  const signs = ['#7d4a3a', '#3c5a72', '#4a6b52', '#7a6a3c', '#5a4a63', '#8a6a52', '#4f5a63'];

  const GLASS_TOP = S * .30, GLASS_BOT = S * .90;

  for (let u = 0; u < units; u++){
    const x = u * uw;
    const kind = rnd();

    // pilasters framing the unit
    g.fillStyle = '#9b968d';
    g.fillRect(x, 0, 14, S);
    g.fillRect(x + uw - 14, 0, 14, S);

    if (kind < .12){
      // occasional blank / service bay, so the street isn't wall-to-wall retail
      g.fillStyle = '#9d9890';
      g.fillRect(x + 14, GLASS_TOP * .6, uw - 28, S - GLASS_TOP * .6);
      g.fillStyle = '#6a635a';
      g.fillRect(x + uw * .3, S * .55, uw * .4, S * .40);   // roller shutter
      for (let r = 0; r < 14; r++){
        g.fillStyle = r % 2 ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.10)';
        g.fillRect(x + uw * .3, S * .55 + r * (S * .40 / 14), uw * .4, S * .40 / 28);
      }
      continue;
    }

    // ---- glazing, with a lit interior receding behind it
    const interior = g.createLinearGradient(0, GLASS_TOP, 0, GLASS_BOT);
    interior.addColorStop(0, '#6f7d86');
    interior.addColorStop(.30, '#b9bcb8');     // back wall catching daylight
    interior.addColorStop(.62, '#8e948f');
    interior.addColorStop(1, '#59616a');
    g.fillStyle = interior;
    g.fillRect(x + 16, GLASS_TOP, uw - 32, GLASS_BOT - GLASS_TOP);

    // hints of stock/fittings inside
    for (let n = 0; n < 5; n++){
      g.fillStyle = `rgba(${60 + rnd() * 90 | 0},${60 + rnd() * 90 | 0},${60 + rnd() * 90 | 0},.35)`;
      const bw = uw * (.08 + rnd() * .16), bh = (GLASS_BOT - GLASS_TOP) * (.1 + rnd() * .3);
      g.fillRect(x + 20 + rnd() * (uw - 40 - bw), GLASS_BOT - bh - 10, bw, bh);
    }
    // sky reflection across the upper glass
    const refl = g.createLinearGradient(x, GLASS_TOP, x + uw, GLASS_TOP + 200);
    refl.addColorStop(0, 'rgba(226,238,248,.55)');
    refl.addColorStop(.45, 'rgba(210,226,240,.12)');
    refl.addColorStop(1, 'rgba(226,238,248,.30)');
    g.fillStyle = refl;
    g.fillRect(x + 16, GLASS_TOP, uw - 32, (GLASS_BOT - GLASS_TOP) * .55);

    // slim frames: two mullions, one transom
    g.strokeStyle = 'rgba(56,58,60,.85)';
    g.lineWidth = 5;
    g.strokeRect(x + 16, GLASS_TOP, uw - 32, GLASS_BOT - GLASS_TOP);
    g.lineWidth = 3.5;
    for (let m = 1; m < 3; m++){
      const mx = x + 16 + (uw - 32) * m / 3;
      g.beginPath(); g.moveTo(mx, GLASS_TOP); g.lineTo(mx, GLASS_BOT); g.stroke();
    }
    g.beginPath();
    g.moveTo(x + 16, GLASS_TOP + 70); g.lineTo(x + uw - 16, GLASS_TOP + 70); g.stroke();

    // entrance door in one bay
    const dx = x + 16 + (uw - 32) * ((rnd() * 3) | 0) / 3;
    g.fillStyle = 'rgba(70,76,82,.5)';
    g.fillRect(dx + 6, GLASS_TOP + 80, (uw - 32) / 3 - 12, GLASS_BOT - GLASS_TOP - 80);
    g.fillStyle = 'rgba(210,215,220,.7)';
    g.fillRect(dx + (uw - 32) / 3 - 26, GLASS_TOP + 300, 5, 60);   // pull handle

    // stall riser below the glass
    g.fillStyle = '#8b857c';
    g.fillRect(x + 14, GLASS_BOT, uw - 28, S - GLASS_BOT);

    // ---- fascia and signage
    const col = signs[(rnd() * signs.length) | 0];
    g.fillStyle = col;
    g.fillRect(x + 14, S * .09, uw - 28, GLASS_TOP - S * .09 - 8);
    g.fillStyle = 'rgba(0,0,0,.18)';
    g.fillRect(x + 14, GLASS_TOP - 14, uw - 28, 6);
    // lettering, sized and placed like a real sign
    g.fillStyle = 'rgba(240,238,232,.92)';
    const lw = (uw - 60) * (.3 + rnd() * .35);
    g.fillRect(x + 30, S * .145, lw, 26);
    g.fillStyle = 'rgba(240,238,232,.5)';
    g.fillRect(x + 30, S * .19, lw * .5, 12);

    // awning on some units
    if (rnd() > .62){
      g.fillStyle = 'rgba(24,24,26,.30)';
      g.fillRect(x + 10, GLASS_TOP, uw - 20, 26);
      for (let sN = 0; sN < 7; sN++){
        g.fillStyle = sN % 2 ? col : 'rgba(226,222,214,.92)';
        g.fillRect(x + 12 + sN * (uw - 24) / 7, GLASS_TOP - 4, (uw - 24) / 7, 30);
      }
    }
  }

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}

function skyTexture(){
  const W = 2048, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0.00, '#2a66bd');
  grd.addColorStop(0.28, '#4f8fd6');
  grd.addColorStop(0.44, '#8fbde6');
  grd.addColorStop(0.50, '#cadcea');
  grd.addColorStop(0.56, '#b3c3cf');
  grd.addColorStop(1.00, '#8b95a0');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);

  const su = ((SUN.az / (Math.PI * 2)) + 0.75) % 1 * W;
  const sv = (0.5 - SUN.el / Math.PI) * H;
  const halo = g.createRadialGradient(su, sv, 0, su, sv, 320);
  halo.addColorStop(0, 'rgba(255,252,240,1)');
  halo.addColorStop(0.05, 'rgba(255,247,220,.9)');
  halo.addColorStop(0.32, 'rgba(255,240,205,.22)');
  halo.addColorStop(1, 'rgba(255,240,205,0)');
  g.fillStyle = halo; g.fillRect(su - 340, sv - 340, 680, 680);

  const rnd = mulberry(4242);
  for (let n = 0; n < 150; n++){
    const cx = rnd() * W;
    const cy = H * (0.05 + Math.pow(rnd(), 1.8) * 0.40);
    const scale = (0.5 + rnd() * 1.6) * (1 + cy / H);
    const puffs = 6 + (rnd() * 9 | 0);
    for (let q = 0; q < puffs; q++){
      const px = cx + (rnd() - .5) * 200 * scale;
      const py = cy + (rnd() - .5) * 34 * scale;
      const r = (18 + rnd() * 44) * scale;
      const cl = g.createRadialGradient(px, py - r * .2, 0, px, py, r);
      const a = 0.26 + rnd() * 0.45;
      cl.addColorStop(0, `rgba(255,255,255,${a})`);
      cl.addColorStop(0.5, `rgba(240,245,251,${a * .55})`);
      cl.addColorStop(1, 'rgba(232,240,249,0)');
      g.fillStyle = cl;
      g.beginPath(); g.arc(px, py, r, 0, 7); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}

/* ------------------------------------------------- geometry helpers */

function boxWithWorldUV(w, h, d, unitU, unitV = unitU, uOff = 0){
  const geo = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const uv = geo.attributes.uv;
  const size = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++){
    const [su, sv] = size[f];
    for (let i = 0; i < 6; i++){
      const idx = f * 6 + i;
      uv.setXY(idx, uv.getX(idx) * su / unitU + uOff, uv.getY(idx) * sv / unitV);
    }
  }
  return geo;
}

/* a flat quad lying on the ground, UV 0..1 */
function groundQuad(cx, cz, w, d, y){
  const g = new THREE.PlaneGeometry(w, d).toNonIndexed();
  g.rotateX(-Math.PI / 2);
  g.translate(cx, y, cz);
  return g;
}

/* a ground quad whose UVs tile at `unit` metres */
function tiledQuad(cx, cz, w, d, y, unit){
  const g = groundQuad(cx, cz, w, d, y);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / unit, uv.getY(i) * d / unit);
  return g;
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
  out.computeBoundingBox();
  return out;
}

/* organic canopy: subdivided icosahedron with vertices pushed around */
function canopyGeo(r, rnd){
  const g = new THREE.IcosahedronGeometry(r, 1);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++){
    v.fromBufferAttribute(p, i);
    const n = .86 + rnd() * .26;
    v.multiplyScalar(n);
    v.y *= .84;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g.toNonIndexed();
}

/* ------------------------------------------------------------ city build */

export function buildCity(scene, renderer){
  const rnd = mulberry(20260823);
  const colliders = [];
  const PLAZA = { i: (CFG.N / 2) | 0, j: (CFG.N / 2) | 0 };
  const addCollider = (x, z, hx, hz) => colliders.push({ x, z, hx, hz });

  const CH = CFG.CHUNKS;
  const chunkOf = (x, z) => {
    const cx = Math.min(CH - 1, Math.max(0, Math.floor((x + CFG.HALF) / CFG.WORLD * CH)));
    const cz = Math.min(CH - 1, Math.max(0, Math.floor((z + CFG.HALF) / CFG.WORLD * CH)));
    return cz * CH + cx;
  };
  const nChunks = CH * CH;
  const bucket = n => Array.from({ length: n }, () => []);

  /* --- sky + IBL -------------------------------------------------------- */
  const sky = skyTexture();
  scene.background = sky;
  if (renderer){
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    scene.environment = pmrem.fromEquirectangular(sky).texture;
    pmrem.dispose();
  }

  /* --- materials -------------------------------------------------------- */
  const FACADES = 4;
  const facadeMats = Array.from({ length: FACADES }, (_, k) => {
    const map = facadeTexture(k);
    return new THREE.MeshStandardMaterial({
      map,
      normalMap: normalMap(map.image, 2.6, 512),
      normalScale: new THREE.Vector2(1.15, 1.15),
      roughnessMap: roughnessMap(map.image, .48, .95, 256),
      roughness: 1, metalness: .06, envMapIntensity: .55,
    });
  });
  const storeTex = storefrontTexture();
  const storeMat = new THREE.MeshStandardMaterial({
    map: storeTex,
    normalMap: normalMap(storeTex.image, 2.2, 512),
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughnessMap: roughnessMap(storeTex.image, .22, .9, 256),
    roughness: 1, metalness: .25, envMapIntensity: 1.0,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x93aec2, roughness: .07, metalness: .95, envMapIntensity: 1.5,
  });
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0xb5b1a8, roughness: .9, metalness: .04 });
  const plantMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: .55, metalness: .55,
                                                    envMapIntensity: .8 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x565c60, roughness: .4, metalness: .85,
                                                    envMapIntensity: 1 });
  const paintMat = new THREE.MeshStandardMaterial({ color: 0xe9e7df, roughness: .82, metalness: 0,
                                                    polygonOffset: true, polygonOffsetFactor: -3,
                                                    polygonOffsetUnits: -3 });
  const paintYellow = paintMat.clone(); paintYellow.color.setHex(0xd8b53f);

  /* --- ground: tarmac everywhere, then raised blocks on top ------------- */
  const asphaltTex = asphaltTexture();
  const tarmac = new THREE.Mesh(
    tiledQuad(0, 0, CFG.WORLD, CFG.WORLD, 0, 8),
    new THREE.MeshStandardMaterial({
      map: asphaltTex,
      normalMap: normalMap(asphaltTex.image, 1.5, 512),
      normalScale: new THREE.Vector2(.85, .85),
      roughnessMap: roughnessMap(asphaltTex.image, .62, 1.0, 256),
      roughness: 1, metalness: .04, envMapIntensity: .32,
    })
  );
  tarmac.receiveShadow = true;
  scene.add(tarmac);

  const pavementTex = pavementTexture();
  const grassTex = grassTexture();
  const pavementMat = new THREE.MeshStandardMaterial({
    map: pavementTex,
    normalMap: normalMap(pavementTex.image, 2.8, 512),
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughnessMap: roughnessMap(pavementTex.image, .55, .98, 256),
    roughness: 1, metalness: .02, envMapIntensity: .32 });
  const kerbMat = new THREE.MeshStandardMaterial({ color: 0x9d9a93, roughness: .8, metalness: .03 });
  const grassMat = new THREE.MeshStandardMaterial({
    map: grassTex,
    normalMap: normalMap(grassTex.image, 1.6, 256),
    normalScale: new THREE.Vector2(.8, .8),
    roughness: .97, metalness: 0 });

  const pavementGeo = bucket(nChunks), kerbGeo = bucket(nChunks), grassGeo = bucket(nChunks);
  const markGeo = bucket(nChunks), markYGeo = bucket(nChunks);

  for (let i = 0; i < CFG.N; i++){
    for (let j = 0; j < CFG.N; j++){
      const x0 = blockMin(i), x1 = blockMax(i), z0 = blockMin(j), z1 = blockMax(j);
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const w = x1 - x0, d = z1 - z0;
      const ch = chunkOf(cx, cz);

      // the raised pavement slab (its side faces are the visible kerb)
      const slab = new THREE.BoxGeometry(w, CFG.KERB, d).toNonIndexed();
      const uv = slab.attributes.uv;
      const sizes = [[d, CFG.KERB], [d, CFG.KERB], [w, d], [w, d], [w, CFG.KERB], [w, CFG.KERB]];
      for (let f = 0; f < 6; f++){
        const [su, sv] = sizes[f];
        for (let q = 0; q < 6; q++){
          const idx = f * 6 + q;
          uv.setXY(idx, uv.getX(idx) * su / 4, uv.getY(idx) * sv / 4);
        }
      }
      slab.translate(cx, CFG.KERB / 2, cz);
      pavementGeo[ch].push(slab);

      // a crisp kerb lip so the edge catches light
      for (const [ex, ez, ew, ed] of [
        [cx, z0 - .06, w + .12, .12], [cx, z1 + .06, w + .12, .12],
        [x0 - .06, cz, .12, d + .12], [x1 + .06, cz, .12, d + .12]]){
        const lip = new THREE.BoxGeometry(ew, CFG.KERB + .04, ed).toNonIndexed();
        lip.translate(ex, (CFG.KERB + .04) / 2, ez);
        kerbGeo[ch].push(lip);
      }

      // planted interior, inset by the pavement width
      const gw = w - CFG.SIDEWALK * 2, gd = d - CFG.SIDEWALK * 2;
      if (gw > 4 && gd > 4 && !(i === PLAZA.i && j === PLAZA.j)){
        grassGeo[ch].push(tiledQuad(cx, cz, gw, gd, CFG.KERB + .012, 6));
      }
    }
  }

  /* --- road markings, as geometry on the tarmac ------------------------- */
  const DASH = 4.0, GAP = 6.0;
  const halfRoad = CFG.ROAD / 2;

  for (let i = 0; i <= CFG.N; i++){
    const rc = roadCenter(i);

    // centre line (double yellow) + lane dashes, along both axes
    for (const axis of [0, 1]){
      for (let t = -CFG.HALF + 4; t < CFG.HALF - 4; t += DASH + GAP){
        // skip the junction boxes
        const near = Math.abs(((t + CFG.HALF) % CFG.CELL) - CFG.ROAD / 2);
        if (near < CFG.ROAD * .8) continue;
        const mk = (off, geoList, mat) => {
          const q = axis === 0
            ? groundQuad(rc + off, t + DASH / 2, .16, DASH, .015)
            : groundQuad(t + DASH / 2, rc + off, DASH, .16, .015);
          geoList[chunkOf(axis === 0 ? rc : t, axis === 0 ? t : rc)].push(q);
        };
        mk(-.22, markYGeo); mk(.22, markYGeo);              // double centre
        mk(-halfRoad * .5, markGeo); mk(halfRoad * .5, markGeo);  // lane dividers
      }
      // solid edge lines
      for (let seg = 0; seg < CFG.N; seg++){
        const a = blockMin(seg), b = blockMax(seg);
        const len = b - a, mid = (a + b) / 2;
        for (const off of [-halfRoad + .5, halfRoad - .5]){
          const q = axis === 0
            ? groundQuad(rc + off, mid, .14, len, .015)
            : groundQuad(mid, rc + off, len, .14, .015);
          markGeo[chunkOf(axis === 0 ? rc : mid, axis === 0 ? mid : rc)].push(q);
        }
      }
    }
  }

  // zebra crossings and stop bars at every junction
  for (let i = 0; i <= CFG.N; i++){
    for (let j = 0; j <= CFG.N; j++){
      const cx = roadCenter(i), cz = roadCenter(j);
      const ch = chunkOf(cx, cz);
      for (const s of [-1, 1]){
        // stop bar
        markGeo[ch].push(groundQuad(cx + s * halfRoad * .5, cz + s * (halfRoad - 5.4), halfRoad - 1.2, .5, .016));
        markGeo[ch].push(groundQuad(cx + s * (halfRoad - 5.4), cz + s * halfRoad * .5, .5, halfRoad - 1.2, .016));
        // zebra stripes
        for (let b = 0; b < 7; b++){
          const o = (b - 3) * 2.2;
          markGeo[ch].push(groundQuad(cx + o, cz + s * (halfRoad - 2.6), 1.1, 4.2, .016));
          markGeo[ch].push(groundQuad(cx + s * (halfRoad - 2.6), cz + o, 4.2, 1.1, .016));
        }
      }
    }
  }

  /* --- buildings -------------------------------------------------------- */
  const shellGeo = Array.from({ length: FACADES }, () => bucket(nChunks));
  const glassGeo = bucket(nChunks), storeGeo = bucket(nChunks);
  const roofGeo  = bucket(nChunks), plantGeo = bucket(nChunks);
  const trunkGeo = bucket(nChunks), leafGeo  = bucket(nChunks);
  const poleGeo  = bucket(nChunks);

  const STORE_H = 5.2;

  for (let i = 0; i < CFG.N; i++){
    for (let j = 0; j < CFG.N; j++){
      if (i === PLAZA.i && j === PLAZA.j) continue;

      const inset = CFG.SIDEWALK + .5;
      const x0 = blockMin(i) + inset, x1 = blockMax(i) - inset;
      const z0 = blockMin(j) + inset, z1 = blockMax(j) - inset;

      const lots = [];
      const r = rnd();
      if (r < .22){
        lots.push([x0, z0, x1, z1]);
      } else if (r < .58){
        const vert = rnd() > .5;
        const t = .38 + rnd() * .24;
        if (vert){ const m = x0 + (x1 - x0) * t; lots.push([x0, z0, m - 1.2, z1], [m + 1.2, z0, x1, z1]); }
        else     { const m = z0 + (z1 - z0) * t; lots.push([x0, z0, x1, m - 1.2], [x0, m + 1.2, x1, z1]); }
      } else {
        const mx = x0 + (x1 - x0) * (.4 + rnd() * .2);
        const mz = z0 + (z1 - z0) * (.4 + rnd() * .2);
        lots.push([x0, z0, mx - 1.2, mz - 1.2], [mx + 1.2, z0, x1, mz - 1.2],
                  [x0, mz + 1.2, mx - 1.2, z1], [mx + 1.2, mz + 1.2, x1, z1]);
      }

      const dc = Math.hypot(i - PLAZA.i, j - PLAZA.j) / (CFG.N * .5);

      for (const [ax, az, bx, bz] of lots){
        const w = bx - ax, d = bz - az;
        if (w < 9 || d < 9) continue;
        const cx = (ax + bx) / 2, cz = (az + bz) / 2;
        const ch = chunkOf(cx, cz);

        if (rnd() < .06){ addCollider(cx, cz, .01, .01); continue; }   // vacant lot

        const tall = Math.max(0, 1 - dc) ** 1.6;
        let h = 13 + rnd() * 18 + tall * (55 + rnd() * 95);
        h = Math.round(h / 3.6) * 3.6;

        const glassy = h > 70 && rnd() > .45;
        const kind = (rnd() * FACADES) | 0;

        // ground floor: storefront band
        const base = boxWithWorldUV(w + .35, STORE_H, d + .35, 9, STORE_H, rnd());
        base.translate(cx, CFG.KERB + STORE_H / 2, cz);
        storeGeo[ch].push(base);

        // tower above, its UVs offset so floors line up
        const upper = h - STORE_H;
        const body = boxWithWorldUV(w, upper, d, 7.2);
        body.translate(cx, CFG.KERB + STORE_H + upper / 2, cz);
        (glassy ? glassGeo[ch] : shellGeo[kind][ch]).push(body);

        addCollider(cx, cz, w / 2 + .18, d / 2 + .18);

        if (h > 62 && rnd() > .4){
          const w2 = w * .64, d2 = d * .64, h2 = h * (.14 + rnd() * .2);
          const g2 = boxWithWorldUV(w2, h2, d2, 7.2);
          g2.translate(cx, CFG.KERB + h + h2 / 2, cz);
          (glassy ? glassGeo[ch] : shellGeo[kind][ch]).push(g2);
        }

        // parapet
        const cap = new THREE.BoxGeometry(w + .7, 1.2, d + .7).toNonIndexed();
        cap.translate(cx, CFG.KERB + h + .6, cz);
        roofGeo[ch].push(cap);

        // rooftop plant
        for (let u = 0, n = 1 + (rnd() * 3 | 0); u < n; u++){
          const uw = 2.4 + rnd() * 5.5, ud = 2.4 + rnd() * 5.5, uh = 1.6 + rnd() * 3.6;
          const bx2 = new THREE.BoxGeometry(uw, uh, ud).toNonIndexed();
          bx2.translate(cx + (rnd() - .5) * Math.max(0, w - uw - 2),
                        CFG.KERB + h + 1.2 + uh / 2,
                        cz + (rnd() - .5) * Math.max(0, d - ud - 2));
          plantGeo[ch].push(bx2);
        }
      }
    }
  }

  /* --- traffic signals --------------------------------------------------
     Every light on one axis shows the same aspect, so the lenses merge into
     six meshes (2 axes x 3 colours) and the whole city's signals animate by
     touching six materials. */
  const lens = { ns: [[], [], []], ew: [[], [], []] };   // [red, amber, green]
  const signalBody = bucket(nChunks);

  function addSignal(x, z, rot, axis){
    const ch = chunkOf(x, z);
    const H = 6.0;
    const pole = new THREE.CylinderGeometry(.10, .15, H, 8).toNonIndexed();
    pole.translate(x, CFG.KERB + H / 2, z);
    signalBody[ch].push(pole);

    // mast arm reaching over the stop line, plus the housing
    const arm = new THREE.BoxGeometry(.12, .12, 2.6).toNonIndexed();
    arm.translate(0, H - .3, 1.3); arm.rotateY(rot); arm.translate(x, CFG.KERB, z);
    signalBody[ch].push(arm);

    const box = new THREE.BoxGeometry(.56, 1.42, .34).toNonIndexed();
    box.translate(0, H - 1.05, 2.5); box.rotateY(rot); box.translate(x, CFG.KERB, z);
    signalBody[ch].push(box);

    const visor = new THREE.BoxGeometry(.5, .06, .42).toNonIndexed();
    visor.translate(0, H - .45, 2.52); visor.rotateY(rot); visor.translate(x, CFG.KERB, z);
    signalBody[ch].push(visor);

    for (let k = 0; k < 3; k++){
      const l = new THREE.SphereGeometry(.19, 12, 10).toNonIndexed();
      l.translate(0, H - .62 - k * .44, 2.70);
      l.rotateY(rot);
      l.translate(x, CFG.KERB, z);
      lens[axis][k].push(l);
    }
  }

  for (let i = 0; i <= CFG.N; i++){
    for (let j = 0; j <= CFG.N; j++){
      const cx = roadCenter(i), cz = roadCenter(j);
      if (Math.abs(cx) > CFG.HALF - 6 || Math.abs(cz) > CFG.HALF - 6) continue;
      const off = halfRoad + 1.7;
      // heads face back down the approach they control
      addSignal(cx + off, cz - off, 0,             'ns');
      addSignal(cx - off, cz + off, Math.PI,       'ns');
      addSignal(cx - off, cz - off, -Math.PI / 2,  'ew');
      addSignal(cx + off, cz + off, Math.PI / 2,   'ew');
    }
  }

  const LENS_BASE = [0xff2b2b, 0xffb020, 0x2ee06a];
  const signals = { ns: [], ew: [] };
  for (const axis of ['ns', 'ew']){
    for (let k = 0; k < 3; k++){
      const mat = new THREE.MeshStandardMaterial({
        color: LENS_BASE[k], emissive: LENS_BASE[k], emissiveIntensity: 0,
        roughness: .3, metalness: .1,
      });
      const m = new THREE.Mesh(mergeAll(lens[axis][k]), mat);
      m.frustumCulled = false;
      scene.add(m);
      signals[axis].push(mat);
    }
  }

  /* --- street furniture ------------------------------------------------- */
  const tr = mulberry(5150);
  for (let i = 0; i <= CFG.N; i++){
    for (const side of [-1, 1]){
      const lane = roadCenter(i) + side * (halfRoad + 3.6);
      for (let t = -CFG.HALF + 16; t < CFG.HALF - 16; t += 23 + tr() * 13){
        for (const [px, pz] of [[lane, t], [t, lane]]){
          if (Math.abs(px) > CFG.HALF - 8 || Math.abs(pz) > CFG.HALF - 8) continue;
          const ch = chunkOf(px, pz);
          const roll = tr();
          if (roll < .34) continue;

          if (roll < .74){
            // tree, pruned high so the canopy clears the chase camera
            const th = 5.2 + tr() * 2.0;
            const trunk = new THREE.CylinderGeometry(.17, .30, th, 7).toNonIndexed();
            trunk.translate(px, CFG.KERB + th / 2, pz);
            trunkGeo[ch].push(trunk);
            for (let b = 0, n = 2 + (tr() * 2 | 0); b < n; b++){
              const r2 = 1.45 + tr() * .85;
              const leaf = canopyGeo(r2, tr);
              leaf.translate(px + (tr() - .5) * 1.5, CFG.KERB + th + .6 + tr() * 1.2, pz + (tr() - .5) * 1.5);
              leafGeo[ch].push(leaf);
            }
          } else {
            // lamp column with an outreach arm
            const H = 8.4;
            const pole = new THREE.CylinderGeometry(.11, .17, H, 8).toNonIndexed();
            pole.translate(px, CFG.KERB + H / 2, pz);
            poleGeo[ch].push(pole);
            const toward = px === lane ? -side : 0, towardZ = pz === lane ? -side : 0;
            const arm = new THREE.BoxGeometry(toward ? 2.4 : .18, .18, towardZ ? 2.4 : .18).toNonIndexed();
            arm.translate(px + toward * 1.2, CFG.KERB + H - .2, pz + towardZ * 1.2);
            poleGeo[ch].push(arm);
            const lamp = new THREE.BoxGeometry(.8, .22, .42).toNonIndexed();
            lamp.translate(px + toward * 2.3, CFG.KERB + H - .35, pz + towardZ * 2.3);
            poleGeo[ch].push(lamp);
          }
        }
      }
    }
  }

  /* --- commit every bucket to chunked, cullable meshes ------------------ */
  const addChunked = (buckets, mat, cast, receive) => {
    for (let c = 0; c < nChunks; c++){
      if (!buckets[c].length) continue;
      const m = new THREE.Mesh(mergeAll(buckets[c]), mat);
      m.castShadow = cast; m.receiveShadow = receive;
      scene.add(m);
    }
  };
  addChunked(pavementGeo, pavementMat, false, true);
  addChunked(kerbGeo, kerbMat, true, true);
  addChunked(grassGeo, grassMat, false, true);
  addChunked(markGeo, paintMat, false, true);
  addChunked(markYGeo, paintYellow, false, true);
  for (let k = 0; k < FACADES; k++) addChunked(shellGeo[k], facadeMats[k], true, true);
  addChunked(glassGeo, glassMat, true, true);
  addChunked(storeGeo, storeMat, true, true);
  addChunked(roofGeo, concreteMat, true, true);
  addChunked(plantGeo, plantMat, true, true);
  addChunked(poleGeo, metalMat, true, false);
  addChunked(signalBody, metalMat, true, false);
  addChunked(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x6d5a44, roughness: .95 }), true, true);
  addChunked(leafGeo, new THREE.MeshStandardMaterial({ color: 0x4e7a3c, roughness: .95,
                                                       metalness: 0, envMapIntensity: .5 }), true, true);

  /* --- plaza: Nakamura Tower + the vault ------------------------------- */
  const px = blockMid(PLAZA.i), pz = blockMid(PLAZA.j);
  const towerH = 176, tw = 32;
  const tg = boxWithWorldUV(tw, towerH, tw, 7.2);
  tg.translate(px, CFG.KERB + towerH / 2, pz);
  const tower = new THREE.Mesh(tg, glassMat);
  tower.castShadow = true; tower.receiveShadow = true;
  scene.add(tower);
  addCollider(px, pz, tw / 2, tw / 2);

  const crown = new THREE.Mesh(new THREE.BoxGeometry(tw + 2, 2.6, tw + 2), concreteMat);
  crown.position.set(px, CFG.KERB + towerH + 1.3, pz);
  crown.castShadow = true;
  scene.add(crown);

  const deck = new THREE.Mesh(
    tiledQuad(px, pz, CFG.BLOCK - CFG.SIDEWALK * 2, CFG.BLOCK - CFG.SIDEWALK * 2, CFG.KERB + .014, 4),
    pavementMat
  );
  deck.receiveShadow = true;
  scene.add(deck);

  const vaultZ = pz + tw / 2 + 5;
  const house = new THREE.Mesh(new THREE.BoxGeometry(15, 9, 10),
    new THREE.MeshStandardMaterial({ color: 0xa9a59c, roughness: .74, metalness: .1 }));
  house.position.set(px, CFG.KERB + 4.5, vaultZ);
  house.castShadow = true; house.receiveShadow = true;
  scene.add(house);
  addCollider(px, vaultZ, 7.5, 5);

  /* --- horizon: the city keeps going past the playable edge -------------
     Without this the world visibly stops at a hard line. These are silhouettes
     only — no shadows, no collision, deep in the haze. */
  const farGeo = [];
  const fr = mulberry(8123);
  for (let ring = 0; ring < 3; ring++){
    const radius = CFG.HALF + 90 + ring * 190;
    const count = 90 + ring * 40;
    for (let k = 0; k < count; k++){
      const a = (k / count) * Math.PI * 2 + fr() * .05;
      const jitter = 1 + (fr() - .5) * .22;
      const x = Math.cos(a) * radius * jitter;
      const z = Math.sin(a) * radius * jitter;
      // keep the ring clear of the playable square
      if (Math.abs(x) < CFG.HALF + 30 && Math.abs(z) < CFG.HALF + 30) continue;
      const w = 22 + fr() * 46, d = 22 + fr() * 46;
      const h = 24 + fr() * (ring === 0 ? 110 : 78);
      const b = new THREE.BoxGeometry(w, h, d).toNonIndexed();
      b.translate(x, h / 2, z);
      farGeo.push(b);
    }
  }
  if (farGeo.length){
    const far = new THREE.Mesh(mergeAll(farGeo), new THREE.MeshStandardMaterial({
      color: 0xa8b4c2, roughness: .95, metalness: .02, envMapIntensity: .4,
    }));
    far.castShadow = false; far.receiveShadow = false;
    far.frustumCulled = false;
    scene.add(far);
  }

  /* --- collision broadphase -------------------------------------------- */
  const GRID = CFG.CELL;
  const buckets2 = new Map();
  const key = (gx, gz) => gx * 1000 + gz;
  for (const c of colliders){
    if (c.hx < .05) continue;
    const gx0 = Math.floor((c.x - c.hx + CFG.HALF) / GRID), gx1 = Math.floor((c.x + c.hx + CFG.HALF) / GRID);
    const gz0 = Math.floor((c.z - c.hz + CFG.HALF) / GRID), gz1 = Math.floor((c.z + c.hz + CFG.HALF) / GRID);
    for (let gx = gx0; gx <= gx1; gx++)
      for (let gz = gz0; gz <= gz1; gz++){
        const k = key(gx, gz);
        if (!buckets2.has(k)) buckets2.set(k, []);
        buckets2.get(k).push(c);
      }
  }
  function near(x, z){
    const gx = Math.floor((x + CFG.HALF) / GRID), gz = Math.floor((z + CFG.HALF) / GRID);
    const out = [];
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++){
        const l = buckets2.get(key(gx + a, gz + b));
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
    signals,
    materials: { facadeMats, glassMat },
    sky,
  };
}
