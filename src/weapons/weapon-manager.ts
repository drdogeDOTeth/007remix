import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { InputManager } from '../core/input-manager';
import { EventBus } from '../core/event-bus';
import { FPSCamera } from '../player/fps-camera';
import { WeaponBase } from './weapon-base';
import { WeaponViewModel, type WeaponType } from './weapon-view-model';
import { ProjectileSystem } from './projectile-system';
import { Pistol } from './weapons/pistol';
import { Rifle } from './weapons/rifle';
import { Shotgun } from './weapons/shotgun';
import { Sniper } from './weapons/sniper';
import { Minigun } from './weapons/minigun';
import { RPG } from './weapons/rpg';
import { GrenadeLauncher } from './weapons/grenade-launcher';
import { GrenadeSystem, type WeaponProjectileType } from './grenade-system';
import {
  playGunshotWeapon, playDryFire, playReload,
  startMinigunSpinWhine, stopMinigunSpinWhine, updateMinigunSpinWhine,
} from '../audio/sound-effects';
import type { WeaponSkin } from './weapon-skins';

const WEAPON_TYPE_MAP: WeaponType[] = ['pistol', 'rifle', 'shotgun', 'sniper', 'minigun', 'rpg', 'grenade-launcher'];
const EXPLOSIVE_WEAPONS = new Set<WeaponType>(['rpg', 'grenade-launcher']);
const DEFAULT_FOV = 75;
const SCOPED_FOV = 25;       // sniper — ~3× zoom
const RPG_SCOPED_FOV = 35;   // RPG PGO-7 scope — ~2× zoom

export class WeaponManager {
  private weapons: (WeaponBase | null)[] = [null, null, null, null, null, null, null];
  private currentIndex = 0;
  private viewModel: WeaponViewModel;
  private projectileSystem: ProjectileSystem;
  private grenadeSystem: GrenadeSystem | null = null;
  private fpsCamera: FPSCamera;
  private events: EventBus;
  private getPlayerCollider: () => RAPIER.Collider;

  private wasMouseDown = false;
  private wasRightMouseDown = false;
  private reloadSoundPlayed = false;
  private _scoped = false;
  private scopeFovTransition = DEFAULT_FOV;

  /** Underbarrel GL cooldown — independent from rifle fire rate. */
  private uglLastFiredTime = 0;
  private readonly UGL_COOLDOWN = 2.0; // seconds between UGL shots

  /** Optional: used to disable sprint bob when crouching */
  private getIsCrouching: (() => boolean) | null = null;

  /** When false, weapon fire is disabled (e.g. map editor mode). */
  combatEnabled = true;

  /** Per-weapon skin selection */
  private weaponSkins: Record<WeaponType, WeaponSkin> = {
    pistol: 'default',
    rifle: 'default',
    shotgun: 'default',
    sniper: 'default',
    minigun: 'default',
    rpg: 'default',
    'grenade-launcher': 'default',
  };

  constructor(
    scene: THREE.Scene,
    fpsCamera: FPSCamera,
    projectileSystem: ProjectileSystem,
    events: EventBus,
    getPlayerCollider: () => RAPIER.Collider,
    getIsCrouching?: () => boolean,
  ) {
    this.fpsCamera = fpsCamera;
    this.projectileSystem = projectileSystem;
    this.events = events;
    this.getPlayerCollider = getPlayerCollider;
    if (getIsCrouching) this.getIsCrouching = getIsCrouching;

    this.viewModel = new WeaponViewModel();
    fpsCamera.camera.add(this.viewModel.group);

    // Start with pistol
    this.weapons[0] = new Pistol();
  }

  get currentWeapon(): WeaponBase {
    return this.weapons[this.currentIndex]!;
  }

  get currentWeaponType(): WeaponType {
    return WEAPON_TYPE_MAP[this.currentIndex];
  }

  get scoped(): boolean {
    return this._scoped;
  }

  /** Provide the GrenadeSystem so RPG/GL projectiles can be launched. */
  setGrenadeSystem(gs: GrenadeSystem): void {
    this.grenadeSystem = gs;
  }

