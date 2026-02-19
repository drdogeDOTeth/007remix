import * as THREE from 'three';
import { Renderer } from './core/renderer';
import { GameLoop } from './core/game-loop';
import { InputManager } from './core/input-manager';
import type RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from './core/physics-world';
import { EventBus } from './core/event-bus';
import { globalLightPool } from './core/light-pool';
import { FPSCamera } from './player/fps-camera';
import { PlayerController } from './player/player-controller';
import { WeaponManager } from './weapons/weapon-manager';
import { ProjectileSystem } from './weapons/projectile-system';
import { GrenadeSystem } from './weapons/grenade-system';
import { BloodSplatterSystem } from './weapons/blood-splatter';
import { EnemyManager } from './enemies/enemy-manager';
import { PickupSystem, buildAmmoMesh } from './levels/pickup-system';
import { DoorSystem } from './levels/door-system';
import { TriggerSystem } from './levels/trigger-system';
import { ObjectiveSystem } from './levels/objective-system';
import { buildLevel, buildLabProps } from './levels/level-builder';
import type { LevelSchema } from './levels/level-schema';
import { createMultiplayerArena } from './levels/multiplayer-arena';
import { loadEnvironmentGLB } from './levels/custom-environment-loader';
import { loadQuickplayConfig, type QuickplayLabPropDef, type QuickplayPickupDef, type QuickplayPropDef } from './levels/quickplay-config';
import { loadHDRI, loadSkyboxImage, applyEnvironment } from './levels/environment-loader';
import { NavMesh } from './navmesh/navmesh';
import { DestructibleSystem } from './levels/destructible-system';
import { HUD } from './ui/hud';
import { DamageIndicator } from './ui/damage-indicator';
import { RespawnFlash } from './ui/respawn-flash';
import { ScopeOverlay } from './ui/scope-overlay';
import { TacticalOverlay } from './ui/tactical-overlay';
import { DeathOverlay } from './ui/death-overlay';
import { LowHealthOverlay } from './ui/low-health-overlay';
import { HitMarker } from './ui/hit-marker';
import { BloodOverlay } from './ui/blood-overlay';
import { KillFeed } from './ui/kill-feed';
import { Scoreboard, type ScoreboardPlayer } from './ui/scoreboard';
import { NameTagManager } from './ui/name-tags';
import { GameOverOverlay } from './ui/game-over-overlay';
import { playDestruction, playFleshImpact, playRespawnSound } from './audio/sound-effects';
import { startMusic, stopMusic } from './audio/music';
import { BriefingScreen } from './ui/briefing-screen';
import { ObjectivesDisplay } from './ui/objectives-display';
import { InventoryScreen } from './ui/inventory-screen';
import { PauseMenu } from './ui/pause-menu';
import { MissionCompleteScreen } from './ui/mission-complete-screen';
import { MapEditorUI } from './ui/map-editor-ui';
import { MobileControls } from './ui/mobile-controls';
import { renderWeaponPreviewToCanvas } from './weapons/weapon-preview-renderer';
import {
  concreteWallTexture,
  floorTileTexture,
  ceilingPanelTexture,
  woodCrateTexture,
  metalCrateTexture,
  barrelTexture,
} from './levels/procedural-textures';
import type { NetworkManager } from './network/network-manager';
import { RemotePlayerManager } from './player/remote-player-manager';
import { NetworkConfig } from './network/network-config';
import { GameSettings } from './core/game-settings';
import { getSunState, getSkyboxMode } from './core/day-night-cycle';

const PHYSICS_STEP = 1 / 60;

/** Map weapon name to canonical network type (for weapon fire and player state sync). */
function getCanonicalWeaponType(weaponName: string): 'pistol' | 'rifle' | 'shotgun' | 'sniper' {
  const name = weaponName.toLowerCase();
  if (name.includes('sniper')) return 'sniper';
  if (name.includes('shotgun')) return 'shotgun';
  if (name.includes('soviet') || name.includes('rifle')) return 'rifle';
  if (name.includes('pistol') || name.includes('pp7')) return 'pistol';
  return 'pistol';
}

export interface GameOptions {
  levelMode?: boolean;
  networkMode?: 'local' | 'client';
  networkManager?: NetworkManager;
  /** Multiplayer map to load. Default: 'crossfire'. Use 'custom' for GLB+HDRI arena. */
  mapId?: 'crossfire' | 'wasteland' | 'custom';
  /** Pre-loaded level for quick play (skips briefing, loads immediately). */
  level?: LevelSchema;
  /** Custom quickplay: load GLB + HDRI from public/maps/quickplay/, populate with props. */
  customQuickplay?: boolean;
  /** Map editor mode: no enemies, no combat, load from config (or empty). */
  editorMode?: boolean;
  /** Map to edit when editorMode is true. */
  editorMapId?: 'crossfire' | 'wasteland' | 'custom';
}

export class Game {
  private renderer: Renderer;
  private loop: GameLoop;
  private input: InputManager;
  private physics: PhysicsWorld;
  private events: EventBus;
  private scene: THREE.Scene;
  private fpsCamera: FPSCamera;
  private player: PlayerController;
  private weaponManager: WeaponManager;
  private projectileSystem: ProjectileSystem;
  private grenadeSystem: GrenadeSystem;
  private bloodSplatterSystem: BloodSplatterSystem;
  private enemyManager: EnemyManager;
  private pickupSystem: PickupSystem;
  private gasGrenadeCount = 3;
  private fragGrenadeCount = 2;
  private readonly _throwOrigin = new THREE.Vector3();
  private readonly _throwDir = new THREE.Vector3();
  private hud: HUD;
  private damageIndicator: DamageIndicator;
  private respawnFlash: RespawnFlash | null = null;
  private scopeOverlay: ScopeOverlay;
  private tacticalOverlay: TacticalOverlay;
  private deathOverlay: DeathOverlay;
  private lowHealthOverlay: LowHealthOverlay;
  private hitMarker: HitMarker;
  private bloodOverlay: BloodOverlay;
  private killFeed: KillFeed;
  private scoreboard: Scoreboard;
  private nameTagManager: NameTagManager | null = null;
  private gameOverOverlay: GameOverOverlay;

  private destructibleSystem: DestructibleSystem;
  private doorSystem: DoorSystem | null = null;
  private triggerSystem: TriggerSystem | null = null;
  private objectiveSystem: ObjectiveSystem | null = null;
  private briefingScreen: BriefingScreen | null = null;
  private objectivesDisplay: ObjectivesDisplay | null = null;
  private inventoryScreen: InventoryScreen;
  private weaponPreviewMeshCache = new Map<string, THREE.Group>();
  private readonly MAX_WEAPON_PREVIEW_CACHE = 12;

  private flashlight: THREE.SpotLight;
  private flashlightOn = false;
  private pauseMenu: PauseMenu;
  private missionCompleteScreen: MissionCompleteScreen;
  private mobileControls: MobileControls | null = null;
  private paused = false;

  private physicsAccumulator = 0;
  private started = false;
  private levelMode: boolean;
  private customQuickplay: boolean;
  /** Y-offset for spawns when using custom terrain (bbox midpoint). */
  private customGroundLevel: number | null = null;
  /** Raycast-based ground height for custom quickplay varied terrain. */
  private getGroundHeight?: (x: number, z: number, exclude?: RAPIER.Collider) => number;
  /** Terrain meshes and raycaster for Three.js-based ground queries (custom quickplay). */
  private customTerrainRaycaster: { raycaster: THREE.Raycaster; meshes: THREE.Mesh[]; down: THREE.Vector3; origin: THREE.Vector3 } | null = null;
  /** Bbox center for prop layout across full terrain (custom quickplay). */
  private customSpawnCenter: { x: number; z: number } | null = null;
  /** Optional placement from config.json (pickups, props). Overrides defaults when set. */
  private customQuickplayPlacement: { pickups?: QuickplayPickupDef[]; props?: QuickplayPropDef[]; labProps?: QuickplayLabPropDef[] } | null = null;
  /** Day/night cycle (custom quickplay). */
  private dayNightTime = 0.3;
  private dayNightSun: THREE.DirectionalLight | null = null;
  private dayNightHemi: THREE.HemisphereLight | null = null;
  /** Day/night skybox textures for rotating skyboxes. */
  private daySkyTexture: THREE.Texture | null = null;
  private nightSkyTexture: THREE.Texture | null = null;
  private skyboxRotationOffset = 0;
  /** Rotating sky sphere (when using day/night skyboxes). Rotates with sun. */
  private skySphere: THREE.Mesh | null = null;
  private missionComplete = false;
  private missionElapsed = 0;
  private levelName = '';
  private navMesh: NavMesh | null = null;
  /** Level geometry container for disposal on level switch. */
  private levelGroup: THREE.Group | null = null;

  // Player spawn position (for single-player respawn)
  private playerSpawnPosition = { x: 0, y: 0.5, z: 0 };

  private gameStartTime = 0;

  // Reusable vectors to avoid per-frame heap allocations
  private readonly _playerVec = new THREE.Vector3();
  private readonly _skySpherePos = new THREE.Vector3();
  private readonly _aimAssistLookDir = new THREE.Vector3();
  private readonly _aimAssistToTarget = new THREE.Vector3();

  // Death camera animation (single-player)
  private deathCameraAnimating = false;
  private deathCameraT = 0;
  private readonly deathCameraDuration = 1.11;
  private deathCameraTiltSign = 1; // Random ±1 for tilt direction
  private deathCameraShakePhase = 0;
  private readonly _deathCameraStartPos = new THREE.Vector3();
  private readonly _deathCameraTargetPos = new THREE.Vector3();
  private readonly _deathCameraLookAtEnd = new THREE.Vector3();
  private readonly _deathCameraLookAtStart = new THREE.Vector3();
  private readonly _deathCameraLookAtCurrent = new THREE.Vector3();
  private readonly _deathCameraShakeOffset = new THREE.Vector3();
  private readonly _deathCameraForward = new THREE.Vector3();
  private readonly _deathCameraRollQuat = new THREE.Quaternion();
  /** Killer name for death overlay when death camera finishes (multiplayer). */
  private _deathCameraKillerName: string | undefined;

  // Multiplayer networking
  private networkMode: 'local' | 'client';
  private networkManager: NetworkManager | null = null;
  /** Map we joined (for filtering snapshots from wrong rooms) */
  private multiplayerMapId: 'crossfire' | 'wasteland' | 'custom' | null = null;
  private remotePlayerManager: RemotePlayerManager | null = null;
  private lastNetworkUpdate = 0;
  private networkUpdateRate = NetworkConfig.UPDATE_RATES.PLAYER_STATE; // Hz
  private localPlayerKills = 0;
  private processedDestructibleIds = new Set<string>();
  private readonly MAX_PROCESSED_DESTRUCTIBLES = 256;

  /** Map editor mode: no enemies, no combat, placement UI. */
  private editorMode: boolean;
  /** Map being edited when editorMode is true. */
  private editorMapId: 'crossfire' | 'wasteland' | 'custom' | null = null;
  /** Map editor UI overlay. */
  private mapEditorUI: MapEditorUI | null = null;
  /** Editor placement state (source of truth for save). */
  private editorPickups: Array<{ type: string; x: number; z?: number; y?: number; amount?: number }> = [];
  private editorProps: Array<{ type: string; x: number; z?: number; y?: number; size?: [number, number, number]; yOffset?: number; scale?: number }> = [];
  private editorLabProps: Array<{ type: 'tank' | 'tube'; x: number; z: number; seed?: number; scale?: number; hueHint?: number }> = [];
  /** Editor 3D preview: hand mesh attached to camera, ghost mesh in world. */
  private editorHandGroup: THREE.Group | null = null;
  private editorGhostGroup: THREE.Group | null = null;

  /** Called when all objectives are done and player reaches extraction (mission:complete). */
  onMissionComplete: (() => void) | null = null;

  get isEditorMode(): boolean {
    return this.editorMode;
  }
  get currentEditorMapId(): 'crossfire' | 'wasteland' | 'custom' | null {
    return this.editorMapId;
  }

  private readonly canvas: HTMLCanvasElement;

  constructor(
    canvas: HTMLCanvasElement,
    physics: PhysicsWorld,
    options: GameOptions = {},
  ) {
    this.canvas = canvas;
    this.levelMode = options.levelMode ?? false;
    this.customQuickplay = options.customQuickplay ?? false;
    this.editorMode = options.editorMode ?? false;
    this.editorMapId = options.editorMapId ?? null;
    this.networkMode = options.networkMode ?? 'local';
    this.networkManager = options.networkManager ?? null;
    this.multiplayerMapId = options.mapId ?? null;
    this.physics = physics;
    this.events = new EventBus();
    this.renderer = new Renderer(canvas);
    this.input = new InputManager(canvas);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);
    this.scene.fog = new THREE.Fog(0x1a1a2e, 20, 60);

    // Camera
    this.fpsCamera = new FPSCamera();
    this.scene.add(this.fpsCamera.camera);

    // Flashlight — toggleable SpotLight attached to camera (V key)
    // Positioned at weapon area so it also illuminates the held weapon
    this.flashlight = new THREE.SpotLight(0xffe8cc, 0, 30, Math.PI / 6, 0.35, 1.5);
    this.flashlight.position.set(0.3, -0.1, -0.3);
    this.flashlight.target.position.set(0, 0, -5);
    this.fpsCamera.camera.add(this.flashlight);
    this.fpsCamera.camera.add(this.flashlight.target);

    // Player
    this.player = new PlayerController(
      this.physics,
      this.fpsCamera,
      0, 0.5, 0,
    );

    // Projectile system (raycasting + decals)
    this.projectileSystem = new ProjectileSystem(this.scene, this.physics);

    // Weapon manager (getter ensures current collider after crouch/stand)
    this.weaponManager = new WeaponManager(
      this.scene,
      this.fpsCamera,
      this.projectileSystem,
      this.events,
      () => this.player.getCollider(),
      () => this.player.isCrouching,
    );
    if (this.editorMode) this.weaponManager.combatEnabled = false;

    // Enemy manager (getter ensures we use current collider after crouch/respawn)
    this.enemyManager = new EnemyManager(
      this.scene,
      this.physics,
      this.events,
      () => this.player.getCollider(),
    );

