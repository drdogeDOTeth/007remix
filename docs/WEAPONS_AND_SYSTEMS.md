# Weapons & Systems Reference

This document covers all weapons, visual systems, and key architecture decisions added during the 007 Remix weapons overhaul.

---

## Weapon Roster

| Key | Weapon | Type | Damage | Fire Rate | Ammo | Range |
|-----|--------|------|--------|-----------|------|-------|
| 1 | PP7 Pistol | Semi-auto hitscan | 28 | 3 rps | 7 / 42 | 80m |
| 2 | KF7 Soviet (Rifle) | Full-auto hitscan | 22 | 7 rps | 30 / 90 | 120m |
| 3 | Shotgun | Pump, 8 pellets | 12×8 | 1 rps | 6 / 18 | 40m |
| 4 | Sniper Rifle | Semi-auto hitscan | 85 (instakill HS) | 0.5 rps | 5 / 20 | 300m |
| 5 | M134 Minigun | Full-auto, spin-up | 18 | 20 rps | 200 / 200 | 100m |
| 6 | RPG-7 | Explosive projectile | 120 + splash | 0.5 rps | 1 / 4 | — |
| 7 | M79 Grenade Launcher | Explosive projectile | 75 + splash | 0.8 rps | 6 / 12 | — |

### Rifle UGL (Underbarrel)
- Right-click while holding Rifle fires an underbarrel grenade launcher round
- Same stats as M79 (75 damage + 4m splash), 2-second cooldown
- Does not consume rifle ammo

---

## Weapon Skins

| Skin | ID | Description |
|------|----|-------------|
| Default | `default` | Dark gunmetal + warm walnut wood |
| Gilded Gold | `gilded` | Gold-tinted metal + amber wood |
| Orange Tiger | `tiger` | Orange base with black tiger stripes |
| Red White Blue | `flag` | Patriotic tri-color stripe pattern |
| Battle Worn | `battleworn` | Worn dark metal with scratches + aged wood |
| Electric Plasma | `plasma` | Dark base with animated blue/purple energy veins |

Skins are applied per-weapon and persist in the inventory screen. The `plasma` skin uses a custom `ShaderMaterial` with animated time-based emissive flow.

---

## Projectile Weapons (RPG + Grenade Launcher)

Unlike hitscan weapons, the RPG and M79 use real physics projectiles:

### Architecture
- `GrenadeSystem.fireProjectile(origin, direction, type)` spawns a physics projectile
- Manual Euler integration per frame: gravity + velocity → position
- Forward `castRay` detects wall/enemy hits; downward check detects ground
- On impact: `spawnExplosion()` plays explosion sprite + radius damage via `onExplosion` callback

### Projectile Config
| Weapon | Speed | Gravity Scale | Splash Radius |
|--------|-------|--------------|--------------|
| RPG-7 | 45 m/s | 0.3 (rocket fights gravity) | 5m |
| M79 GL | 28 m/s | 1.0 (full arc drop) | 4m |

### Spawn Origin
Projectiles spawn 1.5m forward of the camera to clear the view model and nearby geometry.

---

## Minigun

The M134 Minigun has a barrel spin-up mechanic:

- **Hold mouse** to spin barrels up (visual + audio whine)
- **Fires only above 60% max spin speed** (~15 rad/s of 25 max)
- Spin speed: accel 40 rad/s², decel 20 rad/s²
- Per-shot recoil is light (0.25) since it fires 20 rounds/second
- `barrelCluster` object in the weapon mesh rotates on Z axis (`rotation.z = barrelSpinAngle`)

---

## Bullet Tracer System

File: `src/weapons/tracer-system.ts`

Tracers are moving glowing streak quads rendered with a custom GLSL shader.

### Architecture
- Pool of 48 `TracerSlot`s — each is a single `ShaderMaterial` quad mesh
- **Phase 1 (travel)**: Head moves from barrel tip to target at weapon-specific speed (m/s)
- **Phase 2 (fade)**: After reaching target, fades out over `fadeMs` milliseconds
- Billboard side vector computed each frame: `dir × toCam`, with fallback to `worldUp` then `worldRight`

### GLSL Shader
- UV.x = 0 (tail) → 1 (head) along streak axis
- UV.y = 0/1 (edges) → 0.5 (centre) across width
- Radial soft glow: `smoothstep` squared falloff across width
- Tight core region: brighter inner beam at `uCoreFrac` fraction of half-width
- Tail taper: `smoothstep(0, 0.12, UV.x)` fades tail cleanly
- `AdditiveBlending` so tracers illuminate dark areas

### Per-Weapon Config (`WEAPON_TRACER_CONFIG`)
Each weapon has: `length`, `speed`, `coreColor`, `glowColor`, `coreOpacity`, `coreWidth`, `glowWidth`, `fadeMs`

### Tracer Origin
The tracer origin is the **barrel tip** (muzzle world position), not the camera eye.
- `WeaponViewModel.getMuzzleWorldPosition(target)` reads `muzzleFlash.getWorldPosition(target)`
- `doFire()` calls `viewModel.group.updateWorldMatrix(true, true)` before reading, so it's accurate even when stationary

---

## Post-Processing (Bloom)

File: `src/core/renderer.ts`

`UnrealBloomPass` via `EffectComposer`:

| Param | Value | Notes |
|-------|-------|-------|
| strength | 0.15 | Very subtle — soft halo only on tracers/muzzle flash |
| radius | 0.35 | Tight spread, stays close to source |
| threshold | 0.85 | Only the very brightest additive pixels bloom |

