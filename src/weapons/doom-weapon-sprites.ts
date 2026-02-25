import * as THREE from 'three';
import type { WeaponType } from './weapon-mesh-factory';

const doomSpriteCache = new Map<string, THREE.CanvasTexture>();

const W = 256;
const H = 256;

/** Returns a cached CanvasTexture with a Doom-style weapon silhouette for the given type. */
export function buildDoomWeaponTexture(type: WeaponType): THREE.CanvasTexture {
  const cached = doomSpriteCache.get(type);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, W, H);
  drawWeapon(ctx, type);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  doomSpriteCache.set(type, tex);
  return tex;
}

function drawWeapon(ctx: CanvasRenderingContext2D, type: WeaponType): void {
  // All sprites are drawn from the bottom-center, like classic Doom weapon sprites.
  // The top half is transparent — the silhouette sits in the bottom ~60% of the frame.
  const metal = '#b8b8b8';
  const dark = '#555';
  const grip = '#5a3a1a';
  const barrel = '#888';

  ctx.fillStyle = metal;

  switch (type) {
    case 'pistol': {
      // Grip (hand)
      ctx.fillStyle = grip;
      ctx.fillRect(104, 164, 44, 92);
      // Frame / slide
      ctx.fillStyle = metal;
      ctx.fillRect(80, 128, 96, 44);
      // Barrel
      ctx.fillStyle = dark;
      ctx.fillRect(160, 140, 32, 16);
      // Trigger guard
      ctx.fillStyle = metal;
      ctx.fillRect(104, 168, 16, 20);
      break;
    }
    case 'rifle': {
      // Stock
      ctx.fillStyle = grip;
      ctx.fillRect(20, 152, 60, 28);
      // Body
      ctx.fillStyle = metal;
      ctx.fillRect(24, 128, 160, 32);
      // Barrel
      ctx.fillStyle = barrel;
      ctx.fillRect(176, 132, 60, 20);
      // Grip
      ctx.fillStyle = grip;
      ctx.fillRect(108, 156, 32, 64);
      // Mag
      ctx.fillStyle = dark;
      ctx.fillRect(120, 160, 20, 36);
      break;
    }
    case 'shotgun': {
      // Long barrel (double)
      ctx.fillStyle = barrel;
      ctx.fillRect(8, 124, 196, 14);
      ctx.fillRect(8, 140, 196, 14);
      // Receiver
      ctx.fillStyle = metal;
      ctx.fillRect(60, 116, 80, 48);
      // Pump grip
      ctx.fillStyle = grip;
      ctx.fillRect(72, 160, 44, 20);
      // Stock grip
      ctx.fillStyle = grip;
      ctx.fillRect(128, 160, 48, 72);
      break;
    }
    case 'sniper': {
      // Very long barrel
      ctx.fillStyle = barrel;
      ctx.fillRect(4, 130, 220, 14);
      // Scope body
      ctx.fillStyle = dark;
      ctx.fillRect(88, 108, 56, 24);
      // Scope lenses
      ctx.fillStyle = '#334';
      ctx.beginPath();
      ctx.arc(96, 120, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(136, 120, 8, 0, Math.PI * 2);
      ctx.fill();
      // Receiver
      ctx.fillStyle = metal;
      ctx.fillRect(72, 126, 100, 36);
      // Grip
      ctx.fillStyle = grip;
      ctx.fillRect(128, 158, 36, 76);
      break;
    }
    case 'minigun': {
      // 6 barrel cluster (rotating)
      ctx.fillStyle = barrel;
      const barrelOffsets = [
        [0, -28], [24, -14], [24, 14], [0, 28], [-24, 14], [-24, -14],
      ];
      for (const [dx, dy] of barrelOffsets) {
        ctx.fillRect(40 + dx, 108 + dy, 128, 10);
      }
      // Center hub
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.arc(40, 136, 20, 0, Math.PI * 2);
      ctx.fill();
      // Body
      ctx.fillStyle = metal;
      ctx.fillRect(8, 120, 60, 40);
      // Grip
      ctx.fillStyle = grip;
      ctx.fillRect(56, 156, 40, 80);
      // Ammo belt hint
      ctx.fillStyle = '#c8a000';
      for (let i = 0; i < 6; i++) {
        ctx.fillRect(108, 172 + i * 10, 20, 6);
      }
      break;
    }
    case 'rpg': {
      // Tube
      ctx.fillStyle = '#556633';
      ctx.fillRect(8, 116, 212, 32);
      // Front cone
      ctx.fillStyle = '#cc4400';
      ctx.beginPath();
      ctx.moveTo(220, 116);
      ctx.lineTo(248, 132);
      ctx.lineTo(220, 148);
      ctx.fill();
      // Sight
      ctx.fillStyle = dark;
      ctx.fillRect(88, 100, 20, 20);
      // Grip
      ctx.fillStyle = grip;
      ctx.fillRect(100, 144, 36, 80);
      // Trigger
      ctx.fillStyle = dark;
      ctx.fillRect(100, 148, 8, 20);
      break;
    }
    case 'grenade-launcher': {
      // Short fat barrel
      ctx.fillStyle = barrel;
      ctx.fillRect(32, 120, 160, 24);
      // Cylinder (revolving)
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.arc(100, 160, 28, 0, Math.PI * 2);
      ctx.fill();
      // Cylinder holes
      ctx.fillStyle = '#222';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(100 + Math.cos(a) * 16, 160 + Math.sin(a) * 16, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      // Stock
      ctx.fillStyle = grip;
      ctx.fillRect(172, 136, 56, 20);
      ctx.fillRect(196, 152, 28, 72);
      break;
    }
    default: {
      // Fallback generic gun shape
      ctx.fillStyle = metal;
      ctx.fillRect(60, 128, 128, 36);
      ctx.fillStyle = grip;
      ctx.fillRect(108, 160, 36, 72);
      ctx.fillStyle = barrel;
      ctx.fillRect(180, 132, 48, 20);
      break;
    }
  }
}
