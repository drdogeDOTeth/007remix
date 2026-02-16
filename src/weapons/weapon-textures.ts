import * as THREE from 'three';

const cache = new Map<string, THREE.CanvasTexture | THREE.DataTexture>();

/** Seeded random for reproducible wear patterns (Mulberry32) */
function seededRandom(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0; // mulberry32
    const t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    return ((t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0) / 4294967296;
  };
}

function getOrCreate(
  key: string,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture {
  const cached = cache.get(key);
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
  cache.set(key, tex);
  return tex;
}

function addNoise(ctx: CanvasRenderingContext2D, w: number, h: number, strength: number): void {
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * strength;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(id, 0, 0);
}

/** Grayscale DataTexture for roughness/metalness (64x64, perf-friendly) */
const pbrMapCache = new Map<string, THREE.DataTexture>();

function getOrCreatePBRMap(
  key: string,
  width: number,
  height: number,
  fill: (data: Uint8Array, w: number, h: number) => void,
): THREE.DataTexture {
  const cached = pbrMapCache.get(key);
  if (cached) return cached;
  const data = new Uint8Array(width * height);
  fill(data, width, height);
  const tex = new THREE.DataTexture(data, width, height, THREE.RedFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  pbrMapCache.set(key, tex);
  return tex;
}

/** Apply wear layer (edge darkening, scratches) to an existing canvas context. */
function applyWearLayer(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  amount: number,
  seed: number,
): void {
  const rnd = seededRandom(seed);
  ctx.globalCompositeOperation = 'multiply';

  // Edge wear — darkened borders (high-contact areas)
  const edgeGrad = ctx.createLinearGradient(0, 0, w, h);
  edgeGrad.addColorStop(0, `rgba(80,80,90,${0.15 * amount})`);
  edgeGrad.addColorStop(0.2, 'rgba(255,255,255,0)');
  edgeGrad.addColorStop(0.8, 'rgba(255,255,255,0)');
  edgeGrad.addColorStop(1, `rgba(60,60,70,${0.2 * amount})`);
  ctx.fillStyle = edgeGrad;
  ctx.fillRect(0, 0, w, h);

  const edgeGradV = ctx.createLinearGradient(0, 0, 0, h);
  edgeGradV.addColorStop(0, `rgba(70,70,80,${0.2 * amount})`);
  edgeGradV.addColorStop(0.15, 'rgba(255,255,255,0)');
  edgeGradV.addColorStop(0.85, 'rgba(255,255,255,0)');
  edgeGradV.addColorStop(1, `rgba(50,50,60,${0.25 * amount})`);
  ctx.fillStyle = edgeGradV;
  ctx.fillRect(0, 0, w, h);

  // Scratches — diagonal fine lines (reduced reflectivity)
  ctx.globalCompositeOperation = 'overlay';
  ctx.strokeStyle = `rgba(30,32,38,${0.4 * amount})`;
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 18; i++) {
    const sx = rnd() * w;
    const sy = rnd() * h;
    const len = 12 + rnd() * 28;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + len, sy + (rnd() - 0.5) * 4);
    ctx.stroke();
  }

  // Micro rust spots (subtle brown dots)
  for (let i = 0; i < 6; i++) {
    const x = rnd() * (w - 4);
    const y = rnd() * (h - 4);
    const s = 1 + rnd() * 2;
    ctx.fillStyle = `rgba(90,60,40,${0.25 * amount})`;
    ctx.beginPath();
    ctx.ellipse(x, y, s, s * 0.7, rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = 'source-over';
}

/** Dark gunmetal — pistol/rifle receiver, barrel */
export function weaponMetalDarkTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-metal-dark', 128, 128, (ctx) => {
    const w = 128, h = 128;
    // Multi-stop gradient base — anisotropic brushed steel look
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#32323a');
    grad.addColorStop(0.15, '#2a2a30');
    grad.addColorStop(0.35, '#252528');
    grad.addColorStop(0.5, '#222228');
    grad.addColorStop(0.65, '#1f1f25');
    grad.addColorStop(0.85, '#1c1c22');
    grad.addColorStop(1, '#18181e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Subtle horizontal banding (parkerizing finish)
    for (let y = 0; y < h; y += 2) {
      const a = 0.04 + Math.sin(y * 0.3) * 0.03;
      ctx.fillStyle = `rgba(${y % 4 === 0 ? 0 : 40},${y % 4 === 0 ? 0 : 42},${y % 4 === 0 ? 0 : 48},${a})`;
      ctx.fillRect(0, y, w, 1);
    }

    // Machining lines — varying weight and spacing
    const rnd = seededRandom(101);
    for (let y = 0; y < h; y += 3 + Math.floor(rnd() * 3)) {
      ctx.strokeStyle = `rgba(0,0,0,${0.1 + rnd() * 0.18})`;
      ctx.lineWidth = 0.5 + rnd() * 0.8;
      ctx.beginPath();
      ctx.moveTo(0, y + rnd() * 0.5);
      ctx.lineTo(w, y + rnd() * 0.5);
      ctx.stroke();
    }

    // Anisotropic brushing (fine diagonal micro-scratches)
    ctx.globalCompositeOperation = 'overlay';
    for (let i = 0; i < 40; i++) {
      const sx = rnd() * w;
      const sy = rnd() * h;
      const len = 6 + rnd() * 30;
      const angle = -0.1 + rnd() * 0.2;
      ctx.strokeStyle = `rgba(${55 + rnd() * 20},${57 + rnd() * 20},${65 + rnd() * 20},${0.1 + rnd() * 0.18})`;
      ctx.lineWidth = 0.3 + rnd() * 0.5;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + len * Math.cos(angle), sy + len * Math.sin(angle));
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    // Specular catch — faint light band across middle
    const specGrad = ctx.createLinearGradient(0, h * 0.3, 0, h * 0.5);
    specGrad.addColorStop(0, 'rgba(70,72,82,0)');
    specGrad.addColorStop(0.5, 'rgba(70,72,82,0.12)');
    specGrad.addColorStop(1, 'rgba(70,72,82,0)');
    ctx.fillStyle = specGrad;
    ctx.fillRect(0, h * 0.3, w, h * 0.2);

    // Edge highlights (top/left light catch, bottom/right shadow)
    ctx.fillStyle = 'rgba(95,97,108,0.5)';
    ctx.fillRect(0, 0, w, 2);
    ctx.fillRect(0, 0, 2, h);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, h - 2, w, 2);
    ctx.fillRect(w - 2, 0, 2, h);

    addNoise(ctx, w, h, 10);
  });
}

