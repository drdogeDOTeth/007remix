import { ServerPlayerState, createPlayerState } from './player-state';
import type { WeaponFireEvent, DamageEvent, PlayerDeathEvent, PlayerRespawnEvent } from '../src/network/network-events';

/**
 * GameRoom manages a single multiplayer session/match.
 * Tracks all players in the room and broadcasts state updates.
 */
export class GameRoom {
  private players: Map<string, ServerPlayerState> = new Map();
  private readonly updateRate = 20; // Hz
  private updateInterval: NodeJS.Timeout | null = null;
  private respawnTimers: Map<string, NodeJS.Timeout> = new Map(); // Player ID -> respawn timer

  /**
   * Spawn points for players (random selection).
   * TODO: Load from level data.
   */
  private readonly spawnPoints = [
    { x: 0, y: 1, z: 0 },
    { x: -5, y: 1, z: -5 },
    { x: 5, y: 1, z: -5 },
    { x: -5, y: 1, z: 5 },
    { x: 5, y: 1, z: 5 },
    { x: 0, y: 1, z: -8 },
    { x: 0, y: 1, z: 8 },
    { x: -8, y: 1, z: 0 },
    { x: 8, y: 1, z: 0 },
  ];

  /**
   * Callback for broadcasting game state to all clients.
   * Set this to the Socket.IO broadcast function.
   */
  onBroadcast: ((eventName: string, data: any) => void) | null = null;

  constructor() {
    // Start game state broadcast loop
    this.startBroadcastLoop();
  }

  /**
   * Add a player to the room.
   */
  addPlayer(id: string, username: string): void {
    const playerState = createPlayerState(id, username);
    this.players.set(id, playerState);
    console.log(`[GameRoom] Player ${username} (${id}) joined. Total players: ${this.players.size}`);
  }

  /**
   * Remove a player from the room.
   */
  removePlayer(id: string): void {
    const player = this.players.get(id);
    if (player) {
      // Clear any pending respawn timer
      const respawnTimer = this.respawnTimers.get(id);
      if (respawnTimer) {
        clearTimeout(respawnTimer);
        this.respawnTimers.delete(id);
      }

      this.players.delete(id);
      console.log(`[GameRoom] Player ${player.username} (${id}) left. Total players: ${this.players.size}`);
    }
  }

  /**
   * Update a player's state from client input.
   */
  updatePlayerState(id: string, update: Partial<ServerPlayerState>): void {
    const player = this.players.get(id);
    if (!player) return;

    // Update only provided fields
    if (update.position) player.position = update.position;
    if (update.rotation !== undefined) player.rotation = update.rotation;
    if (update.health !== undefined) player.health = update.health;
    if (update.armor !== undefined) player.armor = update.armor;
    if (update.currentWeapon) player.currentWeapon = update.currentWeapon;
    if (update.crouching !== undefined) player.crouching = update.crouching;
    if (update.isMoving !== undefined) player.isMoving = update.isMoving;

    player.lastUpdateTime = Date.now();
  }

  /**
   * Get all player states (for broadcasting).
   */
  getAllPlayerStates(): Record<string, ServerPlayerState> {
    const states: Record<string, ServerPlayerState> = {};
    this.players.forEach((player, id) => {
      states[id] = player;
    });
    return states;
  }

  /**
   * Get player count.
   */
  get playerCount(): number {
    return this.players.size;
  }

  /**
   * Get player by ID.
   */
  getPlayer(id: string): ServerPlayerState | undefined {
    return this.players.get(id);
  }

