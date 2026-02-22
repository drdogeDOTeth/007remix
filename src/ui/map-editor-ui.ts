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

export interface EditorMinimapBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface EditorMinimapPoint {
  x: number;
  z: number;
}

export type EditorMinimapEntityKind = 'item' | 'weapon' | 'structure' | 'poi';

export interface EditorMinimapEntityMarker extends EditorMinimapPoint {
  kind: EditorMinimapEntityKind;
  count?: number;
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
  private minimapWrap: HTMLDivElement;
  private minimapImageEl: HTMLImageElement;
  private minimapEntityLayerEl: HTMLDivElement;
  private minimapPlayerEl: HTMLDivElement;
  private minimapHeadingEl: HTMLDivElement;
  private minimapZoomEl: HTMLDivElement;
  private minimapBounds: EditorMinimapBounds | null = null;
  private minimapEnemies: EditorMinimapPoint[] = [];
  private minimapItems: EditorMinimapEntityMarker[] = [];
  private minimapEnemyMarkers: HTMLDivElement[] = [];
  private minimapItemMarkers: HTMLDivElement[] = [];
  private minimapWorldX = 0;
  private minimapWorldZ = 0;
  private minimapYawRadians = 0;
  private minimapHasPose = false;
  private minimapExpanded = false;
  private readonly minimapSizeCompact = 210;
  private readonly minimapSizeExpanded = 420;
  private readonly minimapZoomMin = 1.2;
  private readonly minimapZoomMax = 25;
  private readonly minimapZoomStepClick = 0.45;
  private readonly minimapZoomStepWheel = 0.2;
  private minimapZoom = 7;
  private readonly onWindowResize = () => this.applyMinimapLayout();

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
    hint.innerHTML = 'SCROLL cycle &nbsp;·&nbsp; TAB mode<br>CLICK place &nbsp;·&nbsp; DEL remove &nbsp;·&nbsp; 9 export &nbsp;·&nbsp; M map';
    this.panel.appendChild(hint);

    // Status
    this.statusEl = document.createElement('div');
    this.statusEl.style.cssText = 'font-size:10px; color:#8b7355; margin-top:6px; min-height:14px;';
    this.panel.appendChild(this.statusEl);

    this.container.appendChild(this.panel);

    // Live minimap (top-right). Shown when map data is provided by Game.
    this.minimapWrap = document.createElement('div');
    this.minimapWrap.style.cssText = `
      position: absolute;
      top: 16px;
      right: 16px;
      width: 210px;
      height: 210px;
      border: 1px solid rgba(90,74,58,0.95);
      background: rgba(0,0,0,0.72);
      box-shadow: 0 0 12px rgba(0,0,0,0.45);
      pointer-events: auto;
      cursor: zoom-in;
      display: none;
      overflow: hidden;
    `;

    this.minimapImageEl = document.createElement('img');
    this.minimapImageEl.alt = 'Aerial map';
    this.minimapImageEl.style.cssText = `
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      transform-origin: 0 0;
      image-rendering: pixelated;
      opacity: 0.95;
      filter: contrast(1.08) saturate(0.9);
    `;
    this.minimapWrap.appendChild(this.minimapImageEl);

    this.minimapEntityLayerEl = document.createElement('div');
    this.minimapEntityLayerEl.style.cssText = `
      position: absolute;
      inset: 0;
      pointer-events: none;
    `;
    this.minimapWrap.appendChild(this.minimapEntityLayerEl);

    const centerCross = document.createElement('div');
    centerCross.style.cssText = `
      position: absolute;
      left: 50%;
      top: 50%;
      width: 10px;
      height: 10px;
      transform: translate(-50%, -50%);
      border: 1px solid rgba(212,175,55,0.35);
      box-sizing: border-box;
    `;
    this.minimapWrap.appendChild(centerCross);

    this.minimapHeadingEl = document.createElement('div');
    this.minimapHeadingEl.style.cssText = `
      position: absolute;
      left: 50%;
      top: 50%;
      width: 0;
      height: 0;
      border-left: 4px solid transparent;
      border-right: 4px solid transparent;
      border-bottom: 8px solid rgba(255,220,120,0.95);
      transform: translate(-50%, -50%) rotate(0deg) translateY(-8px);
      transform-origin: 50% 8px;
    `;
    this.minimapWrap.appendChild(this.minimapHeadingEl);

    this.minimapPlayerEl = document.createElement('div');
    this.minimapPlayerEl.style.cssText = `
      position: absolute;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: rgba(255,220,120,0.98);
      box-shadow: 0 0 8px rgba(255,220,120,0.75);
      transform: translate(-50%, -50%);
      left: 50%;
      top: 50%;
    `;
    this.minimapWrap.appendChild(this.minimapPlayerEl);

