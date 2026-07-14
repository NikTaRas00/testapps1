/* =====================================================================
   CONDUIT — src/fx.js
   All the juice: 3D particle bursts (THREE.Points), DOM float texts
   anchored to the spark, screen shake with decay, white/red flashes,
   the film-grain overlay, and the death-screen count-up.
   ===================================================================== */
'use strict';

window.FX = (function(){

  const REDU = window.matchMedia &&
               matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SH = REDU ? 0.3 : 1;

  // -------------------------------------------------- screen shake
  let shakeAmt = 0;

  function shake(a){
    shakeAmt = Math.min(14, shakeAmt + a * SH);
  }
  function shakeOffset(dt){
    shakeAmt *= Math.pow(0.0006, dt);
    if (shakeAmt < 0.01) shakeAmt = 0;
    const k = shakeAmt * 0.02;
    return {
      x: (Math.random()*2 - 1) * k,
      y: (Math.random()*2 - 1) * k,
    };
  }

  // -------------------------------------------------- 3D bursts
  // A pool of Points clouds. Each burst grabs a free cloud, scatters
  // its vertices with velocities, fades it out, returns to the pool.
  const POOL = 8, PER = 26;
  const clouds = [];

  function initBursts(scene){
    for (let c = 0; c < POOL; c++){
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(PER * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        color: 0xffffff, size: 0.14, transparent: true,
        opacity: 0, depthWrite: false, sizeAttenuation: true,
      });
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      pts.visible = false;
      scene.add(pts);
      clouds.push({
        pts, geo, mat,
        vel: new Float32Array(PER * 3),
        t: 0, tt: 0, live: false,
      });
    }
  }

  function burst3(origin, colorHex, speed, life){
    let c = null;
    for (const cl of clouds){ if (!cl.live){ c = cl; break; } }
    if (!c) c = clouds[0];                     // steal the oldest
    const pos = c.geo.attributes.position.array;
    for (let i = 0; i < PER; i++){
      pos[i*3]   = origin.x;
      pos[i*3+1] = origin.y;
      pos[i*3+2] = origin.z;
      // random direction on a sphere
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random()*2 - 1);
      const s  = speed * (0.3 + Math.random()*0.7);
      c.vel[i*3]   = Math.sin(ph)*Math.cos(th) * s;
      c.vel[i*3+1] = Math.sin(ph)*Math.sin(th) * s;
      c.vel[i*3+2] = Math.cos(ph) * s;
    }
    c.geo.attributes.position.needsUpdate = true;
    c.mat.color.set(colorHex);
    c.mat.opacity = 1;
    c.t = 0; c.tt = life || 0.55;
    c.live = true;
    c.pts.visible = true;
  }

  function updateBursts(dt){
    for (const c of clouds){
      if (!c.live) continue;
      c.t += dt;
      const pos = c.geo.attributes.position.array;
      for (let i = 0; i < PER; i++){
        pos[i*3]   += c.vel[i*3]   * dt;
        pos[i*3+1] += c.vel[i*3+1] * dt;
        pos[i*3+2] += c.vel[i*3+2] * dt;
        c.vel[i*3]   *= Math.exp(-dt*2.2);
        c.vel[i*3+1] *= Math.exp(-dt*2.2);
        c.vel[i*3+2] *= Math.exp(-dt*2.2);
      }
      c.geo.attributes.position.needsUpdate = true;
      c.mat.opacity = Math.max(0, 1 - c.t / c.tt);
      if (c.t >= c.tt){ c.live = false; c.pts.visible = false; }
    }
  }

  // -------------------------------------------------- DOM float texts
  // The spark holds a nearly fixed screen position, so floats anchor
  // to a fixed point instead of doing a full 3D → 2D projection.
  let floatLayer = null;

  function float(txt, cls){
    if (!floatLayer) return;
    const el = document.createElement('div');
    el.className = 'float ' + (cls || '');
    el.textContent = txt;
    floatLayer.appendChild(el);
    // force layout, then animate up + fade via CSS class
    void el.offsetWidth;
    el.classList.add('go');
    setTimeout(function(){ el.remove(); }, 750);
  }

  // -------------------------------------------------- flashes
  let flashEl = null;

  function flash(color, alpha){
    if (!flashEl) return;
    flashEl.style.background = color;
    flashEl.style.opacity = String(alpha * (REDU ? 0.4 : 1));
    // transition on the element fades it back to 0
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){ flashEl.style.opacity = '0'; });
    });
  }

  // -------------------------------------------------- pulse ring (DOM)
  let pulseHost = null;

  function pulse(cls){
    if (!pulseHost) return;
    const el = document.createElement('div');
    el.className = 'pulse ' + (cls || '');
    pulseHost.appendChild(el);
    setTimeout(function(){ el.remove(); }, 500);
  }

  // -------------------------------------------------- film grain
  function grain(canvas){
    const g = canvas.getContext('2d');
    function draw(){
      const w = canvas.width  = window.innerWidth;
      const h = canvas.height = window.innerHeight;
      const tile = document.createElement('canvas');
      tile.width = 128; tile.height = 128;
      const tg = tile.getContext('2d');
      const im = tg.createImageData(128, 128);
      for (let i = 0; i < im.data.length; i += 4){
        const v = (Math.random()*255) | 0;
        im.data[i] = v; im.data[i+1] = v; im.data[i+2] = v;
        im.data[i+3] = 7 + (Math.random()*11) | 0;
      }
      tg.putImageData(im, 0, 0);
      g.fillStyle = g.createPattern(tile, 'repeat');
      g.fillRect(0, 0, w, h);
    }
    draw();
    window.addEventListener('resize', draw);
  }

  // -------------------------------------------------- count-up
  function countUp(el, target){
    if (REDU || target === 0){ el.textContent = target; return; }
    const t0 = performance.now();
    const dur = Math.min(900, 260 + target * 16);
    (function step(){
      const k = Math.min(1, (performance.now() - t0) / dur);
      el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    })();
  }

  // -------------------------------------------------- init
  function init(){
    floatLayer = document.getElementById('floats');
    flashEl    = document.getElementById('flash');
    pulseHost  = document.getElementById('pulses');
    grain(document.getElementById('grain'));
  }

  return {
    REDU, SH,
    init, initBursts,
    shake, shakeOffset,
    burst3, updateBursts,
    float, flash, pulse, countUp,
  };
})();
