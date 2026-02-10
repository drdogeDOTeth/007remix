import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from '../core/physics-world';

/**
 * Destructible prop system — crates and barrels take damage from gunfire and explosions.
 * When health reaches 0, the prop shatters into debris chunks with physics.
 * Barrels trigger a secondary explosion dealing area damage.
 */

const DEBRIS_COUNT = 8;
const DEBRIS_LIFETIME = 2.0;
const DEBRIS_GRAVITY = -14;

// Health defaults per prop type
const DEFAULT_HEALTH: Record<string, number> = {
  crate: 30,
  crate_metal: 70,
  barrel: 20,
};

// Barrel explosion properties
const BARREL_EXPLOSION_RADIUS = 3;
const BARREL_EXPLOSION_DAMAGE = 50;

export interface DestructibleProp {
  mesh: THREE.Object3D;
  collider: RAPIER.Collider;
  health: number;
  maxHealth: number;
  type: 'crate' | 'crate_metal' | 'barrel';
  position: THREE.Vector3;
  size: number; // approximate extent for debris sizing
}

interface Debris {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  rotSpeedX: number;
  rotSpeedY: number;
  rotSpeedZ: number;
  life: number;
  maxLife: number;
}

export class DestructibleSystem {
  private scene: THREE.Scene;
  private physics: PhysicsWorld;
  private props: DestructibleProp[] = [];
  private debris: Debris[] = [];

  // Reusable vector
  private readonly _tmpVec = new THREE.Vector3();

  /**
   * Called when a prop is destroyed. Use for sounds, chain explosions, etc.
   * (type, position, isBarrel)
   */
  onPropDestroyed: ((type: string, position: THREE.Vector3) => void) | null = null;

  /**
   * Called when a barrel explodes — deal area damage to enemies / player.
   * (position, radius, damage)
   */
  onBarrelExplode: ((position: THREE.Vector3, radius: number, damage: number) => void) | null = null;

  constructor(scene: THREE.Scene, physics: PhysicsWorld) {
    this.scene = scene;
    this.physics = physics;
  }

  /** Register a destructible prop. Returns the prop for chaining. */
  register(
    mesh: THREE.Object3D,
    collider: RAPIER.Collider,
    type: 'crate' | 'crate_metal' | 'barrel',
    health?: number,
    size?: number,
  ): DestructibleProp {
    const hp = health ?? DEFAULT_HEALTH[type] ?? 30;
    const prop: DestructibleProp = {
      mesh,
      collider,
      health: hp,
      maxHealth: hp,
      type,
      position: mesh.position.clone(),
      size: size ?? 1,
    };
    this.props.push(prop);
    return prop;
  }

  /** Find prop by Rapier collider handle. */
  getByColliderHandle(handle: number): DestructibleProp | null {
    for (const p of this.props) {
      if (p.health > 0 && p.collider.handle === handle) return p;
    }
    return null;
  }

  /** Quick check if a collider belongs to a living destructible prop. */
  isDestructible(collider: RAPIER.Collider): boolean {
    return this.getByColliderHandle(collider.handle) !== null;
  }

  /** Apply damage to a specific prop. */
  damage(prop: DestructibleProp, amount: number): void {
    if (prop.health <= 0) return;
    prop.health -= amount;

    // Brief red flash on hit
    this.flashMesh(prop.mesh);

    if (prop.health <= 0) {
      this.destroy(prop);
    }
  }

