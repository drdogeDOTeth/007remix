/**
 * Infinite Spy Theme Generator
 * Based on the original spy theme but with procedural variations that evolve over time
 */

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let compressor: DynamicsCompressorNode | null = null;
let playing = false;
let scheduleTimeout: number | null = null;
let currentBar = 0;
let startTime: number | null = null;

// Evolution state
const evolutionState = {
  bassVariant: 0,
  chordVariant: 0,
  melodicSeed: Math.random(),
  rhythmDrift: 0,
};

// Parameters
const params = {
  bpm: 173,
  key: 'B',
  variationAmount: 0.5,
  evolutionSpeed: 0.5,
  volume: 0.2,
};

const BPM = 173;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const EIGHTH = BEAT / 2;
const SWING = EIGHTH * 0.35;

// Note frequencies
const NOTE: Record<string, number> = {
  B2: 123.47,
  C3: 130.81,
  Cs3: 138.59,
  D3: 146.83,
  E3: 164.81,
  F3: 174.61,
  Fs3: 185.0,
  G3: 196.0,
  Gs3: 207.65,
  A3: 220.0,
  As3: 233.08,
  B3: 246.94,
  C4: 261.63,
  Cs4: 277.18,
  D4: 293.66,
  Ds4: 311.13,
  E4: 329.63,
  F4: 349.23,
  Fs4: 369.99,
  G4: 392.0,
  Gs4: 415.3,
  A4: 440.0,
  As4: 466.16,
  B4: 493.88,
  C5: 523.25,
  Cs5: 554.37,
  D5: 587.33,
  Ds5: 622.25,
  E5: 659.25,
  F5: 698.46,
  Fs5: 739.99,
  G5: 783.99,
  A5: 880.0,
  B5: 987.77,
  C6: 1046.5,
};

function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 12;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    masterGain = ctx.createGain();
    masterGain.gain.value = params.volume;
    masterGain.connect(compressor);
    compressor.connect(ctx.destination);
  }
  return ctx;
}

