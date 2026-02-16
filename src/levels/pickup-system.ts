import * as THREE from 'three';
import { createSubdividedBox } from '../core/geometry-utils';
import {
  healthTexture,
  armorTexture,
  ammoTexture,
  keyTexture,
} from './pickup-textures';

export type PickupType =
  | 'health'
  | 'armor'
  | 'ammo-pistol'
  | 'ammo-rifle'
  | 'ammo-shotgun'
  | 'ammo-sniper'
  | 'weapon-rifle'
  | 'weapon-shotgun'
  | 'weapon-sniper'
  | 'key';

interface Pickup {
  type: PickupType;
  mesh: THREE.Group;
  position: THREE.Vector3;
  collected: boolean;
  amount: number;
  bobPhase: number;
  keyId?: string;
  light?: THREE.PointLight; // glow light for weapon pickups
}

const COLLECT_RADIUS = 1.2;
const PICKUP_FLOOR_OFFSET = 0.03; // Slight elevation to avoid clipping into floor

// Glow colors per weapon type (used for the pickup point light)
const WEAPON_GLOW_COLORS: Record<string, number> = {
  'weapon-rifle': 0x66ff44,
  'weapon-shotgun': 0xff8844,
  'weapon-sniper': 0x4488ff,
};

export class PickupSystem {
  private pickups: Pickup[] = [];
  private scene: THREE.Scene;

  onPickupCollected: ((type: PickupType, amount: number, keyId?: string) => void) | null = null;

  /**
   * Optional callback that builds an actual 3D weapon model for ground pickups.
   * Set by game.ts to reuse the weapon mesh builders.
   * (weaponType: e.g. 'rifle') => THREE.Group
   */
  weaponModelBuilder: ((weaponType: string) => THREE.Group) | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Spawn a key pickup (opens locked doors). */
  spawnKey(keyId: string, x: number, y: number, z: number): void {
    this.spawn('key', x, y, z, 1);
    const p = this.pickups[this.pickups.length - 1];
    p.keyId = keyId;
  }

  spawn(type: PickupType, x: number, y: number, z: number, amount: number): void {
    const baseY = y + PICKUP_FLOOR_OFFSET;
    const group = new THREE.Group();
    group.position.set(x, baseY, z);

    const isWeapon = type.startsWith('weapon-');
    let pickupLight: THREE.PointLight | undefined;

    if (isWeapon && this.weaponModelBuilder) {
      // Build actual 3D weapon model for ground pickup
      const weaponType = type.replace('weapon-', '');
      const weaponMesh = this.weaponModelBuilder(weaponType);
      // Scale for ground pickup display
      weaponMesh.scale.setScalar(1.0);
      weaponMesh.rotation.x = -Math.PI / 14; // slight forward tilt
      group.add(weaponMesh);

      // Add a colored glow light under the weapon
      const glowColor = WEAPON_GLOW_COLORS[type] ?? 0x66ff44;
      pickupLight = new THREE.PointLight(glowColor, 3, 4);
      pickupLight.position.set(0, -0.1, 0);
      group.add(pickupLight);
    } else {
      const mesh = buildPickupMesh(type);
      group.add(mesh);
    }

    this.scene.add(group);
    this.pickups.push({
      type,
      mesh: group,
      position: new THREE.Vector3(x, baseY, z),
      collected: false,
      amount,
      bobPhase: Math.random() * Math.PI * 2,
      light: pickupLight,
    });
  }

  update(dt: number, playerPos: THREE.Vector3): void {
    for (const pickup of this.pickups) {
      if (pickup.collected) continue;

      // Bob and rotate
      pickup.bobPhase += dt * 3;
      pickup.mesh.position.y = pickup.position.y + Math.sin(pickup.bobPhase) * 0.06 + 0.06; // bob above floor
      pickup.mesh.rotation.y += dt * 2;

      // Pulse glow light intensity
      if (pickup.light) {
        pickup.light.intensity = 2.5 + Math.sin(pickup.bobPhase * 1.5) * 1.5;
      }

      // Check collection distance
      const dist = playerPos.distanceTo(pickup.mesh.position);
      if (dist < COLLECT_RADIUS) {
        pickup.collected = true;
        if (pickup.light) pickup.light.dispose();
        this.scene.remove(pickup.mesh);
        this.onPickupCollected?.(pickup.type, pickup.amount, pickup.keyId);
      }
    }
  }
}

