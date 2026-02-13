/**
 * Death overlay UI shown when player dies.
 * Displays death message and respawn countdown.
 */
export class DeathOverlay {
  private container: HTMLDivElement;
  private messageElement: HTMLDivElement;
  private countdownElement: HTMLDivElement;
  private visible = false;
  private countdownInterval: number | null = null;

  constructor() {
    // Create overlay container
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: none;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      z-index: 1000;
      font-family: 'Courier New', monospace;
      color: #ff0000;
    `;

    // Death message
    this.messageElement = document.createElement('div');
    this.messageElement.style.cssText = `
      font-size: 48px;
      font-weight: bold;
      margin-bottom: 20px;
      text-shadow: 0 0 10px #ff0000;
    `;
    this.messageElement.textContent = 'YOU DIED';
    this.container.appendChild(this.messageElement);

    // Respawn countdown
    this.countdownElement = document.createElement('div');
    this.countdownElement.style.cssText = `
      font-size: 24px;
      color: #ffffff;
    `;
    this.container.appendChild(this.countdownElement);

    document.body.appendChild(this.container);
  }

  /** Called when countdown reaches 0 (for single-player respawn). */
  onCountdownComplete: (() => void) | null = null;

  /**
   * Show death overlay with killer name and respawn countdown.
   */
  show(killerName?: string): void {
    this.visible = true;
    this.container.style.display = 'flex';

    if (killerName) {
      this.messageElement.textContent = `KILLED BY ${killerName.toUpperCase()}`;
    } else {
      this.messageElement.textContent = 'YOU DIED';
    }

    let timeLeft = 3;
    this.updateCountdown(timeLeft);

    this.countdownInterval = window.setInterval(() => {
      timeLeft--;
      if (timeLeft > 0) {
        this.updateCountdown(timeLeft);
      } else {
        this.updateCountdown(0);
        if (this.countdownInterval !== null) {
          clearInterval(this.countdownInterval);
          this.countdownInterval = null;
        }
        this.onCountdownComplete?.();
      }
    }, 1000);
  }

  /**
   * Update countdown display.
   */
  private updateCountdown(seconds: number): void {
    if (seconds > 0) {
      this.countdownElement.textContent = `Respawning in ${seconds}...`;
    } else {
      this.countdownElement.textContent = 'Respawning...';
    }
  }

  /**
   * Hide death overlay.
   */
  hide(): void {
    this.visible = false;
    this.container.style.display = 'none';

    if (this.countdownInterval !== null) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  /**
   * Check if overlay is visible.
   */
  isVisible(): boolean {
    return this.visible;
  }

  /**
   * Cleanup and remove from DOM.
   */
  dispose(): void {
    this.hide();
    document.body.removeChild(this.container);
  }
}