function noiseBuffer(seconds: number): AudioBuffer {
  const c = getCtx();
  const frames = Math.max(1, Math.floor(c.sampleRate * seconds));
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

// Evolve musical state
function evolveState(): void {
  const rate = params.evolutionSpeed * 0.1;
  evolutionState.bassVariant += (Math.random() - 0.5) * rate;
  evolutionState.chordVariant += (Math.random() - 0.5) * rate;
  evolutionState.rhythmDrift += (Math.random() - 0.5) * rate * 0.5;
  evolutionState.melodicSeed += rate * 0.1;

  // Keep bounded
  evolutionState.bassVariant = Math.max(-1, Math.min(1, evolutionState.bassVariant));
  evolutionState.chordVariant = Math.max(-1, Math.min(1, evolutionState.chordVariant));
  evolutionState.rhythmDrift = Math.max(-0.5, Math.min(0.5, evolutionState.rhythmDrift));
}

// Get evolved bass notes
function getBassNotes(): number[] {
  const root = NOTE.B2;
  const variation = params.variationAmount;
  const state = evolutionState.bassVariant;

  const basePattern = [1, 1.059, 1.122, 1.059, 1]; // B, C, C#, C, B

  return basePattern.map((ratio) => {
    let freq = root * ratio;

    if (variation > 0.3 && Math.random() < variation * 0.2) {
      // Occasional octave jumps
      if (Math.random() > 0.5 && state > 0) freq *= 2;
    }

    // Micro-tuning
    freq *= 1 + (Math.random() - 0.5) * 0.02 * variation;

    return freq;
  });
}

// Get evolved chord progression
function getChordProgression(): number[][] {
  const variation = params.variationAmount;

  const baseChords = [
    [NOTE.E3, NOTE.G3, NOTE.B3, NOTE.Fs4], // Em(add9)
    [NOTE.C3, NOTE.E3, NOTE.G3, NOTE.Fs4], // C(add#11)
    [NOTE.Cs3, NOTE.E3, NOTE.G3, NOTE.A3], // C#dim
  ];

  return baseChords.map((chord) =>
    chord.map((freq) => {
      let f = freq;

      // Harmonic variations
      if (variation > 0.4 && Math.random() < variation * 0.15) {
        f *= Math.random() > 0.5 ? 1.05946 : 0.94387; // ±semitone
      }

      // Subtle detuning
      f *= 1 + (Math.random() - 0.5) * 0.08 * variation;

      return f;
    }),
  );
}

// Get evolved mallet pattern
function getMalletPattern(): Array<{ time: number; freq: number }> {
  const root = NOTE.B4;
  const variation = params.variationAmount;

  const baseRatios = [1.26, 1.19, 1.122, 1.06, 1.0, 0.94, 0.89, 0.84, 0.79];
  const baseTimes = [
    0,
    EIGHTH * 3,
    EIGHTH * 5,
    BAR + EIGHTH,
    BAR + EIGHTH * 4,
    BAR * 2,
    BAR * 2 + EIGHTH * 2,
    BAR * 2 + EIGHTH * 5,
    BAR * 3,
  ];

  const pattern: Array<{ time: number; freq: number }> = [];

  for (let i = 0; i < baseRatios.length; i++) {
    // Sometimes skip notes
    if (Math.random() > variation * 0.3) {
      let freq = root * baseRatios[i];
      let time = baseTimes[i];

      // Melodic variations
      if (variation > 0.5 && Math.random() < 0.3) {
        const interval = [0.94387, 1, 1.05946][Math.floor(Math.random() * 3)];
        freq *= interval;
      }

      // Rhythmic variations
      if (variation > 0.6 && Math.random() < 0.2) {
        time += (Math.random() - 0.5) * EIGHTH * 0.5;
      }

      pattern.push({ time, freq });
    }
  }

  // Occasionally add extra notes
  if (variation > 0.7 && Math.random() < 0.3) {
    pattern.push({
      time: Math.random() * BAR * 4,
      freq: root * (0.8 + Math.random() * 0.6),
    });
  }

  return pattern;
}

// Instrument implementations
const play = {
  bass(freq: number, t0: number, dur: number, vol: number): void {
    const c = getCtx();
    const detune = (Math.random() - 0.5) * 15;

    for (let i = 0; i < 3; i++) {
      const osc = c.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.detune.value = detune + (Math.random() - 0.5) * 5;

      const sub = c.createOscillator();
      sub.type = 'sine';
      sub.frequency.value = freq / 2;
      sub.detune.value = detune;

      const flt = c.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.setValueAtTime(800 + Math.random() * 200, t0);
      flt.frequency.exponentialRampToValueAtTime(200, t0 + 0.3);
      flt.Q.value = 0.7;

      const env = c.createGain();
      env.gain.setValueAtTime(vol / 3, t0);
      env.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

      osc.connect(flt);
      sub.connect(flt);
      flt.connect(env);
      env.connect(masterGain!);

      osc.start(t0);
      sub.start(t0);
      osc.stop(t0 + dur);
      sub.stop(t0 + dur);
    }
  },

  kick(t0: number): void {
    const c = getCtx();
    const osc = c.createOscillator();
    const pitchVar = (Math.random() - 0.5) * 10;
    osc.frequency.setValueAtTime(120 + pitchVar, t0);
    osc.frequency.exponentialRampToValueAtTime(28, t0 + 0.06);

    const env = c.createGain();
    env.gain.setValueAtTime(0.7, t0);
    env.gain.exponentialRampToValueAtTime(0.01, t0 + 0.1);

    osc.connect(env);
    env.connect(masterGain!);

    osc.start(t0);
    osc.stop(t0 + 0.12);
  },

  snare(t0: number, intensity = 1.0): void {
    const c = getCtx();

    // Noise body
    const noise = c.createBufferSource();
    noise.buffer = noiseBuffer(0.15);

    const tone = c.createOscillator();
    tone.frequency.setValueAtTime(180 + Math.random() * 20, t0);
    tone.frequency.exponentialRampToValueAtTime(80, t0 + 0.08);

    const flt = c.createBiquadFilter();
    flt.type = 'highpass';
    flt.frequency.value = 1500;

    const flt2 = c.createBiquadFilter();
    flt2.type = 'bandpass';
    flt2.frequency.value = 200;
    flt2.Q.value = 1;

    const env = c.createGain();
    env.gain.setValueAtTime(0.4 * intensity, t0);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + 0.15);

    const toneEnv = c.createGain();
    toneEnv.gain.setValueAtTime(0.15 * intensity, t0);
    toneEnv.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08);

    noise.connect(flt);
    flt.connect(env);
    tone.connect(flt2);
    flt2.connect(toneEnv);

    env.connect(masterGain!);
    toneEnv.connect(masterGain!);

    noise.start(t0);
    tone.start(t0);
    tone.stop(t0 + 0.1);
  },

  hiHat(t0: number, intensity = 1.0): void {
    const c = getCtx();
    const noise = c.createBufferSource();
    noise.buffer = noiseBuffer(0.05);

    const flt = c.createBiquadFilter();
    flt.type = 'highpass';
    flt.frequency.value = 6000 + Math.random() * 1000;

    const env = c.createGain();
    const vol = (0.05 + Math.random() * 0.02) * intensity;
    env.gain.setValueAtTime(vol, t0);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);

    noise.connect(flt);
    flt.connect(env);
    env.connect(masterGain!);

    noise.start(t0);
  },

  mallet(freq: number, t0: number, vol: number): void {
    const c = getCtx();
    const detune = (Math.random() - 0.5) * 10;

    const carrier = c.createOscillator();
    carrier.type = 'triangle';
    carrier.frequency.value = freq;
    carrier.detune.value = detune;

    const modulator = c.createOscillator();
    modulator.frequency.value = freq * 3.5;
    modulator.detune.value = detune;

    const modGain = c.createGain();
    modGain.gain.value = freq * 2;

    const env = c.createGain();
    env.gain.setValueAtTime(vol, t0);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4);

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(env);
    env.connect(masterGain!);

    carrier.start(t0);
    modulator.start(t0);
    carrier.stop(t0 + 0.5);
    modulator.stop(t0 + 0.5);
  },

  stringPad(freqs: number[], t0: number, dur: number, vol: number): void {
    const c = getCtx();

    freqs.forEach((freq) => {
      const detunes = [-12, -8, -4, 0, 4, 8, 12];

      detunes.forEach((cents) => {
        const osc = c.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq * Math.pow(2, cents / 1200);
        osc.detune.value = (Math.random() - 0.5) * 8;

        const flt = c.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.setValueAtTime(900, t0);
        flt.frequency.linearRampToValueAtTime(400, t0 + dur);
        flt.Q.value = 0.5;

        const env = c.createGain();
        env.gain.setValueAtTime(0, t0);
        env.gain.linearRampToValueAtTime(vol / detunes.length, t0 + 0.1);

        osc.connect(flt);
        flt.connect(env);
        env.connect(masterGain!);

        osc.start(t0);
        osc.stop(t0 + dur);
      });
    });
  },
};