/** Dark gunmetal with wear and tear */
export function weaponMetalDarkWornTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-metal-dark-worn', 128, 128, (ctx) => {
    ctx.drawImage((weaponMetalDarkTexture() as THREE.CanvasTexture).image, 0, 0);
    applyWearLayer(ctx, 128, 128, 0.85, 42);
  }) as THREE.CanvasTexture;
}

/** Slightly lighter metal — rifle body */
export function weaponMetalMidTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-metal-mid', 128, 128, (ctx) => {
    const w = 128, h = 128;
    // Multi-directional gradient base — blued steel
    const grad = ctx.createLinearGradient(0, 0, w * 0.3, h);
    grad.addColorStop(0, '#3a3a42');
    grad.addColorStop(0.2, '#383840');
    grad.addColorStop(0.4, '#3e3e48');
    grad.addColorStop(0.6, '#36363e');
    grad.addColorStop(0.8, '#333340');
    grad.addColorStop(1, '#30303a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Horizontal machining — fine lathe marks
    const rnd = seededRandom(202);
    for (let y = 0; y < h; y += 2 + Math.floor(rnd() * 2)) {
      ctx.strokeStyle = `rgba(0,0,0,${0.06 + rnd() * 0.14})`;
      ctx.lineWidth = 0.4 + rnd() * 0.6;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Anisotropic brushing (directional scratches)
    ctx.globalCompositeOperation = 'overlay';
    for (let i = 0; i < 35; i++) {
      const sx = rnd() * w;
      const sy = rnd() * h;
      const len = 8 + rnd() * 25;
      ctx.strokeStyle = `rgba(${68 + rnd() * 25},${70 + rnd() * 25},${80 + rnd() * 25},${0.08 + rnd() * 0.15})`;
      ctx.lineWidth = 0.3 + rnd() * 0.4;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + len, sy + (rnd() - 0.5) * 3);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    // Multiple specular bands (reflective strips at varying heights)
    for (const bandY of [0.25, 0.45, 0.7]) {
      const specGrad = ctx.createLinearGradient(0, h * (bandY - 0.04), 0, h * (bandY + 0.04));
      specGrad.addColorStop(0, 'rgba(100,102,115,0)');
      specGrad.addColorStop(0.5, 'rgba(100,102,115,0.15)');
      specGrad.addColorStop(1, 'rgba(100,102,115,0)');
      ctx.fillStyle = specGrad;
      ctx.fillRect(0, h * (bandY - 0.04), w, h * 0.08);
    }

    // Edge highlights
    ctx.fillStyle = 'rgba(108,110,120,0.45)';
    ctx.fillRect(0, 0, w, 2);
    ctx.fillRect(0, 0, 2, h);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, h - 2, w, 2);
    ctx.fillRect(w - 2, 0, 2, h);

    addNoise(ctx, w, h, 9);
  });
}

/** Rifle metal with wear */
export function weaponMetalMidWornTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-metal-mid-worn', 128, 128, (ctx) => {
    ctx.drawImage((weaponMetalMidTexture() as THREE.CanvasTexture).image, 0, 0);
    applyWearLayer(ctx, 128, 128, 0.8, 137);
  }) as THREE.CanvasTexture;
}