  addWeapon(type: 'pistol' | 'rifle' | 'shotgun' | 'sniper' | 'minigun' | 'rpg' | 'grenade-launcher'): boolean {
    const slotIndex = WEAPON_TYPE_MAP.indexOf(type);
    if (slotIndex === -1) return false;

    if (this.weapons[slotIndex]) {
      this.weapons[slotIndex]!.addAmmo(this.weapons[slotIndex]!.stats.maxAmmo);
      return false;
    }

    switch (type) {
      case 'pistol': this.weapons[slotIndex] = new Pistol(); break;
      case 'rifle': this.weapons[slotIndex] = new Rifle(); break;
      case 'shotgun': this.weapons[slotIndex] = new Shotgun(); break;
      case 'sniper': this.weapons[slotIndex] = new Sniper(); break;
      case 'minigun': this.weapons[slotIndex] = new Minigun(); break;
      case 'rpg': this.weapons[slotIndex] = new RPG(); break;
      case 'grenade-launcher': this.weapons[slotIndex] = new GrenadeLauncher(); break;
    }
    return true;
  }

  addAmmo(type: 'pistol' | 'rifle' | 'shotgun' | 'sniper' | 'minigun' | 'rpg' | 'grenade-launcher', amount: number): void {
    const slotIndex = WEAPON_TYPE_MAP.indexOf(type);
    if (slotIndex !== -1 && this.weapons[slotIndex]) {
      this.weapons[slotIndex]!.addAmmo(amount);
    }
  }

  private switchTo(index: number): void {
    if (index === this.currentIndex) return;
    if (!this.weapons[index]) return;

    // Stop minigun whine when leaving minigun slot
    if (WEAPON_TYPE_MAP[this.currentIndex] === 'minigun') stopMinigunSpinWhine();

    this._scoped = false;
    this.viewModel.setScoped(false);
    this.currentIndex = index;
    const type = WEAPON_TYPE_MAP[index];
    this.viewModel.switchWeapon(type, this.weaponSkins[type]);

    // Start minigun whine when entering minigun slot
    if (type === 'minigun') startMinigunSpinWhine();

    this.events.emit('weapon:switched', { weaponName: this.currentWeapon.stats.name });
  }

  getWeaponSkin(type: WeaponType): WeaponSkin {
    return this.weaponSkins[type];
  }

  setWeaponSkin(type: WeaponType, skin: WeaponSkin): void {
    this.weaponSkins[type] = skin;
    if (WEAPON_TYPE_MAP[this.currentIndex] === type) {
      this.viewModel.setSkin(skin);
    }
  }

  /** Build weapon mesh for preview (inventory 3D thumbnail). */
  getPreviewMesh(type: WeaponType, skin: WeaponSkin): THREE.Group {
    return this.viewModel.buildWeaponMeshForPreview(type, skin);
  }

  /** Show or hide the weapon view model (e.g. while in map editor mode). */
  setViewModelVisible(visible: boolean): void {
    this.viewModel.group.visible = visible;
  }

  /** List of owned weapons with name and current skin (for inventory UI). */
  getOwnedWeapons(): { type: WeaponType; name: string; skin: WeaponSkin }[] {
    const out: { type: WeaponType; name: string; skin: WeaponSkin }[] = [];
    for (let i = 0; i < WEAPON_TYPE_MAP.length; i++) {
      const w = this.weapons[i];
      if (!w) continue;
      const type = WEAPON_TYPE_MAP[i];
      out.push({ type, name: w.stats.name, skin: this.weaponSkins[type] });
    }
    return out;
  }

