/**
 * Pause menu overlay — Escape to toggle.
 * Resume or exit back to the start screen.
 * Includes sensitivity sliders.
 */

import { SensitivitySettings } from '../core/sensitivity-settings';

export class PauseMenu {
  private overlay: HTMLDivElement;
  private _isOpen = false;

  /** Fires when user clicks Resume */
  onResume: (() => void) | null = null;
  /** Fires when user clicks Exit to Menu */
  onExit: (() => void) | null = null;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'pause-menu';
    this.overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.82);
      z-index: 50;
      font-family: 'Courier New', monospace;
      color: #d4af37;
    `;

    const title = document.createElement('h2');
    title.textContent = 'PAUSED';
    title.style.cssText = `
      font-size: 42px;
      letter-spacing: 8px;
      margin-bottom: 24px;
      color: #d4af37;
      text-shadow: 0 0 12px rgba(212, 175, 55, 0.3);
    `;
    this.overlay.appendChild(title);

    // Sensitivity section
    const settingsSection = document.createElement('div');
    settingsSection.style.cssText = `
      margin-bottom: 28px;
      padding: 16px 24px;
      background: rgba(0,0,0,0.4);
      border: 1px solid rgba(212, 175, 55, 0.3);
      border-radius: 4px;
    `;
    const settingsTitle = document.createElement('div');
    settingsTitle.textContent = 'SENSITIVITY';
    settingsTitle.style.cssText = `
      font-size: 12px;
      letter-spacing: 4px;
      margin-bottom: 16px;
      color: rgba(212, 175, 55, 0.9);
    `;
    settingsSection.appendChild(settingsTitle);
    const s = SensitivitySettings.get();
    settingsSection.appendChild(this.createSlider('Mouse', s.mouse, (v) => SensitivitySettings.set({ mouse: v })));
    settingsSection.appendChild(this.createSlider('Gamepad', s.gamepad, (v) => SensitivitySettings.set({ gamepad: v })));
    settingsSection.appendChild(this.createSlider('Mobile', s.mobile, (v) => SensitivitySettings.set({ mobile: v })));
    this.overlay.appendChild(settingsSection);

    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 16px;
      align-items: center;
    `;

    const resumeBtn = this.createButton('RESUME');
    resumeBtn.addEventListener('click', () => {
      this.hide();
      this.onResume?.();
    });
    btnContainer.appendChild(resumeBtn);

    const exitBtn = this.createButton('EXIT TO MENU');
    exitBtn.addEventListener('click', () => {
      this.hide();
      this.onExit?.();
    });
    btnContainer.appendChild(exitBtn);

    this.overlay.appendChild(btnContainer);

    // Hint at bottom
    const hint = document.createElement('div');
    hint.textContent = 'Press Escape to resume';
    hint.style.cssText = `
      position: absolute;
      bottom: 30px;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.35);
      letter-spacing: 2px;
    `;
    this.overlay.appendChild(hint);

    document.body.appendChild(this.overlay);
  }

  private createSlider(label: string, value: number, onChange: (v: number) => void): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = `display: flex; align-items: center; gap: 12px; margin-bottom: 10px; min-width: 220px;`;
    const lab = document.createElement('label');
    lab.textContent = label;
    lab.style.cssText = `width: 70px; font-size: 12px; letter-spacing: 1px;`;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.value = String(value);
    input.style.cssText = `
      flex: 1;
      height: 6px;
      -webkit-appearance: none;
      appearance: none;
      background: rgba(212, 175, 55, 0.2);
      border-radius: 3px;
      outline: none;
    `;
    input.addEventListener('input', () => {
      const v = parseInt(input.value, 10);
      onChange(v);
    });
    const valSpan = document.createElement('span');
    valSpan.style.cssText = `width: 28px; font-size: 11px; color: rgba(255,255,255,0.7);`;
    const updateVal = () => { valSpan.textContent = `${input.value}%`; };
    input.addEventListener('input', updateVal);
    updateVal();
    row.appendChild(lab);
    row.appendChild(input);
    row.appendChild(valSpan);
    return row;
  }

  private createButton(text: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `
      padding: 12px 36px;
      font-size: 16px;
      font-family: 'Courier New', monospace;
      letter-spacing: 3px;
      background: transparent;
      color: #d4af37;
      border: 2px solid #d4af37;
      cursor: pointer;
      min-width: 240px;
      transition: background 0.2s, color 0.2s;
    `;
    btn.addEventListener('mouseenter', () => {
      btn.style.background = '#d4af37';
      btn.style.color = '#000';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'transparent';
      btn.style.color = '#d4af37';
    });
    return btn;
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  show(): void {
    this._isOpen = true;
    this.overlay.style.display = 'flex';
  }

  hide(): void {
    this._isOpen = false;
    this.overlay.style.display = 'none';
  }

  dispose(): void {
    this.overlay.remove();
  }
}
