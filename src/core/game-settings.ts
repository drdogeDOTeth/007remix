/**
 * Game settings: sensitivity, deadzone, volume.
 * Persists to localStorage.
 */

const STORAGE_KEY = '007remix_settings';

export type GamepadResponseCurve = 'linear' | 'exponential' | 'precision' | 'classic';

export type DifficultyLevel = 'easy' | 'normal' | 'hard';

export interface GameSettingsValues {
  mouseSens: number;
  gamepadSens: number;
  mobileSens: number;
  deadzoneLeft: number;
  deadzoneRight: number;
  gamepadResponseCurve: GamepadResponseCurve;
  gamepadSmoothing: number;
  gamepadLookYScale: number;
  scopeSensMult: number;
  aimAssistStrength: number;
  aimAssistMode: 'off' | 'slowdown' | 'pull';
  volumeMaster: number;
  volumeMusic: number;
  volumeSFX: number;
  // Difficulty & AI
  difficulty: DifficultyLevel;
  aiReactionTime: number;      // 0.5–3 s before engaging
  aiSightRange: number;        // 10–35 m
  aiFovScale: number;          // 50–150% (wider = more peripheral vision)
  aiHearingScale: number;      // 50–200% (gunshot/footstep range)
  aiGameStartGrace: number;    // 0–5 s before any enemy can target player
  // Day/night cycle (custom quickplay)
  dayNightCycle: boolean;      // enable cycle
  dayNightSpeed: number;       // 0=paused, 100=~24min per day, 200=~12min
  timeOfDay: number;           // 0–100, manual time when paused (0=midnight, 50=noon)
  dayNightIntensity: number;   // 0–200, sun/sky intensity multiplier (100=1.0)
  // Post-processing
  bloomEnabled: boolean;
  bloomStrength: number;       // 0–100 (stored as 0–100, actual 0–1.0)
  bloomRadius: number;         // 0–100 (stored as 0–100, actual 0–1.0)
  bloomThreshold: number;      // 0–100 (stored as 0–100, actual 0–1.0)
  exposure: number;            // 50–200 (stored as %, actual 0.5–2.0)
  shadowsEnabled: boolean;
  pixelMode: boolean;          // sprite-baker view pass
  pixelSize: number;           // 2–8 block size in screen pixels
  toneMapping: 'aces' | 'linear' | 'reinhard' | 'cineon';
}