  update(input: InputManager, dt: number): void {
    const now = performance.now() / 1000;
    const weapon = this.currentWeapon;

    // Weapon switching (number keys)
    const slotCount = WEAPON_TYPE_MAP.length;
    for (let i = 0; i < slotCount; i++) {
      if (input.wasKeyJustPressed(String(i + 1)) && this.weapons[i]) {
        this.switchTo(i);
      }
    }

    // Scroll wheel switching
    if (input.scrollDelta !== 0) {
      let next = this.currentIndex;
      const dir = input.scrollDelta > 0 ? 1 : -1;
      for (let attempt = 0; attempt < slotCount; attempt++) {
        next = (next + dir + slotCount) % slotCount;
        if (this.weapons[next]) {
          this.switchTo(next);
          break;
        }
      }
    }

    // Scope (right-click — sniper and RPG)
    const currentType = WEAPON_TYPE_MAP[this.currentIndex];
    const canScope = currentType === 'sniper' || currentType === 'rpg';
    this._scoped = canScope && input.rightMouseDown;
    this.viewModel.setScoped(this._scoped);

    // Smooth FOV for scope (RPG uses slightly wider zoom than sniper)
    const targetFov = this._scoped
      ? (currentType === 'rpg' ? RPG_SCOPED_FOV : SCOPED_FOV)
      : DEFAULT_FOV;
    this.scopeFovTransition += (targetFov - this.scopeFovTransition) * dt * 12;
    this.fpsCamera.camera.fov = this.scopeFovTransition;
    this.fpsCamera.camera.updateProjectionMatrix();

    // Reload
    if (input.isKeyDown('r')) {
      if (weapon.startReload(now)) {
        playReload();
        this.reloadSoundPlayed = true;
        this.viewModel.startReloadAnimation(weapon.stats.reloadTime);
      }
    }
    const reloadFinished = weapon.updateReload(now);
    if (reloadFinished) {
      this.reloadSoundPlayed = false;
    }

    // Fire
    const mouseDown = input.mouseDown;
    const isMinigun = WEAPON_TYPE_MAP[this.currentIndex] === 'minigun';

    // Minigun: spin up on mouse-hold, fire only once barrel is at threshold speed
    if (isMinigun) {
      this.viewModel.setMinigunSpinning(mouseDown);
      updateMinigunSpinWhine(this.viewModel.minigunSpinSpeed, 25);
    }

    const shouldFire = weapon.stats.automatic
      ? mouseDown
      : mouseDown && !this.wasMouseDown;

    // Minigun requires barrels to be spinning above 60% max speed before firing
    const minigunReady = !isMinigun || (this.viewModel.minigunSpinSpeed >= 15);

    const isExplosive = EXPLOSIVE_WEAPONS.has(WEAPON_TYPE_MAP[this.currentIndex]);

    if (this.combatEnabled && shouldFire && input.canShoot && minigunReady) {
      if (weapon.canFire(now)) {
        weapon.fire(now);
        if (isExplosive) {
          this.doFireExplosive();
        } else {
          this.doFire();
        }
      } else if (weapon.currentAmmo <= 0 && !weapon.reloading) {
        if (weapon.startReload(now)) {
          playReload();
          this.viewModel.startReloadAnimation(weapon.stats.reloadTime);
        } else {
          playDryFire();
        }
      }
    }

    this.wasMouseDown = mouseDown;

    // Underbarrel grenade launcher (rifle only, right-click, not while scoping)
    const isRifle = WEAPON_TYPE_MAP[this.currentIndex] === 'rifle';
    const rightDown = input.rightMouseDown;
    const rightJustPressed = rightDown && !this.wasRightMouseDown;
    if (this.combatEnabled && isRifle && rightJustPressed && this.grenadeSystem) {
      if (now - this.uglLastFiredTime >= this.UGL_COOLDOWN) {
        this.uglLastFiredTime = now;
        this.doFireUnderbarrelGL();
      } else {
        playDryFire();
      }
    }
    this.wasRightMouseDown = rightDown;

    // View model (sprint = more bob when moving with Shift and not crouching)
    this.viewModel.addSway(input.mouseMovementX, input.mouseMovementY);
    const isMoving =
      input.isKeyDown('w') || input.isKeyDown('a') ||
      input.isKeyDown('s') || input.isKeyDown('d');
    const isSprinting = isMoving && input.isKeyDown('Shift') && !(this.getIsCrouching?.() ?? false);
    this.viewModel.update(dt, isMoving, isSprinting);
  }