Pipeline: `RenderPass` → `UnrealBloomPass` → `OutputPass`

To adjust: raise `threshold` toward 0.95 to reduce what blooms; raise `strength` for more visible glow; lower `strength` toward 0.0 to disable bloom entirely.

Bloom is wired in `game.ts` after camera init: `renderer.setupBloom(scene, fpsCamera.camera)`.

---

## Day/Night Cycle

File: `src/core/day-night-cycle.ts`

Uses proper solar azimuth/elevation math (latitude 35°N, declination -18°).

### Key Time Phases
| Phase | Hours | Behavior |
|-------|-------|----------|
| Night | 0–5, 19–24 | Moon ambient, no sun |
| Dawn | 5–6 | Warm sun rises, hemi transitions |
| Day | 6–18 | Sun arc east→south→west |
| Dusk | 18–19 | Warm colors, sun sets |

### Night Ambient Ramp
Night is not pitch black — ambient smoothly increases as the sun goes deeper below the horizon:
- `nightRamp = clamp(|sunHeight| × 1.8, 0, 1)`
- `ambientIntensity`: 0.10 → 0.28 at midnight
- `backgroundIntensity`: 0.35 → 0.55 at midnight
- `envIntensity`: 0.40 → 0.60 at midnight

---

## Weapon PBR & Roughness

Files: `src/weapons/weapon-textures.ts`, `src/weapons/weapon-mesh-factory.ts`

### Roughness Map Ranges (0–255 → 0.0–1.0)
| Role | Base Range | Approx Roughness | Notes |
|------|-----------|-----------------|-------|
| Metal (dark gunmetal) | 115–175 | 0.45–0.69 | Matte military finish |
| Metal worn | 155–215 | 0.61–0.84 | Battle-worn, more textured |
| Wood (grain) | 155–210 | 0.61–0.82 | Semi-matte oiled wood |

### `baseRoughness` Fallbacks (skins without PBR maps — gilded/tiger/flag/plasma)
| Part | Value |
|------|-------|
| All metal parts | 0.55 |
| Scope tube | 0.50 |
| Wood stock | 0.72 |
| Grip (rubber) | 0.85 |

### Weapon Normal Maps
All texture roles have normal maps derived via Sobel edge detection (same algorithm as level surfaces in `procedural-textures.ts`):

| Role | Generator | Strength | normalScale |
|------|-----------|----------|------------|
| metal | `weaponNormalMapMetal()` | 1.8 | 0.9 |
| metalMid | `weaponNormalMapMetalMid()` | 1.6 | 0.9 |
| scope | `weaponNormalMapScope()` | 1.4 | 0.9 |
| grip | `weaponNormalMapGrip()` | 2.0 | 1.0 |
| wood (light) | `weaponNormalMapWoodLight()` | 1.4 | 0.75 |
| wood (mid) | `weaponNormalMapWoodMid()` | 1.4 | 0.75 |
| wood (dark) | `weaponNormalMapWoodDark()` | 1.5 | 0.75 |

Normal maps are active for `default` and `battleworn` skins. `SkinTextureSet` includes an optional `normalMap` field populated by `getTextureSetForSkin()`.

---

## Server Validation (Anti-Cheat)

File: `server/game-room.ts`

| Weapon | Damage | Range | Fire Interval |
|--------|--------|-------|--------------|
| PP7 / Pistol | 28 | 80 | 333ms |
| KF7 / Rifle | 22 | 120 | 143ms |
| Shotgun | 12 | 40 | 1000ms |
| Sniper Rifle | 85 | 300 | 2000ms |
| Minigun | 18 | 100 | 50ms |
| RPG-7 | 120 | 200 | 2000ms |
| M79 GL | 75 | 250 | 1250ms |

Headshots: 2× multiplier (instakill for sniper/shotgun) when hit Y > capsule center + 0.5m.

---

## Pickup Types

| Pickup ID | Effect |
|-----------|--------|
| `weapon-rpg` | Grants RPG-7 + 1 round |
| `ammo-rpg` | +2 RPG rounds |
| `weapon-grenade-launcher` | Grants M79 + 6 rounds |
| `ammo-grenade-launcher` | +6 GL rounds |
| `weapon-pistol` / `ammo-pistol` | PP7 + ammo |
| `weapon-rifle` / `ammo-rifle` | KF7 + ammo |
| `weapon-shotgun` / `ammo-shotgun` | Shotgun + ammo |
| `weapon-sniper` / `ammo-sniper` | Sniper + ammo |
| `weapon-minigun` / `ammo-minigun` | Minigun + ammo |

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/weapons/weapon-manager.ts` | Weapon switching, fire logic, UGL, minigun spin gate |
| `src/weapons/weapon-view-model.ts` | First-person mesh, recoil, bob, barrel spin, muzzle flash |
| `src/weapons/weapon-mesh-factory.ts` | Procedural 3D mesh builder for all weapon types |
| `src/weapons/weapon-textures.ts` | Albedo + PBR + normal map texture generators |
| `src/weapons/weapon-skins.ts` | Skin → texture set mapping, UV clone helpers |
| `src/weapons/tracer-system.ts` | Bullet tracer streak pool + GLSL shader |
| `src/weapons/grenade-system.ts` | Grenades + RPG/GL projectile physics |
| `src/weapons/projectile-system.ts` | Hitscan raycast, decals, impact particles |
| `src/core/renderer.ts` | WebGL renderer + bloom post-processing |
| `src/core/day-night-cycle.ts` | Solar position, sky colors, ambient ramp |
| `src/audio/sound-effects.ts` | All procedural gunshot/reload/explosion sounds |
