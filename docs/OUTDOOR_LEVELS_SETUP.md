# Outdoor Levels Setup Guide

This document describes how to create and configure outdoor maps for 007 Remix, including skybox, HDRI, custom terrain, sun/day-night cycle, and enemy/item placement. Use it when setting up new outdoor arenas.

> **Living document**: Keep this updated when adding new outdoor features or changing existing behavior.

---

## Overview

Outdoor levels use the **Custom Arena** mode (`customQuickplay: true`). Assets live in `public/maps/quickplay/` and are driven by `config.json`. The system supports:

- **Environment GLB** — Terrain, rocks, buildings (trimesh collision)
- **HDRI** — Equirectangular HDR for lighting and reflections
- **Skybox** — LDR sky image(s), with optional day/night pair
- **Day/Night Cycle** — Solar math, sun position, skybox switching
- **Enemies & Pickups** — Raycast-based ground placement on varied terrain

---

## Directory Structure

```
public/maps/quickplay/
├── config.json          # Required — asset names, presets, skybox settings
├── environment.glb      # Required — terrain + geometry (collision)
├── environment.hdr      # Optional — HDRI lighting/reflections
├── skybox.webp          # Optional — visible sky (or daySkybox)
├── skybox_night.jpg     # Optional — night sky (for day/night)
└── README.md            # Quick reference (links to this doc)
```

---

## config.json

### Required Fields

| Field         | Default           | Description                                    |
|---------------|-------------------|------------------------------------------------|
| `environment` | `environment.glb` | GLB with terrain and static geometry (required)|
| `hdri`        | `environment.hdr` | Equirectangular HDR for PBR lighting           |
| `skybox`      | `skybox.jpg`      | LDR image for visible sky background           |

### Day/Night Cycle

| Field                 | Default | Description                                                  |
|-----------------------|---------|--------------------------------------------------------------|
| `daySkybox`           | —       | Day sky panorama (JPG/PNG/WebP)                              |
| `nightSkybox`         | —       | Night sky panorama                                           |
| `skyboxRotationOffset` | 0       | 0–1. Rotate sky to align sun/moon with game sun. Try 0.1–0.5 |
| `skyDomeScale`        | 5       | Scale factor for sky dome meshes in GLB (pushes horizon out)|

When both `daySkybox` and `nightSkybox` are set, the sky texture switches by time of day (dawn 5–7, day 7–17, dusk 17–19, night &lt;5 or ≥19).

### Presets (Alternative)

You can use presets instead of top-level day/night URLs:

```json
{
  "presets": {
    "day":   { "hdri": "environment.hdr", "skybox": "skybox.webp" },
    "night": { "hdri": "environment.hdr", "skybox": "skybox_night.jpg" }
  },
  "preset": "day"
}
```

### Example config.json (Full Day/Night)

```json
{
  "environment": "environment.glb",
  "hdri": "environment.hdr",
  "skybox": "skybox.webp",
  "daySkybox": "skybox.webp",
  "nightSkybox": "skybox_night.jpg",
  "skyboxRotationOffset": 0.1,
  "skyDomeScale": 5,
  "presets": {
    "day": { "hdri": "environment.hdr", "skybox": "skybox.webp" },
    "night": { "hdri": "environment.hdr", "skybox": "skybox_night.jpg" }
  },
  "preset": "day"
}
```

---

## Environment GLB (Terrain)

### Collision

- **Trimesh**: Collision is derived from GLB meshes. Complex terrain (hills, rocks, tracks) is supported.
- **Dedicated collision mesh**: If you name a mesh `collision` or `collider`, only that mesh is used for physics. Use a low-poly version for better performance.
- **Triangle winding**: If the player falls through terrain, flip winding in `src/levels/custom-environment-loader.ts`:
  ```ts
  const TRIMESH_FLIP_WINDING = true;
  ```
- **Rapier**: A small contact skin (0.08) improves trimesh stability.

### Sky Dome Meshes

Meshes whose names contain `sky`, `skydome`, `dome`, or `background` are scaled by `skyDomeScale` to push the visible horizon further out. Use for large outdoor terrains so the sky doesn’t clip.

### Shadows

