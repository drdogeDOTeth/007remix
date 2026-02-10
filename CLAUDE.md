# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Development server**: `npm run dev` (starts Vite dev server on http://localhost:5173)
- **Build**: `npm run build` (TypeScript compilation + production build)
- **Preview build**: `npm run preview` (preview production build locally)

## Project Overview

007 Remix is a browser-based first-person shooter inspired by GoldenEye 007, built with Three.js for 3D rendering and Rapier3D for physics simulation. It features both a quick-play mode (single-room test arena) and mission mode (multi-room facilities with objectives).

## Core Architecture

### Entry Point & Initialization

- **Entry**: `src/main.ts` → patches Three.js Object3D properties (fixes browser extension conflicts) → initializes physics → creates Game instance
- **Game class**: `src/game.ts` orchestrates all systems (rendering, physics, input, enemies, weapons, UI)
- Game runs a fixed-step physics loop (60Hz) with variable-rate rendering

### Physics System (Rapier WASM)

- **Critical**: `src/core/physics-world.ts` wraps Rapier3D-compat
- **Collider comparison**: NEVER use `===` on Rapier colliders (WASM wrappers recreate objects). Use `collider.handle === other.handle` for identity checks
- Character controller: kinematic capsule for player with auto-step and snap-to-ground
- Enemies: kinematic bodies (AI-controlled movement)
- Static geometry: fixed rigid bodies (walls, floors, crates)

### Player System

- **Controller**: `src/player/player-controller.ts` — handles WASD movement, jumping, sprinting, crouching
- **Camera**: `src/player/fps-camera.ts` — mouse-look FPS camera with smooth crouch transitions
- Crouch: resizes capsule collider, lowers camera, reduces movement speed
- Health/armor system with damage absorption (armor absorbs 60%)

### Weapon System

- **Base**: `src/weapons/weapon-base.ts` — defines stats (damage, fire rate, spread, range, ammo)
- **Manager**: `src/weapons/weapon-manager.ts` — handles weapon switching, ammo, reloading, view model bobbing
- **Projectile**: `src/weapons/projectile-system.ts` — hitscan raycasting with bullet hole decals and impact particles
- **Grenade**: `src/weapons/grenade-system.ts` — throwable gas/frag grenades with arc physics
- Weapons: pistol, rifle, shotgun, sniper (each with unique stats and procedural textures)
- View models: 3D mesh rendered in second camera layer (viewModel.layers.set(1)) to avoid clipping
- Skins: customizable weapon skins with procedural textures (Canvas2D → CanvasTexture)

### Enemy System

- **Base**: `src/enemies/enemy-base.ts` — health, facing, damage, fire rate
- **Manager**: `src/enemies/enemy-manager.ts` — spawns enemies, handles updates, hit detection
- **AI**: `src/enemies/ai/state-machine.ts` + states (idle, patrol, alert, attack)
- **Perception**: `src/enemies/ai/perception.ts` — line-of-sight checks, noise detection (gunshots, movement)
- **Sprite**: `src/enemies/sprite/enemy-sprite.ts` — billboard sprites with sprite sheet animation (idle, walk, attack, death)
- Billboard rendering: sprite always faces camera (no Y-axis rotation on mesh group)
- AI facing: `facingAngle` field (radians) used for perception/AI logic, NOT visual rotation

### Level System

- **Schema**: `src/levels/level-schema.ts` — TypeScript types for JSON level format
- **Loader**: `src/levels/level-loader.ts` — fetches JSON from `/public/levels/`
- **Builder**: `src/levels/level-builder.ts` — constructs 3D geometry from schema (rooms, doors, props, enemies, pickups)
- **Systems**:
  - `door-system.ts`: proximity and locked doors (key-card based)
  - `trigger-system.ts`: zone-based event triggers (objective completion, door unlocks)
  - `objective-system.ts`: mission objectives tracking
  - `pickup-system.ts`: health, armor, ammo, weapons, keys (with hover animation)
- Levels stored in: `public/levels/facility.json`

### Procedural Textures

- **Pattern**: `src/levels/procedural-textures.ts` — Canvas 2D → THREE.CanvasTexture → cached in module-level Map
- Textures: concrete walls, floor tiles, ceiling panels, wood crates, metal crates, barrels, weapon skins
- Settings: NearestFilter (pixel-art look), RepeatWrapping (tiling), clone for independent UV offsets
- All textures generated at runtime (no image assets)