const DEFAULTS: GameSettingsValues = {
  mouseSens: 50,
  gamepadSens: 25,
  mobileSens: 50,
  deadzoneLeft: 20,
  deadzoneRight: 20,
  gamepadResponseCurve: 'exponential',
  gamepadSmoothing: 35,
  gamepadLookYScale: 65,
  scopeSensMult: 100,
  aimAssistStrength: 0,
  aimAssistMode: 'off',
  volumeMaster: 100,
  volumeMusic: 80,
  volumeSFX: 100,
  difficulty: 'normal',
  aiReactionTime: 100,         // 1.0s (stored as 0–100 → 0.5–3s)
  aiSightRange: 20,            // 20 m
  aiFovScale: 100,             // 100%
  aiHearingScale: 100,         // 100%
  aiGameStartGrace: 200,       // 2.0s (stored as 0–100 → 0–5s)
  dayNightCycle: true,
  dayNightSpeed: 100,          // ~24 min per full day
  timeOfDay: 30,               // 7:12am default
  dayNightIntensity: 100,      // 1.0x
  // Post-processing
  bloomEnabled: true,
  bloomStrength: 15,           // 0.15 actual
  bloomRadius: 35,             // 0.35 actual
  bloomThreshold: 85,          // 0.85 actual
  exposure: 115,               // 1.15x actual
  shadowsEnabled: true,
  pixelMode: false,
  pixelSize: 4,
  toneMapping: 'aces',
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function load(): GameSettingsValues {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const legacy = localStorage.getItem('007remix_sensitivity');
      if (legacy) {
        const s = JSON.parse(legacy) as { mouse?: number; gamepad?: number; mobile?: number };
        raw = JSON.stringify({
          ...DEFAULTS,
          mouseSens: s.mouse ?? DEFAULTS.mouseSens,
          gamepadSens: s.gamepad ?? DEFAULTS.gamepadSens,
          mobileSens: s.mobile ?? DEFAULTS.mobileSens,
        });
        localStorage.setItem(STORAGE_KEY, raw);
      }
    }
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GameSettingsValues>;
      return {
        mouseSens: clamp(parsed.mouseSens ?? DEFAULTS.mouseSens, 0, 100),
        gamepadSens: clamp(parsed.gamepadSens ?? DEFAULTS.gamepadSens, 0, 100),
        mobileSens: clamp(parsed.mobileSens ?? DEFAULTS.mobileSens, 0, 100),
        deadzoneLeft: clamp(parsed.deadzoneLeft ?? DEFAULTS.deadzoneLeft, 0, 50),
        deadzoneRight: clamp(parsed.deadzoneRight ?? DEFAULTS.deadzoneRight, 0, 50),
        gamepadResponseCurve: (['linear', 'exponential', 'precision', 'classic'] as const).includes(parsed.gamepadResponseCurve as any)
          ? (parsed.gamepadResponseCurve as GamepadResponseCurve)
          : DEFAULTS.gamepadResponseCurve,
        gamepadSmoothing: clamp(parsed.gamepadSmoothing ?? DEFAULTS.gamepadSmoothing, 0, 100),
        gamepadLookYScale: clamp(parsed.gamepadLookYScale ?? DEFAULTS.gamepadLookYScale, 25, 150),
        scopeSensMult: clamp(parsed.scopeSensMult ?? DEFAULTS.scopeSensMult, 25, 150),
        aimAssistStrength: clamp(parsed.aimAssistStrength ?? DEFAULTS.aimAssistStrength, 0, 100),
        aimAssistMode: (['off', 'slowdown', 'pull'] as const).includes(parsed.aimAssistMode as any)
          ? (parsed.aimAssistMode as GameSettingsValues['aimAssistMode'])
          : DEFAULTS.aimAssistMode,
        volumeMaster: clamp(parsed.volumeMaster ?? DEFAULTS.volumeMaster, 0, 100),
        volumeMusic: clamp(parsed.volumeMusic ?? DEFAULTS.volumeMusic, 0, 100),
        volumeSFX: clamp(parsed.volumeSFX ?? DEFAULTS.volumeSFX, 0, 100),
        difficulty: (['easy', 'normal', 'hard'] as const).includes(parsed.difficulty as any) ? (parsed.difficulty as DifficultyLevel) : DEFAULTS.difficulty,
        aiReactionTime: clamp(parsed.aiReactionTime ?? DEFAULTS.aiReactionTime, 0, 100),
        aiSightRange: clamp(parsed.aiSightRange ?? DEFAULTS.aiSightRange, 10, 35),
        aiFovScale: clamp(parsed.aiFovScale ?? DEFAULTS.aiFovScale, 50, 150),
        aiHearingScale: clamp(parsed.aiHearingScale ?? DEFAULTS.aiHearingScale, 50, 200),
        aiGameStartGrace: clamp(parsed.aiGameStartGrace ?? DEFAULTS.aiGameStartGrace, 0, 100),
        dayNightCycle: parsed.dayNightCycle ?? DEFAULTS.dayNightCycle,
        dayNightSpeed: clamp(parsed.dayNightSpeed ?? DEFAULTS.dayNightSpeed, 0, 200),
        timeOfDay: clamp(parsed.timeOfDay ?? DEFAULTS.timeOfDay, 0, 100),
        dayNightIntensity: clamp(parsed.dayNightIntensity ?? DEFAULTS.dayNightIntensity, 0, 200),
        bloomEnabled: parsed.bloomEnabled ?? DEFAULTS.bloomEnabled,
        bloomStrength: clamp(parsed.bloomStrength ?? DEFAULTS.bloomStrength, 0, 100),
        bloomRadius: clamp(parsed.bloomRadius ?? DEFAULTS.bloomRadius, 0, 100),
        bloomThreshold: clamp(parsed.bloomThreshold ?? DEFAULTS.bloomThreshold, 0, 100),
        exposure: clamp(parsed.exposure ?? DEFAULTS.exposure, 50, 200),
        shadowsEnabled: parsed.shadowsEnabled ?? DEFAULTS.shadowsEnabled,
        pixelMode: parsed.pixelMode ?? DEFAULTS.pixelMode,
        pixelSize: clamp(parsed.pixelSize ?? DEFAULTS.pixelSize, 2, 8),
        toneMapping: (['aces', 'linear', 'reinhard', 'cineon'] as const).includes(parsed.toneMapping as any)
          ? (parsed.toneMapping as GameSettingsValues['toneMapping'])
          : DEFAULTS.toneMapping,
      };
    }
  } catch (_) {}
  return { ...DEFAULTS };
}

