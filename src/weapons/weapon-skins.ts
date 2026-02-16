import * as THREE from 'three';
import {
  weaponMetalDarkTexture,
  weaponMetalMidTexture,
  weaponMetalScopeTexture,
  weaponGripTexture,
  weaponWoodLightTexture,
  weaponWoodMidTexture,
  weaponWoodDarkTexture,
  weaponMetalDarkWornTexture,
  weaponMetalMidWornTexture,
  weaponWoodLightWornTexture,
  weaponWoodMidWornTexture,
  weaponWoodDarkWornTexture,
  weaponRoughnessMapMetal,
  weaponMetalnessMapMetal,
  weaponRoughnessMapWood,
  weaponMetalnessMapWood,
} from './weapon-textures';

export type WeaponSkin = 'default' | 'gilded' | 'tiger' | 'flag' | 'battleworn' | 'plasma';

export interface SkinTextureSet {
  map: THREE.Texture;
  roughnessMap?: THREE.Texture;
  metalnessMap?: THREE.Texture;
}

/** UV repeat presets to prevent stretched/lined textures on weapon geometry. */
export type WeaponPartUVScale =
  | 'longMetal'     // Receiver, handguard, slide — tile along length
  | 'cylinderMetal' // Barrel, mag tube — tile along cylinder length
  | 'shortMetal'    // Small parts, rings
  | 'longWood'      // Stock
  | 'shortWood'     // Grip, pump
  | 'grip'          // Rubber grip (square-ish)
  | 'scope';        // Scope tube

/** Apply UV repeat to a texture (clones so original is unchanged). */
export function cloneTextureWithRepeat(tex: THREE.Texture, repeatX: number, repeatY: number): THREE.Texture {
  const clone = tex.clone();
  clone.wrapS = clone.wrapT = THREE.RepeatWrapping;
  clone.repeat.set(repeatX, repeatY);
  return clone;
}

const skinTextureCache = new Map<string, THREE.CanvasTexture>();

function getOrCreateSkin(
  key: string,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture {
  const cached = skinTextureCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  skinTextureCache.set(key, tex);
  return tex;
}

/** Gilded gold — metallic gold tone */
function gildedMetalTexture(): THREE.CanvasTexture {
  return getOrCreateSkin('skin-gilded-metal', 64, 64, (ctx) => {
    const grad = ctx.createLinearGradient(0, 0, 64, 64);
    grad.addColorStop(0, '#c9a227');
    grad.addColorStop(0.3, '#e6c547');
    grad.addColorStop(0.5, '#d4af37');
    grad.addColorStop(0.7, '#b8962e');
    grad.addColorStop(1, '#9a7b20');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    for (let y = 0; y < 64; y += 6) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(64, y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,235,180,0.4)';
    ctx.fillRect(0, 0, 64, 2);
  });
}

function gildedWoodTexture(): THREE.CanvasTexture {
  return getOrCreateSkin('skin-gilded-wood', 64, 64, (ctx) => {
    ctx.fillStyle = '#8b6914';
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = 'rgba(60,45,10,0.4)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      const y = 4 + i * 6;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= 64; x += 16) ctx.lineTo(x, y + (Math.random() * 2 - 1));
      ctx.stroke();
    }
  });
}

/** Orange tiger stripe — orange base with black stripes */
function tigerMetalTexture(): THREE.CanvasTexture {
  return getOrCreateSkin('skin-tiger-metal', 64, 64, (ctx) => {
    ctx.fillStyle = '#e07828';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#d86a18';
    ctx.fillRect(0, 0, 32, 64);
    // Black stripes (angled)
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(20, 64);
    ctx.lineTo(28, 64);
    ctx.lineTo(8, 0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(24, 0);
    ctx.lineTo(44, 64);
    ctx.lineTo(52, 64);
    ctx.lineTo(32, 0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(48, 0);
    ctx.lineTo(64, 40);
    ctx.lineTo(64, 48);
    ctx.lineTo(56, 0);
    ctx.closePath();
    ctx.fill();
  });
}

function tigerWoodTexture(): THREE.CanvasTexture {
  return getOrCreateSkin('skin-tiger-wood', 64, 64, (ctx) => {
    ctx.fillStyle = '#c45a10';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#1a1a1a';
    for (let i = 0; i < 5; i++) {
      const x = 8 + i * 14 + (i % 2) * 4;
      ctx.fillRect(x, 0, 6, 64);
    }
  });
}

/** Red, white, and blue flag style */
function flagMetalTexture(): THREE.CanvasTexture {
  return getOrCreateSkin('skin-flag-metal', 64, 64, (ctx) => {
    const stripeH = 64 / 3;
    ctx.fillStyle = '#b22234';
    ctx.fillRect(0, 0, 64, stripeH);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, stripeH, 64, stripeH);
    ctx.fillStyle = '#3c3b6e';
    ctx.fillRect(0, stripeH * 2, 64, stripeH);
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, 64, 64);
  });
}

