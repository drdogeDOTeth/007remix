/**
 * Map editor UI — compact toolbar panel + Minecraft-style hotbar.
 * Tab key (handled by game.ts) switches between PICKUPS / PROPS mode.
 * Scroll wheel (handled by game.ts) cycles hotbar selection.
 */
import type { MultiplayerMapId } from '../levels/multiplayer-arena';

export type EditorItemCategory = 'pickup' | 'prop';

export interface EditorPickupDef {
  type: string;
  label: string;
  defaultAmount: number;
}

export interface EditorPropDef {
  type: string;
  label: string;
  /** For Custom Arena only */
  customOnly?: boolean;
}

const PICKUP_TYPES: EditorPickupDef[] = [
  { type: 'health', label: 'Health', defaultAmount: 25 },
  { type: 'armor', label: 'Armor', defaultAmount: 50 },
  { type: 'ammo-pistol', label: 'Ammo·P', defaultAmount: 24 },
  { type: 'ammo-rifle', label: 'Ammo·R', defaultAmount: 30 },
  { type: 'ammo-shotgun', label: 'Ammo·SG', defaultAmount: 12 },
  { type: 'ammo-sniper', label: 'Ammo·SN', defaultAmount: 8 },
  { type: 'weapon-rifle', label: 'Rifle', defaultAmount: 0 },
  { type: 'weapon-shotgun', label: 'Shotgun', defaultAmount: 0 },
  { type: 'weapon-sniper', label: 'Sniper', defaultAmount: 0 },
];

const PROP_TYPES: EditorPropDef[] = [
  { type: 'crate', label: 'Wood Crate' },
  { type: 'crate_metal', label: 'Metal Crate' },
  { type: 'barrel', label: 'Barrel' },
  { type: 'tank', label: 'Tank', customOnly: true },
  { type: 'tube', label: 'Tube', customOnly: true },
];

export interface MapEditorUICallbacks {
  onSave: () => void;
  onExit: () => void;
  onItemSelected: (category: EditorItemCategory, type: string, amount?: number) => void;
  onDeleteSelected: () => void;
}

export class MapEditorUI {
  private container: HTMLDivElement;
  private panel: HTMLDivElement;
  private hotbarEl: HTMLDivElement;
  private callbacks: MapEditorUICallbacks | null = null;
  private mapId: MultiplayerMapId = 'custom';

  private _currentMode: EditorItemCategory = 'pickup';
  private _currentIndex = 0;
  private _selectedAmount = 25;

  private statusEl: HTMLDivElement;
  private modeLabel: HTMLSpanElement;
  private itemNameEl: HTMLDivElement;
  private amountWrap: HTMLDivElement;
  private amountInput: HTMLInputElement;

  // Hotbar slot elements, rebuilt on mode switch
  private hotbarSlots: HTMLDivElement[] = [];

