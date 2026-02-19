import * as THREE from 'three';

const cache = new Map<string, THREE.CanvasTexture>();

function create(key: string, size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  draw(ctx, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

// ── Shared helpers ──────────────────────────────────────────────────────────

/** Draw a simple riveted metal box face — adds edge shadow, rivet dots, scratches */
function drawMetalBox(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  baseColor: string,
  highlightColor: string,
  shadowColor: string,
) {
  // Base fill
  ctx.fillStyle = baseColor;
  ctx.fillRect(x, y, w, h);
  // Top-left bevel highlight
  ctx.fillStyle = highlightColor;
  ctx.fillRect(x, y, w, 2);
  ctx.fillRect(x, y, 2, h);
  // Bottom-right shadow
  ctx.fillStyle = shadowColor;
  ctx.fillRect(x, y + h - 2, w, 2);
  ctx.fillRect(x + w - 2, y, 2, h);
}

/** Draw bullet casing + tip at pixel coords */
function drawBullet(
  ctx: CanvasRenderingContext2D,
  cx: number, baseY: number, height: number,
  tipColor: string, casingColor: string, rimColor: string,
) {
  const half = 2;
  const tipH = Math.round(height * 0.35);
  const caseH = height - tipH;
  // Rim (base)
  ctx.fillStyle = rimColor;
  ctx.fillRect(cx - half - 1, baseY - 2, half * 2 + 2, 2);
  // Casing body
  ctx.fillStyle = casingColor;
  ctx.fillRect(cx - half, baseY - caseH, half * 2, caseH);
  // Neck step (slightly narrower just before tip)
  ctx.fillStyle = rimColor;
  ctx.fillRect(cx - half, baseY - caseH - 1, half * 2, 2);
  // Ogive tip (triangle)
  ctx.fillStyle = tipColor;
  ctx.beginPath();
  ctx.moveTo(cx - half, baseY - caseH);
  ctx.lineTo(cx, baseY - caseH - tipH);
  ctx.lineTo(cx + half, baseY - caseH);
  ctx.closePath();
  ctx.fill();
}

// ── Health ──────────────────────────────────────────────────────────────────

/** Red medkit — raised cross, bevel highlights, rivet corners */
export function healthTexture(): THREE.CanvasTexture {
  return create('health', 64, (ctx) => {
    // Body
    drawMetalBox(ctx, 0, 0, 64, 64, '#c42020', '#e05050', '#801010');
    // Darker inset panel
    drawMetalBox(ctx, 4, 4, 56, 56, '#b81c1c', '#d44040', '#781010');
    // Cross arms — slightly recessed look
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(20, 10, 24, 44); // vertical
    ctx.fillRect(10, 20, 44, 24); // horizontal
    // Cross edge shadow
    ctx.fillStyle = '#cccccc';
    ctx.fillRect(20, 10, 2, 44);
    ctx.fillRect(10, 20, 2, 24);
    ctx.fillStyle = '#aaaaaa';
    ctx.fillRect(42, 10, 2, 44);
    ctx.fillRect(42, 20, 2, 24);
    // Red center dot (GoldenEye style)
    ctx.fillStyle = '#cc2222';
    ctx.fillRect(28, 28, 8, 8);
    // Corner rivets
    const rivets = [[6,6],[58,6],[6,58],[58,58]];
    ctx.fillStyle = '#ee6666';
    for (const [rx,ry] of rivets) {
      ctx.beginPath(); ctx.arc(rx, ry, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#cc3333';
      ctx.beginPath(); ctx.arc(rx, ry, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ee6666';
    }
    // Subtle scratches on body edges
    ctx.fillStyle = 'rgba(255,100,100,0.35)';
    for (const [x, y, w] of [[2,15,4],[50,22,3],[3,45,5],[54,40,3],[10,60,3],[46,61,2]]) ctx.fillRect(x, y, w, 1);
    // Outer border
    ctx.strokeStyle = '#660000';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 62, 62);
  });
}

// ── Armor ───────────────────────────────────────────────────────────────────

/** Blue tactical vest panel — hexagonal pattern, brushed metal look */
export function armorTexture(): THREE.CanvasTexture {
  return create('armor', 64, (ctx) => {
    drawMetalBox(ctx, 0, 0, 64, 64, '#1a3366', '#3366cc', '#0d1a44');
    // Hex grid pattern (3×3 approximated with rounded rects)
    ctx.fillStyle = 'rgba(80,140,255,0.25)';
    const hexes = [[8,8],[24,8],[40,8],[16,22],[32,22],[48,22],[8,36],[24,36],[40,36],[16,50],[32,50],[48,50]];
    for (const [hx, hy] of hexes) {
      ctx.beginPath();
      for (let a = 0; a < 6; a++) {
        const angle = (a * Math.PI) / 3 - Math.PI / 6;
        const px = hx + 6 * Math.cos(angle);
        const py = hy + 6 * Math.sin(angle);
        if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
    // Central shield silhouette
    ctx.fillStyle = '#5599ff';
    ctx.beginPath();
    ctx.moveTo(32, 8);
    ctx.lineTo(52, 16);
    ctx.lineTo(52, 36);
    ctx.lineTo(32, 58);
    ctx.lineTo(12, 36);
    ctx.lineTo(12, 16);
    ctx.closePath();
    ctx.fill();
    // Shield inner gradient bevel
    ctx.fillStyle = '#3366bb';
    ctx.beginPath();
    ctx.moveTo(32, 14); ctx.lineTo(46, 20); ctx.lineTo(46, 35); ctx.lineTo(32, 52); ctx.lineTo(18, 35); ctx.lineTo(18, 20);
    ctx.closePath(); ctx.fill();
    // Chevron stripe
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(22, 30); ctx.lineTo(32, 40); ctx.lineTo(42, 30);
    ctx.stroke();
    // Shoulder strap lines
    ctx.strokeStyle = 'rgba(180,210,255,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(12, 16); ctx.lineTo(52, 16); ctx.stroke();
    // Border
    ctx.strokeStyle = '#0a1a33';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 62, 62);
  });
}

// ── Ammo: Pistol ─────────────────────────────────────────────────────────────

/** Warm brass — compact 9mm rounds in a row, olive drab crate face */
export function ammoPistolTexture(): THREE.CanvasTexture {
  return create('ammo-pistol', 64, (ctx) => {
    drawMetalBox(ctx, 0, 0, 64, 64, '#5c4a1e', '#8a7040', '#3a2e10');
    drawMetalBox(ctx, 3, 3, 58, 58, '#6b5520', '#9a8050', '#422f12');
    // Label band
    ctx.fillStyle = '#8a6a2a';
    ctx.fillRect(3, 38, 58, 16);
    ctx.fillStyle = '#c8a060';
    ctx.fillRect(3, 38, 58, 2);
    // "9MM" text
    ctx.fillStyle = '#ffe0a0';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('9MM', 32, 50);
    // Four upright pistol rounds
    const bx = [14, 23, 32, 41, 50];
    for (const x of bx) {
      drawBullet(ctx, x, 36, 22, '#b87333', '#d4a840', '#8a6a20');
    }
    // Corner rivets
    ctx.fillStyle = '#c8a050';
    for (const [rx, ry] of [[5,5],[59,5],[5,59],[59,59]]) {
      ctx.beginPath(); ctx.arc(rx, ry, 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = '#2a1a08';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 62, 62);
  });
}

// ── Ammo: Rifle ──────────────────────────────────────────────────────────────

/** Green NATO box — tall 7.62 rounds, military stencil label */
export function ammoRifleTexture(): THREE.CanvasTexture {
  return create('ammo-rifle', 64, (ctx) => {
    drawMetalBox(ctx, 0, 0, 64, 64, '#2e4a1e', '#4a7030', '#1a2e10');
    drawMetalBox(ctx, 3, 3, 58, 58, '#324e22', '#507838', '#1c3012');
    // Stencil stripe
    ctx.fillStyle = '#2a4018';
    ctx.fillRect(3, 40, 58, 14);
    // Label text
    ctx.fillStyle = '#90c870';
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('7.62×51', 32, 51);
    // Three tall rifle rounds
    const bx = [16, 30, 44];
    for (const x of bx) {
      drawBullet(ctx, x, 38, 28, '#8b8b60', '#bfb060', '#6a6040');
    }
    // Scratch marks
    ctx.fillStyle = 'rgba(150,200,100,0.3)';
    for (const [x, y, w] of [[5,12,6],[50,8,4],[8,25,3],[55,30,4],[6,52,5]]) ctx.fillRect(x, y, w, 1);
    // Corner bolts
    ctx.fillStyle = '#608040';
    for (const [rx, ry] of [[5,5],[59,5],[5,59],[59,59]]) {
      ctx.beginPath(); ctx.arc(rx, ry, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#304020';
      ctx.beginPath(); ctx.arc(rx, ry, 1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#608040';
    }
    ctx.strokeStyle = '#0e1e06';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 62, 62);
  });
}

// ── Ammo: Shotgun ────────────────────────────────────────────────────────────

/** Orange-red — fat 12ga shells standing upright, brass primers visible */
export function ammoShotgunTexture(): THREE.CanvasTexture {
  return create('ammo-shotgun', 64, (ctx) => {
    drawMetalBox(ctx, 0, 0, 64, 64, '#5a2210', '#8a4428', '#381408');
    drawMetalBox(ctx, 3, 3, 58, 58, '#622612', '#98502e', '#3e160a');
    // Bottom label
    ctx.fillStyle = '#802010';
    ctx.fillRect(3, 42, 58, 16);
    ctx.fillStyle = '#ff9060';
    ctx.fillRect(3, 42, 58, 2);
    ctx.fillStyle = '#ffd0b0';
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('12 GA', 32, 54);
    // Three fat shotgun shells
    const shellX = [12, 28, 44];
    for (const x of shellX) {
      // Hull (plastic body — red/orange gradient faked with layers)
      ctx.fillStyle = '#cc4422';
      ctx.fillRect(x - 5, 12, 10, 28);
      ctx.fillStyle = '#dd5533';
      ctx.fillRect(x - 4, 12, 4, 28); // highlight side
      // Crimp (top fold)
      ctx.fillStyle = '#993322';
      ctx.fillRect(x - 5, 10, 10, 3);
      // Brass head (base)
      ctx.fillStyle = '#c8922a';
      ctx.fillRect(x - 5, 40, 10, 4);
      // Primer dot
      ctx.fillStyle = '#e8b050';
      ctx.beginPath(); ctx.arc(x, 43, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6a4010';
      ctx.beginPath(); ctx.arc(x, 43, 0.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = '#280c04';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 62, 62);
  });
}

// ── Ammo: Sniper ─────────────────────────────────────────────────────────────

/** Cold blue-steel — long .338 Lapua rounds, precision markings */
export function ammoSniperTexture(): THREE.CanvasTexture {
  return create('ammo-sniper', 64, (ctx) => {
    drawMetalBox(ctx, 0, 0, 64, 64, '#1a2640', '#2e4466', '#0d1628');
    drawMetalBox(ctx, 3, 3, 58, 58, '#1e2e4c', '#344e78', '#101a30');
    // Precision grid lines
    ctx.strokeStyle = 'rgba(100,160,255,0.18)';
    ctx.lineWidth = 1;
    for (let i = 8; i < 60; i += 8) {
      ctx.beginPath(); ctx.moveTo(3, i); ctx.lineTo(61, i); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i, 3); ctx.lineTo(i, 61); ctx.stroke();
    }
    // Label strip
    ctx.fillStyle = '#0e1a30';
    ctx.fillRect(3, 44, 58, 14);
    ctx.fillStyle = '#4488dd';
    ctx.fillRect(3, 44, 58, 1);
    ctx.fillStyle = '#a0c8ff';
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('.338 LM', 32, 55);
    // Two long sniper rounds
    for (const x of [22, 42]) {
      drawBullet(ctx, x, 42, 32, '#aaaacc', '#c8c8e0', '#7070a0');
      // Cannelure groove ring on casing
      ctx.fillStyle = 'rgba(20,40,80,0.6)';
      ctx.fillRect(x - 2, 38, 4, 1);
    }
    // Crosshair tick marks (reticle reference)
    ctx.strokeStyle = 'rgba(150,200,255,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(32, 3); ctx.lineTo(32, 14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(32, 50); ctx.lineTo(32, 41); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, 24); ctx.lineTo(14, 24); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(61, 24); ctx.lineTo(50, 24); ctx.stroke();
    // Center dot
    ctx.fillStyle = 'rgba(150,200,255,0.6)';
    ctx.beginPath(); ctx.arc(32, 24, 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#060e1c';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 62, 62);
  });
}

// ── Keep existing exports ───────────────────────────────────────────────────

/** Generic ammo texture (fallback / backward compat) */
export function ammoTexture(): THREE.CanvasTexture {
  return ammoPistolTexture();
}

/** Green with weapon silhouette */
export function weaponTexture(): THREE.CanvasTexture {
  return create('weapon', 64, (ctx) => {
    drawMetalBox(ctx, 0, 0, 64, 64, '#1e3a1e', '#385e38', '#0f1f0f');
    // Gun silhouette
    ctx.fillStyle = '#222222';
    ctx.fillRect(8, 26, 48, 10); // barrel
    ctx.fillRect(44, 36, 10, 18); // grip
    ctx.fillRect(8, 26, 16, 18); // receiver box
    // Trigger guard arc
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(42, 40, 7, 0, Math.PI);
    ctx.stroke();
    // Ejection port
    ctx.fillStyle = '#111111';
    ctx.fillRect(28, 26, 10, 6);
    ctx.strokeStyle = '#0a1a0a';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 62, 62);
  });
}

/** Yellow keycard with chip */
export function keyTexture(): THREE.CanvasTexture {
  return create('key', 64, (ctx) => {
    drawMetalBox(ctx, 0, 0, 64, 64, '#c8a820', '#e8cc60', '#806800');
    // Magnetic stripe
    ctx.fillStyle = '#111111';
    ctx.fillRect(4, 44, 56, 10);
    // Stripe shimmer
    ctx.fillStyle = 'rgba(80,80,80,0.5)';
    ctx.fillRect(4, 46, 56, 2);
    // Security chip
    ctx.fillStyle = '#c0a020';
    ctx.fillRect(8, 10, 22, 18);
    ctx.strokeStyle = '#806800';
    ctx.lineWidth = 1;
    ctx.strokeRect(8, 10, 22, 18);
    // Chip contacts
    ctx.fillStyle = '#d4b840';
    const contacts = [[8,12],[8,16],[8,20],[26,12],[26,16],[26,20]];
    for (const [cx, cy] of contacts) ctx.fillRect(cx, cy, 4, 2);
    // Logo placeholder
    ctx.fillStyle = '#e8c840';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('KEY', 46, 24);
    ctx.strokeStyle = '#604800';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 62, 62);
  });
}