function flagWoodTexture(): THREE.CanvasTexture {
  return getOrCreateSkin('skin-flag-wood', 64, 64, (ctx) => {
    const stripeH = 64 / 3;
    ctx.fillStyle = '#8b1528';
    ctx.fillRect(0, 0, 64, stripeH);
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(0, stripeH, 64, stripeH);
    ctx.fillStyle = '#2a2960';
    ctx.fillRect(0, stripeH * 2, 64, stripeH);
  });
}

export type SkinTextureRole = 'metal' | 'metalMid' | 'wood' | 'woodMid' | 'woodDark' | 'grip' | 'scope';

/** Get full PBR texture set when skin supports it (map + roughness + metalness). */
export function getTextureSetForSkin(skin: WeaponSkin, role: SkinTextureRole): SkinTextureSet {
  if (skin === 'battleworn') {
    switch (role) {
      case 'metal':
        return {
          map: weaponMetalDarkWornTexture(),
          roughnessMap: weaponRoughnessMapMetal(true),
          metalnessMap: weaponMetalnessMapMetal(true),
        };
      case 'metalMid':
        return {
          map: weaponMetalMidWornTexture(),
          roughnessMap: weaponRoughnessMapMetal(true),
          metalnessMap: weaponMetalnessMapMetal(true),
        };
      case 'wood':
        return { map: weaponWoodLightWornTexture(), roughnessMap: weaponRoughnessMapWood(), metalnessMap: weaponMetalnessMapWood() };
      case 'woodMid':
        return { map: weaponWoodMidWornTexture(), roughnessMap: weaponRoughnessMapWood(), metalnessMap: weaponMetalnessMapWood() };
      case 'woodDark':
        return { map: weaponWoodDarkWornTexture(), roughnessMap: weaponRoughnessMapWood(), metalnessMap: weaponMetalnessMapWood() };
      case 'grip':
        return { map: weaponGripTexture() };
      case 'scope':
        return { map: weaponMetalScopeTexture() };
      default:
        return { map: weaponMetalDarkWornTexture(), roughnessMap: weaponRoughnessMapMetal(true), metalnessMap: weaponMetalnessMapMetal(true) };
    }
  }
  if (skin === 'default') {
    let map: THREE.Texture;
    let roughnessMap: THREE.Texture | undefined;
    let metalnessMap: THREE.Texture | undefined;
    switch (role) {
      case 'metal':
        map = weaponMetalDarkTexture();
        roughnessMap = weaponRoughnessMapMetal();
        metalnessMap = weaponMetalnessMapMetal();
        break;
      case 'metalMid':
        map = weaponMetalMidTexture();
        roughnessMap = weaponRoughnessMapMetal();
        metalnessMap = weaponMetalnessMapMetal();
        break;
      case 'wood':
      case 'woodMid':
      case 'woodDark':
        map = role === 'wood' ? weaponWoodLightTexture() : role === 'woodMid' ? weaponWoodMidTexture() : weaponWoodDarkTexture();
        roughnessMap = weaponRoughnessMapWood();
        metalnessMap = weaponMetalnessMapWood();
        break;
      case 'grip':
      case 'scope':
        map = role === 'grip' ? weaponGripTexture() : weaponMetalScopeTexture();
        break;
      default:
        map = weaponMetalDarkTexture();
    }
    return { map, roughnessMap, metalnessMap };
  }
  // Plasma: dark metal base for metal parts (shader adds emissive); wood/grip stay standard
  if (skin === 'plasma') {
    if (role === 'metal' || role === 'metalMid' || role === 'scope') {
      return { map: weaponMetalDarkTexture() };
    }
    if (role === 'wood' || role === 'woodMid' || role === 'woodDark') {
      return { map: weaponWoodDarkTexture(), roughnessMap: weaponRoughnessMapWood(), metalnessMap: weaponMetalnessMapWood() };
    }
    return { map: weaponGripTexture() };
  }
  return { map: getTextureForSkin(skin, role) };
}

