/**
 * Plasma accent material — animated electric vein patterns for weapon skins.
 * Features branching lightning, noise-driven plasma veins, and pulsing energy glow.
 * Uses onBeforeCompile for performance (reuses MeshStandardMaterial pipeline).
 */
import * as THREE from 'three';

/** Plasma accent colors (cyan/electric blue sci-fi palette) */
const PLASMA_COLOR_A = new THREE.Color(0x00d4ff);  // Cyan core
const PLASMA_COLOR_B = new THREE.Color(0x4488ff);  // Blue mid
const PLASMA_COLOR_C = new THREE.Color(0xaa00ff);  // Magenta accent

// GLSL function declarations (injected at top of fragment shader)
const PLASMA_FUNCTIONS = /* glsl */ `
// ── Hash-based noise (no texture lookups) ──
float plasmaHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float plasmaNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = plasmaHash(i);
  float b = plasmaHash(i + vec2(1.0, 0.0));
  float c = plasmaHash(i + vec2(0.0, 1.0));
  float d = plasmaHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float plasmaFbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += amp * plasmaNoise(p);
    p = rot * p * 2.1;
    amp *= 0.5;
  }
  return v;
}

float plasmaVeins(vec2 uv, float t) {
  vec2 q = vec2(
    plasmaFbm(uv * 3.0 + vec2(0.0, t * 0.4)),
    plasmaFbm(uv * 3.0 + vec2(5.2, t * 0.3 + 1.3))
  );
  vec2 r = vec2(
    plasmaFbm(uv * 3.0 + q * 4.0 + vec2(1.7, t * 0.5 + 9.2)),
    plasmaFbm(uv * 3.0 + q * 4.0 + vec2(8.3, t * 0.35 + 2.8))
  );
  float f = plasmaFbm(uv * 3.0 + r * 2.0);
  float veins = abs(f - 0.5) * 2.0;
  veins = 1.0 - veins;
  veins = smoothstep(0.4, 0.95, veins);
  veins = pow(veins, 1.5);
  return veins;
}

float plasmaArc(vec2 uv, float t, float seed) {
  float y = uv.y * 6.0 + seed * 10.0;
  float centerX = 0.5 + sin(y * 0.8 + t * 3.0 + seed * 6.28) * 0.3;
  centerX += plasmaNoise(vec2(y * 0.5, t * 2.0 + seed * 4.0)) * 0.25 - 0.125;
  float dist = abs(uv.x - centerX);
  float arc = exp(-dist * 40.0);
  arc *= 0.5 + 0.5 * sin(t * 12.0 + seed * 20.0 + y * 2.0);
  return arc;
}
`;

// Main plasma effect code (injected in fragment shader body)
const PLASMA_MAIN = /* glsl */ `
{
  vec2 pUv = vMapUv;
  float veins = plasmaVeins(pUv, plasmaTime);
  float veins2 = plasmaVeins(pUv * 2.5 + vec2(3.7, 1.2), plasmaTime * 0.8 + 2.0);
  veins2 *= 0.4;
  float arcs = 0.0;
  arcs += plasmaArc(pUv, plasmaTime, 0.0) * 0.7;
  arcs += plasmaArc(pUv, plasmaTime * 1.1, 0.33) * 0.5;
  arcs += plasmaArc(pUv, plasmaTime * 0.9, 0.66) * 0.4;
  float hotSpots = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 center = vec2(
      0.3 + 0.4 * sin(plasmaTime * 0.5 + fi * 2.1),
      0.3 + 0.4 * cos(plasmaTime * 0.4 + fi * 1.7)
    );
    float d = length(pUv - center);
    float pulse = 0.6 + 0.4 * sin(plasmaTime * 3.0 + fi * 4.2);
    hotSpots += exp(-d * 12.0) * pulse;
  }
  float totalPlasma = veins + veins2 + arcs * 0.6 + hotSpots * 0.3;
  totalPlasma = clamp(totalPlasma, 0.0, 1.0);
  float colorPhase = veins + sin(plasmaTime * 1.5 + pUv.x * 3.0) * 0.3;
  colorPhase = clamp(colorPhase, 0.0, 1.0);
  vec3 plasmaCol;
  if (colorPhase > 0.5) {
    plasmaCol = mix(plasmaColorB, plasmaColorA, (colorPhase - 0.5) * 2.0);
  } else {
    plasmaCol = mix(plasmaColorC, plasmaColorB, colorPhase * 2.0);
  }
  float coreGlow = smoothstep(0.6, 1.0, totalPlasma);
  plasmaCol = mix(plasmaCol, vec3(0.85, 0.95, 1.0), coreGlow * 0.6);
  totalEmissiveRadiance += plasmaCol * totalPlasma * 0.8;
  float darkening = 1.0 - totalPlasma * 0.3;
  diffuseColor.rgb *= darkening;
}
`;

/** Create a MeshStandardMaterial with animated plasma electric vein accents. */
export function createPlasmaAccentMaterial(
  baseMap: THREE.Texture | null,
  baseColor: THREE.Color,
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    map: baseMap,
    color: baseColor,
    roughness: 0.35,
    metalness: 0.92,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.plasmaTime = { value: 0 };
    shader.uniforms.plasmaColorA = { value: PLASMA_COLOR_A.clone() };
    shader.uniforms.plasmaColorB = { value: PLASMA_COLOR_B.clone() };
    shader.uniforms.plasmaColorC = { value: PLASMA_COLOR_C.clone() };
    (mat.userData as Record<string, unknown>).shader = shader;

    // Inject uniforms and function declarations at the top of fragment shader
    shader.fragmentShader =
      'uniform float plasmaTime;\nuniform vec3 plasmaColorA;\nuniform vec3 plasmaColorB;\nuniform vec3 plasmaColorC;\n' +
      PLASMA_FUNCTIONS + '\n' +
      shader.fragmentShader;

    // Inject main plasma code after emissive map fragment (where totalEmissiveRadiance is set)
    if (shader.fragmentShader.includes('totalEmissiveRadiance')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
${PLASMA_MAIN}`,
      );
    } else {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <output_fragment>',
        `${PLASMA_MAIN}
#include <output_fragment>`,
      );
    }
  };

  return mat;
}

/** Update plasma material time uniform (call each frame). */
export function updatePlasmaMaterial(material: THREE.Material, time: number): void {
  const shader = (material.userData as { shader?: { uniforms: { plasmaTime?: { value: number } } } }).shader;
  if (shader?.uniforms?.plasmaTime) {
    shader.uniforms.plasmaTime.value = time;
  }
}

/** Check if a material has plasma uniforms to update. */
export function isPlasmaMaterial(material: THREE.Material): boolean {
  return !!(material.userData as { shader?: { uniforms?: Record<string, unknown> } }).shader?.uniforms?.plasmaTime;
}
