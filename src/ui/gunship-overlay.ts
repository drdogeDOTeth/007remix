/**
 * AC-130 Gunship Scorestreak Overlay
 * FLIR thermal imaging display with targeting reticle, weapon HUD, and timer.
 *
 * Thermal look is achieved by applying CSS filters to the WebGL canvas element
 * (grayscale + high contrast = real thermal imaging look). The overlay canvas
 * is fully transparent except for HUD elements drawn on top.
 *
 * White-hot: bright scene areas appear white (hot), dark areas black
 * Black-hot: inverted — hot areas appear black, cooler areas white
 */

export type FlirMode = 'white-hot' | 'black-hot' | 'color';
export type GunshipWeaponMode = 'cannon' | 'howitzer';

// CSS filter strings applied to the WebGL canvas for thermal effect
// White-hot: high brightness to lift dark night scenes, moderate contrast
// Black-hot: inverts first so daytime bright scene becomes dark — less brightness needed
const FILTER_WHITE_HOT = 'grayscale(1) brightness(2.0) contrast(2.5)';
const FILTER_BLACK_HOT = 'grayscale(1) invert(1) brightness(0.65) contrast(2.2)';
// Color mode: no grayscale — just a mild contrast boost and slight green tint via hue shift
const FILTER_COLOR = 'brightness(1.1) contrast(1.15) saturate(0.85)';

export class GunshipOverlay {
  private overlay: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private _visible = false;

  /** Reference to the WebGL renderer canvas so we can apply CSS thermal filters. */
  private _webglCanvas: HTMLCanvasElement | null = null;

  // State
  private _flirMode: FlirMode = 'white-hot';
  private _weaponMode: GunshipWeaponMode = 'cannon';
  private _reticleX = 0.5;
  private _reticleY = 0.5;
  private _timeRemaining = 30;

  // Animation
  private _scanlineOffset = 0;
  private _reticleFlash = 0;
  private _timerPulse = 0;

  // Film grain noise canvas
  private _noiseCanvas: HTMLCanvasElement;
  private _noiseCtx: CanvasRenderingContext2D;
  private readonly _noiseSize = 128;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
      opacity: 0;
      z-index: 8;
      transition: opacity 0.1s;
    `;

    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
    `;
    this.overlay.appendChild(this.canvas);
    document.body.appendChild(this.overlay);