  /**
   * Handle weapon fire event from client (Phase 3).
   * Validates hit and broadcasts damage if confirmed.
   */
  handleWeaponFire(event: WeaponFireEvent): void {
    const shooter = this.players.get(event.playerId);
    if (!shooter) {
      console.log(`[GameRoom] Weapon fire from unknown player: ${event.playerId}`);
      return;
    }

    console.log(`[GameRoom] ${shooter.username} fired ${event.weaponType}, hit claim: ${event.hitPlayerId ?? 'none'}`);

    // Broadcast weapon fire to all clients (for muzzle flash/animations)
    this.onBroadcast?.('weapon:fire', event);

    // Client claims to have hit someone
    if (event.hitPlayerId) {
      const victim = this.players.get(event.hitPlayerId);
      if (!victim) {
        console.log(`[GameRoom] Hit claim for unknown player: ${event.hitPlayerId}`);
        return;
      }

      // Basic validation: check if victim is alive and in reasonable range
      if (victim.health <= 0) return;

      const distance = this.calculateDistance(event.origin, victim.position);
      const maxRange = this.getWeaponRange(event.weaponType);

      if (distance > maxRange) {
        console.log(`[GameRoom] Rejected hit: distance ${distance.toFixed(2)} > max range ${maxRange}`);
        return;
      }

      // Calculate damage
      const damage = this.getWeaponDamage(event.weaponType);
      const wasHeadshot = false; // TODO: check hit point height for headshots

      // Apply damage
      this.applyDamage(victim, damage);

      // Broadcast damage event
      const damageEvent: DamageEvent = {
        shooterId: event.playerId,
        victimId: event.hitPlayerId,
        damage,
        wasHeadshot,
        timestamp: Date.now(),
      };
      this.onBroadcast?.('player:damaged', damageEvent);

      // Check for death
      if (victim.health <= 0) {
        const deathEvent: PlayerDeathEvent = {
          victimId: victim.id,
          killerId: shooter.id,
          timestamp: Date.now(),
        };
        this.onBroadcast?.('player:died', deathEvent);
        console.log(`[GameRoom] Player ${victim.username} killed by ${shooter.username}`);

        // Schedule respawn after 3 seconds
        this.scheduleRespawn(victim.id);
      }
    }
  }

  /**
   * Schedule a player respawn after delay.
   */
  private scheduleRespawn(playerId: string): void {
    // Clear any existing respawn timer
    const existingTimer = this.respawnTimers.get(playerId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule respawn after 3 seconds
    const timer = setTimeout(() => {
      this.respawnPlayer(playerId);
      this.respawnTimers.delete(playerId);
    }, 3000);

    this.respawnTimers.set(playerId, timer);
    console.log(`[GameRoom] Player ${playerId} will respawn in 3 seconds`);
  }

  /**
   * Respawn a player at a random spawn point.
   */
  private respawnPlayer(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;

    // Get random spawn point
    const spawnPoint = this.getRandomSpawnPoint();

    // Reset player state
    player.health = 100;
    player.armor = 0;
    player.position = { ...spawnPoint };

    // Broadcast respawn event
    const respawnEvent: PlayerRespawnEvent = {
      playerId: player.id,
      position: spawnPoint,
      health: player.health,
      armor: player.armor,
      timestamp: Date.now(),
    };
    this.onBroadcast?.('player:respawned', respawnEvent);

    console.log(`[GameRoom] Player ${player.username} respawned at (${spawnPoint.x}, ${spawnPoint.y}, ${spawnPoint.z})`);
  }

  /**
   * Get a random spawn point.
   */
  private getRandomSpawnPoint(): { x: number; y: number; z: number } {
    const index = Math.floor(Math.random() * this.spawnPoints.length);
    return { ...this.spawnPoints[index] };
  }

  /**
   * Apply damage to a player, accounting for armor.
   */
  private applyDamage(player: ServerPlayerState, damage: number): void {
    // Armor absorbs 60% of damage
    const armorAbsorption = 0.6;
    const damageToArmor = Math.min(player.armor, damage * armorAbsorption);
    const damageToHealth = damage - damageToArmor;

    player.armor = Math.max(0, player.armor - damageToArmor);
    player.health = Math.max(0, player.health - damageToHealth);
  }

  /**
   * Calculate distance between two points.
   */
  private calculateDistance(
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number }
  ): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Get weapon damage values.
   */
  private getWeaponDamage(weaponType: string): number {
    const damages: Record<string, number> = {
      pistol: 25,
      rifle: 30,
      shotgun: 80,
      sniper: 100,
    };
    return damages[weaponType] ?? 25;
  }

  /**
   * Get weapon max range.
   */
  private getWeaponRange(weaponType: string): number {
    const ranges: Record<string, number> = {
      pistol: 50,
      rifle: 100,
      shotgun: 20,
      sniper: 200,
    };
    return ranges[weaponType] ?? 50;
  }

  /**
   * Start the broadcast loop that sends game state to all clients.
   */
  private startBroadcastLoop(): void {
    const intervalMs = 1000 / this.updateRate;

    this.updateInterval = setInterval(() => {
      if (this.onBroadcast && this.players.size > 0) {
        const snapshot = {
          timestamp: Date.now(),
          players: this.getAllPlayerStates(),
        };
        this.onBroadcast('game:state:snapshot', snapshot);
      }
    }, intervalMs);
  }

  /**
   * Stop the broadcast loop and cleanup.
   */
  dispose(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    // Clear all respawn timers
    for (const timer of this.respawnTimers.values()) {
      clearTimeout(timer);
    }
    this.respawnTimers.clear();

    this.players.clear();
  }
}
