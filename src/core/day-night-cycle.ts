/**
 * Day/night cycle for custom quickplay.
 * Uses proper solar azimuth/elevation (latitude, declination) and phased intensity.
 * Based on EXAMPLES/daynightcycle.js approach.
 */

import * as THREE from 'three';

/** Latitude in radians (e.g. 35°N Mojave/wasteland) */
const LATITUDE = 35 * (Math.PI / 180);
/** Solar declination in radians. -18° = lower sun path, longer shadows (winter-like). */
const DECLINATION = -18 * (Math.PI / 180);
/** Azimuth offset in radians (east-west bias) */
const AZIMUTH_OFFSET = 5 * (Math.PI / 180);

const DAWN_START = 5;
const SUNRISE = 6;
const NOON = 12;
const SUNSET = 18;
const DUSK_END = 19;

/**
 * Compute solar position from time of day.
 * Returns direction vector TO the sun (for positioning directional light).
 * Uses hour angle for proper east→south→west arc (Three.js: +X=North, +Z=East, +Y=Up).
 */
function calculateSolarPosition(hour24: number): THREE.Vector3 {
  const time = (hour24 % 24) / 24;
  const hourAngle = time * 2 * Math.PI - Math.PI;

  const sinLat = Math.sin(LATITUDE);
  const cosLat = Math.cos(LATITUDE);
  const sinDec = Math.sin(DECLINATION);
  const cosDec = Math.cos(DECLINATION);
  const cosHA = Math.cos(hourAngle);
  const sinHA = Math.sin(hourAngle);

  const elevation = Math.asin(
    sinLat * sinDec + cosLat * cosDec * cosHA,
  );

  const cosElev = Math.cos(elevation);

  const offset = AZIMUTH_OFFSET;
  const x = -Math.cos(hourAngle + offset) * cosElev;
  const y = Math.sin(elevation);
  const z = -Math.sin(hourAngle + offset) * cosElev;

  return new THREE.Vector3(x, y, z);
}

/**
 * Compute sun intensity from hour (0-24) with dawn/sunrise/noon/sunset/dusk phases.
 */
function calculateSunIntensity(hour24: number): number {
  const h = hour24 % 24;

  if (h < DAWN_START) return 0.15;
  if (h < SUNRISE) {
    const p = (h - DAWN_START) / (SUNRISE - DAWN_START);
    return 0.15 + 0.85 * p;
  }
  if (h < NOON) {
    const p = (h - SUNRISE) / (NOON - SUNRISE);
    return 1.0 + 0.8 * p;
  }
  if (h < SUNSET) {
    const p = (h - NOON) / (SUNSET - NOON);
    return 1.8 - 0.8 * p;
  }
  if (h < DUSK_END) {
    const p = (h - SUNSET) / (DUSK_END - SUNSET);
    return 1.0 - 0.85 * p;
  }
  return 0.15;
}

/**
 * Compute sun color (warmer at dawn/dusk, neutral at noon).
 */
function calculateSunColor(hour24: number, sunHeight: number): THREE.Color {
  const h = hour24 % 24;
  const isDawnDusk =
    (h >= DAWN_START && h < SUNRISE) || (h >= SUNSET && h < DUSK_END);
  const warmth = isDawnDusk
    ? 0.7
    : Math.max(0, sunHeight * 0.5);

  const color = new THREE.Color();
  color.setRGB(
    1,
    0.95 - (1 - warmth) * 0.3,
    0.9 - (1 - warmth) * 0.5,
  );
  return color;
}

const DAWN_START_H = 5;
const DAWN_END_H = 7;
const DUSK_START_H = 17;
const DUSK_END_H = 19;

/**
 * Which skybox to show based on time.
 * Mirrors EXAMPLES/daynightcycle.js: day 7–17, night <5 or ≥19, dawn/dusk transitions at midpoint.
 */
