import * as THREE from 'three';
import { PhysicsWorld } from '../core/physics-world';
import type { LevelSchema, RoomDef, PropDef, DoorDef } from './level-schema';
import type { NavMesh } from '../navmesh/navmesh';
import { DoorSystem } from './door-system';
import { TriggerSystem } from './trigger-system';
import { ObjectiveSystem } from './objective-system';
import { EnemyManager } from '../enemies/enemy-manager';
import { PickupSystem } from '../levels/pickup-system';
import { DestructibleSystem } from './destructible-system';
import {
  concreteWallTexture,
  floorTileTexture,
  ceilingPanelTexture,
  palaceWallTexture,
  palaceMarbleFloorTexture,
  palaceCeilingTexture,
  palacePaintingTexture,
  wastelandWallTexture,
  wastelandFloorTexture,
  wastelandCeilingTexture,
  woodCrateTexture,
  metalCrateTexture,
  barrelTexture,
  snowGroundTexture,
  mountainWallTexture,
} from './procedural-textures';

const WALL_THICKNESS = 0.2;
/** World units per texture repeat — matches Quick Play (e.g. 20×20 room → repeat 5,5) */
const UNITS_PER_TEXTURE = 4;

export interface LevelBuilderDeps {
  scene: THREE.Scene;
  physics: PhysicsWorld;
  doorSystem: DoorSystem;
  triggerSystem: TriggerSystem;
  objectiveSystem: ObjectiveSystem;
  enemyManager: EnemyManager;
  pickupSystem: PickupSystem;
  destructibleSystem: DestructibleSystem;
  setPlayerPosition: (x: number, y: number, z: number) => void;
  /** Navmesh for AI pathfinding. Built from level schema when provided. */
  navMesh?: NavMesh;
}

/**
 * Build a playable level from schema: geometry, colliders, doors, enemies, pickups, triggers.
 */
