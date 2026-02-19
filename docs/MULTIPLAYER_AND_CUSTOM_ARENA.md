# Multiplayer & Custom Arena Guide

This document describes the multiplayer architecture, Custom Arena support, networking fixes, and config-driven map placement for 007 Remix.

> **See also**: [OUTDOOR_LEVELS_SETUP.md](./OUTDOOR_LEVELS_SETUP.md) for skybox, HDRI, terrain, and placement config details.

---

## Overview

Multiplayer runs over Socket.IO with an authoritative server. Players can choose from procedural arenas (Crossfire, Verdigris Depot) or the **Custom Arena** (GLB + HDRI outdoor map). Each map has its own room so players only see others in the same level.

---

## Map Selection & Rooms

### Available Maps

| Map | ID | Description |
|-----|-----|-------------|
| Crossfire Complex | `crossfire` | Procedural close-quarters arena |
| Verdigris Depot | `wasteland` | Procedural oxidized depot (same layout) |
| Custom Arena | `custom` | GLB terrain + HDRI from `public/maps/quickplay/` |

### Map-Specific Rooms

The server uses **Socket.IO rooms** so each map is isolated:

- When a player connects with `mapId`, they join room `map:${mapId}` (e.g. `map:custom`, `map:crossfire`).
- Game state snapshots and combat events are broadcast **only to that room**.
- Players in Crossfire never receive state for players in Custom Arena (and vice versa).

**Server flow** (`server/server.ts`):

1. Client emits `player:connected` with `{ username, mapId }`.
2. Server does `socket.join('map:' + mapId)`.
3. `GameRoom` per map: broadcasts use `io.to('map:' + mapId).emit()`.
4. Empty rooms are disposed when the last player leaves.

### Client-Side Snapshot Filtering

Snapshots include a `mapId` field. The client ignores snapshots whose `mapId` does not match the map it joined, avoiding cross-room visibility if messages are ever misrouted.

---

## Custom Arena in Multiplayer

### Flow

1. Player selects **Custom Arena** in the Multiplayer tab and clicks **Join**.
2. Client connects with `mapId: 'custom'`, server creates/joins `map:custom` room.
3. Client loads GLB + HDRI from `public/maps/quickplay/`, builds terrain, props, and pickups.
4. Server uses `getCustomArenaSpawnPoints()` for spawn/respawn positions.
5. Game runs like other multiplayer maps (deathmatch, first to 25 kills).

### Differences from Procedural Maps

- **No enemies** — Custom Arena multiplayer is PvP only.
- **More pickups** — Weapons, ammo, health, armor scattered across the map.
- **Terrain following** — Spawns and pickups use raycast ground height.

### Spawn Points

Custom Arena spawn points are defined in `src/levels/multiplayer-arena.ts` via `getCustomArenaSpawnPoints()`, based on the default single-player spawn. Positions can be extended later via `config.json` if needed.

---

## Remote Player Sync (Custom Arena)

### Problem: Players Underground / Floating

Custom Arena uses varied terrain. If remote players are placed using only server Y, they can appear underground or floating on slopes.

### Fixes

1. **Server position for collider and model** — Both use the same interpolated position so the hitbox aligns with the visual.
2. **Terrain snap (optional)** — When `getGroundHeight` exists, the model can be nudged down to terrain if it would otherwise float.
3. **No extrapolation** — Interpolation factor is clamped to 1.0 to avoid drift.
4. **Respawn / teleport detection** — Large position jumps (>10 units) clear the interpolation buffer and reset state.
5. **`resetAfterRespawn()`** — Clears the interpolation buffer so respawns don’t blend from death position.

---

## Network Protocol

### Connection

- Client connects to `NetworkConfig.SERVER_URL` (default port 3001).
- On `connect`, client emits `player:connected` with `{ playerId, username, mapId? }`.
- Server routes the player into the room for that `mapId`.

### State Sync

- **20 Hz** — Client sends `player:state:update`; server broadcasts `game:state:snapshot`.
- Snapshot includes `mapId`, `players`, `destroyedDestructibles`.

### Combat & Equipment

- **Weapon fire** — Client sends hit claim; server validates range/LOS/fire rate and broadcasts damage.
- **Grenades** — Throw and explosion events.
- **Destructibles** — Server-authoritative destruction; sync for new joiners.
- **Flashlight** — Toggle event.

---

## Config-Driven Placement

Custom Arena uses `public/maps/quickplay/config.json` for fine-tuned placement. Omit `pickups` or `props` to use built-in defaults.

### Pickups

```json
"pickups": [
  { "type": "weapon-rifle", "x": -12, "z": -8, "amount": 0 },
  { "type": "health", "x": 0, "z": 10, "amount": 25 },
  { "type": "ammo-rifle", "x": -12, "z": -10, "amount": 30 }
]
```

- **x, z** — Offsets from terrain bbox center.
- **y** — Computed by raycast at `(x, z)`.
- **Types**: `health`, `armor`, `ammo-pistol`, `ammo-rifle`, `ammo-shotgun`, `ammo-sniper`, `weapon-rifle`, `weapon-shotgun`, `weapon-sniper`.

### Props (Crates, Barrels)

```json
"props": [
  { "type": "crate", "x": 4, "z": 3, "size": [1.2, 1.2, 1.2], "yOffset": 0.6 },
  { "type": "crate_metal", "x": -6, "z": -5, "size": [1.5, 1, 1.5], "yOffset": 0.5 },
  { "type": "barrel", "x": 6, "z": -4, "yOffset": 0.6 }
]
```

- **type**: `crate`, `crate_metal`, `barrel`.
- **size**: `[w, h, d]` for crates (ignored for barrels).
- **yOffset**: Added to raycast ground Y.

---

## Key Files

| File | Purpose |
|------|---------|
| `server/server.ts` | Map-specific rooms, `socket.join`, broadcast routing |
| `server/game-room.ts` | Per-map game state, spawn logic, validation |
| `src/levels/multiplayer-arena.ts` | Map IDs, spawn points, `getSpawnPointsForMap()` |
| `src/network/network-manager.ts` | `connect(mapId)`, `PlayerConnectedEvent` with `mapId` |
| `src/network/network-events.ts` | `mapId` in `PlayerConnectedEvent`, `GameStateSnapshot` |
| `src/player/remote-player.ts` | Model/collider sync, interpolation, respawn reset |
| `src/network/interpolation-buffer.ts` | No extrapolation, jump detection |
| `src/levels/quickplay-config.ts` | `pickups`, `props` in config |
| `src/game.ts` | Custom Arena flow, `spawnCustomArenaPickups`, config placement |

---

## Testing Multiplayer

1. Start server: `npm run server`
2. Start client: `npm run dev`
3. Open two browser tabs, join **different maps** — players should not see each other.
4. Join the **same map** — players should see each other and positions should stay in sync on terrain.