All meshes have `castShadow = true` and `receiveShadow = true`. PBR materials get `envMapIntensity = 1.0`.

---

## HDRI

- **Format**: Equirectangular HDR (`.hdr`).
- **Role**: Scene `environment` (reflections) and PBR lighting. HDRI is used even at night (higher intensity so it’s not too dark).
- **Fallback**: If missing, basic ambient + point lights are used.

---

## Skybox

- **Formats**: JPG, PNG, WebP.
- **Mapping**: Equirectangular (wrapped horizontally).
- **Day/Night**: Provide `daySkybox` and `nightSkybox` for time-based switching. The sky sphere rotates with the sun; `skyboxRotationOffset` aligns the panorama’s sun/moon with the in-game sun.
- **Camera far plane**: Extended to 2000 for large environments to avoid horizon clipping.

---

## Day/Night Cycle

### Solar Math

- **Latitude**: 35° (configurable in `src/core/day-night-cycle.ts`).
- **Declination**: -18° (lower sun path, longer shadows).
- **Sun path**: East → South → West (hour angle based).
- **Phases**: Dawn 5–6, Sunrise 6, Noon 12, Sunset 18, Dusk 18–19, Night &lt;5 or ≥19.

### Game Settings

In **Settings → Display**:

| Setting        | Description                                  |
|----------------|----------------------------------------------|
| Day/Night Cycle| Enable/disable time progression              |
| Cycle Speed    | 0–200%. 100% ≈ 24 min per full day          |
| Intensity      | 0–200%. Sun/sky intensity multiplier         |
| Time of Day    | Manual time when cycle is paused (0–100)     |

### Skybox Mode

`getSkyboxMode(t)` returns `'day'` or `'night'` based on time. Day: 7–17. Night: &lt;5 or ≥19. Dawn/dusk use a midpoint transition.

---

## Spawning

### Player Spawn

- **Default**: Derived from terrain bbox center, or stored spawn in localStorage (`007remix_custom_spawn`).
- **Set spawn**: Press **F8** at desired position (single-player). Position is saved to localStorage.
- **Layout center**: Enemies and pickups are placed relative to the terrain bbox center (`customSpawnCenter`).

### Ground Height

- **Raycast-based**: Three.js `Raycaster` hits visible terrain meshes for accurate Y placement on hills and slopes.
- **Enemies**: `EnemyManager.setGroundHeight()` snaps enemy Y to terrain each frame.
- **Pickups & props**: `getGroundHeight(x, z)` is used when spawning.

### Enemy Placement

Enemies are spawned in `Game.spawnTestEnemies()`. Positions use `ox()`, `oz()`, and `getY()` for terrain-following. Example:

```ts
this.enemyManager.spawnEnemy({
  x: ox(5), y: getY(ox(5), oz(5)), z: oz(5),
  facingAngle: Math.PI + 0.5,
  weapon: 'pistol',
});
```

**Coordinate system**: +X = North, +Z = East, +Y = Up. `facingAngle` in radians (0 = -Z, π/2 = -X).

### Pickup & Prop Placement (config.json)

You can define specific ammo/weapon areas and crate/barrel locations in `config.json`. All positions use **x and z relative to the terrain bbox center**; **y is derived from raycast** so items sit on the ground.

#### Pickups

Add a `pickups` array. Each entry: `{ "type": "...", "x": 0, "z": 0, "amount": 25 }`.

| type | amount | Notes |
|------|--------|-------|
| `health` | 25 | Health pack |
| `armor` | 50 | Armor |
| `ammo-pistol` | 24 | Pistol ammo |
| `ammo-rifle` | 30 | Rifle ammo |
| `ammo-shotgun` | 12 | Shotgun shells |
| `ammo-sniper` | 8 | Sniper rounds |
| `weapon-rifle` | 0 | Weapon pickup |
| `weapon-shotgun` | 0 | Weapon pickup |
| `weapon-sniper` | 0 | Weapon pickup |

#### Props (crates, barrels)

Add a `props` array. Each entry: `{ "type": "crate"|"crate_metal"|"barrel", "x": 0, "z": 0, "size": [1,1,1], "yOffset": 0.5 }`.

