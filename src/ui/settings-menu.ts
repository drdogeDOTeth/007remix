/**
 * Settings menu — controls, aim, audio.
 * Tabbed by category. Accessible from pause menu and main menu.
 */

import * as THREE from 'three';
import { GameSettings, type GamepadResponseCurve, type DifficultyLevel } from '../core/game-settings';
import { setMusicVolume } from '../audio/music';
import { setSFXVolume } from '../audio/sound-effects';
import type { Renderer } from '../core/renderer';

function applyVolume(): void {
  const m = GameSettings.getVolumeMaster() * GameSettings.getVolumeMusic();
  const s = GameSettings.getVolumeMaster() * GameSettings.getVolumeSFX();
  setMusicVolume(m);
  setSFXVolume(s);
}

type SettingsTab = 'controls' | 'aim' | 'audio' | 'gameplay' | 'display' | 'postfx';

export class SettingsMenu {
  private overlay: HTMLDivElement;
  private tabs: Record<SettingsTab, HTMLDivElement> = {} as Record<SettingsTab, HTMLDivElement>;
  private panels: Record<SettingsTab, HTMLDivElement> = {} as Record<SettingsTab, HTMLDivElement>;
  private _isOpen = false;

  /** Fires when user clicks Back */
  onBack: (() => void) | null = null;

  /** Renderer reference for live post-processing updates. */
  private renderer: Renderer | null = null;
  private rendererScene: THREE.Scene | null = null;
  private rendererCamera: THREE.Camera | null = null;

  setRenderer(renderer: Renderer, scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer = renderer;
    this.rendererScene = scene;
    this.rendererCamera = camera;
  }

