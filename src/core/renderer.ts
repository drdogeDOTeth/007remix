import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SpriteBakerViewPass } from './sprite-baker-view-pass';
import { GameSettings } from './game-settings';

const TONE_MAP: Record<string, THREE.ToneMapping> = {
  aces:     THREE.ACESFilmicToneMapping,
  linear:   THREE.LinearToneMapping,
  reinhard: THREE.ReinhardToneMapping,
  cineon:   THREE.CineonToneMapping,
};

export class Renderer {
  readonly instance: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private renderPass: RenderPass | null = null;
  /** When true, bypass the EffectComposer entirely and render direct. */
  doomMode = false;
  /** The sprite-baker view pass instance (null when mode is off). */
  private spriteBakerPass: SpriteBakerViewPass | null = null;
  /** Separate composer used for sprite-baker view (replaces main composer while active). */
  private spriteBakerComposer: EffectComposer | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.instance = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
    });
    this.instance.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.instance.setSize(window.innerWidth, window.innerHeight);

    // Apply persisted settings on startup
    this._applyBaseRendererSettings();

    window.addEventListener('resize', this.onResize);
  }

  private _applyBaseRendererSettings(): void {
    const s = GameSettings.get();
    this.instance.shadowMap.enabled = s.shadowsEnabled;
    this.instance.shadowMap.type = THREE.PCFShadowMap;
    this.instance.toneMapping = TONE_MAP[s.toneMapping] ?? THREE.ACESFilmicToneMapping;
    this.instance.toneMappingExposure = s.exposure / 100;
  }

  /**
   * Set up post-processing with UnrealBloom.
   * Call once after the scene and camera are available (from game.ts init).
   */
  setupBloom(scene: THREE.Scene, camera: THREE.Camera): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const s = GameSettings.get();

    this.composer = new EffectComposer(this.instance);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.composer.setSize(w, h);

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      s.bloomStrength / 100,
      s.bloomRadius / 100,
      s.bloomThreshold / 100,
    );
    this.bloomPass.enabled = s.bloomEnabled;
    this.composer.addPass(this.bloomPass);

    this.composer.addPass(new OutputPass());
  }

  /**
   * Apply all post-processing settings from GameSettings immediately.
   * Called by SettingsMenu whenever the user changes a value.
   * Also handles pixel-mode toggle and shadow/tone-mapping changes.
   */
  applyPostProcessingSettings(scene?: THREE.Scene, camera?: THREE.Camera): void {
    const s = GameSettings.get();

    // Bloom
    if (this.bloomPass) {
      this.bloomPass.enabled = s.bloomEnabled;
      this.bloomPass.strength = s.bloomStrength / 100;
      this.bloomPass.radius = s.bloomRadius / 100;
      this.bloomPass.threshold = s.bloomThreshold / 100;
    }

    // Only touch tone-mapping / shadows / exposure when sprite-baker view is NOT active
    // (it overrides those to NoToneMapping + shadows off while running)
    if (!this.spriteBakerComposer) {
      this.instance.toneMapping = TONE_MAP[s.toneMapping] ?? THREE.ACESFilmicToneMapping;
      this.instance.toneMappingExposure = s.exposure / 100;
      this.instance.shadowMap.enabled = s.shadowsEnabled;
      if (s.shadowsEnabled) this.instance.shadowMap.needsUpdate = true;
    }

    // Pixel mode toggle
    if (s.pixelMode && !this.spriteBakerComposer) {
      if (scene && camera) this.enableSpriteBakerView(scene, camera, s.pixelSize);
    } else if (!s.pixelMode && this.spriteBakerComposer) {
      this.disableSpriteBakerView();
    } else if (s.pixelMode && this.spriteBakerPass && this.spriteBakerPass.pixelSize !== s.pixelSize) {
      // pixelSize changed while already in pixel mode — rebuild
      if (scene && camera) this.enableSpriteBakerView(scene, camera, s.pixelSize);
    }
  }

  /**
   * Enable the sprite-baker view pass.
   * Builds a separate EffectComposer that replaces the main composer while active.
   * pixelSize controls the block size in screen pixels (4 = chunky retro look).
   */
  enableSpriteBakerView(scene: THREE.Scene, camera: THREE.Camera, pixelSize = 4): void {
    this.disableSpriteBakerView(); // idempotent

    const w = window.innerWidth;
    const h = window.innerHeight;

    this.spriteBakerPass = new SpriteBakerViewPass(scene, camera, pixelSize);
    this.spriteBakerPass.setSize(w, h);
    this.spriteBakerPass.renderToScreen = true;

    // Minimal composer: just the baker pass → screen (no bloom — the low-res
    // render already looks flat; bloom would just smear the pixel grid)
    this.spriteBakerComposer = new EffectComposer(this.instance);
    this.spriteBakerComposer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.spriteBakerComposer.setSize(w, h);
    this.spriteBakerComposer.addPass(this.spriteBakerPass);

    // Disable shadows — the baker never uses them
    this.instance.shadowMap.enabled = false;
    // Raw SRGB output matches sprite-baker.ts renderer.outputColorSpace = THREE.SRGBColorSpace
    this.instance.toneMapping = THREE.NoToneMapping;
    this.instance.toneMappingExposure = 1.0;
  }

  disableSpriteBakerView(): void {
    if (this.spriteBakerPass) {
      this.spriteBakerPass.dispose();
      this.spriteBakerPass = null;
    }
    if (this.spriteBakerComposer) {
      this.spriteBakerComposer.dispose();
      this.spriteBakerComposer = null;
    }
    // Restore settings from GameSettings (not hardcoded values)
    const s = GameSettings.get();
    this.instance.shadowMap.enabled = s.shadowsEnabled;
    this.instance.shadowMap.needsUpdate = true;
    this.instance.toneMapping = TONE_MAP[s.toneMapping] ?? THREE.ACESFilmicToneMapping;
    this.instance.toneMappingExposure = s.exposure / 100;
  }

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.instance.setSize(w, h);
    if (this.composer) {
      this.composer.setSize(w, h);
      this.bloomPass?.resolution.set(w, h);
    }
    if (this.spriteBakerComposer) {
      this.spriteBakerComposer.setSize(w, h);
    }
    this.spriteBakerPass?.setSize(w, h);
  };

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    // Sprite-baker view overrides everything else
    if (this.spriteBakerComposer) {
      this.spriteBakerComposer.render();
      return;
    }
    if (this.doomMode || !this.composer) {
      this.instance.render(scene, camera);
    } else {
      // Update the RenderPass camera so the correct viewpoint is used
      if (this.renderPass && this.renderPass.camera !== camera) {
        this.renderPass.camera = camera;
      }
      this.composer.render();
    }
  }

  /** Temporarily override bloom strength (0 = off). Pass null to restore from GameSettings. */
  setBloomStrengthOverride(strength: number | null): void {
    if (!this.bloomPass) return;
    if (strength === null) {
      const s = GameSettings.get();
      this.bloomPass.enabled = s.bloomEnabled;
      this.bloomPass.strength = s.bloomStrength / 100;
    } else {
      this.bloomPass.enabled = strength > 0;
      this.bloomPass.strength = strength;
    }
  }

  /**
   * Force a fixed tone mapping + exposure for the gunship FLIR view.
   * The CSS filter on the canvas handles the thermal look, but needs consistent
   * scene luminance regardless of day/night cycle. Pass null to restore from GameSettings.
   */
  setFlirExposureOverride(active: boolean): void {
    if (active) {
      // LinearToneMapping + fixed exposure gives predictable midtone luminance
      // that the CSS brightness/contrast filter can work with consistently
      this.instance.toneMapping = THREE.LinearToneMapping;
      this.instance.toneMappingExposure = 1.8;
    } else {
      const s = GameSettings.get();
      this.instance.toneMapping = TONE_MAP[s.toneMapping] ?? THREE.ACESFilmicToneMapping;
      this.instance.toneMappingExposure = s.exposure / 100;
    }
  }

  enableDoomMode(): void {
    this.doomMode = true;
    this.instance.shadowMap.enabled = false;
    this.instance.toneMapping = THREE.NoToneMapping;
    this.instance.toneMappingExposure = 1.0;
  }

  disableDoomMode(): void {
    this.doomMode = false;
    const s = GameSettings.get();
    this.instance.shadowMap.enabled = s.shadowsEnabled;
    this.instance.shadowMap.needsUpdate = true;
    this.instance.toneMapping = TONE_MAP[s.toneMapping] ?? THREE.ACESFilmicToneMapping;
    this.instance.toneMappingExposure = s.exposure / 100;
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.composer?.dispose();
    this.spriteBakerComposer?.dispose();
    this.spriteBakerPass?.dispose();
    this.instance.dispose();
  }
}
