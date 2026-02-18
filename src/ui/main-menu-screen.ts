/**
 * Main menu with tabbed layout: Quick Play, Missions, Multiplayer.
 * Fallout/Westworld tactical style.
 */
import type { MultiplayerMapId } from '../levels/multiplayer-arena';
import { MULTIPLAYER_MAPS } from '../levels/multiplayer-arena';

export type MainMenuTab = 'quickplay' | 'missions' | 'multiplayer';

export interface QuickPlayLevel {
  id: string;
  name: string;
  description: string;
}

export interface MissionLevel {
  id: string;
  name: string;
  description: string;
}

export interface MainMenuCallbacks {
  onQuickPlayLevel: (levelId: string) => void;
  onMissionLevel: (levelId: string) => void;
  onMultiplayerJoin: (username: string, mapId: MultiplayerMapId) => void;
  onCustomModels: () => void;
  onSettings: () => void;
}

const QUICK_PLAY_LEVELS: QuickPlayLevel[] = [
  { id: 'arena', name: 'Arena', description: 'Procedural test room' },
  { id: 'custom', name: 'Custom Arena', description: 'GLB + HDRI outdoor map' },
  { id: 'lab', name: 'Experimental Lab', description: 'Glass tanks and glowing fluids' },
];

const MISSION_LEVELS: MissionLevel[] = [
  { id: 'facility', name: 'Facility', description: 'Multi-room infiltration' },
  { id: 'mountain', name: 'Mountain Outpost', description: 'Outdoor snowy base' },
];

const TAB_BUTTON_STYLE = `
  padding: 10px 24px;
  font-size: 14px;
  font-family: 'Courier New', monospace;
  letter-spacing: 3px;
  background: transparent;
  color: #8b7355;
  border: 2px solid #5a4a3a;
  cursor: pointer;
  transition: background 0.2s, color 0.2s, border-color 0.2s;
`;

const TAB_ACTIVE_STYLE = `
  background: rgba(212, 175, 55, 0.15);
  color: #d4af37;
  border-color: #d4af37;
`;

const CARD_STYLE = `
  padding: 16px 24px;
  min-width: 200px;
  font-family: 'Courier New', monospace;
  background: rgba(0, 0, 0, 0.5);
  color: #8b7355;
  border: 2px solid #5a4a3a;
  cursor: pointer;
  transition: background 0.2s, color 0.2s, border-color 0.2s;
  text-align: left;
`;

export class MainMenuScreen {
  private container: HTMLDivElement;
  private tabButtons: HTMLButtonElement[] = [];
  private contentArea: HTMLDivElement;
  private selectedTab: MainMenuTab = 'quickplay';
  private callbacks: MainMenuCallbacks | null = null;

