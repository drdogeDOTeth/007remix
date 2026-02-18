import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from '../core/physics-world';
import { GameSettings } from '../core/game-settings';
import { EventBus } from '../core/event-bus';
import { EnemyBase } from './enemy-base';
import { GUARD_VARIANTS, type GuardVariant } from './sprite/guard-sprite-sheet';
import type { EnemyWeaponType } from '../weapons/weapon-stats-map';
import { perceivePlayer, type PerceptionResult } from './ai/perception';
import type { NavMesh } from '../navmesh/navmesh';
import { createIdleState } from './ai/states/idle-state';
import { createPatrolState } from './ai/states/patrol-state';
import { createAlertState } from './ai/states/alert-state';
import { createAttackState } from './ai/states/attack-state';
import { playGunshotWeapon } from '../audio/sound-effects';

const ALERT_PROPAGATION_RANGE = 12;
const DEAD_REMOVAL_TIME = 5;

export interface EnemySpawn {
  x: number;
  y: number;
  z: number;
  facingAngle: number;
  /** Optional patrol path. When set, enemy starts in patrol state. */
  waypoints?: { x: number; z: number }[];
  /** Optional variant: 'guard', 'soldier', 'officer'. Default: 'guard'. */
  variant?: string;
  /** Optional weapon: 'pistol', 'rifle', 'shotgun', 'sniper'. Default: 'pistol'. */
  weapon?: EnemyWeaponType;
}

export class EnemyManager {
  private enemies: EnemyBase[] = [];
  private scene: THREE.Scene;
  private physics: PhysicsWorld;
  private events: EventBus;

  // Player state — set externally each frame
  private playerPos = new THREE.Vector3();
  private cameraPos = new THREE.Vector3();
  private getPlayerCollider: () => RAPIER.Collider;
  private playerIsMoving = false;
  private playerTargetable = false;
  private playerFiredRecently = false;
  private playerFiredTimer = 0;

  // Pooled muzzle flash lights for enemy shots (reuse instead of create/destroy)
  private muzzleFlashPool: THREE.PointLight[] = [];
  private muzzleFlashTimers: number[] = [];

  // Navmesh for pathfinding (set when level loads)
  private navMesh: NavMesh | null = null;

  /** Optional ground height callback for terrain following (custom quickplay). */
  private getGroundHeight: ((x: number, z: number, exclude: RAPIER.Collider) => number | null) | null = null;

  // Callback for when enemy shoots the player
  onPlayerHit: ((damage: number, fromPos: THREE.Vector3) => void) | null = null;
  /** Called when an enemy shot hits geometry (wall/etc) — for decals and particles */
  onEnemyShotHitWorld: ((point: THREE.Vector3, normal: THREE.Vector3) => void) | null = null;

  constructor(
    scene: THREE.Scene,
    physics: PhysicsWorld,
    events: EventBus,
    getPlayerCollider: () => RAPIER.Collider,
  ) {
    this.scene = scene;
    this.physics = physics;
    this.events = events;
    this.getPlayerCollider = getPlayerCollider;

    // Pre-create a small pool of muzzle flash lights (max 4 concurrent)
    for (let i = 0; i < 4; i++) {
      const light = new THREE.PointLight(0xffaa33, 0, 8);
      light.visible = false;
      this.scene.add(light);
      this.muzzleFlashPool.push(light);
      this.muzzleFlashTimers.push(0);
    }

    // Listen for weapon fired events to track player gunshots
    this.events.on('weapon:fired', () => {
      this.playerFiredRecently = true;
      this.playerFiredTimer = 0.5;
    });
  }

  /** Set navmesh for pathfinding (called by level builder when level loads). */
  setNavMesh(nav: NavMesh | null): void {
    this.navMesh = nav;
  }

  /** Get navmesh for pathfinding. Returns null if not available (e.g. Quick Play). */
  getNavMesh(): NavMesh | null {
    return this.navMesh;
  }

