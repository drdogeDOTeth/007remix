import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from '../core/physics-world';
import { EnemyManager } from '../enemies/enemy-manager';
import {
  generateExplosionTexture,
  EXPLOSION_FRAMES,
  getExplosionOffset,
} from './explosion-sprite';

const GRAVITY = -18;
const THROW_SPEED = 16;
const GROUND_RAY_LENGTH = 5;
const GAS_RADIUS = 3;
const GAS_DURATION = 4;
const GAS_DAMAGE_PER_SECOND = 15;
const FRAG_EXPLOSION_RADIUS = 4;
const FRAG_EXPLOSION_DAMAGE = 80;
const FRAG_EXPLOSION_DURATION = 0.5;
const FRAG_EXPLOSION_SIZE = 6;

export type GrenadeType = 'gas' | 'frag';

interface ThrownGrenade {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  type: GrenadeType;
}

interface SmokePuff {
  mesh: THREE.Mesh;
  basePos: THREE.Vector3;
  driftX: number;
  driftZ: number;
  riseSpeed: number;
  fadeDelay: number; // each puff fades at slightly different rate
  baseScale: number;
}

interface GasCloud {
  puffs: SmokePuff[];
  position: THREE.Vector3;
  radius: number;
  remaining: number;
  duration: number;
}

interface ActiveExplosion {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  radius: number;
  damageDealt: boolean;
  elapsed: number;
  duration: number;
}

export class GrenadeSystem {
  private scene: THREE.Scene;
  private physics: PhysicsWorld;
  private enemyManager: EnemyManager | null = null;
  /** Excluded from ground raycast so the grenade doesn't "land" on the player. */
  private playerCollider: RAPIER.Collider | null = null;
  private thrown: ThrownGrenade[] = [];
  private clouds: GasCloud[] = [];
  private explosions: ActiveExplosion[] = [];
  private explosionTexture: THREE.Texture | null = null;
  private readonly _rayOrigin = new THREE.Vector3();
  private readonly _groundNormal = new THREE.Vector3(0, -1, 0);
  private readonly _cameraPosition = new THREE.Vector3();

  constructor(scene: THREE.Scene, physics: PhysicsWorld) {
    this.scene = scene;
    this.physics = physics;
  }

  setEnemyManager(manager: EnemyManager): void {
    this.enemyManager = manager;
  }

  setPlayerCollider(collider: RAPIER.Collider): void {
    this.playerCollider = collider;
  }