| type | size | yOffset | Notes |
|------|------|---------|-------|
| `crate` | `[w,h,d]` | 0.5 | Wood crate; default [1,1,1] |
| `crate_metal` | `[w,h,d]` | 0.5 | Metal crate |
| `barrel` | — | 0.6 | Barrel (cylinder) |

- **size**: `[width, height, depth]` for crates. Omitted for barrels.
- **yOffset**: Added to raycast ground Y so the prop sits above terrain (default 0.5 crates, 0.6 barrels).
- **scale**: Optional; scales barrel or crate uniformly.

#### Example config.json (with placement)

```json
{
  "environment": "environment.glb",
  "hdri": "environment.hdr",
  "skybox": "skybox.webp",
  "daySkybox": "skybox.webp",
  "nightSkybox": "skybox_night.jpg",
  "skyboxRotationOffset": 0.1,
  "pickups": [
    { "type": "weapon-rifle", "x": -12, "z": -8, "amount": 0 },
    { "type": "weapon-shotgun", "x": 8, "z": 10, "amount": 0 },
    { "type": "health", "x": 0, "z": 10, "amount": 25 },
    { "type": "armor", "x": 0, "z": 0, "amount": 50 },
    { "type": "ammo-rifle", "x": -12, "z": -10, "amount": 30 }
  ],
  "props": [
    { "type": "crate", "x": 4, "z": 3, "size": [1.2, 1.2, 1.2], "yOffset": 0.6 },
    { "type": "crate_metal", "x": -6, "z": -5, "size": [1.5, 1, 1.5], "yOffset": 0.5 },
    { "type": "barrel", "x": 6, "z": -4, "yOffset": 0.6 }
  ]
}
```

Omit `pickups` or `props` to use the built-in default layout.

---

## Adding a New Outdoor Map

1. **Create a map folder** (if supporting multiple maps):
   ```
   public/maps/your-map-name/
   ├── config.json
   ├── environment.glb
   ├── environment.hdr
   ├── skybox.webp
   └── skybox_night.jpg
   ```

2. **Adjust `baseUrl`**: In `Game.buildCustomQuickplayScene()`, change:
   ```ts
   const baseUrl = '/maps/your-map-name/';
   ```
   Or add map selection UI and pass the chosen map path.

3. **Edit `config.json`** for that map.

4. **Pickup/prop layout**: Add `pickups` and `props` arrays to `config.json` (see Pickup & Prop Placement above).

---

## Key Files

| File | Purpose |
|------|---------|
| `src/levels/quickplay-config.ts` | Loads config.json, resolves presets |
| `src/levels/custom-environment-loader.ts` | Loads GLB, extracts trimesh, scales sky domes |
| `src/levels/environment-loader.ts` | loadHDRI, loadSkyboxImage, applyEnvironment |
| `src/core/day-night-cycle.ts` | Solar position, intensity phases, skybox mode |
| `src/core/game-settings.ts` | dayNightCycle, dayNightSpeed, dayNightIntensity, timeOfDay |
| `src/game.ts` | buildCustomQuickplayScene, day/night update, spawn logic |
| `src/enemies/enemy-manager.ts` | setGroundHeight for terrain following |
| `src/main.ts` | Custom Arena button → Game with customQuickplay |

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Player falls through terrain | Set `TRIMESH_FLIP_WINDING = true` in custom-environment-loader.ts |
| Sky clips on large terrain | Increase `skyDomeScale` in config; name sky meshes with `sky`/`dome` |
| Sun/moon misaligned in skybox | Adjust `skyboxRotationOffset` (0.1–0.5) |
| Too dark at night | HDRI is kept; increase `envIntensity` in day-night-cycle night branch |
| Spawns floating or underground | Ensure terrain meshes have geometry; check `getGroundHeight` raycaster |
| Wrong spawn position | Press F8 at desired location to save; clear localStorage if needed |

---

## Changelog

* **Config-driven placement**: `pickups` and `props` arrays in config.json for fine-tuned map building. X/Z relative to layout center; Y from raycast.
* **Initial**: Skybox, HDRI, GLB terrain, day/night cycle, sky dome scale, raycast ground, enemy/item placement.
* **Keep updated**: When adding or changing outdoor features, update the relevant sections above and append a changelog entry here.