/** Very dark — scope tube, bolt */
export function weaponMetalScopeTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-metal-scope', 64, 64, (ctx) => {
    const w = 64, h = 64;
    // Deep matte black base with subtle gradient
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#16161c');
    grad.addColorStop(0.3, '#121218');
    grad.addColorStop(0.7, '#101016');
    grad.addColorStop(1, '#0e0e14');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Matte coating — circular polish marks (anodized finish)
    const rnd = seededRandom(303);
    ctx.strokeStyle = 'rgba(38,40,50,0.2)';
    ctx.lineWidth = 0.4;
    for (let i = 0; i < 14; i++) {
      const cx = rnd() * w;
      const cy = rnd() * h;
      ctx.beginPath();
      ctx.arc(cx, cy, 2 + rnd() * 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Circumferential machining lines (lathe marks on cylinder)
    for (let y = 0; y < h; y += 3 + Math.floor(rnd() * 3)) {
      ctx.strokeStyle = `rgba(30,32,40,${0.08 + rnd() * 0.1})`;
      ctx.lineWidth = 0.3 + rnd() * 0.3;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Specular glint
    const specGrad = ctx.createLinearGradient(0, h * 0.35, 0, h * 0.5);
    specGrad.addColorStop(0, 'rgba(55,58,70,0)');
    specGrad.addColorStop(0.5, 'rgba(55,58,70,0.18)');
    specGrad.addColorStop(1, 'rgba(55,58,70,0)');
    ctx.fillStyle = specGrad;
    ctx.fillRect(0, h * 0.35, w, h * 0.15);

    // Edge highlight
    ctx.fillStyle = 'rgba(60,62,75,0.35)';
    ctx.fillRect(0, 0, w, 1);
    addNoise(ctx, w, h, 8);
  });
}

/** Rubberized grip — dark with diamond knurl pattern */
export function weaponGripTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-grip', 64, 64, (ctx) => {
    const w = 64, h = 64;
    // Dark rubber base with subtle gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#1e1e22');
    grad.addColorStop(0.5, '#1a1a1e');
    grad.addColorStop(1, '#161618');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Diamond knurl pattern (diagonal crosshatch)
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 0.7;
    for (let i = -h; i < w + h; i += 5) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + h, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i + h, 0);
      ctx.lineTo(i, h);
      ctx.stroke();
    }

    // Raised diamond dots at intersections (stippled rubber)
    const rnd = seededRandom(404);
    for (let y = 2; y < h; y += 5) {
      for (let x = 2; x < w; x += 5) {
        const b = 40 + rnd() * 15;
        ctx.fillStyle = `rgba(${b},${b},${b + 5},0.35)`;
        ctx.beginPath();
        ctx.arc(x, y, 0.8 + rnd() * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Finger indentation zones (subtle dark bands)
    for (const bandY of [0.25, 0.5, 0.75]) {
      const ig = ctx.createLinearGradient(0, h * (bandY - 0.06), 0, h * (bandY + 0.06));
      ig.addColorStop(0, 'rgba(0,0,0,0)');
      ig.addColorStop(0.5, 'rgba(0,0,0,0.08)');
      ig.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ig;
      ctx.fillRect(0, h * (bandY - 0.06), w, h * 0.12);
    }

    // Edge highlights
    ctx.fillStyle = 'rgba(50,50,58,0.3)';
    ctx.fillRect(0, 0, w, 1);
    addNoise(ctx, w, h, 10);
  });
}

