/**
 * Map editor UI — item palette, toolbar, placement controls.
 * Fallout/Westworld tactical style.
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
  { type: 'ammo-pistol', label: 'Ammo (Pistol)', defaultAmount: 24 },
  { type: 'ammo-rifle', label: 'Ammo (Rifle)', defaultAmount: 30 },
  { type: 'ammo-shotgun', label: 'Ammo (Shotgun)', defaultAmount: 12 },
  { type: 'ammo-sniper', label: 'Ammo (Sniper)', defaultAmount: 8 },
  { type: 'weapon-rifle', label: 'Rifle', defaultAmount: 0 },
  { type: 'weapon-shotgun', label: 'Shotgun', defaultAmount: 0 },
  { type: 'weapon-sniper', label: 'Sniper', defaultAmount: 0 },
];

const PROP_TYPES: EditorPropDef[] = [
  { type: 'crate', label: 'Crate (wood)' },
  { type: 'crate_metal', label: 'Crate (metal)' },
  { type: 'barrel', label: 'Barrel' },
  { type: 'tank', label: 'Tank', customOnly: true },
  { type: 'tube', label: 'Tube', customOnly: true },
];

const PANEL_STYLE = `
  padding: 12px 16px;
  font-family: 'Courier New', monospace;
  background: rgba(0, 0, 0, 0.75);
  color: #8b7355;
  border: 2px solid #5a4a3a;
  border-radius: 0;
`;

const BUTTON_STYLE = `
  padding: 8px 16px;
  font-size: 12px;
  font-family: 'Courier New', monospace;
  letter-spacing: 2px;
  background: transparent;
  color: #8b7355;
  border: 2px solid #5a4a3a;
  cursor: pointer;
  transition: background 0.2s, color 0.2s, border-color 0.2s;
`;

const BUTTON_ACTIVE_STYLE = `
  background: rgba(212, 175, 55, 0.2);
  color: #d4af37;
  border-color: #d4af37;
`;

export interface MapEditorUICallbacks {
  onSave: () => void;
  onExit: () => void;
  onItemSelected: (category: EditorItemCategory, type: string, amount?: number) => void;
  onDeleteSelected: () => void;
}

export class MapEditorUI {
  private container: HTMLDivElement;
  private callbacks: MapEditorUICallbacks | null = null;
  private mapId: MultiplayerMapId = 'custom';
  private selectedCategory: EditorItemCategory = 'pickup';
  private selectedType: string = 'health';
  private selectedAmount: number = 25;
  private amountInput: HTMLInputElement | null = null;
  private statusEl: HTMLDivElement;
  private pickupButtons: HTMLButtonElement[] = [];
  private propButtons: HTMLButtonElement[] = [];

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'map-editor-ui';
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      z-index: 1000;
    `;

    const panel = document.createElement('div');
    panel.style.cssText = `
      position: absolute;
      top: 16px;
      left: 16px;
      width: 220px;
      max-height: calc(100vh - 100px);
      overflow-y: auto;
      pointer-events: auto;
      ${PANEL_STYLE}
    `;

    const title = document.createElement('div');
    title.style.cssText = 'font-size: 14px; color: #d4af37; letter-spacing: 3px; margin-bottom: 16px;';
    title.textContent = 'MAP EDITOR';
    panel.appendChild(title);

    const mapLabel = document.createElement('div');
    mapLabel.style.cssText = 'font-size: 11px; color: #6a5a4a; margin-bottom: 8px;';
    mapLabel.textContent = 'EDITING';
    panel.appendChild(mapLabel);

    const mapName = document.createElement('div');
    mapName.id = 'map-editor-map-name';
    mapName.style.cssText = 'font-size: 13px; color: #c4b896; margin-bottom: 16px;';
    mapName.textContent = 'Custom Arena';
    panel.appendChild(mapName);

    const catLabel = document.createElement('div');
    catLabel.style.cssText = 'font-size: 11px; color: #6a5a4a; margin-bottom: 8px;';
    catLabel.textContent = 'CATEGORY';
    panel.appendChild(catLabel);

    const catRow = document.createElement('div');
    catRow.style.cssText = 'display: flex; gap: 8px; margin-bottom: 12px;';
    const pickupCatBtn = document.createElement('button');
    pickupCatBtn.type = 'button';
    pickupCatBtn.textContent = 'PICKUPS';
    pickupCatBtn.style.cssText = BUTTON_STYLE;
    pickupCatBtn.dataset.cat = 'pickup';
    pickupCatBtn.addEventListener('click', () => this.setCategory('pickup'));
    const propCatBtn = document.createElement('button');
    propCatBtn.type = 'button';
    propCatBtn.textContent = 'PROPS';
    propCatBtn.style.cssText = BUTTON_STYLE;
    propCatBtn.dataset.cat = 'prop';
    propCatBtn.addEventListener('click', () => this.setCategory('prop'));
    catRow.appendChild(pickupCatBtn);
    catRow.appendChild(propCatBtn);
    panel.appendChild(catRow);

    const itemLabel = document.createElement('div');
    itemLabel.style.cssText = 'font-size: 11px; color: #6a5a4a; margin-bottom: 8px;';
    itemLabel.textContent = 'ITEM';
    panel.appendChild(itemLabel);

    const pickupList = document.createElement('div');
    pickupList.id = 'map-editor-pickups';
    pickupList.style.cssText = 'display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px;';
    for (const p of PICKUP_TYPES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = p.label;
      btn.style.cssText = BUTTON_STYLE;
      btn.dataset.type = p.type;
      btn.dataset.amount = String(p.defaultAmount);
      btn.addEventListener('click', () => this.selectPickup(p.type, p.defaultAmount));
      pickupList.appendChild(btn);
      this.pickupButtons.push(btn);
    }
    panel.appendChild(pickupList);

    const propList = document.createElement('div');
    propList.id = 'map-editor-props';
    propList.style.cssText = 'display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px;';
    for (const p of PROP_TYPES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = p.label;
      btn.style.cssText = BUTTON_STYLE;
      btn.dataset.type = p.type;
      if (p.customOnly) btn.dataset.customOnly = '1';
      btn.addEventListener('click', () => this.selectProp(p.type));
      propList.appendChild(btn);
      this.propButtons.push(btn);
    }
    panel.appendChild(propList);

    const amountWrap = document.createElement('div');
    amountWrap.id = 'map-editor-amount-wrap';
    amountWrap.style.cssText = 'margin-bottom: 12px;';
    const amountLabel = document.createElement('label');
    amountLabel.textContent = 'Amount ';
    amountLabel.style.cssText = 'font-size: 12px;';
    this.amountInput = document.createElement('input');
    this.amountInput.type = 'number';
    this.amountInput.min = '0';
    this.amountInput.max = '999';
    this.amountInput.value = '25';
    this.amountInput.style.cssText = 'width: 60px; padding: 4px; background: rgba(0,0,0,0.5); border: 1px solid #5a4a3a; color: #c4b896; margin-left: 8px;';
    this.amountInput.addEventListener('change', () => {
      const v = parseInt(this.amountInput!.value, 10);
      if (!isNaN(v) && v >= 0) this.selectedAmount = v;
    });
    amountWrap.appendChild(amountLabel);
    amountWrap.appendChild(this.amountInput);
    panel.appendChild(amountWrap);

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size: 11px; color: #6a5a4a; margin-bottom: 16px; line-height: 1.4;';
    hint.textContent = 'Click in world to place. Delete key to remove selected.';
    panel.appendChild(hint);

    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap;';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'SAVE';
    saveBtn.style.cssText = BUTTON_STYLE;
    saveBtn.addEventListener('click', () => this.callbacks?.onSave());
    saveBtn.addEventListener('mouseenter', () => { saveBtn.style.borderColor = '#d4af37'; saveBtn.style.color = '#d4af37'; });
    saveBtn.addEventListener('mouseleave', () => { saveBtn.style.borderColor = '#5a4a3a'; saveBtn.style.color = '#8b7355'; });
    const exitBtn = document.createElement('button');
    exitBtn.type = 'button';
    exitBtn.textContent = 'EXIT';
    exitBtn.style.cssText = BUTTON_STYLE;
    exitBtn.addEventListener('click', () => this.callbacks?.onExit());
    exitBtn.addEventListener('mouseenter', () => { exitBtn.style.borderColor = '#d4af37'; exitBtn.style.color = '#d4af37'; });
    exitBtn.addEventListener('mouseleave', () => { exitBtn.style.borderColor = '#5a4a3a'; exitBtn.style.color = '#8b7355'; });
    toolbar.appendChild(saveBtn);
    toolbar.appendChild(exitBtn);
    panel.appendChild(toolbar);

    this.statusEl = document.createElement('div');
    this.statusEl.style.cssText = 'font-size: 12px; color: #8b7355; margin-top: 12px; min-height: 20px;';
    panel.appendChild(this.statusEl);

    this.container.appendChild(panel);
    this.updateVisibility();
  }

  setMapId(mapId: MultiplayerMapId): void {
    this.mapId = mapId;
    const names: Record<MultiplayerMapId, string> = {
      custom: 'Custom Arena',
      crossfire: 'Crossfire Complex',
      wasteland: 'Verdigris Depot',
    };
    const el = document.getElementById('map-editor-map-name');
    if (el) el.textContent = names[mapId];
    this.updatePropVisibility();
  }

  setCallbacks(cb: MapEditorUICallbacks | null): void {
    this.callbacks = cb;
  }

  setStatus(msg: string): void {
    this.statusEl.textContent = msg;
  }

  getSelectedItem(): { category: EditorItemCategory; type: string; amount?: number } {
    return {
      category: this.selectedCategory,
      type: this.selectedType,
      amount: this.selectedCategory === 'pickup' ? this.selectedAmount : undefined,
    };
  }

  private setCategory(cat: EditorItemCategory): void {
    this.selectedCategory = cat;
    for (const btn of this.container.querySelectorAll('[data-cat]')) {
      (btn as HTMLButtonElement).style.cssText = BUTTON_STYLE + ((btn as HTMLButtonElement).dataset.cat === cat ? BUTTON_ACTIVE_STYLE : '');
    }
    const amountWrap = document.getElementById('map-editor-amount-wrap');
    if (amountWrap) amountWrap.style.display = cat === 'pickup' ? 'block' : 'none';
    if (cat === 'pickup') {
      this.selectPickup(this.selectedType, this.selectedAmount);
    } else {
      this.selectProp(this.selectedType);
    }
  }

  private selectPickup(type: string, amount: number): void {
    this.selectedCategory = 'pickup';
    this.selectedType = type;
    this.selectedAmount = amount;
    if (this.amountInput) {
      this.amountInput.value = String(amount);
    }
    this.updatePickupSelection();
    this.callbacks?.onItemSelected('pickup', type, amount);
  }

  private selectProp(type: string): void {
    this.selectedCategory = 'prop';
    this.selectedType = type;
    this.updatePropSelection();
    this.callbacks?.onItemSelected('prop', type);
  }

  private updatePickupSelection(): void {
    for (const btn of this.pickupButtons) {
      const selected = btn.dataset.type === this.selectedType;
      btn.style.cssText = BUTTON_STYLE + (selected ? BUTTON_ACTIVE_STYLE : '');
    }
  }

  private updatePropSelection(): void {
    for (const btn of this.propButtons) {
      const selected = btn.dataset.type === this.selectedType;
      btn.style.cssText = BUTTON_STYLE + (selected ? BUTTON_ACTIVE_STYLE : '');
    }
  }

  private updatePropVisibility(): void {
    for (const btn of this.propButtons) {
      const customOnly = btn.dataset.customOnly === '1';
      (btn as HTMLButtonElement).style.display = customOnly && this.mapId !== 'custom' ? 'none' : '';
    }
  }

  private updateVisibility(): void {
    const amountWrap = document.getElementById('map-editor-amount-wrap');
    if (amountWrap) amountWrap.style.display = this.selectedCategory === 'pickup' ? 'block' : 'none';
  }

  attach(parent: HTMLElement): void {
    parent.appendChild(this.container);
    this.updateVisibility();
    this.updatePropVisibility();
  }

  detach(): void {
    this.container.remove();
  }

  getElement(): HTMLElement {
    return this.container;
  }
}
