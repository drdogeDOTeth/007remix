/**
 * Server-side player state tracking.
 * Stores authoritative state for each connected player.
 */
import { getMultiplayerArenaDefaultSpawnPoint } from '../src/levels/multiplayer-arena.js';

export interface ServerPlayerState {
  id: string;
  username: string;
  position: { x: number; y: number; z: number };
  rotation: number;
  health: number;
  armor: number;
  currentWeapon: 'pistol' | 'rifle' | 'shotgun' | 'sniper';
  crouching: boolean;
  isMoving: boolean;
  lastUpdateTime: number;
  connected: boolean;
  kills: number;
  deaths: number;
  /** Timestamp until which player is invincible after respawn (ms). */
  invincibleUntil?: number;
}

/**
 * Default spawn position for new players.
 */
const DEFAULT_SPAWN = getMultiplayerArenaDefaultSpawnPoint();

/**
 * Creates a new player state with default values.
 */
export function createPlayerState(id: string, username: string): ServerPlayerState {
  return {
    id,
    username,
    position: { ...DEFAULT_SPAWN },
    rotation: 0,
    health: 100,
    armor: 0,
    currentWeapon: 'pistol',
    crouching: false,
    isMoving: false,
    lastUpdateTime: Date.now(),
    connected: true,
    kills: 0,
    deaths: 0,
  };
}
