import * as THREE from 'three';
import {
  generateMuzzleFlashTexture,
  MUZZLE_FLASH_FRAMES,
  getMuzzleFlashOffset,
} from './muzzle-flash-sprite';
import type { WeaponSkin } from './weapon-skins';
import { buildWeaponMesh, type WeaponType } from './weapon-mesh-factory';
import { updatePlasmaMaterial, isPlasmaMaterial } from './weapon-plasma-material';

export type { WeaponType };

/**
 * Renders a first-person weapon model attached to the camera.
 * GoldenEye style: weapon offset to the right side of screen with sway and recoil.
 */
export class WeaponViewModel {
  readonly group: THREE.Group;
  private weaponMesh: THREE.Group;
  private muzzleFlash: THREE.Mesh;
  private muzzleLight: THREE.PointLight;
  private flashTexture!: THREE.CanvasTexture;
  private flashTimer = 0;
  private currentType: WeaponType = 'pistol';
  private currentSkin: WeaponSkin = 'default';

  // Animation state
  private recoilOffset = 0;
  private swayX = 0;
  private swayY = 0;
  private bobPhase = 0;

  private restPosition = new THREE.Vector3(0.3, -0.28, -0.5);
  private readonly muzzleOffset = new THREE.Vector3(0, 0.04, -0.32); // per-weapon, at barrel tip

  // Scope
  private _scoped = false;
  private scopeTransition = 0;

  // Reload animation (tilts weapon down then back)
  private reloadAnimTime = 0;
  private reloadAnimDuration = 0;

  // Minigun barrel spin state
  private barrelSpinSpeed = 0;          // current radians/sec
  private barrelSpinAngle = 0;          // accumulated rotation in radians
  private _minigunFiring = false;
  private readonly BARREL_SPIN_MAX = 25; // max rad/sec (~4 full rotations/sec)
  private readonly BARREL_SPIN_ACCEL = 40; // rad/sec²
  private readonly BARREL_SPIN_DECEL = 20; // rad/sec²