    // Grenade system (gas grenades)
    this.grenadeSystem = new GrenadeSystem(this.scene, this.physics);
    this.grenadeSystem.setEnemyManager(this.enemyManager);
    this.grenadeSystem.setPlayerCollider(this.player.getCollider());

    // Blood splatter system (visual effect for player hits)
    this.bloodSplatterSystem = new BloodSplatterSystem(this.scene);
    this.bloodSplatterSystem.setDecalCamera(this.fpsCamera.camera);

    // Destructible system (crates, barrels)
    this.destructibleSystem = new DestructibleSystem(this.scene, this.physics);

    // Pickup system
    this.pickupSystem = new PickupSystem(this.scene);
    this.pickupSystem.onPickupCollected = (type, amount, keyId) => {
      this.handlePickup(type, amount, keyId);
    };
    // Build actual 3D weapon models for ground pickups (set after weaponManager exists)
    this.pickupSystem.weaponModelBuilder = (weaponType: string) => {
      return this.weaponManager.getPreviewMesh(weaponType as any, 'default');
    };

    // Damage indicator + scope overlay + tactical (NV/gas mask)
    this.damageIndicator = new DamageIndicator();
    this.scopeOverlay = new ScopeOverlay();
    this.tacticalOverlay = new TacticalOverlay();

    // Multiplayer UI (death overlay, hit markers, blood overlay, kill feed, scoreboard)
    this.deathOverlay = new DeathOverlay();
    this.lowHealthOverlay = new LowHealthOverlay();
    this.hitMarker = new HitMarker();
    this.bloodOverlay = new BloodOverlay();
    this.killFeed = new KillFeed();
    this.scoreboard = new Scoreboard();
    this.gameOverOverlay = new GameOverOverlay();
    this.respawnFlash = new RespawnFlash();

    // Gas damage — mask protects when tactical overlay (NV/gas mask) is on
    this.grenadeSystem.onPlayerInGas = (damage) => {
      if (this.player.isDead()) return;
      if (!this.tacticalOverlay.visible) {
        if (this.networkMode === 'client' && this.networkManager) {
          // Multiplayer: send to server; server applies and broadcasts player:damaged/died
          this.networkManager.sendGasDamage({
            playerId: this.networkManager.playerId!,
            damage,
            timestamp: performance.now(),
          });
        } else {
          // Single-player: apply locally
          this.player.takeDamage(damage);
          this.damageIndicator.flash();
          if (this.player.isDead()) this.handlePlayerDeath(undefined);
        }
      }
    };

    // When enemy shoots player
    this.enemyManager.onPlayerHit = (damage, fromPos) => {
      if (this.player.isDead()) return;
      if (this.networkMode === 'client' && this.networkManager) {
        this.networkManager.sendEnemyDamage({
          playerId: this.networkManager.playerId!,
          damage,
          timestamp: performance.now(),
        });
        this.hud.flashCrosshair();
        this.damageIndicator.flash();
      } else {
        this.player.takeDamage(damage);
        this.hud.flashCrosshair();
        this.damageIndicator.flash();
        if (this.player.isDead()) this.handlePlayerDeath(fromPos);
      }
    };

    // When enemy shot hits wall/geometry — show bullet hole and particles
    this.enemyManager.onEnemyShotHitWorld = (point, normal) => {
      this.projectileSystem.spawnImpactAt(point, normal);
    };

    // Skip decals/impact particles on enemy hits (no lingering effects) and use enemy collider for hit test
    this.projectileSystem.isEnemyCollider = (c) => this.enemyManager.getEnemyByCollider(c) !== null;

    // When player shoots: check if it hit an enemy OR a destructible prop
    const HEADSHOT_MULTIPLIER = 2;
    const HEADSHOT_Y_THRESHOLD = 1.2; // above enemy group.y — head zone is ~1.2–1.7
    const HEADSHOT_INSTAKILL = 999;   // Sniper/shotgun headshots = 1-shot kill
    this.projectileSystem.onHitCollider = (collider, _point, _normal) => {
      // Check enemies first
      const enemy = this.enemyManager.getEnemyByCollider(collider);
      if (enemy && !enemy.dead) {
        const weapon = this.weaponManager.currentWeapon;
        const weaponType = getCanonicalWeaponType(weapon.stats.name);
        let dmg = weapon.stats.damage;
        const hitY = _point.y - enemy.group.position.y;
        if (hitY >= HEADSHOT_Y_THRESHOLD) {
          if (weaponType === 'sniper' || weaponType === 'shotgun') {
            dmg = HEADSHOT_INSTAKILL;
          } else {
            dmg *= HEADSHOT_MULTIPLIER;
          }
        }
        enemy.takeDamage(dmg);
        this.hud.flashCrosshair(); // Red flash = hit confirmed
        playFleshImpact(); // Impact sound for enemy hit

        // PvE hit marker (same as multiplayer)
        if (hitY >= HEADSHOT_Y_THRESHOLD) {
          this.hitMarker.showHeadshot();
        } else {
          this.hitMarker.show();
        }

        // Blood splatter — 3D, attached to enemy (emanates from hit)
        const hitDir = new THREE.Vector3().subVectors(_point, this.fpsCamera.camera.position).normalize();
        this.bloodSplatterSystem.spawnOnEnemy(enemy.group, _point.clone(), hitDir, 12);

        if (enemy.dead) {
          this.enemyManager.removeEnemyPhysics(enemy); // So player doesn't get stuck on corpses
          this.events.emit('enemy:killed', {
            position: enemy.group.position.clone(),
          });
        }
        return;
      }

      // Check destructible props
      const prop = this.destructibleSystem.getByColliderHandle(collider.handle);
      if (prop) {
        const weapon = this.weaponManager.currentWeapon;
        this.destructibleSystem.damage(prop, weapon.stats.damage);
      }
    };

    // When a frag grenade explodes: also damage destructible props in radius
    this.grenadeSystem.onExplosion = (position, radius, damage) => {
      this.destructibleSystem.damageInRadius(position, radius, damage);
    };

    // When grenade lands: send explosion event to server in multiplayer
    this.grenadeSystem.onGrenadeLanded = (position, type) => {
      if (this.networkMode === 'client' && this.networkManager) {
        this.networkManager.sendGrenadeExplosion({
          playerId: this.networkManager.playerId!,
          timestamp: performance.now(),
          grenadeType: type,
          position: { x: position.x, y: position.y, z: position.z },
        });
      }
    };