export function getSkyboxMode(t: number): 'day' | 'night' {
  t = ((t % 1) + 1) % 1;
  const hour24 = t * 24;

  if (hour24 >= DAWN_END_H && hour24 < DUSK_START_H) return 'day';
  if (hour24 < DAWN_START_H || hour24 >= DUSK_END_H) return 'night';

  if (hour24 >= DAWN_START_H && hour24 < DAWN_END_H) {
    const progress = (hour24 - DAWN_START_H) / (DAWN_END_H - DAWN_START_H);
    return progress < 0.5 ? 'night' : 'day';
  }
  // Dusk
  const progress = (hour24 - DUSK_START_H) / (DUSK_END_H - DUSK_START_H);
  return progress < 0.5 ? 'day' : 'night';
}

/** Time 0 = midnight, 0.25 = 6am, 0.5 = noon, 0.75 = 6pm, 1 = midnight */
export function getSunState(t: number): {
  position: THREE.Vector3;
  color: THREE.Color;
  intensity: number;
  hemiSkyColor: THREE.Color;
  hemiGroundColor: THREE.Color;
  ambientIntensity: number;
  backgroundIntensity: number;
  envIntensity: number;
} {
  const hemiSky = new THREE.Color();
  const hemiGround = new THREE.Color();

  t = ((t % 1) + 1) % 1;
  const hour24 = t * 24;

  const sunDir = calculateSolarPosition(hour24);
  const sunHeight = sunDir.y;
  const pos = sunDir.multiplyScalar(300);

  const timeBasedIntensity = calculateSunIntensity(hour24);
  const heightFactor = Math.max(0.1, (sunHeight + 1) / 2);
  const intensity = timeBasedIntensity * heightFactor;

  const color = calculateSunColor(hour24, sunHeight);

  const isDay = hour24 >= SUNRISE && hour24 < SUNSET;
  const isDawnDusk =
    (hour24 >= DAWN_START && hour24 < SUNRISE) ||
    (hour24 >= SUNSET && hour24 < DUSK_END);

  if (isDay) {
    const noonProgress = (hour24 - SUNRISE) / (SUNSET - SUNRISE);
    const arc = Math.sin(noonProgress * Math.PI);
    hemiSky.setRGB(
      0.4 + 0.5 * arc,
      0.5 + 0.4 * arc,
      0.9,
    );
    hemiGround.setRGB(0.3, 0.25, 0.2);
  } else if (isDawnDusk) {
    const p = hour24 < SUNRISE
      ? (hour24 - DAWN_START) / (SUNRISE - DAWN_START)
      : (hour24 - SUNSET) / (DUSK_END - SUNSET);
    hemiSky.setRGB(0.3 + 0.4 * p, 0.25 + 0.35 * p, 0.5 + 0.4 * p);
    hemiGround.setRGB(0.15, 0.12, 0.1);
  } else {
    // Deep night — moonlit blue-grey, not pitch black
    hemiSky.setRGB(0.10, 0.12, 0.22);
    hemiGround.setRGB(0.04, 0.04, 0.08);
  }

  // Night ambient: smoothly ramp up from 0 toward midnight so it's never pitch black.
  // Uses |sunHeight| so it rises as the sun goes deeper below the horizon.
  const nightRamp = isDay ? 0 : isDawnDusk ? 0 : Math.min(1, Math.abs(sunHeight) * 1.8);

  const ambientIntensity = isDay
    ? 0.15 + sunHeight * 0.1
    : isDawnDusk
      ? 0.10
      : 0.10 + nightRamp * 0.18; // 0.10 right after dusk → 0.28 at midnight

  const backgroundIntensity = isDay
    ? 0.7 + sunHeight * 0.3
    : isDawnDusk
      ? 0.45
      : 0.35 + nightRamp * 0.20; // 0.35 right after dusk → 0.55 at midnight

  const envIntensity = isDay
    ? 0.6 + sunHeight * 0.4
    : isDawnDusk
      ? 0.45
      : 0.40 + nightRamp * 0.20; // 0.40 right after dusk → 0.60 at midnight

  return {
    position: pos,
    color,
    intensity,
    hemiSkyColor: hemiSky,
    hemiGroundColor: hemiGround,
    ambientIntensity,
    backgroundIntensity,
    envIntensity,
  };
}