  /** Set ground height callback for terrain following (custom quickplay). When set, enemies snap Y to ground each frame. */
  setGroundHeight(cb: (x: number, z: number, exclude: RAPIER.Collider) => number | null): void {
    this.getGroundHeight = cb;
  }

  /** Spawn an enemy at the given position */
  spawnEnemy(spawn: EnemySpawn): EnemyBase {
    const variant: GuardVariant = spawn.variant && GUARD_VARIANTS[spawn.variant]
      ? GUARD_VARIANTS[spawn.variant]
      : GUARD_VARIANTS.guard;
    const weapon: EnemyWeaponType = spawn.weapon ?? 'pistol';
    const enemy = new EnemyBase(
      this.physics,
      spawn.x, spawn.y, spawn.z,
      spawn.facingAngle,
      variant,
      weapon,
    );
    if (spawn.waypoints?.length) {
      enemy.waypoints = [...spawn.waypoints];
    }

    // Register AI states
    enemy.stateMachine.addState(createIdleState(this));
    enemy.stateMachine.addState(createPatrolState(this));
    enemy.stateMachine.addState(createAlertState(this));
    enemy.stateMachine.addState(createAttackState(this));

    const startState = enemy.waypoints.length >= 2 ? 'patrol' : 'idle';
    enemy.stateMachine.transition(startState, enemy);

    this.enemies.push(enemy);
    this.scene.add(enemy.group);

    return enemy;
  }

  /** Update player state (called each frame from Game) */
  setPlayerState(
    pos: THREE.Vector3,
    isMoving: boolean,
  ): void {
    this.playerPos.copy(pos);
    this.playerIsMoving = isMoving;
  }

  /** Allow enemies to target the player (false during game start grace period) */
  setPlayerTargetable(targetable: boolean): void {
    this.playerTargetable = targetable;
  }

  getPlayerPosition(): THREE.Vector3 {
    return this.playerPos;
  }

  /** Update camera position for sprite billboarding */
  setCameraPosition(pos: THREE.Vector3): void {
    this.cameraPos.copy(pos);
  }

  /** Get perception result for an enemy */
  getPerception(enemy: EnemyBase): PerceptionResult | null {
    if (enemy.dead) return null;
    return perceivePlayer(
      enemy,
      this.playerPos,
      this.getPlayerCollider(),
      this.physics,
      this.playerIsMoving,
      this.playerFiredRecently,
      this.playerTargetable,
    );
  }

  /** Sync enemy mesh position to physics body */
  syncPhysicsBody(enemy: EnemyBase): void {
    const pos = enemy.group.position;
    const bodyH = 0.7 + 0.3; // half height + radius
    enemy.rigidBody.setNextKinematicTranslation(
      new RAPIER.Vector3(pos.x, pos.y + bodyH, pos.z),
    );
  }

  /** Alert nearby enemies when one spots the player */
  propagateAlert(sourceEnemy: EnemyBase): void {
    if (sourceEnemy.alertCooldown > 0) return;
    sourceEnemy.alertCooldown = 2;

    for (const enemy of this.enemies) {
      if (enemy === sourceEnemy || enemy.dead) continue;
      const dist = enemy.group.position.distanceTo(sourceEnemy.group.position);
      if (dist <= ALERT_PROPAGATION_RANGE) {
        const state = enemy.stateMachine.currentName;
        if (state === 'idle') {
          enemy.lastKnownPlayerPos = sourceEnemy.lastKnownPlayerPos?.clone() ?? null;
          enemy.stateMachine.transition('alert', enemy);
        }
      }
    }
  }

  private readonly _muzzlePos = new THREE.Vector3();
  private readonly _forward = new THREE.Vector3();

