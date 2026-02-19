/**
 * Config for custom quickplay arena assets.
 * Allows custom naming for HDRI, skybox, environment GLB, and time-of-day presets.
 */

export interface QuickplayPreset {
  hdri?: string;
  skybox?: string;
}

/** Pickup placement — x/z relative to layout center; y derived from raycast at runtime. */
export interface QuickplayPickupDef {
  type: string;
  x: number;
  z: number;
  amount?: number;
  keyId?: string;
}

/** Prop placement — x/z relative to layout center; y = ground + yOffset. */
export interface QuickplayPropDef {
  type: 'crate' | 'crate_metal' | 'barrel';
  x: number;
  z: number;
  /** Size (w,h,d) for crates; ignored for barrels. Default [1,1,1]. */
  size?: [number, number, number];
  /** Vertical offset above ground (e.g. 0.5 = half above terrain). Default 0.5 for crates, 0.6 for barrels. */
  yOffset?: number;
  scale?: number;
}

/** Lab prop (tank, tube) — x/z relative to layout center; y derived from raycast. */
export interface QuickplayLabPropDef {
  type: 'tank' | 'tube';
  x: number;
  z: number;
  seed?: number;
  scale?: number;
  hueHint?: number;
}

export interface QuickplayConfig {
  /** Environment GLB filename. Default: environment.glb */
  environment?: string;
  /** HDRI for lighting/reflections. Default: environment.hdr */
  hdri?: string;
  /** Skybox image for background. Default: skybox.jpg */
  skybox?: string;
  /** Day skybox for day/night cycling. When set with nightSkybox, these JPGs are used for the visible sky (HDRI only for lighting). */
  daySkybox?: string;
  /** Night skybox for day/night cycling. */
  nightSkybox?: string;
  /** Skybox rotation offset 0–1. Add to time to align sky with sun. Try 0.5 if sun/sky mismatch. */
  skyboxRotationOffset?: number;
  /** Scale factor for sky dome meshes in GLB. Larger = further horizon. Default: 5 */
  skyDomeScale?: number;
  /** Presets for time of day or other variants (e.g. day, night, sunset). */
  presets?: Record<string, QuickplayPreset>;
  /** Active preset name. Uses presets[preset] if set. */
  preset?: string;
  /** Pickups: x/z relative to layout center (bbox). Y derived from raycast. Omit to use defaults. */
  pickups?: QuickplayPickupDef[];
  /** Props (crates, barrels): x/z relative to layout center. Y = ground + yOffset. Omit to use defaults. */
  props?: QuickplayPropDef[];
  /** Lab props (glass tanks, tubes with glowing fluid). X/z relative to center; y from raycast. */
  labProps?: QuickplayLabPropDef[];
}

const DEFAULT_ENVIRONMENT = 'environment.glb';
const DEFAULT_HDRI = 'environment.hdr';
const DEFAULT_SKYBOX = 'skybox.jpg';

export interface QuickplayResolvedConfig {
  environment: string;
  hdri: string;
  skybox: string;
  skyDomeScale: number;
  /** Day skybox for day/night cycling. If set with nightSkybox, sky rotates between them. */
  daySkybox?: string;
  /** Night skybox for day/night cycling. */
  nightSkybox?: string;
  /** Skybox rotation offset 0–1. */
  skyboxRotationOffset: number;
  /** Optional pickup placements (overrides defaults when set). */
  pickups?: QuickplayPickupDef[];
  /** Optional prop placements (overrides defaults when set). */
  props?: QuickplayPropDef[];
  /** Optional lab prop placements (tanks, tubes). */
  labProps?: QuickplayLabPropDef[];
}

/**
 * Load quickplay config from public/maps/quickplay/config.json.
 * Returns defaults when config is missing or invalid.
 * @param baseUrl - Base URL for assets (e.g. /maps/quickplay/)
 * @param presetOverride - Optional preset name to use (e.g. from UI). Overrides config.preset.
 */
export async function loadQuickplayConfig(
  baseUrl: string,
  presetOverride?: string,
): Promise<QuickplayResolvedConfig> {
  const defaults: QuickplayResolvedConfig = {
    environment: DEFAULT_ENVIRONMENT,
    hdri: DEFAULT_HDRI,
    skybox: DEFAULT_SKYBOX,
    skyDomeScale: 5,
    skyboxRotationOffset: 0,
  };

  try {
    const res = await fetch(`${baseUrl}config.json`, { cache: 'no-cache' });
    if (!res.ok || res.headers.get('content-type')?.includes('text/html')) {
      return defaults;
    }
    const raw = (await res.json()) as QuickplayConfig;
    if (!raw || typeof raw !== 'object') return defaults;

    let hdri = raw.hdri ?? defaults.hdri;
    let skybox = raw.skybox ?? defaults.skybox;
    const presetName = presetOverride ?? raw.preset;

    if (presetName && raw.presets?.[presetName]) {
      const p = raw.presets[presetName];
      if (p.hdri) hdri = p.hdri;
      if (p.skybox) skybox = p.skybox;
    }

    // Day/night skybox URLs for rotating skyboxes (top-level or from presets)
    let daySkybox: string | undefined = raw.daySkybox;
    let nightSkybox: string | undefined = raw.nightSkybox;
    if (!daySkybox || !nightSkybox) {
      const dayPreset = raw.presets?.day;
      const nightPreset = raw.presets?.night;
      if (dayPreset?.skybox && nightPreset?.skybox) {
        daySkybox = dayPreset.skybox;
        nightSkybox = nightPreset.skybox;
      }
    }

    return {
      environment: raw.environment ?? defaults.environment,
      hdri,
      skybox,
      skyDomeScale: typeof raw.skyDomeScale === 'number' ? raw.skyDomeScale : defaults.skyDomeScale,
      daySkybox,
      nightSkybox,
      skyboxRotationOffset: Math.max(0, Math.min(1, raw.skyboxRotationOffset ?? 0)),
      pickups: Array.isArray(raw.pickups) ? raw.pickups : undefined,
      props: Array.isArray(raw.props) ? raw.props : undefined,
      labProps: Array.isArray(raw.labProps) ? raw.labProps : undefined,
    };
  } catch {
    return defaults;
  }
}
