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
  { type: 'weapon-minigun', label: 'Minigun', defaultAmount: 0 },
  { type: 'ammo-minigun', label: 'Ammo·MG', defaultAmount: 200 },
  { type: 'weapon-rpg', label: 'RPG-7', defaultAmount: 0 },
  { type: 'ammo-rpg', label: 'Ammo·RPG', defaultAmount: 1 },
  { type: 'weapon-grenade-launcher', label: 'Grenade·GL', defaultAmount: 0 },
  { type: 'ammo-grenade-launcher', label: 'Ammo·GL', defaultAmount: 6 },
];

const PROP_TYPES: EditorPropDef[] = [
  { type: 'crate', label: 'Wood Crate' },
  { type: 'crate_metal', label: 'Metal Crate' },
  { type: 'barrel', label: 'Barrel' },
  { type: 'tank', label: 'Tank', customOnly: true },
  { type: 'tube', label: 'Tube', customOnly: true },
];

export function getEditorPickupDefs(): readonly EditorPickupDef[] {
  return PICKUP_TYPES;
}

export function getEditorPropDefs(mapId: MultiplayerMapId): EditorPropDef[] {
  return PROP_TYPES.filter((p) => !p.customOnly || mapId === 'custom');
}

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
  private thumbnailUrls = new Map<string, string>();

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

  setThumbnail(category: EditorItemCategory, type: string, dataUrl: string): void {
    this.thumbnailUrls.set(this.getThumbnailKey(category, type), dataUrl);
    // Update visible hotbar slot thumbnail immediately (no full rebuild)
    for (const slot of this.hotbarSlots) {
      if (slot.dataset.category !== category || slot.dataset.type !== type) continue;
      const thumbWrap = slot.querySelector('.map-editor-hotbar-thumb') as HTMLDivElement | null;
      if (!thumbWrap) continue;
      thumbWrap.innerHTML = '';
      thumbWrap.appendChild(this.createHotbarThumbnailElement(category, type));
    }
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
    return getEditorPropDefs(this.mapId);
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
        width: 64px; height: 64px;
        display: flex; flex-direction: column;
        align-items: center; justify-content: flex-start;
        gap: 2px;
        background: rgba(0,0,0,0.65);
        border: 2px solid ${isActive ? '#d4af37' : '#3a2a1a'};
        box-sizing: border-box;
        padding: 4px 4px 3px;
        transition: border-color 0.1s, box-shadow 0.1s;
        box-shadow: ${isActive ? '0 0 12px rgba(212,175,55,0.25)' : 'none'};
      `;
      slot.dataset.category = this._currentMode;
      slot.dataset.type = item.type;

      // Index number (top-left style)
      const num = document.createElement('div');
      num.style.cssText = 'font-size:8px; color:#5a4a3a; font-family: "Courier New", monospace; align-self:flex-start; height:9px;';
      num.textContent = String(i + 1);

      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'map-editor-hotbar-thumb';
      thumbWrap.style.cssText = 'width:44px; height:24px;';
      thumbWrap.appendChild(this.createHotbarThumbnailElement(this._currentMode, item.type));

      // Item label
      const lbl = document.createElement('div');
      lbl.className = 'map-editor-hotbar-label';
      lbl.style.cssText = `
        font-size: 8px; font-family: 'Courier New', monospace;
        color: ${isActive ? '#d4af37' : '#8b7355'};
        text-align: center; line-height: 1.2;
        word-break: break-word;
        max-width: 56px;
      `;
      lbl.textContent = item.label;

      slot.appendChild(num);
      slot.appendChild(thumbWrap);
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
      slot.style.boxShadow = active ? '0 0 12px rgba(212,175,55,0.25)' : 'none';
      const lbl = slot.querySelector('.map-editor-hotbar-label') as HTMLDivElement | null;
      if (lbl) lbl.style.color = active ? '#d4af37' : '#8b7355';
    }
  }

  private createHotbarThumbnail(category: EditorItemCategory, type: string): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 44;
    canvas.height = 24;
    canvas.style.cssText = `
      width: 44px;
      height: 24px;
      border: 1px solid rgba(90,74,58,0.55);
      background: rgba(10,10,10,0.55);
      image-rendering: pixelated;
    `;

    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    this.drawThumbnailBackdrop(ctx, canvas.width, canvas.height);
    if (category === 'pickup') {
      this.drawPickupThumbnail(ctx, type, canvas.width, canvas.height);
    } else {
      this.drawPropThumbnail(ctx, type, canvas.width, canvas.height);
    }
    return canvas;
  }

  private createHotbarThumbnailElement(category: EditorItemCategory, type: string): HTMLElement {
    const dataUrl = this.thumbnailUrls.get(this.getThumbnailKey(category, type));
    if (!dataUrl) return this.createHotbarThumbnail(category, type);

    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = `${category} ${type}`;
    img.decoding = 'async';
    img.loading = 'eager';
    img.style.cssText = `
      width: 44px;
      height: 24px;
      border: 1px solid rgba(90,74,58,0.55);
      background: rgba(10,10,10,0.55);
      image-rendering: pixelated;
      object-fit: cover;
      display: block;
    `;
    return img;
  }

  private getThumbnailKey(category: EditorItemCategory, type: string): string {
    return `${category}:${type}`;
  }

  private drawThumbnailBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#17120d');
    g.addColorStop(1, '#0a0907');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(212,175,55,0.2)';
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  }

  private drawPickupThumbnail(ctx: CanvasRenderingContext2D, type: string, w: number, h: number): void {
    if (type === 'health') {
      ctx.fillStyle = '#b01f1f';
      ctx.fillRect(15, 5, 14, 14);
      ctx.fillStyle = '#f7d0d0';
      ctx.fillRect(20, 7, 4, 10);
      ctx.fillRect(17, 10, 10, 4);
      return;
    }

    if (type === 'armor') {
      ctx.fillStyle = '#3f79c7';
      ctx.beginPath();
      ctx.moveTo(22, 4);
      ctx.lineTo(31, 8);
      ctx.lineTo(28, 18);
      ctx.lineTo(22, 21);
      ctx.lineTo(16, 18);
      ctx.lineTo(13, 8);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#b8d5ff';
      ctx.stroke();
      return;
    }

    if (type.startsWith('weapon-')) {
      this.drawWeaponSilhouette(ctx, type, w, h);
      return;
    }

    if (type.startsWith('ammo-')) {
      this.drawAmmoSilhouette(ctx, type);
      return;
    }

    ctx.fillStyle = '#999';
    ctx.fillRect(16, 8, 12, 8);
  }

  private drawWeaponSilhouette(ctx: CanvasRenderingContext2D, type: string, w: number, h: number): void {
    const y = Math.floor(h * 0.58);
    let body = '#7c8b9e';
    if (type === 'weapon-rpg') body = '#6f8d60';
    if (type === 'weapon-sniper') body = '#8893a7';
    if (type === 'weapon-minigun') body = '#8d7f62';

    ctx.fillStyle = body;

    if (type === 'weapon-rpg') {
      ctx.fillRect(9, y - 3, 26, 6);
      ctx.fillRect(34, y - 2, 4, 4);
      return;
    }

    if (type === 'weapon-minigun') {
      ctx.fillRect(11, y - 4, 18, 8);
      ctx.fillRect(28, y - 3, 9, 2);
      ctx.fillRect(28, y - 1, 9, 2);
      ctx.fillRect(28, y + 1, 9, 2);
      ctx.fillStyle = '#5d4f38';
      ctx.fillRect(16, y + 2, 4, 6);
      return;
    }

    if (type === 'weapon-shotgun' || type === 'weapon-sniper') {
      const barrelLen = type === 'weapon-sniper' ? 18 : 14;
      ctx.fillRect(10, y - 3, 12 + barrelLen, 5);
      if (type === 'weapon-sniper') {
        ctx.fillStyle = '#4f5968';
        ctx.fillRect(14, y - 6, 9, 2);
      }
      ctx.fillStyle = '#5f4f3a';
      ctx.fillRect(10, y + 2, 7, 4);
      return;
    }

    // Rifle + grenade launcher fallback
    ctx.fillRect(10, y - 3, 22, 5);
    if (type === 'weapon-grenade-launcher') {
      ctx.fillStyle = '#7a8a4a';
      ctx.fillRect(15, y + 2, 12, 3);
    }
    ctx.fillStyle = '#5f4f3a';
    ctx.fillRect(11, y + 2, 6, 4);
  }

  private drawAmmoSilhouette(ctx: CanvasRenderingContext2D, type: string): void {
    let count = 3;
    let color = '#c8b15a';
    if (type === 'ammo-shotgun') {
      count = 2;
      color = '#c63f3f';
    } else if (type === 'ammo-sniper') {
      count = 1;
      color = '#b7d0df';
    } else if (type === 'ammo-minigun') {
      count = 4;
      color = '#d0a858';
    } else if (type === 'ammo-rpg' || type === 'ammo-grenade-launcher') {
      count = 1;
      color = '#7f9b62';
    }

    const spacing = 6;
    const start = 22 - Math.floor((count - 1) * spacing * 0.5);
    for (let i = 0; i < count; i++) {
      const x = start + i * spacing;
      ctx.fillStyle = color;
      ctx.fillRect(x, 7, 3, 11);
      ctx.fillStyle = '#f2e7bf';
      ctx.fillRect(x, 6, 3, 2);
      ctx.fillStyle = '#6a5532';
      ctx.fillRect(x, 17, 3, 1);
    }
  }

  private drawPropThumbnail(ctx: CanvasRenderingContext2D, type: string, w: number, h: number): void {
    if (type === 'barrel') {
      ctx.fillStyle = '#67717c';
      ctx.fillRect(16, 6, 12, 13);
      ctx.fillStyle = '#8e98a4';
      ctx.fillRect(16, 6, 12, 2);
      ctx.fillRect(16, 17, 12, 2);
      return;
    }

    if (type === 'tank' || type === 'tube') {
      const color = type === 'tank' ? '#5f87aa' : '#5fa57f';
      ctx.fillStyle = color;
      ctx.fillRect(17, 4, 10, 16);
      ctx.fillStyle = 'rgba(230,255,245,0.45)';
      ctx.fillRect(20, 6, 3, 12);
      return;
    }

    // Crates
    const wood = type === 'crate';
    ctx.fillStyle = wood ? '#89643f' : '#6d7885';
    ctx.fillRect(13, 5, 18, 14);
    ctx.strokeStyle = wood ? '#60452b' : '#4e5863';
    ctx.strokeRect(13.5, 5.5, 17, 13);
    ctx.beginPath();
    ctx.moveTo(13, h - 5);
    ctx.lineTo(22, 5);
    ctx.lineTo(31, h - 5);
    ctx.stroke();
  }
}
