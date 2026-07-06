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
  | 'key'
  | 'gunship';

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
  /**
   * Recycled glow lights, parked in the scene at intensity 0.
   * Removing a light from the scene changes the light count and forces
   * Three.js to recompile every lit shader (a one-frame stall) — so collected
   * pickups hand their light back here instead of deleting it.
   */
  private glowLightFreeList: THREE.PointLight[] = [];

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
    // Level switch: actually drop the parked lights (recompile is hidden by loading)
    for (const light of this.glowLightFreeList) {
      light.parent?.remove(light);
    }
    this.glowLightFreeList = [];
  }

  /** Reuse a parked glow light or create a new one (first spawns only). */
  private acquireGlowLight(color: number, intensity: number, distance: number): THREE.PointLight {
    const light = this.glowLightFreeList.pop() ?? new THREE.PointLight();
    light.color.setHex(color);
    light.intensity = intensity;
    light.distance = distance;
    return light;
  }

  /** Park a glow light in the scene root at intensity 0 for reuse. */
  private recycleGlowLight(light: THREE.PointLight): void {
    light.intensity = 0;
    light.position.set(0, 0, 0);
    this.scene.add(light); // re-parents from the pickup group being removed
    this.glowLightFreeList.push(light);
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
    if (p.light) this.recycleGlowLight(p.light);
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

    if (type === 'gunship') {
      const gunshipMesh = buildGunshipPickupMesh();
      // Swap the embedded PointLight for a recycled one so collecting the
      // pickup doesn't shrink the scene's light count
      const embedded = gunshipMesh.children.find(
        (c) => c instanceof THREE.PointLight,
      ) as THREE.PointLight | undefined;
      if (embedded) {
        gunshipMesh.remove(embedded);
        pickupLight = this.acquireGlowLight(
          embedded.color.getHex(), embedded.intensity, embedded.distance,
        );
        pickupLight.position.copy(embedded.position);
        gunshipMesh.add(pickupLight);
      }
      group.add(gunshipMesh);
    } else if (isWeapon && this.weaponModelBuilder) {
      // Build actual 3D weapon model for ground pickup
      const weaponType = type.replace('weapon-', '');
      const weaponMesh = this.weaponModelBuilder(weaponType);
      // Scale for ground pickup display
      weaponMesh.scale.setScalar(1.0);
      weaponMesh.rotation.x = -Math.PI / 14; // slight forward tilt
      group.add(weaponMesh);

      // Add a colored glow light under the weapon (recycled across pickups)
      const glowColor = WEAPON_GLOW_COLORS[type] ?? 0x66ff44;
      pickupLight = this.acquireGlowLight(glowColor, 3, 4);
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
        // Park the glow light back in the scene BEFORE removing the mesh so
        // the scene light count never changes (avoids full shader recompile)
        if (pickup.light) this.recycleGlowLight(pickup.light);
        this.scene.remove(pickup.mesh);
        this.onPickupCollected?.(pickup.type, pickup.amount, pickup.keyId);
      }
    }
  }

  /**
   * Fill `out` with active pickup XZ positions for minimap overlays.
   * Reuses caller-provided array to avoid per-frame allocations.
   */
  appendActivePickupXZ(out: Array<{ x: number; z: number }>, limit = 160): void {
    let i = 0;
    for (const pickup of this.pickups) {
      if (pickup.collected) continue;
      if (i >= limit) break;
      const rec = out[i] ?? { x: 0, z: 0 };
      // Use mesh position so bob/offset updates remain visually aligned.
      rec.x = pickup.mesh.position.x;
      rec.z = pickup.mesh.position.z;
      out[i] = rec;
      i++;
    }
    out.length = i;
  }

  /**
   * Fill `out` with active pickup minimap markers.
   * Weapon pickups are tagged as `weapon`; everything else as `item`.
   */
  appendActiveMinimapMarkers(
    out: Array<{ x: number; z: number; kind: 'item' | 'weapon' }>,
    limit = 160,
  ): void {
    let i = 0;
    for (const pickup of this.pickups) {
      if (pickup.collected) continue;
      if (i >= limit) break;
      const rec = out[i] ?? { x: 0, z: 0, kind: 'item' as const };
      rec.x = pickup.mesh.position.x;
      rec.z = pickup.mesh.position.z;
      rec.kind = pickup.type.startsWith('weapon-') ? 'weapon' : 'item';
      out[i] = rec;
      i++;
    }
    out.length = i;
  }
}

// ─── Per-type mesh builders ───