    const resize = () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
      if (this._visible) this._draw();
    };
    window.addEventListener('resize', resize);
    resize();

    this.ctx = this.canvas.getContext('2d')!;

    // Grain noise offscreen canvas
    this._noiseCanvas = document.createElement('canvas');
    this._noiseCanvas.width = this._noiseSize;
    this._noiseCanvas.height = this._noiseSize;
    this._noiseCtx = this._noiseCanvas.getContext('2d')!;
    this._regenerateNoise();
  }

  /** Pass the WebGL renderer canvas so thermal CSS filters can be applied. */
  setWebGLCanvas(canvas: HTMLCanvasElement): void {
    this._webglCanvas = canvas;
  }

  show(): void {
    this._visible = true;
    this.overlay.style.opacity = '1';
    this._applyCanvasFilter();
    this._draw();
  }

  hide(): void {
    this._visible = false;
    this.overlay.style.opacity = '0';
    this._removeCanvasFilter();
  }

  setReticle(nx: number, ny: number): void {
    this._reticleX = nx;
    this._reticleY = ny;
  }

  setWeaponMode(mode: GunshipWeaponMode): void {
    this._weaponMode = mode;
  }

  setFlirMode(mode: FlirMode): void {
    this._flirMode = mode;
    if (this._visible) this._applyCanvasFilter();
  }

  setTimeRemaining(seconds: number): void {
    this._timeRemaining = seconds;
  }

  flashReticle(): void {
    this._reticleFlash = 0.12;
  }

  update(dt: number): void {
    if (!this._visible) return;
    this._scanlineOffset = (this._scanlineOffset + dt * 18) % 6;
    if (Math.random() < 0.4) this._regenerateNoise();
    if (this._reticleFlash > 0) this._reticleFlash -= dt;
    this._timerPulse += dt;
    this._draw();
  }

  private _applyCanvasFilter(): void {
    if (!this._webglCanvas) return;
    if (this._flirMode === 'white-hot') this._webglCanvas.style.filter = FILTER_WHITE_HOT;
    else if (this._flirMode === 'black-hot') this._webglCanvas.style.filter = FILTER_BLACK_HOT;
    else this._webglCanvas.style.filter = FILTER_COLOR;
  }

  private _removeCanvasFilter(): void {
    if (!this._webglCanvas) return;
    this._webglCanvas.style.filter = '';
  }

  private _regenerateNoise(): void {
    const size = this._noiseSize;
    const imageData = this._noiseCtx.createImageData(size, size);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const v = (Math.random() * 30) | 0;
      data[i] = v; data[i + 1] = v; data[i + 2] = v;
      data[i + 3] = (Math.random() * 40) | 0;
    }
    this._noiseCtx.putImageData(imageData, 0, 0);
  }

  private _draw(): void {
    const c = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    c.clearRect(0, 0, W, H);

    // Draw HUD elements only — no opaque background (3D canvas shows through with CSS filter)
    this._drawScanlines(W, H);
    this._drawFilmGrain(W, H);
    this._drawVignette(W, H);
    this._drawCornerPanels(W, H);
    this._drawTimer(W, H);
    this._drawWeaponHUD(W, H);
    this._drawReticle(W, H);
  }

  private _drawScanlines(W: number, H: number): void {
    const c = this.ctx;
    // Subtle dark scanlines on top of the filtered 3D view
    c.save();
    c.fillStyle = 'rgba(0,0,0,0.12)';
    const lineGap = 4;
    for (let y = (this._scanlineOffset | 0); y < H; y += lineGap) {
      c.fillRect(0, y, W, 1);
    }
    c.restore();
  }

  private _drawFilmGrain(W: number, H: number): void {
    const c = this.ctx;
    c.save();
    c.globalAlpha = 0.15;
    c.globalCompositeOperation = 'screen';
    const ns = this._noiseSize;
    const ox = (Math.random() * ns) | 0;
    const oy = (Math.random() * ns) | 0;
    for (let tx = -ns + ox; tx < W; tx += ns) {
      for (let ty = -ns + oy; ty < H; ty += ns) {
        c.drawImage(this._noiseCanvas, tx, ty);
      }
    }
    c.restore();
  }

  private _drawVignette(W: number, H: number): void {
    const c = this.ctx;
    const cx = W / 2, cy = H / 2;
    const r = Math.sqrt(cx * cx + cy * cy);
    const grad = c.createRadialGradient(cx, cy, r * 0.5, cx, cy, r);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.7)');
    c.fillStyle = grad;
    c.fillRect(0, 0, W, H);
  }

  private _drawCornerPanels(W: number, H: number): void {
    const c = this.ctx;
    // black-hot: bright/light canvas → dark text. white-hot/color: dark canvas → bright green text
    const isBlackHot = this._flirMode === 'black-hot';
    const textColor = isBlackHot ? '#003318' : '#00ff88';
    const panelBg   = isBlackHot ? 'rgba(180,220,180,0.55)' : 'rgba(0,0,0,0.55)';

    c.font = '11px "Courier New", monospace';
    c.textBaseline = 'top';
    c.textAlign = 'left';
    const pad = 14;
    const lineH = 16;

    // Top-left
    const tlLines = ['AC-130H SPECTRE', 'ALT:  15,000 FT', 'AIRSPD: 275 KT', 'SENSORS: IR/FLIR'];
    this._panel(c, pad, pad, 162, lineH * tlLines.length + 10, panelBg);
    c.fillStyle = textColor;
    tlLines.forEach((ln, i) => c.fillText(ln, pad + 6, pad + 5 + i * lineH));

    // Top-right
    const trLines = ['BEARING: 247 DEG', 'TARGET: CONFIRM', 'MODE: FIRE READY', 'COMMS: SECURE'];
    const trW = 167;
    this._panel(c, W - pad - trW, pad, trW, lineH * trLines.length + 10, panelBg);
    c.fillStyle = textColor;
    trLines.forEach((ln, i) => c.fillText(ln, W - pad - trW + 6, pad + 5 + i * lineH));

    // Bottom-left
    const blLines = ['CALL SIGN: SPOOKY', 'FIRING SOLN: ACT'];
    const blY = H - pad - lineH * blLines.length - 10;
    this._panel(c, pad, blY, 168, lineH * blLines.length + 10, panelBg);
    c.fillStyle = textColor;
    blLines.forEach((ln, i) => c.fillText(ln, pad + 6, blY + 5 + i * lineH));

    // Bottom-right: FLIR mode
    const flirLabel = this._flirMode === 'white-hot' ? 'FLIR: WHITE-HOT'
                    : this._flirMode === 'black-hot'  ? 'FLIR: BLACK-HOT'
                    : 'MODE: FULL COLOR';
    const brLines = [flirLabel, 'PRESS T TO TOGGLE'];
    const brW = 170;
    const brY = H - pad - lineH * brLines.length - 10;
    this._panel(c, W - pad - brW, brY, brW, lineH * brLines.length + 10, panelBg);
    c.fillStyle = textColor;
    brLines.forEach((ln, i) => c.fillText(ln, W - pad - brW + 6, brY + 5 + i * lineH));

    // Screen-corner bracket decorations
    const dimColor = isBlackHot ? 'rgba(0,51,24,0.5)' : 'rgba(0,255,136,0.5)';
    c.strokeStyle = dimColor;
    c.lineWidth = 2;
    const bl = 22, bp = 8;
    for (const [bx, by, dx, dy] of [
      [bp, bp, 1, 1], [W - bp, bp, -1, 1],
      [bp, H - bp, 1, -1], [W - bp, H - bp, -1, -1],
    ] as [number, number, number, number][]) {
      c.beginPath();
      c.moveTo(bx + dx * bl, by); c.lineTo(bx, by); c.lineTo(bx, by + dy * bl);
      c.stroke();
    }
  }

  private _panel(
    c: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number, bg: string,
  ): void {
    c.fillStyle = bg;
    c.fillRect(x, y, w, h);
  }

  private _drawTimer(W: number, H: number): void {
    const c = this.ctx;
    const isBlackHot = this._flirMode === 'black-hot';
    const secs = Math.ceil(this._timeRemaining);
    const isLow = secs <= 10;
    const isCritical = secs <= 5;

    let alpha = 1;
    if (isCritical) alpha = 0.7 + 0.3 * Math.abs(Math.sin(this._timerPulse * 5));

    c.save();
    c.globalAlpha = alpha;
    c.font = 'bold 17px "Courier New", monospace';
    c.textBaseline = 'middle';
    c.textAlign = 'center';

    const pW = 160, pH = 28;
    const px = W / 2 - pW / 2, py = 14;

    const bg = isBlackHot
      ? (isLow ? 'rgba(255,160,160,0.65)' : 'rgba(180,220,180,0.5)')
      : (isLow ? 'rgba(100,0,0,0.7)' : 'rgba(0,0,0,0.5)');
    c.fillStyle = bg;
    c.fillRect(px, py, pW, pH);

    c.fillStyle = isLow
      ? (isBlackHot ? '#880000' : '#ff4444')
      : (isBlackHot ? '#003318' : '#00ff88');
    c.fillText(`GUNSHIP: ${String(secs).padStart(2, '0')}s`, W / 2, py + pH / 2);
    c.restore();
    c.textAlign = 'left';
    c.textBaseline = 'top';
  }

  private _drawWeaponHUD(W: number, H: number): void {
    const c = this.ctx;
    const isBlackHot = this._flirMode === 'black-hot';
    const activeColor   = isBlackHot ? '#003318' : '#00ff88';
    const inactiveColor = isBlackHot ? 'rgba(0,51,24,0.3)' : 'rgba(0,255,136,0.3)';
    const bg = isBlackHot ? 'rgba(180,220,180,0.55)' : 'rgba(0,0,0,0.55)';

    const pW = 310, pH = 32;
    const px = W / 2 - pW / 2, py = H - 14 - pH;

    c.fillStyle = bg;
    c.fillRect(px, py, pW, pH);

    c.font = 'bold 12px "Courier New", monospace';
    c.textBaseline = 'middle';
    const midY = py + pH / 2;

    c.fillStyle = this._weaponMode === 'cannon' ? activeColor : inactiveColor;
    c.textAlign = 'left';
    c.fillText('[25mm CANNON]', px + 12, midY);

    c.fillStyle = this._weaponMode === 'howitzer' ? activeColor : inactiveColor;
    c.textAlign = 'right';
    c.fillText('[105mm HOW]', px + pW - 12, midY);

    c.fillStyle = isBlackHot ? 'rgba(0,51,24,0.55)' : 'rgba(0,255,136,0.55)';
    c.font = '9px "Courier New", monospace';
    c.textAlign = 'center';
    c.fillText('[G] SWITCH', W / 2, midY);

    c.textAlign = 'left';
    c.textBaseline = 'top';
  }

  private _drawReticle(W: number, H: number): void {
    const c = this.ctx;
    const cx = this._reticleX * W;
    const cy = this._reticleY * H;
    const isBlackHot = this._flirMode === 'black-hot';
    const flashing = this._reticleFlash > 0;
    const isHowitzer = this._weaponMode === 'howitzer';

    const size   = isHowitzer ? 60 : 38;
    const armLen = isHowitzer ? 18 : 13;
    const lineW  = isHowitzer ? 2.5 : 1.8;

    let color: string;
    if (flashing) {
      color = '#ffffff';
    } else if (isBlackHot) {
      color = isHowitzer ? '#bb3300' : '#003318';
    } else {
      // white-hot and color mode both use bright green (dark canvas background)
      color = isHowitzer ? '#ff7733' : '#00ff88';
    }

    c.save();
    c.strokeStyle = color;
    c.lineWidth = lineW;

    // Four corner bracket L-shapes
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as [number, number][]) {
      const bx = cx + sx * size;
      const by = cy + sy * size;
      c.beginPath();
      c.moveTo(bx - sx * armLen, by);
      c.lineTo(bx, by);
      c.lineTo(bx, by - sy * armLen);
      c.stroke();
    }

    // Center dot
    c.fillStyle = color;
    c.beginPath();
    c.arc(cx, cy, isHowitzer ? 3.5 : 2.5, 0, Math.PI * 2);
    c.fill();

    // Cardinal tick marks
    c.globalAlpha = 0.55;
    c.lineWidth = lineW * 0.8;
    const tickLen = isHowitzer ? 8 : 5;
    const tickGap = isHowitzer ? 18 : 12;
    c.beginPath();
    c.moveTo(cx, cy - size + tickGap); c.lineTo(cx, cy - size + tickGap - tickLen);
    c.moveTo(cx, cy + size - tickGap); c.lineTo(cx, cy + size - tickGap + tickLen);
    c.moveTo(cx - size + tickGap, cy); c.lineTo(cx - size + tickGap - tickLen, cy);
    c.moveTo(cx + size - tickGap, cy); c.lineTo(cx + size - tickGap + tickLen, cy);
    c.stroke();
    c.globalAlpha = 1;

    // Range/bearing readout
    c.font = '10px "Courier New", monospace';
    c.textAlign = 'center';
    c.textBaseline = 'top';
    c.fillStyle = color;
    c.globalAlpha = 0.8;
    const brg = ((this._reticleX * 360) | 0).toString().padStart(3, '0');
    const rng = 800 + ((this._reticleX + this._reticleY) * 400 | 0);
    c.fillText(`BRG ${brg}°  RNG ${rng}m`, cx, cy + size + 5);
    c.globalAlpha = 1;

    c.restore();
    c.textAlign = 'left';
    c.textBaseline = 'top';
  }

  dispose(): void {
    this._removeCanvasFilter();
    this.overlay.remove();
  }
}
