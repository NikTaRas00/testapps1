/* =====================================================================
   CONDUIT — src/config.js
   Every tuning knob in the game lives here. Change numbers, not code.
   ===================================================================== */
'use strict';

window.CFG = (function(){

  // ---------- palette ------------------------------------------------
  // One gradient pair per sector. First color = primary accent,
  // second = the far end of the player's trail gradient.
  // Same family as VOLT / TANGENT — the spark saga keeps its colors.
  const GRADS = [
    ['#FF4D2E', '#FF2E92'],   // sector 1 — vermilion → pink
    ['#FFB01F', '#FF5C2E'],   // sector 2 — amber → orange
    ['#3DFFAB', '#2EC8FF'],   // sector 3 — mint → cyan
    ['#6E7BFF', '#C44DFF'],   // sector 4 — periwinkle → violet
    ['#FF5CA8', '#FFB01F'],   // sector 5 — pink → amber
    ['#E8FF47', '#3DFFAB'],   // sector 6 — acid → mint
  ];

  return {
    GRADS,

    FG:    '#F5F4F0',
    BG:    0x07070a,        // three.js clear color
    RED:   '#FF3B30',       // death signal
    RED3:  0xff3b30,

    // ---------- tunnel ----------
    TUBE_R:        6.0,     // conduit radius (world units)
    RING_SPACING:  4.0,     // distance between hairline rings
    RING_COUNT:    42,      // rings kept alive (recycled)
    RING_SEGS:     48,      // circle resolution
    RAIL_LINES:    5,       // longitudinal dot rails
    RAIL_DOTS:     30,      // dots per rail
    DUST_COUNT:    140,     // ambient drifting dust points

    // Curvature of the conduit path. Amplitude eases in with
    // distance so the first seconds are a straight, readable shot.
    CURVE: {
      A1: 2.6,  K1: 0.020,
      A2: 1.5,  K2: 0.047,
      B1: 2.2,  K3: 0.026,
      B2: 1.2,  K4: 0.039,
      RAMP_DIST: 140,       // distance over which curvature fades in
      SECTOR_GAIN: 0.14,    // extra amplitude per sector
    },

    // ---------- player ----------
    PLAYER_RING_R: 5.1,     // spark rides slightly inside the wall
    PLAYER_Z:     -2.0,     // spark sits ahead of the camera
    STEER_ACC:    16.0,     // rad/s^2 while holding
    STEER_DAMP:    5.5,     // exponential damping
    STEER_VMAX:    6.5,     // rad/s cap
    TRAIL_N:      30,       // trail nodes (the one gradient)

    // ---------- camera ----------
    CAM_BACK:      2.6,     // camera distance behind the spark
    CAM_LOOK:      9.0,     // how far ahead the camera aims
    CAM_BIAS:      0.30,    // camera drifts toward the spark's side
    FOV_MIN:      62,
    FOV_MAX:      76,       // fov opens up with speed
    BANK_GAIN:     0.16,    // roll with steering velocity
    BANK_MAX:      0.5,

    // ---------- speed / difficulty ----------
    SPEED0:       26,       // units per second at start
    SPEED_GAIN:    0.38,    // + per gate passed
    SPEED_MAX:    62,

    GATE_SPACING0:   46,    // distance between gates at start
    GATE_SPACING_MIN: 30,
    GATE_AHEAD:       7,    // gates kept spawned ahead

    GAP0:          1.35,    // gap arc (radians) at start
    GAP_MIN:       0.72,
    GAP_SHRINK:    0.010,   // per gate

    DOUBLE_FROM:  12,       // double-arc gates can appear from gate N
    DOUBLE_P:      0.35,
    MOVING_FROM:  22,       // rotating gates from gate N
    MOVING_P:      0.40,
    MOVE_SP_MIN:   0.35,    // rad/s
    MOVE_SP_MAX:   0.85,

    GRAZE_ARC:     0.17,    // rad from a gap edge that counts as graze
    STREAK_FOR_BONUS: 3,    // graze streak that turns on OVERDRIVE

    SECTOR_EVERY: 10,       // gates per sector

    // ---------- feel ----------
    HITSTOP_PASS:  0.045,
    HITSTOP_GRAZE: 0.085,
    SHAKE_PASS:    1.6,
    SHAKE_GRAZE:   3.4,
    SHAKE_DIE:    11,
    SLOWMO_DIE:    0.16,
    RETRY_LOCK:  420,       // ms before a tap can restart after death

    // ---------- fog ----------
    FOG_DENSITY:  0.058,
  };
})();