  get currentMode(): EditorItemCategory { return this._currentMode; }
  get currentIndex(): number { return this._currentIndex; }

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'map-editor-ui';
    this.container.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      pointer-events: none;
      z-index: 1000;
    `;

    // ── Compact top-left panel ──────────────────────────────────────
    this.panel = document.createElement('div');
    this.panel.style.cssText = `
      position: absolute;
      top: 68px; left: 12px;
      width: 200px;
      pointer-events: auto;
      padding: 12px 14px 10px;
      font-family: 'Courier New', monospace;
      background: rgba(0,0,0,0.78);
      color: #8b7355;
      border: 1px solid #5a4a3a;
      box-sizing: border-box;
    `;

    // Title row
    const titleRow = document.createElement('div');
    titleRow.style.cssText = 'display:flex; align-items:baseline; justify-content:space-between; margin-bottom:10px;';
    const title = document.createElement('span');
    title.style.cssText = 'font-size:13px; color:#d4af37; letter-spacing:2px;';
    title.textContent = 'MAP EDITOR';
    const mapNameEl = document.createElement('span');
    mapNameEl.id = 'map-editor-map-name';
    mapNameEl.style.cssText = 'font-size:10px; color:#6a5a4a;';
    mapNameEl.textContent = 'Custom Arena';
    titleRow.appendChild(title);
    titleRow.appendChild(mapNameEl);
    this.panel.appendChild(titleRow);

    // Mode row
    const modeRow = document.createElement('div');
    modeRow.style.cssText = 'display:flex; align-items:center; gap:6px; margin-bottom:6px;';
    const modeLabelStatic = document.createElement('span');
    modeLabelStatic.style.cssText = 'font-size:10px; color:#6a5a4a;';
    modeLabelStatic.textContent = 'MODE:';
    this.modeLabel = document.createElement('span');
    this.modeLabel.style.cssText = 'font-size:11px; color:#c4b896; letter-spacing:1px;';
    this.modeLabel.textContent = 'PICKUPS';
    const tabHint = document.createElement('span');
    tabHint.style.cssText = 'font-size:9px; color:#5a4a3a; margin-left:auto;';
    tabHint.textContent = '[TAB]';
    modeRow.appendChild(modeLabelStatic);
    modeRow.appendChild(this.modeLabel);
    modeRow.appendChild(tabHint);
    this.panel.appendChild(modeRow);

    // Item name
    this.itemNameEl = document.createElement('div');
    this.itemNameEl.style.cssText = 'font-size:12px; color:#d4af37; margin-bottom:6px; letter-spacing:1px; min-height:16px;';
    this.itemNameEl.textContent = 'Health';
    this.panel.appendChild(this.itemNameEl);

    // Amount row (pickups only)
    this.amountWrap = document.createElement('div');
    this.amountWrap.style.cssText = 'display:flex; align-items:center; gap:6px; margin-bottom:8px;';
    const amtLabel = document.createElement('span');
    amtLabel.style.cssText = 'font-size:10px; color:#6a5a4a;';
    amtLabel.textContent = 'AMOUNT:';
    this.amountInput = document.createElement('input');
    this.amountInput.type = 'number';
    this.amountInput.min = '0';
    this.amountInput.max = '999';
    this.amountInput.value = '25';
    this.amountInput.style.cssText = `
      width: 52px; padding: 2px 4px;
      background: rgba(0,0,0,0.5);
      border: 1px solid #5a4a3a;
      color: #c4b896;
      font-family: 'Courier New', monospace;
      font-size: 11px;
    `;
    this.amountInput.addEventListener('change', () => {
      const v = parseInt(this.amountInput.value, 10);
      if (!isNaN(v) && v >= 0) {
        this._selectedAmount = v;
        this.callbacks?.onItemSelected('pickup', this.currentItem.type, this._selectedAmount);
      }
    });
    this.amountWrap.appendChild(amtLabel);
    this.amountWrap.appendChild(this.amountInput);
    this.panel.appendChild(this.amountWrap);

    // Divider
    const divider = document.createElement('div');
    divider.style.cssText = 'border-top:1px solid #3a2a1a; margin-bottom:8px;';
    this.panel.appendChild(divider);

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex; gap:6px; margin-bottom:8px;';

    const btnStyle = `
      flex: 1; padding: 5px 0;
      font-size: 11px; font-family: 'Courier New', monospace; letter-spacing: 1px;
      background: transparent; color: #8b7355;
      border: 1px solid #5a4a3a; cursor: pointer;
      transition: color 0.15s, border-color 0.15s;
    `;
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button'; saveBtn.textContent = 'SAVE';
    saveBtn.style.cssText = btnStyle;
    saveBtn.addEventListener('click', () => this.callbacks?.onSave());
    saveBtn.addEventListener('mouseenter', () => { saveBtn.style.color = '#d4af37'; saveBtn.style.borderColor = '#d4af37'; });
    saveBtn.addEventListener('mouseleave', () => { saveBtn.style.color = '#8b7355'; saveBtn.style.borderColor = '#5a4a3a'; });

    const exitBtn = document.createElement('button');
    exitBtn.type = 'button'; exitBtn.textContent = 'EXIT';
    exitBtn.style.cssText = btnStyle;
    exitBtn.addEventListener('click', () => this.callbacks?.onExit());
    exitBtn.addEventListener('mouseenter', () => { exitBtn.style.color = '#d4af37'; exitBtn.style.borderColor = '#d4af37'; });
    exitBtn.addEventListener('mouseleave', () => { exitBtn.style.color = '#8b7355'; exitBtn.style.borderColor = '#5a4a3a'; });

    toolbar.appendChild(saveBtn);
    toolbar.appendChild(exitBtn);
    this.panel.appendChild(toolbar);

    // Controls hint
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:9px; color:#4a3a2a; line-height:1.5;';
    hint.innerHTML = 'SCROLL cycle &nbsp;·&nbsp; TAB mode<br>CLICK place &nbsp;·&nbsp; DEL remove';
    this.panel.appendChild(hint);

    // Status
    this.statusEl = document.createElement('div');
    this.statusEl.style.cssText = 'font-size:10px; color:#8b7355; margin-top:6px; min-height:14px;';
    this.panel.appendChild(this.statusEl);

    this.container.appendChild(this.panel);

    // ── Bottom hotbar ───────────────────────────────────────────────
    this.hotbarEl = document.createElement('div');
    this.hotbarEl.id = 'map-editor-hotbar';
    this.hotbarEl.style.cssText = `
      position: absolute;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 4px;
      pointer-events: none;
    `;
    this.container.appendChild(this.hotbarEl);

    this.rebuildHotbar();
    this.syncPanel();
  }

  // ── Public API ──────────────────────────────────────────────────────

  setMapId(mapId: MultiplayerMapId): void {
    this.mapId = mapId;
    const names: Record<MultiplayerMapId, string> = {
      custom: 'Custom Arena',
      crossfire: 'Crossfire Complex',
      wasteland: 'Verdigris Depot',
    };
    const el = document.getElementById('map-editor-map-name');
    if (el) el.textContent = names[mapId];
    // If current item is customOnly and map changed, reset
    const items = this.currentItems();
    if (this._currentIndex >= items.length) this._currentIndex = 0;
    this.rebuildHotbar();
    this.syncPanel();
  }

  setCallbacks(cb: MapEditorUICallbacks | null): void {
    this.callbacks = cb;
  }

  setStatus(msg: string): void {
    this.statusEl.textContent = msg;
    // Auto-clear after 3s
    clearTimeout(this._statusTimer);
    if (msg) {
      this._statusTimer = window.setTimeout(() => { this.statusEl.textContent = ''; }, 3000);
    }
  }
  private _statusTimer = 0;

  /** Returns items for the current mode, filtered by map. */
  getItems(): Array<{ type: string; label: string; amount?: number }> {
    return this.currentItems().map((it) => ({
      type: it.type,
      label: (it as EditorPickupDef).defaultAmount !== undefined
        ? (it as EditorPickupDef).label
        : (it as EditorPropDef).label,
      amount: (it as EditorPickupDef).defaultAmount,
    }));
  }

  /** Switch mode between pickups / props. Resets index to 0. */
  setMode(cat: EditorItemCategory): void {
    this._currentMode = cat;
    this._currentIndex = 0;
    this.modeLabel.textContent = cat === 'pickup' ? 'PICKUPS' : 'PROPS';
    this.rebuildHotbar();
    this.syncPanel();
    const sel = this.getSelectedItem();
    this.callbacks?.onItemSelected(sel.category, sel.type, sel.amount);
  }

  /** Select item by index in current mode's list. */
  selectIndex(idx: number): void {
    const items = this.currentItems();
    if (items.length === 0) return;
    this._currentIndex = ((idx % items.length) + items.length) % items.length;
    this.syncPanel();
    this.updateHotbarHighlight();
    const sel = this.getSelectedItem();
    this.callbacks?.onItemSelected(sel.category, sel.type, sel.amount);
  }

  getSelectedItem(): { category: EditorItemCategory; type: string; amount?: number } {
    const items = this.currentItems();
    if (items.length === 0) return { category: this._currentMode, type: '' };
    const item = items[this._currentIndex];
    const isPickup = this._currentMode === 'pickup';
    const amount = isPickup ? this._selectedAmount : undefined;
    return { category: this._currentMode, type: item.type, amount };
  }

  getElement(): HTMLElement {
    return this.container;
  }

  attach(parent: HTMLElement): void {
    parent.appendChild(this.container);
  }

  detach(): void {
    this.container.remove();
  }

  // ── Private helpers ────────────────────────────────────────────────

  private get currentItem(): { type: string; label: string } {
    const items = this.currentItems();
    return items[this._currentIndex] ?? { type: '', label: '' };
  }

  private currentItems(): Array<EditorPickupDef | EditorPropDef> {
    if (this._currentMode === 'pickup') return PICKUP_TYPES;
    return PROP_TYPES.filter((p) => !p.customOnly || this.mapId === 'custom');
  }

  private syncPanel(): void {
    const isPickup = this._currentMode === 'pickup';
    this.amountWrap.style.display = isPickup ? 'flex' : 'none';
    const items = this.currentItems();
    const item = items[this._currentIndex];
    if (item) {
      this.itemNameEl.textContent = item.label;
      if (isPickup) {
        // Always reset amount to the item's default when selection changes
        const def = item as EditorPickupDef;
        this._selectedAmount = def.defaultAmount;
        this.amountInput.value = String(def.defaultAmount);
      }
    }
  }

  private rebuildHotbar(): void {
    this.hotbarEl.innerHTML = '';
    this.hotbarSlots = [];
    const items = this.currentItems();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const slot = document.createElement('div');
      const isActive = i === this._currentIndex;
      slot.style.cssText = `
        width: 56px; height: 56px;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        gap: 3px;
        background: rgba(0,0,0,0.65);
        border: 2px solid ${isActive ? '#d4af37' : '#3a2a1a'};
        box-sizing: border-box;
        padding: 4px;
        transition: border-color 0.1s;
      `;

      // Index number (top-left style)
      const num = document.createElement('div');
      num.style.cssText = 'font-size:8px; color:#5a4a3a; font-family: "Courier New", monospace; align-self:flex-start;';
      num.textContent = String(i + 1);

      // Item label
      const lbl = document.createElement('div');
      lbl.style.cssText = `
        font-size: 8px; font-family: 'Courier New', monospace;
        color: ${isActive ? '#d4af37' : '#8b7355'};
        text-align: center; line-height: 1.2;
        word-break: break-word;
        max-width: 48px;
      `;
      lbl.textContent = item.label;

      slot.appendChild(num);
      slot.appendChild(lbl);
      this.hotbarEl.appendChild(slot);
      this.hotbarSlots.push(slot);
    }
  }

  private updateHotbarHighlight(): void {
    for (let i = 0; i < this.hotbarSlots.length; i++) {
      const active = i === this._currentIndex;
      const slot = this.hotbarSlots[i];
      slot.style.borderColor = active ? '#d4af37' : '#3a2a1a';
      const lbl = slot.querySelector('div:last-child') as HTMLDivElement | null;
      if (lbl) lbl.style.color = active ? '#d4af37' : '#8b7355';
    }
  }
}
