/* =====================================================================
   CONDUIT — src/tunnel.js
   The conduit itself. A smooth pseudo-random 3D path (sum of sines)
   defines where the tube's center is at any track distance. Hairline
   rings, longitudinal rail dots and ambient dust are all recycled as
   the world streams past the camera — nothing is ever allocated
   during play.
   ===================================================================== */
'use strict';

window.Tunnel = (function(){

  const C = window.CFG;

  let rings = [];        // { line, mat }
  let railPts = null;    // THREE.Points for rail dots
  let railGeo = null;
  let dustPts = null;
  let dustGeo = null;
  let dustSeed = [];
  let sectorAmp = 0;     // extra curvature per sector

  // -------------------------------------------------- the path
  // Center of the conduit at absolute track distance d.
  // Curvature ramps in over the first RAMP_DIST units so a new run
  // always opens with a clean straight.
  function center(d, out){
    const K = C.CURVE;
    const ramp = Math.min(1, Math.max(0, d) / K.RAMP_DIST) * (1 + sectorAmp);
    const x = (K.A1 * Math.sin(d * K.K1)        +
               K.A2 * Math.sin(d * K.K2 + 1.7)) * ramp;
    const y = (K.B1 * Math.sin(d * K.K3 + 0.9)  +
               K.B2 * Math.sin(d * K.K4 + 2.6)) * ramp;
    if (out){ out.x = x; out.y = y; return out; }
    return { x: x, y: y };
  }

  function setSector(n){
    sectorAmp = n * C.CURVE.SECTOR_GAIN;
  }

  // -------------------------------------------------- build
  function init(scene){
    // hairline rings — a shared circle geometry, one LineLoop each
    const circle = [];
    for (let i = 0; i <= C.RING_SEGS; i++){
      const a = i / C.RING_SEGS * Math.PI * 2;
      circle.push(new THREE.Vector3(
        Math.cos(a) * C.TUBE_R, Math.sin(a) * C.TUBE_R, 0));
    }
    const ringGeo = new THREE.BufferGeometry().setFromPoints(circle);

    rings = [];
    for (let i = 0; i < C.RING_COUNT; i++){
      const mat = new THREE.LineBasicMaterial({
        color: 0xf5f4f0, transparent: true, opacity: 0.10, fog: true,
      });
      const line = new THREE.LineLoop(ringGeo, mat);
      line.frustumCulled = false;
      scene.add(line);
      rings.push({ line, mat });
    }

    // rail dots — Points streamed like the rings
    const railN = C.RAIL_LINES * C.RAIL_DOTS;
    railGeo = new THREE.BufferGeometry();
    railGeo.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(railN * 3), 3));
    railPts = new THREE.Points(railGeo, new THREE.PointsMaterial({
      color: 0xf5f4f0, size: 0.06, transparent: true,
      opacity: 0.35, depthWrite: false, fog: true,
    }));
    railPts.frustumCulled = false;
    scene.add(railPts);

    // ambient dust inside the tube
    dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(C.DUST_COUNT * 3), 3));
    dustSeed = [];
    for (let i = 0; i < C.DUST_COUNT; i++){
      dustSeed.push({
        a: Math.random() * Math.PI * 2,
        r: Math.random() * (C.TUBE_R - 1.2),
        z: Math.random(),                 // 0..1 along the visible run
        drift: 0.2 + Math.random() * 0.6,
      });
    }
    dustPts = new THREE.Points(dustGeo, new THREE.PointsMaterial({
      color: 0xf5f4f0, size: 0.05, transparent: true,
      opacity: 0.18, depthWrite: false, fog: true,
    }));
    dustPts.frustumCulled = false;
    scene.add(dustPts);
  }

  // -------------------------------------------------- stream
  // s        — current track distance of the spark
  // The visible run spans roughly [s - 8, s + RING_COUNT*SPACING].
  const _c = { x: 0, y: 0 };

  function update(s, dt, tn){
    const span  = C.RING_COUNT * C.RING_SPACING;
    const first = Math.floor((s - 8) / C.RING_SPACING);

    for (let i = 0; i < C.RING_COUNT; i++){
      const idx = first + i;
      const d   = idx * C.RING_SPACING;      // absolute distance of ring
      const f   = d - s;                     // how far ahead of the spark
      center(d, _c);
      const r = rings[i];                    // slot reuse is stable enough
      r.line.position.set(_c.x, _c.y, C.PLAYER_Z - f);
      // fade rings that are about to pass the camera
      r.mat.opacity = f < 2 ? Math.max(0, 0.10 * (f + 8) / 10) : 0.10;
    }

    // rails — dots along fixed angles around the wall
    const pos = railGeo.attributes.position.array;
    let p = 0;
    for (let l = 0; l < C.RAIL_LINES; l++){
      const ang = l / C.RAIL_LINES * Math.PI * 2 + 0.4;
      const ca = Math.cos(ang) * (C.TUBE_R - 0.12);
      const sa = Math.sin(ang) * (C.TUBE_R - 0.12);
      for (let i = 0; i < C.RAIL_DOTS; i++){
        const step = span / C.RAIL_DOTS;
        const d = (Math.floor((s - 6) / step) + i) * step;
        const f = d - s;
        center(d, _c);
        pos[p++] = _c.x + ca;
        pos[p++] = _c.y + sa;
        pos[p++] = C.PLAYER_Z - f;
      }
    }
    railGeo.attributes.position.needsUpdate = true;

    // dust — loops through the visible run, drifts a little
    const dp = dustGeo.attributes.position.array;
    for (let i = 0; i < C.DUST_COUNT; i++){
      const g = dustSeed[i];
      g.z -= dt * 0.02;                       // slow relative drift
      let z = ((g.z + s / span) % 1 + 1) % 1; // wrap along the run
      const d = s - 6 + z * span;
      const f = d - s;
      center(d, _c);
      const wob = Math.sin(tn * g.drift + i) * 0.3;
      dp[i*3]   = _c.x + Math.cos(g.a) * (g.r + wob);
      dp[i*3+1] = _c.y + Math.sin(g.a) * (g.r + wob);
      dp[i*3+2] = C.PLAYER_Z - f;
    }
    dustGeo.attributes.position.needsUpdate = true;
  }

  return { init, update, center, setSector };
})();
