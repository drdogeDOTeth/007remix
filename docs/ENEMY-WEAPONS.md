# Enemy Weapons System

Reference for enemy weapon configuration, visual setup, and multiplayer integration.

## Overview

Enemies use the **same weapons** as the player—both stats and 3D meshes. Weapon types: `pistol`, `rifle`, `shotgun`, `sniper`. Stats come from player definitions; meshes come from the shared `weapon-mesh-factory` (same geometry as player view model and ground pickups).

### What Was Done

- **Weapon stats:** Enemies use `ENEMY_WEAPON_STATS` from player weapon classes (damage, fire rate, spread, range, rays per shot).
- **Weapon meshes:** Created `weapon-mesh-factory.ts` — single source for PP7, KF7, Shotgun, Sniper geometry. Player view model, pickups, and enemies all use it.
- **Procedural guards:** Weapon attached at right elbow; mesh added directly with no extra transform.
- **Custom VRM/GLB models:** Weapon attached to right-hand bone via `createEnemyWeaponMesh()`. Position and rotation tuned so grip sits in palm.
- **Level / quick-play:** `weapon` field in level JSON and `spawnTestEnemies()` for variety.
- **Attack animations:** `attackpistol.json` for pistol, `attackrifle.json` for rifle/shotgun/sniper (custom VRM/GLB models only).

---

## Weapon Types

| Type    | Player Class | Damage | Fire Rate | Range | Rays/Shot |
|---------|--------------|--------|-----------|-------|-----------|
| pistol  | Pistol (PP7) | 25     | 3/s       | 60    | 1         |
| rifle   | Rifle (KF7)  | 25     | 8/s       | 50    | 1         |
| shotgun | Shotgun      | 12×8   | 1.2/s     | 20    | 8         |
| sniper  | Sniper       | 80     | 0.8/s     | 150   | 1         |

*Stats live in `src/weapons/weapons/*.ts`. Enemy stats come from `src/weapons/weapon-stats-map.ts` (instantiates each weapon once to read stats).*

## Level Configuration

In level JSON (`public/levels/*.json`), each enemy can have a `weapon` field:

```json
{
  "enemies": [
    {"x": 4, "y": -2, "z": 4, "facingAngle": 0.5, "weapon": "pistol"},
    {"x": 12, "y": -2, "z": 20, "facingAngle": -0.5, "variant": "soldier", "weapon": "rifle"}
  ]
}
```

- **Default:** `"weapon": "pistol"` if omitted
- **Valid values:** `"pistol"`, `"rifle"`, `"shotgun"`, `"sniper"`

## Code Flow

1. **Schema:** `EnemySpawnDef.weapon?: EnemyWeaponType` — `src/levels/level-schema.ts`
2. **Spawn:** `EnemyManager.spawnEnemy()` receives `weapon` from level builder
3. **Enemy:** `EnemyBase` stores `weaponType` and `weaponStats` (from `getEnemyWeaponStats()`)
4. **Fire:** `EnemyManager.enemyFireAtPlayer()` uses `enemy.weaponStats` for damage, rays, spread, range
5. **Visuals:** See "Weapon Mesh & Attachment" below
6. **Audio:** `playGunshotWeapon(enemy.weaponType)` plays weapon-specific sound

---

## Weapon Mesh & Attachment

Enemies use the **same 3D meshes** as the player (PP7, KF7 Soviet, Shotgun, Sniper Rifle). Meshes are built by `weapon-mesh-factory.ts` and shared across:
- Player first-person view model
- Ground pickups
- Enemy hands (both procedural and custom models)

### Two Enemy Rendering Paths

| Path | When Used | Weapon Attachment |
|------|-----------|-------------------|
| **Procedural guards** | 3D model mode, no custom GLB/VRM loaded | `createGuardModel()` — weapon added to `weaponAttach` group at right elbow |
| **Custom models (VRM/GLB)** | 3D model mode, custom character loaded | `createEnemyWeaponMesh()` — weapon attached to right-hand bone |

