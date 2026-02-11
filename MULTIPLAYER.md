# Multiplayer Implementation Guide

## Overview
007 Remix now features full multiplayer functionality with client-server architecture using Socket.IO and server-authoritative gameplay.

## Architecture

### Server (Node.js + Socket.IO)
- **Location**: `server/server.ts`, `server/game-room.ts`
- **Port**: 3001
- **Update Rate**: 20Hz (50ms intervals)
- **Features**:
  - Player state synchronization
  - Hit validation (server-authoritative)
  - Respawn system (3-second delay)
  - Random spawn point selection

### Client (Three.js + Rapier3D)
- **Network Manager**: `src/network/network-manager.ts`
- **Remote Players**: `src/player/remote-player.ts`, `src/player/remote-player-manager.ts`
- **Player Model**: `src/player/player-model.ts`
- **Interpolation**: 100ms delay buffer for smooth movement

## Implemented Features (Phase 1-4)

### Phase 1: Basic Multiplayer
✅ Socket.IO connection
✅ Player join/leave events
✅ Position synchronization (20Hz)
✅ Remote player rendering

### Phase 2: Movement & Animation
✅ Interpolation buffer (100ms)
✅ Walking animation (arms, legs, knee bending)
✅ Player models with team colors
✅ Shadow rendering

### Phase 3: Combat Synchronization
✅ Weapon fire events
✅ Server-side hit validation
✅ Damage calculation with armor
✅ Hit markers (white for hits, red for headshots)
✅ Kill feed (top-right corner)

### Phase 4: Death & Respawn
✅ Death animation (fall down, fade out)
✅ Death overlay with killer name
✅ 3-second respawn countdown
✅ Random spawn point teleport
✅ Player invisibility bug fix (material opacity reset)

## Player Model Features

### Visual Components
- **Head**: Skin-colored cube with eyes
- **Torso**: Team-colored body with tactical vest overlay
- **Arms**: Connected to shoulders with proper hierarchy
- **Hands**: Palm + 4 fingers (attached to arms)
- **Legs**: Upper/lower leg groups with knee bending
- **Boots**: Black footwear