  /** Damage all props within a radius (explosions). Damage falls off with distance. */
  damageInRadius(center: THREE.Vector3, radius: number, damage: number): void {
    // Iterate a copy since destroy() mutates this.props
    const snapshot = this.props.slice();
    for (const p of snapshot) {
      if (p.health <= 0) continue;
      const dx = p.position.x - center.x;
      const dy = p.position.y - center.y;
      const dz = p.position.z - center.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist <= radius) {
        const falloff = 1 - dist / radius;
        this.damage(p, damage * falloff);
      }
    }
  }

  private flashMesh(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material;
        if (mat instanceof THREE.MeshStandardMaterial) {
          const origHex = mat.color.getHex();
          mat.emissive.setHex(0xff2200);
          mat.emissiveIntensity = 0.6;
          setTimeout(() => {
            mat.emissive.setHex(0x000000);
            mat.emissiveIntensity = 0;
            mat.color.setHex(origHex);
          }, 80);
        }
      }
    });
  }

  private destroy(prop: DestructibleProp): void {
    // Remove visual
    this.scene.remove(prop.mesh);
    // Dispose geometry+material on the mesh
    prop.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) child.material.dispose();
      }
    });

    // Remove physics body + collider
    const body = prop.collider.parent();
    this.physics.removeCollider(prop.collider);
    if (body) this.physics.removeRigidBody(body);

    // Spawn debris chunks
    this.spawnDebris(prop);

    // Remove from tracking list
    const idx = this.props.indexOf(prop);
    if (idx >= 0) this.props.splice(idx, 1);

    // Barrel chain: spawn explosion flash + area damage
    if (prop.type === 'barrel') {
      this.spawnBarrelFlash(prop.position);
      this.onBarrelExplode?.(prop.position, BARREL_EXPLOSION_RADIUS, BARREL_EXPLOSION_DAMAGE);
      // Chain reaction: damage nearby props from barrel blast
      this.damageInRadius(prop.position, BARREL_EXPLOSION_RADIUS, BARREL_EXPLOSION_DAMAGE);
    }

    // Notify for sounds
    this.onPropDestroyed?.(prop.type, prop.position);
  }

  private spawnBarrelFlash(pos: THREE.Vector3): void {
    // Bright point light flash
    const light = new THREE.PointLight(0xff6600, 60, 8);
    light.position.copy(pos);
    light.position.y += 0.5;
    this.scene.add(light);

    // Quick flash sphere (fireball)
    const geo = new THREE.SphereGeometry(1.2, 8, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff8800,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const flash = new THREE.Mesh(geo, mat);
    flash.position.copy(pos);
    flash.position.y += 0.3;
    this.scene.add(flash);

    // Animate light + flash over 0.3s
    let elapsed = 0;
    const duration = 0.35;
    const animate = () => {
      elapsed += 0.016;
      const t = Math.min(1, elapsed / duration);
      light.intensity = 60 * (1 - t);
      mat.opacity = 0.9 * (1 - t);
      flash.scale.setScalar(1 + t * 1.5);
      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        this.scene.remove(light);
        light.dispose();
        this.scene.remove(flash);
        geo.dispose();
        mat.dispose();
      }
    };
    requestAnimationFrame(animate);
  }

  private spawnDebris(prop: DestructibleProp): void {
    // Color palette per type
    let baseColor: number;
    let metallic: boolean;
    if (prop.type === 'crate') {
      baseColor = 0x8B6914;
      metallic = false;
    } else if (prop.type === 'crate_metal') {
      baseColor = 0x556677;
      metallic = true;
    } else {
      // Barrel: mix of rusty metal
      baseColor = 0x664433;
      metallic = true;
    }

    const count = prop.type === 'barrel' ? DEBRIS_COUNT + 2 : DEBRIS_COUNT;
    const speed = prop.type === 'barrel' ? 6 : 3; // barrel debris flies further

    for (let i = 0; i < count; i++) {
      const s = prop.size * (0.06 + Math.random() * 0.14);
      const geo = new THREE.BoxGeometry(
        s * (0.6 + Math.random() * 0.8),
        s * (0.4 + Math.random() * 0.8),
        s * (0.6 + Math.random() * 0.8),
      );

      // Slight color variation per chunk
      const c = new THREE.Color(baseColor);
      c.offsetHSL(
        (Math.random() - 0.5) * 0.06,
        (Math.random() - 0.5) * 0.1,
        (Math.random() - 0.5) * 0.15,
      );
      const mat = new THREE.MeshStandardMaterial({
        color: c,
        roughness: metallic ? 0.35 : 0.8,
        metalness: metallic ? 0.5 : 0.1,
        flatShading: true,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(prop.position);
      mesh.position.x += (Math.random() - 0.5) * prop.size * 0.4;
      mesh.position.y += Math.random() * prop.size * 0.3;
      mesh.position.z += (Math.random() - 0.5) * prop.size * 0.4;
      mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI,
      );
      mesh.castShadow = true;
      this.scene.add(mesh);

      const angle = Math.random() * Math.PI * 2;
      const outSpeed = (1 + Math.random()) * speed;
      const velocity = new THREE.Vector3(
        Math.cos(angle) * outSpeed,
        2 + Math.random() * (prop.type === 'barrel' ? 5 : 3),
        Math.sin(angle) * outSpeed,
      );

      const life = DEBRIS_LIFETIME * (0.6 + Math.random() * 0.4);
      this.debris.push({
        mesh,
        velocity,
        rotSpeedX: (Math.random() - 0.5) * 10,
        rotSpeedY: (Math.random() - 0.5) * 10,
        rotSpeedZ: (Math.random() - 0.5) * 10,
        life,
        maxLife: life,
      });
    }
  }

  /** Update debris physics + cleanup. Call once per frame. */
  update(dt: number): void {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;

      if (d.life <= 0) {
        this.scene.remove(d.mesh);
        d.mesh.geometry.dispose();
        (d.mesh.material as THREE.Material).dispose();
        this.debris.splice(i, 1);
        continue;
      }

      // Gravity
      d.velocity.y += DEBRIS_GRAVITY * dt;
      d.mesh.position.addScaledVector(d.velocity, dt);

      // Floor bounce
      if (d.mesh.position.y < 0.05) {
        d.mesh.position.y = 0.05;
        d.velocity.y *= -0.25;
        d.velocity.x *= 0.7;
        d.velocity.z *= 0.7;
        // Slow rotation on ground
        d.rotSpeedX *= 0.8;
        d.rotSpeedY *= 0.8;
        d.rotSpeedZ *= 0.8;
      }

      // Tumble
      d.mesh.rotation.x += d.rotSpeedX * dt;
      d.mesh.rotation.y += d.rotSpeedY * dt;
      d.mesh.rotation.z += d.rotSpeedZ * dt;

      // Fade out in last 30% of life
      const fadeRatio = 0.3;
      const fadeThresh = d.maxLife * fadeRatio;
      if (d.life < fadeThresh) {
        const opacity = d.life / fadeThresh;
        const mat = d.mesh.material as THREE.MeshStandardMaterial;
        if (!mat.transparent) mat.transparent = true;
        mat.opacity = opacity;
      }
    }
  }
}
