import * as THREE from 'three';

const cache = new Map<string, THREE.CanvasTexture>();

function getOrCreate(key: string, width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
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

// ─── Helpers ───

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

// ─── Concrete Wall (Facility — poured concrete, irregular weathering) ───

export function concreteWallTexture(): THREE.CanvasTexture {
  return getOrCreate('concrete-wall', 256, 256, (ctx) => {
    const W = 256, H = 256;

    // Base concrete color - cool grey with slight variation
    ctx.fillStyle = '#6a6e72';
    ctx.fillRect(0, 0, W, H);

    // Subtle color variation zones (poured in sections)
    for (let i = 0; i < 8; i++) {
      const x = Math.random() * W - W * 0.2;
      const y = Math.random() * H - H * 0.2;
      const size = 60 + Math.random() * 80;

      const grad = ctx.createRadialGradient(x, y, 0, x, y, size);
      grad.addColorStop(0, `rgba(${80 + Math.random() * 20}, ${84 + Math.random() * 20}, ${88 + Math.random() * 20}, 0.3)`);
      grad.addColorStop(1, 'rgba(106, 110, 114, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    // Panel seams (offset grid to avoid perfect symmetry)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = 2;

    // Vertical seams (slightly irregular spacing)
    const vSeams = [0, 128 + (Math.random() - 0.5) * 10, 256];
    vSeams.forEach((x) => {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    });

    // Horizontal seam (NOT centered - asymmetry breaks tiling pattern)
    const hSeam = 85 + (Math.random() - 0.5) * 10;
    ctx.beginPath();
    ctx.moveTo(0, hSeam);
    ctx.lineTo(W, hSeam);
    ctx.stroke();

    // Micro-texture: concrete aggregate
    for (let i = 0; i < 600; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      const size = Math.random() * 1.5;
      const alpha = 0.05 + Math.random() * 0.1;

      ctx.fillStyle = Math.random() > 0.5 ? `rgba(255, 255, 255, ${alpha})` : `rgba(0, 0, 0, ${alpha})`;
      ctx.fillRect(x, y, size, size);
    }

    // Edge wear at seams (darker accumulation)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.lineWidth = 1;
    vSeams.forEach((x) => {
      ctx.beginPath();
      ctx.moveTo(x - 1, 0);
      ctx.lineTo(x - 1, H);
      ctx.stroke();
    });

    // Water stains (vertical drips from top)
    for (let i = 0; i < 3; i++) {
      const x = Math.random() * W;
      const stainGrad = ctx.createLinearGradient(x, 0, x, H * 0.6);
      stainGrad.addColorStop(0, 'rgba(40, 40, 45, 0.2)');
      stainGrad.addColorStop(1, 'rgba(40, 40, 45, 0)');

      ctx.fillStyle = stainGrad;
      ctx.fillRect(x - 3, 0, 6 + Math.random() * 4, H * 0.6);
    }

    addNoise(ctx, W, H, 6);
  });
}

// ─── Floor Tile (Facility — industrial vinyl tile, 12"×12" pattern) ───

export function floorTileTexture(): THREE.CanvasTexture {
  return getOrCreate('floor-tile', 256, 256, (ctx) => {
    const W = 256, H = 256;
    const tileSize = 64; // 4×4 grid in 256px
    const groutWidth = 3;

    // Base floor color - institutional grey-beige
    ctx.fillStyle = '#8a8878';
    ctx.fillRect(0, 0, W, H);

    // Draw tiles with variation
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const x = col * tileSize;
        const y = row * tileSize;

        // Per-tile color variation (some tiles slightly darker/lighter)
        const variance = (Math.random() - 0.5) * 15;
        const r = 138 + variance;
        const g = 136 + variance;
        const b = 120 + variance * 0.8;

        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(x + groutWidth, y + groutWidth, tileSize - groutWidth * 2, tileSize - groutWidth * 2);

        // Tile surface texture (subtle speckle)
        for (let i = 0; i < 40; i++) {
          const tx = x + groutWidth + Math.random() * (tileSize - groutWidth * 2);
          const ty = y + groutWidth + Math.random() * (tileSize - groutWidth * 2);
          const spec = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
          ctx.fillStyle = spec;
          ctx.fillRect(tx, ty, 1, 1);
        }
      }
    }

    // Grout lines (darker gaps)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    for (let i = 0; i <= 4; i++) {
      ctx.fillRect(0, i * tileSize - groutWidth / 2, W, groutWidth);
      ctx.fillRect(i * tileSize - groutWidth / 2, 0, groutWidth, H);
    }

    // Scuff marks (black streaks from foot traffic)
    for (let i = 0; i < 5; i++) {
      const sx = Math.random() * W;
      const sy = Math.random() * H;
      const angle = Math.random() * Math.PI * 2;
      const length = 10 + Math.random() * 20;

      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(angle);

      const scuffGrad = ctx.createLinearGradient(0, 0, length, 0);
      scuffGrad.addColorStop(0, 'rgba(20, 20, 20, 0.3)');
      scuffGrad.addColorStop(0.5, 'rgba(20, 20, 20, 0.15)');
      scuffGrad.addColorStop(1, 'rgba(20, 20, 20, 0)');

      ctx.fillStyle = scuffGrad;
      ctx.fillRect(0, -0.5, length, 1);
      ctx.restore();
    }

    // Worn traffic paths (subtle darkening in center)
    const wearGrad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6);
    wearGrad.addColorStop(0, 'rgba(0, 0, 0, 0.08)');
    wearGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = wearGrad;
    ctx.fillRect(0, 0, W, H);

    addNoise(ctx, W, H, 4);
  });
}

// ─── Ceiling Panel (Facility — drop ceiling, 2'×2' acoustic tiles) ───