  /** Fire at the player from an enemy (called by attack state) */
  enemyFireAtPlayer(enemy: EnemyBase): void {
    const enemyPos = enemy.getHeadPosition();
    const stats = enemy.weaponStats;
    const baseDir = new THREE.Vector3()
      .subVectors(this.playerPos, enemyPos)
      .normalize();

    let totalDamage = 0;
    let worldHitReported = false; // One decal per shot burst

    for (let r = 0; r < stats.raysPerShot; r++) {
      const dir = baseDir.clone();
      if (stats.raysPerShot > 1) {
        const cone = stats.spreadCone;
        dir.x += (Math.random() - 0.5) * cone;
        dir.y += (Math.random() - 0.5) * cone * 0.5;
        dir.z += (Math.random() - 0.5) * cone;
      } else {
        const spread = stats.spread;
        dir.x += (Math.random() - 0.5) * spread;
        dir.y += (Math.random() - 0.5) * spread * 0.5;
        dir.z += (Math.random() - 0.5) * spread;
      }
      dir.normalize();

      const hit = this.physics.castRay(
        enemyPos.x, enemyPos.y, enemyPos.z,
        dir.x, dir.y, dir.z,
        stats.range,
        enemy.collider,
      );

      if (hit) {
        if (hit.collider.handle === this.getPlayerCollider().handle) {
          totalDamage += stats.damage;
        } else if (!worldHitReported && !this.getEnemyByCollider(hit.collider)) {
          worldHitReported = true;
          const point = new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z);
          const normal = new THREE.Vector3(-dir.x, -dir.y, -dir.z);
          this.onEnemyShotHitWorld?.(point, normal);
        }
      }
    }

    // Visual: muzzle flash at weapon tip (in front of head)
    this._forward.set(Math.sin(enemy.facingAngle), 0, Math.cos(enemy.facingAngle));
    this._muzzlePos.copy(enemyPos).add(this._forward.multiplyScalar(0.4));
    this.flashEnemyMuzzle(this._muzzlePos);

    // Audio: weapon-specific sound
    playGunshotWeapon(enemy.weaponType);

