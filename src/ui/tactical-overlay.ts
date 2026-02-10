/**
 * Night vision + gas mask overlay — Fallout/Westworld tactical aesthetic.
 * Toggle with N key. Green phosphor tint, mask frame, subtle scanlines.
 */
export class TacticalOverlay {
  private overlay: HTMLDivElement;
  private _visible = false;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
      opacity: 0;
      z-index: 3;
      transition: opacity 0.25s ease;
    `;
    this.overlay.innerHTML = `
      <!-- Night vision green tint -->
      <div class="nv-tint" style="
        position: absolute;
        top: 0; left: 0;
        width: 100%; height: 100%;
        background: radial-gradient(
          ellipse 80% 80% at 50% 50%,
          rgba(60, 255, 60, 0.12) 0%,
          rgba(40, 180, 40, 0.08) 40%,
          rgba(20, 100, 20, 0.04) 70%,
          transparent 100%
        );
        mix-blend-mode: screen;
      "></div>
      <!-- Gas mask frame — rubber seal around edges -->
      <div class="mask-frame" style="
        position: absolute;
        top: 0; left: 0;
        width: 100%; height: 100%;
        background: 
          linear-gradient(to bottom, rgba(20, 25, 15, 0.85) 0%, transparent 12%),
          linear-gradient(to top, rgba(20, 25, 15, 0.85) 0%, transparent 12%),
          linear-gradient(to right, rgba(20, 25, 15, 0.75) 0%, transparent 15%),
          linear-gradient(to left, rgba(20, 25, 15, 0.75) 0%, transparent 15%);
      "></div>
      <!-- Lens oval vignette -->
      <div class="lens-vignette" style="
        position: absolute;
        top: 0; left: 0;
        width: 100%; height: 100%;
        background: radial-gradient(
          ellipse 85% 75% at 50% 48%,
          transparent 55%,
          rgba(10, 15, 8, 0.4) 75%,
          rgba(15, 22, 10, 0.7) 90%,
          rgba(18, 25, 12, 0.9) 100%
        );
      "></div>
      <!-- Scanlines -->
      <div class="scanlines" style="
        position: absolute;
        top: 0; left: 0;
        width: 100%; height: 100%;
        background: repeating-linear-gradient(
          0deg,
          transparent,
          transparent 2px,
          rgba(0, 0, 0, 0.03) 2px,
          rgba(0, 0, 0, 0.03) 4px
        );
      "></div>
      <!-- Subtle noise/grain (optional) -->
      <div class="grain" style="
        position: absolute;
        top: 0; left: 0;
        width: 100%; height: 100%;
        opacity: 0.04;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
      "></div>
    `;
    document.body.appendChild(this.overlay);
  }

  set visible(v: boolean) {
    if (v === this._visible) return;
    this._visible = v;
    this.overlay.style.opacity = v ? '1' : '0';
  }

  get visible(): boolean {
    return this._visible;
  }
}