export function ceilingPanelTexture(): THREE.CanvasTexture {
  return getOrCreate('ceiling-panel', 256, 256, (ctx) => {
    const W = 256, H = 256;
    const panelSize = 128; // 2×2 grid
    const frameWidth = 4;

    // Base ceiling white (slightly yellowed from age)
    ctx.fillStyle = '#e8e4d8';
    ctx.fillRect(0, 0, W, H);

    // Panel shadows (slight depression from grid)
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        const x = col * panelSize;
        const y = row * panelSize;

        // Inner shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.fillRect(x + frameWidth, y + frameWidth, panelSize - frameWidth * 2, panelSize - frameWidth * 2);

        // Acoustic perforations (tiny dots)
        const perfSpacing = 8;
        const perfSize = 1.5;

        for (let py = perfSpacing; py < panelSize - frameWidth * 2; py += perfSpacing) {
          for (let px = perfSpacing; px < panelSize - frameWidth * 2; px += perfSpacing) {
            const offsetX = (py / perfSpacing) % 2 === 0 ? 0 : perfSpacing / 2;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
            ctx.beginPath();
            ctx.arc(x + frameWidth + px + offsetX, y + frameWidth + py, perfSize, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    // Grid frame (metal T-bar system)
    ctx.fillStyle = '#9a9a9a';
    for (let i = 0; i <= 2; i++) {
      ctx.fillRect(0, i * panelSize - frameWidth / 2, W, frameWidth);
      ctx.fillRect(i * panelSize - frameWidth / 2, 0, frameWidth, H);
    }

    // Frame highlights (metallic shine)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * panelSize - frameWidth / 2);
      ctx.lineTo(W, i * panelSize - frameWidth / 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(i * panelSize - frameWidth / 2, 0);
      ctx.lineTo(i * panelSize - frameWidth / 2, H);
      ctx.stroke();
    }

    // Water stains (yellow/brown spots)
    for (let i = 0; i < 2; i++) {
      const sx = Math.random() * W;
      const sy = Math.random() * H;
      const size = 30 + Math.random() * 40;

      const stainGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, size);
      stainGrad.addColorStop(0, 'rgba(160, 140, 80, 0.15)');
      stainGrad.addColorStop(0.6, 'rgba(160, 140, 80, 0.05)');
      stainGrad.addColorStop(1, 'rgba(160, 140, 80, 0)');

      ctx.fillStyle = stainGrad;
      ctx.fillRect(0, 0, W, H);
    }

    addNoise(ctx, W, H, 3);
  });
}

// ─── Wasteland Wall (Weathered concrete/metal, rust, decay) ───

export function wastelandWallTexture(): THREE.CanvasTexture {
  return getOrCreate('wasteland-wall', 256, 256, (ctx) => {
    const W = 256, H = 256;

    // Dirty concrete base
    ctx.fillStyle = '#5a5e52';
    ctx.fillRect(0, 0, W, H);

    // Color variation (stains, weathering)
    for (let i = 0; i < 15; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      const size = 40 + Math.random() * 80;

      const stainGrad = ctx.createRadialGradient(x, y, 0, x, y, size);
      const isDark = Math.random() > 0.4;
      if (isDark) {
        stainGrad.addColorStop(0, 'rgba(40, 42, 38, 0.4)');
        stainGrad.addColorStop(1, 'rgba(40, 42, 38, 0)');
      } else {
        stainGrad.addColorStop(0, 'rgba(100, 104, 92, 0.3)');
        stainGrad.addColorStop(1, 'rgba(100, 104, 92, 0)');
      }

      ctx.fillStyle = stainGrad;
      ctx.fillRect(0, 0, W, H);
    }

    // Metal panel overlays (rusted corrugated sheets)
    const panelCount = 3;
    for (let i = 0; i < panelCount; i++) {
      const px = i * (W / panelCount);
      const panelW = W / panelCount + 5;

      const rustBase = Math.floor(120 + Math.random() * 20);
      ctx.fillStyle = `rgb(${rustBase}, ${rustBase - 30}, ${rustBase - 50})`;
      ctx.fillRect(px, 0, panelW, H);

      ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.lineWidth = 1;
      for (let x = 0; x < panelW; x += 8) {
        ctx.beginPath();
        ctx.moveTo(px + x, 0);
        ctx.lineTo(px + x, H);
        ctx.stroke();
      }

      for (let r = 0; r < 4; r++) {
        const rx = px + Math.random() * panelW;
        const rustGrad = ctx.createLinearGradient(rx, 0, rx, H);
        rustGrad.addColorStop(0, 'rgba(140, 70, 30, 0.4)');
        rustGrad.addColorStop(0.4, 'rgba(120, 60, 25, 0.3)');
        rustGrad.addColorStop(1, 'rgba(100, 50, 20, 0.1)');

        ctx.fillStyle = rustGrad;
        ctx.fillRect(rx - 2, 0, 3 + Math.random() * 4, H);
      }
    }

    // Bolts/rivets
    ctx.fillStyle = '#4a4a45';
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < panelCount; i++) {
        const bx = i * (W / panelCount) + 10;
        const by = row * (H / 4) + 20;

        ctx.beginPath();
        ctx.arc(bx, by, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(140, 70, 30, 0.3)';
        ctx.beginPath();
        ctx.arc(bx, by, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#4a4a45';
      }
    }

    // Bullet holes / impact damage
    for (let i = 0; i < 3; i++) {
      const hx = Math.random() * W;
      const hy = Math.random() * H;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.beginPath();
      ctx.arc(hx, hy, 2 + Math.random() * 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(100, 50, 20, 0.3)';
      ctx.beginPath();
      ctx.arc(hx, hy, 5 + Math.random() * 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Cracks in concrete
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const sx = Math.random() * W;
      const sy = Math.random() * H;

      ctx.beginPath();
      ctx.moveTo(sx, sy);

      let x = sx, y = sy;
      for (let step = 0; step < 6; step++) {
        x += (Math.random() - 0.5) * 20;
        y += (Math.random() - 0.5) * 20;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    addNoise(ctx, W, H, 12);
  });
}

// ─── Wasteland Floor (Cracked, dusty desert floor) ───

export function wastelandFloorTexture(): THREE.CanvasTexture {
  return getOrCreate('wasteland-floor', 256, 256, (ctx) => {
    const W = 256, H = 256;

    // Sandy desert base
    const baseGrad = ctx.createLinearGradient(0, 0, W, H);
    baseGrad.addColorStop(0, '#b8a890');
    baseGrad.addColorStop(0.5, '#a89878');
    baseGrad.addColorStop(1, '#98886a');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, W, H);

    // Dust clouds (color variation)
    for (let i = 0; i < 20; i++) {
      const dx = Math.random() * W;
      const dy = Math.random() * H;
      const size = 30 + Math.random() * 60;

      const dustGrad = ctx.createRadialGradient(dx, dy, 0, dx, dy, size);
      dustGrad.addColorStop(0, 'rgba(200, 180, 150, 0.2)');
      dustGrad.addColorStop(1, 'rgba(200, 180, 150, 0)');

      ctx.fillStyle = dustGrad;
      ctx.fillRect(0, 0, W, H);
    }

    // Large cracks (dried earth)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 2;

    const crackSeeds = [
      { x: 0, y: H * 0.3 },
      { x: W * 0.6, y: 0 },
      { x: W, y: H * 0.7 },
    ];

    crackSeeds.forEach((seed) => {
      ctx.beginPath();
      ctx.moveTo(seed.x, seed.y);

      let x = seed.x, y = seed.y;
      for (let step = 0; step < 10; step++) {
        const angle = Math.random() * Math.PI * 2;
        x += Math.cos(angle) * (15 + Math.random() * 20);
        y += Math.sin(angle) * (15 + Math.random() * 20);

        ctx.lineTo(x, y);

        if (Math.random() > 0.7) {
          const branchX = x + (Math.random() - 0.5) * 30;
          const branchY = y + (Math.random() - 0.5) * 30;
          ctx.moveTo(x, y);
          ctx.lineTo(branchX, branchY);
          ctx.moveTo(x, y);
        }
      }
      ctx.stroke();
    });

    // Small fissures
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 30; i++) {
      const fx = Math.random() * W;
      const fy = Math.random() * H;
      const length = 10 + Math.random() * 20;
      const angle = Math.random() * Math.PI * 2;

      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + Math.cos(angle) * length, fy + Math.sin(angle) * length);
      ctx.stroke();
    }

    // Tire tracks
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.lineWidth = 8;

    const trackY = H * (0.3 + Math.random() * 0.4);
    ctx.beginPath();
    ctx.moveTo(0, trackY);
    for (let x = 0; x <= W; x += 20) {
      ctx.lineTo(x, trackY + (Math.random() - 0.5) * 6);
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, trackY + 30);
    for (let x = 0; x <= W; x += 20) {
      ctx.lineTo(x, trackY + 30 + (Math.random() - 0.5) * 6);
    }
    ctx.stroke();

    // Small rocks/debris
    for (let i = 0; i < 15; i++) {
      const rx = Math.random() * W;
      const ry = Math.random() * H;
      const size = 2 + Math.random() * 4;

      ctx.fillStyle = `rgba(${80 + Math.random() * 40}, ${70 + Math.random() * 30}, ${50 + Math.random() * 20}, 0.6)`;
      ctx.fillRect(rx, ry, size, size);
    }

    addNoise(ctx, W, H, 8);
  });
}

// ─── Wasteland Ceiling (Fluorescent with vent grilles, rust accents) ───

export function wastelandCeilingTexture(): THREE.CanvasTexture {
  return getOrCreate('wasteland-ceiling', 256, 256, (ctx) => {
    const W = 256, H = 256;
    ctx.fillStyle = '#4a4e48';
    ctx.fillRect(0, 0, W, H);

    const panels = 2;
    const panelSize = W / panels;
    const frameW = 6;

    for (let r = 0; r < panels; r++) {
      for (let c = 0; c < panels; c++) {
        const px = c * panelSize;
        const py = r * panelSize;
        const shade = 115 + Math.floor(Math.random() * 12 - 6);
        ctx.fillStyle = `rgb(${shade}, ${shade - 2}, ${shade - 4})`;
        ctx.fillRect(px + frameW, py + frameW, panelSize - frameW * 2, panelSize - frameW * 2);

        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(px + frameW, py + frameW, panelSize - frameW * 2, 4);
        ctx.fillRect(px + frameW, py + frameW, 4, panelSize - frameW * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(px + frameW, py + panelSize - frameW - 4, panelSize - frameW * 2, 4);
        ctx.fillRect(px + panelSize - frameW - 4, py + frameW, 4, panelSize - frameW * 2);

        if (r === 0 && c === 1) {
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          for (let vy = py + 30; vy < py + panelSize - 30; vy += 12) {
            for (let vx = px + 30; vx < px + panelSize - 30; vx += 12) {
              ctx.beginPath();
              ctx.arc(vx, vy, 2, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
    }

    ctx.fillStyle = '#555850';
    for (let i = 0; i <= panels; i++) {
      ctx.fillRect(0, i * panelSize - frameW / 2, W, frameW);
      ctx.fillRect(i * panelSize - frameW / 2, 0, frameW, H);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i <= panels; i++) {
      ctx.fillRect(0, i * panelSize - frameW / 2, W, 1);
      ctx.fillRect(i * panelSize - frameW / 2, 0, 1, H);
    }

    // Fluorescent tubes — slight green tint (vault/industrial)
    ctx.fillStyle = '#aacc99';
    ctx.globalAlpha = 0.55;
    ctx.fillRect(30, 50, 10, 56);
    ctx.fillRect(86, 50, 10, 56);
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#ccffbb';
    ctx.fillRect(20, 40, 86, 76);
    ctx.globalAlpha = 1;

    // Rust around one panel
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#8b5a2a';
    ctx.fillRect(140, 140, 30, 12);
    ctx.fillRect(100, 200, 50, 8);
    ctx.globalAlpha = 1;

    addNoise(ctx, W, H, 14);
  });
}

// ─── Palace Marble Floor (Polished marble with gold inlay) ───

export function palaceMarbleFloorTexture(): THREE.CanvasTexture {
  return getOrCreate('palace-marble-floor', 256, 256, (ctx) => {
    const W = 256, H = 256;
    const tileSize = 128; // 2×2 large format tiles

    // Polished marble base (warmer than walls)
    ctx.fillStyle = '#f2e6d0';
    ctx.fillRect(0, 0, W, H);

    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        const x = col * tileSize;
        const y = row * tileSize;

        const tint = Math.random() * 10 - 5;
        ctx.fillStyle = `rgb(${242 + tint}, ${230 + tint}, ${208 + tint * 0.8})`;
        ctx.fillRect(x, y, tileSize, tileSize);

        ctx.strokeStyle = 'rgba(200, 180, 150, 0.25)';
        ctx.lineWidth = 2;

        for (let v = 0; v < 3; v++) {
          ctx.beginPath();
          ctx.moveTo(x + Math.random() * tileSize, y);

          let vx = x + Math.random() * tileSize;
          let vy = y;

          for (let step = 0; step < 6; step++) {
            vx += (Math.random() - 0.5) * 30;
            vy += tileSize / 6;
            ctx.lineTo(vx, vy);
          }

          ctx.stroke();
        }
      }
    }

    // Gold inlay grid (decorative)
    ctx.strokeStyle = 'rgba(180, 150, 80, 0.6)';
    ctx.lineWidth = 3;

    for (let i = 0; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * tileSize);
      ctx.lineTo(W, i * tileSize);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(i * tileSize, 0);
      ctx.lineTo(i * tileSize, H);
      ctx.stroke();
    }

    // Gold highlight (metallic shine)
    ctx.strokeStyle = 'rgba(220, 200, 120, 0.4)';
    ctx.lineWidth = 1;

    for (let i = 0; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * tileSize - 1);
      ctx.lineTo(W, i * tileSize - 1);
      ctx.stroke();
    }

    // Polished reflection spots
    for (let i = 0; i < 6; i++) {
      const hx = Math.random() * W;
      const hy = Math.random() * H;

      const highlight = ctx.createRadialGradient(hx, hy, 0, hx, hy, 15);
      highlight.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
      highlight.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.fillStyle = highlight;
      ctx.fillRect(0, 0, W, H);
    }

    addNoise(ctx, W, H, 2);
  });
}

export function palaceWallTexture(): THREE.CanvasTexture {
  return getOrCreate('palace-wall', 256, 256, (ctx) => {
    const W = 256, H = 256;

    // Cream marble base
    const baseGrad = ctx.createLinearGradient(0, 0, W, H);
    baseGrad.addColorStop(0, '#f5f0e8');
    baseGrad.addColorStop(0.5, '#f0ead8');
    baseGrad.addColorStop(1, '#ebe5d0');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, W, H);

    // Marble veining (irregular diagonal streaks)
    ctx.strokeStyle = 'rgba(180, 170, 150, 0.3)';
    ctx.lineWidth = 1.5;

    for (let i = 0; i < 8; i++) {
      const startX = Math.random() * W * 0.3;
      const startY = Math.random() * H;

      ctx.beginPath();
      ctx.moveTo(startX, startY);

      let x = startX;
      let y = startY;
      const angle = -0.3 + Math.random() * 0.2;

      for (let step = 0; step < 12; step++) {
        x += 20 + Math.random() * 15;
        y += Math.tan(angle) * 20 + (Math.random() - 0.5) * 10;

        ctx.lineTo(x, y);
      }

      ctx.stroke();
    }

    // Stone block seams (subtle)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();

    // Gold trim accent
    ctx.strokeStyle = 'rgba(200, 170, 100, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H / 2 - 1);
    ctx.lineTo(W, H / 2 - 1);
    ctx.stroke();

    // Polished surface variation (cloud-like patches)
    for (let i = 0; i < 10; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      const size = 40 + Math.random() * 50;

      const cloudGrad = ctx.createRadialGradient(x, y, 0, x, y, size);
      cloudGrad.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
      cloudGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.fillStyle = cloudGrad;
      ctx.fillRect(0, 0, W, H);
    }

    addNoise(ctx, W, H, 2);
  });
}

export function palaceCeilingTexture(): THREE.CanvasTexture {
  return getOrCreate('palace-ceiling', 256, 256, (ctx) => {
    const W = 256, H = 256;
    const cofferSize = 128; // 2×2 coffered panels

    // Rich cream ceiling base
    ctx.fillStyle = '#f8f4e8';
    ctx.fillRect(0, 0, W, H);

    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        const x = col * cofferSize;
        const y = row * cofferSize;

        const recessDepth = 12;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
        ctx.fillRect(x + recessDepth, y + recessDepth, cofferSize - recessDepth * 2, cofferSize - recessDepth * 2);

        ctx.fillStyle = '#fffef5';
        ctx.fillRect(x + recessDepth + 2, y + recessDepth + 2, cofferSize - recessDepth * 2 - 4, cofferSize - recessDepth * 2 - 4);

        const cx = x + cofferSize / 2;
        const cy = y + cofferSize / 2;

        ctx.fillStyle = 'rgba(180, 160, 100, 0.3)';
        ctx.beginPath();
        ctx.arc(cx, cy, 18, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(200, 170, 100, 0.5)';
        ctx.beginPath();
        ctx.arc(cx, cy, 12, 0, Math.PI * 2);
        ctx.fill();

        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2;
          const px = cx + Math.cos(angle) * 8;
          const py = cy + Math.sin(angle) * 8;

          ctx.fillStyle = 'rgba(220, 190, 110, 0.4)';
          ctx.beginPath();
          ctx.arc(px, py, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Coffer beams
    ctx.fillStyle = '#e8dcc0';
    for (let i = 0; i <= 2; i++) {
      ctx.fillRect(0, i * cofferSize - 6, W, 12);
      ctx.fillRect(i * cofferSize - 6, 0, 12, H);
    }

    // Gold leaf accent on beams
    ctx.strokeStyle = 'rgba(200, 170, 100, 0.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * cofferSize - 1);
      ctx.lineTo(W, i * cofferSize - 1);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(i * cofferSize - 1, 0);
      ctx.lineTo(i * cofferSize - 1, H);
      ctx.stroke();
    }

    // Beam highlights
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * cofferSize - 7);
      ctx.lineTo(W, i * cofferSize - 7);
      ctx.stroke();
    }

    addNoise(ctx, W, H, 2);
  });
}

export function palacePaintingTexture(): THREE.CanvasTexture {
  return getOrCreate('palace-painting', 256, 160, (ctx) => {
    const W = 256;
    const H = 160;

    // Outer gold frame
    const frameGrad = ctx.createLinearGradient(0, 0, W, H);
    frameGrad.addColorStop(0, '#6f5217');
    frameGrad.addColorStop(0.5, '#d5ba6e');
    frameGrad.addColorStop(1, '#6f5217');
    ctx.fillStyle = frameGrad;
    ctx.fillRect(0, 0, W, H);

    // Inner dark frame lip
    ctx.fillStyle = '#3a2e15';
    ctx.fillRect(10, 10, W - 20, H - 20);

    // Canvas area
    const px = 16;
    const py = 16;
    const pw = W - 32;
    const ph = H - 32;
    const sky = ctx.createLinearGradient(px, py, px, py + ph);
    sky.addColorStop(0, '#6b8cb1');
    sky.addColorStop(0.55, '#8ca07a');
    sky.addColorStop(1, '#4f4638');
    ctx.fillStyle = sky;
    ctx.fillRect(px, py, pw, ph);

    // Sun
    ctx.fillStyle = 'rgba(236, 220, 150, 0.9)';
    ctx.beginPath();
    ctx.arc(px + pw * 0.18, py + ph * 0.26, 9, 0, Math.PI * 2);
    ctx.fill();

    // Mountains
    ctx.fillStyle = '#2f4a2f';
    ctx.beginPath();
    ctx.moveTo(px + 8, py + ph - 6);
    ctx.lineTo(px + pw * 0.44, py + ph * 0.48);
    ctx.lineTo(px + pw * 0.84, py + ph - 6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#496246';
    ctx.beginPath();
    ctx.moveTo(px + pw * 0.34, py + ph - 6);
    ctx.lineTo(px + pw * 0.58, py + ph * 0.58);
    ctx.lineTo(px + pw * 0.95, py + ph - 6);
    ctx.closePath();
    ctx.fill();

    addNoise(ctx, W, H, 6);
  });
}

// ─── Wood Crate (Military shipping crate, rough pine planks) ───

export function woodCrateTexture(): THREE.CanvasTexture {
  return getOrCreate('wood-crate', 256, 256, (ctx) => {
    const W = 256, H = 256;

    ctx.fillStyle = '#8B6B43';
    ctx.fillRect(0, 0, W, H);

    const plankCount = 6;
    const plankH = H / plankCount;
    const gapH = 4;

    for (let i = 0; i < plankCount; i++) {
      const py = i * plankH;

      const shade = (Math.random() - 0.5) * 25;
      const r = 139 + shade;
      const g = 107 + shade * 0.8;
      const b = 67 + shade * 0.5;
      ctx.fillStyle = `rgb(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)})`;
      ctx.fillRect(0, py + gapH / 2, W, plankH - gapH);

      ctx.strokeStyle = `rgba(${60 + Math.random() * 20}, ${40 + Math.random() * 15}, ${20 + Math.random() * 10}, 0.3)`;
      ctx.lineWidth = 1;

      for (let l = 0; l < 8; l++) {
        const gy = py + gapH / 2 + Math.random() * (plankH - gapH);

        ctx.beginPath();
        ctx.moveTo(0, gy);

        for (let gx = 0; gx <= W; gx += 15) {
          ctx.lineTo(gx, gy + (Math.random() - 0.5) * 2);
        }
        ctx.stroke();
      }

      if (Math.random() > 0.5) {
        const kx = 30 + Math.random() * (W - 60);
        const ky = py + plankH / 2;

        ctx.fillStyle = 'rgba(60, 40, 20, 0.4)';
        ctx.beginPath();
        ctx.ellipse(kx, ky, 8, 12, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    for (let i = 0; i < plankCount; i++) {
      const py = i * plankH;
      ctx.fillRect(0, py, W, gapH / 2);
    }

    const bandPositions = [W * 0.2, W * 0.5, W * 0.8];
    bandPositions.forEach((bx) => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(bx - 12, 0, 24, H);

      const metalGrad = ctx.createLinearGradient(bx - 10, 0, bx + 10, 0);
      metalGrad.addColorStop(0, '#4a4a45');
      metalGrad.addColorStop(0.3, '#6a6a62');
      metalGrad.addColorStop(0.5, '#5a5a52');
      metalGrad.addColorStop(0.7, '#6a6a62');
      metalGrad.addColorStop(1, '#4a4a45');
      ctx.fillStyle = metalGrad;
      ctx.fillRect(bx - 10, 0, 20, H);

      for (let i = 0; i < plankCount; i++) {
        const ry = i * plankH + plankH / 2;

        ctx.fillStyle = '#3a3a35';
        ctx.beginPath();
        ctx.arc(bx, ry, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.beginPath();
        ctx.arc(bx - 1, ry - 1, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.font = 'bold 24px monospace';
    ctx.fillText('MIL-C-104', W * 0.15, H * 0.9);

    addNoise(ctx, W, H, 6);
  });
}

// ─── Metal Crate (Steel shipping container with rivets) ───

export function metalCrateTexture(): THREE.CanvasTexture {
  return getOrCreate('metal-crate', 256, 256, (ctx) => {
    const W = 256, H = 256;

    ctx.fillStyle = '#566878';
    ctx.fillRect(0, 0, W, H);

    const frameW = 18;
    ctx.fillStyle = '#4a5a6a';
    ctx.fillRect(0, 0, W, frameW);
    ctx.fillRect(0, H - frameW, W, frameW);
    ctx.fillRect(0, 0, frameW, H);
    ctx.fillRect(W - frameW, 0, frameW, H);

    ctx.fillStyle = '#667888';
    ctx.fillRect(frameW + 3, frameW + 3, W - frameW * 2 - 6, H - frameW * 2 - 6);

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(frameW, H / 2);
    ctx.lineTo(W - frameW, H / 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(W / 2, frameW);
    ctx.lineTo(W / 2, H - frameW);
    ctx.stroke();

    const rivetSpacing = 32;
    ctx.fillStyle = '#3a4a5a';

    for (let x = rivetSpacing; x < W - frameW; x += rivetSpacing) {
      ctx.beginPath();
      ctx.arc(x, frameW / 2, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.beginPath();
      ctx.arc(x - 1, frameW / 2 - 1, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3a4a5a';

      ctx.beginPath();
      ctx.arc(x, H - frameW / 2, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let y = rivetSpacing; y < H - frameW; y += rivetSpacing) {
      ctx.beginPath();
      ctx.arc(frameW / 2, y, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(W - frameW / 2, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    const cornerSize = 40;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 2;

    ctx.strokeRect(frameW, frameW, cornerSize, cornerSize);
    ctx.strokeRect(W - frameW - cornerSize, frameW, cornerSize, cornerSize);
    ctx.strokeRect(frameW, H - frameW - cornerSize, cornerSize, cornerSize);
    ctx.strokeRect(W - frameW - cornerSize, H - frameW - cornerSize, cornerSize, cornerSize);

    const stripeW = 20;
    const stripeAngle = Math.PI / 4;

    ctx.save();
    ctx.translate(frameW + 10, H - frameW - 40);
    ctx.rotate(-stripeAngle);

    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#e8c820' : '#1a1a1a';
      ctx.fillRect(i * stripeW, 0, stripeW, 12);
    }
    ctx.restore();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = 'bold 28px monospace';
    ctx.fillText('AMMO', W * 0.35, H * 0.55);

    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillText('7.62×51mm', W * 0.28, H * 0.65);

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      const sx = frameW + Math.random() * (W - frameW * 2);
      const sy = frameW + Math.random() * (H - frameW * 2);
      const length = 20 + Math.random() * 40;
      const angle = Math.random() * Math.PI * 2;

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(angle) * length, sy + Math.sin(angle) * length);
      ctx.stroke();
    }

    addNoise(ctx, W, H, 4);
  });
}

// ─── Barrel (Olive drab military drum with bands) ───

export function barrelTexture(): THREE.CanvasTexture {
  return getOrCreate('barrel', 128, 256, (ctx) => {
    const W = 128, H = 256;

    ctx.fillStyle = '#5a6b44';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(60, 80, 40, 0.25)';
    ctx.lineWidth = 1;
    for (let x = W / 6; x < W; x += W / 6) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }

    const curvatureGrad = ctx.createLinearGradient(0, 0, W, 0);
    curvatureGrad.addColorStop(0, 'rgba(0,0,0,0.2)');
    curvatureGrad.addColorStop(0.15, 'rgba(0,0,0,0.05)');
    curvatureGrad.addColorStop(0.5, 'rgba(255,255,255,0.08)');
    curvatureGrad.addColorStop(0.85, 'rgba(0,0,0,0.05)');
    curvatureGrad.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = curvatureGrad;
    ctx.fillRect(0, 0, W, H);

    const bandPositions = [H * 0.15, H * 0.5, H * 0.85];

    bandPositions.forEach((by) => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(0, by + 2, W, 8);

      const bandGrad = ctx.createLinearGradient(0, by - 5, 0, by + 8);
      bandGrad.addColorStop(0, '#3a3a35');
      bandGrad.addColorStop(0.3, '#5a5a52');
      bandGrad.addColorStop(0.5, '#6a6a62');
      bandGrad.addColorStop(0.7, '#5a5a52');
      bandGrad.addColorStop(1, '#3a3a35');
      ctx.fillStyle = bandGrad;
      ctx.fillRect(0, by - 5, W, 13);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fillRect(0, by - 4, W, 1);

      ctx.fillStyle = 'rgba(140, 70, 30, 0.3)';
      ctx.fillRect(0, by - 6, W, 1);
      ctx.fillRect(0, by + 8, W, 1);
    });

    for (let i = 0; i < 8; i++) {
      const rx = Math.random() * W;
      const startY = bandPositions[Math.floor(Math.random() * bandPositions.length)];
      const length = 30 + Math.random() * 60;

      const rustGrad = ctx.createLinearGradient(rx, startY, rx, startY + length);
      rustGrad.addColorStop(0, 'rgba(140, 70, 30, 0.5)');
      rustGrad.addColorStop(0.6, 'rgba(120, 60, 25, 0.3)');
      rustGrad.addColorStop(1, 'rgba(100, 50, 20, 0)');

      ctx.fillStyle = rustGrad;
      ctx.fillRect(rx - 1, startY, 2 + Math.random() * 3, length);
    }

    for (let i = 0; i < 4; i++) {
      const dx = Math.random() * W;
      const dy = Math.random() * H;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.ellipse(dx, dy, 12, 8, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.beginPath();
      ctx.ellipse(dx - 2, dy - 2, 8, 5, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(W / 2, H * 0.35);

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 3;
    ctx.fillStyle = 'rgba(230, 200, 0, 0.4)';

    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 - Math.PI / 2;

      ctx.save();
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(25, -8);
      ctx.lineTo(25, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    addNoise(ctx, W, H, 8);
  });
}

// ─── Wall trim / baseboard (optional accent texture) ───

export function wallTrimTexture(): THREE.CanvasTexture {
  return getOrCreate('wall-trim', 256, 32, (ctx) => {
    const W = 256, H = 32;

    // Dark grey-brown trim
    ctx.fillStyle = '#555550';
    ctx.fillRect(0, 0, W, H);

    // Top highlight
    ctx.fillStyle = '#6a6a65';
    ctx.fillRect(0, 0, W, 2);

    // Bottom shadow
    ctx.fillStyle = '#3a3a38';
    ctx.fillRect(0, H - 2, W, 2);

    // Horizontal groove detail
    ctx.fillStyle = '#4a4a48';
    ctx.fillRect(0, 10, W, 3);
    ctx.fillStyle = '#626260';
    ctx.fillRect(0, 10, W, 1);

    ctx.fillStyle = '#4a4a48';
    ctx.fillRect(0, 20, W, 3);
    ctx.fillStyle = '#626260';
    ctx.fillRect(0, 20, W, 1);

    addNoise(ctx, W, H, 10);
  });
}

// ─── Facility Door (Industrial metal security door) ───

export function facilityDoorTexture(): THREE.CanvasTexture {
  return getOrCreate('facility-door', 128, 256, (ctx) => {
    const W = 128, H = 256;

    const baseGrad = ctx.createLinearGradient(0, 0, W, 0);
    baseGrad.addColorStop(0, '#3a3e42');
    baseGrad.addColorStop(0.5, '#4a4e52');
    baseGrad.addColorStop(1, '#3a3e42');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, W, H);

    const panelInset = 15;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(panelInset, panelInset, W - panelInset * 2, H - panelInset * 2);

    ctx.fillStyle = '#42464a';
    ctx.fillRect(panelInset + 2, panelInset + 2, W - panelInset * 2 - 4, H - panelInset * 2 - 4);

    const barCount = 4;
    for (let i = 1; i <= barCount; i++) {
      const by = (i / (barCount + 1)) * H;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(panelInset, by + 1, W - panelInset * 2, 8);

      ctx.fillStyle = '#5a5e62';
      ctx.fillRect(panelInset, by, W - panelInset * 2, 8);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(panelInset, by, W - panelInset * 2, 1);
    }

    const lockX = W - panelInset - 20;
    const lockY = H / 2;

    ctx.fillStyle = '#2a2e32';
    ctx.fillRect(lockX - 10, lockY - 25, 28, 50);

    ctx.fillStyle = '#1a1e22';
    ctx.beginPath();
    ctx.arc(lockX, lockY, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(lockX, lockY, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#8a3a3a';
    ctx.beginPath();
    ctx.arc(lockX, lockY - 18, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#3a8a3a';
    ctx.beginPath();
    ctx.arc(lockX, lockY + 18, 3, 0, Math.PI * 2);
    ctx.fill();

    const stripeW = 10;
    for (let x = 0; x < W; x += stripeW * 2) {
      ctx.fillStyle = (x / (stripeW * 2)) % 2 === 0 ? '#e8c820' : '#1a1a1a';
      ctx.fillRect(x, 0, stripeW, 8);
    }

    ctx.fillStyle = 'rgba(232, 200, 32, 0.8)';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('AUTHORIZED', W / 2, H * 0.12);
    ctx.fillText('ONLY', W / 2, H * 0.12 + 18);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 15; i++) {
      const sx = lockX - 30 + Math.random() * 25;
      const sy = lockY - 40 + Math.random() * 80;
      const length = 10 + Math.random() * 20;

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + length, sy + (Math.random() - 0.5) * 10);
      ctx.stroke();
    }

    addNoise(ctx, W, H, 4);
  });
}

// ─── Locked Door (Red warning, key card clearance) ───

export function lockedDoorTexture(): THREE.CanvasTexture {
  return getOrCreate('locked-door', 128, 256, (ctx) => {
    const W = 128, H = 256;

    const baseGrad = ctx.createLinearGradient(0, 0, W, 0);
    baseGrad.addColorStop(0, '#4a2222');
    baseGrad.addColorStop(0.5, '#5a2a2a');
    baseGrad.addColorStop(1, '#4a2222');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, W, H);

    const stripeAngle = Math.PI / 4;
    const stripeW = 20;
    const stripeSpacing = stripeW * 2;

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(stripeAngle);

    for (let x = -H; x < H; x += stripeSpacing) {
      ctx.fillStyle = '#e8c820';
      ctx.fillRect(x, -H, stripeW, H * 2);
    }
    ctx.restore();

    const panelW = 60;
    const panelH = 80;
    const panelX = W / 2 - panelW / 2;
    const panelY = H / 2 - panelH / 2;

    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(panelX, panelY, panelW, panelH);

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(panelX + 10, panelY + 20, panelW - 20, 15);

    const ledX = panelX + panelW / 2;
    const ledY = panelY + 50;

    ctx.fillStyle = '#ff0000';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(ledX, ledY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LOCKED', W / 2, H * 0.75);

    ctx.font = '10px monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText('CLEARANCE', W / 2, H * 0.8);
    ctx.fillText('REQUIRED', W / 2, H * 0.85);
    ctx.textAlign = 'start';

    addNoise(ctx, W, H, 4);
  });
}

// ─── Snow Ground (mountainous outdoor — wind-blown snow, patches of ice) ───

export function snowGroundTexture(): THREE.CanvasTexture {
  return getOrCreate('snow-ground', 256, 256, (ctx) => {
    const W = 256, H = 256;

    // Base snow — bright off-white with blue tint
    ctx.fillStyle = '#e8eef4';
    ctx.fillRect(0, 0, W, H);

    // Wind-blown drift patterns — subtle elongated streaks
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 30; i++) {
      const sx = Math.random() * W;
      const sy = Math.random() * H;
      const len = 40 + Math.random() * 80;
      const grad = ctx.createLinearGradient(sx, sy, sx + len, sy + len * 0.3);
      grad.addColorStop(0, 'rgba(200, 220, 240, 0.4)');
      grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.2)');
      grad.addColorStop(1, 'rgba(180, 200, 220, 0.3)');
      ctx.fillStyle = grad;
      ctx.fillRect(sx, sy, len, 4 + Math.random() * 6);
    }
    ctx.globalAlpha = 1;

    // Ice patches — darker, reflective-looking areas
    ctx.fillStyle = 'rgba(180, 200, 230, 0.25)';
    ctx.beginPath();
    ctx.ellipse(60, 80, 35, 20, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(180, 160, 40, 25, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(120, 220, 30, 18, 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Crusty snow texture — tiny speckles
    for (let i = 0; i < 200; i++) {
      const shade = 220 + Math.floor(Math.random() * 25);
      ctx.fillStyle = `rgb(${shade}, ${shade + 5}, ${shade + 15})`;
      ctx.fillRect(Math.random() * W, Math.random() * H, 1, 1);
    }

    // Footprint-like depressions (subtle)
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#c0d0e0';
    ctx.fillRect(100, 100, 8, 4);
    ctx.fillRect(110, 102, 8, 4);
    ctx.globalAlpha = 1;

    addNoise(ctx, W, H, 8);
  });
}

// ─── Mountain / Rock Wall (snowy cliff face — grey rock with snow caps) ───

export function mountainWallTexture(): THREE.CanvasTexture {
  return getOrCreate('mountain-wall', 256, 256, (ctx) => {
    const W = 256, H = 256;

    // Base rock — grey-brown mountain stone
    ctx.fillStyle = '#6a6e72';
    ctx.fillRect(0, 0, W, H);

    // Rocky strata — horizontal bands
    const strataCount = 8;
    const strataH = H / strataCount;
    for (let s = 0; s < strataCount; s++) {
      const sy = s * strataH;
      const shade = 90 + Math.floor(Math.random() * 25 - 10);
      const r = shade;
      const g = shade - 2;
      const b = shade + 4;
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(0, sy, W, strataH);

      // Crack lines between strata
      ctx.strokeStyle = 'rgba(40, 42, 48, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, sy + strataH);
      for (let x = 0; x < W; x += 20) {
        ctx.lineTo(x + Math.random() * 20, sy + strataH + (Math.random() - 0.5) * 2);
      }
      ctx.lineTo(W, sy + strataH);
      ctx.stroke();
    }

    // Snow accumulation at top (wind-blown drifts)
    const snowGrad = ctx.createLinearGradient(0, 0, 0, H);
    snowGrad.addColorStop(0, 'rgba(230, 240, 255, 0.7)');
    snowGrad.addColorStop(0.15, 'rgba(220, 235, 250, 0.4)');
    snowGrad.addColorStop(0.3, 'rgba(200, 215, 235, 0.2)');
    snowGrad.addColorStop(0.5, 'transparent');
    snowGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = snowGrad;
    ctx.fillRect(0, 0, W, H);

    // Rock cracks and weathering
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = '#3a3c40';
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const startX = Math.random() * W;
      const startY = Math.random() * H;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      for (let j = 0; j < 4; j++) {
        const dx = (Math.random() - 0.5) * 40;
        const dy = (Math.random() - 0.3) * 30;
        ctx.lineTo(startX + dx, startY + dy);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    addNoise(ctx, W, H, 14);
  });
}

// ─── Door Frame (Brushed metal) ───

export function doorFrameTexture(): THREE.CanvasTexture {
  return getOrCreate('door-frame', 128, 128, (ctx) => {
    const W = 128, H = 128;

    ctx.fillStyle = '#8a8a8a';
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < 200; i++) {
      const x = Math.random() * W;
      const alpha = 0.02 + Math.random() * 0.08;
      const bright = Math.random() > 0.5;

      ctx.strokeStyle = bright ? `rgba(255, 255, 255, ${alpha})` : `rgba(0, 0, 0, ${alpha})`;
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }

    const anodizedGrad = ctx.createLinearGradient(0, 0, W, 0);
    anodizedGrad.addColorStop(0, 'rgba(120, 130, 140, 0.1)');
    anodizedGrad.addColorStop(0.5, 'rgba(160, 170, 180, 0.15)');
    anodizedGrad.addColorStop(1, 'rgba(120, 130, 140, 0.1)');
    ctx.fillStyle = anodizedGrad;
    ctx.fillRect(0, 0, W, H);

    const screwPositions = [
      { x: W * 0.2, y: H * 0.2 },
      { x: W * 0.8, y: H * 0.2 },
      { x: W * 0.2, y: H * 0.8 },
      { x: W * 0.8, y: H * 0.8 },
    ];

    screwPositions.forEach((pos) => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#6a6a6a';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#3a3a3a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pos.x - 3, pos.y);
      ctx.lineTo(pos.x + 3, pos.y);
      ctx.moveTo(pos.x, pos.y - 3);
      ctx.lineTo(pos.x, pos.y + 3);
      ctx.stroke();
    });

    addNoise(ctx, W, H, 3);
  });
}

// ─── Blood Splatter Sprites (hit effect decals — Fallout/retro FPS style) ───

function getOrCreateDecal(key: string, width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);
  draw(ctx);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

/** Seeded random for consistent variants */
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/** Enhanced blood splatter with multiple pattern types and higher detail */
function drawBloodSplatter(ctx: CanvasRenderingContext2D, w: number, h: number, variant: number): void {
  const cx = w / 2;
  const cy = h / 2;
  const seed = variant * 7919;

  // Determine pattern type based on variant
  const patternType = variant % 4;

  if (patternType === 0) {
    // IMPACT CRATER — dense center with explosive radiating droplets
    drawImpactCrater(ctx, w, h, cx, cy, seed);
  } else if (patternType === 1) {
    // ARTERIAL SPRAY — directional fan pattern (realistic wound spray)
    drawArterialSpray(ctx, w, h, cx, cy, seed);
  } else if (patternType === 2) {
    // BULLET EXIT — explosive radial burst with heavy spatter
    drawBulletExit(ctx, w, h, cx, cy, seed);
  } else {
    // CLASSIC SPLAT — elliptical with drips (original enhanced)
    drawClassicSplat(ctx, w, h, cx, cy, seed, variant);
  }

  // Add fine mist particles to all patterns for realism
  addMistParticles(ctx, w, h, cx, cy, seed, 8 + (variant % 5));
}

/** Impact crater pattern — dense center, explosive radiating droplets */
function drawImpactCrater(ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number, seed: number): void {
  const mainR = w * 0.22;

  // Dense dark core (impact site)
  ctx.fillStyle = 'rgba(35, 5, 4, 1)';
  ctx.beginPath();
  ctx.arc(cx, cy, mainR, 0, Math.PI * 2);
  ctx.fill();

  // Outer crust
  ctx.fillStyle = 'rgba(65, 12, 10, 1)';
  ctx.beginPath();
  ctx.arc(cx, cy, mainR * 0.85, 0, Math.PI * 2);
  ctx.fill();

  // Mid blood
  ctx.fillStyle = 'rgba(120, 25, 22, 1)';
  ctx.beginPath();
  ctx.arc(cx, cy, mainR * 0.6, 0, Math.PI * 2);
  ctx.fill();

  // Bright wet center
  ctx.fillStyle = 'rgba(200, 42, 38, 1)';
  ctx.beginPath();
  ctx.arc(cx, cy, mainR * 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Radiating explosive droplets (16-20 droplets)
  const dropletCount = 16 + Math.floor(seededRandom(seed) * 5);
  for (let i = 0; i < dropletCount; i++) {
    const angle = seededRandom(seed + i * 2.7) * Math.PI * 2;
    const dist = mainR * (1.2 + seededRandom(seed + i * 1.3) * 0.8);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const dropR = w * (0.015 + seededRandom(seed + i * 3.1) * 0.025);
    const opacity = 0.8 - (dist / (mainR * 2)) * 0.4;

    ctx.fillStyle = `rgba(95, 20, 17, ${opacity})`;
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, dropR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Splatter streaks radiating outward
  const streakCount = 8 + Math.floor(seededRandom(seed * 1.1) * 4);
  for (let i = 0; i < streakCount; i++) {
    const angle = seededRandom(seed * 0.5 + i * 3.2) * Math.PI * 2;
    const len = mainR * (0.7 + seededRandom(seed + i * 2.5) * 0.9);
    const sx = Math.cos(angle) * len * 0.6;
    const sy = Math.sin(angle) * len * 0.6;
    const sw = w * (0.008 + seededRandom(seed + i) * 0.008);
    const sh = len * 0.6;

    ctx.save();
    ctx.translate(cx + sx, cy + sy);
    ctx.rotate(angle);
    ctx.fillStyle = `rgba(75, 16, 14, ${0.75 - i * 0.03})`;
    ctx.fillRect(-sw / 2, -sh / 2, sw, sh);
    ctx.restore();
  }
}

/** Arterial spray pattern — directional fan (realistic wound spray) */
function drawArterialSpray(ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number, seed: number): void {
  const sprayAngle = seededRandom(seed * 0.3) * Math.PI * 2;
  const fanSpread = Math.PI * 0.4; // 72-degree fan
  const mainR = w * 0.18;

  // Small impact point
  ctx.fillStyle = 'rgba(50, 8, 6, 1)';
  ctx.beginPath();
  ctx.arc(cx, cy, mainR * 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(180, 35, 30, 1)';
  ctx.beginPath();
  ctx.arc(cx, cy, mainR * 0.25, 0, Math.PI * 2);
  ctx.fill();

  // Directional spray streaks (elongated droplets in fan pattern)
  const streakCount = 20 + Math.floor(seededRandom(seed) * 12);
  for (let i = 0; i < streakCount; i++) {
    const angleOffset = (seededRandom(seed + i * 1.7) - 0.5) * fanSpread;
    const angle = sprayAngle + angleOffset;
    const dist = mainR * (0.8 + seededRandom(seed + i * 2.1) * 1.5);
    const sx = Math.cos(angle) * dist;
    const sy = Math.sin(angle) * dist;
    const sw = w * (0.006 + seededRandom(seed + i * 1.2) * 0.012);
    const sh = dist * (0.4 + seededRandom(seed + i * 3.3) * 0.3);

    ctx.save();
    ctx.translate(cx + sx * 0.5, cy + sy * 0.5);
    ctx.rotate(angle);
    const opacity = 0.85 - (dist / (mainR * 2.5)) * 0.5;
    ctx.fillStyle = `rgba(110, 23, 20, ${opacity})`;
    ctx.fillRect(-sw / 2, -sh / 2, sw, sh);
    ctx.restore();
  }

  // Droplets along spray path
  const dropletCount = 12 + Math.floor(seededRandom(seed * 1.5) * 8);
  for (let i = 0; i < dropletCount; i++) {
    const angleOffset = (seededRandom(seed * 0.7 + i * 2.3) - 0.5) * fanSpread;
    const angle = sprayAngle + angleOffset;
    const dist = mainR * (0.6 + seededRandom(seed + i * 1.9) * 1.8);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const dropR = w * (0.012 + seededRandom(seed + i * 2.8) * 0.02);

    ctx.fillStyle = `rgba(85, 18, 15, ${0.8})`;
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, dropR, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Bullet exit pattern — explosive radial burst with heavy spatter */
function drawBulletExit(ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number, seed: number): void {
  const mainR = w * 0.25;

  // Irregular jagged core (torn flesh)
  ctx.fillStyle = 'rgba(40, 6, 5, 1)';
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const jitter = 0.8 + seededRandom(seed + i * 1.5) * 0.4;
    const r = mainR * jitter;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  // Outer spatter ring
  ctx.fillStyle = 'rgba(75, 15, 12, 1)';
  ctx.beginPath();
  ctx.arc(cx, cy, mainR * 0.7, 0, Math.PI * 2);
  ctx.fill();

  // Mid blood
  ctx.fillStyle = 'rgba(130, 27, 23, 1)';
  ctx.beginPath();
  ctx.arc(cx, cy, mainR * 0.45, 0, Math.PI * 2);
  ctx.fill();

  // Bright core
  ctx.fillStyle = 'rgba(210, 48, 42, 1)';
  ctx.beginPath();
  ctx.arc(cx, cy, mainR * 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Heavy radial spatter (large chunks)
  const chunkCount = 10 + Math.floor(seededRandom(seed) * 6);
  for (let i = 0; i < chunkCount; i++) {
    const angle = seededRandom(seed + i * 2.1) * Math.PI * 2;
    const dist = mainR * (1.1 + seededRandom(seed + i * 1.4) * 0.7);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const chunkR = w * (0.025 + seededRandom(seed + i * 3.7) * 0.035);

    // Irregular chunk shape
    ctx.fillStyle = `rgba(70, 14, 11, ${0.9})`;
    ctx.beginPath();
    ctx.ellipse(cx + dx, cy + dy, chunkR, chunkR * 1.3, angle, 0, Math.PI * 2);
    ctx.fill();
  }

  // Long streaks (explosive force)
  const streakCount = 14 + Math.floor(seededRandom(seed * 1.3) * 8);
  for (let i = 0; i < streakCount; i++) {
    const angle = seededRandom(seed * 0.8 + i * 2.9) * Math.PI * 2;
    const len = mainR * (1.2 + seededRandom(seed + i * 1.8) * 1.3);
    const sx = Math.cos(angle) * len * 0.7;
    const sy = Math.sin(angle) * len * 0.7;
    const sw = w * (0.007 + seededRandom(seed + i * 2.2) * 0.01);
    const sh = len * 0.8;

    ctx.save();
    ctx.translate(cx + sx, cy + sy);
    ctx.rotate(angle);
    ctx.fillStyle = `rgba(60, 13, 11, ${0.7})`;
    ctx.fillRect(-sw / 2, -sh / 2, sw, sh);
    ctx.restore();
  }
}

/** Classic splat pattern — elliptical with drips (enhanced) */
function drawClassicSplat(ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number, seed: number, variant: number): void {
  const mainRx = w * (0.2 + (variant % 4) * 0.04);
  const mainRy = h * (0.18 + (variant % 3) * 0.05);
  const tilt = seededRandom(seed * 0.5) * Math.PI * 0.5;

  // Dark outer edge
  ctx.fillStyle = 'rgba(45, 7, 6, 1)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, mainRx * 1.2, mainRy * 1.25, tilt, 0, Math.PI * 2);
  ctx.fill();

  // Dried crust
  ctx.fillStyle = 'rgba(80, 16, 14, 1)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, mainRx * 1.0, mainRy * 1.05, tilt, 0, Math.PI * 2);
  ctx.fill();

  // Mid blood
  ctx.fillStyle = 'rgba(135, 28, 24, 1)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, mainRx * 0.68, mainRy * 0.72, tilt, 0, Math.PI * 2);
  ctx.fill();

  // Bright wet center
  ctx.fillStyle = 'rgba(205, 44, 39, 1)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, mainRx * 0.38, mainRy * 0.42, tilt, 0, Math.PI * 2);
  ctx.fill();

  // Drip trails (gravity pulls downward)
  const dripCount = 3 + Math.floor(seededRandom(seed) * 4);
  for (let i = 0; i < dripCount; i++) {
    const angleBase = Math.PI * 0.5; // Downward
    const angle = angleBase + (seededRandom(seed + i * 1.7) - 0.5) * 0.6;
    const dist = mainRy * (0.5 + seededRandom(seed + i * 2.3) * 0.9);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const dripW = w * (0.015 + seededRandom(seed + i * 3.1) * 0.015);
    const dripH = dist * (0.6 + seededRandom(seed + i * 1.9) * 0.5);

    ctx.save();
    ctx.translate(cx + dx, cy + dy);
    ctx.rotate(angle);
    ctx.fillStyle = `rgba(90, 19, 16, ${0.85 - i * 0.08})`;
    ctx.fillRect(-dripW / 2, -dripH / 2, dripW, dripH);
    ctx.restore();
  }

  // Speckles around main splat
  const speckCount = 6 + Math.floor(seededRandom(seed * 1.2) * 6);
  for (let i = 0; i < speckCount; i++) {
    const angle = seededRandom(seed + i * 2.5) * Math.PI * 2;
    const dist = mainRx * (0.8 + seededRandom(seed + i * 1.6) * 0.7);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const r = w * (0.012 + seededRandom(seed + i * 3.4) * 0.015);

    ctx.fillStyle = `rgba(65, 13, 11, ${0.75})`;
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Fine mist particles — tiny dots scattered around for realism */
function addMistParticles(ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number, seed: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const angle = seededRandom(seed + i * 4.7) * Math.PI * 2;
    const dist = w * (0.2 + seededRandom(seed + i * 3.9) * 0.35);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const r = w * (0.004 + seededRandom(seed + i * 5.1) * 0.006);
    const opacity = 0.4 + seededRandom(seed + i * 2.8) * 0.3;

    ctx.fillStyle = `rgba(60, 12, 10, ${opacity})`;
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Blood splatter texture for hit decals/particles. variant 0–11 for variety. 256px for maximum detail. */
export function bloodSplatterTexture(variant: number = 0): THREE.CanvasTexture {
  const v = Math.max(0, Math.min(11, Math.floor(variant)));
  return getOrCreateDecal(`blood-splatter-256-${v}`, 256, 256, (ctx) => drawBloodSplatter(ctx, 256, 256, v));
}

/** All blood splatter variants (for random selection). */
export function bloodSplatterTextures(): THREE.CanvasTexture[] {
  return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => bloodSplatterTexture(i));
}
