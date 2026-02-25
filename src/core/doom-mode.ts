import * as THREE from 'three';

const STORAGE_KEY = '007remix_doom_mode';

/** Tracks whether sprite-baker view mode is active and persists it across sessions. */
export class DoomMode {
  private _active = false;

  constructor() {
    try { this._active = localStorage.getItem(STORAGE_KEY) === 'true'; } catch (_) {}
  }

  get isActive(): boolean { return this._active; }
  setActive(v: boolean): void { this._active = v; }
  save(): void { try { localStorage.setItem(STORAGE_KEY, String(this._active)); } catch (_) {} }
}

// Silence unused import warning — THREE is kept for potential future use
void (THREE.REVISION);
