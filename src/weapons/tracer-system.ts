import * as THREE from 'three';

/**
 * Per-weapon tracer visual config.
 */
interface TracerConfig {
  length: number;       // metres — length of the visible streak
  speed: number;        // metres/second the tracer head travels
  coreColor: number;    // RGB hex — bright inner core
  glowColor: number;    // RGB hex — soft outer halo
  coreOpacity: number;  // peak opacity of the core
  glowWidth: number;    // world-space half-width of the glow (metres)
  coreWidth: number;    // world-space half-width of the core (metres)
  fadeMs: number;       // how long (ms) to fade after hitting target
}

const WEAPON_TRACER_CONFIG: Record<string, TracerConfig> = {
  'PP7':         { length: 1.4, speed:  80, coreColor: 0xfff8d0, glowColor: 0xffe060, coreOpacity: 0.90, coreWidth: 0.006, glowWidth: 0.028, fadeMs:  60 },
  'Pistol':      { length: 1.4, speed:  80, coreColor: 0xfff8d0, glowColor: 0xffe060, coreOpacity: 0.90, coreWidth: 0.006, glowWidth: 0.028, fadeMs:  60 },
  'KF7 Soviet':  { length: 2.4, speed: 120, coreColor: 0xfffff0, glowColor: 0xffe880, coreOpacity: 0.95, coreWidth: 0.006, glowWidth: 0.032, fadeMs:  70 },
  'Rifle':       { length: 2.4, speed: 120, coreColor: 0xfffff0, glowColor: 0xffe880, coreOpacity: 0.95, coreWidth: 0.006, glowWidth: 0.032, fadeMs:  70 },
  'Shotgun':     { length: 0.9, speed:  60, coreColor: 0xfff4cc, glowColor: 0xffcc22, coreOpacity: 0.80, coreWidth: 0.006, glowWidth: 0.028, fadeMs:  50 },
  'Sniper Rifle':{ length: 6.0, speed: 200, coreColor: 0xffffff, glowColor: 0x88ccff, coreOpacity: 1.00, coreWidth: 0.007, glowWidth: 0.040, fadeMs: 100 },
  'Sniper':      { length: 6.0, speed: 200, coreColor: 0xffffff, glowColor: 0x88ccff, coreOpacity: 1.00, coreWidth: 0.007, glowWidth: 0.040, fadeMs: 100 },
  'M134 Minigun':{ length: 2.0, speed: 130, coreColor: 0xffcc44, glowColor: 0xff5500, coreOpacity: 0.95, coreWidth: 0.006, glowWidth: 0.030, fadeMs:  65 },
  'Minigun':     { length: 2.0, speed: 130, coreColor: 0xffcc44, glowColor: 0xff5500, coreOpacity: 0.95, coreWidth: 0.006, glowWidth: 0.030, fadeMs:  65 },
};

const DEFAULT_CONFIG: TracerConfig = {
  length: 1.8, speed: 100, coreColor: 0xfffff0, glowColor: 0xffe880,
  coreOpacity: 0.90, coreWidth: 0.006, glowWidth: 0.028, fadeMs: 70,
};

// ── GLSL Shader ───────────────────────────────────────────────────────────────
// UV.x = 0 at tail, 1 at head (along the streak axis)
// UV.y = 0 at one edge, 1 at other edge (across the width)
//
// Radial falloff across width: brightest at centre (UV.y = 0.5), zero at edges.
// Slight taper at tail (UV.x = 0) for a sharp "nose" at the leading edge.
//
const TRACER_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TRACER_FRAG = /* glsl */`
  uniform vec3  uCoreColor;
  uniform vec3  uGlowColor;
  uniform float uOpacity;
  uniform float uCoreFrac;   // coreWidth / glowWidth — fraction of half-width that is "core"

  varying vec2 vUv;

  void main() {
    // vUv.y: 0 = left edge, 0.5 = centre, 1 = right edge
    float distFromCentre = abs(vUv.y - 0.5) * 2.0; // 0 at centre, 1 at edge

    // Soft glow profile: squared falloff across width
    float glow = 1.0 - smoothstep(0.0, 1.0, distFromCentre);
    glow = glow * glow; // sharper peak, softer edges

    // Core region: very bright tight inner beam
    float core = 1.0 - smoothstep(0.0, uCoreFrac, distFromCentre);
    core = core * core;

    // Slight fade at the tail (vUv.x = 0) for a tapered look
    float tailFade = smoothstep(0.0, 0.12, vUv.x);

    // Blend colours: glow + extra core brightness
    vec3 col = mix(uGlowColor * glow, uCoreColor, core);

    float alpha = (glow * 0.55 + core * 0.45) * tailFade * uOpacity;

    gl_FragColor = vec4(col, alpha);
  }
`;