/** Wood — rifle stock (warm brown) */
export function weaponWoodLightTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-wood-light', 128, 128, (ctx) => {
    const w = 128, h = 128;
    const rnd = seededRandom(501);

    // Rich warm base with multiple gradient stops
    const grad = ctx.createLinearGradient(0, 0, w * 0.15, h);
    grad.addColorStop(0, '#7e5832');
    grad.addColorStop(0.2, '#74502c');
    grad.addColorStop(0.4, '#6b4a28');
    grad.addColorStop(0.6, '#6e4d2a');
    grad.addColorStop(0.8, '#644626');
    grad.addColorStop(1, '#5e4022');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Heartwood color variation (subtle warm zone)
    const heartGrad = ctx.createRadialGradient(w * 0.6, h * 0.5, 10, w * 0.6, h * 0.5, w * 0.5);
    heartGrad.addColorStop(0, 'rgba(130,80,40,0.08)');
    heartGrad.addColorStop(1, 'rgba(130,80,40,0)');
    ctx.fillStyle = heartGrad;
    ctx.fillRect(0, 0, w, h);

    // Wood grain — multiple layers with varying waviness and thickness
    for (let i = 0; i < 24; i++) {
      const baseY = 2 + i * 5 + (rnd() * 4 - 2);
      const darkness = 0.15 + rnd() * 0.25;
      const r = 35 + rnd() * 20;
      const g = 20 + rnd() * 12;
      const b = 6 + rnd() * 8;
      ctx.strokeStyle = `rgba(${r},${g},${b},${darkness})`;
      ctx.lineWidth = 0.5 + rnd() * 1.2;
      ctx.beginPath();
      ctx.moveTo(0, baseY);
      const freq = 0.05 + rnd() * 0.08;
      const amp = 1 + rnd() * 3;
      const phase = rnd() * Math.PI * 2;
      for (let x = 0; x <= w; x += 4) {
        ctx.lineTo(x, baseY + Math.sin(x * freq + phase) * amp + (rnd() - 0.5) * 1.5);
      }
      ctx.stroke();
    }

    // Secondary fine grain (pore structure)
    ctx.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 40; i++) {
      const y = rnd() * h;
      ctx.strokeStyle = `rgba(55,35,15,${0.06 + rnd() * 0.08})`;
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y + (rnd() - 0.5) * 2);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    // Wood knot with growth rings
    const kx = 42 + rnd() * 40, ky = 60 + rnd() * 30;
    for (let r = 8; r > 1; r -= 1.5) {
      ctx.strokeStyle = `rgba(40,25,10,${0.15 + (8 - r) * 0.04})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.ellipse(kx, ky, r + rnd() * 1.5, r * 0.6 + rnd(), 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(35,20,8,0.4)';
    ctx.beginPath();
    ctx.ellipse(kx, ky, 3, 2, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Varnish sheen bands (oil finish)
    for (const bandY of [0.2, 0.55, 0.8]) {
      const vGrad = ctx.createLinearGradient(0, h * (bandY - 0.05), 0, h * (bandY + 0.05));
      vGrad.addColorStop(0, 'rgba(150,105,60,0)');
      vGrad.addColorStop(0.5, 'rgba(150,105,60,0.1)');
      vGrad.addColorStop(1, 'rgba(150,105,60,0)');
      ctx.fillStyle = vGrad;
      ctx.fillRect(0, h * (bandY - 0.05), w, h * 0.1);
    }

    addNoise(ctx, w, h, 14);
  });
}

/** Wood light with wear (chipped varnish, darker grain) */
export function weaponWoodLightWornTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-wood-light-worn', 128, 128, (ctx) => {
    ctx.drawImage((weaponWoodLightTexture() as THREE.CanvasTexture).image, 0, 0);
    applyWearLayer(ctx, 128, 128, 0.6, 219);
  }) as THREE.CanvasTexture;
}

/** Wood — shotgun (reddish brown) */
export function weaponWoodMidTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-wood-mid', 128, 128, (ctx) => {
    const w = 128, h = 128;
    const rnd = seededRandom(502);

    // Rich reddish-brown base
    const grad = ctx.createLinearGradient(0, 0, w * 0.1, h);
    grad.addColorStop(0, '#6a4228');
    grad.addColorStop(0.15, '#633e24');
    grad.addColorStop(0.35, '#5c3820');
    grad.addColorStop(0.55, '#5e3a22');
    grad.addColorStop(0.75, '#54321e');
    grad.addColorStop(1, '#4e2e1a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Dense grain pattern — tightly spaced
    for (let i = 0; i < 28; i++) {
      const baseY = 1 + i * 4.5 + (rnd() * 3 - 1.5);
      const darkness = 0.18 + rnd() * 0.25;
      ctx.strokeStyle = `rgba(38,20,8,${darkness})`;
      ctx.lineWidth = 0.4 + rnd() * 1.1;
      ctx.beginPath();
      ctx.moveTo(0, baseY);
      const freq = 0.04 + rnd() * 0.06;
      const amp = 0.8 + rnd() * 2;
      const phase = rnd() * Math.PI * 2;
      for (let x = 0; x <= w; x += 4) {
        ctx.lineTo(x, baseY + Math.sin(x * freq + phase) * amp + (rnd() - 0.5) * 1);
      }
      ctx.stroke();
    }

    // Pore detail (fine lines between main grain)
    ctx.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 35; i++) {
      const y = rnd() * h;
      ctx.strokeStyle = `rgba(45,25,10,${0.05 + rnd() * 0.06})`;
      ctx.lineWidth = 0.2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y + (rnd() - 0.5) * 1.5);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    // Knot with growth rings
    const kx = 25 + rnd() * 20, ky = 85 + rnd() * 20;
    for (let r = 6; r > 1; r -= 1.2) {
      ctx.strokeStyle = `rgba(32,16,6,${0.12 + (6 - r) * 0.04})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.ellipse(kx, ky, r + rnd() * 1, r * 0.65, -0.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(30,15,6,0.35)';
    ctx.beginPath();
    ctx.ellipse(kx, ky, 2, 1.5, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // Oil finish sheen
    for (const bandY of [0.3, 0.6]) {
      const oGrad = ctx.createLinearGradient(0, h * (bandY - 0.04), 0, h * (bandY + 0.04));
      oGrad.addColorStop(0, 'rgba(130,85,48,0)');
      oGrad.addColorStop(0.5, 'rgba(130,85,48,0.09)');
      oGrad.addColorStop(1, 'rgba(130,85,48,0)');
      ctx.fillStyle = oGrad;
      ctx.fillRect(0, h * (bandY - 0.04), w, h * 0.08);
    }

    addNoise(ctx, w, h, 12);
  });
}

/** Wood mid with wear */
export function weaponWoodMidWornTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-wood-mid-worn', 128, 128, (ctx) => {
    ctx.drawImage((weaponWoodMidTexture() as THREE.CanvasTexture).image, 0, 0);
    applyWearLayer(ctx, 128, 128, 0.55, 311);
  }) as THREE.CanvasTexture;
}

