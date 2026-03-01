import * as THREE from 'three';
import { GunshipOverlay, GunshipWeaponMode, FlirMode } from '../ui/gunship-overlay';
import { EnemyManager } from '../enemies/enemy-manager';
import { GrenadeSystem } from '../weapons/grenade-system';
import { InputManager } from '../core/input-manager';
import { FPSCamera } from '../player/fps-camera';
import { playGunshipCannon, playGunshipHowitzer, HOWITZER_SHELL_DELAY } from '../audio/sound-effects';

const DURATION = 30;

const CANNON_COOLDOWN   = 0.18;
const CANNON_DAMAGE     = 35;
const CANNON_RADIUS     = 1.5;
const CANNON_BURST_SIZE = 4;
const CANNON_BURST_DT   = 0.12;

const HOWITZER_COOLDOWN = 3.5;
const HOWITZER_DAMAGE   = 250;
const HOWITZER_RADIUS   = 8;

const RETICLE_SPEED = 0.00075;

// Orbit parameters — AC-130 circles at a constant radius and altitude
const ORBIT_RADIUS   = 45;   // horizontal distance from map center
const ORBIT_HEIGHT   = 52;   // Y above ground
const ORBIT_SPEED    = 0.18; // radians per second (~35s full circle)

export class GunshipScorestreak {
  private active = false;
  private timeRemaining = DURATION;

  // Orbit state
  private orbitAngle = 0;
  private orbitCenter = new THREE.Vector3();

  // Camera
  private gunshipCamera: THREE.PerspectiveCamera;
  private groundY: number;
  private readonly _groundPlane: THREE.Plane;
  private readonly _raycaster = new THREE.Raycaster();
  private readonly _ndcPos = new THREE.Vector2();
  private readonly _worldFirePos = new THREE.Vector3();

  // Reticle (normalized 0-1)
  private reticleX = 0.5;
  private reticleY = 0.5;

  // Weapon state
  private weaponMode: GunshipWeaponMode = 'cannon';
  private flirMode: FlirMode = 'white-hot';
  private cannonCooldown = 0;
  private howitzerCooldown = 0;
  private prevRightMouseDown = false;
  private prevScrollDelta = 0;

  // Cannon burst
  private burstCount = 0;
  private burstTimer = 0;

  // Camera shake
  private _shakeTrauma = 0;   // 0-1, decays over time
  private readonly _shakeOffset = new THREE.Vector3();

  // Cannon impact VFX: pooled spheres
  private readonly _impactPool: THREE.Mesh[] = [];
  private readonly _activeImpacts: { mesh: THREE.Mesh; life: number; maxLife: number; initScale: number }[] = [];
  private readonly _activeLights: { light: THREE.PointLight; life: number; maxLife: number; initIntensity: number }[] = [];

  // Tracer VFX: brief bright lines from gunship to impact
  private readonly _tracerPool: THREE.Line[] = [];
  private readonly _activeTracers: { line: THREE.Line; life: number; maxLife: number }[] = [];