### Procedural Guards (Low-Poly)

- **Location:** `guard-model-factory.ts` → `createGuardModel(variant, weaponType)`
- **Attach point:** `weaponAttach` group at `(0, -0.18, -0.08)` relative to right elbow
- **Mesh:** `buildWeaponMesh(weaponType, 'default')` — no extra position/rotation (fits arm layout)

### Custom Models (VRM/GLB)

- **Location:** `guard-model-factory.ts` → `createEnemyWeaponMesh(weaponType)`, used by `EnemyCustomModel`
- **Attach bone:** Right hand — `humanoid.getRawBoneNode('rightHand')`, fallback `rightLowerArm`, or common names (`RightHand`, `mixamorigRightHand`, etc.)
- **Position (hand local space):** `(0.1, -0.025, -0.08)`
- **Rotation:** `(Math.PI, Math.PI + 85°, -Math.PI/2)` — tuned so grip sits in palm, barrel points forward

**Tuning notes for custom models:**
- Original mesh was upside down → 180° X flip (`Math.PI`)
- Grip not in palm → 180° Y + ~85° forward tilt
- Position adjusted for palm fit: X 0.1, Y -0.025, Z -0.08
- If a new custom model’s hand differs, adjust `createEnemyWeaponMesh()` position/rotation

### Attack Animations (Custom Models)

Pose JSON in `public/animations/`: `attackpistol.json` (pistol) and `attackrifle.json` (rifle/shotgun/sniper). Loaded by `animation-loader.ts` during preload; `EnemyCustomModel` picks the clip by `weaponType`. Procedural guards use pose-library keyframes.

---

## Key Files

| File | Purpose |
|------|---------|
| `src/weapons/weapon-mesh-factory.ts` | `buildWeaponMesh()` — shared mesh for player, pickups, enemies |
| `src/weapons/weapon-stats-map.ts` | `ENEMY_WEAPON_STATS`, `getEnemyWeaponStats()` — enemy combat stats |
| `src/weapons/weapons/{pistol,rifle,shotgun,sniper}.ts` | Player weapon definitions (enemy stats mirror these) |
| `src/enemies/enemy-base.ts` | `weaponType`, `weaponStats`, `canFire()` |
| `src/enemies/enemy-manager.ts` | `enemyFireAtPlayer()` — multi-ray for shotgun |
| `src/enemies/model/guard-model-factory.ts` | `createGuardModel()`, `createEnemyWeaponMesh()` — weapon attachment |
| `src/enemies/model/enemy-custom-model.ts` | Finds right-hand bone, attaches weapon, picks shoot_pistol/shoot_rifle by weaponType |
| `src/core/animation-loader.ts` | Loads attackpistol.json, attackrifle.json as pose clips for VRM |
| `src/levels/level-schema.ts` | `EnemySpawnDef.weapon` |

---

## Multiplayer: Future Integration

When adding AI enemies to multiplayer:

1. **Spawn sync:** Server spawns enemies from level data (`weapon` field). Broadcast `EnemySpawnedEvent` with `{ id, x, y, z, facingAngle, variant, weapon }`.

2. **Fire validation:** Server validates enemy hits:
   - Use same damage/fire-rate/range as client (`ENEMY_WEAPON_STATS` or server copy)
   - Shotgun: validate up to 8 rays, each `stats.damage` (12)
   - Sniper: single ray, `stats.damage` (80)

3. **State sync:** Remote clients render enemies with correct weapon model (`weaponType` in spawn payload). No per-shot network for enemies — server computes hit and broadcasts damage.

4. **Weapon consistency:** Ensure `server/game-room.ts` (or future enemy validation) uses the same weapon stats. Consider importing `getEnemyWeaponStats` or a shared constants module.

5. **Networking events:** Define `EnemySpawnedEvent`, `EnemyDamageEvent`, `EnemyKilledEvent` in `src/network/network-events.ts` when implementing.
