/**
 * Look sensitivity settings. Persists to localStorage.
 * Values are 0–100; converted to actual sensitivity per input type.
 */

const STORAGE_KEY = '007remix_sensitivity';

export interface SensitivityValues {
  /** 0–100: mouse look (scaled to ~0.0005–0.004) */
  mouse: number;
  /** 0–100: gamepad right stick (scaled to ~30–200) */
  gamepad: number;
  /** 0–100: mobile touch-drag look (scaled to ~0.3–2.5) */
  mobile: number;
}

const DEFAULTS: SensitivityValues = {
  mouse: 50,
  gamepad: 35,
  mobile: 50,
};

function load(): SensitivityValues {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SensitivityValues>;
      return {
        mouse: clamp(parsed.mouse ?? DEFAULTS.mouse, 0, 100),
        gamepad: clamp(parsed.gamepad ?? DEFAULTS.gamepad, 0, 100),
        mobile: clamp(parsed.mobile ?? DEFAULTS.mobile, 0, 100),
      };
    }
  } catch (_) {}
  return { ...DEFAULTS };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

let cache = load();

export const SensitivitySettings = {
  get(): SensitivityValues {
    return { ...cache };
  },

  set(values: Partial<SensitivityValues>): void {
    if (values.mouse !== undefined) cache.mouse = clamp(values.mouse, 0, 100);
    if (values.gamepad !== undefined) cache.gamepad = clamp(values.gamepad, 0, 100);
    if (values.mobile !== undefined) cache.mobile = clamp(values.mobile, 0, 100);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch (_) {}
  },

  /** Mouse sensitivity for fps-camera: ~0.0005 at 0 to ~0.004 at 100 */
  getMouseSensitivity(): number {
    const n = cache.mouse / 100;
    return 0.0005 + n * 0.0035;
  },

  /** Gamepad right stick: ~30 at 0 to ~200 at 100 */
  getGamepadSensitivity(): number {
    const n = cache.gamepad / 100;
    return 30 + n * 170;
  },

  /** Mobile touch-drag: ~0.3 at 0 to ~2.5 at 100 */
  getMobileSensitivity(): number {
    const n = cache.mobile / 100;
    return 0.3 + n * 2.2;
  },
};