// Generate one 4-bar section
function generateSection(t: number): void {
  // Evolve the musical state
  evolveState();

  // Bass
  const bassNotes = getBassNotes();
  bassNotes.forEach((freq, i) => {
    play.bass(freq, t + i * BAR, BAR * 0.9, 0.15);
  });

  // Drums
  for (let bar = 0; bar < 4; bar++) {
    const bt = t + bar * BAR;

    // Occasionally skip kicks for variation
    if (Math.random() > params.variationAmount * 0.2) {
      play.kick(bt);
      play.kick(bt + BEAT * 2);
    }

    play.snare(bt + BEAT, 1.0);
    play.snare(bt + BEAT * 3, 1.0);
  }

  // Hi-hats
  for (let i = 0; i < 32; i++) {
    if (Math.random() > params.variationAmount * 0.1) {
      const offset = i % 2 === 1 ? SWING : 0;
      play.hiHat(t + i * EIGHTH + offset, 1.0);
    }
  }

  // Mallet riff
  const malletPattern = getMalletPattern();
  malletPattern.forEach((note) => {
    play.mallet(note.freq, t + note.time, 0.08);
  });

  // String pad (every 2 bars)
  const chords = getChordProgression();
  chords.forEach((chord, i) => {
    play.stringPad(chord, t + i * BAR * 1.4, BAR * 1.4, 0.025);
  });

  currentBar += 4;
}

function scheduleNext(): void {
  if (!playing) return;

  const c = getCtx();
  const now = c.currentTime;
  generateSection(now + 0.1);

  const loopDuration = BAR * 4;
  scheduleTimeout = window.setTimeout(scheduleNext, loopDuration * 1000);
}

export function startMusic(): void {
  if (playing) return;

  const c = getCtx();
  if (c.state === 'suspended') c.resume();

  playing = true;
  startTime = Date.now();
  currentBar = 0;

  // Reset evolution state
  evolutionState.bassVariant = 0;
  evolutionState.chordVariant = 0;
  evolutionState.melodicSeed = Math.random();
  evolutionState.rhythmDrift = 0;

  scheduleNext();
}

export function stopMusic(): void {
  playing = false;
  if (scheduleTimeout !== null) {
    clearTimeout(scheduleTimeout);
    scheduleTimeout = null;
  }

  if (masterGain && ctx) {
    masterGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    setTimeout(() => {
      if (masterGain) masterGain.gain.value = params.volume;
    }, 600);
  }
}

export function setMusicVolume(vol: number): void {
  params.volume = Math.max(0, Math.min(1, vol));
  if (masterGain) {
    masterGain.gain.setValueAtTime(params.volume, getCtx().currentTime);
  }
}

export function isMusicPlaying(): boolean {
  return playing;
}