export function buildLevel(level: LevelSchema, deps: LevelBuilderDeps): void {
  const {
    scene,
    physics,
    doorSystem,
    triggerSystem,
    objectiveSystem,
    enemyManager,
    pickupSystem,
    setPlayerPosition,
    navMesh,
  } = deps;

  // Lights — ambient + hemisphere, point lights per room
  const hasOutdoor = level.rooms.some((r) => r.outdoor);
  const isPalace = level.theme === 'palace';
  const isWasteland = level.theme === 'wasteland';

  const ambientColor = hasOutdoor ? 0xaaccdd : isWasteland ? 0xc4a882 : 0x8899aa;
  const ambientIntensity = hasOutdoor ? 2.2 : isWasteland ? 1.6 : 1.8;
  const ambient = new THREE.AmbientLight(ambientColor, ambientIntensity);
  scene.add(ambient);

  const hemiSky = hasOutdoor ? 0xeef5ff : isWasteland ? 0xeed8bb : 0xddeeff;
  const hemiGround = hasOutdoor ? 0xccdddd : isWasteland ? 0x554433 : 0x445544;
  const hemiIntensity = hasOutdoor ? 1.1 : isWasteland ? 0.85 : 0.9;
  const hemi = new THREE.HemisphereLight(hemiSky, hemiGround, hemiIntensity);
  scene.add(hemi);

  for (const room of level.rooms) {
    const [lx, ly, lz] = [room.x, room.y + 1.5, room.z];
    const pointLight = new THREE.PointLight(
      room.outdoor ? 0xeeddcc : isWasteland ? 0xccffaa : isPalace ? 0xffefcc : 0xffeedd,
      room.outdoor ? 120 : isWasteland ? 85 : isPalace ? 95 : 80,
      isWasteland ? 22 : 25,
    );
    pointLight.position.set(lx, ly, lz);
    pointLight.castShadow = true;
    pointLight.shadow.mapSize.set(512, 512);
    scene.add(pointLight);
  }

  // Materials — procedural textures
  const floorTex = isWasteland ? wastelandFloorTexture() : isPalace ? palaceMarbleFloorTexture() : floorTileTexture();
  const wallTex = isWasteland ? wastelandWallTexture() : isPalace ? palaceWallTexture() : concreteWallTexture();
  const ceilTex = isWasteland ? wastelandCeilingTexture() : isPalace ? palaceCeilingTexture() : ceilingPanelTexture();
  const snowTex = snowGroundTexture();
  const mountainTex = mountainWallTexture();

  const floorMat = (color = 0x888888, useSnow = false, width = 8, depth = 8) => {
    const tex = (useSnow ? snowTex : floorTex).clone();
    tex.needsUpdate = true;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(
      Math.max(1, width / UNITS_PER_TEXTURE),
      Math.max(1, depth / UNITS_PER_TEXTURE),
    );
    const roughness = useSnow ? 0.9 : isWasteland ? 0.75 : isPalace ? 0.26 : 0.8;
    const metalness = useSnow ? 0.05 : isWasteland ? 0.12 : isPalace ? 0.05 : 0.2;
    return new THREE.MeshStandardMaterial({
      map: tex,
      color,
      roughness,
      metalness,
    });
  };
  const wallMat = (color = 0x999999, useMountain = false, span = 6, wallHeight = 4) => {
    const tex = (useMountain ? mountainTex : wallTex).clone();
    tex.needsUpdate = true;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(
      Math.max(1, span / UNITS_PER_TEXTURE),
      Math.max(1, wallHeight / UNITS_PER_TEXTURE),
    );
    const roughness = useMountain ? 0.85 : isWasteland ? 0.75 : isPalace ? 0.46 : 0.7;
    const metalness = useMountain ? 0.05 : isWasteland ? 0.12 : isPalace ? 0.08 : 0.1;
    return new THREE.MeshStandardMaterial({
      map: tex,
      color,
      roughness,
      metalness,
    });
  };
  const ceilingMat = (_color = 0x888888, width = 8, depth = 8) => {
    const tex = ceilTex.clone();
    tex.needsUpdate = true;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(
      Math.max(1, width / UNITS_PER_TEXTURE),
      Math.max(1, depth / UNITS_PER_TEXTURE),
    );
    const roughness = isWasteland ? 0.8 : isPalace ? 0.55 : 0.9;
    const metalness = isWasteland ? 0.08 : isPalace ? 0.04 : 0;
    return new THREE.MeshStandardMaterial({
      map: tex,
      color: _color,
      roughness,
      metalness,
    });
  };

  // Build indoor rooms first (so their floors render on top), then outdoor
  const indoorRooms = level.rooms.filter((r) => !r.outdoor);
  const outdoorRooms = level.rooms.filter((r) => r.outdoor);
  for (const room of indoorRooms) {
    buildRoom(room, level.doors, scene, physics, floorMat, wallMat, ceilingMat, null, isPalace, isWasteland);
  }
  for (const room of outdoorRooms) {
    buildRoom(room, level.doors, scene, physics, floorMat, wallMat, ceilingMat, indoorRooms, isPalace, isWasteland);
  }

  if (isPalace) {
    addPalacePaintings(level.rooms, scene);
  }

  // Doors
  for (const door of level.doors) {
    doorSystem.addDoor(door);
  }

  // Props (destructible)
  if (level.props) {
    for (const prop of level.props) {
      buildProp(prop, scene, physics, deps.destructibleSystem);
    }
  }

  // Player spawn
  const { x: px, y: py, z: pz } = level.playerSpawn;
  setPlayerPosition(px, py, pz);

  // Enemies (with optional waypoints for patrol, variant for appearance, weapon)
  for (const e of level.enemies) {
    enemyManager.spawnEnemy({
      x: e.x,
      y: e.y,
      z: e.z,
      facingAngle: e.facingAngle,
      waypoints: e.waypoints,
      variant: e.variant,
      weapon: e.weapon,
    });
  }

  // Pickups
  for (const p of level.pickups) {
    const amount = p.amount ?? (p.type.startsWith('ammo-') ? 20 : p.type.startsWith('weapon-') ? 1 : 25);
    if (p.type === 'key' && p.keyId) {
      pickupSystem.spawnKey(p.keyId, p.x, p.y, p.z);
    } else {
      pickupSystem.spawn(p.type as any, p.x, p.y, p.z, amount);
    }
  }

  // Triggers — also place extraction marker at mission:complete trigger
  for (const t of level.triggers) {
    triggerSystem.addTrigger(t);
    if (t.onEnter === 'mission:complete') {
      buildExtractionMarker(scene, t.x, t.y, t.z);
    }
  }

  // Objectives
  objectiveSystem.load(level.objectives);

  // Navmesh for AI pathfinding
  if (navMesh) {
    navMesh.build(level);
    enemyManager.setNavMesh(navMesh);
  }
}