/** Wood — sniper (darker walnut) */
export function weaponWoodDarkTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-wood-dark', 128, 128, (ctx) => {
    const w = 128, h = 128;
    const rnd = seededRandom(503);

    // Deep walnut base with rich depth
    const grad = ctx.createLinearGradient(0, 0, w * 0.12, h);
    grad.addColorStop(0, '#46341e');
    grad.addColorStop(0.2, '#402e1a');
    grad.addColorStop(0.4, '#3a2818');
    grad.addColorStop(0.6, '#362616');
    grad.addColorStop(0.8, '#322214');
    grad.addColorStop(1, '#2c1e10');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Tight grain — walnut has very fine, dark grain lines
    for (let i = 0; i < 32; i++) {
      const baseY = 1 + i * 4 + (rnd() * 3 - 1.5);
      const darkness = 0.2 + rnd() * 0.25;
      ctx.strokeStyle = `rgba(18,10,4,${darkness})`;
      ctx.lineWidth = 0.3 + rnd() * 0.9;
      ctx.beginPath();
      ctx.moveTo(0, baseY);
      const freq = 0.03 + rnd() * 0.05;
      const amp = 0.5 + rnd() * 1.5;
      const phase = rnd() * Math.PI * 2;
      for (let x = 0; x <= w; x += 3) {
        ctx.lineTo(x, baseY + Math.sin(x * freq + phase) * amp + (rnd() - 0.5) * 0.8);
      }
      ctx.stroke();
    }

    // Walnut figure (interlocking wavy chatoyance)
    ctx.globalCompositeOperation = 'overlay';
    for (let i = 0; i < 6; i++) {
      const baseY = 10 + i * 20 + rnd() * 10;
      ctx.strokeStyle = `rgba(22,14,6,${0.15 + rnd() * 0.12})`;
      ctx.lineWidth = 1.0 + rnd() * 0.8;
      ctx.beginPath();
      ctx.moveTo(0, baseY);
      for (let x = 0; x <= w; x += 3) {
        ctx.lineTo(x, baseY + Math.sin(x * 0.08 + i * 1.5) * 4 * Math.cos(x * 0.02 + i));
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    // Pore structure
    for (let i = 0; i < 30; i++) {
      const y = rnd() * h;
      ctx.strokeStyle = `rgba(15,8,3,${0.04 + rnd() * 0.05})`;
      ctx.lineWidth = 0.2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y + (rnd() - 0.5) * 1);
      ctx.stroke();
    }

    // High-gloss polish sheen
    for (const bandY of [0.25, 0.55, 0.8]) {
      const pGrad = ctx.createLinearGradient(0, h * (bandY - 0.05), 0, h * (bandY + 0.05));
      pGrad.addColorStop(0, 'rgba(90,62,35,0)');
      pGrad.addColorStop(0.5, 'rgba(90,62,35,0.08)');
      pGrad.addColorStop(1, 'rgba(90,62,35,0)');
      ctx.fillStyle = pGrad;
      ctx.fillRect(0, h * (bandY - 0.05), w, h * 0.1);
    }

    addNoise(ctx, w, h, 11);
  });
}

/** Wood dark with wear */
export function weaponWoodDarkWornTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-wood-dark-worn', 128, 128, (ctx) => {
    ctx.drawImage((weaponWoodDarkTexture() as THREE.CanvasTexture).image, 0, 0);
    applyWearLayer(ctx, 128, 128, 0.5, 447);
  }) as THREE.CanvasTexture;
}

// ═══════════════════════════════════════════════════════════════════════════
// PBR MAPS (roughness / metalness for realistic shading)
// ═══════════════════════════════════════════════════════════════════════════

/** Roughness map for metal — scratches and wear = rougher */
export function weaponRoughnessMapMetal(worn = false): THREE.DataTexture {
  const key = worn ? 'pbr-roughness-metal-worn' : 'pbr-roughness-metal';
  return getOrCreatePBRMap(key, 128, 128, (data, w, h) => {
    const rnd = seededRandom(worn ? 53 : 7);
    for (let y = 0; y < h; y++) {
      // Horizontal banding (machining marks affect roughness)
      const bandRough = Math.sin(y * 0.4) * 8;
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        let v = worn ? 55 + rnd() * 45 : 35 + rnd() * 30;
        v += bandRough;
        // Scratch lines (higher roughness)
        if (rnd() < (worn ? 0.12 : 0.05)) v += 70 + rnd() * 50;
        // Polished spots (lower roughness)
        if (rnd() < 0.03) v -= 15 + rnd() * 15;
        data[i] = Math.max(0, Math.min(255, Math.floor(v)));
      }
    }
  });
}

/** Metalness map for metal — polished = high */
export function weaponMetalnessMapMetal(worn = false): THREE.DataTexture {
  const key = worn ? 'pbr-metalness-metal-worn' : 'pbr-metalness-metal';
  return getOrCreatePBRMap(key, 128, 128, (data, w, h) => {
    const rnd = seededRandom(worn ? 71 : 13);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        let v = 220 + rnd() * 35;
        // Scratched areas lose metalness
        if (rnd() < (worn ? 0.1 : 0.03)) v -= 50 + rnd() * 70;
        // Oxidation spots (low metalness)
        if (worn && rnd() < 0.04) v -= 80 + rnd() * 40;
        data[i] = Math.max(0, Math.min(255, Math.floor(v)));
      }
    }
  });
}