// ── Pool size ──────────────────────────────────────────────────────────────────
const POOL_SIZE = 48;

// ── Reusable scratch vectors ───────────────────────────────────────────────────
const _side  = new THREE.Vector3();
const _toCam = new THREE.Vector3();
const _head  = new THREE.Vector3();
const _tail  = new THREE.Vector3();
const _up    = new THREE.Vector3(0, 1, 0);
const _right = new THREE.Vector3(1, 0, 0);

// ── Quad geometry (4 verts, 2 tris, with UVs) ─────────────────────────────────
// Vertex layout:
//   v0 (tail-left)   v3 (head-left)
//   v1 (tail-right)  v2 (head-right)
//
// UV layout:
//   v0: (0, 0)   v3: (1, 0)
//   v1: (0, 1)   v2: (1, 1)
//
function makeQuadGeo(): { geo: THREE.BufferGeometry; posArr: Float32Array } {
  const posArr = new Float32Array(4 * 3);
  const uvArr  = new Float32Array([
    0, 0,   // v0 tail-left
    0, 1,   // v1 tail-right
    1, 1,   // v2 head-right
    1, 0,   // v3 head-left
  ]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  geo.setAttribute('uv',       new THREE.BufferAttribute(uvArr,  2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  return { geo, posArr };
}

function writeQuadVerts(
  posArr: Float32Array,
  tail: THREE.Vector3,
  head: THREE.Vector3,
  side: THREE.Vector3,
  halfW: number,
): void {
  // v0 tail-left
  posArr[0] = tail.x + side.x * halfW;
  posArr[1] = tail.y + side.y * halfW;
  posArr[2] = tail.z + side.z * halfW;
  // v1 tail-right
  posArr[3] = tail.x - side.x * halfW;
  posArr[4] = tail.y - side.y * halfW;
  posArr[5] = tail.z - side.z * halfW;
  // v2 head-right
  posArr[6] = head.x - side.x * halfW;
  posArr[7] = head.y - side.y * halfW;
  posArr[8] = head.z - side.z * halfW;
  // v3 head-left
  posArr[9]  = head.x + side.x * halfW;
  posArr[10] = head.y + side.y * halfW;
  posArr[11] = head.z + side.z * halfW;
}

// ── Shared shader uniforms factory ────────────────────────────────────────────
function makeTracerMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader:   TRACER_VERT,
    fragmentShader: TRACER_FRAG,
    uniforms: {
      uCoreColor: { value: new THREE.Color(0xffffff) },
      uGlowColor: { value: new THREE.Color(0xffffff) },
      uOpacity:   { value: 0.0 },
      uCoreFrac:  { value: 0.25 },
    },
    transparent:  true,
    depthWrite:   false,
    blending:     THREE.AdditiveBlending,
    side:         THREE.DoubleSide,
  });
}

// ── Slot ──────────────────────────────────────────────────────────────────────
interface TracerSlot {
  mesh: THREE.Mesh;
  positions: Float32Array;
  mat: THREE.ShaderMaterial;

  muzzle:    THREE.Vector3;
  target:    THREE.Vector3;
  dir:       THREE.Vector3;
  totalDist: number;

  headDist:     number;
  speed:        number;
  streakLength: number;
  halfW:        number;
  coreFrac:     number;

  fadeTime:    number;
  maxFadeTime: number;
  peakOpacity: number;
  active:      boolean;
}

/**
 * Renders bullet tracer streaks as moving glowing beams.
 *
 * Each tracer uses a single ShaderMaterial quad with per-pixel radial glow
 * falloff (smooth core + soft outer halo), a tapered tail, and additive
 * blending so they light up dark areas. The head travels at cinematic speed
 * from the muzzle to the target, then fades out.
 */
export class TracerSystem {
  private scene: THREE.Scene;
  private pool: TracerSlot[] = [];
  private active: TracerSlot[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this._buildPool();
  }

  private _buildPool(): void {
    for (let i = 0; i < POOL_SIZE; i++) {
      const { geo, posArr } = makeQuadGeo();
      const mat = makeTracerMaterial();

      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 10;
      mesh.frustumCulled = false;
      this.scene.add(mesh);

      this.pool.push({
        mesh, positions: posArr, mat,
        muzzle:    new THREE.Vector3(),
        target:    new THREE.Vector3(),
        dir:       new THREE.Vector3(0, 0, -1),
        totalDist: 1,
        headDist:     0,
        speed:        100,
        streakLength: 2,
        halfW:        0.02,
        coreFrac:     0.25,
        fadeTime:     0,
        maxFadeTime:  0.07,
        peakOpacity:  0.9,
        active:       false,
      });
    }
  }