/** Get the texture for a given skin and material role (used by view model). */
export function getTextureForSkin(skin: WeaponSkin, role: SkinTextureRole): THREE.CanvasTexture {
  if (skin === 'battleworn') {
    switch (role) {
      case 'metal': return weaponMetalDarkWornTexture();
      case 'metalMid': return weaponMetalMidWornTexture();
      case 'wood': return weaponWoodLightWornTexture();
      case 'woodMid': return weaponWoodMidWornTexture();
      case 'woodDark': return weaponWoodDarkWornTexture();
      case 'grip': return weaponGripTexture();
      case 'scope': return weaponMetalScopeTexture();
      default: return weaponMetalDarkWornTexture();
    }
  }
  if (skin === 'plasma') {
    return weaponMetalDarkTexture();
  }
  if (skin === 'default') {
    switch (role) {
      case 'metal': return weaponMetalDarkTexture();
      case 'metalMid': return weaponMetalMidTexture();
      case 'wood': return weaponWoodLightTexture();
      case 'woodMid': return weaponWoodMidTexture();
      case 'woodDark': return weaponWoodDarkTexture();
      case 'grip': return weaponGripTexture();
      case 'scope': return weaponMetalScopeTexture();
      default: return weaponMetalDarkTexture();
    }
  }
  if (skin === 'gilded') {
    if (role === 'grip') return getOrCreateSkin('skin-gilded-grip', 32, 32, (ctx) => {
      ctx.fillStyle = '#5c4a0a';
      ctx.fillRect(0, 0, 32, 32);
    });
    if (role === 'scope') return getOrCreateSkin('skin-gilded-scope', 32, 32, (ctx) => {
      ctx.fillStyle = '#8b6914';
      ctx.fillRect(0, 0, 32, 32);
    });
    if (role === 'metal' || role === 'metalMid') return gildedMetalTexture();
    return gildedWoodTexture();
  }
  if (skin === 'tiger') {
    if (role === 'grip') return getOrCreateSkin('skin-tiger-grip', 32, 32, (ctx) => {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#e07828';
      ctx.fillRect(0, 0, 12, 32);
      ctx.fillRect(20, 0, 12, 32);
    });
    if (role === 'scope') return weaponMetalScopeTexture();
    if (role === 'metal' || role === 'metalMid') return tigerMetalTexture();
    return tigerWoodTexture();
  }
  if (skin === 'flag') {
    if (role === 'grip') return getOrCreateSkin('skin-flag-grip', 32, 32, (ctx) => {
      const sh = 32 / 3;
      ctx.fillStyle = '#b22234';
      ctx.fillRect(0, 0, 32, sh);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, sh, 32, sh);
      ctx.fillStyle = '#3c3b6e';
      ctx.fillRect(0, sh * 2, 32, sh);
    });
    if (role === 'scope') return getOrCreateSkin('skin-flag-scope', 32, 32, (ctx) => {
      ctx.fillStyle = '#3c3b6e';
      ctx.fillRect(0, 0, 32, 32);
    });
    if (role === 'metal' || role === 'metalMid') return flagMetalTexture();
    return flagWoodTexture();
  }
  return weaponMetalDarkTexture();
}

export const WEAPON_SKIN_LABELS: Record<WeaponSkin, string> = {
  default: 'Default',
  gilded: 'Gilded Gold',
  tiger: 'Orange Tiger',
  flag: 'Red White Blue',
  battleworn: 'Battle Worn',
  plasma: 'Electric Plasma',
};

export const WEAPON_SKIN_LIST: WeaponSkin[] = ['default', 'gilded', 'tiger', 'flag', 'battleworn', 'plasma'];

const previewCache = new Map<WeaponSkin, string>();

