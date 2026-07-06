import * as THREE from 'three';

/**
 * Object pool for PointLights to avoid constant creation/destruction.
 * Used for muzzle flashes, explosion lights, etc.
 *
 * IMPORTANT: adding/removing a light (or toggling .visible) changes the scene's
 * light count, which forces Three.js to recompile EVERY lit shader — a huge
 * one-frame stall. To avoid that, pool lights live in the scene permanently
 * with visible=true and are "off" at intensity 0. Acquire/release only change
 * intensity and re-parent — the light count never changes.
 */
export class LightPool {
  private availableLights: THREE.PointLight[] = [];
  private activeLights: Map<THREE.PointLight, number> = new Map();
  private poolSize: number;
  private scene: THREE.Scene | null = null;

  constructor(poolSize: number = 20) {
    this.poolSize = poolSize;

    // Pre-allocate pool
    for (let i = 0; i < poolSize; i++) {
      this.availableLights.push(this.createLight());
    }
  }

  private createLight(): THREE.PointLight {
    const light = new THREE.PointLight(0xffffff, 0, 1);
    light.visible = true; // always visible — "off" means intensity 0
    if (this.scene) this.scene.add(light);
    return light;
  }

  /**
   * Attach all pool lights to the scene permanently. Call once at game init,
   * BEFORE the first render, so the light count is stable from frame one.
   */
  attachToScene(scene: THREE.Scene): void {
    this.scene = scene;
    for (const light of this.availableLights) scene.add(light);
    for (const light of this.activeLights.keys()) {
      if (!light.parent) scene.add(light);
    }
  }

  /**
   * Acquire a PointLight from the pool.
   * The light is already in the scene — position it (or re-parent it to a
   * moving object) and it lights up. Do NOT scene.add()/scene.remove() it.
   * @param color Light color
   * @param intensity Light intensity
   * @param distance Light range
   * @param duration Auto-release after this many milliseconds (optional)
   * @returns PointLight instance
   */
  acquire(
    color: number,
    intensity: number,
    distance: number,
    duration?: number
  ): THREE.PointLight {
    let light: THREE.PointLight;

    if (this.availableLights.length > 0) {
      light = this.availableLights.pop()!;
    } else {
      // Pool exhausted, create new light (warns if this happens often)
      console.warn('[LightPool] Pool exhausted, creating new light');
      light = this.createLight();
      this.poolSize++;
    }

    // Configure light
    light.color.setHex(color);
    light.intensity = intensity;
    light.distance = distance;

    // Track active light
    if (duration !== undefined) {
      const releaseTime = performance.now() + duration;
      this.activeLights.set(light, releaseTime);
    }

    return light;
  }

  /**
   * Release a PointLight back to the pool.
   * Turns it off via intensity and re-parents it to the scene root so it is
   * never removed from the scene graph (keeps the light count constant).
   */
  release(light: THREE.PointLight): void {
    light.intensity = 0;
    light.position.set(0, 0, 0);

    // Re-parent back to scene root (caller may have attached it to a mesh
    // that is about to be removed — the light must stay in the scene)
    if (this.scene && light.parent !== this.scene) {
      this.scene.add(light);
    }

    // Remove from active tracking
    this.activeLights.delete(light);

    if (!this.availableLights.includes(light)) {
      this.availableLights.push(light);
    }
  }

  /**
   * Update active lights and auto-release expired ones.
   * Call this each frame.
   */
  update(): void {
    const now = performance.now();
    const toRelease: THREE.PointLight[] = [];

    this.activeLights.forEach((releaseTime, light) => {
      if (now >= releaseTime) {
        toRelease.push(light);
      }
    });

    toRelease.forEach((light) => {
      this.release(light);
    });
  }

  /**
   * Get count of available lights in pool.
   */
  get availableCount(): number {
    return this.availableLights.length;
  }

  /**
   * Get count of active lights.
   */
  get activeCount(): number {
    return this.activeLights.size;
  }

  /**
   * Dispose of all lights in the pool.
   * PointLight has no dispose() — remove from parent, reset state, clear references.
   */
  dispose(): void {
    const allLights = [
      ...this.availableLights,
      ...Array.from(this.activeLights.keys()),
    ];
    for (const light of allLights) {
      if (light.parent) light.parent.remove(light);
      light.intensity = 0;
      light.position.set(0, 0, 0);
    }
    this.availableLights = [];
    this.activeLights.clear();
    this.scene = null;
  }
}

/**
 * Global singleton light pool for shared use.
 */
export const globalLightPool = new LightPool(20);
