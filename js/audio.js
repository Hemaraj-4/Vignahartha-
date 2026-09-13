"use strict";
// ============================================================
// VIGHNAHARTA — audio.js
// Fully procedural WebAudio: SFX synth + generative Indian-classical-
// flavored music (tanpura drone + bansuri lead + tabla-ish percussion).
// No audio files → ~0 KB of audio assets.
// ============================================================

const Audio2 = {
  ctx: null, master: null, musicBus: null, sfxBus: null,
  muted: false, unlocked: false,
  intensity: 0,          // 0 calm, 1 exploration, 2 combat
  bossMode: false,
  _musicTimer: 0, _step: 0, _noiseBuf: null,

  unlock() {
    if (this.unlocked) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.unlocked = true;
      this.master = this.ctx.createGain(); this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0.5;
      const mComp = this.ctx.createDynamicsCompressor();
      this.musicBus.connect(mComp); mComp.connect(this.master);
      this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 0.8;
      this.sfxBus.connect(this.master);
      // shared noise buffer
      const len = this.ctx.sampleRate;
      this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this._noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._startMusic();
    } catch (e) { console.warn('Audio unavailable', e); }
  },

  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.9; return this.muted; },

  // ---------------- SFX ----------------
  _env(g, t0, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0001), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec);
  },
  tone(freq, dur, { type = 'sine', vol = 0.3, attack = 0.005, slide = 0, bus = null, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(freq + slide, 1), t0 + dur);
    this._env(g, t0, attack, vol, dur);
    o.connect(g); g.connect(bus || this.sfxBus);
    o.start(t0); o.stop(t0 + dur + attack + 0.05);
  },
  noise(dur, { vol = 0.3, freq = 1000, q = 1, type = 'bandpass', attack = 0.002, slideTo = 0 } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this._noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (slideTo) f.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 10), t0 + dur);
    const g = this.ctx.createGain(); this._env(g, t0, attack, vol, dur);
    src.connect(f); f.connect(g); g.connect(this.sfxBus);
    src.start(t0); src.stop(t0 + dur + 0.05);
  },
  bell(freq, dur = 1.2, vol = 0.35) {
    if (!this.ctx) return;
    [1, 2.76, 5.4, 8.9].forEach((m, i) => {
      this.tone(freq * m, dur * (1 - i * 0.18), { type: 'sine', vol: vol / (i + 1.5), bus: this.sfxBus });
    });
  },
  conch() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(180, t0);
    o.frequency.exponentialRampToValueAtTime(320, t0 + 0.5);
    o.frequency.exponentialRampToValueAtTime(300, t0 + 1.6);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 4;
    this._env(g, t0, 0.15, 0.35, 1.6);
    o.connect(f); f.connect(g); g.connect(this.sfxBus);
    o.start(t0); o.stop(t0 + 2.0);
    this.noise(1.4, { vol: 0.08, freq: 500, q: 0.6, type: 'lowpass' });
  },
  chant() { // soft blessing chant — stacked vowel-ish tones
    [261.6, 329.6, 392, 523.3].forEach((f, i) =>
      this.tone(f, 0.9, { type: 'triangle', vol: 0.12, attack: 0.08, delay: i * 0.06 }));
  },

  play(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'jump': this.noise(0.12, { vol: 0.12, freq: 700, slideTo: 1400, q: 2 }); break;
      case 'djump': this.noise(0.16, { vol: 0.14, freq: 900, slideTo: 1800, q: 3 }); this.tone(520, 0.15, { type: 'triangle', vol: 0.12, slide: 300 }); break;
      case 'land': this.noise(0.08, { vol: 0.10, freq: 300, q: 1, type: 'lowpass' }); break;
      case 'dash': this.noise(0.18, { vol: 0.16, freq: 1200, slideTo: 400, q: 1.4 }); break;
      case 'axewhoosh': this.noise(0.14, { vol: 0.20, freq: 1800, slideTo: 500, q: 2.4 }); break;
      case 'axewood': this.noise(0.09, { vol: 0.32, freq: 260, q: 1, type: 'lowpass' }); this.tone(140, 0.08, { type: 'square', vol: 0.10 }); break;
      case 'axestone': this.noise(0.06, { vol: 0.24, freq: 2600, q: 5 }); this.tone(720, 0.07, { type: 'square', vol: 0.10, slide: -300 }); break;
      case 'axecharged': this.noise(0.28, { vol: 0.4, freq: 200, q: 0.8, type: 'lowpass' }); this.tone(90, 0.3, { type: 'square', vol: 0.22, slide: -40 }); this.bell(1800, 0.4, 0.15); break;
      case 'shatter': this.noise(0.3, { vol: 0.3, freq: 2400, slideTo: 700, q: 1.2 }); this.noise(0.2, { vol: 0.2, freq: 400, q: 0.8, type: 'lowpass' }); break;
      case 'noosethrow': this.noise(0.22, { vol: 0.18, freq: 600, slideTo: 2200, q: 3 }); break;
      case 'nooselatch': this.noise(0.07, { vol: 0.25, freq: 3000, q: 6 }); this.tone(880, 0.1, { type: 'triangle', vol: 0.15 }); break;
      case 'noosereel': this.tone(300, 0.1, { type: 'square', vol: 0.06 }); this.tone(360, 0.1, { type: 'square', vol: 0.06, delay: 0.09 }); break;
      case 'trunk': this.noise(0.24, { vol: 0.30, freq: 240, slideTo: 90, q: 0.9, type: 'lowpass', attack: 0.03 }); this.tone(160, 0.22, { type: 'sawtooth', vol: 0.16, slide: -70 }); break;
      case 'trunkslam': this.noise(0.32, { vol: 0.42, freq: 150, q: 0.7, type: 'lowpass' }); this.tone(70, 0.3, { type: 'sine', vol: 0.35, slide: -30 }); break;
      case 'bless': this.chant(); this.bell(1046, 1.0, 0.18); break;
      case 'fog': this.noise(0.7, { vol: 0.14, freq: 3000, slideTo: 6000, q: 0.5, attack: 0.2 }); this.chant(); break;
      case 'pickup': this.tone(784, 0.09, { type: 'triangle', vol: 0.16 }); this.tone(1175, 0.14, { type: 'triangle', vol: 0.14, delay: 0.06 }); break;
      case 'flower': this.tone(1046, 0.1, { type: 'sine', vol: 0.15 }); this.tone(1318, 0.12, { type: 'sine', vol: 0.12, delay: 0.07 }); break;
      case 'shield': this.chant(); this.bell(1318, 1.4, 0.22); break;
      case 'hurt': this.tone(220, 0.2, { type: 'sawtooth', vol: 0.22, slide: -120 }); this.noise(0.12, { vol: 0.18, freq: 500, q: 1 }); break;
      case 'guardhit': this.noise(0.08, { vol: 0.2, freq: 800, q: 2 }); this.tone(180, 0.12, { type: 'square', vol: 0.1, slide: -80 }); break;
      case 'bossclank': this.noise(0.05, { vol: 0.3, freq: 3600, q: 8 }); this.tone(1200, 0.06, { type: 'square', vol: 0.12, slide: -400 }); break;
      case 'bosshurt': this.tone(300, 0.18, { type: 'sawtooth', vol: 0.24, slide: -160 }); this.noise(0.14, { vol: 0.2, freq: 700, q: 1.5 }); break;
      case 'telegraph': this.tone(392, 0.5, { type: 'triangle', vol: 0.2, slide: 120 }); break;
      case 'bossdash': this.noise(0.3, { vol: 0.24, freq: 500, slideTo: 150, q: 1 }); break;
      case 'bossdie': this.conch(); this.chant(); this.bell(523, 2.0, 0.3); this.bell(784, 2.2, 0.22); break;
      case 'uiclick': this.tone(660, 0.05, { type: 'square', vol: 0.08 }); break;
      case 'gate': this.tone(180, 0.5, { type: 'sawtooth', vol: 0.14, slide: 60 }); this.noise(0.4, { vol: 0.12, freq: 300, q: 0.7, type: 'lowpass' }); break;
      case 'ringping': this.bell(1568, 0.5, 0.14); break;
      case 'step': this.noise(0.05, { vol: 0.05, freq: 250, q: 1, type: 'lowpass' }); break;
      case 'stun': this.tone(600, 0.4, { type: 'sine', vol: 0.15, slide: 500 }); break;
      case 'deflect': this.noise(0.05, { vol: 0.14, freq: 2800, q: 6 }); break;
      case 'menu': this.bell(880, 0.6, 0.2); break;
    }
  },

  // ---------------- MUSIC ----------------
  // Raga-like scale (Bhairav-flavored: S r G m P d N) rooted at D.
  SCALE: [146.83, 164.81, 185.0, 196.0, 220.0, 261.63, 293.66],
  _startMusic() {
    // Tanpura drone: continuous low root + fifth with slow shimmer
    const mk = (freq, vol) => {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'triangle'; o.frequency.value = freq;
      // slow vibrato shimmer
      const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain();
      lfo.frequency.value = 0.13 + Math.random() * 0.2; lg.gain.value = freq * 0.003;
      lfo.connect(lg); lg.connect(o.frequency); lfo.start();
      g.gain.value = vol; o.connect(g); g.connect(this.musicBus);
      o.start();
      return g;
    };
    this._drone = [mk(73.42, 0.10), mk(110.0, 0.06), mk(146.83, 0.05)]; // D2, A2, D3
    // schedule the percussive + melodic sequencer
    this._musicTimer = 0;
  },
  _pluck(freq, vol, dur = 0.35) {
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'triangle'; o.frequency.value = freq;
    this._env(g, t0, 0.01, vol, dur);
    o.connect(g); g.connect(this.musicBus); o.start(t0); o.stop(t0 + dur + 0.1);
  },
  _tabla(kind) {
    // kind: 0 = low "dha/ge" tone, 1 = high "na/tin" slap
    const t0 = this.ctx.currentTime;
    const g = this.ctx.createGain(); g.connect(this.musicBus);
    if (kind === 0) {
      const o = this.ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(98, t0); o.frequency.exponentialRampToValueAtTime(62, t0 + 0.18);
      this._env(g, t0, 0.005, 0.26, 0.2); o.connect(g); o.start(t0); o.stop(t0 + 0.3);
      this._nHit(t0, 0.05, 0.1, 220);
    } else {
      this._nHit(t0, 0.06, 0.15, 2400);
    }
  },
  _nHit(t0, vol, dur, freq) {
    const src = this.ctx.createBufferSource(); src.buffer = this._noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
    const g = this.ctx.createGain(); this._env(g, t0, 0.003, vol, dur);
    src.connect(f); f.connect(g); g.connect(this.musicBus);
    src.start(t0); src.stop(t0 + dur + 0.05);
  },
  _leadNote(freq, dur, vol = 0.14) {
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(freq, t0);
    // bansuri-ish glide into the note
    o.frequency.setValueAtTime(freq * 0.94, t0);
    o.frequency.exponentialRampToValueAtTime(freq, t0 + 0.09);
    const vib = this.ctx.createOscillator(), vg = this.ctx.createGain();
    vib.frequency.value = 5.2; vg.gain.value = freq * 0.008;
    vib.connect(vg); vg.connect(o.frequency);
    this._env(g, t0, 0.06, vol, dur);
    o.connect(g); g.connect(this.musicBus);
    o.start(t0); o.stop(t0 + dur + 0.3); vib.start(t0); vib.stop(t0 + dur + 0.3);
  },
  updateMusic(dt) {
    if (!this.ctx || this.muted) return;
    const tempo = this.bossMode ? 0.14 : (this.intensity >= 2 ? 0.17 : 0.22); // step seconds
    this._musicTimer -= dt;
    if (this._musicTimer > 0) return;
    this._musicTimer = tempo;
    const s = this._step++;
    const S = this.SCALE;
    const up = (i, oct = 0) => S[((i % 7) + 7) % 7] * Math.pow(2, oct);

    // Percussion pattern — 8-step cycle, denser in combat/boss
    const pat = this.bossMode ? [0, 1, 1, 0, 0, 1, 0, 1]
      : this.intensity >= 2 ? [0, -1, 1, -1, 0, -1, 1, -1]
      : [0, -1, -1, -1, 0, -1, -1, -1]; // -1 = rest
    const p = pat[s % 8];
    if (p >= 0) this._tabla(p);
    // Bell accent every 16 steps in boss mode
    if (this.bossMode && s % 16 === 0) this.bell(S[0] * 2, 0.8, 0.1);

    // Melodic phrase — 32-step phrases, calm during level intro
    if (this.intensity === 0 && s % 2 === 1) return; // sparse when calm
    const phrase = [
      0, 2, 3, 2, 4, 3, 2, 0,
      0, 2, 3, 5, 4, 3, 2, 1,
      5, 4, 3, 4, 5, 6, 5, 4,
      3, 2, 1, 2, 0, -1, -1, -1,
    ];
    const idx = phrase[s % 32];
    if (idx >= 0) {
      const oct = this.bossMode && (s % 32) >= 16 ? 1 : 0;
      this._leadNote(up(idx, oct), tempo * 1.8, this.bossMode ? 0.15 : 0.10);
    }
  },
};