  /** Throw a grenade from origin along direction (normalized). */
  throw(origin: THREE.Vector3, direction: THREE.Vector3, type: GrenadeType): void {
    const isFrag = type === 'frag';
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 6),
      new THREE.MeshStandardMaterial({
        color: isFrag ? 0x333333 : 0x2a4a2a,
        roughness: isFrag ? 0.6 : 0.8,
        metalness: isFrag ? 0.5 : 0.2,
      }),
    );
    mesh.position.copy(origin);
    this.scene.add(mesh);

    const vel = direction.clone().multiplyScalar(THROW_SPEED);

    this.thrown.push({
      mesh,
      position: origin.clone(),
      velocity: vel,
      type,
    });
  }

  private spawnExplosion(at: THREE.Vector3): void {
    if (!this.explosionTexture) {
      this.explosionTexture = generateExplosionTexture();
    }
    const tex = this.explosionTexture.clone();
    tex.repeat.set(1 / EXPLOSION_FRAMES, 1);
    const geo = new THREE.PlaneGeometry(FRAG_EXPLOSION_SIZE, FRAG_EXPLOSION_SIZE);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(at);
    this.scene.add(mesh);

    this.explosions.push({
      mesh,
      position: at.clone(),
      radius: FRAG_EXPLOSION_RADIUS,
      damageDealt: false,
      elapsed: 0,
      duration: FRAG_EXPLOSION_DURATION,
    });
  }

  private smokePuffTexture: THREE.CanvasTexture | null = null;

  private getSmokePuffTexture(): THREE.CanvasTexture {
    if (this.smokePuffTexture) return this.smokePuffTexture;
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Radial gradient: opaque center → transparent edge
    const cx = size / 2, cy = size / 2;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
    grad.addColorStop(0, 'rgba(120, 160, 80, 0.7)');
    grad.addColorStop(0.3, 'rgba(100, 140, 60, 0.5)');
    grad.addColorStop(0.6, 'rgba(80, 120, 50, 0.25)');
    grad.addColorStop(1, 'rgba(60, 100, 40, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Noisy edge bumps for organic shape
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const r = size / 2 - 4 + Math.random() * 8;
      const bx = cx + Math.cos(angle) * r;
      const by = cy + Math.sin(angle) * r;
      const blobR = 4 + Math.random() * 6;
      const blobGrad = ctx.createRadialGradient(bx, by, 0, bx, by, blobR);
      blobGrad.addColorStop(0, 'rgba(0,0,0,0.3)');
      blobGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = blobGrad;
      ctx.fillRect(bx - blobR, by - blobR, blobR * 2, blobR * 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    this.smokePuffTexture = tex;
    return tex;
  }

  private spawnGasCloud(at: THREE.Vector3): void {
    const puffs: SmokePuff[] = [];
    const puffCount = 10;
    const puffGeo = new THREE.PlaneGeometry(1, 1);

    for (let i = 0; i < puffCount; i++) {
      const tex = this.getSmokePuffTexture().clone();
      tex.needsUpdate = true;
      // Slight color variation per puff
      const hue = 0x60 + Math.floor(Math.random() * 0x30);
      const color = new THREE.Color((hue << 8) | 0x804000 | (hue << 16));
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        color: new THREE.Color().setHSL(0.25 + Math.random() * 0.08, 0.4, 0.35 + Math.random() * 0.15),
        transparent: true,
        opacity: 0.5 + Math.random() * 0.2,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

      const baseScale = 1.0 + Math.random() * 1.5;
      const mesh = new THREE.Mesh(puffGeo, mat);
      mesh.scale.set(baseScale, baseScale, 1);
      // Random position within cloud radius
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * GAS_RADIUS * 0.7;
      const px = at.x + Math.cos(angle) * dist;
      const py = at.y + 0.3 + Math.random() * 1.2;
      const pz = at.z + Math.sin(angle) * dist;
      mesh.position.set(px, py, pz);
      // Random initial rotation
      mesh.rotation.z = Math.random() * Math.PI * 2;
      this.scene.add(mesh);

      puffs.push({
        mesh,
        basePos: new THREE.Vector3(px, py, pz),
        driftX: (Math.random() - 0.5) * 0.4,
        driftZ: (Math.random() - 0.5) * 0.4,
        riseSpeed: 0.15 + Math.random() * 0.3,
        fadeDelay: Math.random() * 0.3,
        baseScale,
      });
    }

    this.clouds.push({
      puffs,
      position: at.clone(),
      radius: GAS_RADIUS,
      remaining: GAS_DURATION,
      duration: GAS_DURATION,
    });
  }

  private getGroundY(x: number, y: number, z: number): number {
    const hit = this.physics.castRay(
      x, y, z,
      0, -1, 0,
      GROUND_RAY_LENGTH,
      this.playerCollider ?? undefined,
    );
    if (hit) {
      return hit.point.y;
    }
    return 0;
  }

  update(dt: number, camera?: THREE.Camera): void {
    // Update thrown grenades
    for (let i = this.thrown.length - 1; i >= 0; i--) {
      const g = this.thrown[i];
      g.velocity.y += GRAVITY * dt;
      g.position.addScaledVector(g.velocity, dt);
      g.mesh.position.copy(g.position);

      const groundY = this.getGroundY(g.position.x, g.position.y, g.position.z);
      if (g.position.y <= groundY + 0.15) {
        this.scene.remove(g.mesh);
        this.thrown.splice(i, 1);
        const impactPos = new THREE.Vector3(g.position.x, groundY + 0.1, g.position.z);
        if (g.type === 'gas') {
          this.spawnGasCloud(impactPos);
        } else {
          this.spawnExplosion(impactPos);
        }
      }
    }

    // Update gas clouds: animate puffs, damage enemies, fade out
    if (camera) this._cameraPosition.setFromMatrixPosition(camera.matrixWorld);
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.remaining -= dt;
      const lifeT = 1 - c.remaining / c.duration; // 0→1 over lifetime

      if (this.enemyManager && c.remaining > 0) {
        const damageThisFrame = GAS_DAMAGE_PER_SECOND * dt;
        this.enemyManager.damageEnemiesInRadius(c.position, c.radius, damageThisFrame);
      }

      // Animate each smoke puff
      for (const p of c.puffs) {
        // Drift and rise
        p.mesh.position.x += p.driftX * dt;
        p.mesh.position.z += p.driftZ * dt;
        p.mesh.position.y += p.riseSpeed * dt;
        // Slow rotation for organic swirl
        p.mesh.rotation.z += dt * 0.3;
        // Expand over time (1.0 → 1.4)
        const scaleGrow = p.baseScale * (1 + lifeT * 0.4);
        p.mesh.scale.set(scaleGrow, scaleGrow, 1);
        // Fade: each puff fades based on cloud life + individual delay
        const fadeFactor = Math.max(0, 1 - Math.max(0, lifeT - p.fadeDelay) / (1 - p.fadeDelay));
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = fadeFactor * 0.55;
        // Billboard toward camera
        if (camera) {
          p.mesh.lookAt(this._cameraPosition);
        }
      }

      if (c.remaining <= 0) {
        // Clean up all puffs
        for (const p of c.puffs) {
          const m = p.mesh.material as THREE.MeshBasicMaterial;
          if (m.map) m.map.dispose();
          m.dispose();
          p.mesh.geometry.dispose();
          this.scene.remove(p.mesh);
        }
        this.clouds.splice(i, 1);
      }
    }

    // Update explosions: billboard, animate sprite, one-time damage, then remove
    if (camera) this._cameraPosition.setFromMatrixPosition(camera.matrixWorld);
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.elapsed += dt;
      if (!e.damageDealt && this.enemyManager) {
        this.enemyManager.damageEnemiesInRadius(e.position, e.radius, FRAG_EXPLOSION_DAMAGE);
        e.damageDealt = true;
      }
      const t = Math.min(1, e.elapsed / e.duration);
      const frameIndex = Math.min(
        Math.floor(t * EXPLOSION_FRAMES),
        EXPLOSION_FRAMES - 1,
      );
      const offset = getExplosionOffset(frameIndex);
      (e.mesh.material as THREE.MeshBasicMaterial).map!.offset.set(offset.x, offset.y);
      (e.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - t * 0.7;
      if (camera) {
        e.mesh.lookAt(this._cameraPosition);
      }
      if (e.elapsed >= e.duration) {
        const m = e.mesh.material as THREE.MeshBasicMaterial;
        if (m.map) m.map.dispose();
        e.mesh.geometry.dispose();
        m.dispose();
        this.scene.remove(e.mesh);
        this.explosions.splice(i, 1);
      }
    }
  }
}
