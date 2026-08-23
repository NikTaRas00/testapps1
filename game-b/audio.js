/* ECHO CITY — audio.js
   Everything is synthesised on the fly; no audio files to load. */

export class Sound {
  constructor(){
    this.ctx = null;
    this.ready = false;
    this.muted = false;
  }

  init(){
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();

    this.master = ctx.createGain();
    this.master.gain.value = .55;
    this.master.connect(ctx.destination);

    // gentle limiter so sirens + engine never clip
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 8; comp.attack.value = .004;
    this.bus = ctx.createGain();
    this.bus.connect(comp); comp.connect(this.master);

    /* ---- engine: two detuned saws through a moving lowpass ---- */
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.engFilt = ctx.createBiquadFilter();
    this.engFilt.type = 'lowpass'; this.engFilt.frequency.value = 500;
    this.engFilt.Q.value = 4;
    this.eng = [];
    for (let i = 0; i < 3; i++){
      const o = ctx.createOscillator();
      o.type = i === 2 ? 'square' : 'sawtooth';
      o.frequency.value = 55 + i * 1.6;
      const g = ctx.createGain(); g.gain.value = i === 2 ? .22 : .4;
      o.connect(g); g.connect(this.engFilt);
      o.start();
      this.eng.push(o);
    }
    this.engFilt.connect(this.engGain); this.engGain.connect(this.bus);

    /* ---- tyre / wind noise ---- */
    const N = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, N, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < N; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    this.tyre = ctx.createBufferSource();
    this.tyre.buffer = buf; this.tyre.loop = true;
    this.tyreFilt = ctx.createBiquadFilter();
    this.tyreFilt.type = 'bandpass'; this.tyreFilt.frequency.value = 1400; this.tyreFilt.Q.value = .8;
    this.tyreGain = ctx.createGain(); this.tyreGain.gain.value = 0;
    this.tyre.connect(this.tyreFilt); this.tyreFilt.connect(this.tyreGain);
    this.tyreGain.connect(this.bus);
    this.tyre.start();

    /* ---- siren: wailing triangle pair ---- */
    this.sirGain = ctx.createGain(); this.sirGain.gain.value = 0;
    this.sir = ctx.createOscillator(); this.sir.type = 'triangle';
    this.sir.frequency.value = 700;
    const sirShape = ctx.createGain(); sirShape.gain.value = .28;
    this.sir.connect(sirShape); sirShape.connect(this.sirGain);
    this.sirGain.connect(this.bus);
    this.sir.start();
    this.sirT = 0;

    /* ---- city ambience: low hum bed ---- */
    const amb = ctx.createBufferSource();
    amb.buffer = buf; amb.loop = true;
    const ambF = ctx.createBiquadFilter();
    ambF.type = 'lowpass'; ambF.frequency.value = 190;
    const ambG = ctx.createGain(); ambG.gain.value = .10;
    amb.connect(ambF); ambF.connect(ambG); ambG.connect(this.bus);
    amb.start();

    this.ready = true;
  }

  resume(){ if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setMuted(m){ this.muted = m; if (this.master) this.master.gain.value = m ? 0 : .55; }

  /* per-frame: engine pitch/level, tyre scrub, siren proximity */
  drive(dt, { rpm = 0, load = 0, scrub = 0, siren = 0, inCar = true }){
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    const base = 46 + rpm * 150;
    for (let i = 0; i < 3; i++){
      this.eng[i].frequency.setTargetAtTime(base * (i === 2 ? 2 : 1) + i * 1.7, now, .05);
    }
    this.engFilt.frequency.setTargetAtTime(320 + rpm * 2100 + load * 700, now, .06);
    this.engGain.gain.setTargetAtTime(inCar ? .12 + load * .1 : 0, now, .12);

    this.tyreFilt.frequency.setTargetAtTime(900 + rpm * 2600, now, .08);
    this.tyreGain.gain.setTargetAtTime(inCar ? .012 + rpm * .035 + scrub * .11 : .004, now, .08);

    this.sirT += dt;
    if (siren > .001){
      this.sir.frequency.setTargetAtTime(620 + Math.sin(this.sirT * 5.2) * 300, now, .02);
    }
    this.sirGain.gain.setTargetAtTime(siren * .5, now, .18);
  }

  /* one-shots */
  blip(freq = 660, dur = .12, type = 'square', vol = .2){
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + .008);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(this.bus);
    o.start(t); o.stop(t + dur + .02);
  }

  sweep(f0, f1, dur = .5, type = 'sine', vol = .22){
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(this.bus);
    o.start(t); o.stop(t + dur + .02);
  }

  crash(power = 1){
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.setValueAtTime(2600, t);
    f.frequency.exponentialRampToValueAtTime(160, t + .34);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(Math.min(.5, .2 + power * .35), t);
    g.gain.exponentialRampToValueAtTime(.0001, t + .38);
    s.connect(f); f.connect(g); g.connect(this.bus);
    s.start(t); s.stop(t + .4);
  }

  rewind(){
    if (!this.ready) return;
    this.sweep(1400, 90, 1.1, 'sawtooth', .16);
    this.sweep(300, 1800, .9, 'sine', .1);
  }

  chime(){ this.blip(880, .1, 'sine', .18); setTimeout(() => this.blip(1320, .18, 'sine', .16), 90); }
  alarm(){ this.blip(420, .18, 'square', .16); setTimeout(() => this.blip(330, .26, 'square', .14), 170); }
  fanfare(){
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => this.blip(f, .3, 'triangle', .2), i * 130));
  }
  fail(){ this.sweep(420, 70, .9, 'sawtooth', .2); }
}
