/* =====================================================================
   CONDUIT — src/input.js
   One idea: hold LEFT half of the screen to rotate one way, RIGHT
   half the other. Arrow keys / A-D on desktop. A plain tap acts as
   "action" (start / retry) when the game isn't in play.
   ===================================================================== */
'use strict';

window.Input = (function(){

  // -1 = counter-clockwise, +1 = clockwise, 0 = coasting
  let steer = 0;

  // active pointers → the zone they pressed (-1 | +1)
  const zones = new Map();

  // keyboard state
  const keys = new Set();

  // callbacks
  let onAction = function(){};   // tap / space when not steering context
  let onAny    = function(){};   // any first gesture (audio unlock)

  function recompute(){
    let s = 0;
    for (const z of zones.values()) s += z;
    if (keys.has('ArrowLeft')  || keys.has('KeyA')) s -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) s += 1;
    steer = s < 0 ? -1 : (s > 0 ? 1 : 0);
  }

  function init(opts){
    onAction = opts.onAction || onAction;
    onAny    = opts.onAny    || onAny;

    window.addEventListener('pointerdown', function(e){
      onAny();
      const zone = (e.clientX < window.innerWidth / 2) ? -1 : 1;
      zones.set(e.pointerId, zone);
      recompute();
      onAction(e);          // Game decides whether a tap means anything
    }, { passive: true });

    function lift(e){
      zones.delete(e.pointerId);
      recompute();
    }
    window.addEventListener('pointerup', lift);
    window.addEventListener('pointercancel', lift);

    window.addEventListener('keydown', function(e){
      if (e.repeat) return;
      onAny();
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyJ'){
        e.preventDefault();
        onAction(e);
        return;
      }
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' ||
          e.code === 'KeyA' || e.code === 'KeyD'){
        e.preventDefault();
        keys.add(e.code);
        recompute();
      }
    });

    window.addEventListener('keyup', function(e){
      keys.delete(e.code);
      recompute();
    });

    // Losing focus should never leave a phantom held key
    window.addEventListener('blur', function(){
      keys.clear(); zones.clear(); recompute();
    });
  }

  return {
    init,
    get steer(){ return steer; },
    clear(){ zones.clear(); keys.clear(); recompute(); },
  };
})();
