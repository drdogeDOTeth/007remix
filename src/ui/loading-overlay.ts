/**
 * Full-screen loading overlay shown while heavy assets load and shaders
 * compile (Custom Arena GLB/HDRI, warm-up compile). Prevents the bare black
 * canvas between hiding the menu and rendering the first frame.
 */

let overlay: HTMLDivElement | null = null;
let labelEl: HTMLDivElement | null = null;

function ensureOverlay(): void {
  if (overlay) return;

  overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 18px;
    background: #0a0a12;
    z-index: 200;
    font-family: monospace;
    transition: opacity 0.25s;
  `;

  const spinner = document.createElement('div');
  spinner.style.cssText = `
    width: 42px;
    height: 42px;
    border: 3px solid rgba(120, 200, 120, 0.15);
    border-top-color: #7bc87b;
    border-radius: 50%;
    animation: loading-overlay-spin 0.9s linear infinite;
  `;

  const style = document.createElement('style');
  style.textContent = `@keyframes loading-overlay-spin { to { transform: rotate(360deg); } }`;
  overlay.appendChild(style);
  overlay.appendChild(spinner);

  labelEl = document.createElement('div');
  labelEl.style.cssText = `
    color: #7bc87b;
    font-size: 14px;
    letter-spacing: 3px;
  `;
  overlay.appendChild(labelEl);

  document.body.appendChild(overlay);
}

/** Show the overlay with the given label (e.g. "LOADING CUSTOM ARENA"). */
export function showLoadingOverlay(label: string): void {
  ensureOverlay();
  if (labelEl) labelEl.textContent = label;
  overlay!.style.display = 'flex';
  overlay!.style.opacity = '1';
}

/** Update the label without re-showing (e.g. "COMPILING SHADERS"). */
export function setLoadingOverlayLabel(label: string): void {
  if (labelEl) labelEl.textContent = label;
}

/** Fade out and hide the overlay. Safe to call when not shown. */
export function hideLoadingOverlay(): void {
  if (!overlay) return;
  const el = overlay;
  el.style.opacity = '0';
  setTimeout(() => {
    el.style.display = 'none';
  }, 260);
}
