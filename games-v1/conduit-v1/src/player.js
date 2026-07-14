/* =====================================================================
   CONDUIT — src/player.js
   The spark. A white-hot core, a soft accent glow sprite, and the
   signature: a gradient ribbon trail — the only gradient in the
   scene, exactly like VOLT's gate and TANGENT's heat streak.
   ===================================================================== */
'use strict';

window.PlayerMod = (function(){

  const C = window.CFG;

  let phi = -Math.PI / 2;      // angle around the tube (bottom start)
  let phiV = 0;                // angular velocity
  let core = null;             // white sphere
  let glow = null;             // accent sprite
  let trailLine = null;
  let trailGeo = null;
  let nodes = [];              // { d, x, y }  absolute lateral + distance
  let colA = new THREE.Color('#FF4D2E');
  let colB = new THREE.Color('#FF2E92');
  let alive = true;

  // -------------------------------------------------- glow texture
  function glowTexture(){
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0,   'rgba(255,255,255,0.9)');
    rg.addColorStop(0.3, 'rgba(255,255,255,0.35)');
    rg.addColorStop(1,   'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  // -------------------------------------------------- build
  function init(scene){
    core = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
    core.frustumCulled = false;
    scene.add(core);

    glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xff4d2e,
      transparent: true, opacity: 0.85,
      depthWrite: false, fog: false,
    }));
    glow.scale.set(1.4, 1.4, 1);
    scene.add(glow);

    trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(C.TRAIL_N * 3), 3));
    trailGeo.setAttribute('color',
      new THREE.BufferAttribute(new Float32Array(C.TRAIL_N * 3), 3));
    trailLine = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.9, fog: true,
    }));
    trailLine.frustumCulled = false;
    scene.add(trailLine);
  }

  function setAccent(hexA, hexB){
    colA.set(hexA);
    colB.set(hexB);
    glow.material.color.set(hexA);
  }

  function reset(){
    phi = -Math.PI / 2;
    phiV = 0;
    nodes = [];
    alive = true;
    core.visible = true;
    glow.visible = true;
    trailLine.visible = true;
  }

  function explode(){
    alive = false;
    core.visible = false;
    glow.visible = false;
    trailLine.visible = false;
  }

  // -------------------------------------------------- physics
  const _c = { x: 0, y: 0 };

  function update(dt, s, steer){
    if (!alive) return;

    // steering — accelerate toward held direction, damp toward rest
    phiV += steer * C.STEER_ACC * dt;
    phiV *= Math.exp(-dt * C.STEER_DAMP);
    phiV = Math.max(-C.STEER_VMAX, Math.min(C.STEER_VMAX, phiV));
    phi += phiV * dt;

    // world position on the wall at the current center
    Tunnel.center(s, _c);
    const x = _c.x + Math.cos(phi) * C.PLAYER_RING_R;
    const y = _c.y + Math.sin(phi) * C.PLAYER_RING_R;
    core.position.set(x, y, C.PLAYER_Z);
    glow.position.set(x, y, C.PLAYER_Z + 0.01);

    // record a trail node in absolute track space
    nodes.push({ d: s, x, y });
    if (nodes.length > C.TRAIL_N) nodes.shift();

    // rebuild trail vertices relative to the current distance
    const pos = trailGeo.attributes.position.array;
    const col = trailGeo.attributes.color.array;
    const n = nodes.length;
    for (let i = 0; i < n; i++){
      const nd = nodes[i];
      const f = nd.d - s;                       // negative: behind us
      pos[i*3]   = nd.x;
      pos[i*3+1] = nd.y;
      pos[i*3+2] = C.PLAYER_Z - f;
      const k = i / Math.max(1, n - 1);         // 0 tail → 1 head
      const c = colB.clone().lerp(colA, k);     // gradient B → A
      col[i*3]   = c.r;
      col[i*3+1] = c.g;
      col[i*3+2] = c.b;
    }
    trailGeo.setDrawRange(0, n);
    trailGeo.attributes.position.needsUpdate = true;
    trailGeo.attributes.color.needsUpdate = true;
  }

  return {
    init, reset, update, explode, setAccent,
    get phi(){ return phi; },
    get phiV(){ return phiV; },
    get pos(){ return core.position; },
  };
})();
