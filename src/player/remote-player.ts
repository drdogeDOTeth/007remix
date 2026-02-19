import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { buildPlayerModel, buildAnimatedPlayerFromCharacter, animatePlayerMovement, playFireAnimation, updateAimingPose, setPlayerWeapon } from './player-model';
import { getCachedAvatarModel } from '../core/model-loader';
import type { CustomPlayerAnimator } from './custom-player-animator';
import { InterpolationBuffer } from '../network/interpolation-buffer';
import type { PlayerStateUpdate } from '../network/network-events';
import type { PhysicsWorld } from '../core/physics-world';
import { WeaponViewModel } from '../weapons/weapon-view-model';
import type { WeaponType } from '../weapons/weapon-view-model';
import { ENEMY_RENDER_CONFIG } from '../enemies/enemy-render-config';
import { EnemySprite } from '../enemies/sprite/enemy-sprite';
import { getPreloadedSpriteTexture, GUARD_VARIANTS } from '../enemies/sprite/guard-sprite-sheet';
import { bakeGuardSpriteSheet, bakeCustomModelSpriteSheet } from '../enemies/sprite/sprite-baker';

/** Callback to get camera world position for sprite billboarding */
type GetCameraPosition = () => THREE.Vector3;

/** Callback to get ground height at (x,z) for terrain snapping (Custom Arena). */
type GetGroundHeight = (x: number, z: number) => number;

/**
 * RemotePlayer represents another player in the multiplayer game.
 * Handles rendering, interpolation, animation, and physics collider.
 * Supports both 3D model and 2D sprite modes (when ENEMY_RENDER_CONFIG.mode === 'sprite').
 */
export class RemotePlayer {
  public id: string;
  public username: string;
  public model: THREE.Group;
  public shadowMesh: THREE.Mesh;
  public collider: RAPIER.Collider;
  private rigidBody: RAPIER.RigidBody;
  private interpolationBuffer: InterpolationBuffer;
  private currentState: PlayerStateUpdate | null = null;
  private _isDead = false;
  private physics: PhysicsWorld;

  /** Whether this player is currently dead (playing death animation). */
  get isDead(): boolean {
    return this._isDead;
  }
  private deathAnimationProgress = 0;
  private ragdollActive = false;
  private attackLockoutUntil = 0;
  private currentWeaponType: WeaponType = 'pistol';
  private weaponViewModel: WeaponViewModel | null = null;
  private flashlight: THREE.SpotLight | null = null;

  // Smoothed position for even smoother rendering
  private smoothedPosition = new THREE.Vector3();
  private smoothedRotation = 0;
  private hasInitialPosition = false;

  /** Override rotation from weapon fire - bypasses interpolation so aim is correct immediately */
  private rotationOverrideYaw: number | null = null;
  private rotationOverrideUntil = 0;

  /** When set, drives animation for custom GLB/VRM models (replaces procedural animatePlayerMovement) */
  private customAnimator: CustomPlayerAnimator | null = null;

  /** When true, use 2D sprite instead of 3D model (same as enemy sprite mode) */
  private spriteMode = false;
  private sprite: EnemySprite | null = null;
  private getCameraPosition: GetCameraPosition | null = null;
  private getGroundHeight: GetGroundHeight | null = null;

  constructor(
    id: string,
    username: string,
    scene: THREE.Scene,
    physics: PhysicsWorld,
    getCameraPosition: GetCameraPosition | null = null,
    getGroundHeight: GetGroundHeight | null = null
  ) {
    this.id = id;
    this.username = username;
    this.physics = physics;
    this.getCameraPosition = getCameraPosition;
    this.getGroundHeight = getGroundHeight;

    const cfg = ENEMY_RENDER_CONFIG;

    if (cfg.mode === 'sprite') {
      // 2D sprite mode: use EnemySprite; prefer custom avatar model (same logic as enemies + custom model)
      this.spriteMode = true;
      let spriteSource: THREE.Texture | typeof GUARD_VARIANTS.guard;
      const cachedAvatar = getCachedAvatarModel();
      if (cachedAvatar) {
        spriteSource = bakeCustomModelSpriteSheet(cachedAvatar);
      } else if (cfg.spriteSource === 'image' && cfg.spriteImageUrl) {
        const tex = getPreloadedSpriteTexture();
        spriteSource = tex ?? GUARD_VARIANTS.guard;
      } else if (cfg.spriteSource === 'baked') {
        spriteSource = bakeGuardSpriteSheet('guard', 'pistol');
      } else {
        spriteSource = GUARD_VARIANTS.guard;
      }
      this.sprite = new EnemySprite(spriteSource, 'pistol');
      this.model = new THREE.Group();
      this.model.add(this.sprite.mesh);
      this.model.add(this.sprite.shadowMesh);
      this.shadowMesh = this.sprite.shadowMesh;
      scene.add(this.model);
    } else {
      // 3D model mode
      const customChar = getCachedAvatarModel();
      if (customChar) {
        const result = buildAnimatedPlayerFromCharacter(id, customChar);
        this.model = result.model;
        this.customAnimator = result.animator;
      } else {
        this.model = buildPlayerModel(id);
        this.model.scale.setScalar(1.25);
      }
      scene.add(this.model);
      console.log(`[RemotePlayer] Added 3D model to scene for ${id}, scene children: ${scene.children.length}`);

      // Create blob shadow (scaled to match human-sized player)
      const shadowGeometry = new THREE.CircleGeometry(0.38, 16);
      const shadowMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.3,
      });
      this.shadowMesh = new THREE.Mesh(shadowGeometry, shadowMaterial);
      this.shadowMesh.rotation.x = -Math.PI / 2;
      this.shadowMesh.position.y = 0.01;
      scene.add(this.shadowMesh);