// ─── Per-type mesh builders ───

function buildPickupMesh(type: PickupType): THREE.Group {
  if (type === 'health') return buildHealthMesh();
  if (type === 'armor') return buildArmorMesh();
  if (type === 'key') return buildKeyMesh();
  if (type.startsWith('weapon-')) return buildWeaponFallbackMesh(type);
  return buildAmmoMesh(type);
}

function buildHealthMesh(): THREE.Group {
  const g = new THREE.Group();
  const tex = healthTexture();
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.95 });

  // Cross shape: two intersecting boxes
  const h = new THREE.Mesh(createSubdividedBox(0.24, 0.08, 0.08), mat);
  const v = new THREE.Mesh(createSubdividedBox(0.08, 0.24, 0.08), mat);
  g.add(h);
  g.add(v);
  return g;
}

function buildArmorMesh(): THREE.Group {
  const g = new THREE.Group();
  const tex = armorTexture();
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.3,
    metalness: 0.6,
  });

  // Shield silhouette: inverted T (top bar + stem)
  const topBar = new THREE.Mesh(createSubdividedBox(0.22, 0.06, 0.05), mat);
  g.add(topBar);
  const stem = new THREE.Mesh(createSubdividedBox(0.08, 0.18, 0.05), mat);
  stem.position.y = -0.12; // below the bar
  g.add(stem);
  return g;
}

function buildAmmoMesh(type: PickupType): THREE.Group {
  const g = new THREE.Group();
  const tex = ammoTexture();

  // Color tint per ammo type
  const tints: Record<string, number> = {
    'ammo-pistol': 0xddaa33,
    'ammo-rifle': 0xddaa33,
    'ammo-shotgun': 0xdd6633,
    'ammo-sniper': 0x33ddaa,
  };
  const tint = tints[type] ?? 0xddaa33;

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    color: tint,
    transparent: true,
    opacity: 0.95,
  });

  // Magazine clip shape: body + feed lips
  const body = new THREE.Mesh(createSubdividedBox(0.06, 0.18, 0.04), mat);
  g.add(body);
  const feedLips = new THREE.Mesh(createSubdividedBox(0.06, 0.03, 0.045), mat);
  feedLips.position.y = 0.105; // above body
  g.add(feedLips);
  return g;
}

/** Fallback weapon mesh (colored box) — only used if weaponModelBuilder is not set. */
function buildWeaponFallbackMesh(type: PickupType): THREE.Group {
  const g = new THREE.Group();
  const tints: Record<string, number> = {
    'weapon-rifle': 0x99ff44,
    'weapon-shotgun': 0xff8844,
    'weapon-sniper': 0x44aaff,
  };
  const tint = tints[type] ?? 0x99ff44;
  const mat = new THREE.MeshStandardMaterial({
    color: tint,
    roughness: 0.4,
    metalness: 0.6,
    emissive: tint,
    emissiveIntensity: 0.3,
  });
  const box = new THREE.Mesh(createSubdividedBox(0.5, 0.18, 0.14), mat);
  g.add(box);
  return g;
}

function buildKeyMesh(): THREE.Group {
  const g = new THREE.Group();
  const tex = keyTexture();
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.95 });

  // Key card with raised chip
  const card = new THREE.Mesh(createSubdividedBox(0.16, 0.1, 0.015), mat);
  g.add(card);
  const chip = new THREE.Mesh(createSubdividedBox(0.05, 0.05, 0.01), mat);
  chip.position.z = 0.0125; // on front face of card
  g.add(chip);
  return g;
}
