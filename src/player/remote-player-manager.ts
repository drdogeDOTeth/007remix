import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { RemotePlayer } from './remote-player';
import type { GameStateSnapshot } from '../network/network-events';
import type { PhysicsWorld } from '../core/physics-world';

/** Callback to get camera world position for sprite billboarding */
export type GetCameraPosition = () => THREE.Vector3;

/** Callback to get ground height at (x,z) for terrain snapping (Custom Arena). */
export type GetGroundHeight = (x: number, z: number) => number;

/** Getter for ground height (resolved lazily - e.g. after prepareCustomScene). */
export type GetGroundHeightProvider = () => GetGroundHeight | null;

/**
 * RemotePlayerManager manages all remote players in a multiplayer session.
 * Handles spawning, updating, and removing remote players.
 */
export class RemotePlayerManager {
  private scene: THREE.Scene;
  private physics: PhysicsWorld;
  private players: Map<string, RemotePlayer> = new Map();
  private colliderToPlayerId: Map<number, string> = new Map(); // Collider handle -> player ID
  private getLocalPlayerId: () => string | null;
  private getCameraPosition: GetCameraPosition | null;
  private getGroundHeightProvider: GetGroundHeightProvider | null;

  constructor(
    scene: THREE.Scene,
    physics: PhysicsWorld,
    getLocalPlayerId: () => string | null,
    getCameraPosition: GetCameraPosition | null = null,
    getGroundHeightProvider: GetGroundHeightProvider | null = null
  ) {
    this.scene = scene;
    this.physics = physics;
    this.getLocalPlayerId = getLocalPlayerId ?? (() => null);
    this.getCameraPosition = getCameraPosition ?? null;
    this.getGroundHeightProvider = getGroundHeightProvider ?? null;
  }

  /**
   * Update all remote players from server game state snapshot.
   */
  updateFromSnapshot(snapshot: GameStateSnapshot): void {
    // Track which players are in this snapshot
    const activePlayerIds = new Set<string>();

    const localId = this.getLocalPlayerId();

    // Update or spawn players
    for (const [playerId, playerState] of Object.entries(snapshot.players)) {
      // Skip local player - never render our own model as a remote player
      if (localId && playerId === localId) continue;

      activePlayerIds.add(playerId);

      // Get or create remote player (username from server broadcast)
      let remotePlayer = this.players.get(playerId);
      if (!remotePlayer) {
        const username = (playerState as { username?: string }).username ?? playerId;
        const getGroundHeight = this.getGroundHeightProvider?.() ?? null;
        remotePlayer = new RemotePlayer(
          playerId,
          username,
          this.scene,
          this.physics,
          this.getCameraPosition,
          getGroundHeight
        );
        this.players.set(playerId, remotePlayer);

        // Map collider handle to player ID for hit detection
        this.colliderToPlayerId.set(remotePlayer.getColliderHandle(), playerId);

        console.log(`[RemotePlayerManager] Player ${playerId} joined`);
      }

      // Update player state (sync username from server if available)
      const username = (playerState as { username?: string }).username;
      if (username) remotePlayer.username = username;
      remotePlayer.updateFromServer(playerState);
    }

    // Remove players that disconnected (not in snapshot)
    const toRemove: string[] = [];
    for (const [playerId, remotePlayer] of this.players) {
      if (!activePlayerIds.has(playerId)) {
        toRemove.push(playerId);
        this.colliderToPlayerId.delete(remotePlayer.getColliderHandle());
        remotePlayer.dispose(this.scene, this.physics);
        console.log(`[RemotePlayerManager] Player ${playerId} left`);
      }
    }
    toRemove.forEach(id => this.players.delete(id));
  }

  /**
   * Update all remote players (called each frame).
   */
  update(dt: number): void {
    for (const player of this.players.values()) {
      player.update(dt);
    }
  }

  /**
   * Get number of remote players.
   */
  get playerCount(): number {
    return this.players.size;
  }

  /**
   * Get all remote players (for hit detection, etc.).
   */
  getAll(): RemotePlayer[] {
    return Array.from(this.players.values());
  }

  /**
   * Get remote player by ID.
   */
  getPlayer(playerId: string): RemotePlayer | undefined {
    return this.players.get(playerId);
  }

  /**
   * Get remote player by collider (for hit detection).
   */
  getPlayerByCollider(collider: RAPIER.Collider): RemotePlayer | undefined {
    const playerId = this.colliderToPlayerId.get(collider.handle);
    return playerId ? this.players.get(playerId) : undefined;
  }

  /**
   * Cleanup all remote players.
   */
  dispose(): void {
    for (const player of this.players.values()) {
      player.dispose(this.scene, this.physics);
    }
    this.players.clear();
    this.colliderToPlayerId.clear();
  }
}