let cache = load();

export const GameSettings = {
  get(): GameSettingsValues {
    return { ...cache };
  },

  set(values: Partial<GameSettingsValues>): void {
    if (values.mouseSens !== undefined) cache.mouseSens = clamp(values.mouseSens, 0, 100);
    if (values.gamepadSens !== undefined) cache.gamepadSens = clamp(values.gamepadSens, 0, 100);
    if (values.mobileSens !== undefined) cache.mobileSens = clamp(values.mobileSens, 0, 100);
    if (values.deadzoneLeft !== undefined) cache.deadzoneLeft = clamp(values.deadzoneLeft, 0, 50);
    if (values.deadzoneRight !== undefined) cache.deadzoneRight = clamp(values.deadzoneRight, 0, 50);
    if (values.gamepadResponseCurve !== undefined) cache.gamepadResponseCurve = values.gamepadResponseCurve;
    if (values.gamepadSmoothing !== undefined) cache.gamepadSmoothing = clamp(values.gamepadSmoothing, 0, 100);
    if (values.gamepadLookYScale !== undefined) cache.gamepadLookYScale = clamp(values.gamepadLookYScale, 25, 150);
    if (values.scopeSensMult !== undefined) cache.scopeSensMult = clamp(values.scopeSensMult, 25, 150);
    if (values.aimAssistStrength !== undefined) cache.aimAssistStrength = clamp(values.aimAssistStrength, 0, 100);
    if (values.aimAssistMode !== undefined) cache.aimAssistMode = values.aimAssistMode;
    if (values.volumeMaster !== undefined) cache.volumeMaster = clamp(values.volumeMaster, 0, 100);
    if (values.volumeMusic !== undefined) cache.volumeMusic = clamp(values.volumeMusic, 0, 100);
    if (values.volumeSFX !== undefined) cache.volumeSFX = clamp(values.volumeSFX, 0, 100);
    if (values.difficulty !== undefined) cache.difficulty = values.difficulty;
    if (values.aiReactionTime !== undefined) cache.aiReactionTime = clamp(values.aiReactionTime, 0, 100);
    if (values.aiSightRange !== undefined) cache.aiSightRange = clamp(values.aiSightRange, 10, 35);
    if (values.aiFovScale !== undefined) cache.aiFovScale = clamp(values.aiFovScale, 50, 150);
    if (values.aiHearingScale !== undefined) cache.aiHearingScale = clamp(values.aiHearingScale, 50, 200);
    if (values.aiGameStartGrace !== undefined) cache.aiGameStartGrace = clamp(values.aiGameStartGrace, 0, 100);
    if (values.dayNightCycle !== undefined) cache.dayNightCycle = values.dayNightCycle;
    if (values.dayNightSpeed !== undefined) cache.dayNightSpeed = clamp(values.dayNightSpeed, 0, 200);
    if (values.timeOfDay !== undefined) cache.timeOfDay = clamp(values.timeOfDay, 0, 100);
    if (values.dayNightIntensity !== undefined) cache.dayNightIntensity = clamp(values.dayNightIntensity, 0, 200);
    if (values.bloomEnabled !== undefined) cache.bloomEnabled = values.bloomEnabled;
    if (values.bloomStrength !== undefined) cache.bloomStrength = clamp(values.bloomStrength, 0, 100);
    if (values.bloomRadius !== undefined) cache.bloomRadius = clamp(values.bloomRadius, 0, 100);
    if (values.bloomThreshold !== undefined) cache.bloomThreshold = clamp(values.bloomThreshold, 0, 100);
    if (values.exposure !== undefined) cache.exposure = clamp(values.exposure, 50, 200);
    if (values.shadowsEnabled !== undefined) cache.shadowsEnabled = values.shadowsEnabled;
    if (values.pixelMode !== undefined) cache.pixelMode = values.pixelMode;
    if (values.pixelSize !== undefined) cache.pixelSize = clamp(values.pixelSize, 2, 8);
    if (values.toneMapping !== undefined) cache.toneMapping = values.toneMapping;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch (_) {}
  },

  getMouseSensitivity(): number {
    const n = cache.mouseSens / 100;
    return 0.0005 + n * 0.0035;
  },
  getGamepadSensitivity(): number {
    const n = cache.gamepadSens / 100;
    return 6 + n * 54;
  },
  getGamepadResponseCurve(): GamepadResponseCurve {
    return cache.gamepadResponseCurve;
  },
  getGamepadSmoothing(): number {
    return cache.gamepadSmoothing / 100;
  },
  getGamepadLookYScale(): number {
    return cache.gamepadLookYScale / 100;
  },
  getScopeSensMult(): number {
    return cache.scopeSensMult / 100;
  },
  getAimAssistStrength(): number {
    return cache.aimAssistStrength / 100;
  },
  getAimAssistMode(): GameSettingsValues['aimAssistMode'] {
    return cache.aimAssistMode;
  },
  getMobileSensitivity(): number {
    const n = cache.mobileSens / 100;
    return 0.3 + n * 2.2;
  },
  getDeadzoneLeft(): number {
    return cache.deadzoneLeft / 100;
  },
  getDeadzoneRight(): number {
    return cache.deadzoneRight / 100;
  },
  getVolumeMaster(): number {
    return cache.volumeMaster / 100;
  },
  getVolumeMusic(): number {
    return cache.volumeMusic / 100;
  },
  getVolumeSFX(): number {
    return cache.volumeSFX / 100;
  },
  getDifficulty(): DifficultyLevel {
    return cache.difficulty;
  },
  getEnemyDamageMultiplier(): number {
    const d = cache.difficulty;
    if (d === 'easy') return 0.2;
    if (d === 'hard') return 1.4;
    return 1;
  },
  getAISightConfirmDuration(): number {
    const n = cache.aiReactionTime / 100;
    return 0.5 + n * 2.5;
  },
  getAISightRange(): number {
    return cache.aiSightRange;
  },
  getAIFovHalfAngle(): number {
    const scale = cache.aiFovScale / 100;
    return (75 * Math.PI) / 180 * scale;
  },
  getAIHearingGunshotRange(): number {
    return 25 * (cache.aiHearingScale / 100);
  },
  getAIHearingFootstepRange(): number {
    return 5 * (cache.aiHearingScale / 100);
  },
  getAIGameStartGrace(): number {
    return (cache.aiGameStartGrace / 100) * 5;
  },
  getDayNightCycle(): boolean {
    return cache.dayNightCycle;
  },
  getDayNightSpeed(): number {
    return cache.dayNightSpeed / 100; // 0–2x
  },
  getTimeOfDay(): number {
    return cache.timeOfDay / 100; // 0–1
  },
  getDayNightIntensity(): number {
    return cache.dayNightIntensity / 100; // 0–2 (100 = 1.0)
  },
  getBloomEnabled(): boolean { return cache.bloomEnabled; },
  getBloomStrength(): number { return cache.bloomStrength / 100; },
  getBloomRadius(): number { return cache.bloomRadius / 100; },
  getBloomThreshold(): number { return cache.bloomThreshold / 100; },
  getExposure(): number { return cache.exposure / 100; },
  getShadowsEnabled(): boolean { return cache.shadowsEnabled; },
  getPixelMode(): boolean { return cache.pixelMode; },
  getPixelSize(): number { return cache.pixelSize; },
  getToneMapping(): GameSettingsValues['toneMapping'] { return cache.toneMapping; },
};