      // Create weapon view model and attach weapon mesh
      this.weaponViewModel = new WeaponViewModel();
      if (this.customAnimator) {
        setPlayerWeapon(this.model, null, 'pistol');
      } else {
        const weaponMesh = this.weaponViewModel.buildWeaponMeshForPreview('pistol', 'default');
        setPlayerWeapon(this.model, weaponMesh);
      }

      // Create flashlight (spotlight attached to model - close to player, at chest/head height)
      this.flashlight = new THREE.SpotLight(0xffe8cc, 0, 30, Math.PI / 6, 0.35, 1.5);
      this.flashlight.position.set(0, 1.4, 0.15); // At chest height, slightly forward (weapon area)
      this.flashlight.target.position.set(0, 1.2, -1.5); // Point forward (-Z in model space) for both procedural and custom models
      this.model.add(this.flashlight);
      this.model.add(this.flashlight.target);
    }

    // Create physics collider (kinematic capsule for hit detection) - used in both modes
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 1, 0);
    this.rigidBody = physics.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.capsule(0.9, 0.3); // Standing capsule
    this.collider = physics.world.createCollider(colliderDesc, this.rigidBody);
    this.collider.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    this.interpolationBuffer = new InterpolationBuffer(50); // 50ms delay — 1 snapshot interval at 20Hz
  }

  /**
   * Update remote player state from server snapshot.
   */
  updateFromServer(state: PlayerStateUpdate): void {
    // Detect large position jumps (respawn, teleport) - clear buffer to avoid interpolating across the gap
    if (this.currentState) {
      const dx = state.position.x - this.currentState.position.x;
      const dy = state.position.y - this.currentState.position.y;
      const dz = state.position.z - this.currentState.position.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq > 100) {
        this.interpolationBuffer.clear();
        this.hasInitialPosition = false;
      }
    }
    this.interpolationBuffer.addSnapshot(state.timestamp, state);
    this.currentState = state;
  }

  /**
   * Update player rendering (called each frame).
   */
  update(dt: number): void {
    if (!this.currentState) return;

    // Handle death animation
    if (this._isDead) {
      this.deathAnimationProgress += dt * 2; // 0.5 second animation

      if (this.spriteMode && this.sprite) {
        this.sprite.update(dt);
        // Death holds last frame when animator finishes
      } else if (this.customAnimator) {
        this.customAnimator.update(dt);
        if (!this.ragdollActive) {
          this.model.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material instanceof THREE.Material) {
              child.material.transparent = true;
              child.material.opacity = 1 - this.deathAnimationProgress;
            }
          });
        } else {
          this.model.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material instanceof THREE.Material) {
              child.material.transparent = true;
              child.material.opacity = Math.max(0, 1 - this.deathAnimationProgress * 1.2);
            }
          });
        }
      } else {
        // Procedural: fall down, rotate, sink, fade
        this.model.rotation.x = -Math.PI / 2 * this.deathAnimationProgress;
        this.model.position.y -= dt * 2;
        this.model.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.Material) {
            child.material.transparent = true;
            child.material.opacity = 1 - this.deathAnimationProgress;
          }
        });
      }

      if (this.deathAnimationProgress >= 1) {
        this.model.visible = false;
        this.shadowMesh.visible = false;
      }
      return;
    }

    // Get interpolated state
    const renderTime = performance.now();
    const interpolatedState = this.interpolationBuffer.getInterpolatedState(renderTime);

    if (interpolatedState) {
      // Initialize smoothed position on first update
      if (!this.hasInitialPosition) {
        this.smoothedPosition.set(
          interpolatedState.position.x,
          interpolatedState.position.y,
          interpolatedState.position.z
        );
        this.smoothedRotation = interpolatedState.rotation;
        this.hasInitialPosition = true;
      }

      // Drive position directly from interpolation buffer — no extra smoothing needed,
      // the buffer already interpolates between snapshots for smooth movement.
      this.smoothedPosition.set(
        interpolatedState.position.x,
        interpolatedState.position.y,
        interpolatedState.position.z,
      );

      // Rotation: dt-based exponential smoothing (frame-rate independent, fast response)
      const rotAlpha = 1 - Math.exp(-dt * 20); // ~20 rad/s convergence speed
      let rotDiff = interpolatedState.rotation - this.smoothedRotation;
      if (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
      if (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
      this.smoothedRotation += rotDiff * rotAlpha;

      // Clear rotation override when expired
      if (performance.now() >= this.rotationOverrideUntil) {
        this.rotationOverrideYaw = null;
      }

      // Use same position for collider and model so hitbox matches what you see
      const pos = interpolatedState.position;
      const capsuleFeetOffset = 0.9; // halfHeight 0.6 + radius 0.3

      this.rigidBody.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);

      // Model: use server position so visual matches collider. Optional terrain snap
      // only nudges down if we'd otherwise be floating (avoids model above hitbox).
      let modelY = pos.y - capsuleFeetOffset;
      if (this.getGroundHeight) {
        const terrainY = this.getGroundHeight(pos.x, pos.z);
        if (terrainY < modelY - 0.2) {
          modelY = terrainY; // Sink to terrain if we'd be floating
        }
      } else {
        const yOffset = this.spriteMode ? 1.0 : (this.customAnimator ? 1.0 : 1.3);
        modelY = pos.y - yOffset;
      }
      this.model.position.set(pos.x, modelY, pos.z);

      // Shadow: match model or collider feet
      if (!this.spriteMode) {
        this.shadowMesh.position.set(pos.x, modelY + 0.01, pos.z);
      }

      if (this.spriteMode && this.sprite && this.getCameraPosition) {
        // 2D sprite: billboard and animate
        const cameraPos = this.getCameraPosition();
        const playerPos = this.model.position.clone();
        playerPos.y += 1.0; // Sprite center height
        this.sprite.billboardToCamera(cameraPos, playerPos, 0);
        this.sprite.update(dt);
        // Play animation based on state
        if (performance.now() < this.attackLockoutUntil) {
          this.sprite.play('shoot');
        } else if (this.sprite.animator.currentAnimation === 'hit' && !this.sprite.animator.finished) {
          // Let hit play out
        } else {
          this.sprite.play(interpolatedState.isMoving ? 'walk' : 'idle');
        }
        // Weapon type affects procedural sprite frames; image sprites ignore
        const raw = interpolatedState.currentWeapon as string;
        this.currentWeaponType = raw === 'rifle' || raw === 'shotgun' || raw === 'sniper' ? raw : 'pistol';
      } else {
        // 3D model: rotation and animate; use fire-direction override when active
        const displayYaw = this.rotationOverrideYaw ?? this.smoothedRotation;
        this.model.rotation.y = displayYaw + (this.customAnimator ? 0 : Math.PI);

        if (this.customAnimator) {
          this.customAnimator.update(dt);
          if (performance.now() >= this.attackLockoutUntil) {
            const animState = interpolatedState.isMoving ? 'walk' : 'idle';
            this.customAnimator.play(animState);
          }
        } else {
          animatePlayerMovement(this.model, renderTime * 0.001, interpolatedState.isMoving);
          updateAimingPose(this.model);
        }

        // Update weapon if changed
        const raw = interpolatedState.currentWeapon as string;
        const canonical: WeaponType =
          raw === 'rifle' || raw === 'shotgun' || raw === 'sniper' ? raw :
          raw === 'kf7-soviet' ? 'rifle' : raw === 'sniper-rifle' ? 'sniper' : 'pistol';
        if (canonical !== this.currentWeaponType && this.weaponViewModel) {
          this.currentWeaponType = canonical;
          if (this.customAnimator) {
            setPlayerWeapon(this.model, null, this.currentWeaponType);
          } else {
            const weaponMesh = this.weaponViewModel.buildWeaponMeshForPreview(this.currentWeaponType, 'default');
            setPlayerWeapon(this.model, weaponMesh);
          }
        }
      }
    }
  }

  /**
   * Play weapon firing animation (muzzle flash, recoil, and attack clip for custom models).
   * Call when this player fires a weapon.
   */
  playFireAnimation(): void {
    this.attackLockoutUntil = performance.now() + 300;
    if (this.spriteMode && this.sprite) {
      this.sprite.play('shoot');
    } else {
      playFireAnimation(this.model);
      this.customAnimator?.play('attack');
    }
  }

  /**
   * Set aim direction from a world-space direction vector (e.g. from weapon fire event).
   * Uses a direct override so the victim sees the correct aim immediately (bypasses interpolation delay).
   */
  setAimFromDirection(direction: { x: number; y: number; z: number }): void {
    const { x, z } = direction;
    const len = Math.sqrt(x * x + z * z);
    if (len < 1e-6) return;
    // Yaw from direction; +PI so model faces toward aim (was 180° off)
    const yaw = Math.atan2(x, -z) + Math.PI;
    this.smoothedRotation = yaw;
    this.rotationOverrideYaw = yaw;
    this.rotationOverrideUntil = performance.now() + 350; // Hold until after fire animation
    this.interpolationBuffer.injectRotation(performance.now(), yaw);
  }

  /**
   * Play hit reaction animation when this player takes damage.
   * For custom models: plays hit clip from hit.json. For procedural: brief flinch via userData.
   * For sprites: triggerHitFlash + hit animation.
   */
  playHitAnimation(): void {
    if (this.spriteMode && this.sprite) {
      this.sprite.triggerHitFlash();
      this.sprite.play('hit');
    } else if (this.customAnimator) {
      this.customAnimator.play('hit');
    } else {
      this.model.userData.hitFlinchUntil = performance.now() + 200;
    }
  }

  /**
   * Get current position (for distance checks, etc.).
   */
  getPosition(): THREE.Vector3 {
    return this.model.position.clone();
  }

  /**
   * Get collider handle for identification.
   */
  getColliderHandle(): number {
    return this.collider.handle;
  }

  /**
   * Set flashlight state (on/off). No-op in sprite mode.
   */
  setFlashlight(isOn: boolean): void {
    if (this.flashlight) this.flashlight.intensity = isOn ? 40 : 0;
  }

  /**
   * Play death animation. Uses ragdoll for custom VRM models; otherwise death clip or procedural fall.
   * For sprites: plays death animation.
   */
  playDeathAnimation(): void {
    this._isDead = true;
    this.deathAnimationProgress = 0;
    this.ragdollActive = false;

    if (this.spriteMode && this.sprite) {
      this.sprite.play('death');
    } else if (this.customAnimator?.activateRagdoll) {
      const activated = this.customAnimator.activateRagdoll(this.physics, (pos, quat) => {
        this.model.position.copy(pos);
        this.model.quaternion.copy(quat);
      });
      if (activated) this.ragdollActive = true;
    }
    if (!this.ragdollActive && this.customAnimator) {
      this.customAnimator.play('death');
    }
  }

  /**
   * Reset after respawn.
   */
  resetAfterRespawn(): void {
    this._isDead = false;
    this.deathAnimationProgress = 0;
    this.ragdollActive = false;
    this.attackLockoutUntil = 0;
    this.rotationOverrideYaw = null;
    this.rotationOverrideUntil = 0;
    this.model.visible = true;
    this.model.rotation.x = 0;
    this.model.quaternion.identity();
    this.shadowMesh.visible = true;

    // Clear interpolation buffer so we don't blend from death position
    this.interpolationBuffer.clear();
    this.hasInitialPosition = false;

    if (this.spriteMode && this.sprite) {
      this.sprite.play('idle');
    } else {
      if (this.customAnimator) this.customAnimator.resetForRespawn();
      else delete this.model.userData.hitFlinchUntil;
      this.model.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.Material) {
          child.material.opacity = 1.0;
          child.material.transparent = false;
          child.material.needsUpdate = true;
        }
      });
    }
  }

  /**
   * Cleanup and remove from scene.
   */
  dispose(scene: THREE.Scene, physics: PhysicsWorld): void {
    scene.remove(this.model);
    if (!this.spriteMode) scene.remove(this.shadowMesh);

    physics.world.removeCollider(this.collider, true);

    if (this.spriteMode && this.sprite) {
      this.sprite.dispose();
    } else {
      this.model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) child.material.dispose();
        }
      });
      this.shadowMesh.geometry.dispose();
      if (this.shadowMesh.material instanceof THREE.Material) this.shadowMesh.material.dispose();
    }
  }
}
