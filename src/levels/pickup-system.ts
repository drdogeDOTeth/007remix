import * as THREE from 'three';
import { createSubdividedBox } from '../core/geometry-utils';
import {
  healthTexture,
  armorTexture,
  keyTexture,
} from './pickup-textures';

export type PickupType =
  | 'health'
  | 'armor'
  | 'ammo-pistol'
  | 'ammo-rifle'
  | 'ammo-shotgun'
  | 'ammo-sniper'
  | 'ammo-minigun'
  | 'ammo-rpg'
  | 'ammo-grenade-launcher'
  | 'weapon-rifle'
  | 'weapon-shotgun'
  | 'weapon-sniper'
  | 'weapon-minigun'
  | 'weapon-rpg'
  | 'weapon-grenade-launcher'
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
  'weapon-minigun': 0xff3322,
  'weapon-rpg': 0xff6600,
  'weapon-grenade-launcher': 0x00cc44,
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

  /** Clear all pickups (for level switch). */
  clear(): void {
    for (const p of this.pickups) {
      this.scene.remove(p.mesh);
    }
    this.pickups = [];
  }

  /** Remove pickup nearest to position within maxDist. Returns index removed or -1. */
  removeNear(position: { x: number; y: number; z: number }, maxDist: number): number {
    let bestIdx = -1;
    let bestDist = maxDist;
    for (let i = 0; i < this.pickups.length; i++) {
      const p = this.pickups[i];
      if (p.collected) continue;
      const d = p.position.distanceTo(
        new THREE.Vector3(position.x, position.y, position.z),
      );
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) return -1;
    const p = this.pickups[bestIdx];
    this.scene.remove(p.mesh);
    this.pickups.splice(bestIdx, 1);
    return bestIdx;
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
        // Light is child of pickup.mesh — scene.remove removes it; PointLight has no dispose()
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

/** Build a pickup mesh for UI previews/thumbnails. */
export function buildPickupPreviewMesh(
  type: PickupType,
  weaponModelBuilder?: (weaponType: string) => THREE.Group,
): THREE.Group {
  if (type.startsWith('weapon-') && weaponModelBuilder) {
    const g = new THREE.Group();
    const weaponType = type.replace('weapon-', '');
    const weaponMesh = weaponModelBuilder(weaponType);
    weaponMesh.scale.setScalar(1.0);
    weaponMesh.rotation.x = -Math.PI / 14;
    g.add(weaponMesh);
    return g;
  }
  return buildPickupMesh(type);
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

  // Wider, flatter box — shield-like
  const shield = new THREE.Mesh(createSubdividedBox(0.28, 0.24, 0.06), mat);
  g.add(shield);
  return g;
}

export function buildAmmoMesh(type: PickupType): THREE.Group {
  const g = new THREE.Group();

  if (type === 'ammo-pistol') {
    // Five 9mm rounds in a fan — compact brass pistol cartridges
    // Each round: caseH=0.10, tipH=0.04 → total 0.14, centered at Y=0
    const caseH = 0.10, caseR = 0.016, tipH = 0.04;
    const bulletMat = new THREE.MeshStandardMaterial({ color: 0xd4a840, roughness: 0.35, metalness: 0.8 });
    const tipMat    = new THREE.MeshStandardMaterial({ color: 0xb87333, roughness: 0.45, metalness: 0.65 });
    const rimMat    = new THREE.MeshStandardMaterial({ color: 0x9a7020, roughness: 0.5,  metalness: 0.7 });
    const offsets = [-0.075, -0.037, 0, 0.037, 0.075];
    for (const ox of offsets) {
      const casing = new THREE.Mesh(new THREE.CylinderGeometry(caseR, caseR * 1.05, caseH, 8), bulletMat);
      casing.position.set(ox, 0, 0);
      g.add(casing);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(caseR, tipH, 8), tipMat);
      tip.position.set(ox, caseH * 0.5 + tipH * 0.5, 0);
      g.add(tip);
      // Extractor rim at base
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(caseR * 1.18, caseR * 1.18, 0.006, 8), rimMat);
      rim.position.set(ox, -caseH * 0.5 - 0.003, 0);
      g.add(rim);
    }

  } else if (type === 'ammo-rifle') {
    // Three 7.62mm NATO rounds — tall bottleneck cartridges
    const caseH = 0.15, caseR = 0.014, neckR = 0.010, tipH = 0.055;
    const casingMat = new THREE.MeshStandardMaterial({ color: 0xc0aa50, roughness: 0.4, metalness: 0.75 });
    const tipMat    = new THREE.MeshStandardMaterial({ color: 0x888860, roughness: 0.4, metalness: 0.7 });
    const rimMat    = new THREE.MeshStandardMaterial({ color: 0x806a20, roughness: 0.5, metalness: 0.65 });
    for (const ox of [-0.06, 0, 0.06]) {
      // Body (tapered: wider base, narrower neck)
      const body = new THREE.Mesh(new THREE.CylinderGeometry(neckR, caseR, caseH, 8), casingMat);
      body.position.set(ox, 0, 0);
      g.add(body);
      // Ogive tip
      const tip = new THREE.Mesh(new THREE.ConeGeometry(neckR, tipH, 8), tipMat);
      tip.position.set(ox, caseH * 0.5 + tipH * 0.5, 0);
      g.add(tip);
      // Rim
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(caseR * 1.15, caseR * 1.15, 0.006, 8), rimMat);
      rim.position.set(ox, -caseH * 0.5 - 0.003, 0);
      g.add(rim);
    }

  } else if (type === 'ammo-shotgun') {
    // Three 12-gauge shells — fat upright plastic hulls with brass bases
    const hullH = 0.13, hullR = 0.030;
    const hullMat  = new THREE.MeshStandardMaterial({ color: 0xcc4422, roughness: 0.75, metalness: 0.03 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xc8922a, roughness: 0.35, metalness: 0.8 });
    const crimpMat = new THREE.MeshStandardMaterial({ color: 0xaa3318, roughness: 0.8,  metalness: 0.02 });
    const primMat  = new THREE.MeshStandardMaterial({ color: 0xe8b050, roughness: 0.3,  metalness: 0.85 });
    for (const ox of [-0.08, 0, 0.08]) {
      // Plastic hull
      const hull = new THREE.Mesh(new THREE.CylinderGeometry(hullR, hullR, hullH, 10), hullMat);
      hull.position.set(ox, 0, 0);
      g.add(hull);
      // Brass head (base cap)
      const base = new THREE.Mesh(new THREE.CylinderGeometry(hullR * 1.08, hullR * 1.08, 0.022, 10), brassMat);
      base.position.set(ox, -hullH * 0.5 - 0.011, 0);
      g.add(base);
      // Primer dot inset into brass
      const primer = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.004, 8), primMat);
      primer.position.set(ox, -hullH * 0.5 - 0.02, 0);
      g.add(primer);
      // Folded crimp top (tapered cap)
      const crimp = new THREE.Mesh(new THREE.CylinderGeometry(0.008, hullR, 0.018, 10), crimpMat);
      crimp.position.set(ox, hullH * 0.5 + 0.009, 0);
      g.add(crimp);
    }

  } else {
    // ammo-sniper: two .338 Lapua Magnum rounds — chunky magnum proportions, cold steel
    // Wider radius so they read clearly, same height as rifle rounds
    const caseH = 0.14, caseR = 0.022, neckR = 0.016, tipH = 0.055;
    const casingMat = new THREE.MeshStandardMaterial({ color: 0xc8c8e0, roughness: 0.25, metalness: 0.85 });
    const tipMat    = new THREE.MeshStandardMaterial({ color: 0xcc1111, roughness: 0.3,  metalness: 0.3 });
    const rimMat    = new THREE.MeshStandardMaterial({ color: 0x8888aa, roughness: 0.4,  metalness: 0.75 });
    for (const ox of [-0.065, 0.065]) {
      // Tapered body (bottleneck: wider base → narrower neck)
      const body = new THREE.Mesh(new THREE.CylinderGeometry(neckR, caseR, caseH, 8), casingMat);
      body.position.set(ox, 0, 0);
      g.add(body);
      // Secant ogive tip
      const tip = new THREE.Mesh(new THREE.ConeGeometry(neckR, tipH, 8), tipMat);
      tip.position.set(ox, caseH * 0.5 + tipH * 0.5, 0);
      g.add(tip);
      // Cannelure groove ring
      const groove = new THREE.Mesh(new THREE.CylinderGeometry(neckR * 1.08, neckR * 1.08, 0.008, 8), rimMat);
      groove.position.set(ox, caseH * 0.15, 0);
      g.add(groove);
      // Rebated rim at base
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(caseR * 1.12, caseR * 1.12, 0.008, 8), rimMat);
      rim.position.set(ox, -caseH * 0.5 - 0.004, 0);
      g.add(rim);
    }
  }

  return g;
}

/** Fallback weapon mesh (colored box) — only used if weaponModelBuilder is not set. */
function buildWeaponFallbackMesh(type: PickupType): THREE.Group {
  const g = new THREE.Group();
  const tints: Record<string, number> = {
    'weapon-rifle': 0x99ff44,
    'weapon-shotgun': 0xff8844,
    'weapon-sniper': 0x44aaff,
    'weapon-minigun': 0xff4433,
    'weapon-rpg': 0xff7722,
    'weapon-grenade-launcher': 0x22dd55,
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

  // Flat card shape
  const card = new THREE.Mesh(createSubdividedBox(0.18, 0.12, 0.02), mat);
  g.add(card);
  return g;
}