  // Callbacks
  onEnd:         (() => void) | null = null;
  onExplosion:   ((pos: THREE.Vector3, radius: number, damage: number) => void) | null = null;
  onActivate:    (() => void) | null = null;   // called so game.ts can dim bloom
  onDeactivate:  (() => void) | null = null;   // called so game.ts can restore bloom
  /** Called when T key cycles FLIR mode — game.ts uses this to toggle exposure override. */
  onFlirModeChange: ((mode: FlirMode) => void) | null = null;
  /** Optional terrain raycast — provides actual surface Y instead of flat groundY. Set by game.ts. */
  getTerrainY:   ((x: number, z: number) => number) | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly enemyManager: EnemyManager,
    private readonly grenadeSystem: GrenadeSystem,
    private readonly overlay: GunshipOverlay,
    private readonly fpsCamera: FPSCamera,
    groundY = -2,
  ) {
    this.groundY = groundY;
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY);

    this.gunshipCamera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      600,
    );

    window.addEventListener('resize', () => {
      this.gunshipCamera.aspect = window.innerWidth / window.innerHeight;
      this.gunshipCamera.updateProjectionMatrix();
    });

    // Pre-build impact sphere pool (radius 1 each, scaled at spawn)
    const impactGeo = new THREE.SphereGeometry(1, 8, 6);
    for (let i = 0; i < 40; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
      const mesh = new THREE.Mesh(impactGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this._impactPool.push(mesh);
    }

    // Pre-build tracer line pool (2 points each, updated at spawn)
    const tracerGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, -1, 0),
    ]);
    for (let i = 0; i < 16; i++) {
      const mat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2, transparent: true, opacity: 1, depthTest: false, depthWrite: false });
      const line = new THREE.Line(tracerGeo.clone(), mat);
      line.visible = false;
      line.renderOrder = 999;
      this.scene.add(line);
      this._tracerPool.push(line);
    }
  }

  isActive(): boolean { return this.active; }
  getCamera(): THREE.PerspectiveCamera { return this.gunshipCamera; }

  /** Update ground Y after scene load (custom arena terrain level is known only post-load). */
  setGroundY(y: number): void {
    this.groundY = y;
    this._groundPlane.constant = -y;
  }

  activate(playerPos: THREE.Vector3): void {
    this.active = true;
    this.timeRemaining = DURATION;
    this.weaponMode = 'cannon';
    this.flirMode = 'white-hot';
    this.reticleX = 0.5;
    this.reticleY = 0.5;
    this.cannonCooldown = 0;
    this.howitzerCooldown = 0;
    this.burstCount = 0;
    this.burstTimer = 0;
    this.prevRightMouseDown = false;

    // Orbit center = player XZ, at ground level
    this.orbitCenter.set(playerPos.x, this.groundY, playerPos.z);
    // Start orbit angle directly behind (south) so map is immediately visible
    this.orbitAngle = Math.PI * 0.5;

    this._updateOrbitCamera();
    this._groundPlane.constant = -this.groundY;

    this.overlay.setWeaponMode(this.weaponMode);
    this.overlay.setFlirMode(this.flirMode);
    this.overlay.setTimeRemaining(DURATION);
    this.overlay.show();

    this.onActivate?.();
  }

  deactivate(): void {
    this.active = false;
    this.overlay.hide();
    this.onDeactivate?.();
    // Clean up any lingering VFX
    for (const imp of this._activeImpacts) imp.mesh.visible = false;
    this._activeImpacts.length = 0;
    for (const tr of this._activeTracers) tr.line.visible = false;
    this._activeTracers.length = 0;
    for (const l of this._activeLights) this.scene.remove(l.light);
    this._activeLights.length = 0;
  }

  update(dt: number, input: InputManager): void {
    if (!this.active) return;

    // Timer
    this.timeRemaining -= dt;
    if (this.timeRemaining <= 0) {
      this.timeRemaining = 0;
      this.overlay.setTimeRemaining(0);
      this.deactivate();
      this.onEnd?.();
      return;
    }
    this.overlay.setTimeRemaining(this.timeRemaining);

    // Camera shake decay
    if (this._shakeTrauma > 0) {
      this._shakeTrauma = Math.max(0, this._shakeTrauma - dt * 2.2);
    }

    // Orbit camera
    this.orbitAngle += ORBIT_SPEED * dt;
    this._updateOrbitCamera();

    // Reticle + toggles
    this._updateReticle(input, dt);
    this._handleToggles(input);

    // Cooldowns
    if (this.cannonCooldown > 0) this.cannonCooldown -= dt;
    if (this.howitzerCooldown > 0) this.howitzerCooldown -= dt;

    // Cannon: left mouse fires bursts (always available)
    if (input.mouseDown && this.cannonCooldown <= 0 && this.burstCount === 0) {
      this.cannonCooldown = CANNON_COOLDOWN;
      this.burstCount = CANNON_BURST_SIZE;
      this.burstTimer = -dt; // fire first shot immediately this frame
    }

    // Howitzer: right mouse fires (separate cooldown, always available)
    const rightDown = input.rightMouseDown;
    if (rightDown && !this.prevRightMouseDown && this.howitzerCooldown <= 0) {
      this.howitzerCooldown = HOWITZER_COOLDOWN;
      const worldPos = this._reticleToWorld();
      if (worldPos) this._fireHowitzer(worldPos);
    }
    this.prevRightMouseDown = rightDown;

    // Burst sub-shots
    if (this.burstCount > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0) {
        const worldPos = this._reticleToWorld();
        if (worldPos) this._fireCannon(worldPos);
        this.burstCount--;
        this.burstTimer = CANNON_BURST_DT;
      }
    }

    // Animate impact VFX + tracers
    this._updateImpacts(dt);
    this._updateTracers(dt);

    this.overlay.update(dt);
  }

  /** Update the orbit camera position — called each tick and on activate. */
  private _updateOrbitCamera(): void {
    const cx = this.orbitCenter.x + Math.cos(this.orbitAngle) * ORBIT_RADIUS;
    const cz = this.orbitCenter.z + Math.sin(this.orbitAngle) * ORBIT_RADIUS;
    const cy = this.groundY + ORBIT_HEIGHT;

    // Shake: square the trauma for a snappier feel, apply random XYZ offset
    const shake = this._shakeTrauma * this._shakeTrauma;
    this._shakeOffset.set(
      (Math.random() * 2 - 1) * shake * 1.8,
      (Math.random() * 2 - 1) * shake * 0.9,
      (Math.random() * 2 - 1) * shake * 1.8,
    );

    this.gunshipCamera.position.set(
      cx + this._shakeOffset.x,
      cy + this._shakeOffset.y,
      cz + this._shakeOffset.z,
    );
    this.gunshipCamera.lookAt(this.orbitCenter);
    this.gunshipCamera.updateProjectionMatrix();
    this.gunshipCamera.updateMatrixWorld(true);
  }

  private _updateReticle(input: InputManager, dt: number): void {
    this.reticleX = Math.max(0.05, Math.min(0.95,
      this.reticleX + input.mouseMovementX * RETICLE_SPEED,
    ));
    this.reticleY = Math.max(0.05, Math.min(0.95,
      this.reticleY + input.mouseMovementY * RETICLE_SPEED,
    ));
    this.overlay.setReticle(this.reticleX, this.reticleY);
  }

  private _handleToggles(input: InputManager): void {
    if (input.wasKeyJustPressed('g')) {
      this.weaponMode = this.weaponMode === 'cannon' ? 'howitzer' : 'cannon';
      this.overlay.setWeaponMode(this.weaponMode);
    }
    const scroll = input.scrollDelta;
    if (scroll !== 0 && scroll !== this.prevScrollDelta) {
      this.weaponMode = this.weaponMode === 'cannon' ? 'howitzer' : 'cannon';
      this.overlay.setWeaponMode(this.weaponMode);
    }
    this.prevScrollDelta = scroll;

    if (input.wasKeyJustPressed('t')) {
      const cycle: FlirMode[] = ['white-hot', 'black-hot', 'color'];
      this.flirMode = cycle[(cycle.indexOf(this.flirMode) + 1) % cycle.length];
      this.overlay.setFlirMode(this.flirMode);
      this.onFlirModeChange?.(this.flirMode);
    }
  }

  private _reticleToWorld(): THREE.Vector3 | null {
    this._ndcPos.set(
      this.reticleX * 2 - 1,
      -(this.reticleY * 2 - 1),
    );
    this._raycaster.setFromCamera(this._ndcPos, this.gunshipCamera);
    const ray = this._raycaster.ray;
    const target = this._worldFirePos;

    // Helper: intersect ray with a horizontal plane at given Y
    const intersectAtY = (planeY: number): THREE.Vector3 | null => {
      if (Math.abs(ray.direction.y) < 0.0001) return null;
      const t = (planeY - ray.origin.y) / ray.direction.y;
      if (t <= 0) return null;
      return ray.origin.clone().addScaledVector(ray.direction, t);
    };

    // Pass 1: hit the flat ground plane to get an approximate X/Z
    const approx = intersectAtY(this.groundY);
    if (!approx) return null;

    // Pass 2: if we have terrain raycast, look up the real surface Y at that X/Z
    // and re-intersect at that height for a corrected X/Z
    if (this.getTerrainY) {
      const terrainY = this.getTerrainY(approx.x, approx.z);
      const refined = intersectAtY(terrainY);
      if (refined) {
        target.copy(refined);
        return target.clone();
      }
    }

    target.copy(approx);
    return target.clone();
  }

  /** Actual terrain surface Y at (x,z) — uses raycast when available, else flat groundY. */
  private _surfaceY(x: number, z: number): number {
    return this.getTerrainY ? this.getTerrainY(x, z) : this.groundY;
  }

  // Reusable vectors to avoid per-shot allocations
  private readonly _cannonSurfacePos = new THREE.Vector3();
  private readonly _camDir = new THREE.Vector3();
  private readonly _tracerFrom = new THREE.Vector3();

  private _fireCannon(worldPos: THREE.Vector3): void {
    this._shakeTrauma = 0.5; // reset each shot — consistent kick per round, no buildup
    const vfxPos = worldPos.clone();

    // Scatter only affects damage, not visuals
    const dmgX = worldPos.x + (Math.random() - 0.5) * 0.7;
    const dmgZ = worldPos.z + (Math.random() - 0.5) * 0.7;
    this._cannonSurfacePos.set(dmgX, 0, dmgZ); // Y unused in XZ check

    this.enemyManager.damageEnemiesInRadiusXZ(this._cannonSurfacePos, CANNON_RADIUS, CANNON_DAMAGE);

    // Pass surface Y to destructibles
    this._cannonSurfacePos.set(vfxPos.x, this._surfaceY(vfxPos.x, vfxPos.z), vfxPos.z);
    this.onExplosion?.(this._cannonSurfacePos, CANNON_RADIUS, CANNON_DAMAGE);

    this.overlay.flashReticle();
    playGunshipCannon();
    this._spawnCannonImpact(vfxPos);

    // Tracer from camera direction toward impact
    this._camDir.subVectors(this.gunshipCamera.position, vfxPos).normalize();
    this._tracerFrom.copy(vfxPos).addScaledVector(this._camDir, 30);
    this._spawnTracer(this._tracerFrom, vfxPos, 0.12);
  }

  private _fireHowitzer(worldPos: THREE.Vector3): void {
    // Play muzzle sound immediately — damage/VFX delayed by shell travel time
    playGunshipHowitzer();
    this.overlay.flashReticle();
    // Muzzle shake on fire
    this._shakeTrauma = Math.min(1, this._shakeTrauma + 0.8);

    const impactPos = worldPos.clone();
    setTimeout(() => {
      if (!this.active) return;
      const surfacePos = new THREE.Vector3(impactPos.x, this._surfaceY(impactPos.x, impactPos.z), impactPos.z);
      this.enemyManager.damageEnemiesInRadiusXZ(impactPos, HOWITZER_RADIUS, HOWITZER_DAMAGE);
      this.grenadeSystem.spawnExplosion(surfacePos);
      this.onExplosion?.(surfacePos, HOWITZER_RADIUS, HOWITZER_DAMAGE);
      this._spawnHowitzerImpact(impactPos);
    }, HOWITZER_SHELL_DELAY * 1000);
  }

  // ─── VFX ───────────────────────────────────────────────────────────────────

  private _getPooledImpact(): THREE.Mesh | null {
    for (const m of this._impactPool) {
      if (!m.visible) return m;
    }
    return null;
  }

  private _spawnCannonImpact(pos: THREE.Vector3): void {
    // Central flash sphere — large enough to be visible from orbit height ~50u
    const mesh = this._getPooledImpact();
    if (mesh) {
      (mesh.material as THREE.MeshBasicMaterial).color.setHex(0xffffff);
      mesh.scale.setScalar(2.5);
      mesh.position.set(pos.x, pos.y, pos.z);
      mesh.visible = true;
      this._activeImpacts.push({ mesh, life: 0, maxLife: 0.25, initScale: 2.5 });
    }

    // Short PointLight flash — tracked in game loop, no rAF
    const light = new THREE.PointLight(0xff7722, 30, 10);
    light.position.set(pos.x, pos.y, pos.z);
    this.scene.add(light);
    this._activeLights.push({ light, life: 0, maxLife: 0.15, initIntensity: 30 });

    // Dust/debris: a few spheres flung out
    for (let i = 0; i < 3; i++) {
      const d = this._getPooledImpact();
      if (!d) break;
      const sc = 1.2 + Math.random() * 0.8;
      (d.material as THREE.MeshBasicMaterial).color.setHex(0xddaa44);
      d.scale.setScalar(sc);
      const ang = Math.random() * Math.PI * 2;
      const dist = 1.5 + Math.random() * 2;
      d.position.set(
        pos.x + Math.cos(ang) * dist,
        pos.y,
        pos.z + Math.sin(ang) * dist,
      );
      d.visible = true;
      this._activeImpacts.push({ mesh: d, life: 0, maxLife: 0.4, initScale: sc });
    }
  }

  private _spawnHowitzerImpact(pos: THREE.Vector3): void {
    // Large sustained fireball sphere
    const mesh = this._getPooledImpact();
    if (mesh) {
      (mesh.material as THREE.MeshBasicMaterial).color.setHex(0xffffff);
      mesh.scale.setScalar(8);
      mesh.position.set(pos.x, pos.y, pos.z);
      mesh.visible = true;
      this._activeImpacts.push({ mesh, life: 0, maxLife: 0.8, initScale: 8 });
    }

    // Bright area light — tracked in game loop, no rAF
    const light = new THREE.PointLight(0xff6600, 80, 30);
    light.position.set(pos.x, pos.y + 3, pos.z);
    this.scene.add(light);
    this._activeLights.push({ light, life: 0, maxLife: 1.0, initIntensity: 80 });

    // Ring of debris spheres
    for (let i = 0; i < 6; i++) {
      const d = this._getPooledImpact();
      if (!d) break;
      const sc2 = 2.5 + Math.random() * 1.5;
      (d.material as THREE.MeshBasicMaterial).color.setHex(0xffaa22);
      d.scale.setScalar(sc2);
      const ang = (i / 6) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 3 + Math.random() * 4;
      d.position.set(
        pos.x + Math.cos(ang) * dist,
        pos.y + 0.8,
        pos.z + Math.sin(ang) * dist,
      );
      d.visible = true;
      this._activeImpacts.push({ mesh: d, life: 0, maxLife: 0.5 + Math.random() * 0.3, initScale: sc2 });
    }
  }

  private _updateImpacts(dt: number): void {
    for (let i = this._activeImpacts.length - 1; i >= 0; i--) {
      const imp = this._activeImpacts[i];
      imp.life += dt;
      const t = imp.life / imp.maxLife; // 0 → 1

      if (t >= 1) {
        imp.mesh.visible = false;
        this._activeImpacts.splice(i, 1);
        continue;
      }

      // Scale grows quickly then shrinks — peak at 30% of lifetime
      const peak = 0.3;
      const scaleFactor = t < peak
        ? t / peak                          // 0 → 1 during growth
        : 1 - (t - peak) / (1 - peak);     // 1 → 0 during fade
      imp.mesh.scale.setScalar(imp.initScale * Math.max(0.01, scaleFactor));
    }

    for (let i = this._activeLights.length - 1; i >= 0; i--) {
      const l = this._activeLights[i];
      l.life += dt;
      if (l.life >= l.maxLife) {
        this.scene.remove(l.light);
        this._activeLights.splice(i, 1);
      } else {
        l.light.intensity = l.initIntensity * (1 - l.life / l.maxLife);
      }
    }
  }

  private _spawnTracer(from: THREE.Vector3, to: THREE.Vector3, life: number): void {
    for (const line of this._tracerPool) {
      if (line.visible) continue;
      const pos = line.geometry.attributes.position as THREE.BufferAttribute;
      pos.setXYZ(0, from.x, from.y, from.z);
      pos.setXYZ(1, to.x, to.y, to.z);
      pos.needsUpdate = true;
      line.geometry.computeBoundingSphere();
      line.visible = true;
      this._activeTracers.push({ line, life: 0, maxLife: life });
      return;
    }
  }

  private _updateTracers(dt: number): void {
    for (let i = this._activeTracers.length - 1; i >= 0; i--) {
      const tr = this._activeTracers[i];
      tr.life += dt;
      if (tr.life >= tr.maxLife) {
        tr.line.visible = false;
        this._activeTracers.splice(i, 1);
      } else {
        // Fade material opacity
        const t = tr.life / tr.maxLife;
        (tr.line.material as THREE.LineBasicMaterial).opacity = 1 - t;
      }
    }
  }

  dispose(): void {
    for (const m of this._impactPool) {
      this.scene.remove(m);
    }
    for (const l of this._tracerPool) {
      this.scene.remove(l);
    }
  }
}