    if (totalDamage > 0) {
      const mult = GameSettings.getEnemyDamageMultiplier();
      this.onPlayerHit?.(totalDamage * mult, enemyPos);
    }
  }

  private flashEnemyMuzzle(pos: THREE.Vector3): void {
    let idx = this.muzzleFlashTimers.findIndex(t => t <= 0);
    if (idx === -1) idx = 0;
    const light = this.muzzleFlashPool[idx];
    light.position.copy(pos);
    light.intensity = 35;
    light.visible = true;
    this.muzzleFlashTimers[idx] = 0.1;
  }

  /** Find best aim-assist target in forward cone. Returns target pos and angle off crosshair, or null. */
  getBestAimAssistTarget(
    cameraPos: THREE.Vector3,
    lookDir: THREE.Vector3,
    maxAngleRad: number,
    maxDist: number,
  ): { target: THREE.Vector3; angleOff: number; dist: number } | null {
    const toTarget = new THREE.Vector3();
    let best: { target: THREE.Vector3; angleOff: number; dist: number } | null = null;

    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const aimPoint = enemy.getHeadPosition();
      toTarget.subVectors(aimPoint, cameraPos);
      const dist = toTarget.length();
      if (dist > maxDist || dist < 0.5) continue;
      toTarget.divideScalar(dist);
      const dot = lookDir.dot(toTarget);
      const angleOff = Math.acos(Math.max(-1, Math.min(1, dot)));
      if (angleOff > maxAngleRad) continue;
      if (!best || angleOff < best.angleOff) {
        best = { target: aimPoint, angleOff, dist };
      }
    }
    return best;
  }

  /** Check if a Rapier collider belongs to an enemy, and if so return that enemy */
  getEnemyByCollider(collider: RAPIER.Collider): EnemyBase | null {
    for (const enemy of this.enemies) {
      if (enemy.collider.handle === collider.handle) return enemy;
    }
    return null;
  }

  /** Damage all living enemies within radius of center (e.g. gas cloud). */
  damageEnemiesInRadius(center: THREE.Vector3, radius: number, damage: number): void {
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const dist = enemy.group.position.distanceTo(center);
      if (dist <= radius) {
        enemy.takeDamage(damage);
        if (enemy.dead) {
          this.removeEnemyPhysics(enemy);
          this.events.emit('enemy:killed', {
            position: enemy.group.position.clone(),
          });
        }
      }
    }
  }

  /** Compute a repulsion force pushing enemy away from nearby allies to prevent overlap. */
  private readonly _repulsion = new THREE.Vector3();
  private readonly _diff = new THREE.Vector3();
  private static readonly MIN_SEPARATION = 1.5;

  getRepulsionForce(enemy: EnemyBase): THREE.Vector3 {
    this._repulsion.set(0, 0, 0);
    const pos = enemy.group.position;
    for (const other of this.enemies) {
      if (other === enemy || other.dead) continue;
      this._diff.subVectors(pos, other.group.position);
      this._diff.y = 0;
      const dist = this._diff.length();
      if (dist < EnemyManager.MIN_SEPARATION && dist > 0.01) {
        // Inverse-distance repulsion: closer = stronger
        this._diff.normalize().multiplyScalar((EnemyManager.MIN_SEPARATION - dist) / EnemyManager.MIN_SEPARATION);
        this._repulsion.add(this._diff);
      }
    }
    return this._repulsion;
  }

  /** Clear all enemies (for level switch). Removes from scene, physics, disposes models. */
  clear(): void {
    for (const enemy of this.enemies) {
      this.scene.remove(enemy.group);
      this.removeEnemyPhysics(enemy);
      if ('disposeRagdoll' in enemy.model && typeof (enemy.model as any).disposeRagdoll === 'function') {
        (enemy.model as any).disposeRagdoll();
      }
      if ('dispose' in enemy.model && typeof (enemy.model as any).dispose === 'function') {
        (enemy.model as any).dispose();
      }
    }
    this.enemies = [];
  }

  /** Remove an enemy's physics body and collider so the player can walk through corpses. Call when enemy dies. */
  removeEnemyPhysics(enemy: EnemyBase): void {
    try {
      this.physics.removeCollider(enemy.collider, true);
      this.physics.removeRigidBody(enemy.rigidBody);
    } catch {
      // Already removed or invalid
    }
  }

  update(dt: number): void {
    // Update player fired timer
    if (this.playerFiredTimer > 0) {
      this.playerFiredTimer -= dt;
      if (this.playerFiredTimer <= 0) {
        this.playerFiredRecently = false;
      }
    }

    // Fade pooled muzzle flash lights
    for (let i = 0; i < this.muzzleFlashPool.length; i++) {
      if (this.muzzleFlashTimers[i] > 0) {
        this.muzzleFlashTimers[i] -= dt;
        if (this.muzzleFlashTimers[i] <= 0) {
          this.muzzleFlashPool[i].visible = false;
          this.muzzleFlashPool[i].intensity = 0;
        } else {
          this.muzzleFlashPool[i].intensity = (this.muzzleFlashTimers[i] / 0.1) * 35;
        }
      }
    }

    // Update all enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      enemy.update(dt, this.cameraPos);

      // Snap enemy Y to terrain when ground height callback is set (custom quickplay)
      if (!enemy.dead && this.getGroundHeight) {
        const pos = enemy.group.position;
        const groundY = this.getGroundHeight(pos.x, pos.z, enemy.collider);
        if (groundY != null) {
          pos.y = groundY - 0.3;
          this.syncPhysicsBody(enemy);
        }
      }

      // Remove dead enemies after delay
      if (enemy.dead) {
        if (enemy.deathTimer > DEAD_REMOVAL_TIME) {
          if ('disposeRagdoll' in enemy.model && typeof enemy.model.disposeRagdoll === 'function') {
            enemy.model.disposeRagdoll();
          }
          this.scene.remove(enemy.group);
          this.enemies.splice(i, 1);
        }
      }
    }
  }

  get aliveCount(): number {
    return this.enemies.filter((e) => !e.dead).length;
  }

  get totalCount(): number {
    return this.enemies.length;
  }
}