const DOOR_WALL_TOLERANCE = 2;

/** Compute floor rectangles for outdoor room, subtracting overlapping indoor rooms */
function getOutdoorFloorRects(
  room: RoomDef,
  indoorRooms: RoomDef[],
): { cx: number; cz: number; w: number; d: number }[] {
  const hw = room.width / 2;
  const hd = room.depth / 2;
  const ox1 = room.x - hw;
  const ox2 = room.x + hw;
  const oz1 = room.z - hd;
  const oz2 = room.z + hd;

  let rects: { x1: number; z1: number; x2: number; z2: number }[] = [{ x1: ox1, z1: oz1, x2: ox2, z2: oz2 }];

  for (const ind of indoorRooms) {
    const ihw = ind.width / 2;
    const ihd = ind.depth / 2;
    const ix1 = ind.x - ihw;
    const ix2 = ind.x + ihw;
    const iz1 = ind.z - ihd;
    const iz2 = ind.z + ihd;

    const newRects: typeof rects = [];
    for (const r of rects) {
      const overlapX1 = Math.max(r.x1, ix1);
      const overlapX2 = Math.min(r.x2, ix2);
      const overlapZ1 = Math.max(r.z1, iz1);
      const overlapZ2 = Math.min(r.z2, iz2);
      if (overlapX1 >= overlapX2 || overlapZ1 >= overlapZ2) {
        newRects.push(r);
        continue;
      }
      if (r.x1 < overlapX1) newRects.push({ x1: r.x1, z1: r.z1, x2: overlapX1, z2: r.z2 });
      if (overlapX2 < r.x2) newRects.push({ x1: overlapX2, z1: r.z1, x2: r.x2, z2: r.z2 });
      if (r.z1 < overlapZ1) newRects.push({ x1: overlapX1, z1: r.z1, x2: overlapX2, z2: overlapZ1 });
      if (overlapZ2 < r.z2) newRects.push({ x1: overlapX1, z1: overlapZ2, x2: overlapX2, z2: r.z2 });
    }
    rects = newRects;
  }

  return rects.map((r) => ({
    cx: (r.x1 + r.x2) / 2,
    cz: (r.z1 + r.z2) / 2,
    w: r.x2 - r.x1,
    d: r.z2 - r.z1,
  }));
}