  private applyPostFX(): void {
    this.renderer?.applyPostProcessingSettings(
      this.rendererScene ?? undefined,
      this.rendererCamera ?? undefined,
    );
  }

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'settings-menu';
    this.overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.9);
      z-index: 60;
      font-family: 'Courier New', monospace;
      color: #d4af37;
      overflow-y: auto;
      padding: 24px;
    `;

    const title = document.createElement('h2');
    title.textContent = 'SETTINGS';
    title.style.cssText = `
      font-size: 36px;
      letter-spacing: 8px;
      margin-bottom: 16px;
      color: #d4af37;
      text-shadow: 0 0 12px rgba(212, 175, 55, 0.3);
    `;
    this.overlay.appendChild(title);

    // Tab row
    const tabRow = document.createElement('div');
    tabRow.style.cssText = `
      display: flex;
      gap: 12px;
      margin-bottom: 20px;
    `;
    const tabStyle = (active: boolean) => `
      padding: 10px 24px;
      font-size: 12px;
      letter-spacing: 2px;
      background: ${active ? 'rgba(212, 175, 55, 0.25)' : 'transparent'};
      color: #d4af37;
      border: 1px solid rgba(212, 175, 55, 0.5);
      cursor: pointer;
      font-family: 'Courier New', monospace;
      transition: background 0.2s;
    `;
    for (const id of ['controls', 'aim', 'audio', 'gameplay', 'display', 'postfx'] as const) {
      const tab = document.createElement('div');
      const labels: Record<SettingsTab, string> = {
        controls: 'CONTROLS',
        aim: 'AIM',
        audio: 'AUDIO',
        gameplay: 'GAMEPLAY',
        display: 'DISPLAY',
        postfx: 'POST FX',
      };
      tab.textContent = labels[id];
      tab.style.cssText = tabStyle(id === 'controls');
      tab.dataset.tab = id;
      tab.addEventListener('click', () => this.showTab(id));
      tab.addEventListener('mouseenter', () => {
        if (!tab.dataset.active) tab.style.background = 'rgba(212, 175, 55, 0.1)';
      });
      tab.addEventListener('mouseleave', () => {
        if (!tab.dataset.active) tab.style.background = 'transparent';
      });
      this.tabs[id] = tab;
      tabRow.appendChild(tab);
    }
    this.overlay.appendChild(tabRow);

    const g = GameSettings.get();

    // Content container — only one panel visible
    const contentWrap = document.createElement('div');
    contentWrap.style.cssText = `min-width: 320px; margin-bottom: 20px;`;

    // CONTROLS panel
    const controlsPanel = document.createElement('div');
    controlsPanel.dataset.panel = 'controls';
    const controlsSection = this.createSectionContent();
    controlsSection.appendChild(this.createSlider('Mouse', g.mouseSens, 0, 100, '%', (v) => GameSettings.set({ mouseSens: v })));
    controlsSection.appendChild(this.createSlider('Gamepad', g.gamepadSens, 0, 100, '%', (v) => GameSettings.set({ gamepadSens: v })));
    controlsSection.appendChild(this.createSlider('Mobile', g.mobileSens, 0, 100, '%', (v) => GameSettings.set({ mobileSens: v })));
    controlsSection.appendChild(this.createSlider('Deadzone L', g.deadzoneLeft, 0, 50, '%', (v) => GameSettings.set({ deadzoneLeft: v })));
    controlsSection.appendChild(this.createSlider('Deadzone R', g.deadzoneRight, 0, 50, '%', (v) => GameSettings.set({ deadzoneRight: v })));
    controlsSection.appendChild(this.createResponseCurveRow(g.gamepadResponseCurve));
    controlsSection.appendChild(this.createSlider('Look Smooth', g.gamepadSmoothing, 0, 100, '%', (v) => GameSettings.set({ gamepadSmoothing: v })));
    controlsSection.appendChild(this.createSlider('Look Y Scale', g.gamepadLookYScale, 25, 150, '%', (v) => GameSettings.set({ gamepadLookYScale: v })));
    controlsSection.appendChild(this.createSlider('Scope Sens', g.scopeSensMult, 25, 150, '%', (v) => GameSettings.set({ scopeSensMult: v })));
    controlsPanel.appendChild(controlsSection);
    controlsPanel.style.display = 'block';
    this.panels.controls = controlsPanel;
    contentWrap.appendChild(controlsPanel);

    // AIM panel
    const aimPanel = document.createElement('div');
    aimPanel.dataset.panel = 'aim';
    const aimSection = this.createSectionContent();
    aimSection.appendChild(this.createSlider('Strength', g.aimAssistStrength, 0, 100, '%', (v) => GameSettings.set({ aimAssistStrength: v })));
    aimSection.appendChild(this.createAimAssistModeRow(g.aimAssistMode));
    aimPanel.appendChild(aimSection);
    aimPanel.style.display = 'none';
    this.panels.aim = aimPanel;
    contentWrap.appendChild(aimPanel);

    // AUDIO panel
    const audioPanel = document.createElement('div');
    audioPanel.dataset.panel = 'audio';
    const audioSection = this.createSectionContent();
    audioSection.appendChild(this.createSlider('Master', g.volumeMaster, 0, 100, '%', (v) => {
      GameSettings.set({ volumeMaster: v });
      applyVolume();
    }));
    audioSection.appendChild(this.createSlider('Music', g.volumeMusic, 0, 100, '%', (v) => {
      GameSettings.set({ volumeMusic: v });
      applyVolume();
    }));
    audioSection.appendChild(this.createSlider('SFX', g.volumeSFX, 0, 100, '%', (v) => {
      GameSettings.set({ volumeSFX: v });
      applyVolume();
    }));
    audioPanel.appendChild(audioSection);
    audioPanel.style.display = 'none';
    this.panels.audio = audioPanel;
    contentWrap.appendChild(audioPanel);

    // GAMEPLAY panel (difficulty + AI)
    const gameplayPanel = document.createElement('div');
    gameplayPanel.dataset.panel = 'gameplay';
    const gameplaySection = this.createSectionContent();
    gameplaySection.appendChild(this.createDifficultyRow(g.difficulty));
    const reactionVal = Math.round(0.5 * 10 + (g.aiReactionTime / 100) * 25);
    gameplaySection.appendChild(this.createSlider('Reaction Time', reactionVal, 5, 30, 's', (v) => {
      GameSettings.set({ aiReactionTime: Math.round(((v / 10 - 0.5) / 2.5) * 100) });
    }, (v) => `${(v / 10).toFixed(1)}s`));
    gameplaySection.appendChild(this.createSlider('Sight Range', g.aiSightRange, 10, 35, 'm', (v) => GameSettings.set({ aiSightRange: v })));
    gameplaySection.appendChild(this.createSlider('FOV Scale', g.aiFovScale, 50, 150, '%', (v) => GameSettings.set({ aiFovScale: v })));
    gameplaySection.appendChild(this.createSlider('Hearing', g.aiHearingScale, 50, 200, '%', (v) => GameSettings.set({ aiHearingScale: v })));
    const graceVal = Math.round((g.aiGameStartGrace / 100) * 50);
    gameplaySection.appendChild(this.createSlider('Start Grace', graceVal, 0, 50, 's', (v) => {
      GameSettings.set({ aiGameStartGrace: Math.round((v / 50) * 100) });
    }, (v) => `${(v / 10).toFixed(1)}s`));
    gameplayPanel.appendChild(gameplaySection);
    gameplayPanel.style.display = 'none';
    this.panels.gameplay = gameplayPanel;
    contentWrap.appendChild(gameplayPanel);

    // DISPLAY panel (day/night cycle — custom quickplay)
    const displayPanel = document.createElement('div');
    displayPanel.dataset.panel = 'display';
    const displaySection = this.createSectionContent();
    displaySection.appendChild(this.createCheckbox('Day/Night Cycle', g.dayNightCycle, (v) =>
      GameSettings.set({ dayNightCycle: v }),
    ));
    displaySection.appendChild(this.createSlider('Cycle Speed', g.dayNightSpeed, 0, 200, '%', (v) =>
      GameSettings.set({ dayNightSpeed: v }),
    ));
    displaySection.appendChild(this.createSlider('Time of Day', g.timeOfDay, 0, 100, '%', (v) =>
      GameSettings.set({ timeOfDay: v }),
    ));
    displaySection.appendChild(this.createSlider('Intensity', g.dayNightIntensity ?? 100, 0, 200, '%', (v) =>
      GameSettings.set({ dayNightIntensity: v }),
    ));
    const timeLabel = document.createElement('div');
    timeLabel.style.cssText = `font-size: 11px; color: rgba(212,175,55,0.7); margin-top: -8px; margin-bottom: 12px;`;
    timeLabel.textContent = 'Custom Quickplay only. 0=midnight, 25=6am, 50=noon, 75=6pm (when paused)';
    displaySection.appendChild(timeLabel);
    displayPanel.appendChild(displaySection);
    displayPanel.style.display = 'none';
    this.panels.display = displayPanel;
    contentWrap.appendChild(displayPanel);

    // POST FX panel
    const postfxPanel = document.createElement('div');
    postfxPanel.dataset.panel = 'postfx';
    const postfxSection = this.createSectionContent();

    // Section header helper
    const makeHeader = (text: string): HTMLDivElement => {
      const h = document.createElement('div');
      h.textContent = text;
      h.style.cssText = `font-size: 11px; letter-spacing: 3px; color: rgba(212,175,55,0.55); margin: 14px 0 8px; border-bottom: 1px solid rgba(212,175,55,0.15); padding-bottom: 4px;`;
      return h;
    };

    postfxSection.appendChild(makeHeader('TONE MAPPING'));
    postfxSection.appendChild(this.createToneMappingRow(g.toneMapping));
    postfxSection.appendChild(this.createSlider('Exposure', g.exposure, 50, 200, '%', (v) => {
      GameSettings.set({ exposure: v });
      this.applyPostFX();
    }, (v) => `${(v / 100).toFixed(2)}x`));

    postfxSection.appendChild(makeHeader('BLOOM'));
    postfxSection.appendChild(this.createCheckbox('Bloom Enabled', g.bloomEnabled, (v) => {
      GameSettings.set({ bloomEnabled: v });
      this.applyPostFX();
    }));
    postfxSection.appendChild(this.createSlider('Strength', g.bloomStrength, 0, 100, '', (v) => {
      GameSettings.set({ bloomStrength: v });
      this.applyPostFX();
    }, (v) => `${(v / 100).toFixed(2)}`));
    postfxSection.appendChild(this.createSlider('Radius', g.bloomRadius, 0, 100, '', (v) => {
      GameSettings.set({ bloomRadius: v });
      this.applyPostFX();
    }, (v) => `${(v / 100).toFixed(2)}`));
    postfxSection.appendChild(this.createSlider('Threshold', g.bloomThreshold, 0, 100, '', (v) => {
      GameSettings.set({ bloomThreshold: v });
      this.applyPostFX();
    }, (v) => `${(v / 100).toFixed(2)}`));

    postfxSection.appendChild(makeHeader('RENDERING'));
    postfxSection.appendChild(this.createCheckbox('Shadows', g.shadowsEnabled, (v) => {
      GameSettings.set({ shadowsEnabled: v });
      this.applyPostFX();
    }));
    postfxSection.appendChild(this.createCheckbox('Pixel Mode (F2)', g.pixelMode, (v) => {
      GameSettings.set({ pixelMode: v });
      this.applyPostFX();
    }));
    postfxSection.appendChild(this.createSlider('Pixel Size', g.pixelSize, 2, 8, 'px', (v) => {
      GameSettings.set({ pixelSize: v });
      this.applyPostFX();
    }, (v) => `${v}px`));

    postfxPanel.appendChild(postfxSection);
    postfxPanel.style.display = 'none';
    this.panels.postfx = postfxPanel;
    contentWrap.appendChild(postfxPanel);

    this.overlay.appendChild(contentWrap);

    const backBtn = this.createButton('BACK');
    backBtn.addEventListener('click', () => {
      this.hide();
      this.onBack?.();
    });
    this.overlay.appendChild(backBtn);

    document.body.appendChild(this.overlay);

    this.showTab('controls');
  }

  private showTab(id: SettingsTab): void {
    for (const tabId of ['controls', 'aim', 'audio', 'gameplay', 'display', 'postfx'] as const) {
      const panel = this.panels[tabId];
      const tab = this.tabs[tabId];
      const active = tabId === id;
      panel!.style.display = active ? 'block' : 'none';
      tab!.dataset.active = active ? '1' : '';
      tab!.style.background = active ? 'rgba(212, 175, 55, 0.25)' : 'transparent';
    }
  }

  private createSectionContent(): HTMLDivElement {
    const section = document.createElement('div');
    section.style.cssText = `
      padding: 16px 24px;
      background: rgba(0,0,0,0.4);
      border: 1px solid rgba(212, 175, 55, 0.3);
      border-radius: 4px;
      min-width: 280px;
    `;
    return section;
  }

  private createToneMappingRow(value: string): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = `display: flex; align-items: center; gap: 12px; margin-bottom: 12px; min-width: 260px;`;
    const lab = document.createElement('label');
    lab.textContent = 'Tone Map';
    lab.style.cssText = `width: 90px; font-size: 12px; letter-spacing: 1px;`;
    const select = document.createElement('select');
    select.style.cssText = `
      flex: 1;
      padding: 6px 10px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      background: rgba(0,0,0,0.5);
      color: #d4af37;
      border: 1px solid rgba(212, 175, 55, 0.5);
      border-radius: 2px;
      cursor: pointer;
    `;
    const options: { v: string; label: string }[] = [
      { v: 'aces',     label: 'ACES Filmic (cinematic)' },
      { v: 'reinhard', label: 'Reinhard (natural)' },
      { v: 'cineon',   label: 'Cineon (film)' },
      { v: 'linear',   label: 'Linear (raw / no tone map)' },
    ];
    for (const opt of options) {
      const o = document.createElement('option');
      o.value = opt.v;
      o.textContent = opt.label;
      if (opt.v === value) o.selected = true;
      select.appendChild(o);
    }
    select.addEventListener('change', () => {
      GameSettings.set({ toneMapping: select.value as 'aces' | 'linear' | 'reinhard' | 'cineon' });
      this.applyPostFX();
    });
    row.appendChild(lab);
    row.appendChild(select);
    return row;
  }

  private createResponseCurveRow(value: GamepadResponseCurve): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = `display: flex; align-items: center; gap: 12px; margin-bottom: 12px; min-width: 260px;`;
    const lab = document.createElement('label');
    lab.textContent = 'Curve';
    lab.style.cssText = `width: 90px; font-size: 12px; letter-spacing: 1px;`;
    const select = document.createElement('select');
    select.style.cssText = `
      flex: 1;
      padding: 6px 10px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      background: rgba(0,0,0,0.5);
      color: #d4af37;
      border: 1px solid rgba(212, 175, 55, 0.5);
      border-radius: 2px;
      cursor: pointer;
    `;
    const options: { v: GamepadResponseCurve; label: string }[] = [
      { v: 'linear', label: 'Linear (1:1, raw)' },
      { v: 'exponential', label: 'Exponential (precision)' },
      { v: 'precision', label: 'Precision (fine aim)' },
      { v: 'classic', label: 'Classic (balanced)' },
    ];
    for (const opt of options) {
      const o = document.createElement('option');
      o.value = opt.v;
      o.textContent = opt.label;
      if (opt.v === value) o.selected = true;
      select.appendChild(o);
    }
    select.addEventListener('change', () => {
      GameSettings.set({ gamepadResponseCurve: select.value as GamepadResponseCurve });
    });
    row.appendChild(lab);
    row.appendChild(select);
    return row;
  }

  private createDifficultyRow(value: DifficultyLevel): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = `display: flex; align-items: center; gap: 12px; margin-bottom: 12px; min-width: 260px;`;
    const lab = document.createElement('label');
    lab.textContent = 'Difficulty';
    lab.style.cssText = `width: 90px; font-size: 12px; letter-spacing: 1px;`;
    const select = document.createElement('select');
    select.style.cssText = `
      flex: 1;
      padding: 6px 10px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      background: rgba(0,0,0,0.5);
      color: #d4af37;
      border: 1px solid rgba(212, 175, 55, 0.5);
      border-radius: 2px;
      cursor: pointer;
    `;
    const options: { v: DifficultyLevel; label: string }[] = [
      { v: 'easy', label: 'Easy (20% damage)' },
      { v: 'normal', label: 'Normal' },
      { v: 'hard', label: 'Hard (140% damage)' },
    ];
    for (const opt of options) {
      const o = document.createElement('option');
      o.value = opt.v;
      o.textContent = opt.label;
      if (opt.v === value) o.selected = true;
      select.appendChild(o);
    }
    select.addEventListener('change', () => {
      GameSettings.set({ difficulty: select.value as DifficultyLevel });
    });
    row.appendChild(lab);
    row.appendChild(select);
    return row;
  }

  private createAimAssistModeRow(value: 'off' | 'slowdown' | 'pull'): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = `display: flex; align-items: center; gap: 12px; margin-bottom: 12px; min-width: 260px;`;
    const lab = document.createElement('label');
    lab.textContent = 'Mode';
    lab.style.cssText = `width: 90px; font-size: 12px; letter-spacing: 1px;`;
    const select = document.createElement('select');
    select.style.cssText = `
      flex: 1;
      padding: 6px 10px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      background: rgba(0,0,0,0.5);
      color: #d4af37;
      border: 1px solid rgba(212, 175, 55, 0.5);
      border-radius: 2px;
      cursor: pointer;
    `;
    const options: { v: 'off' | 'slowdown' | 'pull'; label: string }[] = [
      { v: 'off', label: 'Off' },
      { v: 'slowdown', label: 'Slowdown (stickier near target)' },
      { v: 'pull', label: 'Pull (gentle aim toward target)' },
    ];
    for (const opt of options) {
      const o = document.createElement('option');
      o.value = opt.v;
      o.textContent = opt.label;
      if (opt.v === value) o.selected = true;
      select.appendChild(o);
    }
    select.addEventListener('change', () => {
      GameSettings.set({ aimAssistMode: select.value as 'off' | 'slowdown' | 'pull' });
    });
    row.appendChild(lab);
    row.appendChild(select);
    return row;
  }

  private createCheckbox(
    label: string,
    checked: boolean,
    onChange: (v: boolean) => void,
  ): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = `display: flex; align-items: center; gap: 12px; margin-bottom: 12px; min-width: 260px;`;
    const lab = document.createElement('label');
    lab.textContent = label;
    lab.style.cssText = `width: 140px; font-size: 12px; letter-spacing: 1px;`;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.style.cssText = `cursor: pointer; width: 18px; height: 18px; accent-color: #d4af37;`;
    input.addEventListener('change', () => onChange(input.checked));
    row.appendChild(lab);
    row.appendChild(input);
    return row;
  }

  private createSlider(
    label: string,
    value: number,
    min: number,
    max: number,
    suffix: string,
    onChange: (v: number) => void,
    formatDisplay?: (v: number) => string,
  ): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = `display: flex; align-items: center; gap: 12px; margin-bottom: 12px; min-width: 260px;`;
    const lab = document.createElement('label');
    lab.textContent = label;
    lab.style.cssText = `width: 90px; font-size: 12px; letter-spacing: 1px;`;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
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
    const valSpan = document.createElement('span');
    valSpan.style.cssText = `width: 42px; font-size: 11px; color: rgba(255,255,255,0.7); text-align: right;`;
    const fmt = formatDisplay ?? ((v: number) => `${v}${suffix}`);
    valSpan.textContent = fmt(value);
    input.addEventListener('input', () => {
      const v = parseInt(input.value, 10);
      valSpan.textContent = fmt(v);
      onChange(v);
    });
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
      margin-top: 8px;
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
    applyVolume();
  }

  hide(): void {
    this._isOpen = false;
    this.overlay.style.display = 'none';
  }

  dispose(): void {
    this.overlay.remove();
  }
}