### Materials
- **Body**: Team color with emissive glow (0.15 intensity) for identification
- **Vest**: Metallic armor (0.6 metalness) for tactical look
- **Skin**: Tan color (#d4a57a) for hands/head
- **Dark**: Black (#222222) for pants/boots

### Team Colors (Cycles)
1. Blue (#4488ff)
2. Red (#ff4444)
3. Green (#44ff44)
4. Orange (#ffaa44)
5. Magenta (#ff44ff)
6. Cyan (#44ffff)
7. Yellow (#ffff44)
8. Burnt Orange (#ff8844)

## Weapon System

### Weapon Models
Remote players use **the same weapon models** as first-person view via `WeaponViewModel.buildWeaponMeshForPreview()`:

- **Pistol**: `buildPistolMesh()` - Slide, barrel, grip, serrations
- **Rifle**: `buildRifleMesh()` - Full auto rifle with stock, magazine, scope
- **Shotgun**: `buildShotgunMesh()` - Pump-action with shell loading
- **Sniper**: `buildSniperMesh()` - Long-range rifle with scope

### Weapon Attachment
- **Hand**: Left hand (x: -0.26)
- **Position**: In palm grip (y: 0.08, z: 0.2)
- **Rotation**:
  - X: π/2 (point forward)
  - Y: π (flip 180° to face forward)
  - Z: 0
- **Scale**: 0.7 (scaled down for third-person view)
- **Layer**: 0 (default camera layer, not layer 1 like first-person)

## Animations

### Movement Animation
- **Bob**: Vertical oscillation when moving (0.05 amplitude)
- **Arm Swing**: Opposite of leg movement (0.3 amplitude)
- **Leg Swing**: Hip rotation (0.4 amplitude)
- **Knee Bend**: Forward bend during leg swing (0.5 amplitude)

### Combat Animations
- **Aiming**: Arms raised when firing (500ms duration)
- **Weapon Recoil**: Kick back 0.08 units + rotation (80ms)
- **Muzzle Flash**: (Handled by weapon mesh)

### Death Animation
- **Fall**: Rotate forward -90° (0.5 second duration)
- **Fade**: Opacity 1.0 → 0.0
- **Hide**: Model invisible after completion

## Network Events

### Client → Server
- `player:state:update`: Position, rotation, health, weapon (20Hz)
- `weapon:fire`: Fire event with origin, direction, hit claim

### Server → All Clients
- `game:state:snapshot`: All player states (20Hz)
- `weapon:fire`: Broadcast for animations
- `player:damaged`: Damage dealt, headshot flag
- `player:died`: Victim/killer IDs
- `player:respawned`: New position, reset stats

## Known Issues & Solutions

### Fixed Issues
✅ **Collider Comparison**: Use `collider.handle === other.handle` (not `===`)
✅ **Player Invisibility**: Reset material opacity/transparency on respawn
✅ **Hands Not Connected**: Arms are now Groups with hands as children
✅ **Knees Bending Backwards**: Fixed rotation direction (positive = forward)
✅ **Weapon Layer Visibility**: Set all weapon children to layer 0

### Current Status
- All Phase 1-4 features complete and working
- Player models render correctly with team colors
- Weapons held in left hand with proper orientation
- Death/respawn system fully functional
- Combat synchronization working (hit detection, damage, kills)

## Starting the Multiplayer Server

```bash
# Start server (port 3001)
npm run server

# Start client dev server (port 5173)
npm run dev
```

Connect to: `http://localhost:5173`

Server will be running on: `http://localhost:3001`

## Phase 5: Equipment & Environment Sync

### Implemented Features

✅ **Grenade Synchronization**
- Client throws grenade → sends `grenade:throw` event to server
- All clients spawn grenade visual and simulate physics (deterministic)
- When grenade lands, client sends `grenade:explosion` event to server
- Server calculates damage to all players in radius (frag grenades only)
- Server broadcasts explosion → all clients show explosion visual
- Gas grenades: damage handled client-side (tactical overlay blocks damage)

✅ **Flashlight Synchronization**
- Client toggles flashlight (V key) → sends `flashlight:toggle` event
- Server broadcasts to all clients
- Remote players show SpotLight cone matching local player's flashlight

✅ **Muzzle Flash**
- Remote players show PointLight flash (50ms duration) when firing
- Light positioned at weapon tip, intensity 8, range 4 units
- Synced via existing `weapon:fire` event

✅ **Destructible Props**
- Client destroys prop → sends `destructible:destroyed` event
- Server broadcasts to all clients
- Remote clients destroy matching prop (position-based matching within 0.5 unit tolerance)
- Barrel explosions damage players in radius (server-authoritative)
- Echo prevention: callback temporarily disabled when destroying from network event

### Network Events

**Client → Server:**
```typescript
// Grenade throw
interface GrenadeThrowEvent {
  playerId: string;
  timestamp: number;
  grenadeType: 'gas' | 'frag';
  origin: { x, y, z };
  direction: { x, y, z };
}

// Grenade explosion (when lands)
interface GrenadeExplosionEvent {
  playerId: string;
  timestamp: number;
  grenadeType: 'gas' | 'frag';
  position: { x, y, z };
}

// Flashlight toggle
interface FlashlightToggleEvent {
  playerId: string;
  isOn: boolean;
  timestamp: number;
}

// Destructible destroyed
interface DestructibleDestroyedEvent {
  propId: string; // Position-based ID
  position: { x, y, z };
  type: 'crate' | 'crate_metal' | 'barrel';
  timestamp: number;
}
```

**Server → All Clients:**
- Broadcasts same events to all connected players
- Server validates grenade/barrel explosion damage
- Server applies damage to players in radius

### Server-Side Logic

**Grenade Explosion Damage (Frag):**
- Explosion radius: 4 units
- Max damage: 80
- Falloff: Linear (full damage at center, 0 at edge)
- Formula: `damage = 80 * (1 - distance / radius)`

**Barrel Explosion Damage:**
- Explosion radius: 3 units
- Max damage: 50
- Falloff: Linear
- Triggers when barrel health reaches 0
- Can kill players (no specific shooter ID)

### Implementation Files

**Network Protocol:**
- `src/network/network-events.ts`: Event type definitions
- `src/network/network-manager.ts`: Send/receive methods

**Server:**
- `server/game-room.ts`: Grenade, flashlight, destructible handlers
- `server/server.ts`: Socket event wiring

**Client:**
- `src/game.ts`: Send events on throw/toggle, handle incoming events
- `src/player/remote-player.ts`: Flashlight SpotLight, setFlashlight()
- `src/player/player-model.ts`: Muzzle flash PointLight in playFireAnimation()
- `src/weapons/grenade-system.ts`: onGrenadeLanded callback
- `src/levels/destructible-system.ts`: onPropDestroyedFull callback

### Known Limitations

1. **Destructible Sync**: Position-based IDs can cause issues if props spawn at identical positions. Future: assign UUIDs during level build.
2. **Grenade Physics Determinism**: Clients simulate grenade arc independently. Slight network lag may cause minor visual desync, but explosions are server-authoritative.
3. **Gas Grenade Damage**: Not networked (client-side only). Each player checks if they're in gas cloud and applies damage locally based on tactical overlay state.

## Next Steps (Phase 6+)

Potential future enhancements:
- Crouch animation synchronization
- Weapon-specific animations (reload, weapon switch)
- Voice chat
- Lobby system
- Team selection
- Game modes (Deathmatch, Team Deathmatch, Capture the Flag)
- Leaderboard
- Player customization
- Map voting
- Persistent prop IDs (UUIDs in level JSON)