    // When a barrel explodes: damage enemies and player in radius
    this.destructibleSystem.onBarrelExplode = (position, radius, damage) => {
      // Damage enemies
      this.enemyManager.damageEnemiesInRadius(position, radius, damage);
      // Damage player if in range
      const playerPos = this.player.getPosition();
      const dx = playerPos.x - position.x;
      const dy = playerPos.y - position.y;
      const dz = playerPos.z - position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist <= radius) {
        const falloff = 1 - dist / radius;
        const playerDmg = damage * falloff;
        this.player.takeDamage(playerDmg);
        this.damageIndicator.flash();
      }
      // Visual explosion sprite from grenade system
      this.grenadeSystem.spawnExplosion(position);
    };

    // Destruction sounds
    this.destructibleSystem.onPropDestroyed = (type, _position) => {
      playDestruction(type);
    };

    // When destructible is destroyed: send event to server in multiplayer
    this.destructibleSystem.onPropDestroyedFull = (prop) => {
      if (this.networkMode === 'client' && this.networkManager) {
        // Generate prop ID from position (for simplicity, in production use UUID)
        const propId = `${prop.type}_${Math.floor(prop.position.x * 10)}_${Math.floor(prop.position.y * 10)}_${Math.floor(prop.position.z * 10)}`;

        this.networkManager.sendDestructibleDestroyed({
          propId,
          position: { x: prop.position.x, y: prop.position.y, z: prop.position.z },
          type: prop.type,
          timestamp: performance.now(),
        });
      }
    };

    // Loot drops from destroyed props
    this.destructibleSystem.onLootDrop = (lootType, amount, position) => {
      this.pickupSystem.spawn(lootType as any, position.x, position.y, position.z, amount);
    };

    // HUD
    this.hud = new HUD();

    // Inventory (Tab to open/close)
    this.inventoryScreen = new InventoryScreen();

    // Pause menu (Escape key)
    this.pauseMenu = new PauseMenu();
    this.pauseMenu.onResume = () => {
      this.resumeGame();
    };
    this.pauseMenu.onExit = () => {
      this.exitToMenu();
    };

    // Click canvas to re-engage pointer lock (e.g. after screenshot, clicking outside)
    this.canvas.addEventListener('click', this.onCanvasClick);

    // Mission complete screen
    this.missionCompleteScreen = new MissionCompleteScreen();
    this.missionCompleteScreen.onExit = () => {
      this.exitToMenu();
    };

    // Mobile touch controls (when supported)
    if (MobileControls.isSupported()) {
      this.mobileControls = new MobileControls();
      this.input.setMobileInputProvider(() => this.mobileControls?.getState() ?? null);
    }

    if (this.levelMode) {
      this.doorSystem = new DoorSystem(
        this.scene,
        this.physics,
        () => this.player.getPosition(),
        (id) => this.player.hasKey(id),
        (id) => this.objectiveSystem?.isCompleted(id) ?? false,
      );
      this.triggerSystem = new TriggerSystem(() => this.player.getPosition());
      this.triggerSystem.onTrigger = (event) => this.handleTrigger(event);
      this.objectiveSystem = new ObjectiveSystem();
      this.briefingScreen = new BriefingScreen();
      this.objectivesDisplay = new ObjectivesDisplay();
      this.objectivesDisplay.attach();
      if (options.level) {
        this.loadLevel(options.level);
      }
    } else if (this.networkMode === 'client') {
      // Multiplayer arena: procedural maps or Custom Arena (GLB+HDRI).
      this.doorSystem = new DoorSystem(
        this.scene,
        this.physics,
        () => this.player.getPosition(),
        (id) => this.player.hasKey(id),
        (id) => this.objectiveSystem?.isCompleted(id) ?? false,
      );
      this.triggerSystem = new TriggerSystem(() => this.player.getPosition());
      this.triggerSystem.onTrigger = (event) => this.handleTrigger(event);
      this.objectiveSystem = new ObjectiveSystem();
      if (options.mapId === 'custom') {
        // Custom Arena: use prepareCustomScene() before start(), same as single-player
        this.customQuickplay = true;
        // No loadLevel — scene built in prepareCustomScene()
      } else if (options.level) {
        // Procedural map with pre-fetched config (from createMultiplayerArenaWithConfig)
        this.loadLevel(options.level);
      } else {
        this.loadLevel(createMultiplayerArena(options.mapId ?? 'crossfire'));
      }
    } else if (options.editorMode && options.editorMapId === 'custom') {
      // Map editor: Custom Arena, scene built in prepareCustomScene()
      this.customQuickplay = true;
    } else if (options.editorMode && options.level) {
      // Map editor: procedural map with pre-fetched config (empty or from file)
      this.loadLevel(options.level);
      this.initEditorStateFromLevel(options.level);
    } else if (options.customQuickplay) {
      // Custom quickplay: scene built async in prepareCustomScene() before start().
    } else {
      this.buildTestScene();
      this.spawnTestEnemies();
      this.spawnTestPickups();
    }

    // Initialize multiplayer components if in network mode
    if (this.networkMode === 'client' && this.networkManager) {
      const cameraPos = new THREE.Vector3();
      const getGroundHeightProvider = () =>
        this.customQuickplay && this.getGroundHeight
          ? (x: number, z: number) => this.getGroundHeight!(x, z)
          : null;
      this.remotePlayerManager = new RemotePlayerManager(
        this.scene,
        this.physics,
        () => this.networkManager?.playerId ?? null,
        () => this.fpsCamera.camera.getWorldPosition(cameraPos) || cameraPos,
        getGroundHeightProvider
      );
      this.nameTagManager = new NameTagManager(this.fpsCamera.camera);

      // Handle game state snapshots from server
      // Note: Socket.IO rooms already ensure we only receive snapshots for our map.
      // We log a warning if mapId mismatches but still process it to avoid silent failures.
      this.networkManager.onGameStateSnapshot = (snapshot) => {
        if (snapshot.mapId != null && this.multiplayerMapId != null && snapshot.mapId !== this.multiplayerMapId) {
          console.warn(`[Game] Snapshot mapId mismatch: got '${snapshot.mapId}', expected '${this.multiplayerMapId}' — processing anyway`);
        }
        this.remotePlayerManager?.updateFromSnapshot(snapshot);
        this.updateScoreboardFromSnapshot(snapshot);
        this.syncDestroyedDestructibles(snapshot.destroyedDestructibles);
      };

      // Handle weapon fire events (Phase 4: animations + spatial audio)
      this.networkManager.onWeaponFire = (event) => {
        const isLocalPlayer = event.playerId === this.networkManager?.playerId;

        // Don't show fire animation for local player (they see their own first-person effects)
        if (!isLocalPlayer) {
          const remotePlayer = this.remotePlayerManager?.getPlayer(event.playerId);
          if (remotePlayer) {
            if (event.direction) remotePlayer.setAimFromDirection(event.direction);
            remotePlayer.playFireAnimation();

            // Play spatial audio for remote gunshot
            const soundPosition = remotePlayer.getPosition();
            const listenerPosition = this.player.getPosition();
            // Map weapon name to sound type
            const weaponType = event.weaponType.toLowerCase().replace(/\s+/g, '-') as any;
            (async () => {
              const { playPositionalGunshot } = await import('./audio/sound-effects');
              playPositionalGunshot(weaponType, soundPosition, listenerPosition);
            })();

            console.log(`[Game] Remote player ${event.playerId} fired weapon`);
          }
        }
      };

      // Handle combat events (Phase 3 + 4)
      this.networkManager.onPlayerDamaged = (event) => {
        const isLocalPlayer = event.victimId === this.networkManager?.playerId;
        const isLocalShooter = event.shooterId === this.networkManager?.playerId;

        if (isLocalPlayer) {
          // Apply damage to local player
          this.player.takeDamage(event.damage);
          this.damageIndicator.flash();
          console.log(`[Game] Took ${event.damage} damage from ${event.shooterId}`);
        }

        // Show hit marker if we're the shooter
        if (isLocalShooter) {
          if (event.wasHeadshot) {
            this.hitMarker.showHeadshot();
          } else {
            this.hitMarker.show();
          }
          playFleshImpact(); // Impact sound for remote player hit
        }

        // Show blood splatter and hit animation for remote player hits
        if (!isLocalPlayer && this.remotePlayerManager) {
          const remotePlayer = this.remotePlayerManager.getPlayer(event.victimId);
          if (remotePlayer) {
            remotePlayer.playHitAnimation();
            if (remotePlayer.model) {
              const position = remotePlayer.getPosition();
              const direction = new THREE.Vector3(0, 0, 1);
              this.bloodSplatterSystem.spawnOnEnemy(remotePlayer.model, position, direction, 10);
            }
          }
        }
      };

      this.networkManager.onPlayerDied = (event) => {
        const isLocalPlayer = event.victimId === this.networkManager?.playerId;
        const isLocalShooter = event.killerId === this.networkManager?.playerId;

        if (isLocalPlayer) {
          this.player.setDead(true);

          const killerPlayer = event.killerId ? this.remotePlayerManager?.getPlayer(event.killerId) : null;
          const killerName = killerPlayer?.username ?? (event.killerId ? 'Unknown' : undefined);
          const fromPos = killerPlayer?.getPosition();

          this.startDeathCamera(fromPos ? fromPos.clone() : undefined, killerName);
          console.log(`[Game] You were killed by ${killerName ?? 'environment'}`);
        } else {
          // Play death animation for remote player
          const victimPlayer = this.remotePlayerManager?.getPlayer(event.victimId);
          if (victimPlayer) {
            victimPlayer.playDeathAnimation();
          }
        }

        // Optimistic kill count update for local player (server snapshot will confirm)
        if (event.killerId === this.networkManager?.playerId) {
          this.localPlayerKills += 1;
        }

        // Add to kill feed (with weapon type from server)
        const killerPlayer = event.killerId === this.networkManager?.playerId
          ? { username: 'You' }
          : this.remotePlayerManager?.getPlayer(event.killerId);
        const victimPlayer = event.victimId === this.networkManager?.playerId
          ? { username: 'You' }
          : this.remotePlayerManager?.getPlayer(event.victimId);

        const killerName = killerPlayer?.username ?? 'Unknown';
        const victimName = victimPlayer?.username ?? 'Unknown';
        const weaponType = event.weaponType ?? 'pistol';

        this.killFeed.addKill(killerName, victimName, weaponType);
      };

      // Handle respawn events (Phase 4)
      this.networkManager.onPlayerRespawned = (event) => {
        const isLocalPlayer = event.playerId === this.networkManager?.playerId;

        if (isLocalPlayer) {
          this.player.respawn();
          this.player.setPosition(event.position.x, event.position.y, event.position.z);

          this.deathOverlay.hide();
          this.respawnFlash?.show();
          playRespawnSound();

          console.log(`[Game] Respawned at (${event.position.x}, ${event.position.y}, ${event.position.z})`);
        } else {
          // Reset remote player after respawn
          const remotePlayer = this.remotePlayerManager?.getPlayer(event.playerId);
          if (remotePlayer) {
            remotePlayer.resetAfterRespawn();
          }
          console.log(`[Game] Player ${event.playerId} respawned`);
        }
      };

      // Handle grenade throw events (Phase 5)
      this.networkManager.onGrenadeThrow = (event) => {
        const isLocalPlayer = event.playerId === this.networkManager?.playerId;

        // Don't throw grenade for local player (already thrown locally)
        if (!isLocalPlayer) {
          const origin = new THREE.Vector3(event.origin.x, event.origin.y, event.origin.z);
          const direction = new THREE.Vector3(event.direction.x, event.direction.y, event.direction.z);
          this.grenadeSystem.throw(origin, direction, event.grenadeType);
          console.log(`[Game] Remote player ${event.playerId} threw ${event.grenadeType} grenade`);
        }
      };

      // Handle grenade explosion events (Phase 5)
      this.networkManager.onGrenadeExplosion = (event) => {
        const isLocalPlayer = event.playerId === this.networkManager?.playerId;

        // Show explosion visual for all players (server handles damage)
        // Note: local player already spawned explosion via grenadeLanded callback
        if (!isLocalPlayer) {
          const position = new THREE.Vector3(event.position.x, event.position.y, event.position.z);
          if (event.grenadeType === 'frag') {
            this.grenadeSystem.spawnExplosion(position);
          }
          // Gas clouds are already spawned by grenade physics simulation
        }
      };

      // Handle flashlight toggle events (Phase 5)
      this.networkManager.onFlashlightToggle = (event) => {
        const isLocalPlayer = event.playerId === this.networkManager?.playerId;

        // Update remote player's flashlight
        if (!isLocalPlayer) {
          const remotePlayer = this.remotePlayerManager?.getPlayer(event.playerId);
          if (remotePlayer) {
            remotePlayer.setFlashlight(event.isOn);
            console.log(`[Game] Remote player ${event.playerId} flashlight: ${event.isOn ? 'ON' : 'OFF'}`);
          }
        }
      };

      // Handle game over (Phase 4 - win conditions)
      this.networkManager.onGameOver = (event) => {
        document.exitPointerLock();
        const isLocalWinner = event.winnerId === this.networkManager?.playerId;
        this.gameOverOverlay.setCallbacks({
          onExit: () => this.exitToMenu(),
        });
        this.gameOverOverlay.show(event.winnerUsername, event.reason, isLocalWinner);
      };

      // Handle destructible destroyed events (Phase 5)
      this.networkManager.onDestructibleDestroyed = (event) => {
        if (this.processedDestructibleIds.has(event.propId)) return;
        if (this.processedDestructibleIds.size >= this.MAX_PROCESSED_DESTRUCTIBLES) {
          this.processedDestructibleIds.clear();
        }
        this.processedDestructibleIds.add(event.propId);

        const destroyed = this.destructibleSystem.destroyByPositionAndType(
          event.position,
          event.type,
          1.0, // Wider tolerance for position sync
          true
        );
        if (destroyed) {
          console.log(`[Game] Destructible ${event.type} destroyed at (${event.position.x}, ${event.position.y}, ${event.position.z})`);
        }
      };

      console.log('[Game] Multiplayer mode initialized with combat sync');
    }

    // Game loop
    this.loop = new GameLoop((dt) => this.tick(dt));

    // Event listeners
    this.events.on('weapon:fired', this.onWeaponFired);
  }

  private onWeaponFired = (data: any): void => {
    this.hud.flashCrosshairFire();

    if (this.networkMode === 'client' && this.networkManager) {
      let hitPlayerId: string | undefined;
      if (data.hit && data.hit.collider) {
        const remotePlayer = this.remotePlayerManager?.getPlayerByCollider(data.hit.collider);
        if (remotePlayer) {
          hitPlayerId = remotePlayer.id;
          console.log(`[Game] Hit remote player: ${hitPlayerId}`);
        }
      }

      const weaponType = getCanonicalWeaponType(this.weaponManager.currentWeapon.stats.name);
      console.log(`[Game] Sending weapon fire: ${weaponType}, hitPlayerId: ${hitPlayerId ?? 'none'}`);

      this.networkManager.sendWeaponFire({
        playerId: this.networkManager.playerId!,
        timestamp: performance.now(),
        weaponType,
        origin: {
          x: data.position.x,
          y: data.position.y,
          z: data.position.z,
        },
        direction: {
          x: data.direction.x,
          y: data.direction.y,
          z: data.direction.z,
        },
        hitPlayerId,
        hitPoint: data.hit?.point
          ? { x: data.hit.point.x, y: data.hit.point.y, z: data.hit.point.z }
          : undefined,
      });
    }
  };

  /** Show mission briefing (level mode only). Call before start(). */
  showBriefing(level: LevelSchema): void {
    if (!this.briefingScreen) return;
    this.briefingScreen.show(level);
    this.briefingScreen.setOnStart(() => {
      this.loadLevel(level);
      this.start();
    });
  }

  /** Build level from schema (level mode). Call after showBriefing → user clicks Start. */
  loadLevel(level: LevelSchema): void {
    if (!this.doorSystem || !this.triggerSystem || !this.objectiveSystem) return;

    this.disposeLevel();

    this.levelName = level.name;
    this.missionElapsed = 0;

    this.navMesh = level.enemies.length > 0 ? new NavMesh() : null;
    const prevPropDestroyed = this.destructibleSystem.onPropDestroyedFull;
    this.destructibleSystem.onPropDestroyedFull = (prop) => {
      prevPropDestroyed?.(prop);
      this.navMesh?.unblockAt(prop.position.x, prop.position.z);
    };

    this.levelGroup = new THREE.Group();
    this.scene.add(this.levelGroup);

    buildLevel(level, {
      scene: this.scene,
      physics: this.physics,
      doorSystem: this.doorSystem,
      triggerSystem: this.triggerSystem,
      objectiveSystem: this.objectiveSystem,
      enemyManager: this.enemyManager,
      pickupSystem: this.pickupSystem,
      destructibleSystem: this.destructibleSystem,
      setPlayerPosition: (x, y, z) => {
        this.playerSpawnPosition = { x, y, z };
        this.player.setPosition(x, y, z);
      },
      navMesh: this.navMesh ?? undefined,
      levelGroup: this.levelGroup,
    });
  }

  /** Dispose previous level before loading a new one. Clears systems and level geometry. */
  private disposeLevel(): void {
    this.doorSystem?.clear();
    this.triggerSystem?.clear();
    this.objectiveSystem?.clear();
    this.pickupSystem?.clear();
    this.destructibleSystem?.clear();
    this.enemyManager?.clear();
    this.navMesh = null;

    if (this.levelGroup) {
      this.scene.remove(this.levelGroup);
      this.levelGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (child.geometry) child.geometry.dispose();
          const mat = child.material;
          if (mat) {
            if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
            else (mat as THREE.Material).dispose();
          }
        }
      });
      this.levelGroup = null;
    }
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    if (!MobileControls.isSupported()) {
      this.input.requestPointerLock();
    }
    this.mobileControls?.show();
    document.getElementById('start-screen')!.style.display = 'none';
    this.hud.show();
    if (this.networkMode === 'client') this.hud.setMultiplayerHint(true);
    if (this.levelMode && this.objectivesDisplay) this.objectivesDisplay.show();
    this.gameStartTime = performance.now();
    this.loop.start();
    startMusic();
  }

  private pauseGame(): void {
    this.paused = true;
    document.exitPointerLock();
    this.mobileControls?.hide();
    this.pauseMenu.show();
  }

  private resumeGame(): void {
    this.paused = false;
    this.pauseMenu.hide();
    if (!MobileControls.isSupported()) {
      this.input.requestPointerLock();
    }
    this.mobileControls?.show();
    this.input.resetMouse();
  }

  private onCanvasClick = (): void => {
    if (MobileControls.isSupported()) return;
    if (!this.started || this.paused || this.missionComplete) return;
    if (this.inventoryScreen.isOpen || this.scoreboard.visible) return;
    if (this.input.pointerLocked) return;
    this.input.requestPointerLock();
  };

  private exitToMenu(): void {
    this.paused = false;
    this.loop.stop();
    stopMusic();
    this.dispose();
    // Reload the page to cleanly reset everything (physics, scene, etc.)
    window.location.reload();
  }

  /** Teardown listeners and resources before reload or level switch. */
  dispose(): void {
    this.canvas.removeEventListener('click', this.onCanvasClick);
    this.events.off('weapon:fired', this.onWeaponFired);
    this.input.dispose();
    this.mobileControls?.dispose();
    this.networkManager?.dispose();
  }

  /**
   * Update scoreboard from server game state snapshot (multiplayer only).
   */
  /**
   * Apply destroyed destructibles from server (for new joiners + sync).
   */
  private syncDestroyedDestructibles(destroyed?: Array<{ propId: string; position: { x: number; y: number; z: number }; type: 'crate' | 'crate_metal' | 'barrel' }>): void {
    if (!destroyed) return;
    for (const d of destroyed) {
      if (this.processedDestructibleIds.has(d.propId)) continue;
      if (this.processedDestructibleIds.size >= this.MAX_PROCESSED_DESTRUCTIBLES) {
        this.processedDestructibleIds.clear();
      }
      this.processedDestructibleIds.add(d.propId);
      // Silent=true: no explosions/debris when syncing for new joiners
      this.destructibleSystem.destroyByPositionAndType(d.position, d.type, 1.0, true, true);
    }
  }

  private updateScoreboardFromSnapshot(snapshot: { players: Record<string, { playerId?: string; username?: string; kills?: number; deaths?: number }> }): void {
    if (!this.networkManager) return;

    const localId = this.networkManager.playerId ?? '';
    const localState = snapshot.players[localId] as { kills?: number } | undefined;
    if (localState?.kills !== undefined) this.localPlayerKills = localState.kills;

    const players: ScoreboardPlayer[] = [];
    const localPing = this.networkManager.ping ?? 0;
    const localUsername = this.networkManager.localUsername;

    for (const [playerId, state] of Object.entries(snapshot.players)) {
      const p = state as { playerId?: string; username?: string; kills?: number; deaths?: number };
      players.push({
        id: playerId,
        username: p.username ?? playerId,
        kills: p.kills ?? 0,
        deaths: p.deaths ?? 0,
        ping: playerId === localId ? localPing : undefined,
        isLocalPlayer: playerId === localId,
      });
    }

    // If no server data yet, add local player
    if (players.length === 0 && localId) {
      players.push({
        id: localId,
        username: localUsername,
        kills: 0,
        deaths: 0,
        ping: localPing,
        isLocalPlayer: true,
      });
    }

    this.scoreboard.update(players);
  }

  /** Start death camera: fall to ground, look toward killer. Caller sets onCountdownComplete for single-player. */
  private startDeathCamera(fromPos?: THREE.Vector3, killerName?: string): void {
    this._deathCameraKillerName = killerName;
    this._deathCameraStartPos.copy(this.fpsCamera.camera.position);
    const pp = this.player.getPosition();
    const groundY = this.getGroundY(pp.x, pp.y, pp.z);
    const headAboveGround = 0.22;
    this._deathCameraTargetPos.set(pp.x, Math.max(groundY + headAboveGround, pp.y - 0.85), pp.z);
    this.deathCameraTiltSign = Math.random() < 0.5 ? -1 : 1;
    this.deathCameraShakePhase = Math.random() * 1000;
    this.fpsCamera.getLookDirection(this._deathCameraLookAtStart);
    this._deathCameraLookAtStart.multiplyScalar(6).add(this._deathCameraStartPos);
    if (fromPos) {
      this._deathCameraLookAtEnd.copy(fromPos);
      this._deathCameraLookAtEnd.y += 0.25;
    } else {
      this._deathCameraLookAtEnd.copy(this._deathCameraLookAtStart);
    }
    this.deathCameraT = 0;
    this.deathCameraAnimating = true;
    this.lowHealthOverlay.hide();
  }

  /** Handle player death (single-player PvE). Starts death camera, then shows overlay and respawns. */
  private handlePlayerDeath(fromPos?: THREE.Vector3): void {
    if (this.networkMode === 'client') return; // Multiplayer: onPlayerDied handles it
    this.deathOverlay.onCountdownComplete = () => {
      this.deathOverlay.onCountdownComplete = null;
      this.deathOverlay.hide();
      this.lowHealthOverlay.hide();
      this.player.respawn();
      this.player.setPosition(
        this.playerSpawnPosition.x,
        this.playerSpawnPosition.y,
        this.playerSpawnPosition.z,
      );
    };
    this.startDeathCamera(fromPos);
  }

  /** Cast ray down to find ground Y (for death camera floor clearance). */
  private getGroundY(x: number, y: number, z: number): number {
    const hit = this.physics.castRay(x, y + 1.2, z, 0, -1, 0, 2.5, this.player.getCollider());
    if (hit) return hit.point.y;
    return Math.max(0, y - 1);
  }

  private updateDeathCamera(dt: number): void {
    this.deathCameraT = Math.min(1, this.deathCameraT + dt / this.deathCameraDuration);
    const t = this.deathCameraT;
    const eased = 1 - (1 - t) ** 3; // ease-out cubic — quicker settle
    this.fpsCamera.camera.position.lerpVectors(
      this._deathCameraStartPos,
      this._deathCameraTargetPos,
      eased,
    );
    // Shake: stronger during fall, fading as we settle
    this.deathCameraShakePhase += dt * 70;
    const shakeIntensity = (1 - t) * 0.058;
    const n = (x: number) => Math.sin(x) * 0.5 + Math.sin(x * 2.3) * 0.5 + Math.sin(x * 1.7) * 0.3;
    this._deathCameraShakeOffset.set(
      n(this.deathCameraShakePhase) * shakeIntensity,
      n(this.deathCameraShakePhase + 7) * shakeIntensity * 0.8,
      n(this.deathCameraShakePhase + 13) * shakeIntensity,
    );
    this.fpsCamera.camera.position.add(this._deathCameraShakeOffset);
    // Lerp look-at target from "where we were looking" to "killer" — guarantees we end looking up at killer
    this._deathCameraLookAtCurrent.lerpVectors(
      this._deathCameraLookAtStart,
      this._deathCameraLookAtEnd,
      eased,
    );
    this.fpsCamera.camera.lookAt(this._deathCameraLookAtCurrent);
    // Tilt on settle: roll increases toward end (head lolling to the side)
    const tiltAngle = eased * 0.22 * this.deathCameraTiltSign;
    this.fpsCamera.camera.getWorldDirection(this._deathCameraForward);
    this._deathCameraRollQuat.setFromAxisAngle(this._deathCameraForward, tiltAngle);
    this.fpsCamera.camera.quaternion.multiply(this._deathCameraRollQuat);
    if (this.deathCameraT >= 1) {
      this.deathCameraAnimating = false;
      this.lowHealthOverlay.hide();
      this.deathOverlay.show(this._deathCameraKillerName);
      this._deathCameraKillerName = undefined;
    }
  }

  private handleTrigger(event: string): void {
    const parts = event.split(':');
    if (parts[0] === 'objective' && parts[1] === 'complete' && this.objectiveSystem) {
      this.objectiveSystem.complete(parts[2]);
    } else if (parts[0] === 'door' && parts[1] === 'unlock' && this.doorSystem) {
      this.doorSystem.unlockDoor(parts[2]);
    } else if (event === 'mission:complete') {
      if (!this.missionComplete) {
        // Complete the extraction objective before showing the screen
        this.objectiveSystem?.complete('obj3');
        this.missionComplete = true;
        document.exitPointerLock();
        stopMusic();
        this.missionCompleteScreen.show(this.levelName, this.missionElapsed);
        this.onMissionComplete?.();
      }
    }
  }

  private tick(dt: number): void {
    // Poll gamepad and merge mobile input
    this.input.update(dt);

    // Pause toggle (Escape)
    if (this.input.wasKeyJustPressed('escape')) {
      if (this.pauseMenu.isOpen) {
        this.resumeGame();
      } else if (!this.inventoryScreen.isOpen) {
        this.pauseGame();
      }
    }

    // While paused or mission complete, only render (frozen frame)
    if (this.paused || this.missionComplete) {
      this.input.resetMouse();
      this.renderer.render(this.scene, this.fpsCamera.camera);
      return;
    }

    // Track mission time
    if (this.levelMode) this.missionElapsed += dt;

    // Scoreboard: hold Q to view, release to close - multiplayer only (Q avoids browser Tab conflict)
    if (this.networkMode === 'client' && this.networkManager) {
      if (this.input.isKeyDown('q')) {
        if (!this.scoreboard.visible) {
          document.exitPointerLock();
          this.mobileControls?.hide();
          this.scoreboard.show();
        }
      } else {
        if (this.scoreboard.visible) {
          this.scoreboard.hide();
          if (this.started) {
            this.input.requestPointerLock();
            this.mobileControls?.show();
          }
        }
      }
    }

    // Inventory toggle (Tab in single-player, I in multiplayer) — not in editor mode (Tab used for mode switch)
    const inventoryKey = this.networkMode === 'client' ? 'i' : 'tab';
    if (!this.editorMode && this.input.wasKeyJustPressed(inventoryKey)) {
      if (this.inventoryScreen.isOpen) {
        this.inventoryScreen.hide();
        if (this.started) {
          this.input.requestPointerLock();
          this.mobileControls?.show();
        }
        this.input.resetMouse(); // So same key doesn't reopen next frame
      } else {
        document.exitPointerLock();
        this.mobileControls?.hide();
        this.inventoryScreen.show(
          {
            weapons: this.weaponManager.getOwnedWeapons(),
            keys: this.player.getKeys(),
          },
          (type, skin) => {
            this.weaponManager.setWeaponSkin(type, skin);
            this.inventoryScreen.updateState({
              weapons: this.weaponManager.getOwnedWeapons(),
              keys: this.player.getKeys(),
            });
          },
          () => {
            this.inventoryScreen.hide();
            if (this.started) {
              this.input.requestPointerLock();
              this.mobileControls?.show();
            }
          },
          (type, skin, rotationY, canvas) => {
            const key = `${type}:${skin}`;
            let mesh = this.weaponPreviewMeshCache.get(key);
            if (!mesh) {
              mesh = this.weaponManager.getPreviewMesh(type, skin);
              if (this.weaponPreviewMeshCache.size >= this.MAX_WEAPON_PREVIEW_CACHE) {
                const firstKey = this.weaponPreviewMeshCache.keys().next().value;
                if (firstKey !== undefined) this.weaponPreviewMeshCache.delete(firstKey);
              }
              this.weaponPreviewMeshCache.set(key, mesh);
            } else {
              // Move to end (LRU: keep recently used)
              this.weaponPreviewMeshCache.delete(key);
              this.weaponPreviewMeshCache.set(key, mesh);
            }
            mesh.rotation.y = rotationY;
            renderWeaponPreviewToCanvas(mesh, type, skin, rotationY, canvas);
          },
        );
      }
    }

    if (this.inventoryScreen.isOpen) {
      this.input.resetMouse();
      return; // Don't update camera, weapons, or gameplay while inventory is open
    }

    // Death camera animation (single-player): fall to ground, look at killer
    if (this.deathCameraAnimating) {
      this.updateDeathCamera(dt);
    }

    const deadAndWaiting = this.player.isDead() && this.networkMode !== 'client';
    if (!this.deathCameraAnimating && !(deadAndWaiting && this.deathOverlay.isVisible())) {
    // Aim assist (single-player only)
    let aimAssistDelta: { yaw: number; pitch: number } | undefined;
    let lookScale = 1;
    const aimStrength = GameSettings.getAimAssistStrength();
    const aimMode = GameSettings.getAimAssistMode();
    if (aimStrength > 0 && aimMode !== 'off' && this.networkMode !== 'client') {
      this.fpsCamera.getLookDirection(this._aimAssistLookDir);
      const hit = this.enemyManager.getBestAimAssistTarget(
        this.fpsCamera.camera.position,
        this._aimAssistLookDir,
        0.12, // ~7° cone
        35,
      );
      if (hit) {
        this._aimAssistToTarget.subVectors(hit.target, this.fpsCamera.camera.position).normalize();
        const targetYaw = Math.atan2(this._aimAssistToTarget.x, -this._aimAssistToTarget.z);
        const targetPitch = Math.asin(Math.max(-1, Math.min(1, this._aimAssistToTarget.y)));
        const curYaw = Math.atan2(this._aimAssistLookDir.x, -this._aimAssistLookDir.z);
        const curPitch = Math.asin(Math.max(-1, Math.min(1, this._aimAssistLookDir.y)));
        let dYaw = targetYaw - curYaw;
        while (dYaw > Math.PI) dYaw -= Math.PI * 2;
        while (dYaw < -Math.PI) dYaw += Math.PI * 2;
        const dPitch = targetPitch - curPitch;
        if (aimMode === 'pull') {
          const pull = aimStrength * 0.15;
          aimAssistDelta = { yaw: dYaw * pull, pitch: dPitch * pull };
        } else if (aimMode === 'slowdown') {
          lookScale = 1 - aimStrength * 0.7;
        }
      }
    }

    // Update camera from mouse input (scales sensitivity by FOV when scoped)
    this.fpsCamera.update(this.input, aimAssistDelta, lookScale);

    // Weapons (before physics, so fire input is responsive)
    this.weaponManager.update(this.input, dt);

    // Fixed-step physics
    this.physicsAccumulator += dt;
    while (this.physicsAccumulator >= PHYSICS_STEP) {
      this.player.update(this.input, PHYSICS_STEP);
      this.physics.step();
      this.physicsAccumulator -= PHYSICS_STEP;
    }

    // Grenades — after physics so throw origin matches current camera/eye position
    if (!this.editorMode && this.input.wasKeyJustPressed('g') && this.gasGrenadeCount > 0) {
      this._throwOrigin.copy(this.fpsCamera.camera.position);
      this.fpsCamera.getLookDirection(this._throwDir);
      this.grenadeSystem.throw(this._throwOrigin, this._throwDir, 'gas');
      this.gasGrenadeCount--;

      // Send grenade throw event in multiplayer
      if (this.networkMode === 'client' && this.networkManager) {
        this.networkManager.sendGrenadeThrow({
          playerId: this.networkManager.playerId!,
          timestamp: performance.now(),
          grenadeType: 'gas',
          origin: { x: this._throwOrigin.x, y: this._throwOrigin.y, z: this._throwOrigin.z },
          direction: { x: this._throwDir.x, y: this._throwDir.y, z: this._throwDir.z },
        });
      }
    }
    if (!this.editorMode && this.input.wasKeyJustPressed('f') && this.fragGrenadeCount > 0) {
      this._throwOrigin.copy(this.fpsCamera.camera.position);
      this.fpsCamera.getLookDirection(this._throwDir);
      this.grenadeSystem.throw(this._throwOrigin, this._throwDir, 'frag');
      this.fragGrenadeCount--;

      // Send grenade throw event in multiplayer
      if (this.networkMode === 'client' && this.networkManager) {
        this.networkManager.sendGrenadeThrow({
          playerId: this.networkManager.playerId!,
          timestamp: performance.now(),
          grenadeType: 'frag',
          origin: { x: this._throwOrigin.x, y: this._throwOrigin.y, z: this._throwOrigin.z },
          direction: { x: this._throwDir.x, y: this._throwDir.y, z: this._throwDir.z },
        });
      }
    }
    } // end !deathCameraAnimating

    // Update enemy manager with player state
    const playerPos = this.player.getPosition();
    const isMoving =
      this.input.isKeyDown('w') ||
      this.input.isKeyDown('a') ||
      this.input.isKeyDown('s') ||
      this.input.isKeyDown('d');

    this._playerVec.set(playerPos.x, playerPos.y, playerPos.z);
    this.enemyManager.setPlayerState(this._playerVec, isMoving);
    const gameElapsed = (performance.now() - this.gameStartTime) / 1000;
    this.enemyManager.setPlayerTargetable(gameElapsed >= GameSettings.getAIGameStartGrace());
    this.enemyManager.setCameraPosition(this.fpsCamera.camera.position);
    this.enemyManager.update(dt);

    // Pickups
    this.pickupSystem.update(dt, this._playerVec);

    // Projectile system: particles + decal cleanup
    this.projectileSystem.update(dt);

    // Grenade system: thrown arcs + gas clouds + explosions
    this.grenadeSystem.setPlayerPosition(
      this._playerVec.x,
      this._playerVec.y,
      this._playerVec.z,
    );
    this.grenadeSystem.update(dt, this.fpsCamera.camera);

    // Blood overlay: update 2D splats
    this.bloodOverlay.update(dt);

    // Blood splatter system: update particle effects (3D — kept for potential use)
    this.bloodSplatterSystem.update(dt);

    // Light pool: auto-release expired pooled lights (muzzle flashes, etc.)
    globalLightPool.update();

    // Day/night cycle (custom quickplay)
    if (this.customQuickplay && this.dayNightSun) {
      if (GameSettings.getDayNightCycle()) {
        const speed = GameSettings.getDayNightSpeed();
        // ~1 min per full day at 100%, ~30s at 200%
        this.dayNightTime += dt * (speed / 60);
        if (this.dayNightTime >= 1) this.dayNightTime -= 1;
        if (this.dayNightTime < 0) this.dayNightTime += 1;
      } else {
        this.dayNightTime = GameSettings.getTimeOfDay();
      }
      const state = getSunState(this.dayNightTime);
      const intensityMult = GameSettings.getDayNightIntensity();
      this.dayNightSun.position.copy(state.position);
      this.dayNightSun.color.copy(state.color);
      this.dayNightSun.intensity = state.intensity * intensityMult;
      if (this.dayNightHemi) {
        this.dayNightHemi.color.copy(state.hemiSkyColor);
        this.dayNightHemi.groundColor.copy(state.hemiGroundColor);
        this.dayNightHemi.intensity = state.ambientIntensity * intensityMult;
      }
      if (this.scene.background instanceof THREE.Texture) {
        this.scene.backgroundIntensity = state.backgroundIntensity * intensityMult;
      }
      if (this.scene.environment) this.scene.environmentIntensity = state.envIntensity * intensityMult;

      // Rotating sky sphere: switch day/night texture and apply rotation
      if (this.skySphere && this.daySkyTexture && this.nightSkyTexture) {
        const mode = getSkyboxMode(this.dayNightTime);
        const tex = mode === 'day' ? this.daySkyTexture : this.nightSkyTexture;
        (this.skySphere.material as THREE.MeshBasicMaterial).map = tex;
        this.skySphere.rotation.y = -(this.dayNightTime + this.skyboxRotationOffset) * Math.PI * 2;
        this.skySphere.position.copy(this.fpsCamera.camera.getWorldPosition(this._skySpherePos));
      }
    }

    // Destructible props: debris physics + cleanup
    this.destructibleSystem.update(dt);

    // Scope overlay
    this.scopeOverlay.visible = this.weaponManager.scoped;

    // Tactical overlay (N key — night vision + gas mask)
    if (this.input.wasKeyJustPressed('n')) {
      this.tacticalOverlay.visible = !this.tacticalOverlay.visible;
    }

    // Map editor: Tab mode switch, scroll cycle, click/delete, ghost update
    if (this.editorMode && this.mapEditorUI && this.input.pointerLocked) {
      // Tab: toggle between pickup / prop mode
      if (this.input.wasKeyJustPressed('Tab')) {
        const newMode = this.mapEditorUI.currentMode === 'pickup' ? 'prop' : 'pickup';
        this.mapEditorUI.setMode(newMode);
        this.rebuildEditorHandAndGhost();
      }
      // Scroll wheel: cycle items within current mode
      const scroll = this.input.scrollDelta;
      if (scroll !== 0) {
        const nextIdx = this.mapEditorUI.currentIndex + (scroll > 0 ? 1 : -1);
        this.mapEditorUI.selectIndex(nextIdx);
        this.rebuildEditorHandAndGhost();
      }
      // Delete / place
      if (this.input.wasKeyJustPressed('Delete') || this.input.wasKeyJustPressed('Backspace')) {
        this.deleteEditorItemAtCursor();
      }
      if (this.input.wasMouseJustPressed) {
        // Only place when clicking the world (canvas), not when clicking the editor panel
        const target = this.input.lastMouseDownTarget as Node | null;
        const clickOnPanel = target && this.mapEditorUI.getElement().contains(target);
        if (!clickOnPanel) {
          const hit = this.getEditorRaycastHit();
          if (hit) this.placeEditorItemAt(hit);
        }
      }
      // Update ghost mesh position every frame
      this.updateEditorGhost();
    }

    // Set spawn point (F8 key) — use current position for single-player respawn
    if (this.input.wasKeyJustPressed('f8')) {
      const pos = this.player.getPosition();
      this.playerSpawnPosition = { x: pos.x, y: pos.y, z: pos.z };
      if (this.customQuickplay) {
        try {
          localStorage.setItem(
            '007remix_custom_spawn',
            JSON.stringify({ x: pos.x, y: pos.y, z: pos.z }),
          );
          console.log('Spawn point set:', { x: pos.x, y: pos.y, z: pos.z });
        } catch (_) {}
      }
      this.hud.showPickupNotification('Spawn point set');
    }

    // Flashlight toggle (V key)
    if (this.input.wasKeyJustPressed('v')) {
      this.flashlightOn = !this.flashlightOn;
      this.flashlight.intensity = this.flashlightOn ? 40 : 0;

      // Send flashlight toggle event in multiplayer
      if (this.networkMode === 'client' && this.networkManager) {
        this.networkManager.sendFlashlightToggle({
          playerId: this.networkManager.playerId!,
          isOn: this.flashlightOn,
          timestamp: performance.now(),
        });
      }
    }

    // Damage indicator
    this.damageIndicator.update(dt);
    this.respawnFlash?.update(dt);

    // Low health overlay (red vignette at 25 HP and below)
    this.lowHealthOverlay.update(this.player.health);

    // Level systems (doors, triggers, objectives)
    if (this.doorSystem) this.doorSystem.update(dt);
    if (this.triggerSystem) this.triggerSystem.update();
    if (this.objectiveSystem && this.objectivesDisplay) {
      this.objectivesDisplay.update(this.objectiveSystem.getAll());
    }

    // HUD
    this.hud.updateHealth(this.player.health);
    this.hud.updateArmor(this.player.armor);
    this.hud.updateGrenades(this.gasGrenadeCount, this.fragGrenadeCount);
    this.hud.updateWeapon(this.weaponManager.currentWeapon);
    this.hud.updateTimeOfDay(
      this.customQuickplay && this.dayNightSun ? this.dayNightTime : null,
    );
    this.hud.updateCompass(this.fpsCamera.getYRotation());
    // Show ping and kills only in multiplayer
    if (this.networkMode === 'client' && this.networkManager) {
      this.hud.updatePing(this.networkManager.ping);
      this.hud.updateKills(this.localPlayerKills, 25);
    } else {
      this.hud.updatePing(null);
      this.hud.updateKills(null);
    }
    this.hud.update(dt);

    // Multiplayer: Send player state to server + update remote players
    if (this.networkMode === 'client' && this.networkManager) {
      // Variable update rate: faster when moving, slower when idle (bandwidth optimization)
      const isMoving = this.input.isKeyDown('w') || this.input.isKeyDown('a') ||
                       this.input.isKeyDown('s') || this.input.isKeyDown('d');
      this.networkUpdateRate = isMoving
        ? NetworkConfig.UPDATE_RATES.PLAYER_STATE
        : NetworkConfig.UPDATE_RATES.PLAYER_STATE_IDLE;

      // Send local player state at configured rate
      const now = performance.now();
      const updateInterval = 1000 / this.networkUpdateRate;
      if (now - this.lastNetworkUpdate >= updateInterval) {
        const playerPos = this.player.getPosition();
        this.networkManager.sendPlayerState({
          playerId: this.networkManager.playerId!,
          position: { x: playerPos.x, y: playerPos.y, z: playerPos.z },
          rotation: this.fpsCamera.getYRotation(),
          health: this.player.health,
          armor: this.player.armor,
          currentWeapon: getCanonicalWeaponType(this.weaponManager.currentWeapon.stats.name),
          crouching: this.player.isCrouching,
          isMoving,
          timestamp: now,
        });
        this.lastNetworkUpdate = now;
      }

      // Update remote players
      this.remotePlayerManager?.update(dt);

      // Update name tags (project 3D positions to screen)
      if (this.nameTagManager) {
        const targets = this.remotePlayerManager!.getAll().map((p) => ({
          id: p.id,
          username: p.username,
          getPosition: () => p.getPosition(),
          isDead: p.isDead,
        }));
        this.nameTagManager.update(targets);
      }
    }

    // Reset per-frame input
    this.input.resetMouse();

    // Render
    this.renderer.render(this.scene, this.fpsCamera.camera);
  }

  // ──────────── Enemy Spawns ────────────

  private spawnTestEnemies(): void {
    const yOff = this.customGroundLevel ?? 0;
    const c = this.customSpawnCenter;
    const ox = (x: number) => (c ? c.x + x : x);
    const oz = (z: number) => (c ? c.z + z : z);
    const getY = (x: number, z: number) =>
      this.customQuickplay && this.getGroundHeight
        ? this.getGroundHeight(x, z) - 0.3
        : yOff;

    // Guard near the crate stack (facing player spawn)
    this.enemyManager.spawnEnemy({
      x: ox(5), y: getY(ox(5), oz(5)), z: oz(5),
      facingAngle: Math.PI + 0.5,
      weapon: 'pistol',
    });

    // Guard behind barrels (facing center)
    this.enemyManager.spawnEnemy({
      x: ox(-6), y: getY(ox(-6), oz(-6)), z: oz(-6),
      facingAngle: Math.PI / 4,
      weapon: 'rifle',
    });

    // Guard near far wall (patrolling area)
    this.enemyManager.spawnEnemy({
      x: ox(7), y: getY(ox(7), oz(-5)), z: oz(-5),
      facingAngle: Math.PI,
      weapon: 'shotgun',
    });

    // Guard near table crate
    this.enemyManager.spawnEnemy({
      x: ox(-4), y: getY(ox(-4), oz(6)), z: oz(6),
      facingAngle: -Math.PI / 2,
      weapon: 'sniper',
    });
  }

  // ──────────── Pickups ────────────

  private handlePickup(type: string, amount: number, keyId?: string): void {
    if (type === 'key' && keyId) {
      this.player.giveKey(keyId);
      this.hud.showPickupNotification(`Key card acquired`);
      return;
    }
    switch (type) {
      case 'health':
        this.player.heal(amount);
        this.hud.showPickupNotification(`+${amount} Health`);
        break;
      case 'armor':
        this.player.addArmor(amount);
        this.hud.showPickupNotification(`+${amount} Armor`);
        break;
      case 'ammo-pistol':
        this.weaponManager.addAmmo('pistol', amount);
        this.hud.showPickupNotification(`+${amount} Pistol Ammo`);
        break;
      case 'ammo-rifle':
        this.weaponManager.addAmmo('rifle', amount);
        this.hud.showPickupNotification(`+${amount} Rifle Ammo`);
        break;
      case 'ammo-shotgun':
        this.weaponManager.addAmmo('shotgun', amount);
        this.hud.showPickupNotification(`+${amount} Shotgun Shells`);
        break;
      case 'ammo-sniper':
        this.weaponManager.addAmmo('sniper', amount);
        this.hud.showPickupNotification(`+${amount} Sniper Rounds`);
        break;
      case 'weapon-rifle':
        this.weaponManager.addWeapon('rifle');
        this.hud.showPickupNotification('KF7 Soviet');
        break;
      case 'weapon-shotgun':
        this.weaponManager.addWeapon('shotgun');
        this.hud.showPickupNotification('Shotgun');
        break;
      case 'weapon-sniper':
        this.weaponManager.addWeapon('sniper');
        this.hud.showPickupNotification('Sniper Rifle');
        break;
    }
  }

  private spawnTestPickups(): void {
    const yOff = this.customGroundLevel ?? 0;
    const c = this.customSpawnCenter;
    const ox = (x: number) => (c ? c.x + x : x);
    const oz = (z: number) => (c ? c.z + z : z);
    const getY = (x: number, z: number) =>
      this.customQuickplay && this.getGroundHeight
        ? this.getGroundHeight(x, z)
        : yOff;

    // Weapons scattered around the room
    this.pickupSystem.spawn('weapon-rifle', ox(-3), getY(ox(-3), oz(-3)), oz(-3), 0);
    this.pickupSystem.spawn('weapon-shotgun', ox(6), getY(ox(6), oz(6)), oz(6), 0);
    this.pickupSystem.spawn('weapon-sniper', ox(-7), getY(ox(-7), oz(7)), oz(7), 0);

    // Health packs
    this.pickupSystem.spawn('health', ox(0), getY(ox(0), oz(8)), oz(8), 25);
    this.pickupSystem.spawn('health', ox(-8), getY(ox(-8), oz(0)), oz(0), 25);

    // Armor
    this.pickupSystem.spawn('armor', ox(8), getY(ox(8), oz(0)), oz(0), 50);

    // Ammo
    this.pickupSystem.spawn('ammo-pistol', ox(3), getY(ox(3), oz(-7)), oz(-7), 14);
    this.pickupSystem.spawn('ammo-rifle', ox(-2), getY(ox(-2), oz(4)), oz(4), 30);
    this.pickupSystem.spawn('ammo-shotgun', ox(5), getY(ox(5), oz(-2)), oz(-2), 10);
    this.pickupSystem.spawn('ammo-sniper', ox(-5), getY(ox(-5), oz(2)), oz(2), 5);
  }

  /**
   * Spawn pickups for Custom Arena (single-player and multiplayer).
   * Uses raycast ground height so items sit on terrain.
   * Uses config.pickups when set; otherwise defaults. Falls back to spawnTestPickups when no custom layout.
   */
  private spawnCustomArenaPickups(): void {
    const c = this.customSpawnCenter;
    if (!c) {
      this.spawnTestPickups();
      return;
    }
    const yOff = this.customGroundLevel ?? 0;
    const ox = (x: number) => c.x + x;
    const oz = (z: number) => c.z + z;
    const getY = (x: number, z: number) =>
      this.getGroundHeight ? this.getGroundHeight(x, z) : yOff;

    const pickups = this.customQuickplayPlacement?.pickups;
    if (Array.isArray(pickups) && pickups.length > 0) {
      for (const p of pickups) {
        const x = ox(p.x);
        const z = oz(p.z);
        const y = getY(x, z);
        this.pickupSystem.spawn(p.type as any, x, y, z, p.amount ?? 0);
      }
      return;
    }

    // Default layout — spread across the map
    this.pickupSystem.spawn('weapon-rifle', ox(-12), getY(ox(-12), oz(-8)), oz(-8), 0);
    this.pickupSystem.spawn('weapon-rifle', ox(14), getY(ox(14), oz(6)), oz(6), 0);
    this.pickupSystem.spawn('weapon-shotgun', ox(8), getY(ox(8), oz(10)), oz(10), 0);
    this.pickupSystem.spawn('weapon-shotgun', ox(-6), getY(ox(-6), oz(-12)), oz(-12), 0);
    this.pickupSystem.spawn('weapon-sniper', ox(0), getY(ox(0), oz(-14)), oz(-14), 0);
    this.pickupSystem.spawn('weapon-sniper', ox(-14), getY(ox(-14), oz(4)), oz(4), 0);
    this.pickupSystem.spawn('health', ox(-10), getY(ox(-10), oz(0)), oz(0), 25);
    this.pickupSystem.spawn('health', ox(10), getY(ox(10), oz(-6)), oz(-6), 25);
    this.pickupSystem.spawn('health', ox(0), getY(ox(0), oz(10)), oz(10), 25);
    this.pickupSystem.spawn('health', ox(6), getY(ox(6), oz(-10)), oz(-10), 25);
    this.pickupSystem.spawn('health', ox(-8), getY(ox(-8), oz(8)), oz(8), 25);
    this.pickupSystem.spawn('armor', ox(0), getY(ox(0), oz(0)), oz(0), 50);
    this.pickupSystem.spawn('armor', ox(12), getY(ox(12), oz(-4)), oz(-4), 50);
    this.pickupSystem.spawn('armor', ox(-10), getY(ox(-10), oz(-6)), oz(-6), 50);
    this.pickupSystem.spawn('ammo-pistol', ox(-15), getY(ox(-15), oz(2)), oz(2), 24);
    this.pickupSystem.spawn('ammo-pistol', ox(15), getY(ox(15), oz(-2)), oz(-2), 24);
    this.pickupSystem.spawn('ammo-rifle', ox(-12), getY(ox(-12), oz(-10)), oz(-10), 30);
    this.pickupSystem.spawn('ammo-rifle', ox(10), getY(ox(10), oz(8)), oz(8), 30);
    this.pickupSystem.spawn('ammo-rifle', ox(-4), getY(ox(-4), oz(6)), oz(6), 30);
    this.pickupSystem.spawn('ammo-shotgun', ox(6), getY(ox(6), oz(12)), oz(12), 12);
    this.pickupSystem.spawn('ammo-shotgun', ox(-8), getY(ox(-8), oz(-14)), oz(-14), 12);
    this.pickupSystem.spawn('ammo-sniper', ox(2), getY(ox(2), oz(-16)), oz(-16), 8);
    this.pickupSystem.spawn('ammo-sniper', ox(-14), getY(ox(-14), oz(2)), oz(2), 8);
  }

  // ──────────── Test Scene ────────────

  private buildTestScene(): void {
    // Ambient light (dim, blue-ish)
    const ambient = new THREE.AmbientLight(0x404060, 0.6);
    this.scene.add(ambient);

    // Main overhead light
    const pointLight = new THREE.PointLight(0xffffee, 40, 35);
    pointLight.position.set(0, 4.5, 0);
    pointLight.castShadow = true;
    pointLight.shadow.mapSize.set(512, 512);
    this.scene.add(pointLight);

    // Secondary lights in corners
    const cornerLight1 = new THREE.PointLight(0xffe0a0, 20, 22);
    cornerLight1.position.set(-7, 3, -7);
    this.scene.add(cornerLight1);

    const cornerLight2 = new THREE.PointLight(0xa0d0ff, 20, 22);
    cornerLight2.position.set(7, 3, 7);
    this.scene.add(cornerLight2);

    // Materials — procedural Canvas textures (256×256 canvases)
    const floorTex = floorTileTexture();
    floorTex.repeat.set(5, 5);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.8,
      metalness: 0.2,
    });

    const wallTex = concreteWallTexture();
    wallTex.repeat.set(4, 1);
    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTex,
      roughness: 0.7,
      metalness: 0.1,
    });

    const ceilTex = ceilingPanelTexture();
    ceilTex.repeat.set(5, 5);
    const ceilingMat = new THREE.MeshStandardMaterial({
      map: ceilTex,
      roughness: 0.9,
      metalness: 0.0,
    });

    const crateMat = new THREE.MeshStandardMaterial({
      map: woodCrateTexture(),
      roughness: 0.7,
      metalness: 0.1,
    });

    const metalCrateMat = new THREE.MeshStandardMaterial({
      map: metalCrateTexture(),
      roughness: 0.3,
      metalness: 0.7,
    });

    const ROOM_W = 20;
    const ROOM_D = 20;
    const ROOM_H = 5;
    const WALL_T = 0.3;

    // Floor
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(ROOM_W, 0.2, ROOM_D),
      floorMat,
    );
    floor.position.set(0, -0.1, 0);
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.physics.createStaticCuboid(ROOM_W / 2, 0.1, ROOM_D / 2, 0, -0.1, 0);

    // Ceiling
    const ceiling = new THREE.Mesh(
      new THREE.BoxGeometry(ROOM_W, 0.2, ROOM_D),
      ceilingMat,
    );
    ceiling.position.set(0, ROOM_H + 0.1, 0);
    this.scene.add(ceiling);
    this.physics.createStaticCuboid(ROOM_W / 2, 0.1, ROOM_D / 2, 0, ROOM_H + 0.1, 0);

    // Walls: front, back, left, right
    const walls: [number, number, number, number, number, number][] = [
      [ROOM_W / 2, ROOM_H / 2, WALL_T / 2, 0, ROOM_H / 2, -ROOM_D / 2],
      [ROOM_W / 2, ROOM_H / 2, WALL_T / 2, 0, ROOM_H / 2, ROOM_D / 2],
      [WALL_T / 2, ROOM_H / 2, ROOM_D / 2, -ROOM_W / 2, ROOM_H / 2, 0],
      [WALL_T / 2, ROOM_H / 2, ROOM_D / 2, ROOM_W / 2, ROOM_H / 2, 0],
    ];

    for (const [hx, hy, hz, x, y, z] of walls) {
      const wallMesh = new THREE.Mesh(
        new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2),
        wallMat,
      );
      wallMesh.position.set(x, y, z);
      wallMesh.receiveShadow = true;
      this.scene.add(wallMesh);
      this.physics.createStaticCuboid(hx, hy, hz, x, y, z);
    }

    // Crates scattered around (destructible)
    const crateData: { w: number; h: number; d: number; x: number; y: number; z: number; mat: THREE.Material; type: 'crate' | 'crate_metal' }[] = [
      { w: 1.2, h: 1.2, d: 1.2, x: 4, y: 0.6, z: 3, mat: crateMat, type: 'crate' },
      { w: 1, h: 1, d: 1, x: 4.8, y: 0.5, z: 4.2, mat: crateMat, type: 'crate' },
      { w: 0.8, h: 0.8, d: 0.8, x: 3.5, y: 1.6, z: 3.3, mat: crateMat, type: 'crate' },
      { w: 1.5, h: 1, d: 1.5, x: -6, y: 0.5, z: -5, mat: metalCrateMat, type: 'crate_metal' },
      { w: 1, h: 0.8, d: 1, x: -5.5, y: 0.4, z: -3.5, mat: metalCrateMat, type: 'crate_metal' },
      { w: 2, h: 1.5, d: 0.8, x: -3, y: 0.75, z: 7, mat: crateMat, type: 'crate' },
      { w: 0.6, h: 2, d: 0.6, x: 7, y: 1, z: -7, mat: metalCrateMat, type: 'crate_metal' },
      { w: 0.6, h: 2, d: 0.6, x: -7, y: 1, z: -7, mat: metalCrateMat, type: 'crate_metal' },
    ];

    for (const c of crateData) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(c.w, c.h, c.d), c.mat);
      crate.position.set(c.x, c.y, c.z);
      crate.castShadow = true;
      crate.receiveShadow = true;
      this.scene.add(crate);
      const collider = this.physics.createStaticCuboid(c.w / 2, c.h / 2, c.d / 2, c.x, c.y, c.z);
      this.destructibleSystem.register(crate, collider, c.type, undefined, Math.max(c.w, c.h, c.d));
    }

    // Barrels (destructible + explosive)
    const barrelMat = new THREE.MeshStandardMaterial({
      map: barrelTexture(),
      roughness: 0.5,
      metalness: 0.3,
    });
    const barrelPositions = [
      [6, 0.6, -4],
      [6.8, 0.6, -3.5],
      [-2, 0.6, -8],
    ];
    for (const [bx, by, bz] of barrelPositions) {
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 1.2, 8),
        barrelMat.clone(), // clone so each barrel can flash independently
      );
      barrel.position.set(bx, by, bz);
      barrel.castShadow = true;
      barrel.receiveShadow = true;
      this.scene.add(barrel);
      const collider = this.physics.createStaticCuboid(0.4, 0.6, 0.4, bx, by, bz);
      this.destructibleSystem.register(barrel, collider, 'barrel', undefined, 0.8);
    }
  }

  /**
   * Check if an asset URL exists and returns binary/asset content (not HTML 404 page).
   * Prevents loaders from receiving HTML when Vite serves index.html for missing files.
   */
  private async checkAssetExists(url: string): Promise<boolean> {
    try {
      const res = await fetch(url);
      if (!res.ok) return false;
      const ct = res.headers.get('content-type') ?? '';
      return !ct.includes('text/html');
    } catch {
      return false;
    }
  }

  /**
   * Load custom GLB + HDRI for quickplay and build the scene.
   * Call before start() when customQuickplay is true.
   * On load failure, falls back to procedural buildTestScene.
   */
  async prepareCustomScene(): Promise<void> {
    if (!this.customQuickplay) return;

    this.customGroundLevel = null;
    this.customSpawnCenter = null;
    this.customTerrainRaycaster = null;
    this.customQuickplayPlacement = null;
    try {
      await this.buildCustomQuickplayScene();
    } catch (err) {
      console.warn('[Game] Custom quickplay load failed, falling back to procedural arena:', err);
      this.buildTestScene();
    }
    if (this.networkMode !== 'client' && !this.editorMode) {
      this.spawnTestEnemies();
    }
    this.spawnCustomArenaPickups();
    // In non-editor mode, clear terrain refs to avoid holding geometry. In editor mode keep them for placement raycasting.
    if (!this.editorMode) {
      this.customGroundLevel = null;
      this.customSpawnCenter = null;
      this.customTerrainRaycaster = null;
    }
  }

  private async buildCustomQuickplayScene(): Promise<void> {
    const baseUrl = '/maps/quickplay/';
    const config = await loadQuickplayConfig(baseUrl);
    this.customQuickplayPlacement = {
      pickups: this.editorMode ? (config.pickups ?? []) : config.pickups,
      props: this.editorMode ? (config.props ?? []) : config.props,
      labProps: this.editorMode ? (config.labProps ?? []) : config.labProps,
    };
    const glbUrl = `${baseUrl}${config.environment}`;
    const hdriUrl = `${baseUrl}${config.hdri}`;
    const skyboxUrl = `${baseUrl}${config.skybox}`;

    if (!(await this.checkAssetExists(glbUrl))) {
      throw new Error(
        `${config.environment} not found. Add your GLB to public/maps/quickplay/`,
      );
    }

    const envResult = await loadEnvironmentGLB(glbUrl, {
      skyDomeScale: config.skyDomeScale,
    });

    let envMap: THREE.Texture | null = null;
    let skyboxTexture: THREE.Texture | null = null;

    if (await this.checkAssetExists(hdriUrl)) {
      try {
        envMap = await loadHDRI(hdriUrl, this.renderer.instance);
      } catch {
        envMap = null;
      }
    }
    if (await this.checkAssetExists(skyboxUrl)) {
      try {
        skyboxTexture = await loadSkyboxImage(skyboxUrl);
      } catch {
        skyboxTexture = null;
      }
    }

    // Load day/night skybox pair for rotating skyboxes
    if (this.daySkyTexture) { this.daySkyTexture.dispose(); this.daySkyTexture = null; }
    if (this.nightSkyTexture) { this.nightSkyTexture.dispose(); this.nightSkyTexture = null; }
    if (config.daySkybox && config.nightSkybox) {
      const dayUrl = `${baseUrl}${config.daySkybox}`;
      const nightUrl = `${baseUrl}${config.nightSkybox}`;
      if (await this.checkAssetExists(dayUrl)) {
        try {
          this.daySkyTexture = await loadSkyboxImage(dayUrl);
          this.daySkyTexture.wrapS = THREE.RepeatWrapping;
          this.daySkyTexture.wrapT = THREE.ClampToEdgeWrapping;
        } catch {
          this.daySkyTexture = null;
        }
      }
      if (await this.checkAssetExists(nightUrl)) {
        try {
          this.nightSkyTexture = await loadSkyboxImage(nightUrl);
          this.nightSkyTexture.wrapS = THREE.RepeatWrapping;
          this.nightSkyTexture.wrapT = THREE.ClampToEdgeWrapping;
        } catch {
          this.nightSkyTexture = null;
        }
      }
    }
    if (!this.daySkyTexture || !this.nightSkyTexture) {
      this.daySkyTexture = null;
      this.nightSkyTexture = null;
    }
    this.skyboxRotationOffset = config.skyboxRotationOffset ?? 0;

    // Remove old sky sphere if any
    if (this.skySphere) {
      this.skySphere.geometry.dispose();
      (this.skySphere.material as THREE.Material).dispose();
      this.scene.remove(this.skySphere);
      this.skySphere = null;
    }

    this.scene.add(envResult.scene);

    // Push camera far plane out for large environments (avoids horizon clipping)
    this.fpsCamera.camera.far = 2000;
    this.fpsCamera.camera.updateProjectionMatrix();

    this.dayNightTime = GameSettings.getTimeOfDay();
    const useSkySphere = this.daySkyTexture && this.nightSkyTexture;
    const initialBackground = useSkySphere ? undefined : (skyboxTexture ?? undefined);
    if (envMap) {
      this.scene.fog = null;
      applyEnvironment(this.scene, envMap, {
        backgroundTexture: initialBackground,
      });
    } else if (initialBackground) {
      this.scene.fog = null;
      this.scene.background = initialBackground;
    }
    if (useSkySphere) {
      this.scene.background = new THREE.Color(0x000000);
      const geo = new THREE.SphereGeometry(1800, 32, 16);
      const tex = getSkyboxMode(this.dayNightTime) === 'day' ? this.daySkyTexture! : this.nightSkyTexture!;
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        side: THREE.BackSide,
        depthWrite: false,
      });
      this.skySphere = new THREE.Mesh(geo, mat);
      this.skySphere.renderOrder = -1000;
      this.skySphere.rotation.y = -(this.dayNightTime + this.skyboxRotationOffset) * Math.PI * 2;
      this.scene.add(this.skySphere);
    }

    // Day/night cycle sun + hemisphere (custom quickplay with sky)
    if (envMap || skyboxTexture || (this.daySkyTexture && this.nightSkyTexture)) {
      const sun = new THREE.DirectionalLight(0xffffff, 1);
      sun.castShadow = true;
      sun.shadow.mapSize.set(512, 512);
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 150;
      sun.shadow.camera.left = sun.shadow.camera.bottom = -40;
      sun.shadow.camera.right = sun.shadow.camera.top = 40;
      this.scene.add(sun);
      this.scene.add(sun.target);
      sun.target.position.set(0, 0, 0); // Light points at scene center
      this.dayNightSun = sun;

      const hemi = new THREE.HemisphereLight(0x87ceeb, 0x3d2817, 0.4);
      this.scene.add(hemi);
      this.dayNightHemi = hemi;

      const state = getSunState(this.dayNightTime);
      const intensityMult = GameSettings.getDayNightIntensity();
      sun.position.copy(state.position);
      sun.color.copy(state.color);
      sun.intensity = state.intensity * intensityMult;
      hemi.color.copy(state.hemiSkyColor);
      hemi.groundColor.copy(state.hemiGroundColor);
      hemi.intensity = state.ambientIntensity * intensityMult;
      if (this.scene.background && !(this.scene.background instanceof THREE.Texture)) {
        // backgroundIntensity only applies to texture backgrounds
      } else if (this.scene.background) {
        this.scene.backgroundIntensity = state.backgroundIntensity * intensityMult;
      }
      if (this.scene.environment) this.scene.environmentIntensity = state.envIntensity * intensityMult;
      if (this.skySphere && this.daySkyTexture && this.nightSkyTexture) {
        const mode = getSkyboxMode(this.dayNightTime);
        const tex = mode === 'day' ? this.daySkyTexture : this.nightSkyTexture;
        (this.skySphere.material as THREE.MeshBasicMaterial).map = tex;
        this.skySphere.rotation.y = -(this.dayNightTime + this.skyboxRotationOffset) * Math.PI * 2;
        this.skySphere.position.copy(this.fpsCamera.camera.getWorldPosition(this._skySpherePos));
      }
    } else {
      this.dayNightSun = null;
      this.dayNightHemi = null;
    }

    // Fallback lights when HDRI not used (and no day/night)
    if (!envMap) {
      const ambient = new THREE.AmbientLight(0x404060, 0.6);
      this.scene.add(ambient);
      const pointLight = new THREE.PointLight(0xffffee, 40, 35);
      pointLight.position.set(0, 4.5, 0);
      pointLight.castShadow = true;
      pointLight.shadow.mapSize.set(512, 512);
      this.scene.add(pointLight);
    }

    const bbox = new THREE.Box3().setFromObject(envResult.scene);
    const centerX = (bbox.min.x + bbox.max.x) / 2;
    const centerZ = (bbox.min.z + bbox.max.z) / 2;
    const groundLevel = (bbox.min.y + bbox.max.y) / 2;

    // Collect terrain meshes for Three.js raycasting (hits actual visible geometry)
    const terrainMeshes: THREE.Mesh[] = [];
    envResult.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.geometry) terrainMeshes.push(obj);
    });
    const raycaster = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const origin = new THREE.Vector3();
    this.customTerrainRaycaster =
      terrainMeshes.length > 0
        ? { raycaster, meshes: terrainMeshes, down, origin }
        : null;

    if (envResult.colliderData && envResult.colliderData.vertices.length > 0) {
      try {
        this.physics.createStaticTrimesh(
          envResult.colliderData.vertices,
          envResult.colliderData.indices,
        );
      } catch (e) {
        console.warn('[Game] Trimesh collider failed, using floor fallback only:', e);
      }
    }

    const rayOriginY = bbox.max.y + 5;
    const maxToi = bbox.max.y - bbox.min.y + 10;
    this.getGroundHeight = (x: number, z: number, exclude?: RAPIER.Collider) => {
      // Prefer Three.js Raycaster — hits actual mesh geometry (handles varied terrain)
      if (this.customTerrainRaycaster) {
        const { raycaster, meshes, down, origin } = this.customTerrainRaycaster;
        origin.set(x, rayOriginY, z);
        raycaster.set(origin, down);
        raycaster.far = maxToi;
        const hits = raycaster.intersectObjects(meshes, true);
        if (hits.length > 0 && hits[0].point.y <= rayOriginY) {
          return hits[0].point.y;
        }
      }
      // Fallback: Rapier physics raycast
      const hit = this.physics.castRay(
        x,
        rayOriginY,
        z,
        0,
        -1,
        0,
        maxToi,
        exclude,
      );
      if (hit) return hit.point.y;
      return groundLevel;
    };

    // Crates and barrels — raycast for per-position ground height
    const crateMat = new THREE.MeshStandardMaterial({
      map: woodCrateTexture(),
      roughness: 0.7,
      metalness: 0.1,
    });
    const metalCrateMat = new THREE.MeshStandardMaterial({
      map: metalCrateTexture(),
      roughness: 0.3,
      metalness: 0.7,
    });
    const barrelMat = new THREE.MeshStandardMaterial({
      map: barrelTexture(),
      roughness: 0.5,
      metalness: 0.3,
    });

    // Layout center = bbox center so props span the full terrain
    const layoutCenterX = centerX;
    const layoutCenterZ = centerZ;

    const propDefs = (this.editorMode ? config.props ?? [] : config.props) ?? [
      { type: 'crate' as const, x: 4, z: 3, size: [1.2, 1.2, 1.2], yOffset: 0.6 },
      { type: 'crate' as const, x: 4.8, z: 4.2, size: [1, 1, 1], yOffset: 0.5 },
      { type: 'crate' as const, x: 3.5, z: 3.3, size: [0.8, 0.8, 0.8], yOffset: 1.6 },
      { type: 'crate_metal' as const, x: -6, z: -5, size: [1.5, 1, 1.5], yOffset: 0.5 },
      { type: 'crate_metal' as const, x: -5.5, z: -3.5, size: [1, 0.8, 1], yOffset: 0.4 },
      { type: 'crate' as const, x: -3, z: 7, size: [2, 1.5, 0.8], yOffset: 0.75 },
      { type: 'crate_metal' as const, x: 7, z: -7, size: [0.6, 2, 0.6], yOffset: 1 },
      { type: 'crate_metal' as const, x: -7, z: -7, size: [0.6, 2, 0.6], yOffset: 1 },
      { type: 'barrel' as const, x: 6, z: -4, yOffset: 0.6 },
      { type: 'barrel' as const, x: 6.8, z: -3.5, yOffset: 0.6 },
      { type: 'barrel' as const, x: -2, z: -8, yOffset: 0.6 },
    ];

    for (const p of propDefs) {
      const px = layoutCenterX + p.x;
      const pz = layoutCenterZ + p.z;
      const yOff = p.yOffset ?? (p.type === 'barrel' ? 0.6 : 0.5);
      const py = (p as { y?: number }).y ?? this.getGroundHeight!(px, pz) + yOff;

      if (p.type === 'barrel') {
        const scale = p.scale ?? 1;
        const barrel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.4 * scale, 0.4 * scale, 1.2 * scale, 8),
          barrelMat.clone(),
        );
        barrel.position.set(px, py, pz);
        barrel.castShadow = true;
        barrel.receiveShadow = true;
        this.scene.add(barrel);
        const r = 0.4 * scale;
        const h = 0.6 * scale;
        const collider = this.physics.createStaticCuboid(r, h, r, px, py, pz);
        this.destructibleSystem.register(barrel, collider, 'barrel', undefined, 0.8 * scale);
      } else {
        const [w, h, d] = p.size ?? [1, 1, 1];
        const mat = p.type === 'crate_metal' ? metalCrateMat : crateMat;
        const crate = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        crate.position.set(px, py, pz);
        crate.castShadow = true;
        crate.receiveShadow = true;
        this.scene.add(crate);
        const collider = this.physics.createStaticCuboid(w / 2, h / 2, d / 2, px, py, pz);
        this.destructibleSystem.register(crate, collider, p.type, undefined, Math.max(w, h, d));
      }
    }

    // Lab props (tanks, tubes with glowing fluid)
    const labPropDefs = config.labProps;
    if (labPropDefs?.length && this.getGroundHeight) {
      const labPropsForBuilder = labPropDefs.map((p) => {
        const wx = layoutCenterX + p.x;
        const wz = layoutCenterZ + p.z;
        const wy = this.getGroundHeight!(wx, wz) + 0.02;
        return {
          type: p.type,
          x: wx,
          y: wy,
          z: wz,
          seed: p.seed,
          scale: p.scale,
          hueHint: p.hueHint,
        };
      });
      buildLabProps(labPropsForBuilder, this.scene, this.physics);
    }

    const DEFAULT_CUSTOM_SPAWN = {
      x: -1.3201937675476074,
      y: 14.632231712341309,
      z: 63.107688903808594,
    };
    let spawnX = DEFAULT_CUSTOM_SPAWN.x;
    let spawnY = DEFAULT_CUSTOM_SPAWN.y;
    let spawnZ = DEFAULT_CUSTOM_SPAWN.z;

    try {
      const saved = localStorage.getItem('007remix_custom_spawn');
      if (saved) {
        const parsed = JSON.parse(saved) as { x: number; y: number; z: number };
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number' && typeof parsed.z === 'number') {
          spawnX = parsed.x;
          spawnY = parsed.y;
          spawnZ = parsed.z;
          console.log('Custom quickplay spawn (saved):', { x: spawnX, y: spawnY, z: spawnZ });
        }
      } else {
        console.log('Custom quickplay spawn (default):', { x: spawnX, y: spawnY, z: spawnZ });
      }
    } catch (_) {}

    this.playerSpawnPosition = { x: spawnX, y: spawnY, z: spawnZ };
    this.player.setPosition(spawnX, spawnY, spawnZ);

    this.customGroundLevel = groundLevel;
    this.customSpawnCenter = { x: layoutCenterX, z: layoutCenterZ };

    if (this.editorMode && this.customQuickplayPlacement) {
      this.editorPickups = (this.customQuickplayPlacement.pickups ?? []).map((p) => ({
        type: p.type,
        x: p.x,
        z: p.z,
        amount: p.amount,
      }));
      this.editorProps = (this.customQuickplayPlacement.props ?? []).map((p) => {
        const rec = p as { y?: number };
        return {
          type: p.type,
          x: p.x,
          z: p.z,
          size: p.size,
          yOffset: p.yOffset,
          scale: p.scale,
          ...(rec.y != null && { y: rec.y }),
        };
      });
      this.editorLabProps = (this.customQuickplayPlacement.labProps ?? []).map((p) => ({
        type: p.type,
        x: p.x,
        z: p.z,
        seed: p.seed,
        scale: p.scale,
        hueHint: p.hueHint,
      }));
    }

    if (this.getGroundHeight) {
      this.enemyManager.setGroundHeight(
        (x, z, exclude) => this.getGroundHeight!(x, z, exclude),
      );
    }
  }

  private initEditorStateFromLevel(level: LevelSchema): void {
    this.editorPickups = (level.pickups ?? []).map((p) => ({
      type: p.type,
      x: p.x,
      y: p.y,
      z: p.z,
      amount: p.amount,
    }));
    this.editorProps = (level.props ?? []).map((p) => ({
      type: p.type,
      x: p.x,
      y: p.y,
      z: p.z,
      scale: p.scale,
    }));
  }

  /** Attach map editor UI and wire up placement/save. Call after start() when in editor mode. */
  attachMapEditorUI(mapId: 'crossfire' | 'wasteland' | 'custom'): void {
    const ui = new MapEditorUI();
    ui.setMapId(mapId);
    ui.attach(document.body);
    this.mapEditorUI = ui;
    ui.setCallbacks({
      onSave: () => this.saveEditorConfig(mapId),
      onExit: () => this.exitEditor(),
      onItemSelected: () => {},
      onDeleteSelected: () => {},
    });
    // Hide weapon hand; show editor hand mesh instead
    this.weaponManager.setViewModelVisible(false);
    this.rebuildEditorHandAndGhost();
  }

  // ── Editor hand mesh + ghost preview ────────────────────────────────────

  /** Build a small 3D mesh representing the given editor item for the in-hand preview. */
  private buildEditorHandMesh(category: 'pickup' | 'prop', type: string): THREE.Group {
    const group = new THREE.Group();
    group.renderOrder = 998;

    if (category === 'prop') {
      if (type === 'barrel') {
        const mat = new THREE.MeshStandardMaterial({ map: barrelTexture(), roughness: 0.5, metalness: 0.3 });
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.2, 8), mat);
        mesh.renderOrder = 998;
        group.add(mesh);
      } else if (type === 'crate_metal') {
        const mat = new THREE.MeshStandardMaterial({ map: metalCrateTexture(), roughness: 0.3, metalness: 0.7 });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
        mesh.renderOrder = 998;
        group.add(mesh);
      } else if (type === 'tank') {
        // Simple cylinder as tank stand-in
        const mat = new THREE.MeshStandardMaterial({ color: 0x557799, roughness: 0.4, metalness: 0.6 });
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.0, 12), mat);
        mesh.renderOrder = 998;
        group.add(mesh);
      } else if (type === 'tube') {
        const mat = new THREE.MeshStandardMaterial({ color: 0x558855, roughness: 0.4, metalness: 0.5, transparent: true, opacity: 0.8 });
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.2, 10), mat);
        mesh.renderOrder = 998;
        group.add(mesh);
      } else {
        // Default: wood crate
        const mat = new THREE.MeshStandardMaterial({ map: woodCrateTexture(), roughness: 0.7, metalness: 0.1 });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
        mesh.renderOrder = 998;
        group.add(mesh);
      }
      group.scale.setScalar(0.22);
    } else {
      // Pickup category
      if (type.startsWith('weapon-') && this.pickupSystem.weaponModelBuilder) {
        const weaponType = type.replace('weapon-', '');
        const mesh = this.pickupSystem.weaponModelBuilder(weaponType);
        group.add(mesh);
        group.scale.setScalar(0.85);
      } else if (type.startsWith('ammo-')) {
        // Reuse the actual ammo round geometry, scaled up for hand visibility
        const ammoMesh = buildAmmoMesh(type as any);
        group.add(ammoMesh);
        group.scale.setScalar(1.8);
      } else {
        // Health / armor — colored box placeholders (the actual meshes are billboard-style pickups)
        const colors: Record<string, number> = {
          health: 0xdd3333,
          armor: 0x4488dd,
        };
        const color = colors[type] ?? 0xaaaaaa;
        const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2 });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), mat);
        group.add(mesh);
      }
    }

    // Position in bottom-right of view, GoldenEye weapon style
    group.position.set(0.28, -0.25, -0.45);
    group.rotation.set(0.1, -0.3, 0.05);

    // Traverse all children and set renderOrder so hand renders on top of world geometry
    group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        (obj as THREE.Mesh).renderOrder = 998;
      }
    });

    return group;
  }

  /** Build a semi-transparent ghost mesh for the given editor item (world-space placement preview). */
  private buildEditorGhostMesh(category: 'pickup' | 'prop', type: string): THREE.Group {
    const ghostMat = new THREE.MeshBasicMaterial({
      color: 0x88ffaa,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    const group = new THREE.Group();

    if (category === 'prop') {
      let geo: THREE.BufferGeometry;
      if (type === 'barrel') {
        geo = new THREE.CylinderGeometry(0.4, 0.4, 1.2, 8);
      } else if (type === 'tank') {
        geo = new THREE.CylinderGeometry(0.3, 0.3, 1.0, 12);
      } else if (type === 'tube') {
        geo = new THREE.CylinderGeometry(0.2, 0.2, 1.2, 10);
      } else {
        geo = new THREE.BoxGeometry(1, 1, 1);
      }
      group.add(new THREE.Mesh(geo, ghostMat));
    } else {
      // All pickups get a small cube ghost
      group.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), ghostMat));
    }

    group.visible = false; // shown only when raycast hits
    this.scene.add(group);
    return group;
  }

  /** Remove and rebuild editor hand + ghost meshes for the currently selected item. */
  private rebuildEditorHandAndGhost(): void {
    // Remove old hand mesh from camera
    if (this.editorHandGroup) {
      this.fpsCamera.camera.remove(this.editorHandGroup);
      this.editorHandGroup = null;
    }
    // Remove old ghost mesh from scene
    if (this.editorGhostGroup) {
      this.scene.remove(this.editorGhostGroup);
      this.editorGhostGroup = null;
    }
    if (!this.mapEditorUI) return;
    const sel = this.mapEditorUI.getSelectedItem();
    if (!sel.type) return;

    this.editorHandGroup = this.buildEditorHandMesh(sel.category, sel.type);
    this.fpsCamera.camera.add(this.editorHandGroup);

    this.editorGhostGroup = this.buildEditorGhostMesh(sel.category, sel.type);
  }

  /** Called every editor frame to move ghost mesh to raycast hit point. */
  private updateEditorGhost(): void {
    const ghost = this.editorGhostGroup;
    if (!ghost) return;
    const hit = this.getEditorRaycastHit();
    if (!hit) { ghost.visible = false; return; }

    const sel = this.mapEditorUI?.getSelectedItem();
    const type = sel?.type ?? '';
    const isBarrel = type === 'barrel';
    const isCrate = !isBarrel && sel?.category === 'prop' && type !== 'tank' && type !== 'tube';

    // Offset along surface normal (same logic as placement)
    const offset = isBarrel
      ? (Math.abs(hit.normal.y) > 0.5 ? 0.6 : 0.4)
      : isCrate ? 0.5
      : 0.2; // pickups / lab props: small lift

    ghost.position.copy(hit.point).addScaledVector(hit.normal, offset);
    ghost.visible = true;
  }

  private getEditorRaycastHit(): { point: THREE.Vector3; normal: THREE.Vector3 } | null {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(0, 0);
    raycaster.setFromCamera(mouse, this.fpsCamera.camera);
    const isCustom = this.editorMapId === 'custom';
    const up = new THREE.Vector3(0, 1, 0);

    // Raycast against terrain + props so we can place on any face (stack/side-by-side)
    const targets: THREE.Object3D[] = [];
    if (isCustom && this.customTerrainRaycaster) {
      targets.push(...this.customTerrainRaycaster.meshes);
    }
    targets.push(...this.destructibleSystem.getPropMeshes());

    if (targets.length > 0) {
      const hits = raycaster.intersectObjects(targets, true);
      if (hits.length > 0) {
        const h = hits[0];
        const normal = h.face
          ? new THREE.Vector3().copy(h.face.normal).transformDirection(h.object.matrixWorld).normalize()
          : up.clone();
        return { point: h.point.clone(), normal };
      }
    }

    // Fallback: infinite floor plane (procedural maps or no geometry under crosshair)
    const floor = new THREE.Plane(up.clone(), 0);
    const hitPoint = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(floor, hitPoint)) {
      return { point: hitPoint, normal: up.clone() };
    }
    return null;
  }

  private placeEditorItemAt(hit: { point: THREE.Vector3; normal: THREE.Vector3 }): void {
    const ui = this.mapEditorUI;
    if (!ui) return;
    const sel = ui.getSelectedItem();
    const isCustom = this.editorMapId === 'custom';
    const c = this.customSpawnCenter;
    const pt = hit.point;

    if (sel.category === 'pickup') {
      const amount = sel.amount ?? 25;
      if (isCustom && c) {
        const x = pt.x - c.x;
        const z = pt.z - c.z;
        this.editorPickups.push({ type: sel.type, x, z, amount });
        const y = this.getGroundHeight ? this.getGroundHeight(pt.x, pt.z) : pt.y;
        this.pickupSystem.spawn(sel.type as any, pt.x, y, pt.z, amount);
      } else {
        this.editorPickups.push({ type: sel.type, x: pt.x, y: pt.y, z: pt.z, amount });
        this.pickupSystem.spawn(sel.type as any, pt.x, pt.y, pt.z, amount);
      }
    } else if (sel.category === 'prop') {
      if ((sel.type === 'tank' || sel.type === 'tube') && isCustom && c) {
        this.editorLabProps.push({
          type: sel.type as 'tank' | 'tube',
          x: pt.x - c.x,
          z: pt.z - c.z,
        });
        const wy = this.getGroundHeight ? this.getGroundHeight(pt.x, pt.z) + 0.02 : pt.y;
        buildLabProps([{ type: sel.type as 'tank' | 'tube', x: pt.x, y: wy, z: pt.z }], this.scene, this.physics);
      } else if (sel.type !== 'tank' && sel.type !== 'tube') {
        // Offset along face normal so the new prop sits flush (no merge) on any side
        const halfCrate = 0.5;
        const barrelRadius = 0.4;
        const barrelHalfHeight = 0.6;
        const offset =
          sel.type === 'barrel'
            ? Math.abs(hit.normal.y) > 0.5
              ? barrelHalfHeight
              : barrelRadius
            : halfCrate;
        const center = hit.point.clone().addScaledVector(hit.normal, offset);
        const px = center.x;
        const py = center.y;
        const pz = center.z;
        if (isCustom && c) {
          this.editorProps.push({
            type: sel.type,
            x: px - c.x,
            z: pz - c.z,
            size: [1, 1, 1],
            yOffset: offset,
            y: py,
          });
        } else {
          this.editorProps.push({ type: sel.type, x: px, y: py, z: pz });
        }
        const crateMat = new THREE.MeshStandardMaterial({
          map: woodCrateTexture(),
          roughness: 0.7,
          metalness: 0.1,
        });
        const metalCrateMat = new THREE.MeshStandardMaterial({
          map: metalCrateTexture(),
          roughness: 0.3,
          metalness: 0.7,
        });
        const barrelMat = new THREE.MeshStandardMaterial({
          map: barrelTexture(),
          roughness: 0.5,
          metalness: 0.3,
        });
        if (sel.type === 'barrel') {
          const mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.4, 0.4, 1.2, 8),
            barrelMat,
          );
          mesh.position.set(px, py, pz);
          this.scene.add(mesh);
          const collider = this.physics.createStaticCuboid(0.4, 0.6, 0.4, px, py, pz);
          this.destructibleSystem.register(mesh, collider, 'barrel');
        } else {
          const mat = sel.type === 'crate_metal' ? metalCrateMat : crateMat;
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
          mesh.position.set(px, py, pz);
          this.scene.add(mesh);
          const collider = this.physics.createStaticCuboid(0.5, 0.5, 0.5, px, py, pz);
          this.destructibleSystem.register(mesh, collider, sel.type as 'crate' | 'crate_metal');
        }
      }
    }
  }

  private deleteEditorItemAtCursor(): void {
    const hit = this.getEditorRaycastHit();
    if (!hit) return;
    const pos = hit.point;
    const maxDist = 2;
    const removedPickupIdx = this.pickupSystem.removeNear(pos, maxDist);
    if (removedPickupIdx >= 0) {
      this.removeEditorPickupNear(pos, maxDist);
      this.mapEditorUI?.setStatus('Pickup removed');
      return;
    }
    const prop = this.destructibleSystem.removePropNear(pos, maxDist);
    if (prop) {
      this.removeEditorPropNear(pos, maxDist);
      this.mapEditorUI?.setStatus('Prop removed');
    }
  }

  private removeEditorPickupNear(pos: THREE.Vector3, maxDist: number): void {
    const isCustom = this.editorMapId === 'custom' && this.customSpawnCenter;
    // Use nearest-match (same algorithm as pickupSystem.removeNear) so we always
    // remove the same entry that was visually deleted, even when items are close.
    let bestIdx = -1;
    let bestDist = maxDist;
    for (let i = 0; i < this.editorPickups.length; i++) {
      const p = this.editorPickups[i];
      let wx: number, wz: number, wy: number;
      if (isCustom && this.customSpawnCenter) {
        wx = this.customSpawnCenter.x + p.x;
        wz = this.customSpawnCenter.z + (p.z ?? 0);
        wy = this.getGroundHeight?.(wx, wz) ?? 0;
      } else {
        wx = p.x;
        wz = (p as { z: number }).z;
        wy = p.y ?? 0;
      }
      const d = new THREE.Vector3(wx, wy, wz).distanceTo(pos);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    if (bestIdx >= 0) this.editorPickups.splice(bestIdx, 1);
  }

  private removeEditorPropNear(pos: THREE.Vector3, maxDist: number): void {
    const isCustom = this.editorMapId === 'custom' && this.customSpawnCenter;
    // Use nearest-match (same algorithm as destructibleSystem.removePropNear) so we
    // always remove the matching entry, even when props are close together.
    let bestIdx = -1;
    let bestDist = maxDist;
    for (let i = 0; i < this.editorProps.length; i++) {
      const p = this.editorProps[i];
      let wx: number, wz: number, wy: number;
      if (isCustom && this.customSpawnCenter) {
        wx = this.customSpawnCenter.x + p.x;
        wz = this.customSpawnCenter.z + (p.z ?? 0);
        wy = (p as { y?: number }).y ?? (this.getGroundHeight?.(wx, wz) ?? 0) + (p.yOffset ?? 0.5);
      } else {
        wx = p.x;
        wz = (p as { z: number }).z;
        wy = (p.y ?? 0) + 0.5;
      }
      const d = new THREE.Vector3(wx, wy, wz).distanceTo(pos);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    if (bestIdx >= 0) this.editorProps.splice(bestIdx, 1);
  }

  private static roundForConfig(n: number, decimals = 5): number {
    const f = 10 ** decimals;
    return Math.round(n * f) / f;
  }

  private async saveEditorConfig(mapId: string): Promise<void> {
    const apiUrl = `${NetworkConfig.SERVER_URL}/api/maps/${mapId}/config`;
    const isCustom = mapId === 'custom';
    const r = Game.roundForConfig;
    const c = this.customSpawnCenter;
    const payload: Record<string, unknown> = {};
    if (isCustom) {
      payload.pickups = this.editorPickups.map((p) => ({
        type: p.type,
        x: r(p.x),
        z: r(p.z ?? 0),
        amount: p.amount ?? 0,
      }));
      payload.props = this.editorProps.map((p) => {
        const rec = p as { y?: number };
        const wx = c ? c.x + p.x : p.x;
        const wz = c ? c.z + (p.z ?? 0) : (p.z ?? 0);
        const yOff = p.yOffset ?? 0.5;
        const y = rec.y != null ? rec.y : (this.getGroundHeight?.(wx, wz) ?? 0) + yOff;
        return {
          type: p.type,
          x: r(p.x),
          z: r(p.z ?? 0),
          size: p.size ?? [1, 1, 1],
          yOffset: yOff,
          y: r(y),
        };
      });
      payload.labProps = (this.editorLabProps ?? []).map((lab) => ({
        type: lab.type,
        x: r(lab.x),
        z: r(lab.z),
      }));
    } else {
      payload.pickups = this.editorPickups.map((p) => {
        const rec = p as { x: number; y?: number; z: number };
        return {
          type: p.type,
          x: r(rec.x),
          y: r(rec.y ?? 0),
          z: r(rec.z),
          amount: p.amount ?? 0,
        };
      });
      payload.props = this.editorProps.map((p) => {
        const rec = p as { x: number; y?: number; z: number };
        return {
          type: p.type,
          x: r(rec.x),
          y: r(rec.y ?? 0),
          z: r(rec.z),
          scale: p.scale ?? 1,
        };
      });
    }
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        this.mapEditorUI?.setStatus('Saved successfully');
      } else {
        this.mapEditorUI?.setStatus(`Save failed: ${data.error ?? 'Unknown error'}`);
      }
    } catch (err) {
      this.mapEditorUI?.setStatus(`Save failed: ${(err as Error).message}. Is the server running?`);
    }
  }

  private exitEditor(): void {
    // Clean up editor hand + ghost meshes
    if (this.editorHandGroup) {
      this.fpsCamera.camera.remove(this.editorHandGroup);
      this.editorHandGroup = null;
    }
    if (this.editorGhostGroup) {
      this.scene.remove(this.editorGhostGroup);
      this.editorGhostGroup = null;
    }
    this.weaponManager.setViewModelVisible(true);
    this.mapEditorUI?.detach();
    this.mapEditorUI = null;
    window.location.reload();
  }
}