  // Multiplayer tab elements
  private mapButtons: HTMLButtonElement[] = [];
  private selectedMapId: MultiplayerMapId = 'crossfire';
  private usernameInput: HTMLInputElement;
  private joinBtn: HTMLButtonElement;
  private statusEl: HTMLDivElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'main-menu-screen';
    this.container.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
      max-width: 700px;
    `;

    // Tab row
    const tabRow = document.createElement('div');
    tabRow.style.cssText = 'display: flex; gap: 8px; margin-top: 20px; flex-wrap: wrap; justify-content: center;';

    const tabs: { id: MainMenuTab; label: string }[] = [
      { id: 'quickplay', label: 'QUICK PLAY' },
      { id: 'missions', label: 'MISSIONS' },
      { id: 'multiplayer', label: 'MULTIPLAYER' },
    ];

    for (const tab of tabs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.tab = tab.id;
      btn.textContent = tab.label;
      btn.style.cssText = TAB_BUTTON_STYLE;
      btn.addEventListener('click', () => this.setTab(tab.id));
      tabRow.appendChild(btn);
      this.tabButtons.push(btn);
    }

    this.container.appendChild(tabRow);

    // Content area
    this.contentArea = document.createElement('div');
    this.contentArea.style.cssText = 'margin-top: 28px; width: 100%; min-height: 180px;';
    this.container.appendChild(this.contentArea);

    // Footer: Custom Models, Settings
    const footer = document.createElement('div');
    footer.style.cssText = 'display: flex; gap: 16px; margin-top: 24px;';

    const modelsBtn = document.createElement('button');
    modelsBtn.type = 'button';
    modelsBtn.textContent = 'CUSTOM MODELS';
    modelsBtn.style.cssText = TAB_BUTTON_STYLE;
    modelsBtn.addEventListener('click', () => this.callbacks?.onCustomModels());
    footer.appendChild(modelsBtn);

    const settingsBtn = document.createElement('button');
    settingsBtn.type = 'button';
    settingsBtn.textContent = 'SETTINGS';
    settingsBtn.style.cssText = TAB_BUTTON_STYLE;
    settingsBtn.addEventListener('click', () => this.callbacks?.onSettings());
    footer.appendChild(settingsBtn);

    this.container.appendChild(footer);

    // Multiplayer-specific elements (created once, shown when tab is multiplayer)
    this.usernameInput = document.createElement('input');
    this.usernameInput.type = 'text';
    this.usernameInput.placeholder = 'Enter callsign...';
    this.usernameInput.maxLength = 20;
    this.usernameInput.value = localStorage.getItem('007remix_username') || 'Agent';
    this.usernameInput.style.cssText = `
      width: 280px;
      padding: 12px 16px;
      font-size: 16px;
      font-family: 'Courier New', monospace;
      background: rgba(0, 0, 0, 0.5);
      border: 2px solid #5a4a3a;
      color: #c4b896;
    `;
    this.usernameInput.addEventListener('input', () => {
      localStorage.setItem('007remix_username', this.usernameInput.value);
    });

    this.joinBtn = document.createElement('button');
    this.joinBtn.type = 'button';
    this.joinBtn.textContent = 'JOIN GAME';
    this.joinBtn.style.cssText = `
      padding: 14px 32px;
      font-size: 16px;
      font-family: 'Courier New', monospace;
      letter-spacing: 3px;
      background: transparent;
      color: #d4af37;
      border: 2px solid #d4af37;
      cursor: pointer;
      transition: background 0.2s, color 0.2s;
    `;
    this.joinBtn.addEventListener('mouseenter', () => {
      this.joinBtn.style.background = '#d4af37';
      this.joinBtn.style.color = '#000';
    });
    this.joinBtn.addEventListener('mouseleave', () => {
      this.joinBtn.style.background = 'transparent';
      this.joinBtn.style.color = '#d4af37';
    });
    this.joinBtn.addEventListener('click', () => this.handleMultiplayerJoin());

    this.statusEl = document.createElement('div');
    this.statusEl.style.cssText = 'font-size: 14px; color: #8b7355; min-height: 20px; margin-top: 8px;';

    this.updateTabStyles();
    this.renderContent();
  }

  setCallbacks(cb: MainMenuCallbacks): void {
    this.callbacks = cb;
  }

  setTab(tab: MainMenuTab): void {
    this.selectedTab = tab;
    this.updateTabStyles();
    this.renderContent();
  }

  setStatus(msg: string): void {
    this.statusEl.textContent = msg;
  }

  setJoinEnabled(enabled: boolean): void {
    this.joinBtn.disabled = !enabled;
  }

  private updateTabStyles(): void {
    for (const btn of this.tabButtons) {
      const tab = btn.dataset.tab as MainMenuTab;
      const active = this.selectedTab === tab;
      btn.style.cssText = TAB_BUTTON_STYLE + (active ? TAB_ACTIVE_STYLE : '');
    }
  }

  private renderContent(): void {
    this.contentArea.innerHTML = '';

    if (this.selectedTab === 'quickplay') {
      this.renderQuickPlayContent();
    } else if (this.selectedTab === 'missions') {
      this.renderMissionsContent();
    } else {
      this.renderMultiplayerContent();
    }
  }

  private renderQuickPlayContent(): void {
    const title = document.createElement('p');
    title.style.cssText = 'font-size: 12px; color: #6a5a4a; margin-bottom: 16px; letter-spacing: 2px;';
    title.textContent = 'SELECT LEVEL';
    this.contentArea.appendChild(title);

    const grid = document.createElement('div');
    grid.style.cssText = 'display: flex; flex-wrap: wrap; gap: 12px; justify-content: center;';

    for (const level of QUICK_PLAY_LEVELS) {
      const card = document.createElement('button');
      card.type = 'button';
      card.dataset.levelId = level.id;
      card.style.cssText = CARD_STYLE;
      card.innerHTML = `<strong style="color:#d4af37;">${level.name}</strong><br><span style="font-size:11px;">${level.description}</span>`;
      card.addEventListener('click', () => this.callbacks?.onQuickPlayLevel(level.id));
      card.addEventListener('mouseenter', () => {
        card.style.borderColor = '#d4af37';
        card.style.color = '#d4af37';
      });
      card.addEventListener('mouseleave', () => {
        card.style.borderColor = '#5a4a3a';
        card.style.color = '#8b7355';
      });
      grid.appendChild(card);
    }

    this.contentArea.appendChild(grid);
  }

  private renderMissionsContent(): void {
    const title = document.createElement('p');
    title.style.cssText = 'font-size: 12px; color: #6a5a4a; margin-bottom: 16px; letter-spacing: 2px;';
    title.textContent = 'SELECT MISSION';
    this.contentArea.appendChild(title);

    const grid = document.createElement('div');
    grid.style.cssText = 'display: flex; flex-wrap: wrap; gap: 12px; justify-content: center;';

    for (const level of MISSION_LEVELS) {
      const card = document.createElement('button');
      card.type = 'button';
      card.dataset.levelId = level.id;
      card.style.cssText = CARD_STYLE;
      card.innerHTML = `<strong style="color:#d4af37;">${level.name}</strong><br><span style="font-size:11px;">${level.description}</span>`;
      card.addEventListener('click', () => this.callbacks?.onMissionLevel(level.id));
      card.addEventListener('mouseenter', () => {
        card.style.borderColor = '#d4af37';
        card.style.color = '#d4af37';
      });
      card.addEventListener('mouseleave', () => {
        card.style.borderColor = '#5a4a3a';
        card.style.color = '#8b7355';
      });
      grid.appendChild(card);
    }

    this.contentArea.appendChild(grid);
  }

  private renderMultiplayerContent(): void {
    const subtitle = document.createElement('p');
    subtitle.style.cssText = 'font-size: 14px; color: #6a5a4a; margin-bottom: 16px;';
    subtitle.textContent = 'Deathmatch · First to 25 kills wins';
    this.contentArea.appendChild(subtitle);

    const mapLabel = document.createElement('label');
    mapLabel.style.cssText = 'font-size: 12px; color: #8b7355; margin-bottom: 8px; display: block;';
    mapLabel.textContent = 'MAP';
    this.contentArea.appendChild(mapLabel);

    const mapSelector = document.createElement('div');
    mapSelector.style.cssText = 'display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap;';
    this.mapButtons = [];

    for (const map of MULTIPLAYER_MAPS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.mapId = map.id;
      btn.style.cssText = `
        padding: 12px 20px;
        font-size: 14px;
        font-family: 'Courier New', monospace;
        letter-spacing: 2px;
        background: rgba(0, 0, 0, 0.5);
        color: #8b7355;
        border: 2px solid #5a4a3a;
        cursor: pointer;
        transition: background 0.2s, color 0.2s, border-color 0.2s;
        text-align: left;
        min-width: 140px;
      `;
      btn.innerHTML = `<strong>${map.name}</strong><br><span style="font-size:11px;color:#6a5a4a;">${map.description}</span>`;
      btn.addEventListener('click', () => this.selectMap(map.id));
      mapSelector.appendChild(btn);
      this.mapButtons.push(btn);
    }
    this.contentArea.appendChild(mapSelector);
    this.updateMapSelectionUI();

    const userLabel = document.createElement('label');
    userLabel.style.cssText = 'font-size: 12px; color: #8b7355; margin-bottom: 6px; display: block;';
    userLabel.textContent = 'USERNAME';
    this.contentArea.appendChild(userLabel);

    const inputWrap = document.createElement('div');
    inputWrap.style.cssText = 'margin-bottom: 16px;';
    inputWrap.appendChild(this.usernameInput);
    this.contentArea.appendChild(inputWrap);

    this.joinBtn.disabled = false;
    this.contentArea.appendChild(this.joinBtn);

    this.contentArea.appendChild(this.statusEl);
  }

  private selectMap(mapId: MultiplayerMapId): void {
    this.selectedMapId = mapId;
    this.updateMapSelectionUI();
  }

  private updateMapSelectionUI(): void {
    for (const btn of this.mapButtons) {
      const mapId = btn.dataset.mapId as MultiplayerMapId;
      const selected = this.selectedMapId === mapId;
      btn.style.background = selected ? 'rgba(212, 175, 55, 0.15)' : 'rgba(0, 0, 0, 0.5)';
      btn.style.color = selected ? '#d4af37' : '#8b7355';
      btn.style.borderColor = selected ? '#d4af37' : '#5a4a3a';
    }
  }

  private handleMultiplayerJoin(): void {
    const username = this.usernameInput.value.trim() || 'Agent';
    if (username.length < 2) {
      this.setStatus('Username must be at least 2 characters');
      return;
    }
    this.setStatus('Connecting...');
    this.joinBtn.disabled = true;
    this.callbacks?.onMultiplayerJoin(username, this.selectedMapId);
  }

  attach(parent: HTMLElement): void {
    parent.appendChild(this.container);
  }

  detach(): void {
    this.container.remove();
  }

  getElement(): HTMLElement {
    return this.container;
  }
}