### UI System

- `src/ui/hud.ts`: health, armor, ammo, crosshair, grenade count, pickup notifications
- `src/ui/scope-overlay.ts`: sniper scope overlay (black bars + center reticle)
- `src/ui/damage-indicator.ts`: red flash when player takes damage
- `src/ui/briefing-screen.ts`: mission briefing before level start
- `src/ui/objectives-display.ts`: live objective tracker (top-left)
- `src/ui/inventory-screen.ts`: Tab to open, shows weapons/keys, weapon skin customization with 3D preview

### Audio

- `src/audio/sound-effects.ts`: procedural AudioContext-based sounds (gunshots, reloads, footsteps, explosions)
- No external audio files — all sounds generated at runtime

## Key Technical Patterns

### Performance Optimizations

- Reusable vectors: avoid per-frame `new THREE.Vector3()` allocations (use class fields)
- Object pooling: PointLights (muzzle flash), particles (impact effects)
- Batched updates: all particles updated in single `projectileSystem.update(dt)` (no per-particle rAF loops)
- Shadow maps: 512×512, PCFShadowMap
- MeshBasicMaterial for non-lit objects (pickups, sprites, UI elements)

### Three.js Browser Extension Fix

- `src/main.ts` patches `Object.defineProperties` to add `writable: true` to position/rotation/quaternion/scale
- Fixes conflict with React DevTools and similar extensions that use `Object.assign`

### Game Loop Architecture

- Fixed-step physics (60Hz): accumulator pattern ensures deterministic physics regardless of frame rate
- Variable-rate rendering: Three.js renders at browser's refresh rate
- Input handling: key press state tracked per-frame, mouse deltas reset after each frame

## File Organization

```
src/
├── main.ts              # Entry point, Three.js patch, game initialization
├── game.ts              # Main Game class, orchestrates all systems
├── types.ts             # Shared TypeScript types
├── core/                # Core engine systems
│   ├── physics-world.ts # Rapier3D wrapper
│   ├── renderer.ts      # Three.js WebGL renderer setup
│   ├── game-loop.ts     # Fixed-step game loop
│   ├── input-manager.ts # Keyboard/mouse input
│   └── event-bus.ts     # Pub/sub event system
├── player/              # Player controller + FPS camera
├── weapons/             # Weapon system, projectiles, grenades
├── enemies/             # Enemy AI, sprite rendering, state machine
├── levels/              # Level loading, building, systems (doors, triggers, objectives)
├── ui/                  # HUD, overlays, menus
└── audio/               # Procedural sound effects

public/
└── levels/              # JSON level definitions (facility.json)
```

## Common Tasks

### Adding a New Weapon

1. Create weapon class in `src/weapons/weapons/` extending `WeaponBase`
2. Define stats: damage, fireRate, maxAmmo, spread, range, automatic, raysPerShot
3. Add texture generator in `src/weapons/weapon-textures.ts`
4. Register in `WeaponManager` constructor

### Adding a New Enemy Type

1. Create variant in `src/enemies/sprite/guard-sprite-sheet.ts`
2. Update sprite sheet generator with new animation frames
3. Spawn with `enemyManager.spawnEnemy({ x, y, z, facingAngle })`

### Creating a New Level

1. Create JSON file in `public/levels/` following `LevelSchema` format
2. Define rooms (axis-aligned boxes), doors (proximity or locked), enemies, pickups, objectives, triggers
3. Load via `loadLevel('/levels/your-level.json')` in `main.ts`

### Debugging Physics

- Rapier debug render: uncomment lines in `physics-world.ts` to visualize colliders
- Collider comparison: always use `collider.handle === other.handle`, never `===`
- Check `castRay` exclude filter when raycasting (excludeCollider parameter)

## Important Constraints

- **Rapier collider comparison**: Use handle comparison only
- **Procedural textures**: Cache in module-level Map to avoid recreating on every call
- **Billboard sprites**: Never set Y-rotation on enemy group mesh (billboard handles facing)
- **Weapon fire timing**: Use `performance.now()` for precise fire rate timing (not `dt` accumulation)
- **Fixed-step physics**: Always update physics in while-loop with PHYSICS_STEP constant (1/60)
