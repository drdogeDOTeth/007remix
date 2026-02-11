/**
 * Hit marker UI - shows brief crosshair feedback when hitting an enemy.
 */
export class HitMarker {
  private container: HTMLDivElement;
  private hideTimeout: number | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 40px;
      height: 40px;
      display: none;
      z-index: 900;
    `;

    // Create X-shaped hit marker with 4 diagonal lines
    const createLine = (rotation: number): HTMLDivElement => {
      const line = document.createElement('div');
      line.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        width: 3px;
        height: 20px;
        background: #ffffff;
        transform: translate(-50%, -50%) rotate(${rotation}deg);
        box-shadow: 0 0 4px #000000;
      `;
      return line;
    };

    // Add 4 diagonal lines to form an X
    this.container.appendChild(createLine(45));
    this.container.appendChild(createLine(-45));

    document.body.appendChild(this.container);
  }

  /**
   * Show hit marker briefly (150ms).
   */
  show(): void {
    // Clear any existing hide timeout
    if (this.hideTimeout !== null) {
      clearTimeout(this.hideTimeout);
    }

    this.container.style.display = 'block';

    // Hide after 150ms
    this.hideTimeout = window.setTimeout(() => {
      this.container.style.display = 'none';
      this.hideTimeout = null;
    }, 150);
  }

  /**
   * Show hit marker with custom color for headshots.
   */
  showHeadshot(): void {
    // Change color to red for headshots
    const lines = this.container.children;
    for (let i = 0; i < lines.length; i++) {
      (lines[i] as HTMLDivElement).style.background = '#ff0000';
    }

    this.show();

    // Reset to white after showing
    setTimeout(() => {
      for (let i = 0; i < lines.length; i++) {
        (lines[i] as HTMLDivElement).style.background = '#ffffff';
      }
    }, 200);
  }

  /**
   * Cleanup and remove from DOM.
   */
  dispose(): void {
    if (this.hideTimeout !== null) {
      clearTimeout(this.hideTimeout);
    }
    document.body.removeChild(this.container);
  }
}