/** Draw a small weapon-strip preview (metal left, wood right) for the inventory UI. */
export function getSkinPreviewDataUrl(skin: WeaponSkin): string {
  const cached = previewCache.get(skin);
  if (cached) return cached;

  const w = 96;
  const h = 36;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const leftW = w / 2;
  const rightW = w - leftW;

  if (skin === 'default') {
    ctx.fillStyle = '#252528';
    ctx.fillRect(0, 0, leftW, h);
    ctx.fillStyle = 'rgba(80,82,88,0.5)';
    ctx.fillRect(0, 0, leftW, 2);
    ctx.fillStyle = '#6b4a2a';
    ctx.fillRect(leftW, 0, rightW, h);
    ctx.strokeStyle = 'rgba(60,40,20,0.4)';
    for (let y = 4; y < h; y += 6) ctx.fillRect(leftW, y, rightW, 1);
  } else if (skin === 'gilded') {
    const g = ctx.createLinearGradient(0, 0, leftW, h);
    g.addColorStop(0, '#c9a227');
    g.addColorStop(0.5, '#d4af37');
    g.addColorStop(1, '#9a7b20');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, leftW, h);
    ctx.fillStyle = '#8b6914';
    ctx.fillRect(leftW, 0, rightW, h);
    ctx.strokeStyle = 'rgba(60,45,10,0.5)';
    for (let y = 2; y < h; y += 4) ctx.fillRect(leftW, y, rightW, 1);
  } else if (skin === 'tiger') {
    ctx.fillStyle = '#e07828';
    ctx.fillRect(0, 0, leftW, h);
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(18, h);
    ctx.lineTo(24, h);
    ctx.lineTo(6, 0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(28, 0);
    ctx.lineTo(44, h);
    ctx.lineTo(48, h);
    ctx.lineTo(32, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c45a10';
    ctx.fillRect(leftW, 0, rightW, h);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(leftW + 8, 0, 5, h);
    ctx.fillRect(leftW + 22, 0, 5, h);
  } else if (skin === 'flag') {
    const sh = h / 3;
    ctx.fillStyle = '#b22234';
    ctx.fillRect(0, 0, leftW, sh);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, sh, leftW, sh);
    ctx.fillStyle = '#3c3b6e';
    ctx.fillRect(0, sh * 2, leftW, sh);
    ctx.fillStyle = '#8b1528';
    ctx.fillRect(leftW, 0, rightW, sh);
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(leftW, sh, rightW, sh);
    ctx.fillStyle = '#2a2960';
    ctx.fillRect(leftW, sh * 2, rightW, sh);
  } else if (skin === 'battleworn') {
    ctx.fillStyle = '#1a1c20';
    ctx.fillRect(0, 0, leftW, h);
    ctx.fillStyle = 'rgba(60,62,70,0.35)';
    ctx.fillRect(0, 0, leftW, 1);
    ctx.fillStyle = '#4a3520';
    ctx.fillRect(leftW, 0, rightW, h);
    ctx.strokeStyle = 'rgba(40,30,15,0.5)';
    for (let y = 3; y < h; y += 5) ctx.fillRect(leftW, y, rightW, 1);
  } else if (skin === 'plasma') {
    // Dark base
    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 0, leftW, h);
    // Electric vein pattern (branching lines)
    ctx.strokeStyle = 'rgba(0,180,255,0.6)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(2, h * 0.3);
    ctx.quadraticCurveTo(leftW * 0.3, h * 0.5, leftW * 0.5, h * 0.35);
    ctx.quadraticCurveTo(leftW * 0.7, h * 0.2, leftW - 2, h * 0.45);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,212,255,0.8)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(4, h * 0.7);
    ctx.quadraticCurveTo(leftW * 0.4, h * 0.55, leftW * 0.6, h * 0.7);
    ctx.quadraticCurveTo(leftW * 0.8, h * 0.85, leftW - 4, h * 0.6);
    ctx.stroke();
    // Branch lines
    ctx.strokeStyle = 'rgba(68,136,255,0.4)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 6; i++) {
      const sx = 4 + Math.random() * (leftW - 8);
      const sy = 4 + Math.random() * (h - 8);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (Math.random() - 0.5) * 12, sy + (Math.random() - 0.5) * 10);
      ctx.stroke();
    }
    // Glow spots
    const grd1 = ctx.createRadialGradient(leftW * 0.3, h * 0.4, 0, leftW * 0.3, h * 0.4, 8);
    grd1.addColorStop(0, 'rgba(0,212,255,0.35)');
    grd1.addColorStop(1, 'rgba(0,212,255,0)');
    ctx.fillStyle = grd1;
    ctx.fillRect(0, 0, leftW, h);
    const grd2 = ctx.createRadialGradient(leftW * 0.7, h * 0.65, 0, leftW * 0.7, h * 0.65, 6);
    grd2.addColorStop(0, 'rgba(170,0,255,0.3)');
    grd2.addColorStop(1, 'rgba(170,0,255,0)');
    ctx.fillStyle = grd2;
    ctx.fillRect(0, 0, leftW, h);
    // Wood side
    ctx.fillStyle = '#141020';
    ctx.fillRect(leftW, 0, rightW, h);
  } else {
    ctx.fillStyle = '#252528';
    ctx.fillRect(0, 0, w, h);
  }

  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, w, h);

  const dataUrl = canvas.toDataURL('image/png');
  previewCache.set(skin, dataUrl);
  return dataUrl;
}