/** Roughness for wood (moderate, varnish sheen) */
export function weaponRoughnessMapWood(): THREE.DataTexture {
  return getOrCreatePBRMap('pbr-roughness-wood', 128, 128, (data, w, h) => {
    const rnd = seededRandom(29);
    for (let y = 0; y < h; y++) {
      // Grain-aligned roughness variation
      const grainRough = Math.sin(y * 0.5) * 15;
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        let v = 115 + rnd() * 70 + grainRough;
        // Varnish pools (smoother)
        if (rnd() < 0.05) v -= 25 + rnd() * 20;
        data[i] = Math.max(0, Math.min(255, Math.floor(v)));
      }
    }
  });
}

/** Metalness for wood (low — dielectric, with varnish sheen) */
export function weaponMetalnessMapWood(): THREE.DataTexture {
  return getOrCreatePBRMap('pbr-metalness-wood', 128, 128, (data, w, h) => {
    const rnd = seededRandom(31);
    for (let i = 0; i < w * h; i++) {
      // Mostly dielectric with slight varnish reflection
      let v = 12 + rnd() * 8;
      // Varnished spots have slight metalness (gloss)
      if (rnd() < 0.06) v += 10 + rnd() * 12;
      data[i] = Math.min(255, Math.floor(v));
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PREMIUM WEAPON SKINS (High Detail)
// ═══════════════════════════════════════════════════════════════════════════

/** Carbon Fiber — high-tech woven pattern */
export function weaponCarbonFiberTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-carbon-fiber', 128, 128, (ctx) => {
    // Dark base
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(0, 0, 128, 128);

    // Carbon fiber weave pattern (twill)
    const tileSize = 8;
    for (let y = 0; y < 128; y += tileSize) {
      for (let x = 0; x < 128; x += tileSize) {
        const offsetX = Math.floor(y / tileSize) % 2 === 0 ? 0 : tileSize / 2;

        // Horizontal fibers
        const gradH = ctx.createLinearGradient(x, y, x, y + tileSize);
        gradH.addColorStop(0, '#1a1a1e');
        gradH.addColorStop(0.5, '#141418');
        gradH.addColorStop(1, '#0e0e12');
        ctx.fillStyle = gradH;
        ctx.fillRect(x + offsetX, y, tileSize / 2, tileSize);

        // Vertical fibers
        const gradV = ctx.createLinearGradient(x, y, x + tileSize, y);
        gradV.addColorStop(0, '#222228');
        gradV.addColorStop(0.5, '#1c1c22');
        gradV.addColorStop(1, '#18181e');
        ctx.fillStyle = gradV;
        ctx.fillRect(x + offsetX + tileSize / 2, y, tileSize / 2, tileSize);
      }
    }

    // Subtle grid lines (weave structure)
    ctx.strokeStyle = 'rgba(40,40,50,0.3)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 128; i += tileSize) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 128);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(128, i);
      ctx.stroke();
    }

    // Glossy resin coat (highlights)
    ctx.fillStyle = 'rgba(60,65,80,0.15)';
    ctx.fillRect(0, 0, 128, 2);
    ctx.fillRect(0, 32, 128, 1);
    ctx.fillRect(0, 64, 128, 2);

    addNoise(ctx, 128, 128, 8);
  });
}

/** Digital Camo — pixelated tactical pattern */
export function weaponDigitalCamoTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-digital-camo', 128, 128, (ctx) => {
    // Base color (medium gray)
    ctx.fillStyle = '#4a4d52';
    ctx.fillRect(0, 0, 128, 128);

    const colors = ['#2a2d32', '#3a3d42', '#5a5d62', '#6a6d72'];
    const pixelSize = 4;

    // Generate digital camo pattern
    for (let y = 0; y < 128; y += pixelSize) {
      for (let x = 0; x < 128; x += pixelSize) {
        // Clustered noise pattern for realistic camo
        const noiseVal = Math.sin(x * 0.1) * Math.cos(y * 0.1) + Math.random();
        if (noiseVal > 0.3) {
          const colorIdx = Math.floor(Math.random() * colors.length);
          ctx.fillStyle = colors[colorIdx];
          ctx.fillRect(x, y, pixelSize, pixelSize);
        }
      }
    }

    // Add some larger pixel clusters for variation
    for (let i = 0; i < 40; i++) {
      const cx = Math.floor(Math.random() * 128 / pixelSize) * pixelSize;
      const cy = Math.floor(Math.random() * 128 / pixelSize) * pixelSize;
      const size = (2 + Math.floor(Math.random() * 3)) * pixelSize;
      ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
      ctx.fillRect(cx, cy, size, size);
    }

    addNoise(ctx, 128, 128, 12);
  });
}

