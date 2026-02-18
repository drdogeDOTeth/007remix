/**
 * Screen Glitch Effect
 * Adds random static noise and glitch artifacts to the CCTV background canvas.
 */
export class ScreenGlitch {
  private canvas: HTMLCanvasElement | null = null;
  private overlayCanvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationId: number | null = null;
  private lastGlitchTime = 0;
  private glitchDuration = 0;
  private isGlitching = false;
  private resizeHandler: (() => void) | null = null;

  constructor() {
    this.createOverlay();
  }

  private createOverlay(): void {
    // Create an overlay canvas for static/noise effects
    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.id = 'glitch-overlay';
    this.overlayCanvas.style.position = 'fixed';
    this.overlayCanvas.style.top = '0';
    this.overlayCanvas.style.left = '0';
    this.overlayCanvas.style.width = '100%';
    this.overlayCanvas.style.height = '100%';
    this.overlayCanvas.style.pointerEvents = 'none';
    this.overlayCanvas.style.zIndex = '2';
    this.overlayCanvas.style.opacity = '0';
    this.overlayCanvas.style.mixBlendMode = 'overlay';
    this.overlayCanvas.width = window.innerWidth;
    this.overlayCanvas.height = window.innerHeight;
    document.body.appendChild(this.overlayCanvas);

    this.ctx = this.overlayCanvas.getContext('2d');

    // Handle resize — store ref so we can remove in dispose()
    this.resizeHandler = () => {
      if (this.overlayCanvas) {
        this.overlayCanvas.width = window.innerWidth;
        this.overlayCanvas.height = window.innerHeight;
      }
    };
    window.addEventListener('resize', this.resizeHandler);
  }

  private drawStatic(): void {
    if (!this.ctx || !this.overlayCanvas) return;

    const { width, height } = this.overlayCanvas;
    const imageData = this.ctx.createImageData(width, height);
    const data = imageData.data;

    // Generate random noise (sparse for performance)
    for (let i = 0; i < data.length; i += 16) {
      const value = Math.random() * 255;
      data[i] = value;     // R
      data[i + 1] = value; // G
      data[i + 2] = value; // B
      data[i + 3] = 180;   // A (semi-transparent)
    }

    this.ctx.putImageData(imageData, 0, 0);

    // Add some horizontal glitch bars
    if (Math.random() > 0.7) {
      const barY = Math.random() * height;
      const barHeight = Math.random() * 8 + 2;
      this.ctx.fillStyle = `rgba(${Math.random() * 255}, ${Math.random() * 100}, ${Math.random() * 100}, 0.4)`;
      this.ctx.fillRect(0, barY, width, barHeight);
    }
  }

  private animate = (time: number): void => {
    if (!this.overlayCanvas) return;

    // Random glitch every 5-10 seconds
    const timeSinceLastGlitch = time - this.lastGlitchTime;
    const nextGlitchDelay = 5000 + Math.random() * 5000;

    if (!this.isGlitching && timeSinceLastGlitch > nextGlitchDelay) {
      // Start glitch
      this.isGlitching = true;
      this.glitchDuration = 50 + Math.random() * 150; // 50-200ms
      this.lastGlitchTime = time;
      this.overlayCanvas.style.opacity = '0.6';
    }

    if (this.isGlitching) {
      // Draw static during glitch
      this.drawStatic();

      // End glitch after duration
      if (time - this.lastGlitchTime > this.glitchDuration) {
        this.isGlitching = false;
        this.overlayCanvas.style.opacity = '0';
        if (this.ctx && this.overlayCanvas) {
          this.ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        }
      }
    }

    this.animationId = requestAnimationFrame(this.animate);
  };

  /**
   * Start the glitch effect animation.
   */
  start(): void {
    if (this.animationId !== null) return;
    this.lastGlitchTime = performance.now();
    this.animationId = requestAnimationFrame(this.animate);
  }

  /**
   * Stop the glitch effect animation.
   */
  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.overlayCanvas) {
      this.overlayCanvas.style.opacity = '0';
    }
  }

  /**
   * Remove overlay from DOM.
   */
  dispose(): void {
    this.stop();
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }
    if (this.overlayCanvas) {
      this.overlayCanvas.remove();
      this.overlayCanvas = null;
    }
    this.ctx = null;
  }
}