function buildRoom(
  room: RoomDef,
  doors: DoorDef[],
  scene: THREE.Scene,
  physics: PhysicsWorld,
  floorMat: (c: number | undefined, useSnow: boolean, width: number, depth: number) => THREE.Material,
  wallMat: (c: number | undefined, useMountain: boolean, span: number, wallHeight: number) => THREE.Material,
  ceilingMat: (c: number | undefined, width: number, depth: number) => THREE.Material,
  indoorRooms: RoomDef[] | null,
  palaceTheme: boolean,
  wastelandTheme: boolean = false,
): void {
  const { x, y, z, width, depth, height } = room;
  const outdoor = room.outdoor ?? false;
  const fColor =
    room.floorColor ??
    (outdoor ? 0xe8eef4 : wastelandTheme ? 0x6a6e62 : palaceTheme ? 0xf2eadf : 0x555555);
  const wColor =
    room.wallColor ??
    (outdoor ? 0x7a7e82 : wastelandTheme ? 0x5a5e52 : palaceTheme ? 0xe3d6c2 : 0x666666);
  const hw = width / 2;
  const hd = depth / 2;
  const hh = height / 2;
  const floorY = y - height / 2 - WALL_THICKNESS / 2;

  // Floor — for outdoor rooms with overlapping indoor rooms, split into non-overlapping rects
  if (outdoor && indoorRooms && indoorRooms.length > 0) {
    const floorRects = getOutdoorFloorRects(room, indoorRooms);
    for (const rect of floorRects) {
      if (rect.w < 0.5 || rect.d < 0.5) continue;
      const floor = new THREE.Mesh(
        new THREE.BoxGeometry(rect.w, WALL_THICKNESS, rect.d),
        floorMat(fColor, outdoor, rect.w, rect.d),
      );
      floor.position.set(rect.cx, floorY, rect.cz);
      floor.receiveShadow = true;
      scene.add(floor);
      physics.createStaticCuboid(rect.w / 2, WALL_THICKNESS / 2, rect.d / 2, rect.cx, floorY, rect.cz);
    }
  } else {
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(width, WALL_THICKNESS, depth),
      floorMat(fColor, outdoor, width, depth),
    );
    floor.position.set(x, floorY, z);
    floor.receiveShadow = true;
    scene.add(floor);
    physics.createStaticCuboid(width / 2, WALL_THICKNESS / 2, depth / 2, x, floorY, z);
  }

  // Ceiling (skip for outdoor rooms — open sky)
  if (!outdoor) {
    const ceiling = new THREE.Mesh(
      new THREE.BoxGeometry(width, WALL_THICKNESS, depth),
      ceilingMat(undefined, width, depth),
    );
    ceiling.position.set(x, y + height / 2 + WALL_THICKNESS / 2, z);
    scene.add(ceiling);
    physics.createStaticCuboid(width / 2, WALL_THICKNESS / 2, depth / 2, x, y + height / 2 + WALL_THICKNESS / 2, z);
  }

  // Walls (4 sides) — split around door openings instead of skipping entire walls

  // Helper: find doors on a given wall
  const getDoorsOnWall = (wallIndex: number): DoorDef[] => {
    const found: DoorDef[] = [];
    for (const d of doors) {
      if (d.axis === 'z') {
        if (Math.abs(d.x - x) > hw + 1) continue;
        const southDist = Math.abs(d.z - (z - hd));
        const northDist = Math.abs(d.z - (z + hd));
        if (southDist <= northDist && southDist <= DOOR_WALL_TOLERANCE && wallIndex === 0) found.push(d);
        if (northDist < southDist && northDist <= DOOR_WALL_TOLERANCE && wallIndex === 1) found.push(d);
        continue;
      }
      if (d.axis === 'x') {
        if (Math.abs(d.z - z) > hd + 1) continue;
        const westDist = Math.abs(d.x - (x - hw));
        const eastDist = Math.abs(d.x - (x + hw));
        if (westDist <= eastDist && westDist <= DOOR_WALL_TOLERANCE && wallIndex === 2) found.push(d);
        if (eastDist < westDist && eastDist <= DOOR_WALL_TOLERANCE && wallIndex === 3) found.push(d);
      }
    }
    return found;
  };

  // Helper: build a single wall segment (mesh + physics)
  const addWallSeg = (halfW: number, halfH: number, halfD: number, px: number, py: number, pz: number) => {
    if (halfW < 0.15 && halfD < 0.15) return; // too thin to bother
    const span = Math.max(halfW, halfD) * 2;
    const wallHeight = halfH * 2;
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(halfW * 2, halfH * 2, halfD * 2),
      wallMat(wColor, outdoor, span, wallHeight),
    );
    wall.position.set(px, py, pz);
    wall.receiveShadow = true;
    scene.add(wall);
    physics.createStaticCuboid(halfW, halfH, halfD, px, py, pz);
  };

  const wt = WALL_THICKNESS / 2;

  // Wall 0 (z-south) and Wall 1 (z-north): span along X, thin in Z
  for (let wi = 0; wi < 2; wi++) {
    const wallZ = wi === 0 ? z - hd - wt : z + hd + wt;
    const wallDoors = getDoorsOnWall(wi);
    if (wallDoors.length === 0) {
      addWallSeg(hw, hh, wt, x, y, wallZ);
    } else {
      // Wall runs from (x - hw) to (x + hw) along X
      const wallStart = x - hw;
      const wallEnd = x + hw;
      // Sort doors by x position
      const sorted = wallDoors.slice().sort((a, b) => a.x - b.x);
      let cursor = wallStart;
      const roomBottom = y - hh;
      const roomTop = y + hh;
      for (const d of sorted) {
        const doorLeft = Math.max(wallStart, d.x - d.width / 2 - 0.1); // small gap for frame
        const doorRight = Math.min(wallEnd, d.x + d.width / 2 + 0.1);
        if (doorRight <= doorLeft) continue;
        // Segment before this door
        if (doorLeft > cursor + 0.3) {
          const segW = (doorLeft - cursor) / 2;
          const segCx = cursor + segW;
          addWallSeg(segW, hh, wt, segCx, y, wallZ);
        }
        // Build wall above doorway (lintel) to avoid ceiling leaks.
        const doorTop = roomBottom + Math.min(d.height, height - 0.1);
        const lintelHalfH = (roomTop - doorTop) / 2;
        if (lintelHalfH > 0.08) {
          addWallSeg((doorRight - doorLeft) / 2, lintelHalfH, wt, (doorLeft + doorRight) / 2, doorTop + lintelHalfH, wallZ);
        }
        cursor = Math.max(cursor, doorRight);
      }
      // Segment after last door
      if (wallEnd > cursor + 0.3) {
        const segW = (wallEnd - cursor) / 2;
        const segCx = cursor + segW;
        addWallSeg(segW, hh, wt, segCx, y, wallZ);
      }
    }
  }

  // Wall 2 (x-west) and Wall 3 (x-east): span along Z, thin in X
  for (let wi = 2; wi < 4; wi++) {
    const wallX = wi === 2 ? x - hw - wt : x + hw + wt;
    const wallDoors = getDoorsOnWall(wi);
    if (wallDoors.length === 0) {
      addWallSeg(wt, hh, hd, wallX, y, z);
    } else {
      const wallStart = z - hd;
      const wallEnd = z + hd;
      const sorted = wallDoors.slice().sort((a, b) => a.z - b.z);
      let cursor = wallStart;
      const roomBottom = y - hh;
      const roomTop = y + hh;
      for (const d of sorted) {
        const doorFront = Math.max(wallStart, d.z - d.width / 2 - 0.1);
        const doorBack = Math.min(wallEnd, d.z + d.width / 2 + 0.1);
        if (doorBack <= doorFront) continue;
        if (doorFront > cursor + 0.3) {
          const segD = (doorFront - cursor) / 2;
          const segCz = cursor + segD;
          addWallSeg(wt, hh, segD, wallX, y, segCz);
        }
        const doorTop = roomBottom + Math.min(d.height, height - 0.1);
        const lintelHalfH = (roomTop - doorTop) / 2;
        if (lintelHalfH > 0.08) {
          addWallSeg(wt, lintelHalfH, (doorBack - doorFront) / 2, wallX, doorTop + lintelHalfH, (doorFront + doorBack) / 2);
        }
        cursor = Math.max(cursor, doorBack);
      }
      if (wallEnd > cursor + 0.3) {
        const segD = (wallEnd - cursor) / 2;
        const segCz = cursor + segD;
        addWallSeg(wt, hh, segD, wallX, y, segCz);
      }
    }
  }
}


