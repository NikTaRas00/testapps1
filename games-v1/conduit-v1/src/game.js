/* =====================================================================
   CONDUIT — src/game.js
   Boot, state machine, scoring, sectors, camera work, main loop.
   Depends on: CFG, SFX, Input, FX, Tunnel, Gates, PlayerMod, THREE.
   ===================================================================== */
'use strict';

(function(){

  const C = window.CFG;

  // -------------------------------------------------- three.js boot
  const renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('gl'),
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(C.BG);
  scene.fog = new THREE.FogExp2(C.BG, C.FOG_DENSITY);

  const camera = new THREE.PerspectiveCamera(
    C.FOV_MIN, window.innerWidth / window.innerHeight, 0.1, 220);

  function onResize(){
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize);
  onResize();

  // -------------------------------------------------- modules
  FX.init();
  FX.initBursts(scene);
  Tunnel.init(scene);
  Gates.init(scene);
  PlayerMod.init(scene);

  // -------------------------------------------------- DOM refs
  const $ = id => document.getElementById(id);
  const elMenu   = $('menu'),  elDead  = $('dead');
  const elScore  = $('score'), elBestT = $('bestTop');
  const elStreak = $('streak'),elSector= $('sector');
  const elHint   = $('hint');
  const dScore   = $('dScore'), dBest  = $('dBest');
  const dNew     = $('dNew'),   dTag   = $('dTag');
  const mBest    = $('mBest');

  // -------------------------------------------------- state
  let state = 'menu';           // menu | play | dead
  let s = 0, prevS = 0;         // track distance
  let speed = C.SPEED0;
  let score = 0, best = 0;
  let grazeStreak = 0;
  let sector = 0;
  let freeze = 0;
  let timeScale = 1;
  let deathAt = 0;

  function accA(){ return C.GRADS[sector % C.GRADS.length][0]; }
  function accB(){ return C.GRADS[sector % C.GRADS.length][1]; }

  function applyAccent(){
    Gates.setAccent(accA());
    PlayerMod.setAccent(accA(), accB());
    document.documentElement.style.setProperty('--acc',  accA());
    document.documentElement.style.setProperty('--acc2', accB());
  }
  applyAccent();

  // -------------------------------------------------- flow
  function start(){
    s = 0; prevS = 0;
    speed = C.SPEED0;
    score = 0; grazeStreak = 0; sector = 0;
    freeze = 0; timeScale = 1;
    Gates.reset();
    PlayerMod.reset();
    Tunnel.setSector(0);
    applyAccent();
    Input.clear();
    elMenu.classList.add('hide');
    elDead.classList.add('hide');
    elScore.textContent = '0';
    elSector.textContent = 'S E C T O R  1';
    elHint.classList.remove('gone');
    state = 'play';
    SFX.go();
  }

  function die(){
    state = 'dead';
    deathAt = performance.now();
    best = Math.max(best, score);
    timeScale = C.SLOWMO_DIE;
    PlayerMod.explode();
    FX.burst3(PlayerMod.pos, C.RED, 6, 0.7);
    FX.burst3(PlayerMod.pos, C.FG, 4, 0.55);
    FX.shake(C.SHAKE_DIE);
    FX.flash(C.RED, 0.16);
    SFX.die(); SFX.vib([40, 50, 80]);
    dTag.textContent = '— grounded —';
    FX.countUp(dScore, score);
    dBest.textContent = 'best ' + best;
    dNew.classList.toggle('hide', !(score > 0 && score === best));
    elDead.classList.remove('hide');
  }

  function onPass(ev){
    const graze = ev.graze;
    const gain = (graze ? 2 : 1) + (grazeStreak >= C.STREAK_FOR_BONUS ? 1 : 0);
    score += gain;
    grazeStreak = graze ? grazeStreak + 1 : 0;

    elScore.textContent = String(score);
    elScore.classList.remove('pop'); void elScore.offsetWidth;
    elScore.classList.add('pop');

    if (graze){
      FX.float('+' + gain + ' graze', 'graze');
      FX.pulse('graze');
      FX.shake(C.SHAKE_GRAZE);
      freeze = C.HITSTOP_GRAZE;
      SFX.graze(score); SFX.vib(18);
    } else {
      FX.float('+' + gain, '');
      FX.shake(C.SHAKE_PASS);
      freeze = C.HITSTOP_PASS;
      SFX.pass(score); SFX.vib(8);
    }

    elStreak.classList.toggle('on', grazeStreak >= C.STREAK_FOR_BONUS);
    if (score > 0) elHint.classList.add('gone');

    // NEW BEST — live, the moment you cross it
    if (best > 0){
      elBestT.textContent = score > best ? 'N E W   B E S T' : 'B E S T   ' + best;
      elBestT.classList.toggle('newbest', score > best);
      elBestT.classList.remove('hidden');
    }

    // speed & sector progression
    speed = Math.min(C.SPEED_MAX, speed + C.SPEED_GAIN);
    const before = Math.floor((score - gain) / C.SECTOR_EVERY);
    const after  = Math.floor(score / C.SECTOR_EVERY);
    if (after > before){
      sector = after;
      Tunnel.setSector(sector);
      applyAccent();
      elSector.textContent = 'S E C T O R  ' + (sector + 1);
      elSector.classList.remove('stamp'); void elSector.offsetWidth;
      elSector.classList.add('stamp');
      FX.flash('#FFFFFF', 0.07);
      SFX.sector();
    }
  }

  // -------------------------------------------------- input wiring
  Input.init({
    onAny(){ SFX.ensure(); },
    onAction(){
      if (state === 'menu'){ start(); return; }
      if (state === 'dead' && performance.now() - deathAt > C.RETRY_LOCK){
        start();
      }
      // during play, pointers are steering — no tap action
    },
  });

  $('bMute').addEventListener('pointerdown', function(e){
    e.stopPropagation();
    SFX.ensure();
    const m = this.textContent !== '∅';
    SFX.setMuted(m);
    this.textContent = m ? '∅' : '♪';
  });

  document.addEventListener('visibilitychange', function(){
    // dt clamp handles the gap; nothing to pause explicitly
  });

  // -------------------------------------------------- camera work
  const _cc = { x: 0, y: 0 };
  const _lc = { x: 0, y: 0 };

  function updateCamera(dt){
    Tunnel.center(s + C.CAM_BACK, _cc);
    Tunnel.center(s + C.CAM_LOOK, _lc);

    const p = PlayerMod;
    const px = Math.cos(p.phi) * C.PLAYER_RING_R;
    const py = Math.sin(p.phi) * C.PLAYER_RING_R;

    const sh = FX.shakeOffset(dt);
    camera.position.set(
      _cc.x + px * C.CAM_BIAS + sh.x,
      _cc.y + py * C.CAM_BIAS + sh.y,
      C.PLAYER_Z + C.CAM_BACK);

    camera.lookAt(_lc.x, _lc.y, C.PLAYER_Z - C.CAM_LOOK);

    // bank into the steer
    const bank = Math.max(-C.BANK_MAX,
                 Math.min(C.BANK_MAX, -p.phiV * C.BANK_GAIN));
    camera.rotation.z += bank;

    // fov opens with speed
    const k = (speed - C.SPEED0) / (C.SPEED_MAX - C.SPEED0);
    const fov = C.FOV_MIN + (C.FOV_MAX - C.FOV_MIN) * Math.max(0, k);
    if (Math.abs(camera.fov - fov) > 0.05){
      camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 4));
      camera.updateProjectionMatrix();
    }
  }

  // -------------------------------------------------- main loop
  let last = performance.now();

  function frame(t){
    requestAnimationFrame(frame);
    let dt = Math.min(0.033, (t - last) / 1000);
    last = t;
    if (document.hidden) return;

    timeScale += (1 - timeScale) * (1 - Math.exp(-dt * 3));
    const tn = t / 1000;

    if (freeze > 0){
      freeze -= dt;
    } else {
      const dts = dt * timeScale;

      if (state === 'play'){
        prevS = s;
        s += speed * dts;
        PlayerMod.update(dts, s, Input.steer);

        const ev = Gates.cross(prevS, s, PlayerMod.phi);
        if (ev){
          if (ev.type === 'die'){ die(); }
          else onPass(ev);
        }
      } else if (state === 'menu'){
        // attract: drift forward slowly, gentle auto-sway
        prevS = s;
        s += 9 * dts;
        PlayerMod.update(dts, s, Math.sin(tn * 0.7) > 0 ? 1 : -1);
      } else {
        // dead: world coasts in slow motion behind the plate
        prevS = s;
        s += speed * dts * 0.4;
      }

      Tunnel.update(s, dts, tn);
      Gates.update(s, dts);
    }

    FX.updateBursts(dt);
    updateCamera(dt);
    renderer.render(scene, camera);

    if (state === 'menu' && best > 0){
      mBest.style.display = 'block';
      mBest.textContent = 'best ' + best;
    }
  }

  requestAnimationFrame(frame);
})();
