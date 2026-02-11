import type { LevelSchema, RoomDef, DoorDef, EnemySpawnDef, PickupSpawnDef, ObjectiveDef, TriggerDef, PropDef } from './level-schema';

interface GenerationOptions {
  minRooms: number;
  maxRooms: number;
  minEnemies: number;
  maxEnemies: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

const DEFAULT_OPTIONS: GenerationOptions = {
  minRooms: 6,
  maxRooms: 12,
  minEnemies: 5,
  maxEnemies: 15,
  difficulty: 'medium'
};

export class LevelGenerator {
  private rng: () => number;
  private roomIdCounter = 0;
  private doorIdCounter = 0;
  private enemyIdCounter = 0;
  private pickupIdCounter = 0;
  private objectiveIdCounter = 0;
  private triggerIdCounter = 0;
  private propIdCounter = 0;
  private lockedDoors: DoorDef[] = [];
  private mainPathEdges: Array<[string, string]> = [];

  constructor(seed?: number) {
    if (seed !== undefined) {
      // Simple seeded random number generator
      let state = seed;
      this.rng = () => {
        state = (state * 9301 + 49297) % 233280;
        return state / 233280;
      };
    } else {
      this.rng = Math.random;
    }
  }

  generate(options: Partial<GenerationOptions> = {}): LevelSchema {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    this.resetCounters();

    console.log('[LevelGen] Starting generation with options:', opts);

    const roomCount = this.randomInt(opts.minRooms, opts.maxRooms);
    const rooms = this.generateRooms(roomCount);
    const doors = this.generateDoors(rooms);
    const playerSpawn = this.generatePlayerSpawn(rooms[0]);
    
    // CRITICAL: Calculate accessible rooms BEFORE placing keys
    const accessibleRooms = this.getAccessibleRooms(rooms, doors);
    console.log('[LevelGen] Accessible rooms:', accessibleRooms.length, '/', rooms.length);
    console.log('[LevelGen] Locked doors:', this.lockedDoors.length);

    const enemyCount = this.randomInt(opts.minEnemies, opts.maxEnemies);
    const enemies = this.generateEnemies(rooms, enemyCount);
    const pickups = this.generatePickups(rooms, doors, accessibleRooms);
    const objectives = this.generateObjectives();
    const triggers = this.generateTriggers(rooms, objectives);
    const props = this.generateProps(rooms);

    // CRITICAL: Validate ruleset compliance
    const validation = this.validateLevel(rooms, doors, pickups, props, accessibleRooms);
    if (!validation.valid) {
      console.error('[LevelGen] Validation failed:', validation.errors);
      throw new Error(`Level generation failed validation: ${validation.errors.join(', ')}`);
    }

    const level: LevelSchema = {
      name: this.generateLevelName(),
      briefing: this.generateBriefing(),
      rooms,
      doors,
      playerSpawn,
      enemies,
      pickups,
      objectives,
      triggers,
      props
    };

    console.log('[LevelGen] Level generated successfully:', level.name);
    return level;
  }

  private resetCounters(): void {
    this.roomIdCounter = 0;
    this.doorIdCounter = 0;
    this.enemyIdCounter = 0;
    this.pickupIdCounter = 0;
    this.objectiveIdCounter = 0;
    this.triggerIdCounter = 0;
    this.propIdCounter = 0;
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(this.rng() * (max - min + 1)) + min;
  }

  private randomChoice<T>(array: T[]): T {
    return array[Math.floor(this.rng() * array.length)];
  }

  private randomFloat(min: number, max: number): number {
    return this.rng() * (max - min) + min;
  }

  private generateRooms(count: number): RoomDef[] {
    const roomTypes = [
      { width: 12, depth: 16, height: 4, name: 'small' },
      { width: 16, depth: 20, height: 4, name: 'medium' },
      { width: 20, depth: 24, height: 4, name: 'large' },
      { width: 14, depth: 14, height: 4, name: 'square' }
    ];

    // Rooms are the foundation of every other rule (doors, keys, accessibility).
    // If we allow overlaps here, downstream rules will frequently fail.
    for (let layoutAttempt = 0; layoutAttempt < 5; layoutAttempt++) {
      const rooms: RoomDef[] = [];
      this.roomIdCounter = 0;
      this.mainPathEdges = [];

      const firstRoomType = roomTypes[0];
      rooms.push(this.createRoom(firstRoomType, 0, 0));

      let ok = true;
      for (let i = 1; i < count; i++) {
        const roomType = this.randomChoice(roomTypes);

        // Try to place this room adjacent to ANY existing room to avoid dead-ends
        let position: { x: number; z: number } | null = null;
        let anchorRoom: RoomDef | null = null;
        for (let attempt = 0; attempt < 30 && !position; attempt++) {
          anchorRoom = this.randomChoice(rooms);
          position = this.findRoomPosition(anchorRoom, roomType, rooms);
        }

        if (!position) {
          ok = false;
          break;
        }

        rooms.push(this.createRoom(roomType, position.x, position.z));
        const newRoom = rooms[rooms.length - 1];
        if (anchorRoom) this.mainPathEdges.push([anchorRoom.id, newRoom.id]);
      }

      if (ok) return rooms;
    }

    throw new Error('[LevelGen] Failed to generate non-overlapping rooms after retries');
  }

  private createRoom(type: { width: number; depth: number; height: number }, x: number, z: number): RoomDef {
    const floorColors = [4473941, 4210768, 4535600, 3352388, 3158304, 3487029, 3361587];
    const wallColors = [5592422, 5259872, 5591616, 4473941, 4210768, 4541765, 4483652];

    return {
      id: `room_${this.roomIdCounter++}`,
      x,
      y: 0,
      z,
      width: type.width,
      depth: type.depth,
      height: type.height,
      floorColor: this.randomChoice(floorColors),
      wallColor: this.randomChoice(wallColors)
    };
  }

