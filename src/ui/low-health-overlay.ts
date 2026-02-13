/**
 * Persistent red vignette when health is at or below 25.
 * Intensity increases as health drops.
 */
const LOW_HEALTH_THRESHOLD = 25;

export class LowHealthOverlay {
  private overlay: HTMLDivElement;
  private visible = false;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
      z-index: 4;
      background: radial-gradient(
        ellipse 80% 80% at 50% 50%,
        transparent 35%,
        rgba(120, 0, 0, 0.15) 60%,
        rgba(80, 0, 0, 0.4) 100%
      );
      opacity: 0;
      transition: opacity 0.15s ease-out;
    `;
    document.body.appendChild(this.overlay);
  }

  /** Update visibility and intensity based on health (0–100) */
  update(health: number): void {
    if (health > LOW_HEALTH_THRESHOLD) {
      this.overlay.style.opacity = '0';
      return;
    }
    const t = 1 - health / LOW_HEALTH_THRESHOLD;
    const opacity = 0.2 + t * 0.5;
    this.overlay.style.opacity = String(opacity);
  }

  hide(): void {
    this.overlay.style.opacity = '0';
  }

  dispose(): void {
    this.overlay.remove();
  }
}
