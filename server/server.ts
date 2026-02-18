import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { GameRoom } from './game-room.js';
import type { MultiplayerMapId } from '../src/levels/multiplayer-arena.js';

const VALID_MAP_IDS: MultiplayerMapId[] = ['crossfire', 'wasteland', 'custom'];

/** Socket.IO room name prefix to avoid collisions */
const ROOM_PREFIX = 'map:';

/**
 * Port to run the server on.
 */
const PORT = process.env.PORT || 3001;

/**
 * Main game server using Socket.IO.
 * Supports map-specific rooms so players only see others in the same level.
 */
class GameServer {
  private httpServer;
  private io: SocketIOServer;
  private gameRooms = new Map<MultiplayerMapId, GameRoom>();
  private socketToMapId = new Map<string, MultiplayerMapId>();

  constructor() {
    // Create HTTP server
    this.httpServer = createServer();

    // Create Socket.IO server with CORS for development
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: '*', // Allow all origins in development (restrict in production)
        methods: ['GET', 'POST'],
      },
    });

    this.setupSocketHandlers();
  }

  private roomName(mapId: MultiplayerMapId): string {
    return ROOM_PREFIX + mapId;
  }

  private getOrCreateRoom(mapId: MultiplayerMapId): GameRoom {
    let room = this.gameRooms.get(mapId);
    if (!room) {
      room = new GameRoom();
      const roomName = this.roomName(mapId);
      room.onBroadcast = (eventName, data) => {
        this.io.to(roomName).emit(eventName, data);
      };
      this.gameRooms.set(mapId, room);
      console.log(`[Server] Created room for map: ${mapId} (${roomName})`);
    }
    return room;
  }

  /**
   * Set up Socket.IO event handlers.
   */
  private setupSocketHandlers(): void {
    this.io.on('connection', (socket) => {
      console.log(`[Server] Client connected: ${socket.id}`);

      // Player connected event - join map-specific room
      socket.on('player:connected', (data: { playerId: string; username: string; mapId?: string }) => {
        const mapId = (VALID_MAP_IDS.includes(data.mapId as MultiplayerMapId) ? data.mapId : 'crossfire') as MultiplayerMapId;
        const roomName = this.roomName(mapId);
        this.socketToMapId.set(socket.id, mapId);
        socket.join(roomName);

        const gameRoom = this.getOrCreateRoom(mapId);
        gameRoom.addPlayer(socket.id, data.username, mapId);

        console.log(`[Server] ${data.username} joined ${mapId} (room: ${roomName})`);

        // Broadcast only to others in this map's room
        this.io.to(roomName).emit('player:connected', {
          playerId: socket.id,
          username: data.username,
        });
      });

      // Player state update - route to correct room
      socket.on('player:state:update', (state: any) => {
        const mapId = this.socketToMapId.get(socket.id);
        if (mapId) {
          this.gameRooms.get(mapId)?.updatePlayerState(socket.id, state);
        }
      });

      // Weapon fire event (Phase 3)
      socket.on('weapon:fire', (event: any) => {
        const mapId = this.socketToMapId.get(socket.id);
        if (mapId) {
          this.gameRooms.get(mapId)?.handleWeaponFire(event);
        }
      });

      // Grenade throw event (Phase 5)
      socket.on('grenade:throw', (event: any) => {
        const mapId = this.socketToMapId.get(socket.id);
        if (mapId) {
          this.gameRooms.get(mapId)?.handleGrenadeThrow(event);
        }
      });

      // Grenade explosion event (Phase 5)
      socket.on('grenade:explosion', (event: any) => {
        const mapId = this.socketToMapId.get(socket.id);
        if (mapId) {
          this.gameRooms.get(mapId)?.handleGrenadeExplosion(event);
        }
      });

      // Gas damage event
      socket.on('player:gas:damage', (event: any) => {
        const mapId = this.socketToMapId.get(socket.id);
        if (mapId) {
          this.gameRooms.get(mapId)?.handleGasDamage(socket.id, event);
        }
      });

      // Enemy damage event
      socket.on('player:enemy:damage', (event: any) => {
        const mapId = this.socketToMapId.get(socket.id);
        if (mapId) {
          this.gameRooms.get(mapId)?.handleEnemyDamage(socket.id, event);
        }
      });

      // Flashlight toggle event (Phase 5)
      socket.on('flashlight:toggle', (event: any) => {
        const mapId = this.socketToMapId.get(socket.id);
        if (mapId) {
          this.gameRooms.get(mapId)?.handleFlashlightToggle(event);
        }
      });

      // Destructible destroyed event (Phase 5)
      socket.on('destructible:destroyed', (event: any) => {
        const mapId = this.socketToMapId.get(socket.id);
        if (mapId) {
          this.gameRooms.get(mapId)?.handleDestructibleDestroyed(event);
        }
      });

      // Player disconnected
      socket.on('disconnect', () => {
        const mapId = this.socketToMapId.get(socket.id);
        if (mapId) {
          this.gameRooms.get(mapId)?.removePlayer(socket.id);
          this.io.to(this.roomName(mapId)).emit('player:disconnected', { playerId: socket.id });
          this.socketToMapId.delete(socket.id);
          // Clean up empty rooms (optional - keeps room for rejoins)
          const room = this.gameRooms.get(mapId);
          if (room && room.playerCount === 0) {
            room.dispose();
            this.gameRooms.delete(mapId);
            console.log(`[Server] Disposed empty room: ${mapId}`);
          }
        }
        console.log(`[Server] Client disconnected: ${socket.id}`);
      });
    });
  }

  /**
   * Start the server.
   */
  start(): void {
    this.httpServer.listen(PORT, () => {
      console.log(`[Server] Game server running on port ${PORT}`);
      console.log(`[Server] Players can connect to: http://localhost:${PORT}`);
    });
  }

  /**
   * Stop the server.
   */
  stop(): void {
    for (const room of this.gameRooms.values()) {
      room.dispose();
    }
    this.gameRooms.clear();
    this.socketToMapId.clear();
    this.io.close();
    this.httpServer.close();
  }
}

// Start the server
const server = new GameServer();
server.start();

// Graceful shutdown on Ctrl+C
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down gracefully...');
  server.stop();
  process.exit(0);
});
