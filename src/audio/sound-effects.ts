/**
 * Procedural sound effects using Web Audio API.
 * No audio files needed — generates gunshot, reload, etc. from noise and oscillators.
 */

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

export type WeaponSoundType = 'pistol' | 'rifle' | 'shotgun' | 'sniper';

// ─── Shared helpers ───

function makeNoise(ctx: AudioContext, duration: number, decay = 3): AudioBufferSourceNode {
  const size = Math.ceil(ctx.sampleRate * duration);
  const buf = ctx.createBuffer(1, size, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < size; i++) {
    d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / size, decay);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

function makeDistortion(ctx: AudioContext, amount = 20): WaveShaperNode {
  const ws = ctx.createWaveShaper();
  const c = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i * 2) / 256 - 1;
    c[i] = (Math.PI + amount) * x / (Math.PI + amount * Math.abs(x));
  }
  ws.curve = c;
  return ws;
}

// ─── Per-weapon sound synthesis ───

/** PP7 Pistol: short, tight snap — high-frequency crack with quick cutoff */
export function playGunshotPistol(): void {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;

  // Sharp transient noise (very short)
  const noise = makeNoise(ctx, 0.06, 5);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(2000, now);
  hp.frequency.exponentialRampToValueAtTime(800, now + 0.04);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.35, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
  noise.connect(hp);
  hp.connect(g);
  g.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.06);

  // Tiny mechanical click (slide action)
  const click = ctx.createOscillator();
  click.frequency.setValueAtTime(4000, now);
  click.frequency.exponentialRampToValueAtTime(1500, now + 0.02);
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(0.12, now);
  cg.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
  click.connect(cg);
  cg.connect(ctx.destination);
  click.start(now);
  click.stop(now + 0.03);

  // Light bass punch
  const bass = ctx.createOscillator();
  bass.frequency.setValueAtTime(200, now);
  bass.frequency.exponentialRampToValueAtTime(60, now + 0.04);
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0.2, now);
  bg.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
  bass.connect(bg);
  bg.connect(ctx.destination);
  bass.start(now);
  bass.stop(now + 0.06);
}

/** KF7 Rifle: metallic rattle — bandpass resonance + mid-frequency buzz */
export function playGunshotRifle(): void {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;

  // Noise burst with resonant bandpass (metallic ring)
  const noise = makeNoise(ctx, 0.08, 4);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(2200, now);
  bp.frequency.exponentialRampToValueAtTime(600, now + 0.06);
  bp.Q.value = 3; // resonant — gives metallic ring
  const dist = makeDistortion(ctx, 30);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.3, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
  noise.connect(bp);
  bp.connect(dist);
  dist.connect(g);
  g.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.08);

  // Mid-frequency buzz (bolt carrier rattle)
  const buzz = ctx.createOscillator();
  buzz.type = 'sawtooth';
  buzz.frequency.setValueAtTime(300, now);
  buzz.frequency.exponentialRampToValueAtTime(100, now + 0.04);
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0.15, now);
  bg.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
  buzz.connect(bg);
  bg.connect(ctx.destination);
  buzz.start(now);
  buzz.stop(now + 0.06);
}

/** Shotgun: thunderous BOOM — heavy bass + wide noise + long tail */
export function playGunshotShotgun(): void {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;

  // Wide noise burst (long, heavy)
  const noise = makeNoise(ctx, 0.25, 2);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1200, now);
  lp.frequency.exponentialRampToValueAtTime(200, now + 0.15);
  const dist = makeDistortion(ctx, 40);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5, now);
  g.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
  noise.connect(lp);
  lp.connect(dist);
  dist.connect(g);
  g.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.25);

  // Heavy bass thump (deep boom)
  const bass = ctx.createOscillator();
  bass.frequency.setValueAtTime(80, now);
  bass.frequency.exponentialRampToValueAtTime(25, now + 0.15);
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0.6, now);
  bg.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  bass.connect(bg);
  bg.connect(ctx.destination);
  bass.start(now);
  bass.stop(now + 0.2);

  // Secondary bass (sub-harmonic rumble)
  const sub = ctx.createOscillator();
  sub.frequency.setValueAtTime(45, now);
  sub.frequency.exponentialRampToValueAtTime(20, now + 0.12);
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0.35, now);
  sg.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  sub.connect(sg);
  sg.connect(ctx.destination);
  sub.start(now);
  sub.stop(now + 0.18);

  // High-frequency crack (pellet spread)
  const crack = makeNoise(ctx, 0.04, 6);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 3000;
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(0.2, now);
  cg.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
  crack.connect(hp);
  hp.connect(cg);
  cg.connect(ctx.destination);
  crack.start(now);
  crack.stop(now + 0.04);
}

