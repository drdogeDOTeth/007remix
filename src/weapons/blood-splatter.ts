import * as THREE from 'three';

/**
 * Blood splatter particle system for player hits.
 * Creates short-lived red particles that spray from impact point.
 */

interface BloodParticle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

export class BloodSplatterSystem {
  private scene: THREE.Scene;
  private particlePool: THREE.Mesh[] = [];
  private activeParticles: BloodParticle[] = [];
  private readonly poolSize = 30;
  private readonly particleGeo: THREE.SphereGeometry;
  private readonly particleMat: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Shared geometry for all blood particles
    this.particleGeo = new THREE.SphereGeometry(0.04, 4, 3);

    // Red blood material
    this.particleMat = new THREE.MeshBasicMaterial({
      color: 0xaa0000,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    // Pre-create particle pool
    for (let i = 0; i < this.poolSize; i++) {
      const mesh = new THREE.Mesh(this.particleGeo, this.particleMat.clone());
      mesh.visible = false;
      this.scene.add(mesh);
      this.particlePool.push(mesh);
    }
  }

  /**
   * Spawn blood splatter particles at a position.
   * @param position Impact position
   * @param direction Direction the hit came from (particles spray away from this)
   * @param count Number of particles to spawn (default: 8)
   */
  spawn(position: THREE.Vector3, direction: THREE.Vector3, count: number = 8): void {
    let spawned = 0;

    for (const mesh of this.particlePool) {
      if (mesh.visible) continue;
      if (spawned >= count) break;

      // Position at impact point
      mesh.position.copy(position);
      mesh.visible = true;
      (mesh.material as THREE.MeshBasicMaterial).opacity = 1;

      // Random velocity radiating outward from impact direction
      const spreadAngle = Math.PI / 3; // 60 degree cone
      const vel = new THREE.Vector3(
        -direction.x + (Math.random() - 0.5) * spreadAngle,
        Math.random() * 2 - 0.5, // Slight upward bias
        -direction.z + (Math.random() - 0.5) * spreadAngle
      ).normalize().multiplyScalar(2 + Math.random() * 3);

      this.activeParticles.push({
        mesh,
        velocity: vel,
        life: 0,
        maxLife: 0.3 + Math.random() * 0.2, // 0.3-0.5 seconds
      });

      spawned++;
    }
  }

  /**
   * Update active blood particles.
   * Call this each frame from game loop.
   */
  update(dt: number): void {
    const gravity = -18;

    for (let i = this.activeParticles.length - 1; i >= 0; i--) {
      const p = this.activeParticles[i];
      p.life += dt;

      // Apply gravity
      p.velocity.y += gravity * dt;

      // Move particle
      p.mesh.position.addScaledVector(p.velocity, dt);

      // Fade out over lifetime
      const t = p.life / p.maxLife;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - t;

      // Remove if dead
      if (p.life >= p.maxLife) {
        p.mesh.visible = false;
        this.activeParticles.splice(i, 1);
      }
    }
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    for (const mesh of this.particlePool) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.particlePool = [];
    this.activeParticles = [];
  }
}
