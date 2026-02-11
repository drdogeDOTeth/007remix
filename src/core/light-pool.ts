import * as THREE from 'three';

/**
 * Object pool for PointLights to avoid constant creation/destruction.
 * Used for muzzle flashes, explosion lights, etc.
 */
export class LightPool {
  private availableLights: THREE.PointLight[] = [];
  private activeLights: Map<THREE.PointLight, number> = new Map();
  private poolSize: number;

  constructor(poolSize: number = 20) {
    this.poolSize = poolSize;

    // Pre-allocate pool
    for (let i = 0; i < poolSize; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 1);
      light.visible = false;
      this.availableLights.push(light);
    }
  }

  /**
   * Acquire a PointLight from the pool.
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
      light = new THREE.PointLight(0xffffff, 0, 1);
    }

    // Configure light
    light.color.setHex(color);
    light.intensity = intensity;
    light.distance = distance;
    light.visible = true;

    // Track active light
    if (duration !== undefined) {
      const releaseTime = performance.now() + duration;
      this.activeLights.set(light, releaseTime);
    }

    return light;
  }

  /**
   * Release a PointLight back to the pool.
   */
  release(light: THREE.PointLight): void {
    // Reset light state
    light.intensity = 0;
    light.visible = false;
    light.position.set(0, 0, 0);

    // Remove from active tracking
    this.activeLights.delete(light);

    // Return to pool if under capacity
    if (this.availableLights.length < this.poolSize) {
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
      // Remove from parent (if attached)
      if (light.parent) {
        light.parent.remove(light);
      }
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
   */
  dispose(): void {
    this.availableLights.forEach((light) => light.dispose());
    this.activeLights.forEach((_, light) => light.dispose());
    this.availableLights = [];
    this.activeLights.clear();
  }
}

/**
 * Global singleton light pool for shared use.
 */
export const globalLightPool = new LightPool(20);