/** Sniper: supersonic crack + delayed echo tail */
export function playGunshotSniper(): void {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;

  // Initial sharp supersonic crack (very high frequency)
  const crack = makeNoise(ctx, 0.03, 6);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(5000, now);
  hp.frequency.exponentialRampToValueAtTime(2000, now + 0.02);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.4, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
  crack.connect(hp);
  hp.connect(g);
  g.connect(ctx.destination);
  crack.start(now);
  crack.stop(now + 0.03);

  // Main body — mid noise with heavy punch
  const body = makeNoise(ctx, 0.12, 3);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(1000, now);
  bp.frequency.exponentialRampToValueAtTime(200, now + 0.1);
  bp.Q.value = 0.8;
  const dist = makeDistortion(ctx, 25);
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0.4, now);
  bg.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  body.connect(bp);
  bp.connect(dist);
  dist.connect(bg);
  bg.connect(ctx.destination);
  body.start(now);
  body.stop(now + 0.12);

  // Deep bass thump
  const bass = ctx.createOscillator();
  bass.frequency.setValueAtTime(120, now);
  bass.frequency.exponentialRampToValueAtTime(30, now + 0.1);
  const bassG = ctx.createGain();
  bassG.gain.setValueAtTime(0.45, now);
  bassG.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  bass.connect(bassG);
  bassG.connect(ctx.destination);
  bass.start(now);
  bass.stop(now + 0.14);

  // Delayed echo/reverb tail (offset by 0.06s)
  const echo = makeNoise(ctx, 0.2, 2);
  const echoBp = ctx.createBiquadFilter();
  echoBp.type = 'bandpass';
  echoBp.frequency.setValueAtTime(400, now + 0.06);
  echoBp.frequency.exponentialRampToValueAtTime(100, now + 0.25);
  echoBp.Q.value = 0.5;
  const eg = ctx.createGain();
  eg.gain.setValueAtTime(0, now);
  eg.gain.setValueAtTime(0.15, now + 0.06);
  eg.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
  echo.connect(echoBp);
  echoBp.connect(eg);
  eg.connect(ctx.destination);
  echo.start(now + 0.06);
  echo.stop(now + 0.28);
}

/** Play gunshot by weapon type (player weapons) */
export function playGunshotWeapon(type: WeaponSoundType): void {
  switch (type) {
    case 'pistol': playGunshotPistol(); break;
    case 'rifle': playGunshotRifle(); break;
    case 'shotgun': playGunshotShotgun(); break;
    case 'sniper': playGunshotSniper(); break;
  }
}

/** Legacy: single generic gunshot (e.g. for enemy fire). */
export function playGunshot(): void {
  playGunshotRifle();
}

/** Procedural empty click (dry fire) */
export function playDryFire(): void {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(1200, now);
  osc.frequency.exponentialRampToValueAtTime(600, now + 0.03);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.05);
}

/** Procedural reload sound (mechanical click-clack) */
export function playReload(): void {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;

  // Magazine out (click)
  const click1 = ctx.createOscillator();
  click1.frequency.setValueAtTime(3000, now + 0.1);
  click1.frequency.exponentialRampToValueAtTime(800, now + 0.13);
  const g1 = ctx.createGain();
  g1.gain.setValueAtTime(0, now);
  g1.gain.setValueAtTime(0.2, now + 0.1);
  g1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  click1.connect(g1);
  g1.connect(ctx.destination);
  click1.start(now);
  click1.stop(now + 0.2);

  // Magazine in (heavier click)
  const click2 = ctx.createOscillator();
  click2.frequency.setValueAtTime(2000, now + 0.7);
  click2.frequency.exponentialRampToValueAtTime(500, now + 0.73);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0, now);
  g2.gain.setValueAtTime(0.25, now + 0.7);
  g2.gain.exponentialRampToValueAtTime(0.001, now + 0.78);
  click2.connect(g2);
  g2.connect(ctx.destination);
  click2.start(now);
  click2.stop(now + 0.8);

  // Slide rack
  const bufferSize = ctx.sampleRate * 0.06;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2) * 0.3;
  }
  const slide = ctx.createBufferSource();
  slide.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 2000;
  const g3 = ctx.createGain();
  g3.gain.setValueAtTime(0, now);
  g3.gain.setValueAtTime(0.3, now + 0.95);
  g3.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
  slide.connect(filter);
  filter.connect(g3);
  g3.connect(ctx.destination);
  slide.start(now + 0.95);
  slide.stop(now + 1.05);
}
