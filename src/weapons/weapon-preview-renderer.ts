import * as THREE from 'three';
import type { WeaponType } from './weapon-view-model';
import type { WeaponSkin } from './weapon-skins';
import { updatePlasmaMaterial, isPlasmaMaterial } from './weapon-plasma-material';

export const PREVIEW_W = 240;
export const PREVIEW_H = 120;

let sharedRenderer: THREE.WebGLRenderer | null = null;
let sharedScene: THREE.Scene | null = null;
let sharedCamera: THREE.PerspectiveCamera | null = null;
let sharedLight: THREE.DirectionalLight | null = null;
let sharedAmbient: THREE.AmbientLight | null = null;

const cache = new Map<string, string>();
const objectCache = new Map<string, string>();

function getCacheKey(type: WeaponType, skin: WeaponSkin): string {
  return `${type}:${skin}`;
}

function ensureRenderer(): {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
} {
  if (sharedRenderer && sharedScene && sharedCamera) {
    return {
      renderer: sharedRenderer,
      scene: sharedScene,
      camera: sharedCamera,
    };
  }
  const canvas = document.createElement('canvas');
  canvas.width = PREVIEW_W;
  canvas.height = PREVIEW_H;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(PREVIEW_W, PREVIEW_H);
  renderer.setClearColor(0x1a1a22, 0.95);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, PREVIEW_W / PREVIEW_H, 0.01, 10);
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  const light = new THREE.DirectionalLight(0xffffff, 0.8);
  light.position.set(0.4, 0.5, 0.6);
  scene.add(ambient);
  scene.add(light);
  sharedRenderer = renderer;
  sharedScene = scene;
  sharedCamera = camera;
  sharedLight = light;
  sharedAmbient = ambient;
  return { renderer, scene, camera };
}

function ensureRendererSize(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  w: number,
  h: number,
): void {
  if (renderer.domElement.width === w && renderer.domElement.height === h) return;
  renderer.setSize(w, h);
  renderer.domElement.width = w;
  renderer.domElement.height = h;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

/** Compute bounding box of any object (including mesh descendants). */
function computeObjectBox(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.geometry) {
      obj.geometry.computeBoundingBox();
      if (obj.geometry.boundingBox) {
        const b = obj.geometry.boundingBox.clone();
        b.applyMatrix4(obj.matrixWorld);
        box.union(b);
      }
    }
  });
  if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1));
  return box;
}

/**
 * Render a weapon group to a small canvas and return a data URL.
 * Used by the inventory to show 3D preview of each weapon + skin.
 */
export function renderWeaponPreviewToDataUrl(
  group: THREE.Group,
  type: WeaponType,
  skin: WeaponSkin,
): string {
  const key = getCacheKey(type, skin);
  const cached = cache.get(key);
  if (cached) return cached;

  const { renderer, scene, camera } = ensureRenderer();
  ensureRendererSize(renderer, camera, PREVIEW_W, PREVIEW_H);
  renderer.setClearColor(0x1a1a22, 0.95);

  scene.add(group);
  group.updateMatrixWorld(true);
  const box = computeObjectBox(group);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const distance = maxDim * 2.6;
  camera.position.set(center.x + distance * 0.4, center.y + distance * 0.2, center.z + distance * 0.5);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);

  renderer.render(scene, camera);
  scene.remove(group);

  const dataUrl = renderer.domElement.toDataURL('image/png');
  cache.set(key, dataUrl);
  return dataUrl;
}

/**
 * Render the weapon with a given Y rotation to an output 2D canvas.
 * Used for interactive rotatable previews (drag to rotate).
 */
export function renderWeaponPreviewToCanvas(
  group: THREE.Group,
  _type: WeaponType,
  _skin: WeaponSkin,
  rotationY: number,
  outputCanvas: HTMLCanvasElement,
): void {
  const { renderer, scene, camera } = ensureRenderer();
  const w = outputCanvas.width;
  const h = outputCanvas.height;
  ensureRendererSize(renderer, camera, w, h);
  renderer.setClearColor(0x1a1a22, 0.95);

  group.rotation.y = rotationY;
  if (_skin === 'plasma') {
    const t = performance.now() * 0.001;
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          if (isPlasmaMaterial(mat)) updatePlasmaMaterial(mat, t);
        }
      }
    });
  }
  scene.add(group);
  group.updateMatrixWorld(true);
  const box = computeObjectBox(group);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const distance = maxDim * 2.6;
  camera.position.set(center.x + distance * 0.4, center.y + distance * 0.2, center.z + distance * 0.5);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);

  renderer.render(scene, camera);
  scene.remove(group);

  const ctx = outputCanvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(renderer.domElement, 0, 0, w, h);
  }
}

interface ObjectPreviewOptions {
  width?: number;
  height?: number;
  clearColor?: number;
  clearAlpha?: number;
  cameraDistanceScale?: number;
  cameraOffset?: THREE.Vector3;
  format?: 'image/png' | 'image/webp';
  quality?: number;
}

/**
 * Render any object to a data URL (cached by key).
 * Uses the shared preview renderer to avoid additional WebGL contexts.
 */
export function renderObjectPreviewToDataUrl(
  cacheKey: string,
  object: THREE.Object3D,
  options: ObjectPreviewOptions = {},
): string {
  const cached = objectCache.get(cacheKey);
  if (cached) return cached;

  const w = options.width ?? 88;
  const h = options.height ?? 56;
  const clearColor = options.clearColor ?? 0x0f0f14;
  const clearAlpha = options.clearAlpha ?? 0.95;
  const distanceScale = options.cameraDistanceScale ?? 2.8;
  const cameraOffset = options.cameraOffset ?? new THREE.Vector3(0.45, 0.25, 0.6);
  const format = options.format ?? 'image/webp';
  const quality = options.quality ?? 0.82;

  const { renderer, scene, camera } = ensureRenderer();
  ensureRendererSize(renderer, camera, w, h);
  renderer.setClearColor(clearColor, clearAlpha);

  scene.add(object);
  object.updateMatrixWorld(true);

  const box = computeObjectBox(object);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const distance = maxDim * distanceScale;

  camera.position.set(
    center.x + distance * cameraOffset.x,
    center.y + distance * cameraOffset.y,
    center.z + distance * cameraOffset.z,
  );
  camera.lookAt(center);
  camera.updateMatrixWorld(true);

  renderer.render(scene, camera);
  scene.remove(object);

  let dataUrl: string;
  try {
    dataUrl = renderer.domElement.toDataURL(format, quality);
  } catch {
    dataUrl = renderer.domElement.toDataURL('image/png');
  }

  objectCache.set(cacheKey, dataUrl);
  return dataUrl;
}
