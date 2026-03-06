import { WeaponBase } from '../weapons/weapon-base';

export class HUD {
  private healthEl: HTMLElement;
  private ammoEl: HTMLElement;
  private crosshairEl: HTMLElement;
  private hudEl: HTMLElement;
  private armorEl: HTMLElement;
  private grenadeEl: HTMLElement;
  private pingEl: HTMLElement;
  private killsEl: HTMLElement;
  private timeOfDayEl: HTMLElement;
  private compassEl: HTMLElement;
  private compassStripEl: HTMLElement;
  private compassDegreesEl: HTMLElement;

  private crosshairFlashTimer = 0;

  constructor() {
    this.hudEl = document.getElementById('hud')!;
    this.healthEl = document.getElementById('health-value')!;
    this.ammoEl = document.getElementById('ammo-display')!;
    this.crosshairEl = document.getElementById('crosshair')!;

    // Create armor display (next to health)
    this.armorEl = document.createElement('div');
    this.armorEl.id = 'armor-display';
    this.armorEl.style.cssText = `
      position: absolute;
      bottom: 24px;
      left: 145px;
      font-size: 20px;
      font-family: 'Courier New', monospace;
      color: #66aaff;
      font-weight: bold;
      pointer-events: none;
      text-shadow: 0 0 8px rgba(100,150,255,0.5);
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: rgba(0,0,0,0.5);
      border: 1px solid rgba(100,150,255,0.25);
      border-radius: 4px;
      visibility: hidden;
    `;
    this.hudEl.appendChild(this.armorEl);

    this.grenadeEl = document.createElement('div');
    this.grenadeEl.id = 'grenade-display';
    this.grenadeEl.style.cssText = `
      position: absolute;
      bottom: 20px;
      right: 20px;
      margin-bottom: 48px;
      font-size: 16px;
      font-family: 'Courier New', monospace;
      color: #8f8;
      pointer-events: none;
    `;
    this.hudEl.appendChild(this.grenadeEl);

    // Ping display (top-right corner)
    this.pingEl = document.createElement('div');
    this.pingEl.id = 'ping-display';
    this.pingEl.style.cssText = `
      position: absolute;
      top: 20px;
      right: 20px;
      font-size: 14px;
      font-family: 'Courier New', monospace;
      color: #8f8;
      pointer-events: none;
      visibility: hidden;
    `;
    this.hudEl.appendChild(this.pingEl);

    // Kills display (multiplayer only)
    this.killsEl = document.createElement('div');
    this.killsEl.id = 'kills-display';
    this.killsEl.style.cssText = `
      position: absolute;
      top: 20px;
      left: 20px;
      font-size: 14px;
      font-family: 'Courier New', monospace;
      color: #8f8;
      pointer-events: none;
      visibility: hidden;
    `;
    this.hudEl.appendChild(this.killsEl);

    // Time of day (custom quickplay)
    this.timeOfDayEl = document.createElement('div');
    this.timeOfDayEl.id = 'time-of-day-display';
    this.timeOfDayEl.style.cssText = `
      position: absolute;
      top: 20px;
      left: 20px;
      font-size: 24px;
      font-weight: bold;
      font-family: 'Courier New', monospace;
      color: #d4af37;
      text-shadow: 0 0 8px rgba(212,175,55,0.6), 0 2px 4px rgba(0,0,0,0.9);
      pointer-events: none;
      visibility: hidden;
      letter-spacing: 2px;
      padding: 4px 10px;
      background: rgba(0,0,0,0.4);
      border: 1px solid rgba(212,175,55,0.3);
      border-radius: 4px;
    `;
    this.hudEl.appendChild(this.timeOfDayEl);

    // Compass (top center) — N E S W strip + degrees. Slides horizontally (no rotation = no tilt)
    this.compassEl = document.createElement('div');
    this.compassEl.id = 'compass';
    this.compassEl.style.cssText = `
      position: absolute;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      width: 200px;
      height: 36px;
      pointer-events: none;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.5);
      border: 1px solid rgba(212,175,55,0.35);
      border-radius: 4px;
    `;
    this.compassStripEl = document.createElement('div');
    this.compassStripEl.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      font-weight: bold;
      font-family: 'Courier New', monospace;
      color: rgba(255,255,255,0.9);
      text-shadow: 0 0 6px rgba(0,0,0,0.9);
      flex-shrink: 0;
    `;
    // Each cardinal 50px, order W N E S (repeated). Heading 0°=N, 90°=E, 180°=S, 270°=W.
    const cardinals = ['W', 'N', 'E', 'S'];
    const span = (c: string) => `<span style="min-width:50px;text-align:center;${c === 'N' ? 'color:#d4af37' : ''}">${c}</span>`;
    this.compassStripEl.innerHTML = [...cardinals, ...cardinals, ...cardinals].map(span).join('');
    this.compassEl.appendChild(this.compassStripEl);
    this.compassDegreesEl = document.createElement('div');
    this.compassDegreesEl.style.cssText = `
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      font-size: 12px;
      color: #d4af37;
      pointer-events: none;
      bottom: 4px;
    `;
    this.compassEl.appendChild(this.compassDegreesEl);
    this.hudEl.appendChild(this.compassEl);

    // Inject kill score animation keyframes once
    if (!document.getElementById('kill-score-keyframes')) {
      const style = document.createElement('style');
      style.id = 'kill-score-keyframes';
      style.textContent = `@keyframes killScorePop {
        0%   { opacity: 1; transform: translateX(-50%) translateY(0px) scale(1.3); }
        30%  { opacity: 1; transform: translateX(-50%) translateY(-20px) scale(1); }
        100% { opacity: 0; transform: translateX(-50%) translateY(-60px) scale(0.85); }
      }`;
      document.head.appendChild(style);
    }
  }

  /** Update compass heading. yaw in radians. Slides strip + shows degrees (no rotation = no tilt). */
  updateCompass(yaw: number): void {
    // Game: +X=North, +Z=East. Camera yaw=0 faces -Z (West). Heading 0°=N, 90°=E, 180°=S, 270°=W.
    const deg = (((-Math.PI / 2 - yaw) * 180 / Math.PI) % 360 + 360) % 360;
    const seg = 50; // px per cardinal (90°)
    const base = 25; // offset to center N when heading=0
    const tx = base - (deg / 90) * seg;
    this.compassStripEl.style.transform = `translateX(${tx}px)`;
    this.compassDegreesEl.textContent = `${Math.round(deg)}°`;
  }

  /** Update time of day display (HH:MM). Pass null to hide. */
  updateTimeOfDay(t: number | null): void {
    if (t === null) {
      this.timeOfDayEl.style.visibility = 'hidden';
      return;
    }
    this.timeOfDayEl.style.visibility = 'visible';
    const hour24 = ((t % 1) + 1) % 1 * 24;
    const h = Math.floor(hour24) % 24;
    const m = Math.floor((hour24 % 1) * 60);
    this.timeOfDayEl.textContent = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  /** Update kills display (multiplayer). Pass null to hide. */
  updateKills(kills: number | null, killsToWin = 25): void {
    if (kills === null) {
      this.killsEl.style.visibility = 'hidden';
      return;
    }
    this.killsEl.style.visibility = 'visible';
    this.killsEl.textContent = `Kills: ${kills} / ${killsToWin}`;
  }

  /** Show a floating +100 score popup at screen center. */
  showKillScore(points = 100): void {
    const el = document.createElement('div');
    el.textContent = `+${points}`;
    el.style.cssText = `
      position: absolute;
      left: 50%;
      top: 42%;
      font-size: 28px;
      font-family: 'Courier New', monospace;
      font-weight: bold;
      color: #ffdd44;
      text-shadow: 0 0 10px rgba(255,200,0,0.9), 0 2px 4px rgba(0,0,0,0.9);
      pointer-events: none;
      z-index: 9999;
      animation: killScorePop 1.2s ease-out forwards;
    `;
    this.hudEl.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  show(): void {
    this.hudEl.style.display = 'block';
  }

  /** Update controls hint for multiplayer (Q = Scoreboard, I = Inventory). */
  setMultiplayerHint(enabled: boolean): void {
    const hint = document.getElementById('controls-hint');
    if (hint) {
      hint.textContent = enabled
        ? 'Q Scoreboard · I Inventory · Shift Sprint · C Crouch · N NV/Mask · V Flashlight · F8 Spawn'
        : 'Tab Inventory · Shift Sprint · C Crouch · N NV/Mask · V Flashlight · F8 Spawn';
    }
  }

  hide(): void {
    this.hudEl.style.display = 'none';
  }

  updateHealth(health: number): void {
    this.healthEl.textContent = String(Math.ceil(health));
    if (health <= 25) {
      this.healthEl.style.color = '#ff3333';
    } else if (health <= 50) {
      this.healthEl.style.color = '#ffaa33';
    } else {
      this.healthEl.style.color = '#fff';
    }
  }

  updateArmor(armor: number): void {
    if (armor > 0) {
      this.armorEl.innerHTML = `<span style="color: #66aaff; font-size: 18px;">&#9632;</span><span>${Math.ceil(armor)}</span>`;
      this.armorEl.style.visibility = 'visible';
    } else {
      this.armorEl.innerHTML = '';
      this.armorEl.style.visibility = 'hidden';
    }
  }

  updateGrenades(gasCount: number, fragCount: number): void {
    this.grenadeEl.textContent = `G [Gas]: ${gasCount}  ·  F [Frag]: ${fragCount}`;
    this.grenadeEl.style.visibility = gasCount >= 0 || fragCount >= 0 ? 'visible' : 'hidden';
  }

  updatePing(ping: number | null): void {
    if (ping === null || ping < 0) {
      this.pingEl.style.visibility = 'hidden';
      return;
    }

    this.pingEl.style.visibility = 'visible';
    this.pingEl.textContent = `PING: ${Math.round(ping)}ms`;

    // Color code based on connection quality
    if (ping < 50) {
      this.pingEl.style.color = '#8f8'; // Green - excellent
    } else if (ping < 100) {
      this.pingEl.style.color = '#ff8'; // Yellow - good
    } else if (ping < 200) {
      this.pingEl.style.color = '#fa8'; // Orange - fair
    } else {
      this.pingEl.style.color = '#f88'; // Red - poor
    }
  }

  updateWeapon(weapon: WeaponBase): void {
    const reloadText = weapon.reloading ? ' [RELOADING]' : '';
    this.ammoEl.innerHTML = `
      <div style="font-size: 14px; color: #aaa; margin-bottom: 4px;">${weapon.stats.name}</div>
      <div>
        <span style="font-size: 28px; font-weight: bold;">${weapon.currentAmmo}</span>
        <span style="color: #888;"> / ${weapon.reserveAmmo}</span>
        <span style="color: #ff6;">${reloadText}</span>
      </div>
    `;
  }

  flashCrosshair(): void {
    this.crosshairFlashTimer = 0.15;
    this.crosshairEl.style.color = 'rgba(255, 50, 50, 1)';
  }

  flashCrosshairFire(): void {
    if (this.crosshairFlashTimer <= 0) {
      this.crosshairFlashTimer = 0.06;
      this.crosshairEl.style.color = 'rgba(255, 255, 150, 1)';
    }
  }

  /** Show pickup notification briefly */
  showPickupNotification(text: string): void {
    const el = document.createElement('div');
    el.style.cssText = `
      position: absolute;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 16px;
      font-family: 'Courier New', monospace;
      color: #ffdd44;
      text-shadow: 0 0 4px rgba(0,0,0,0.8);
      pointer-events: none;
      transition: opacity 0.5s, transform 0.5s;
    `;
    el.textContent = text;
    this.hudEl.appendChild(el);

    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(-50%) translateY(-20px)';
    }, 1000);
    setTimeout(() => el.remove(), 1500);
  }

  update(dt: number): void {
    if (this.crosshairFlashTimer > 0) {
      this.crosshairFlashTimer -= dt;
      if (this.crosshairFlashTimer <= 0) {
        this.crosshairEl.style.color = 'rgba(255, 255, 255, 0.8)';
      }
    }
  }
}
