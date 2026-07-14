/* =====================================================================
   CONDUIT — src/gates.js
   The barriers. Each gate is one or two arc walls across the tube
   with gaps to thread. Meshes are pooled and recycled; the module
   resolves each crossing into pass / graze / death.
   ===================================================================== */
'use strict';

window.Gates = (function(){

  const C = window.CFG;
  const TAU = Math.PI * 2;

  // pooled visuals: each slot = up to 2 arc meshes + 4 gap posts
  const SLOTS = C.GATE_AHEAD + 2;
  const slots = [];        // { arcs:[Mesh,Mesh], posts:[Mesh x4] }
  let gates = [];          // logical gates: { d, arcs:[{a0,span}], rot, used, slot }
  let accentHex = 0xff4d2e;
  let nextGateIndex = 0;   // how many gates have ever been spawned
  let sceneRef = null;

  const norm = a => ((a % TAU) + TAU) % TAU;
  const angDiff = x => { x = norm(x); return x > Math.PI ? x - TAU : x; };

  // -------------------------------------------------- pool
  function makeArcMesh(){
    // annulus segment facing the camera; geometry is replaced per use
    const geo = new THREE.RingGeometry(C.TUBE_R - 1.5, C.TUBE_R - 0.05,
                                       40, 1, 0, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: accentHex, side: THREE.DoubleSide,
      transparent: true, opacity: 0.92, fog: true,
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    m.visible = false;
    sceneRef.add(m);
    return m;
  }

  function makePost(){
    const geo = new THREE.SphereGeometry(0.14, 10, 10);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xf5f4f0, transparent: true, opacity: 0.95, fog: true,
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    m.visible = false;
    sceneRef.add(m);
    return m;
  }

  function init(scene){
    sceneRef = scene;
    for (let i = 0; i < SLOTS; i++){
      slots.push({
        arcs:  [makeArcMesh(), makeArcMesh()],
        posts: [makePost(), makePost(), makePost(), makePost()],
        free: true,
      });
    }
  }

  function setAccent(hexStr){
    accentHex = parseInt(hexStr.slice(1), 16);
    for (const s of slots)
      for (const a of s.arcs) a.material.color.setHex(accentHex);
  }

  // -------------------------------------------------- spawning
  // Build the blocked arcs for gate number n.
  // Single gate: one wall with one gap. Double: two walls, two gaps.
  function designGate(n){
    const gap = Math.max(C.GAP_MIN, C.GAP0 - n * C.GAP_SHRINK);
    const arcs = [];
    const isDouble = n >= C.DOUBLE_FROM && Math.random() < C.DOUBLE_P;
    if (isDouble){
      // two gaps opposite-ish each other, two walls between them
      const g1 = Math.random() * TAU;
      const g2 = g1 + Math.PI + (Math.random()*0.8 - 0.4);
      const e1 = norm(g1 + gap * 0.75);
      const e2 = norm(g2 + gap * 0.75);
      arcs.push({ a0: e1, span: norm(g2 - e1) });
      arcs.push({ a0: e2, span: norm(g1 - e2) });
    } else {
      const g = Math.random() * TAU;           // gap start
      arcs.push({ a0: norm(g + gap), span: TAU - gap });
    }
    const moving = n >= C.MOVING_FROM && Math.random() < C.MOVING_P;
    const rot = moving
      ? (Math.random() < 0.5 ? -1 : 1) *
        (C.MOVE_SP_MIN + Math.random() * (C.MOVE_SP_MAX - C.MOVE_SP_MIN))
      : 0;
    return { arcs, rot };
  }

  function freeSlot(){
    for (const s of slots) if (s.free) return s;
    return null;
  }

  function spawn(d){
    const slot = freeSlot();
    if (!slot) return;                          // shouldn't happen
    const plan = designGate(nextGateIndex++);
    slot.free = false;
    gates.push({
      d, slot,
      arcs: plan.arcs,
      rot: plan.rot,
      off: 0,                                    // rotation offset
      used: false,
    });
  }

  function reset(){
    for (const g of gates) releaseVisual(g);
    gates = [];
    nextGateIndex = 0;
  }

  function releaseVisual(g){
    g.slot.free = true;
    for (const a of g.slot.arcs)  a.visible = false;
    for (const p of g.slot.posts) p.visible = false;
  }

  // -------------------------------------------------- streaming
  // Keep GATE_AHEAD gates spawned ahead of the spark; retire passed ones.
  const _c = { x: 0, y: 0 };

  function furthest(){
    let m = 0;
    for (const g of gates) m = Math.max(m, g.d);
    return m;
  }

  function spacing(){
    return Math.max(C.GATE_SPACING_MIN,
                    C.GATE_SPACING0 - nextGateIndex * 0.35);
  }

  function update(s, dt){
    // spawn ahead
    if (gates.length === 0){
      spawn(s + 70);                            // first gate: gentle lead-in
    }
    while (gates.length < C.GATE_AHEAD){
      spawn(furthest() + spacing());
    }

    // animate + position + retire
    for (let i = gates.length - 1; i >= 0; i--){
      const g = gates[i];
      g.off += g.rot * dt;

      const f = g.d - s;                        // distance ahead
      if (f < -6){                              // fully behind — recycle
        releaseVisual(g);
        gates.splice(i, 1);
        continue;
      }

      Tunnel.center(g.d, _c);
      const z = C.PLAYER_Z - f;

      for (let k = 0; k < 2; k++){
        const mesh = g.slot.arcs[k];
        const arc = g.arcs[k];
        if (!arc){ mesh.visible = false; continue; }
        // rebuild only when the span changed (fresh gate); rotate via mesh
        if (mesh.userData.span !== arc.span){
          mesh.geometry.dispose();
          mesh.geometry = new THREE.RingGeometry(
            C.TUBE_R - 1.5, C.TUBE_R - 0.05, 40, 1, 0, arc.span);
          mesh.userData.span = arc.span;
        }
        mesh.visible = true;
        mesh.position.set(_c.x, _c.y, z);
        mesh.rotation.z = arc.a0 + g.off;
        // fade in from the fog
        mesh.material.opacity = Math.min(0.92, Math.max(0.12, (90 - f) / 40));
      }

      // gap posts — small white spheres at each blocked-arc edge
      let pi = 0;
      for (const arc of g.arcs){
        for (const edge of [arc.a0 + g.off, arc.a0 + arc.span + g.off]){
          const post = g.slot.posts[pi++];
          post.visible = true;
          post.position.set(
            _c.x + Math.cos(edge) * (C.TUBE_R - 0.78),
            _c.y + Math.sin(edge) * (C.TUBE_R - 0.78),
            z);
        }
      }
      for (; pi < 4; pi++) g.slot.posts[pi].visible = false;
    }
  }

  // -------------------------------------------------- crossing
  // Called once per frame with the spark's previous and current
  // distance. Returns null or an event object.
  function cross(prevS, s, phi){
    for (const g of gates){
      if (g.used) continue;
      if (g.d > prevS && g.d <= s){
        g.used = true;
        const p = norm(phi);
        let hit = false;
        let minEdge = Infinity;
        for (const arc of g.arcs){
          const rel = norm(p - (arc.a0 + g.off));
          if (rel < arc.span) hit = true;
          // distance to nearest blocked edge (for graze)
          const dA = Math.abs(angDiff(p - (arc.a0 + g.off)));
          const dB = Math.abs(angDiff(p - (arc.a0 + arc.span + g.off)));
          minEdge = Math.min(minEdge, dA, dB);
        }
        if (hit) return { type: 'die', gate: g };
        return {
          type: 'pass',
          graze: minEdge < C.GRAZE_ARC,
          gate: g,
        };
      }
    }
    return null;
  }

  return { init, reset, update, cross, setAccent };
})();
