/**
 * Weapon scope overlay — dark vignette with weapon-specific reticles.
 * Supports 'sniper' (fine crosshair) and 'rpg' (PGO-7 chevron + stadia).
 */
export class ScopeOverlay {
  private overlay: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private _visible = false;
  private _mode: 'sniper' | 'rpg' = 'sniper';

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
      opacity: 0;
      z-index: 4;
      transition: opacity 0.08s;
    `;

    // Canvas for the reticle
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
    `;
    this.overlay.appendChild(this.canvas);
    document.body.appendChild(this.overlay);

    // Resize canvas to window
    const resize = () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
      if (this._visible) this._draw();
    };
    window.addEventListener('resize', resize);
    resize();

    this.ctx = this.canvas.getContext('2d')!;
  }

  set visible(v: boolean) {
    if (v === this._visible) return;
    this._visible = v;
    this.overlay.style.opacity = v ? '1' : '0';
    if (v) this._draw();
  }

  get visible(): boolean {
    return this._visible;
  }

  set mode(m: 'sniper' | 'rpg') {
    if (m === this._mode) return;
    this._mode = m;
    if (this._visible) this._draw();
  }

  private _draw(): void {
    const c = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    // Scope circle radius — fits tightly within the shorter dimension
    const r = Math.min(W, H) * 0.38;

    c.clearRect(0, 0, W, H);

    // ── Dark vignette outside scope circle ───────────────────────────────────
    c.save();
    c.beginPath();
    c.rect(0, 0, W, H);
    c.arc(cx, cy, r, 0, Math.PI * 2, true); // cutout
    c.fillStyle = 'rgba(0,0,0,0.97)';
    c.fill('evenodd');

    // Subtle inner edge shadow on the lens circle
    const edgeGrad = c.createRadialGradient(cx, cy, r * 0.80, cx, cy, r);
    edgeGrad.addColorStop(0, 'rgba(0,0,0,0)');
    edgeGrad.addColorStop(1, 'rgba(0,0,0,0.55)');
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fillStyle = edgeGrad;
    c.fill();
    c.restore();

    // ── Scope ring bezel ─────────────────────────────────────────────────────
    c.save();
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(30,30,30,0.9)';
    c.lineWidth = 14;
    c.stroke();
    c.strokeStyle = 'rgba(60,60,60,0.7)';
    c.lineWidth = 3;
    c.stroke();
    c.restore();

    // ── Glass tint + glare ───────────────────────────────────────────────────
    c.save();
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.clip();
    // Very subtle green-tinted glass tint (military optics)
    const tint = c.createRadialGradient(cx, cy * 0.5, 0, cx, cy, r);
    tint.addColorStop(0, 'rgba(160,200,160,0.04)');
    tint.addColorStop(1, 'rgba(80,120,80,0.08)');
    c.fillStyle = tint;
    c.fill();
    // Glare streak (upper-left)
    const glare = c.createLinearGradient(cx - r * 0.5, cy - r * 0.7, cx, cy - r * 0.1);
    glare.addColorStop(0, 'rgba(255,255,255,0.10)');
    glare.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = glare;
    c.beginPath();
    c.ellipse(cx - r * 0.25, cy - r * 0.4, r * 0.35, r * 0.12, -0.5, 0, Math.PI * 2);
    c.fill();
    c.restore();

    if (this._mode === 'sniper') {
      this._drawSniperReticle(c, cx, cy, r);
    } else {
      this._drawRPGReticle(c, cx, cy, r);
    }
  }

  /** Fine duplex crosshair — classic sniper style */
  private _drawSniperReticle(c: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    const col = 'rgba(0,0,0,0.75)';
    const gap = r * 0.08; // gap at center

    c.save();
    c.strokeStyle = col;
    c.lineWidth = 1.5;

    // Horizontal thick outer bars
    c.lineWidth = 2.5;
    this._line(c, cx - r * 0.95, cy, cx - gap * 3, cy);
    this._line(c, cx + gap * 3, cy, cx + r * 0.95, cy);

    // Vertical thick outer bars
    this._line(c, cx, cy - r * 0.95, cx, cy - gap * 3);
    this._line(c, cx, cy + gap * 3, cx, cy + r * 0.95);

    // Fine inner hairlines
    c.lineWidth = 1;
    this._line(c, cx - gap * 3, cy, cx - gap, cy);
    this._line(c, cx + gap, cy, cx + gap * 3, cy);
    this._line(c, cx, cy - gap * 3, cx, cy - gap);
    this._line(c, cx, cy + gap, cx, cy + gap * 3);

    // Center dot
    c.beginPath();
    c.arc(cx, cy, 2, 0, Math.PI * 2);
    c.fillStyle = col;
    c.fill();

    // Mil-dot markers on horizontal
    for (const mult of [-0.55, -0.35, 0.35, 0.55]) {
      c.beginPath();
      c.arc(cx + r * mult, cy, 3, 0, Math.PI * 2);
      c.fillStyle = col;
      c.fill();
    }
    c.restore();
  }

  /** PGO-7 style reticle — chevron aiming point + range stadia + BDC markers */
  private _drawRPGReticle(c: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    const col = 'rgba(0,0,0,0.80)';
    c.save();
    c.strokeStyle = col;
    c.fillStyle = col;

    // Horizontal reference line
    c.lineWidth = 1.5;
    this._line(c, cx - r * 0.9, cy, cx + r * 0.9, cy);

    // Vertical line (upper half only — lower has stadia)
    this._line(c, cx, cy - r * 0.9, cx, cy - r * 0.05);

    // ── Chevron aiming point (centre) ────────────────────────────────────────
    const chevH = r * 0.055;
    const chevW = r * 0.07;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(cx - chevW, cy - chevH);
    c.lineTo(cx, cy);
    c.lineTo(cx + chevW, cy - chevH);
    c.stroke();
    // Chevron tip dot
    c.beginPath();
    c.arc(cx, cy, 2.5, 0, Math.PI * 2);
    c.fill();

    // ── Range stadia bars (below centre — each step = 100m holdover) ─────────
    c.lineWidth = 1.5;
    const stadiaSpacing = r * 0.11;
    const stadiaWidths = [r * 0.22, r * 0.16, r * 0.11, r * 0.07];
    const stadiaLabels = ['2', '3', '4', '5']; // ×100m
    c.font = `bold ${Math.round(r * 0.055)}px monospace`;
    c.textAlign = 'right';
    c.textBaseline = 'middle';
    for (let i = 0; i < stadiaWidths.length; i++) {
      const sy = cy + stadiaSpacing * (i + 1);
      const hw = stadiaWidths[i];
      this._line(c, cx - hw, sy, cx + hw, sy);
      // Label on left
      c.fillText(stadiaLabels[i], cx - hw - 6, sy);
    }

    // ── Lateral windage ticks on horizontal line ──────────────────────────────
    c.lineWidth = 1;
    const tickH = r * 0.03;
    for (let i = 1; i <= 4; i++) {
      for (const sign of [-1, 1]) {
        const tx = cx + sign * r * i * 0.18;
        const h = i % 2 === 0 ? tickH * 1.5 : tickH;
        this._line(c, tx, cy - h, tx, cy + h);
      }
    }

    c.restore();
  }

  private _line(c: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  }
}