  private findRoomPosition(previousRoom: RoomDef, newRoomType: { width: number; depth: number }, existingRooms: RoomDef[]): { x: number; z: number } | null {
    const directions = [
      { dx: 0, dz: 1 },  // North
      { dx: 1, dz: 0 },  // East
      { dx: 0, dz: -1 }, // South
      { dx: -1, dz: 0 }  // West
    ];

    const attempts = 40;
    const overlapMargin = 0.05;

    const overlapsExisting = (x: number, z: number): boolean => {
      return existingRooms.some(room => {
        const overlapX = Math.abs(x - room.x) < (newRoomType.width / 2 + room.width / 2 + overlapMargin);
        const overlapZ = Math.abs(z - room.z) < (newRoomType.depth / 2 + room.depth / 2 + overlapMargin);
        return overlapX && overlapZ;
      });
    };

    for (let attempt = 0; attempt < attempts; attempt++) {
      const dir = this.randomChoice(directions);
      const spacing = 0.1; // Minimal spacing - rooms should touch or nearly touch
      
      let x = previousRoom.x;
      let z = previousRoom.z;

      if (dir.dx !== 0) {
        x += dir.dx * (previousRoom.width / 2 + newRoomType.width / 2 + spacing);
      } else {
        z += dir.dz * (previousRoom.depth / 2 + newRoomType.depth / 2 + spacing);
      }

      if (!overlapsExisting(x, z)) return { x, z };
    }

    return null;
  }

  private generateDoors(rooms: RoomDef[]): DoorDef[] {
    const doors: DoorDef[] = [];
    
    console.log(`[LevelGen] Creating main path doors for ${rooms.length} rooms`);

    const doorMinSpacing = 0.2;
    const doorsOverlap = (a: DoorDef, b: DoorDef): boolean => {
      if (a.axis !== b.axis) return false;
      if (a.axis === 'x') {
        const samePlane = Math.abs(a.x - b.x) < 0.5;
        const overlapAlong = Math.abs(a.z - b.z) < ((a.width + b.width) / 2 + doorMinSpacing);
        return samePlane && overlapAlong;
      }
      const samePlane = Math.abs(a.z - b.z) < 0.5;
      const overlapAlong = Math.abs(a.x - b.x) < ((a.width + b.width) / 2 + doorMinSpacing);
      return samePlane && overlapAlong;
    };
    
    // Connect rooms along the actual placement edges - CRITICAL: unlocked main path
    for (let i = 0; i < this.mainPathEdges.length; i++) {
      const [aId, bId] = this.mainPathEdges[i];
      const room1 = rooms.find(r => r.id === aId);
      const room2 = rooms.find(r => r.id === bId);
      if (!room1 || !room2) continue;

      console.log(`[LevelGen] Creating main path door ${i} between ${room1.id} and ${room2.id} with forceLocked=false`);

      let door: DoorDef | null = null;
      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = this.createDoorBetweenRooms(room1, room2, false); // NEVER lock main path
        const overlapsExisting = doors.some(d => doorsOverlap(d, candidate));
        if (!overlapsExisting) {
          door = candidate;
          break;
        }
      }

      if (!door) {
        // Fallback: accept last candidate even if overlap; validation will catch it.
        door = this.createDoorBetweenRooms(room1, room2, false);
      }

      doors.push(door);
      console.log(`[LevelGen] Main path door: ${door.id} between ${room1.id} and ${room2.id} (UNLOCKED) type=${door.type}`);
    }

    // Add some extra doors, most locked for puzzle elements
    const extraDoorCount = Math.floor(rooms.length * 0.4); // Increased from 0.3
    const lockedDoors: DoorDef[] = [];
    
    console.log(`[LevelGen] Creating ${extraDoorCount} extra doors`);
    
    const doorWallTolerance = 2;
    const doorMaxPerWall = 2;

    const doorWallKey = (room: RoomDef, d: DoorDef): 'south' | 'north' | 'west' | 'east' | null => {
      const hw = room.width / 2;
      const hd = room.depth / 2;
      const onSouth = Math.abs(d.z - (room.z - hd)) <= doorWallTolerance && Math.abs(d.x - room.x) <= hw + 1;
      if (onSouth) return 'south';
      const onNorth = Math.abs(d.z - (room.z + hd)) <= doorWallTolerance && Math.abs(d.x - room.x) <= hw + 1;
      if (onNorth) return 'north';
      const onWest = Math.abs(d.x - (room.x - hw)) <= doorWallTolerance && Math.abs(d.z - room.z) <= hd + 1;
      if (onWest) return 'west';
      const onEast = Math.abs(d.x - (room.x + hw)) <= doorWallTolerance && Math.abs(d.z - room.z) <= hd + 1;
      if (onEast) return 'east';
      return null;
    };

    const wouldExceedPerWall = (room: RoomDef, candidate: DoorDef): boolean => {
      const key = doorWallKey(room, candidate);
      if (!key) return false;
      let count = 0;
      for (const d of doors) {
        const k = doorWallKey(room, d);
        if (k === key) count++;
      }
      return count + 1 > doorMaxPerWall;
    };