function addPalacePaintings(rooms: RoomDef[], scene: THREE.Scene): void {
  const tex = palacePaintingTexture();
  const paintingMat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.42,
    metalness: 0.08,
  });
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0xb28d3a,
    roughness: 0.35,
    metalness: 0.62,
  });

  const paintW = 1.9;
  const paintH = 1.15;
  const wallInset = 0.03;

  const placePainting = (x: number, y: number, z: number, rotY: number) => {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotY;

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(paintW + 0.16, paintH + 0.16, 0.05),
      frameMat,
    );
    frame.receiveShadow = true;
    group.add(frame);

    const art = new THREE.Mesh(
      new THREE.PlaneGeometry(paintW, paintH),
      paintingMat,
    );
    art.position.z = 0.03;
    group.add(art);

    scene.add(group);
  };

  const idHash = (id: string): number => {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
    return Math.abs(h);
  };

  for (const room of rooms) {
    if (room.outdoor) continue;
    if (room.width * room.depth < 70) continue; // skip tiny connector rooms

    const hw = room.width / 2;
    const hd = room.depth / 2;
    const y = room.y + room.height / 2 - 0.95;
    const side = idHash(room.id) % 4;

    if (side === 0) placePainting(room.x, y, room.z - hd + wallInset, 0);
    if (side === 1) placePainting(room.x, y, room.z + hd - wallInset, Math.PI);
    if (side === 2) placePainting(room.x - hw + wallInset, y, room.z, Math.PI / 2);
    if (side === 3) placePainting(room.x + hw - wallInset, y, room.z, -Math.PI / 2);
  }
}