    const minimapLabel = document.createElement('div');
    minimapLabel.style.cssText = `
      position: absolute;
      left: 8px;
      top: 6px;
      font-size: 10px;
      color: rgba(212,175,55,0.95);
      letter-spacing: 1px;
      font-family: 'Courier New', monospace;
      text-shadow: 0 0 5px rgba(0,0,0,0.8);
    `;
    minimapLabel.textContent = 'LIVE MAP';
    this.minimapWrap.appendChild(minimapLabel);

    this.minimapZoomEl = document.createElement('div');
    this.minimapZoomEl.style.cssText = `
      position: absolute;
      right: 8px;
      bottom: 8px;
      font-size: 9px;
      color: rgba(212,175,55,0.95);
      letter-spacing: 0.6px;
      font-family: 'Courier New', monospace;
      text-shadow: 0 0 5px rgba(0,0,0,0.8);
      background: rgba(0,0,0,0.42);
      border: 1px solid rgba(212,175,55,0.28);
      padding: 1px 4px;
    `;
    this.minimapWrap.appendChild(this.minimapZoomEl);
    this.updateMinimapZoomBadge();

    this.minimapWrap.title = 'M expand/collapse, LMB zoom in, RMB zoom out, wheel fine zoom';
    this.minimapWrap.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.adjustMinimapZoom(this.minimapZoomStepClick);
      } else if (e.button === 2) {
        this.adjustMinimapZoom(-this.minimapZoomStepClick);
      } else if (e.button === 1) {
        this.minimapZoom = 7;
        this.updateMinimapZoomBadge();
        this.renderMinimapView();
      } else {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    });
    this.minimapWrap.addEventListener('wheel', (e) => {
      const dir = Math.sign(e.deltaY);
      if (dir === 0) return;
      this.adjustMinimapZoom(-dir * this.minimapZoomStepWheel);
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });
    this.minimapWrap.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    window.addEventListener('resize', this.onWindowResize);
    this.applyMinimapLayout();

    this.container.appendChild(this.minimapWrap);

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

  toggleMinimapExpanded(): boolean {
    this.minimapExpanded = !this.minimapExpanded;
    this.applyMinimapLayout();
    return this.minimapExpanded;
  }

  setMinimapImage(dataUrl: string, bounds: EditorMinimapBounds): void {
    this.minimapBounds = bounds;
    this.minimapImageEl.src = dataUrl;
    this.minimapWrap.style.display = 'block';
    this.renderMinimapView();
  }

  updateMinimapPlayer(worldX: number, worldZ: number, yawRadians: number): void {
    this.minimapWorldX = worldX;
    this.minimapWorldZ = worldZ;
    this.minimapYawRadians = yawRadians;
    this.minimapHasPose = true;
    this.renderMinimapView();
  }

  updateMinimapEntities(
    enemies: ReadonlyArray<EditorMinimapPoint>,
    items: ReadonlyArray<EditorMinimapEntityMarker>,
  ): void {
    this.copyMinimapPoints(this.minimapEnemies, enemies, 64);
    this.copyMinimapEntityMarkers(this.minimapItems, items, 256);
    this.renderMinimapView();
  }

  private adjustMinimapZoom(delta: number): void {
    const next = Math.max(
      this.minimapZoomMin,
      Math.min(this.minimapZoomMax, this.minimapZoom + delta),
    );
    if (Math.abs(next - this.minimapZoom) < 0.0001) return;
    this.minimapZoom = Math.round(next * 100) / 100;
    this.updateMinimapZoomBadge();
    this.renderMinimapView();
  }

  private updateMinimapZoomBadge(): void {
    this.minimapZoomEl.textContent = `${this.minimapZoom.toFixed(1)}x`;
  }

  private applyMinimapLayout(): void {
    const viewportW = Math.max(320, window.innerWidth || 0);
    const viewportH = Math.max(240, window.innerHeight || 0);
    const maxSize = Math.max(160, Math.min(viewportW - 24, viewportH - 24));
    const compactSize = Math.max(160, Math.min(this.minimapSizeCompact, maxSize));
    const expandedAdaptive = Math.floor(Math.min(viewportW * 0.46, viewportH * 0.62));
    const expandedSize = Math.max(220, Math.min(this.minimapSizeExpanded, expandedAdaptive, maxSize));
    const size = this.minimapExpanded ? expandedSize : compactSize;
    this.minimapWrap.style.width = `${size}px`;
    this.minimapWrap.style.height = `${size}px`;
    this.minimapWrap.style.top = this.minimapExpanded ? '12px' : '16px';
    this.minimapWrap.style.right = this.minimapExpanded ? '12px' : '16px';
    this.minimapWrap.style.boxShadow = this.minimapExpanded
      ? '0 0 20px rgba(0,0,0,0.58)'
      : '0 0 12px rgba(0,0,0,0.45)';
    this.renderMinimapView();
  }

  private renderMinimapView(): void {
    const b = this.minimapBounds;
    if (!b || !this.minimapHasPose) {
      this.minimapImageEl.style.transform = 'translate(0px, 0px) scale(1)';
      this.hideUnusedMarkers(this.minimapEnemyMarkers, 0);
      this.hideUnusedMarkers(this.minimapItemMarkers, 0);
      return;
    }

    const width = b.maxX - b.minX;
    const depth = b.maxZ - b.minZ;
    if (width <= 0 || depth <= 0) return;

    const nx = Math.max(0, Math.min(1, (this.minimapWorldX - b.minX) / width));
    const nz = Math.max(0, Math.min(1, (this.minimapWorldZ - b.minZ) / depth));

    const wrapW = this.minimapWrap.clientWidth || 210;
    const wrapH = this.minimapWrap.clientHeight || 210;
    const zoom = Math.max(1, this.minimapZoom);

    const mapX = nx * wrapW;
    const mapY = nz * wrapH;
    let tx = wrapW * 0.5 - mapX * zoom;
    let ty = wrapH * 0.5 - mapY * zoom;
    const minTx = wrapW - wrapW * zoom;
    const minTy = wrapH - wrapH * zoom;
    tx = Math.max(minTx, Math.min(0, tx));
    ty = Math.max(minTy, Math.min(0, ty));
    this.minimapImageEl.style.transform = `translate(${tx}px, ${ty}px) scale(${zoom})`;

    const screenX = mapX * zoom + tx;
    const screenY = mapY * zoom + ty;
    const cx = (screenX / wrapW) * 100;
    const cy = (screenY / wrapH) * 100;
    this.minimapPlayerEl.style.left = `${cx}%`;
    this.minimapPlayerEl.style.top = `${cy}%`;
    this.minimapHeadingEl.style.left = `${cx}%`;
    this.minimapHeadingEl.style.top = `${cy}%`;

    const headingDeg = ((-this.minimapYawRadians * 180) / Math.PI + 360) % 360;
    this.minimapHeadingEl.style.transform =
      `translate(-50%, -50%) rotate(${headingDeg}deg) translateY(-8px)`;

    this.renderMinimapMarkers(
      b,
      width,
      depth,
      wrapW,
      wrapH,
      zoom,
      tx,
      ty,
    );
  }

  private renderMinimapMarkers(
    bounds: EditorMinimapBounds,
    width: number,
    depth: number,
    wrapW: number,
    wrapH: number,
    zoom: number,
    tx: number,
    ty: number,
  ): void {
    const itemCount = this.renderItemMarkerSet(
      this.minimapItems,
      this.minimapItemMarkers,
      bounds,
      width,
      depth,
      wrapW,
      wrapH,
      zoom,
      tx,
      ty,
    );
    this.hideUnusedMarkers(this.minimapItemMarkers, itemCount);

    const enemyCount = this.renderEnemyMarkerSet(
      this.minimapEnemies,
      this.minimapEnemyMarkers,
      bounds,
      width,
      depth,
      wrapW,
      wrapH,
      zoom,
      tx,
      ty,
    );
    this.hideUnusedMarkers(this.minimapEnemyMarkers, enemyCount);
  }

  private renderEnemyMarkerSet(
    points: ReadonlyArray<EditorMinimapPoint>,
    pool: HTMLDivElement[],
    bounds: EditorMinimapBounds,
    width: number,
    depth: number,
    wrapW: number,
    wrapH: number,
    zoom: number,
    tx: number,
    ty: number,
  ): number {
    let used = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const nx = Math.max(0, Math.min(1, (p.x - bounds.minX) / width));
      const nz = Math.max(0, Math.min(1, (p.z - bounds.minZ) / depth));
      const mapX = nx * wrapW;
      const mapY = nz * wrapH;
      const screenX = mapX * zoom + tx;
      const screenY = mapY * zoom + ty;
      if (screenX < -4 || screenX > wrapW + 4 || screenY < -4 || screenY > wrapH + 4) continue;

      let marker = pool[used];
      if (!marker) {
        marker = this.createEnemyMinimapMarker();
        pool[used] = marker;
        this.minimapEntityLayerEl.appendChild(marker);
      }
      marker.style.display = 'block';
      marker.style.left = `${screenX}px`;
      marker.style.top = `${screenY}px`;
      used++;
    }
    return used;
  }

  private renderItemMarkerSet(
    points: ReadonlyArray<EditorMinimapEntityMarker>,
    pool: HTMLDivElement[],
    bounds: EditorMinimapBounds,
    width: number,
    depth: number,
    wrapW: number,
    wrapH: number,
    zoom: number,
    tx: number,
    ty: number,
  ): number {
    let used = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const nx = Math.max(0, Math.min(1, (p.x - bounds.minX) / width));
      const nz = Math.max(0, Math.min(1, (p.z - bounds.minZ) / depth));
      const mapX = nx * wrapW;
      const mapY = nz * wrapH;
      const screenX = mapX * zoom + tx;
      const screenY = mapY * zoom + ty;
      if (screenX < -6 || screenX > wrapW + 6 || screenY < -6 || screenY > wrapH + 6) continue;

      let marker = pool[used];
      if (!marker) {
        marker = this.createItemMinimapMarker();
        pool[used] = marker;
        this.minimapEntityLayerEl.appendChild(marker);
      }
      this.applyItemMarkerKind(marker, p.kind, p.count);
      marker.style.display = 'flex';
      marker.style.left = `${screenX}px`;
      marker.style.top = `${screenY}px`;
      used++;
    }
    return used;
  }

  private createEnemyMinimapMarker(): HTMLDivElement {
    const marker = document.createElement('div');
    marker.style.cssText = `
      position: absolute;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      background: rgba(255,72,72,0.95);
      border: 1px solid rgba(255,190,190,0.9);
      box-shadow: 0 0 7px rgba(255,64,64,0.7);
      pointer-events: none;
    `;
    return marker;
  }

  private createItemMinimapMarker(): HTMLDivElement {
    const marker = document.createElement('div');
    marker.style.cssText = `
      position: absolute;
      transform: translate(-50%, -50%);
      pointer-events: none;
      display: none;
      align-items: center;
      justify-content: center;
      font-family: 'Courier New', monospace;
      font-size: 8px;
      font-weight: 700;
      line-height: 1;
      user-select: none;
    `;
    return marker;
  }

  private applyItemMarkerKind(
    marker: HTMLDivElement,
    kind: EditorMinimapEntityKind,
    count?: number,
  ): void {
    const countText = count && count > 1 ? (count > 9 ? '9+' : String(count)) : '';
    const key = `${kind}:${countText}`;
    if (marker.dataset.kindKey === key) return;
    marker.dataset.kindKey = key;

    marker.style.width = '14px';
    marker.style.height = '14px';
    marker.style.borderRadius = '3px';
    marker.style.background = 'rgba(178,224,255,0.92)';
    marker.style.border = '1px solid rgba(238,248,255,0.95)';
    marker.style.color = 'rgba(11,30,48,0.96)';
    marker.style.boxShadow = '0 0 8px rgba(152,214,255,0.62)';
    marker.textContent = '?';
    marker.style.fontSize = '9px';
  }

  private hideUnusedMarkers(pool: HTMLDivElement[], used: number): void {
    for (let i = used; i < pool.length; i++) {
      pool[i].style.display = 'none';
    }
  }

  private copyMinimapPoints(
    target: EditorMinimapPoint[],
    source: ReadonlyArray<EditorMinimapPoint>,
    limit: number,
  ): void {
    const count = Math.min(limit, source.length);
    for (let i = 0; i < count; i++) {
      const src = source[i];
      const rec = target[i] ?? { x: 0, z: 0 };
      rec.x = src.x;
      rec.z = src.z;
      target[i] = rec;
    }
    target.length = count;
  }

  private copyMinimapEntityMarkers(
    target: EditorMinimapEntityMarker[],
    source: ReadonlyArray<EditorMinimapEntityMarker>,
    limit: number,
  ): void {
    const count = Math.min(limit, source.length);
    for (let i = 0; i < count; i++) {
      const src = source[i];
      const rec = target[i] ?? { x: 0, z: 0, kind: 'item' as EditorMinimapEntityKind };
      rec.x = src.x;
      rec.z = src.z;
      rec.kind = src.kind;
      rec.count = src.count;
      target[i] = rec;
    }
    target.length = count;
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
    window.removeEventListener('resize', this.onWindowResize);
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