/** Gold Chrome — luxury metallic finish */
export function weaponGoldChromeTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-gold-chrome', 128, 128, (ctx) => {
    // Rich gold gradient base
    const grad = ctx.createLinearGradient(0, 0, 128, 128);
    grad.addColorStop(0, '#d4af37');
    grad.addColorStop(0.25, '#f4d03f');
    grad.addColorStop(0.5, '#e5b532');
    grad.addColorStop(0.75, '#c9a02e');
    grad.addColorStop(1, '#b8912a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    // Polished reflections (angled bright bands)
    const reflections = 8;
    for (let i = 0; i < reflections; i++) {
      const y = (i * 128) / reflections;
      const brightness = 0.15 + Math.sin(i * 0.8) * 0.1;
      ctx.fillStyle = `rgba(255,245,200,${brightness})`;
      ctx.fillRect(0, y, 128, 2);
    }

    // Diagonal shine streaks
    ctx.strokeStyle = 'rgba(255,250,220,0.25)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 12; i++) {
      const offset = i * 15 - 20;
      ctx.beginPath();
      ctx.moveTo(offset, 0);
      ctx.lineTo(offset + 128, 128);
      ctx.stroke();
    }

    // Dark edge shadows for depth
    ctx.fillStyle = 'rgba(80,60,20,0.2)';
    ctx.fillRect(0, 126, 128, 2);
    ctx.fillRect(126, 0, 2, 128);

    // Specular highlights
    ctx.fillStyle = 'rgba(255,255,240,0.4)';
    ctx.fillRect(0, 0, 128, 1);
    ctx.fillRect(0, 0, 1, 128);

    addNoise(ctx, 128, 128, 10);
  });
}