    const mainPathEdgeSet = new Set(this.mainPathEdges.map(([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`)));

    for (let i = 0; i < extraDoorCount; i++) {
      let placed = false;
      for (let attempt = 0; attempt < 10 && !placed; attempt++) {
        const room1 = this.randomChoice(rooms);
        const room2 = this.randomChoice(rooms.filter(r => r.id !== room1.id));

        const edgeKey = room1.id < room2.id ? `${room1.id}|${room2.id}` : `${room2.id}|${room1.id}`;
        if (mainPathEdgeSet.has(edgeKey)) {
          continue;
        }

        const isLocked = this.rng() < 0.8;
        console.log(`[LevelGen] Creating extra door ${i} between ${room1.id} and ${room2.id} with forceLocked=${isLocked}`);
        const door = this.createDoorBetweenRooms(room1, room2, isLocked);

        const overlapsExisting = doors.some(d => doorsOverlap(d, door));
        const exceedsWall1 = wouldExceedPerWall(room1, door);
        const exceedsWall2 = wouldExceedPerWall(room2, door);
        if (overlapsExisting || exceedsWall1 || exceedsWall2) {
          continue;
        }
      
        console.log(`[LevelGen] Extra door: ${door.id} between ${room1.id} and ${room2.id} (${isLocked ? 'LOCKED' : 'UNLOCKED'}) type=${door.type}`);
        
        if (isLocked) {
          lockedDoors.push(door);
        }
        doors.push(door);
        placed = true;
      }
    }

    // Store locked doors for key placement
    this.lockedDoors = lockedDoors;
    console.log(`[LevelGen] Door generation complete. Total doors: ${doors.length}, Locked doors: ${lockedDoors.length}`);
    return doors;
  }

  private createDoorBetweenRooms(room1: RoomDef, room2: RoomDef, forceLocked = false): DoorDef {
    console.log(`[LevelGen] createDoorBetweenRooms called with forceLocked=${forceLocked} for ${room1.id} -> ${room2.id}`);
    
    const dx = room2.x - room1.x;
    const dz = room2.z - room1.z;
    
    let x: number;
    let z: number;
    let axis: 'x' | 'z';
    
    if (Math.abs(dx) > Math.abs(dz)) {
      // Rooms are aligned horizontally - place door at the exact wall boundary
      if (dx > 0) {
        // room2 is to the right of room1
        x = room1.x + room1.width / 2; // Right wall of room1
      } else {
        // room2 is to the left of room1
        x = room1.x - room1.width / 2; // Left wall of room1
      }
      z = room1.z + this.randomInt(-room1.depth / 6, room1.depth / 6); // More conservative placement
      axis = 'x';
    } else {
      // Rooms are aligned vertically - place door at the exact wall boundary
      if (dz > 0) {
        // room2 is in front of room1
        z = room1.z + room1.depth / 2; // Front wall of room1
      } else {
        // room2 is behind room1
        z = room1.z - room1.depth / 2; // Back wall of room1
      }
      x = room1.x + this.randomInt(-room1.width / 6, room1.width / 6); // More conservative placement
      axis = 'z';
    }

    const isLocked = forceLocked ? (this.rng() < 0.8) : false; // Only lock if forceLocked is true, then 80% chance
    console.log(`[LevelGen] Door lock calculation: forceLocked=${forceLocked} -> isLocked=${isLocked}`);
    
    const door: DoorDef = {
      id: `door_${this.doorIdCounter++}`,
      x,
      y: 0,
      z,
      width: 2.5,
      height: 3,
      axis,
      type: isLocked ? 'locked' : 'proximity',
      proximityRadius: 2.5
    };

    if (isLocked) {
      door.keyId = this.randomChoice(['red', 'blue', 'green']);
      console.log(`[LevelGen] Door ${door.id} assigned keyId: ${door.keyId}`);
    }

    console.log(`[LevelGen] Created door ${door.id} at (${x.toFixed(1)}, ${z.toFixed(1)}) axis=${axis} locked=${isLocked} type=${door.type} between ${room1.id} and ${room2.id}`);
    return door;
  }

  private generatePlayerSpawn(firstRoom: RoomDef): { x: number; y: number; z: number } {
    return {
      x: firstRoom.x,
      y: -2,
      z: firstRoom.z - firstRoom.depth / 4
    };
  }

  private generateEnemies(rooms: RoomDef[], count: number): EnemySpawnDef[] {
    const enemies: EnemySpawnDef[] = [];
    const variants = ['guard', 'soldier', 'officer'];

    const nonSpawnRooms = rooms.slice(1);
    const targetCount = Math.max(count, nonSpawnRooms.length);

    // Guarantee at least one enemy per room (excluding spawn room)
    for (const room of nonSpawnRooms) {
      const hasPatrol = this.rng() < 0.4;
      const enemy: EnemySpawnDef = {
        x: room.x + this.randomInt(-room.width / 3, room.width / 3),
        y: -2,
        z: room.z + this.randomInt(-room.depth / 3, room.depth / 3),
        facingAngle: this.randomFloat(0, Math.PI * 2),
        variant: this.randomChoice(variants)
      };

      if (hasPatrol) {
        enemy.waypoints = [
          { x: room.x + this.randomInt(-room.width / 3, room.width / 3), z: room.z + this.randomInt(-room.depth / 3, room.depth / 3) },
          { x: room.x + this.randomInt(-room.width / 3, room.width / 3), z: room.z + this.randomInt(-room.depth / 3, room.depth / 3) }
        ];
      }

      enemies.push(enemy);
    }

    // Add extra enemies beyond the per-room minimum
    for (let i = enemies.length; i < targetCount; i++) {
      const room = this.randomChoice(nonSpawnRooms);
      const hasPatrol = this.rng() < 0.4;

      const enemy: EnemySpawnDef = {
        x: room.x + this.randomInt(-room.width / 3, room.width / 3),
        y: -2,
        z: room.z + this.randomInt(-room.depth / 3, room.depth / 3),
        facingAngle: this.randomFloat(0, Math.PI * 2),
        variant: this.randomChoice(variants)
      };

      if (hasPatrol) {
        enemy.waypoints = [
          { x: room.x + this.randomInt(-room.width / 3, room.width / 3), z: room.z + this.randomInt(-room.depth / 3, room.depth / 3) },
          { x: room.x + this.randomInt(-room.width / 3, room.width / 3), z: room.z + this.randomInt(-room.depth / 3, room.depth / 3) }
        ];
      }

      enemies.push(enemy);
    }

    return enemies;
  }

  private generatePickups(rooms: RoomDef[], doors: DoorDef[], accessibleRooms: RoomDef[]): PickupSpawnDef[] {
    const pickups: PickupSpawnDef[] = [];
    
    console.log('[LevelGen] Placing pickups. Accessible rooms:', accessibleRooms.map(r => r.id));
    
    // CRITICAL: Place keys for locked doors in accessible rooms
    // Keys must be placed in rooms that are reachable from the spawn without passing through locked doors
    this.lockedDoors.forEach(door => {
      if (door.keyId) {
        console.log('[LevelGen] Placing key for door:', door.id, 'with keyId:', door.keyId);
        
        // Place key in a random accessible room (not the room containing the door itself)
        const availableRooms = accessibleRooms.filter(room => 
          !this.isDoorInRoom(door, room) && room.id !== rooms[0].id // Not spawn room
        );
        
        console.log('[LevelGen] Available rooms for key:', availableRooms.map(r => r.id));
        
        if (availableRooms.length > 0) {
          const keyRoom = this.randomChoice(availableRooms);
          console.log('[LevelGen] Placing key in room:', keyRoom.id);
          
          pickups.push({
            type: 'key',
            x: keyRoom.x + this.randomInt(-keyRoom.width / 4, keyRoom.width / 4),
            y: -2,
            z: keyRoom.z + this.randomInt(-keyRoom.depth / 4, keyRoom.depth / 4),
            keyId: door.keyId!
          });
        } else {
          console.error('[LevelGen] NO AVAILABLE ROOMS FOR KEY:', door.keyId);
        }
      }
    });

    // REDUCE obvious pickups - most items should be in props
    // GUARANTEE at least one weapon in accessible area
    const weaponCount = this.randomInt(1, 2); // Always 1-2 weapons
    for (let i = 0; i < weaponCount; i++) {
      const room = this.randomChoice(accessibleRooms.slice(1)); // Not spawn room
      console.log(`[LevelGen] Placing guaranteed weapon in room: ${room.id}`);
      pickups.push({
        type: this.randomChoice(['weapon-pistol', 'weapon-rifle']),
        x: room.x + this.randomInt(-room.width / 4, room.width / 4),
        y: -2,
        z: room.z + this.randomInt(-room.depth / 4, room.depth / 4),
        amount: 1
      });
    }

    // Very few ammo pickups - most should come from destroying props
    const ammoCount = this.randomInt(0, 2); // 0-2 ammo pickups instead of 2-5
    for (let i = 0; i < ammoCount; i++) {
      const room = this.randomChoice(accessibleRooms);
      pickups.push({
        type: this.randomChoice(['ammo-pistol', 'ammo-rifle']),
        x: room.x + this.randomInt(-room.width / 4, room.width / 4),
        y: -2,
        z: room.z + this.randomInt(-room.depth / 4, room.depth / 4),
        amount: this.randomInt(15, 30)
      });
    }

    // Very few health pickups - encourage exploration of props
    const healthCount = this.randomInt(0, 1); // 0-1 health pickup instead of 1-3
    if (healthCount > 0) {
      const room = this.randomChoice(accessibleRooms);
      pickups.push({
        type: this.randomChoice(['health', 'armor']),
        x: room.x + this.randomInt(-room.width / 4, room.width / 4),
        y: -2,
        z: room.z + this.randomInt(-room.depth / 4, room.depth / 4),
        amount: this.randomInt(20, 50)
      });
    }

    // Rule: ensure some visible pickups exist in rooms (not only inside props)
    const isVisibleNonKey = (t: string): boolean => t === 'health' || t === 'armor' || t.startsWith('ammo-');
    const minVisibleNonKey = 2;
    let visibleNonKeyCount = pickups.filter(p => isVisibleNonKey(p.type)).length;
    const placeInRooms = accessibleRooms.length > 1 ? accessibleRooms.slice(1) : accessibleRooms;
    while (visibleNonKeyCount < minVisibleNonKey && placeInRooms.length > 0) {
      const room = this.randomChoice(placeInRooms);
      pickups.push({
        type: this.randomChoice(['ammo-pistol', 'ammo-rifle', 'health', 'armor']),
        x: room.x + this.randomInt(-room.width / 4, room.width / 4),
        y: -2,
        z: room.z + this.randomInt(-room.depth / 4, room.depth / 4),
        amount: this.randomInt(12, 30)
      });
      visibleNonKeyCount++;
    }

    return pickups;
  }

  private getAccessibleRooms(rooms: RoomDef[], doors: DoorDef[]): RoomDef[] {
    const accessible = new Set<string>();
    const toVisit: string[] = [rooms[0].id]; // Start from spawn room
    accessible.add(rooms[0].id);

    while (toVisit.length > 0) {
      const currentRoomId = toVisit.pop()!;
      const currentRoom = rooms.find(r => r.id === currentRoomId)!;
      
      // Find all doors that connect to this room
      doors.forEach(door => {
        if (door.type === 'proximity') { // Only unlocked doors
          const connectedRoom = this.getConnectedRoom(currentRoom, door, rooms);
          if (connectedRoom && !accessible.has(connectedRoom.id)) {
            accessible.add(connectedRoom.id);
            toVisit.push(connectedRoom.id);
          }
        }
      });
    }

    const accessibleRooms = rooms.filter(room => accessible.has(room.id));
    const inaccessibleRooms = rooms.filter(room => !accessible.has(room.id));
    
    if (inaccessibleRooms.length > 0) {
      console.log('[LevelGen] Inaccessible rooms found:', inaccessibleRooms.map(r => r.id));
    }
    
    return accessibleRooms;
  }

  private getConnectedRoom(currentRoom: RoomDef, door: DoorDef, rooms: RoomDef[]): RoomDef | null {
    // Find which room this door connects to (other than currentRoom)
    // Use the same tolerant connectivity check used by validation.
    for (const room of rooms) {
      if (room.id === currentRoom.id) continue;
      if (this.isDoorConnectedTo(door, room) && this.isDoorConnectedTo(door, currentRoom)) {
        console.log(`[LevelGen] Door ${door.id} connects to room ${room.id}`);
        return room;
      }
    }

    console.log(`[LevelGen] Door ${door.id} does not connect to any room from ${currentRoom.id}`);
    return null;
  }

  private isDoorInRoom(door: DoorDef, room: RoomDef): boolean {
    const dx = Math.abs(room.x - door.x);
    const dz = Math.abs(room.z - door.z);
    return dx <= room.width / 2 && dz <= room.depth / 2;
  }

  private generateObjectives(): ObjectiveDef[] {
    return [
      { id: `obj_${this.objectiveIdCounter++}`, title: 'Eliminate all hostiles' },
      { id: `obj_${this.objectiveIdCounter++}`, title: 'Secure intelligence documents' },
      { id: `obj_${this.objectiveIdCounter++}`, title: 'Reach extraction point' }
    ];
  }

  private generateTriggers(rooms: RoomDef[], objectives: ObjectiveDef[]): TriggerDef[] {
    const triggers: TriggerDef[] = [];
    const lastRoom = rooms[rooms.length - 1];

    // Trigger for securing intel (middle room)
    const middleRoom = rooms[Math.floor(rooms.length / 2)];
    triggers.push({
      id: `trigger_${this.triggerIdCounter++}`,
      x: middleRoom.x,
      y: -0.5,
      z: middleRoom.z,
      halfWidth: 2,
      halfDepth: 2,
      halfHeight: 1.5,
      onEnter: `objective:complete:${objectives[1].id}`,
      once: true
    });

    // Extraction trigger (last room)
    triggers.push({
      id: `trigger_${this.triggerIdCounter++}`,
      x: lastRoom.x,
      y: -0.5,
      z: lastRoom.z,
      halfWidth: 3,
      halfDepth: 2,
      halfHeight: 1.5,
      onEnter: 'mission:complete',
      once: true
    });

    return triggers;
  }

  private generateProps(rooms: RoomDef[]): PropDef[] {
    const props: PropDef[] = [];
    
    // Increase prop count for better room coverage - base on room size
    const basePropCount = rooms.length * 4; // 4 props per room average (up from 2)
    const propCount = this.randomInt(basePropCount, basePropCount + Math.floor(rooms.length * 1.5));
    
    // Track occupied positions to prevent overlapping - includes height for stacking
    const occupiedPositions: { x: number; z: number; radius: number; y: number }[] = [];
    
    for (let i = 0; i < propCount; i++) {
      const room = this.randomChoice(rooms);
      
      // Try to find a non-overlapping position
      let attempts = 0;
      let validPosition = false;
      let x = 0, z = 0;
      
      while (!validPosition && attempts < 15) {
        x = room.x + this.randomInt(-room.width / 2.5, room.width / 2.5);
        z = room.z + this.randomInt(-room.depth / 2.5, room.depth / 2.5);
        
        // Check if position overlaps with existing props (including height)
        const radius = 0.8; // Approximate prop radius
        validPosition = !occupiedPositions.some(pos => {
          const distance = Math.sqrt((pos.x - x) ** 2 + (pos.z - z) ** 2);
          return distance < (pos.radius + radius);
        });
        
        attempts++;
      }
      
      if (!validPosition) {
        console.log(`[LevelGen] Could not find valid position for prop in room ${room.id} after 15 attempts`);
        continue; // Skip this prop
      }
      
      // Keep loot frequency at 30% for balance
      const hasLoot = this.rng() < 0.3;
      
      // Enhanced stacking patterns
      const stackingPattern = this.randomChoice([
        'none',           // 25% - no stacking
        'single',         // 25% - single stack
        'double',         // 25% - double stack
        'pyramid',        // 15% - pyramid arrangement
        'cluster'         // 10% - small cluster
      ]);

      const scale = this.randomFloat(0.7, 1.2);
      
      const prop: PropDef = {
        type: this.randomChoice(['crate', 'barrel', 'crate_metal']),
        x,
        y: -2,
        z,
        scale
      };

      if (prop.type === 'crate' || prop.type === 'crate_metal') {
        prop.rotY = this.randomFloat(-0.35, 0.35);
      }

      if (hasLoot) {
        const lootTypes = [
          'ammo-pistol', 'ammo-rifle', 'health', 'armor',
          'weapon-pistol', 'weapon-rifle'
        ];
        prop.loot = {
          type: this.randomChoice(lootTypes),
          amount: this.randomInt(10, 30)
        };
      }

      // Add position to occupied list with height
      occupiedPositions.push({ x, z, radius: 0.8 * scale, y: -2 });
      props.push(prop);
      
      // Create stacking arrangements based on pattern
      if (stackingPattern === 'single') {
        // Single stack - one prop on top
        this.createSingleStack(props, occupiedPositions, x, z, scale);
      } else if (stackingPattern === 'double') {
        // Double stack - two props on top
        this.createDoubleStack(props, occupiedPositions, x, z, scale);
      } else if (stackingPattern === 'pyramid') {
        // Pyramid arrangement - 3 props in pyramid shape
        this.createPyramid(props, occupiedPositions, x, z, scale);
      } else if (stackingPattern === 'cluster') {
        // Small cluster - 2-3 props grouped together
        this.createCluster(props, occupiedPositions, room, x, z, scale);
      }
    }

    console.log(`[LevelGen] Generated ${props.length} props with varied stacking patterns`);
    return props;
  }

  private createSingleStack(props: PropDef[], occupiedPositions: { x: number; z: number; radius: number; y: number }[], x: number, z: number, baseScale: number): void {
    const bottomProp = props[props.length - 1];
    if (bottomProp.type === 'crate' || bottomProp.type === 'crate_metal') {
      const offsetX = this.randomFloat(-0.6, 0.6);
      const offsetZ = this.randomFloat(-0.6, 0.6);

      // Calculate stacked prop position to ensure it touches the prop below
      const stackedProp: PropDef = {
        type: this.randomChoice(['crate', 'crate_metal']),
        x: x + offsetX,
        y: -2 + (baseScale * 1.0), // Position on top of bottom prop (assuming 1 unit height)
        z: z + offsetZ,
        scale: this.randomFloat(0.6, 0.9)
      };

      stackedProp.rotY = this.randomFloat(-0.45, 0.45);
      
      if (this.rng() < 0.1) {
        stackedProp.loot = {
          type: this.randomChoice(['ammo-pistol', 'ammo-rifle']),
          amount: this.randomInt(5, 15)
        };
      }
      
      const stackedScale = stackedProp.scale || 0.8;
      const stackedRadius = 0.8 * stackedScale;
      const canPlace = !occupiedPositions.some(pos => {
        if (Math.abs(pos.y - stackedProp.y) > 0.2) return false;
        const distance = Math.sqrt((pos.x - stackedProp.x) ** 2 + (pos.z - stackedProp.z) ** 2);
        return distance < (pos.radius + stackedRadius - 0.05);
      });

      if (canPlace) {
        occupiedPositions.push({ x: stackedProp.x, z: stackedProp.z, radius: stackedRadius, y: stackedProp.y });
        props.push(stackedProp);
      }
    }
  }

  private createDoubleStack(props: PropDef[], occupiedPositions: { x: number; z: number; radius: number; y: number }[], x: number, z: number, baseScale: number): void {
    const bottomProp = props[props.length - 1];
    if (bottomProp.type === 'crate' || bottomProp.type === 'crate_metal') {
      const stackHeight = baseScale * 1.0; // Height of bottom prop
      
      const scale1 = this.randomFloat(0.5, 0.8);
      const scale2 = this.randomFloat(0.5, 0.8);
      const r1 = 0.8 * scale1;
      const r2 = 0.8 * scale2;
      const separation = r1 + r2 + 0.1;

      // Make stacks look off-balance: shift the pair a bit and add slight Z spread
      const wobbleX = this.randomFloat(-0.35, 0.35);
      const wobbleZ = this.randomFloat(-0.35, 0.35);
      const zSpread = this.randomFloat(0.15, 0.45);

      // First stacked prop - positioned to touch bottom prop
      const stackedProp1: PropDef = {
        type: this.randomChoice(['crate', 'crate_metal']),
        x: x + wobbleX - separation / 2,
        y: -2 + stackHeight, // On top of bottom prop
        z: z + wobbleZ - zSpread / 2,
        scale: scale1
      };

      stackedProp1.rotY = this.randomFloat(-0.45, 0.45);
      
      // Second stacked prop - positioned to touch bottom prop
      const stackedProp2: PropDef = {
        type: this.randomChoice(['crate', 'crate_metal']),
        x: x + wobbleX + separation / 2,
        y: -2 + stackHeight, // On top of bottom prop
        z: z + wobbleZ + zSpread / 2,
        scale: scale2
      };

      stackedProp2.rotY = this.randomFloat(-0.45, 0.45);

      const canPlace1 = !occupiedPositions.some(pos => {
        if (Math.abs(pos.y - stackedProp1.y) > 0.2) return false;
        const distance = Math.sqrt((pos.x - stackedProp1.x) ** 2 + (pos.z - stackedProp1.z) ** 2);
        return distance < (pos.radius + r1 - 0.05);
      });
      const canPlace2 = !occupiedPositions.some(pos => {
        if (Math.abs(pos.y - stackedProp2.y) > 0.2) return false;
        const distance = Math.sqrt((pos.x - stackedProp2.x) ** 2 + (pos.z - stackedProp2.z) ** 2);
        return distance < (pos.radius + r2 - 0.05);
      });
      const pairDistance = Math.sqrt((stackedProp1.x - stackedProp2.x) ** 2 + (stackedProp1.z - stackedProp2.z) ** 2);
      const pairOk = pairDistance >= (r1 + r2 - 0.05);

      if (canPlace1 && canPlace2 && pairOk) {
        occupiedPositions.push({ x: stackedProp1.x, z: stackedProp1.z, radius: r1, y: stackedProp1.y });
        occupiedPositions.push({ x: stackedProp2.x, z: stackedProp2.z, radius: r2, y: stackedProp2.y });
        props.push(stackedProp1, stackedProp2);
      }
    }
  }

  private createPyramid(props: PropDef[], occupiedPositions: { x: number; z: number; radius: number; y: number }[], x: number, z: number, baseScale: number): void {
    const bottomProp = props[props.length - 1];
    if (bottomProp.type === 'crate' || bottomProp.type === 'crate_metal') {
      const bottomHeight = baseScale * 1.0; // Height of bottom prop

      // Off-balance offsets (kept within support tolerance)
      const midOffsetX = this.randomFloat(-0.45, 0.45);
      const midOffsetZ = this.randomFloat(-0.45, 0.45);
      const topOffsetX = midOffsetX + this.randomFloat(-0.25, 0.25);
      const topOffsetZ = midOffsetZ + this.randomFloat(-0.25, 0.25);
      
      // Second level - one prop centered, touching bottom prop
      const midScale = this.randomFloat(0.6, 0.8);
      const midProp: PropDef = {
        type: this.randomChoice(['crate', 'crate_metal']),
        x: x + midOffsetX,
        y: -2 + bottomHeight, // On top of bottom prop
        z: z + midOffsetZ,
        scale: midScale
      };

      midProp.rotY = this.randomFloat(-0.4, 0.4);
      
      // Third level - one prop smaller, touching middle prop
      const midHeight = midScale * 1.0; // Height of middle prop
      const topProp: PropDef = {
        type: 'crate_metal', // Always metal for top
        x: x + topOffsetX,
        y: -2 + bottomHeight + midHeight, // On top of middle prop
        z: z + topOffsetZ,
        scale: this.randomFloat(0.4, 0.6)
      };

      topProp.rotY = this.randomFloat(-0.4, 0.4);
      
      occupiedPositions.push({ x: midProp.x, z: midProp.z, radius: 0.8 * midScale, y: midProp.y });
      occupiedPositions.push({ x: topProp.x, z: topProp.z, radius: 0.8 * (topProp.scale || 0.5), y: topProp.y });
      props.push(midProp, topProp);
    }
  }

  private createCluster(props: PropDef[], occupiedPositions: { x: number; z: number; radius: number; y: number }[], room: RoomDef, x: number, z: number, baseScale: number): void {
    const clusterSize = this.randomInt(2, 3); // 2-3 props in cluster
    const clusterRadius = 1.5;
    
    for (let i = 0; i < clusterSize; i++) {
      const angle = (Math.PI * 2 * i) / clusterSize;
      const clusterX = x + Math.cos(angle) * clusterRadius;
      const clusterZ = z + Math.sin(angle) * clusterRadius;
      
      // Check if cluster position is valid
      const validPosition = !occupiedPositions.some(pos => {
        const distance = Math.sqrt((pos.x - clusterX) ** 2 + (pos.z - clusterZ) ** 2);
        return distance < (pos.radius + 0.8);
      });
      
      if (validPosition) {
        const clusterProp: PropDef = {
          type: this.randomChoice(['crate', 'barrel', 'crate_metal']),
          x: clusterX,
          y: -2,
          z: clusterZ,
          scale: this.randomFloat(0.7, 1.1)
        };
        
        if (this.rng() < 0.2) { // 20% chance for loot in cluster props
          clusterProp.loot = {
            type: this.randomChoice(['ammo-pistol', 'ammo-rifle', 'health']),
            amount: this.randomInt(8, 20)
          };
        }
        
        const clusterScale = clusterProp.scale || 0.9;
        occupiedPositions.push({ x: clusterProp.x, z: clusterProp.z, radius: 0.8 * clusterScale, y: -2 });
        props.push(clusterProp);
      }
    }
  }

  private generateLevelName(): string {
    const prefixes = ['Operation', 'Mission', 'Exercise', 'Protocol'];
    const codenames = ['Nightfall', 'Thunderbolt', 'Shadow', 'Viper', 'Eagle', 'Phantom', 'Storm', 'Blade'];
    const suffixes = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'];
    
    return `${this.randomChoice(prefixes)} ${this.randomChoice(codenames)} ${this.randomChoice(suffixes)}`;
  }

  private generateBriefing(): string {
    const objectives = [
      'Infiltrate the compound and eliminate all resistance.',
      'Secure classified documents from the main facility.',
      'Locate and extract the target package.',
      'Neutralize the enemy command structure.',
      'Recover stolen intelligence data.'
    ];

    const complications = [
      'Expect heavy resistance.',
      'The facility is heavily guarded.',
      'Enemy patrols are active in the area.',
      'Security systems are online.',
      'Multiple hostiles reported in the area.'
    ];

    const endings = [
      'Good luck, 007.',
      'Mission success is paramount.',
      'Complete the objective at all costs.',
      'Return with the intelligence.',
      'Extraction is waiting at the designated point.'
    ];

    return `${this.randomChoice(objectives)} ${this.randomChoice(complications)} ${this.randomChoice(endings)}`;
  }

  private validateLevel(rooms: RoomDef[], doors: DoorDef[], pickups: PickupSpawnDef[], props: PropDef[], accessibleRooms: RoomDef[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    console.log('[LevelGen] Starting validation...');

    const doorWallTolerance = 2;
    const doorMinSpacing = 0.2;
    const doorMaxPerWall = 2;
    const propRadiusBase = 0.8;
    const propTouchTolerance = 0.25;
    const propSupportMaxHorizontal = 1.25;

    // Rule 1: Main path doors must not be locked
    for (let i = 0; i < this.mainPathEdges.length; i++) {
      const [aId, bId] = this.mainPathEdges[i];
      const room1 = rooms.find(r => r.id === aId);
      const room2 = rooms.find(r => r.id === bId);
      if (!room1 || !room2) continue;

      const connectingDoors = doors.filter(d => this.isDoorBetweenRooms(d, room1, room2));

      // IMPORTANT: Extra doors may also exist between these rooms and may be locked.
      // Rule 1 is satisfied as long as there is at least one unlocked (proximity) door
      // connecting each sequential pair.
      const hasUnlockedMainPathConnection = connectingDoors.some(d => d.type === 'proximity');
      if (!hasUnlockedMainPathConnection) {
        const doorIds = connectingDoors.map(d => `${d.id}:${d.type}`).join(', ') || 'none';
        errors.push(`No unlocked main path door connects ${room1.id} -> ${room2.id} (doors=${doorIds}) (violates Rule 1)`);
      }
    }

    // Rule 2: Every locked door must have an accessible key
    this.lockedDoors.forEach(door => {
      if (door.keyId) {
        const keyPickup = pickups.find(p => p.type === 'key' && p.keyId === door.keyId);
        if (!keyPickup) {
          errors.push(`Locked door ${door.id} has no key pickup (violates Rule 2)`);
        } else {
          // Check if key is in accessible room
          const keyRoom = rooms.find(r => 
            Math.abs(r.x - keyPickup.x) < r.width / 2 && 
            Math.abs(r.z - keyPickup.z) < r.depth / 2
          );
          if (!keyRoom || !accessibleRooms.find(ar => ar.id === keyRoom!.id)) {
            errors.push(`Key for door ${door.id} is in inaccessible room (violates Rule 2)`);
          }
          // Check if key is in same room as door
          if (keyRoom && this.isDoorInRoom(door, keyRoom)) {
            errors.push(`Key for door ${door.id} is in same room as door (violates Rule 2)`);
          }
          // Check if key is in spawn room
          if (keyRoom && keyRoom.id === rooms[0].id) {
            errors.push(`Key for door ${door.id} is in spawn room (violates Rule 2)`);
          }
        }
      }
    });

    // Rule 3: Room connectivity check
    if (accessibleRooms.length < rooms.length) {
      const inaccessibleRoomIds = rooms.filter(r => !accessibleRooms.find(ar => ar.id === r.id)).map(r => r.id);
      errors.push(`Rooms inaccessible via unlocked doors: ${inaccessibleRoomIds.join(', ')} (violates Rule 3)`);
    }

    // Rule 4: At least one weapon should be accessible
    const weaponPickups = pickups.filter(p => p.type.startsWith('weapon-'));
    const accessibleWeapons = weaponPickups.filter(p => {
      const room = rooms.find(r => 
        Math.abs(r.x - p.x) < r.width / 2 && 
        Math.abs(r.z - p.z) < r.depth / 2
      );
      return room && accessibleRooms.find(ar => ar.id === room!.id);
    });
    
    if (accessibleWeapons.length === 0) {
      errors.push('No accessible weapons found (violates Rule 4)');
    }

    // Rule: ensure some visible non-key pickups exist (ammo/health/armor)
    const isVisibleNonKey = (t: string): boolean => t === 'health' || t === 'armor' || t.startsWith('ammo-');
    const visibleNonKey = pickups.filter(p => isVisibleNonKey(p.type));
    const visibleNonKeyInAccessibleRooms = visibleNonKey.filter(p => {
      const room = rooms.find(r =>
        Math.abs(r.x - p.x) < r.width / 2 &&
        Math.abs(r.z - p.z) < r.depth / 2
      );
      return room && accessibleRooms.some(ar => ar.id === room.id);
    });
    if (visibleNonKeyInAccessibleRooms.length < 2) {
      errors.push('Too few visible non-key pickups in accessible rooms (violates visible pickup rule)');
    }

    // Rule: Rooms must not overlap
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i];
        const b = rooms[j];
        const overlapX = Math.abs(a.x - b.x) < (a.width / 2 + b.width / 2);
        const overlapZ = Math.abs(a.z - b.z) < (a.depth / 2 + b.depth / 2);
        if (overlapX && overlapZ) {
          errors.push(`Rooms ${a.id} and ${b.id} overlap (violates room overlap rule)`);
        }
      }
    }

    // Rule: Doors must not overlap (global)
    for (let i = 0; i < doors.length; i++) {
      for (let j = i + 1; j < doors.length; j++) {
        const a = doors[i];
        const b = doors[j];
        if (a.axis !== b.axis) continue;
        if (a.axis === 'x') {
          const samePlane = Math.abs(a.x - b.x) < 0.5;
          const overlapAlong = Math.abs(a.z - b.z) < ((a.width + b.width) / 2 + doorMinSpacing);
          if (samePlane && overlapAlong) {
            errors.push(`Doors ${a.id} and ${b.id} overlap (violates door overlap rule)`);
          }
        } else {
          const samePlane = Math.abs(a.z - b.z) < 0.5;
          const overlapAlong = Math.abs(a.x - b.x) < ((a.width + b.width) / 2 + doorMinSpacing);
          if (samePlane && overlapAlong) {
            errors.push(`Doors ${a.id} and ${b.id} overlap (violates door overlap rule)`);
          }
        }
      }
    }

    // Rule: No more than 2 doors per wall (per room)
    for (const room of rooms) {
      const hw = room.width / 2;
      const hd = room.depth / 2;
      const walls: Record<'south' | 'north' | 'west' | 'east', DoorDef[]> = {
        south: [],
        north: [],
        west: [],
        east: [],
      };

      for (const d of doors) {
        const onSouth = Math.abs(d.z - (room.z - hd)) <= doorWallTolerance && Math.abs(d.x - room.x) <= hw + 1;
        const onNorth = Math.abs(d.z - (room.z + hd)) <= doorWallTolerance && Math.abs(d.x - room.x) <= hw + 1;
        const onWest = Math.abs(d.x - (room.x - hw)) <= doorWallTolerance && Math.abs(d.z - room.z) <= hd + 1;
        const onEast = Math.abs(d.x - (room.x + hw)) <= doorWallTolerance && Math.abs(d.z - room.z) <= hd + 1;

        if (onSouth) walls.south.push(d);
        if (onNorth) walls.north.push(d);
        if (onWest) walls.west.push(d);
        if (onEast) walls.east.push(d);
      }

      (Object.keys(walls) as (keyof typeof walls)[]).forEach(wall => {
        if (walls[wall].length > doorMaxPerWall) {
          errors.push(`Room ${room.id} has ${walls[wall].length} doors on ${wall} wall (violates max doors per wall)`);
        }
      });
    }

    // Rule: Props must not overlap (including between stacked levels)
    for (let i = 0; i < props.length; i++) {
      for (let j = i + 1; j < props.length; j++) {
        const a = props[i];
        const b = props[j];
        const aScale = a.scale ?? 1;
        const bScale = b.scale ?? 1;
        const aR = propRadiusBase * aScale;
        const bR = propRadiusBase * bScale;
        const dx = a.x - b.x;
        const dz = a.z - b.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist >= (aR + bR - 0.05)) continue;

        const aH = aScale * 1.0;
        const bH = bScale * 1.0;
        const aMinY = a.y;
        const aMaxY = a.y + aH;
        const bMinY = b.y;
        const bMaxY = b.y + bH;
        const verticalOverlap = aMinY < bMaxY && bMinY < aMaxY;
        if (verticalOverlap) {
          errors.push(`Props overlap: ${a.type} at (${a.x.toFixed(1)},${a.y.toFixed(1)},${a.z.toFixed(1)}) and ${b.type} at (${b.x.toFixed(1)},${b.y.toFixed(1)},${b.z.toFixed(1)}) (violates prop overlap rule)`);
        }
      }
    }

    // Rule: Stacked props must be supported and touching (no floating)
    for (const p of props) {
      if (p.y <= -2 + propTouchTolerance) continue;

      const pScale = p.scale ?? 1;
      const expectedSupportTypes = new Set(['crate', 'crate_metal']);
      const support = props.find(other => {
        if (!expectedSupportTypes.has(other.type)) return false;
        const otherScale = other.scale ?? 1;
        const topY = other.y + otherScale * 1.0;
        const dx = other.x - p.x;
        const dz = other.z - p.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > propSupportMaxHorizontal) return false;
        return Math.abs(topY - p.y) <= propTouchTolerance;
      });

      if (!support) {
        errors.push(`Stacked prop ${p.type} at (${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}) has no touching support (violates stacking rule)`);
      }
    }

    console.log('[LevelGen] Validation complete. Errors:', errors);
    return {
      valid: errors.length === 0,
      errors
    };
  }

  private isDoorBetweenRooms(door: DoorDef, room1: RoomDef, room2: RoomDef): boolean {
    return this.isDoorConnectedTo(door, room1) && this.isDoorConnectedTo(door, room2);
  }

  private isDoorConnectedTo(door: DoorDef, room: RoomDef): boolean {
    const dx = Math.abs(room.x - door.x);
    const dz = Math.abs(room.z - door.z);
    return (dx <= room.width / 2 && dz <= room.depth / 2 + 2) ||
           (dz <= room.depth / 2 && dx <= room.width / 2 + 2);
  }
}