  /**
   * Spawn a tracer for a single hitscan ray.
   */
  spawnTracer(
    spreadDir: THREE.Vector3,
    origin: THREE.Vector3,
    hitPoint: THREE.Vector3 | null,
    range: number,
    weaponName: string,
  ): void {
    const cfg = WEAPON_TRACER_CONFIG[weaponName] ?? DEFAULT_CONFIG;

    let slot: TracerSlot | null = null;
    for (const s of this.pool) {
      if (!s.active) { slot = s; break; }
    }
    if (!slot) return;

    // Origin is already the barrel tip (muzzle world position from WeaponViewModel)
    slot.muzzle.copy(origin);
    slot.target.copy(hitPoint ?? origin.clone().addScaledVector(spreadDir, range));
    slot.dir.copy(spreadDir);
    slot.totalDist = Math.max(0.1, slot.muzzle.distanceTo(slot.target));

    slot.headDist    = 0;
    slot.speed       = cfg.speed;
    slot.streakLength = cfg.length;
    slot.halfW       = cfg.glowWidth;
    slot.coreFrac    = Math.min(0.95, cfg.coreWidth / cfg.glowWidth);
    slot.fadeTime    = cfg.fadeMs / 1000;
    slot.maxFadeTime = cfg.fadeMs / 1000;
    slot.peakOpacity = cfg.coreOpacity;
    slot.active      = true;

    slot.mat.uniforms.uCoreColor.value.setHex(cfg.coreColor);
    slot.mat.uniforms.uGlowColor.value.setHex(cfg.glowColor);
    slot.mat.uniforms.uCoreFrac.value = slot.coreFrac;
    slot.mat.uniforms.uOpacity.value  = 0;
    slot.mesh.visible = true;

    this.active.push(slot);
  }

  update(dt: number, camera: THREE.Camera): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const slot = this.active[i];

      // ── Phase 1: travel ───────────────────────────────────────────────────
      const travelling = slot.headDist < slot.totalDist;
      if (travelling) {
        slot.headDist = Math.min(slot.totalDist, slot.headDist + slot.speed * dt);
      } else {
        // ── Phase 2: fade ─────────────────────────────────────────────────
        slot.fadeTime -= dt;
        if (slot.fadeTime <= 0) {
          slot.active = false;
          slot.mesh.visible = false;
          slot.mat.uniforms.uOpacity.value = 0;
          this.active.splice(i, 1);
          continue;
        }
      }

      // Head and tail world positions
      _head.copy(slot.muzzle).addScaledVector(slot.dir, slot.headDist);
      const tailDist = Math.max(0, slot.headDist - slot.streakLength);
      _tail.copy(slot.muzzle).addScaledVector(slot.dir, tailDist);

      // Opacity: full while travelling, sqrt-fade on exit
      const opacity = travelling
        ? slot.peakOpacity
        : slot.peakOpacity * Math.sqrt(slot.fadeTime / slot.maxFadeTime);
      slot.mat.uniforms.uOpacity.value = opacity;

      // ── Billboard side vector ─────────────────────────────────────────────
      const midX = (_head.x + _tail.x) * 0.5;
      const midY = (_head.y + _tail.y) * 0.5;
      const midZ = (_head.z + _tail.z) * 0.5;

      _toCam.set(
        camera.position.x - midX,
        camera.position.y - midY,
        camera.position.z - midZ,
      ).normalize();

      _side.crossVectors(slot.dir, _toCam);
      let sideLen = _side.length();
      if (sideLen < 0.001) {
        _side.crossVectors(slot.dir, _up);
        sideLen = _side.length();
      }
      if (sideLen < 0.001) {
        _side.crossVectors(slot.dir, _right);
        sideLen = _side.length();
      }
      if (sideLen < 0.001) continue;
      _side.divideScalar(sideLen);

      writeQuadVerts(slot.positions, _tail, _head, _side, slot.halfW);
      const attr = slot.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      attr.needsUpdate = true;
      slot.mesh.geometry.computeBoundingSphere();
    }
  }

  dispose(): void {
    for (const slot of this.pool) {
      this.scene.remove(slot.mesh);
      slot.mesh.geometry.dispose();
      slot.mat.dispose();
    }
    this.pool.length = 0;
    this.active.length = 0;
  }
}
