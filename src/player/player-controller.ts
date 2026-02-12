import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { InputManager } from '../core/input-manager';
import { PhysicsWorld } from '../core/physics-world';
import { FPSCamera } from './fps-camera';

const MOVE_SPEED = 6;
const SPRINT_MULTIPLIER = 1.65;
const CROUCH_SPEED_MULTIPLIER = 0.4;
const JUMP_VELOCITY = 5;
const GRAVITY = -15;
const PLAYER_RADIUS = 0.3;
const PLAYER_HALF_HEIGHT = 0.6;
const CROUCH_HALF_HEIGHT = 0.35;
const EYE_HEIGHT = 1.5;       // From ground to camera when standing
const EYE_HEIGHT_CROUCH = 0.95; // From ground when crouching

export class PlayerController {
  private body: RAPIER.RigidBody;
  private collider: RAPIER.Collider;
  private characterController: RAPIER.KinematicCharacterController;
  private verticalVelocity = 0;
  private grounded = false;

  health = 100;
  armor = 0;
  maxHealth = 100;
  maxArmor = 100;

  /** Keys collected (e.g. 'red', 'blue') for locked doors */
  private keys = new Set<string>();

  /** Dead state - prevents movement and input */
  private dead = false;

  private readonly _forward = new THREE.Vector3();
  private readonly _right = new THREE.Vector3();
  private readonly _move = new THREE.Vector3();

  /** Crouch toggle (C key). When true, use shorter capsule and lower speed. */
  private crouching = false;
  /** Smooth crouch transition 0 = standing, 1 = fully crouched (for camera lerp). */
  private crouchTransition = 0;
  /** Current capsule half-height (standing or crouch). */
  private currentHalfHeight = PLAYER_HALF_HEIGHT;

  constructor(
    private physics: PhysicsWorld,
    private fpsCamera: FPSCamera,
    spawnX: number,
    spawnY: number,
    spawnZ: number,
  ) {
    const { world, rapier } = physics;

    // Create kinematic body
    const bodyDesc = rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(
      spawnX,
      spawnY + PLAYER_HALF_HEIGHT + PLAYER_RADIUS,
      spawnZ,
    );
    this.body = world.createRigidBody(bodyDesc);

    // Capsule collider
    const colliderDesc = rapier.ColliderDesc.capsule(
      PLAYER_HALF_HEIGHT,
      PLAYER_RADIUS,
    );
    this.collider = world.createCollider(colliderDesc, this.body);

    // Character controller for collision response
    this.characterController = world.createCharacterController(0.02);
    this.characterController.enableAutostep(0.3, 0.2, true);
    this.characterController.enableSnapToGround(0.3);
    this.characterController.setSlideEnabled(true);
  }

  update(input: InputManager, dt: number): void {
    // Don't process input if dead
    if (this.dead) {
      return;
    }

    // Crouch toggle (C)
    if (input.wasKeyJustPressed('c')) {
      this.crouching = !this.crouching;
    }
    // Apply crouch: resize collider and move body so feet stay on ground
    this.updateCrouchState(dt);

    this.fpsCamera.getForward(this._forward);
    this.fpsCamera.getRight(this._right);

    const sprinting = input.isKeyDown('Shift') && !this.crouching;
    let speed = MOVE_SPEED * (this.crouching ? CROUCH_SPEED_MULTIPLIER : sprinting ? SPRINT_MULTIPLIER : 1);

    // Compute desired horizontal movement
    this._move.set(0, 0, 0);
    if (input.isKeyDown('w')) this._move.add(this._forward);
    if (input.isKeyDown('s')) this._move.sub(this._forward);
    if (input.isKeyDown('d')) this._move.add(this._right);
    if (input.isKeyDown('a')) this._move.sub(this._right);

    if (this._move.lengthSq() > 0) {
      this._move.normalize().multiplyScalar(speed * dt);
    }

    // Vertical movement (gravity + jump). Can't jump while crouching; standing required.
    if (this.grounded && input.isKeyDown(' ') && !this.crouching) {
      this.verticalVelocity = JUMP_VELOCITY;
      this.grounded = false;
    }

    this.verticalVelocity += GRAVITY * dt;
    this._move.y = this.verticalVelocity * dt;

    // Run Rapier character controller
    this.characterController.computeColliderMovement(
      this.collider,
      new RAPIER.Vector3(this._move.x, this._move.y, this._move.z),
    );

    this.grounded = this.characterController.computedGrounded();
    if (this.grounded && this.verticalVelocity < 0) {
      this.verticalVelocity = 0;
    }

    const corrected = this.characterController.computedMovement();
    const pos = this.body.translation();
    const newPos = {
      x: pos.x + corrected.x,
      y: pos.y + corrected.y,
      z: pos.z + corrected.z,
    };
    this.body.setNextKinematicTranslation(
      new RAPIER.Vector3(newPos.x, newPos.y, newPos.z),
    );

    // Position camera: lerp eye height between standing and crouch
    const bodyPos = this.body.translation();
    const capsuleBottom = bodyPos.y - (this.currentHalfHeight + PLAYER_RADIUS);
    const standEyeY = capsuleBottom + EYE_HEIGHT;
    const crouchEyeY = capsuleBottom + EYE_HEIGHT_CROUCH;
    const eyeY = standEyeY + (crouchEyeY - standEyeY) * this.crouchTransition;
    this.fpsCamera.setPosition(bodyPos.x, eyeY, bodyPos.z);
  }