  private doFire(): void {
    // Force world matrix update so getMuzzleWorldPosition is accurate even when stationary
    this.viewModel.group.updateWorldMatrix(true, true);
    const origin = new THREE.Vector3();
    this.viewModel.getMuzzleWorldPosition(origin);
    const cameraOrigin = new THREE.Vector3();
    this.fpsCamera.camera.getWorldPosition(cameraOrigin);
    const cameraDirection = new THREE.Vector3();
    this.fpsCamera.getLookDirection(cameraDirection);
    const weapon = this.currentWeapon;
    const spreadMult = this._scoped ? 0.1 : 1;

    // Resolve the exact camera/crosshair aim point, then fire from muzzle toward that point.
    const aimHit = this.projectileSystem.castRay(
      cameraOrigin,
      cameraDirection,
      weapon.stats.range,
      this.getPlayerCollider(),
    );
    const aimPoint = aimHit?.point ?? cameraOrigin.clone().addScaledVector(cameraDirection, weapon.stats.range);
    const baseDirection = aimPoint.sub(origin);
    if (baseDirection.lengthSq() > 1e-8) {
      baseDirection.normalize();
    } else {
      baseDirection.copy(cameraDirection);
    }

    // Play gunshot immediately (before raycast) so it always plays regardless of hit
    playGunshotWeapon(WEAPON_TYPE_MAP[this.currentIndex]);

    let firstHit: { point?: THREE.Vector3; collider?: RAPIER.Collider } | null = null;
    for (let i = 0; i < weapon.stats.raysPerShot; i++) {
      let dir = baseDirection;
      if (weapon.stats.raysPerShot > 1) {
        dir = baseDirection.clone();
        const cone = weapon.stats.spreadCone;
        dir.x += (Math.random() - 0.5) * cone;
        dir.y += (Math.random() - 0.5) * cone;
        dir.z += (Math.random() - 0.5) * cone;
        dir.normalize();
      } else if (weapon.stats.spread > 0) {
        dir = baseDirection.clone();
        dir.x += (Math.random() - 0.5) * weapon.stats.spread * spreadMult;
        dir.y += (Math.random() - 0.5) * weapon.stats.spread * spreadMult;
        dir.z += (Math.random() - 0.5) * weapon.stats.spread * spreadMult;
        dir.normalize();
      }
      const result = this.projectileSystem.fireRay(origin, dir, weapon, this.getPlayerCollider());

      // Store first hit for network sync (Phase 3)
      if (!firstHit && result.hit && result.collider) {
        firstHit = { point: result.point, collider: result.collider };
      }
    }

    this.viewModel.triggerRecoil();
    this.events.emit('weapon:fired', {
      weaponName: weapon.stats.name,
      position: origin,
      direction: cameraDirection,
      hit: firstHit,
    });
  }

  private doFireExplosive(): void {
    const origin = new THREE.Vector3();
    this.fpsCamera.camera.getWorldPosition(origin);
    const direction = new THREE.Vector3();
    this.fpsCamera.getLookDirection(direction);
    const weapon = this.currentWeapon;
    const weaponType = WEAPON_TYPE_MAP[this.currentIndex] as WeaponProjectileType;

    playGunshotWeapon(WEAPON_TYPE_MAP[this.currentIndex]);

    if (this.grenadeSystem) {
      // Spawn 1.5m in front of camera — far enough to clear the view model and nearby geometry
      const spawnOrigin = origin.clone().addScaledVector(direction, 1.5);
      this.grenadeSystem.fireProjectile(spawnOrigin, direction, weaponType);
    }

    this.viewModel.triggerRecoil();
    this.events.emit('weapon:fired', {
      weaponName: weapon.stats.name,
      position: origin,
      direction,
      hit: null,
    });
  }

  private doFireUnderbarrelGL(): void {
    const origin = new THREE.Vector3();
    this.fpsCamera.camera.getWorldPosition(origin);
    const direction = new THREE.Vector3();
    this.fpsCamera.getLookDirection(direction);

    // Play grenade launcher sound
    playGunshotWeapon('grenade-launcher');

    // Spawn GL round 1.5m forward — clears the view model safely
    const spawnOrigin = origin.clone().addScaledVector(direction, 1.5);
    this.grenadeSystem!.fireProjectile(spawnOrigin, direction, 'grenade-launcher');

    // Light recoil kick
    this.viewModel.triggerRecoil();
    this.events.emit('weapon:fired', {
      weaponName: 'UGL',
      position: origin,
      direction,
      hit: null,
    });
  }
}