/** Damascus Steel — swirling pattern steel */
export function weaponDamascusSteelTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-damascus-steel', 128, 128, (ctx) => {
    // Steel gray base
    ctx.fillStyle = '#454850';
    ctx.fillRect(0, 0, 128, 128);

    // Damascus wavy pattern layers
    const layers = 16;
    for (let i = 0; i < layers; i++) {
      const phase = (i * Math.PI) / 8;
      const darkness = 0.15 + (i % 3) * 0.08;

      ctx.strokeStyle = `rgba(25,28,35,${darkness})`;
      ctx.lineWidth = 1.5 + (i % 2) * 0.8;
      ctx.beginPath();

      for (let x = 0; x <= 128; x += 2) {
        const y = 64 + Math.sin((x + phase * 20) * 0.08) * 30 * Math.cos(i * 0.3);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Add swirl patterns
    for (let i = 0; i < 6; i++) {
      const cx = 20 + i * 20;
      const cy = 30 + (i % 2) * 60;

      ctx.strokeStyle = `rgba(20,22,28,${0.2 + (i % 2) * 0.1})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 2; a += 0.1) {
        const r = 8 + a * 2;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r * 0.6;
        if (a === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Polished metallic highlights
    ctx.fillStyle = 'rgba(120,125,135,0.2)';
    ctx.fillRect(0, 0, 128, 1);
    for (let i = 0; i < 8; i++) {
      const y = 16 + i * 16;
      ctx.fillStyle = `rgba(100,105,115,${0.08 + (i % 2) * 0.04})`;
      ctx.fillRect(0, y, 128, 1);
    }

    addNoise(ctx, 128, 128, 14);
  });
}

/** Hex Pattern — tactical honeycomb */
export function weaponHexPatternTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-hex-pattern', 128, 128, (ctx) => {
    // Dark base
    ctx.fillStyle = '#1a1c22';
    ctx.fillRect(0, 0, 128, 128);

    const hexSize = 12;
    const hexHeight = hexSize * Math.sqrt(3);

    // Draw hexagonal grid
    for (let row = -1; row < 12; row++) {
      for (let col = -1; col < 12; col++) {
        const x = col * hexSize * 1.5;
        const y = row * hexHeight + (col % 2 === 0 ? 0 : hexHeight / 2);

        // Random hex fill
        const fillChance = Math.random();
        if (fillChance > 0.6) {
          ctx.fillStyle = '#2a2d35';
        } else if (fillChance > 0.3) {
          ctx.fillStyle = '#222530';
        } else {
          ctx.fillStyle = '#1e2028';
        }

        // Draw hexagon
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i;
          const hx = x + hexSize * Math.cos(angle);
          const hy = y + hexSize * Math.sin(angle);
          if (i === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.fill();

        // Hex outline
        ctx.strokeStyle = 'rgba(60,65,75,0.4)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }

    // Highlight edges
    ctx.fillStyle = 'rgba(80,85,95,0.2)';
    ctx.fillRect(0, 0, 128, 1);

    addNoise(ctx, 128, 128, 10);
  });
}

/** Tiger Stripe Camo — classic tactical */
export function weaponTigerStripeCamoTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-tiger-stripe', 128, 128, (ctx) => {
    // Tan base
    ctx.fillStyle = '#8a7a5f';
    ctx.fillRect(0, 0, 128, 128);

    // Dark green stripes
    ctx.fillStyle = '#3a3d2a';
    for (let i = 0; i < 20; i++) {
      const startY = Math.random() * 128;
      const waveFreq = 0.3 + Math.random() * 0.4;
      const waveAmp = 8 + Math.random() * 12;
      const thickness = 3 + Math.random() * 6;

      ctx.beginPath();
      for (let x = 0; x <= 128; x += 2) {
        const y = startY + Math.sin(x * waveFreq + i) * waveAmp;
        if (x === 0) ctx.moveTo(x, y - thickness / 2);
        else ctx.lineTo(x, y - thickness / 2);
      }
      for (let x = 128; x >= 0; x -= 2) {
        const y = startY + Math.sin(x * waveFreq + i) * waveAmp;
        ctx.lineTo(x, y + thickness / 2);
      }
      ctx.closePath();
      ctx.fill();
    }

    // Brown accent stripes
    ctx.fillStyle = 'rgba(60,50,35,0.5)';
    for (let i = 0; i < 12; i++) {
      const startY = Math.random() * 128;
      const waveFreq = 0.25 + Math.random() * 0.3;
      const waveAmp = 6 + Math.random() * 8;
      const thickness = 2 + Math.random() * 4;

      ctx.beginPath();
      for (let x = 0; x <= 128; x += 2) {
        const y = startY + Math.cos(x * waveFreq + i * 2) * waveAmp;
        if (x === 0) ctx.moveTo(x, y - thickness / 2);
        else ctx.lineTo(x, y - thickness / 2);
      }
      for (let x = 128; x >= 0; x -= 2) {
        const y = startY + Math.cos(x * waveFreq + i * 2) * waveAmp;
        ctx.lineTo(x, y + thickness / 2);
      }
      ctx.closePath();
      ctx.fill();
    }

    addNoise(ctx, 128, 128, 20);
  });
}

/** Urban Camo — gray city pattern */
export function weaponUrbanCamoTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-urban-camo', 128, 128, (ctx) => {
    // Light gray base
    ctx.fillStyle = '#7a7d82';
    ctx.fillRect(0, 0, 128, 128);

    const colors = ['#4a4d52', '#5a5d62', '#6a6d72', '#3a3d42', '#2a2d32'];

    // Organic splatter shapes for urban camo
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * 128;
      const y = Math.random() * 128;
      const size = 8 + Math.random() * 24;
      const color = colors[Math.floor(Math.random() * colors.length)];

      ctx.fillStyle = color;
      ctx.beginPath();

      // Irregular blob shape
      const points = 6 + Math.floor(Math.random() * 4);
      for (let j = 0; j < points; j++) {
        const angle = (j / points) * Math.PI * 2;
        const radius = size * (0.7 + Math.random() * 0.6);
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (j === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }

    addNoise(ctx, 128, 128, 18);
  });
}

/** Snake Skin — reptilian scales */
export function weaponSnakeSkinTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-snake-skin', 128, 128, (ctx) => {
    // Tan/beige base
    ctx.fillStyle = '#c4b89a';
    ctx.fillRect(0, 0, 128, 128);

    // Scale pattern
    const scaleSize = 12;
    for (let row = 0; row < 12; row++) {
      for (let col = 0; col < 12; col++) {
        const x = col * scaleSize + (row % 2 === 0 ? 0 : scaleSize / 2);
        const y = row * scaleSize * 0.7;

        // Scale shape (diamond-ish)
        const darkness = Math.random();
        if (darkness > 0.5) {
          ctx.fillStyle = `rgba(80,70,50,${0.3 + Math.random() * 0.3})`;
        } else {
          ctx.fillStyle = `rgba(100,90,70,${0.2 + Math.random() * 0.2})`;
        }

        ctx.beginPath();
        ctx.moveTo(x, y + scaleSize / 2);
        ctx.lineTo(x + scaleSize / 2, y);
        ctx.lineTo(x + scaleSize, y + scaleSize / 2);
        ctx.lineTo(x + scaleSize / 2, y + scaleSize * 0.8);
        ctx.closePath();
        ctx.fill();

        // Scale outline
        ctx.strokeStyle = 'rgba(60,50,35,0.4)';
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }

    // Random dark spots (python pattern)
    for (let i = 0; i < 25; i++) {
      const x = Math.random() * 128;
      const y = Math.random() * 128;
      const size = 3 + Math.random() * 8;

      ctx.fillStyle = `rgba(40,30,20,${0.4 + Math.random() * 0.3})`;
      ctx.beginPath();
      ctx.ellipse(x, y, size, size * 0.7, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    addNoise(ctx, 128, 128, 16);
  });
}

/** Racing Stripes — bold motorsport aesthetic */
export function weaponRacingStripesTexture(): THREE.CanvasTexture {
  return getOrCreate('weapon-racing-stripes', 128, 128, (ctx) => {
    // Black base
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(0, 0, 128, 128);

    // Red racing stripes (angled)
    const stripeAngle = Math.PI / 6; // 30 degrees
    ctx.save();
    ctx.translate(64, 64);
    ctx.rotate(stripeAngle);
    ctx.translate(-64, -64);

    // Main red stripe
    const grad = ctx.createLinearGradient(0, 54, 0, 74);
    grad.addColorStop(0, '#b81414');
    grad.addColorStop(0.5, '#d41818');
    grad.addColorStop(1, '#b81414');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 54, 128, 20);

    // White edge stripes
    ctx.fillStyle = '#f0f0f5';
    ctx.fillRect(0, 52, 128, 2);
    ctx.fillRect(0, 74, 128, 2);

    // Secondary stripe
    ctx.fillStyle = 'rgba(180,20,20,0.6)';
    ctx.fillRect(0, 40, 128, 8);

    ctx.restore();

    // Carbon fiber texture overlay
    for (let i = 0; i < 128; i += 4) {
      ctx.fillStyle = `rgba(20,20,25,${0.1 + (i % 8) * 0.02})`;
      ctx.fillRect(0, i, 128, 2);
    }

    addNoise(ctx, 128, 128, 8);
  });
}