  /** Resize capsule when crouching/standing and smooth crouch transition. */
  private updateCrouchState(dt: number): void {
    const targetTransition = this.crouching ? 1 : 0;
    this.crouchTransition += (targetTransition - this.crouchTransition) * Math.min(1, dt * 12);

    const targetHalfHeight = this.crouching ? CROUCH_HALF_HEIGHT : PLAYER_HALF_HEIGHT;
    if (targetHalfHeight === this.currentHalfHeight) return;

    const bodyPos = this.body.translation();
    const oldBottom = bodyPos.y - (this.currentHalfHeight + PLAYER_RADIUS);
    this.currentHalfHeight = targetHalfHeight;
    this.physics.world.removeCollider(this.collider, true);
    const colliderDesc = this.physics.rapier.ColliderDesc.capsule(
      this.currentHalfHeight,
      PLAYER_RADIUS,
    );
    this.collider = this.physics.world.createCollider(colliderDesc, this.body);
    const newY = oldBottom + this.currentHalfHeight + PLAYER_RADIUS;
    this.body.setTranslation(new RAPIER.Vector3(bodyPos.x, newY, bodyPos.z), true);
  }

  get isCrouching(): boolean {
    return this.crouching || this.crouchTransition > 0.1;
  }

  getPosition(): { x: number; y: number; z: number } {
    const t = this.body.translation();
    return { x: t.x, y: t.y, z: t.z };
  }

  /** Teleport player (e.g. level spawn). Resets to standing. */
  setPosition(x: number, y: number, z: number): void {
    this.crouching = false;
    this.crouchTransition = 0;
    if (this.currentHalfHeight !== PLAYER_HALF_HEIGHT) {
      this.physics.world.removeCollider(this.collider, true);
      this.collider = this.physics.world.createCollider(
        this.physics.rapier.ColliderDesc.capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS),
        this.body,
      );
      this.currentHalfHeight = PLAYER_HALF_HEIGHT;
    }
    const bodyY = y + PLAYER_HALF_HEIGHT + PLAYER_RADIUS;
    this.body.setTranslation(
      new RAPIER.Vector3(x, bodyY, z),
      true,
    );
    const eyeY = bodyY - (PLAYER_HALF_HEIGHT * 2 + PLAYER_RADIUS * 2) + EYE_HEIGHT;
    this.fpsCamera.setPosition(x, eyeY, z);
  }

  hasKey(keyId: string): boolean {
    return this.keys.has(keyId);
  }

  getKeys(): string[] {
    return Array.from(this.keys);
  }

  giveKey(keyId: string): void {
    this.keys.add(keyId);
  }

  getCollider(): RAPIER.Collider {
    return this.collider;
  }

  takeDamage(amount: number): void {
    if (this.armor > 0) {
      // Armor absorbs 60% of damage
      const armorAbsorb = Math.min(this.armor, amount * 0.6);
      this.armor -= armorAbsorb;
      amount -= armorAbsorb;
    }
    this.health = Math.max(0, this.health - amount);
  }

  heal(amount: number): void {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  addArmor(amount: number): void {
    this.armor = Math.min(this.maxArmor, this.armor + amount);
  }

  /**
   * Mark player as dead (disables movement).
   */
  setDead(isDead: boolean): void {
    this.dead = isDead;
  }

  /**
   * Check if player is dead.
   */
  isDead(): boolean {
    return this.dead;
  }

  /**
   * Respawn player (reset health, armor, and enable movement).
   */
  respawn(): void {
    this.dead = false;
    this.health = 100;
    this.armor = 0;
    this.verticalVelocity = 0;
  }
}
