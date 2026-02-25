/**
 * SpriteBakerViewPass — renders the game scene through the same pipeline used to
 * generate 2D character sprites (sprite-baker.ts):
 *
 *   1. Render the full 3D scene to a tiny WebGLRenderTarget (pixelSize-divided resolution)
 *      with NearestFilter, matching the baker's antialias:false + low-res output.
 *   2. Temporarily swap scene lighting to the baker rig:
 *        DirectionalLight(#ffffff, 1.2) from above-front (camera-relative)
 *        AmbientLight(#404060, 0.4) bluish fill
 *   3. Upscale the low-res framebuffer to screen with a simple nearest-neighbor shader
 *      (NearestFilter on the texture + UV snap in the shader for hard pixel grid).
 *
 * The result looks identical to the sprite frames: chunky flat-shaded geometry,
 * consistent directional light from the viewer's perspective.
 *
 * pixelSize controls the "pixel size" in screen pixels — 4 gives a retro look.
 */

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

// ── Nearest-neighbour upscale shader ─────────────────────────────────────────
// Snaps UV coordinates to the low-res grid before sampling, ensuring every
// screen pixel maps to exactly one low-res texel with no interpolation bleed.

const PixelUpscaleShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    resolution: { value: new THREE.Vector2(1, 1) },   // low-res render size (w, h)
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    varying vec2 vUv;

    void main() {
      // Snap to nearest texel centre in the low-res grid
      vec2 snapped = (floor(vUv * resolution) + 0.5) / resolution;
      gl_FragColor = texture2D(tDiffuse, snapped);
    }
  `,
};

// ── Pass implementation ───────────────────────────────────────────────────────

export class SpriteBakerViewPass extends Pass {
  scene: THREE.Scene;
  camera: THREE.Camera;
  pixelSize: number;

  private renderTarget: THREE.WebGLRenderTarget;
  private fsQuad: FullScreenQuad;
  private resolution = new THREE.Vector2();
  private renderResolution = new THREE.Vector2();

  // Baker lighting rig (camera-relative so front-light always faces the viewer)
  private bakerDirLight: THREE.DirectionalLight;
  private bakerDirTarget: THREE.Object3D;
  private bakerAmbient: THREE.AmbientLight;

  // Saved original scene lighting intensities so we can restore them
  private savedLights: Array<{ light: THREE.Light; intensity: number }> = [];

  constructor(scene: THREE.Scene, camera: THREE.Camera, pixelSize = 4) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.pixelSize = pixelSize;
    this.needsSwap = true;

    // Low-res render target — NearestFilter so no bilinear smearing
    this.renderTarget = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
    });

    // Fullscreen upscale quad
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(PixelUpscaleShader.uniforms),
      vertexShader: PixelUpscaleShader.vertexShader,
      fragmentShader: PixelUpscaleShader.fragmentShader,
    });
    this.fsQuad = new FullScreenQuad(mat);

    // Sprite-baker lighting rig (sprite-baker.ts lines 73-80):
    //   DirectionalLight(#ffffff, 1.2) at (0, 2, 3) pointing at model center
    //   AmbientLight(#404060, 0.4) — dark blue fill
    //
    // We parent both to the camera so the front-light always illuminates
    // whatever the player is looking at — same effect as the baker which always
    // lights models from Z+.
    this.bakerDirTarget = new THREE.Object3D();
    this.bakerDirTarget.position.set(0, 0, -5); // In front of camera

    this.bakerDirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.bakerDirLight.position.set(0, 0.5, 1);  // Above-front in camera space
    this.bakerDirLight.target = this.bakerDirTarget;

    this.bakerAmbient = new THREE.AmbientLight(0x404060, 0.4);
  }

  setSize(width: number, height: number): void {
    this.resolution.set(width, height);
    const rw = Math.max(1, Math.floor(width / this.pixelSize));
    const rh = Math.max(1, Math.floor(height / this.pixelSize));
    this.renderResolution.set(rw, rh);
    this.renderTarget.setSize(rw, rh);
    (this.fsQuad.material as THREE.ShaderMaterial).uniforms.resolution.value.set(rw, rh);
  }

  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
  ): void {
    // ── 1. Install baker lighting rig ───────────────────────────────────────
    // Mute all existing scene lights
    this.savedLights = [];
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Light && obj !== this.bakerDirLight && obj !== this.bakerAmbient) {
        this.savedLights.push({ light: obj, intensity: obj.intensity });
        obj.intensity = 0;
      }
    });

    // Attach our baker lights
    this.camera.add(this.bakerDirLight);
    this.camera.add(this.bakerDirTarget);
    this.scene.add(this.bakerAmbient);

    // ── 2. Render scene to low-res target ───────────────────────────────────
    const prevToneMapping = renderer.toneMapping;
    const prevExposure = renderer.toneMappingExposure;
    renderer.toneMapping = THREE.NoToneMapping; // baker uses raw SRGB
    renderer.toneMappingExposure = 1.0;

    renderer.setRenderTarget(this.renderTarget);
    renderer.clear();
    renderer.render(this.scene, this.camera);

    renderer.toneMapping = prevToneMapping;
    renderer.toneMappingExposure = prevExposure;

    // ── 3. Remove baker lights, restore scene lights ────────────────────────
    this.camera.remove(this.bakerDirLight);
    this.camera.remove(this.bakerDirTarget);
    this.scene.remove(this.bakerAmbient);

    for (const { light, intensity } of this.savedLights) {
      light.intensity = intensity;
    }
    this.savedLights = [];

    // ── 4. Upscale to screen with nearest-neighbour shader ──────────────────
    const mat = this.fsQuad.material as THREE.ShaderMaterial;
    mat.uniforms.tDiffuse.value = this.renderTarget.texture;

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }
    this.fsQuad.render(renderer);
  }

  dispose(): void {
    this.renderTarget.dispose();
    this.fsQuad.dispose();
    this.bakerDirLight.dispose();
    this.bakerAmbient.dispose();
  }
}