function buildPickupMesh(type: PickupType): THREE.Group {
  if (type === 'health') return buildHealthMesh();
  if (type === 'armor') return buildArmorMesh();
  if (type === 'key') return buildKeyMesh();
  if (type === 'gunship') return buildGunshipPickupMesh();
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

function buildGunshipPickupMesh(): THREE.Group {
  const g = new THREE.Group();

  // Radio lies FLAT on its back, face pointing UP (+Y).
  // Long axis = Z (front-to-back), wide axis = X, thin axis = Y (height of device).
  // This way the Y-spin shows the face to the player looking down.

  // Procedural body texture
  const bodyCanvas = document.createElement('canvas');
  bodyCanvas.width = 64; bodyCanvas.height = 128;
  const bc = bodyCanvas.getContext('2d')!;
  bc.fillStyle = '#1c1e1a';
  bc.fillRect(0, 0, 64, 128);
  bc.strokeStyle = 'rgba(255,255,255,0.05)';
  bc.lineWidth = 1;
  for (let y = 3; y < 128; y += 3) { bc.beginPath(); bc.moveTo(0, y); bc.lineTo(64, y); bc.stroke(); }
  const bodyTex = new THREE.CanvasTexture(bodyCanvas);

  // Procedural screen texture
  const scrCanvas = document.createElement('canvas');
  scrCanvas.width = 64; scrCanvas.height = 64;
  const sc = scrCanvas.getContext('2d')!;
  sc.fillStyle = '#001200';
  sc.fillRect(0, 0, 64, 64);
  sc.strokeStyle = 'rgba(0,255,60,0.2)';
  sc.lineWidth = 0.5;
  for (let i = 8; i < 64; i += 8) {
    sc.beginPath(); sc.moveTo(i, 0); sc.lineTo(i, 64); sc.stroke();
    sc.beginPath(); sc.moveTo(0, i); sc.lineTo(64, i); sc.stroke();
  }
  sc.strokeStyle = 'rgba(0,255,80,0.9)'; sc.lineWidth = 1;
  sc.beginPath(); sc.moveTo(32, 16); sc.lineTo(32, 48); sc.stroke();
  sc.beginPath(); sc.moveTo(16, 32); sc.lineTo(48, 32); sc.stroke();
  sc.strokeRect(20, 20, 24, 24);
  sc.fillStyle = 'rgba(0,255,60,0.85)'; sc.font = '7px monospace';
  sc.fillText('AC-130', 3, 9); sc.fillText('ONLINE', 3, 62);
  const scrTex = new THREE.CanvasTexture(scrCanvas);

  // Grille texture
  const grlCanvas = document.createElement('canvas');
  grlCanvas.width = 32; grlCanvas.height = 32;
  const gc = grlCanvas.getContext('2d')!;
  gc.fillStyle = '#1a1a1a'; gc.fillRect(0, 0, 32, 32);
  gc.fillStyle = '#0a0a0a';
  for (let y = 2; y < 32; y += 5) gc.fillRect(2, y, 28, 2);
  const grlTex = new THREE.CanvasTexture(grlCanvas);

  const bodyMat = new THREE.MeshStandardMaterial({ map: bodyTex, roughness: 0.6, metalness: 0.5 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.7 });
  const screenMat = new THREE.MeshStandardMaterial({
    map: scrTex, emissiveMap: scrTex,
    emissive: new THREE.Color(0x00ff44), emissiveIntensity: 0.9,
    roughness: 0.2, metalness: 0.4,
  });
  const grilleMat = new THREE.MeshStandardMaterial({ map: grlTex, roughness: 0.7, metalness: 0.3 });
  const btnOrangeMat = new THREE.MeshStandardMaterial({
    color: 0xdd4400, roughness: 0.4, metalness: 0.3,
    emissive: new THREE.Color(0xff3300), emissiveIntensity: 0.5,
  });
  const btnGrayMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.5, metalness: 0.4 });

  // Body slab: 0.10 wide (X), 0.020 thick (Y=up), 0.26 long (Z)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.020, 0.26), bodyMat);
  body.position.set(0, 0.01, 0);
  g.add(body);

  // Antenna: thin cylinder along Z at one end, sticking up
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.13, 6), accentMat);
  antenna.position.set(-0.035, 0.075, -0.10); // top-left corner, pointing up
  g.add(antenna);

  // Speaker grille: flat face panel, near top end (Z = -0.08)
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.008, 0.065), grilleMat);
  grille.position.set(0, 0.021, -0.075);
  g.add(grille);

  // Screen: flat face panel, mid-body
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.008, 0.075), screenMat);
  screen.position.set(0, 0.021, 0.02);
  g.add(screen);

  // PTT button: raised nub on the side (+X edge)
  const ptt = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.016, 0.038), btnOrangeMat);
  ptt.position.set(0.055, 0.014, 0.01);
  g.add(ptt);

  // Two small grey buttons below screen
  for (const bz of [0.115, 0.145]) {
    const btn = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.008, 0.016), btnGrayMat);
    btn.position.set(0, 0.021, bz);
    g.add(btn);
  }

  // Volume knob on top end
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.014, 8), accentMat);
  knob.position.set(0.02, 0.02, -0.115);
  g.add(knob);

  // --- Tablet standing upright to the right of the radio (+X side) ---

  // Tablet screen texture — FLIR map view
  const tabCanvas = document.createElement('canvas');
  tabCanvas.width = 128; tabCanvas.height = 96;
  const tc = tabCanvas.getContext('2d')!;
  tc.fillStyle = '#001400';
  tc.fillRect(0, 0, 128, 96);
  // terrain contours
  tc.strokeStyle = 'rgba(0,255,60,0.18)'; tc.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    tc.beginPath();
    tc.ellipse(64 + i * 4, 48 + i * 2, 30 + i * 6, 20 + i * 4, 0.3, 0, Math.PI * 2);
    tc.stroke();
  }
  // target box
  tc.strokeStyle = 'rgba(0,255,80,0.95)'; tc.lineWidth = 1.5;
  tc.strokeRect(52, 36, 24, 24);
  tc.beginPath(); tc.moveTo(64, 30); tc.lineTo(64, 36); tc.stroke();
  tc.beginPath(); tc.moveTo(64, 60); tc.lineTo(64, 66); tc.stroke();
  tc.beginPath(); tc.moveTo(46, 48); tc.lineTo(52, 48); tc.stroke();
  tc.beginPath(); tc.moveTo(76, 48); tc.lineTo(82, 48); tc.stroke();
  // HUD text
  tc.fillStyle = 'rgba(0,255,60,0.9)'; tc.font = '7px monospace';
  tc.fillText('TGT LOCK', 4, 10);
  tc.fillText('ALT 15000FT', 4, 88);
  tc.fillText('BRG 247', 88, 10);
  const tabTex = new THREE.CanvasTexture(tabCanvas);

  const tabBodyMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5, metalness: 0.7 });
  const tabScreenMat = new THREE.MeshStandardMaterial({
    map: tabTex, emissiveMap: tabTex,
    emissive: new THREE.Color(0x00ff44), emissiveIntensity: 1.0,
    roughness: 0.2, metalness: 0.3,
  });

  // Tablet frame — stands upright, leaning slightly back (-Z tilt)
  // Position to the LEFT of radio (-X), centered at same Z
  const tabX = -0.20;
  const tabW = 0.18; const tabH = 0.14; const tabD = 0.012;
  const tabFrame = new THREE.Mesh(new THREE.BoxGeometry(tabW + 0.016, tabH + 0.016, tabD), tabBodyMat);
  tabFrame.position.set(tabX, tabH * 0.5 + 0.008, 0.01);
  tabFrame.rotation.x = THREE.MathUtils.degToRad(12);
  tabFrame.rotation.z = THREE.MathUtils.degToRad(180);
  g.add(tabFrame);

  const tabScreen = new THREE.Mesh(new THREE.BoxGeometry(tabW, tabH, tabD + 0.002), tabScreenMat);
  tabScreen.position.set(tabX, tabH * 0.5 + 0.008, 0.01);
  tabScreen.rotation.x = THREE.MathUtils.degToRad(12);
  tabScreen.rotation.z = THREE.MathUtils.degToRad(180);
  g.add(tabScreen);

  // Small stand/kickstand behind tablet base
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.055, 0.008), tabBodyMat);
  stand.position.set(tabX, 0.022, 0.038);
  stand.rotation.x = THREE.MathUtils.degToRad(-30);
  g.add(stand);

  // Cable — thin box connecting tablet right edge to radio left edge
  const cable = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.004, 0.005), accentMat);
  cable.position.set(tabX * 0.5 - 0.02, 0.012, 0.01);
  g.add(cable);

  // Screen glow — covers both radio and tablet
  const light = new THREE.PointLight(0x00ff44, 4, 4);
  light.position.set(tabX * 0.5, 0.18, 0.0);
  g.add(light);

  return g;
}