  constructor() {
    this.group = new THREE.Group();
    this.group.renderOrder = 999;

    this.weaponMesh = this.buildWeaponMesh('pistol', 'default');
    this.weaponMesh.position.copy(this.restPosition);
    this.group.add(this.weaponMesh);

    // Muzzle flash — procedural sprite atlas with additive blending
    const flashTex = generateMuzzleFlashTexture();
    this.flashTexture = flashTex.clone();
    this.flashTexture.needsUpdate = true;
    this.flashTexture.repeat.set(1 / MUZZLE_FLASH_FRAMES, 1);

    const flashGeo = new THREE.PlaneGeometry(0.2, 0.2);
    const flashMat = new THREE.MeshBasicMaterial({
      map: this.flashTexture,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    this.muzzleFlash = new THREE.Mesh(flashGeo, flashMat);
    this.muzzleFlash.position.copy(this.muzzleOffset);
    this.weaponMesh.add(this.muzzleFlash);

    this.muzzleLight = new THREE.PointLight(0xffaa33, 0, 8);
    this.muzzleLight.position.copy(this.muzzleOffset);
    this.weaponMesh.add(this.muzzleLight);
  }

  get scoped(): boolean {
    return this._scoped;
  }

  switchWeapon(type: WeaponType, skin: WeaponSkin = 'default'): void {
    this.currentType = type;
    this.currentSkin = skin;
    this._scoped = false;
    this.scopeTransition = 0;

    this.group.remove(this.weaponMesh);
    this.weaponMesh = this.buildWeaponMesh(type, skin);
    this.group.add(this.weaponMesh);

    // Per-weapon rest position and muzzle offset (at barrel tip — flash at muzzle opening)
    if (type === 'rifle') {
      this.restPosition.set(0.28, -0.3, -0.5);
      this.muzzleOffset.set(0, 0.03, -0.54);
    } else if (type === 'shotgun') {
      this.restPosition.set(0.25, -0.32, -0.45);
      this.muzzleOffset.set(0, 0.03, -0.46);
    } else if (type === 'sniper') {
      this.restPosition.set(0.3, -0.3, -0.55);
      this.muzzleOffset.set(0, 0.03, -0.55);
    } else if (type === 'minigun') {
      this.restPosition.set(0.22, -0.28, -0.42);
      this.muzzleOffset.set(0, 0.042, -0.54);
    } else if (type === 'rpg') {
      this.restPosition.set(0.15, -0.22, -0.54);
      this.muzzleOffset.set(0, 0.0, -0.68);
    } else if (type === 'grenade-launcher') {
      this.restPosition.set(0.28, -0.28, -0.42);
      this.muzzleOffset.set(0, 0.01, -0.40);
    } else {
      this.restPosition.set(0.3, -0.28, -0.5);
      this.muzzleOffset.set(0, 0.04, -0.32);
    }
    
    // Re-attach flash/light (AFTER muzzleOffset is updated)
    this.muzzleFlash.position.copy(this.muzzleOffset);
    this.weaponMesh.add(this.muzzleFlash);
    this.muzzleLight.position.copy(this.muzzleOffset);
    this.weaponMesh.add(this.muzzleLight);
    
    this.weaponMesh.position.copy(this.restPosition);
  }

  /** Refresh current weapon mesh with a new skin (same type). */
  setSkin(skin: WeaponSkin): void {
    this.currentSkin = skin;
    this.group.remove(this.weaponMesh);
    this.weaponMesh = this.buildWeaponMesh(this.currentType, skin);
    this.group.add(this.weaponMesh);
    this.weaponMesh.position.copy(this.restPosition);
    // Apply current muzzle offset before attaching
    this.muzzleFlash.position.copy(this.muzzleOffset);
    this.weaponMesh.add(this.muzzleFlash);
    this.muzzleLight.position.copy(this.muzzleOffset);
    this.weaponMesh.add(this.muzzleLight);
  }

  setScoped(scoped: boolean): void {
    this._scoped = scoped;
  }

  triggerRecoil(): void {
    const strength = this.currentType === 'shotgun' ? 1.6
      : this.currentType === 'sniper' ? 1.4
      : this.currentType === 'rifle' ? 0.6
      : this.currentType === 'minigun' ? 0.25   // Very light per-shot recoil — fires 20/s
      : this.currentType === 'rpg' ? 2.2         // Heavy kick
      : this.currentType === 'grenade-launcher' ? 1.8
      : 1.0;
    this.recoilOffset = strength;
    this.flashTimer = 0.05;
  }

  /** Start the reload animation (weapon tilts down then back over duration seconds). */
  startReloadAnimation(duration: number): void {
    this.reloadAnimDuration = duration;
    this.reloadAnimTime = 0;
  }

  update(dt: number, isMoving: boolean, isSprinting = false): void {
    // Scope transition
    const targetScope = this._scoped ? 1 : 0;
    this.scopeTransition += (targetScope - this.scopeTransition) * dt * 10;

    // Recoil
    this.recoilOffset = Math.max(0, this.recoilOffset - dt * 8);
    const recoilZ = this.recoilOffset * 0.06;
    const recoilY = this.recoilOffset * 0.03;

    // Bob (stronger when sprinting)
    if (isMoving) {
      this.bobPhase += dt * (isSprinting ? 14 : 10);
    } else {
      this.bobPhase += dt * 2;
    }
    const bobAmount = isSprinting ? 0.022 : isMoving ? 0.012 : 0.003;
    const bobX = Math.sin(this.bobPhase) * bobAmount;
    const bobY = Math.abs(Math.cos(this.bobPhase)) * bobAmount * 0.7;

    // Sway
    this.swayX += (0 - this.swayX) * dt * 3;
    this.swayY += (0 - this.swayY) * dt * 3;

    // Scoped: weapon moves to center
    const scopedPos = new THREE.Vector3(0, -0.15, -0.3);
    const hipX = this.restPosition.x + bobX + this.swayX;
    const hipY = this.restPosition.y + bobY + recoilY + this.swayY;
    const hipZ = this.restPosition.z + recoilZ;

    let finalX = THREE.MathUtils.lerp(hipX, scopedPos.x, this.scopeTransition);
    let finalY = THREE.MathUtils.lerp(hipY, scopedPos.y + recoilY, this.scopeTransition);
    let finalZ = THREE.MathUtils.lerp(hipZ, scopedPos.z + recoilZ, this.scopeTransition);

    // Reload animation: weapon tilt + magazine out/in or shells one-by-one
    let reloadTilt = 0;
    const isShotgun = this.currentType === 'shotgun';
    const isMagFed = this.currentType === 'pistol' || this.currentType === 'rifle' || this.currentType === 'sniper';
    if (this.reloadAnimTime < this.reloadAnimDuration) {
      this.reloadAnimTime += dt;
      const t = Math.min(1, this.reloadAnimTime / this.reloadAnimDuration);
      if (t < 0.2) {
        reloadTilt = t / 0.2;
      } else if (t < 0.7) {
        reloadTilt = 1;
      } else {
        reloadTilt = (1 - t) / 0.3;
      }
      finalY += reloadTilt * -0.06;
      finalZ += reloadTilt * 0.03;

      if (isMagFed) {
        const mag = this.weaponMesh.getObjectByName('reloadMag') as (THREE.Mesh & { userData: { restY: number } }) | undefined;
        if (mag?.userData?.restY != null) {
          const restY = mag.userData.restY as number;
          let magOut = 0;
          if (t < 0.25) {
            magOut = t / 0.25;
          } else if (t < 0.48) {
            magOut = 1;
          } else if (t < 0.72) {
            magOut = 1 - (t - 0.48) / 0.24;
          }
          mag.position.y = restY + magOut * -0.12;
        }
      }

      if (isShotgun) {
        const loadX = -0.055, loadY = -0.045, loadZ = -0.08;
        for (let i = 1; i <= 5; i++) {
          const shell = this.weaponMesh.getObjectByName(`reloadShell${i}`) as (THREE.Mesh & { userData: { restZ: number } }) | undefined;
          if (shell?.userData?.restZ == null) continue;
          const restZ = (shell as THREE.Mesh & { userData: { restZ: number } }).userData.restZ;
          const t0 = 0.05 + (i - 1) * 0.18;
          const t1 = t0 + 0.18;
          let u = 0;
          if (t >= t1) u = 1;
          else if (t > t0) u = (t - t0) / (t1 - t0);
          shell.position.x = THREE.MathUtils.lerp(loadX, 0, u);
          shell.position.y = THREE.MathUtils.lerp(loadY, -0.01, u);
          shell.position.z = THREE.MathUtils.lerp(loadZ, restZ, u);
        }
      }
    } else if (isMagFed) {
      const mag = this.weaponMesh.getObjectByName('reloadMag') as (THREE.Mesh & { userData: { restY: number } }) | undefined;
      if (mag?.userData?.restY != null) {
        mag.position.y = mag.userData.restY as number;
      }
    }
    this.weaponMesh.position.set(finalX, finalY, finalZ);
    this.weaponMesh.rotation.x = reloadTilt * 0.4;
    this.weaponMesh.rotation.z = reloadTilt * 0.12;

    // Minigun barrel spin animation
    if (this.currentType === 'minigun') {
      if (this._minigunFiring) {
        this.barrelSpinSpeed = Math.min(this.BARREL_SPIN_MAX, this.barrelSpinSpeed + this.BARREL_SPIN_ACCEL * dt);
      } else {
        this.barrelSpinSpeed = Math.max(0, this.barrelSpinSpeed - this.BARREL_SPIN_DECEL * dt);
      }
      this.barrelSpinAngle += this.barrelSpinSpeed * dt;
      const cluster = this.weaponMesh.getObjectByName('barrelCluster') as THREE.Object3D | undefined;
      if (cluster) {
        cluster.rotation.z = this.barrelSpinAngle;
      }
    } else {
      // Reset spin state when switching away from minigun
      this.barrelSpinSpeed = 0;
      this.barrelSpinAngle = 0;
    }

    // Update plasma skin animation (time-based emissive flow)
    if (this.currentSkin === 'plasma') {
      const t = performance.now() * 0.001;
      this.weaponMesh.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const mat of mats) {
            if (isPlasmaMaterial(mat)) updatePlasmaMaterial(mat, t);
          }
        }
      });
    }

    // Hide weapon when fully scoped
    this.weaponMesh.visible = this.scopeTransition < 0.9;

    // Muzzle flash — cycle through sprite atlas frames
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      const t = Math.max(0, this.flashTimer / 0.05);
      const frameIndex = Math.min(
        Math.floor((1 - t) * MUZZLE_FLASH_FRAMES),
        MUZZLE_FLASH_FRAMES - 1,
      );
      const offset = getMuzzleFlashOffset(frameIndex);
      this.flashTexture.offset.set(offset.x, offset.y);
      (this.muzzleFlash.material as THREE.MeshBasicMaterial).opacity = t;
      this.muzzleLight.intensity = t * 30;
      this.muzzleFlash.rotation.z = Math.random() * Math.PI;
    } else {
      (this.muzzleFlash.material as THREE.MeshBasicMaterial).opacity = 0;
      this.muzzleLight.intensity = 0;
    }
  }

  /** Called each frame — true = firing (spin up), false = coasting (spin down). */
  setMinigunSpinning(firing: boolean): void {
    this._minigunFiring = firing;
  }

  /** Returns current barrel spin speed (rad/s). Used by WeaponManager to gate fire. */
  get minigunSpinSpeed(): number {
    return this.barrelSpinSpeed;
  }

  addSway(dx: number, dy: number): void {
    this.swayX -= dx * 0.0003;
    this.swayY += dy * 0.0003;
  }

  /** Returns the world-space position of the barrel tip (muzzle flash sprite position). */
  getMuzzleWorldPosition(target: THREE.Vector3): void {
    this.muzzleFlash.getWorldPosition(target);
  }

  /** Build a weapon mesh for preview rendering (inventory thumbnails). Same mesh as in-world. */
  buildWeaponMeshForPreview(type: WeaponType, skin: WeaponSkin): THREE.Group {
    return buildWeaponMesh(type, skin);
  }

  private buildWeaponMesh(type: WeaponType, skin: WeaponSkin): THREE.Group {
    return buildWeaponMesh(type, skin);
  }
}