const PROP_FLOOR_OFFSET = 0.03; // Slight elevation to avoid z-fighting with floor

function buildProp(
  prop: PropDef,
  scene: THREE.Scene,
  physics: PhysicsWorld,
  destructible: DestructibleSystem,
): void {
  const scale = prop.scale ?? 1;
  const { x, y, z } = prop;
  const baseY = y + PROP_FLOOR_OFFSET; // Sit on top of floor, avoid clipping

  if (prop.type === 'crate' || prop.type === 'crate_metal') {
    const isMetal = prop.type === 'crate_metal';
    const mat = new THREE.MeshStandardMaterial({
      map: isMetal ? metalCrateTexture() : woodCrateTexture(),
      roughness: 0.7,
      metalness: isMetal ? 0.5 : 0.1,
    });
    const size = 1 * scale;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), mat);
    mesh.position.set(x, baseY + size / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const collider = physics.createStaticCuboid(size / 2, size / 2, size / 2, x, baseY + size / 2, z);
    destructible.register(mesh, collider, prop.type, undefined, size, prop.loot);
  } else if (prop.type === 'barrel') {
    const mat = new THREE.MeshStandardMaterial({
      map: barrelTexture(),
      roughness: 0.5,
      metalness: 0.3,
    });
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4 * scale, 0.4 * scale, 1.2 * scale, 12),
      mat,
    );
    mesh.position.set(x, baseY + 0.6 * scale, z);
    mesh.castShadow = true;
    scene.add(mesh);
    const collider = physics.createStaticCuboid(0.4 * scale, 0.6 * scale, 0.4 * scale, x, baseY + 0.6 * scale, z);
    destructible.register(mesh, collider, 'barrel', undefined, 0.8 * scale, prop.loot);
  }
}

/**
 * Build a floating, glowing downward arrow at the extraction point.
 * Animated: bobs up and down and rotates slowly.
 */
function buildExtractionMarker(scene: THREE.Scene, x: number, y: number, z: number): void {
  const group = new THREE.Group();
  group.position.set(x, y + 1.8, z);

  // Arrow built from two boxes: vertical shaft + arrowhead (chevron from two angled boxes)
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x44ff66,
    transparent: true,
    opacity: 0.85,
  });

  // Shaft
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.12), glowMat);
  shaft.position.y = 0.3;
  group.add(shaft);

  // Arrowhead — two angled boxes forming a V pointing down
  const headMat = new THREE.MeshBasicMaterial({
    color: 0x66ffaa,
    transparent: true,
    opacity: 0.9,
  });

  const leftWing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.12), headMat);
  leftWing.position.set(-0.15, -0.05, 0);
  leftWing.rotation.z = -0.6;
  group.add(leftWing);

  const rightWing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.12), headMat);
  rightWing.position.set(0.15, -0.05, 0);
  rightWing.rotation.z = 0.6;
  group.add(rightWing);

  // Point light for the glow effect
  const glow = new THREE.PointLight(0x44ff66, 15, 8);
  glow.position.set(0, 0, 0);
  group.add(glow);

  scene.add(group);

  // Animate: bob up/down and rotate slowly
  const baseY = group.position.y;
  const update = () => {
    const t = performance.now() * 0.001;
    group.position.y = baseY + Math.sin(t * 2) * 0.15;
    group.rotation.y = t * 0.8;
    // Pulse the glow
    glow.intensity = 12 + Math.sin(t * 3) * 5;
    glowMat.opacity = 0.7 + Math.sin(t * 3) * 0.15;
    headMat.opacity = 0.75 + Math.sin(t * 3) * 0.15;
    requestAnimationFrame(update);
  };
  update();
}
