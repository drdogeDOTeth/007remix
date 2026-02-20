import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export class Renderer {
  readonly instance: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.instance = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
    });
    this.instance.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.instance.setSize(window.innerWidth, window.innerHeight);
    this.instance.shadowMap.enabled = true;
    this.instance.shadowMap.type = THREE.PCFShadowMap;
    this.instance.toneMapping = THREE.ACESFilmicToneMapping;
    this.instance.toneMappingExposure = 1.15;

    window.addEventListener('resize', this.onResize);
  }

  /**
   * Set up post-processing with UnrealBloom.
   * Call once after the scene and camera are available (from game.ts init).
   * Bloom threshold is high enough that only bright additive objects
   * (tracers, rocket exhaust, muzzle flash) glow — normal lit geometry stays clean.
   */
  setupBloom(scene: THREE.Scene, camera: THREE.Camera): void {
    const w = window.innerWidth;
    const h = window.innerHeight;

    this.composer = new EffectComposer(this.instance);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.composer.setSize(w, h);

    this.composer.addPass(new RenderPass(scene, camera));

    // Subtle bloom: only very bright pixels (additive blended tracers/exhaust)
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      0.28,   // strength  — lower = less overall glow
      0.4,    // radius    — tighter spread
      0.80,   // threshold — higher = only the very brightest pixels bloom
    );
    this.composer.addPass(this.bloomPass);

    // Correct output tonemapping after bloom compositing
    this.composer.addPass(new OutputPass());
  }

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.instance.setSize(w, h);
    if (this.composer) {
      this.composer.setSize(w, h);
      this.bloomPass?.resolution.set(w, h);
    }
  };

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.composer) {
      this.composer.render();
    } else {
      this.instance.render(scene, camera);
    }
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.composer?.dispose();
    this.instance.dispose();
  }
}
