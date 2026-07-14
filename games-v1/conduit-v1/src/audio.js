/* =====================================================================
   CONDUIT — src/audio.js
   Fully synthesized WebAudio. No samples, no files. The same sound
   DNA as VOLT and TANGENT: pentatonic plucks that climb with score,
   a low electric hum, noise whooshes, a saw-fall on death.
   ===================================================================== */
'use strict';

window.SFX = (function(){

  let AC = null;        // AudioContext (created on first gesture)
  let master = null;    // master gain
  let muted = false;
  let _noise = null;    // cached 1s noise buffer

  // -------------------------------------------------- bootstrapping
  function ensure(){
    if (AC){
      if (AC.state === 'suspended') AC.resume();
      return;
    }
    try{
      AC = new (window.AudioContext || window.webkitAudioContext)();
      master = AC.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(AC.destination);
      hum();
      wind();
    }catch(e){ /* audio is optional — never break the game */ }
  }

  function setMuted(m){
    muted = m;
    if (master) master.gain.value = muted ? 0 : 0.5;
  }

  function noiseBuf(){
    if (_noise) return _noise;
    const b = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random()*2 - 1;
    _noise = b;
    return b;
  }

  // -------------------------------------------------- ambience
  // Twin detuned sines — the conduit's electric hum.
  function hum(){
    for (const f of [55, 55.7]){
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.value = 0.005;
      o.connect(g); g.connect(master);
      o.start();
    }
  }

  // Slow filtered noise — air rushing past.
  function wind(){
    const n = AC.createBufferSource();
    n.buffer = noiseBuf(); n.loop = true;
    const f = AC.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 240;
    const g = AC.createGain(); g.gain.value = 0.012;
    const lfo = AC.createOscillator(); lfo.frequency.value = 0.07;
    const lg = AC.createGain(); lg.gain.value = 0.006;
    lfo.connect(lg); lg.connect(g.gain);
    n.connect(f); f.connect(g); g.connect(master);
    n.start(); lfo.start();
  }

  // -------------------------------------------------- primitives
  function tone(type, f0, f1, dur, vol, delay){
    if (!AC) return;
    const t = AC.currentTime + (delay || 0);
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noiz(dur, vol, f0, f1, type, delay){
    if (!AC) return;
    const t = AC.currentTime + (delay || 0);
    const n = AC.createBufferSource();
    n.buffer = noiseBuf(); n.loop = true;
    const f = AC.createBiquadFilter();
    f.type = type || 'bandpass';
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = AC.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f); f.connect(g); g.connect(master);
    n.start(t); n.stop(t + dur + 0.05);
  }

  // -------------------------------------------------- musical scale
  const PENT = [0, 3, 5, 7, 10];   // minor pentatonic steps
  function noteF(n){
    const st = PENT[n % 5] + 12 * Math.floor((n % 15) / 5);
    return 196 * Math.pow(2, st / 12);
  }

  // -------------------------------------------------- game sounds
  const api = {
    ensure, setMuted,

    // gate passed — pluck climbs the scale with your score
    pass(n){
      const f = noteF(n);
      tone('triangle', f, 0, 0.15, 0.26);
      tone('sine', 150, 60, 0.06, 0.14);
    },

    // graze — pass + a bright fifth and a sparkle on top
    graze(n){
      const f = noteF(n);
      tone('triangle', f, 0, 0.16, 0.28);
      tone('triangle', f * 1.5, 0, 0.2, 0.2);
      tone('sine', f * 4, 0, 0.09, 0.07);
      tone('sine', 150, 60, 0.06, 0.16);
    },

    // sector up — rising arpeggio
    sector(){
      tone('triangle', 523.25, 0, 0.10, 0.20);
      tone('triangle', 659.25, 0, 0.10, 0.20, 0.07);
      tone('triangle', 783.99, 0, 0.16, 0.22, 0.14);
    },

    // near-miss whoosh accents (steering hard)
    swish(){
      noiz(0.10, 0.10, 700, 2000);
    },

    die(){
      tone('sawtooth', 280, 36, 0.55, 0.32);
      noiz(0.4, 0.4, 2400, 160, 'lowpass');
    },

    go(){
      tone('square', 392, 0, 0.06, 0.12);
    },

    vib(p){
      if (navigator.vibrate) navigator.vibrate(p);
    },
  };

  return api;
})();
