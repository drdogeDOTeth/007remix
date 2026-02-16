/**
 * Shared geometry utilities with proper UV mapping to prevent texture stretching.
 *
 * IMPORTANT: Always use these functions when creating box or cylinder geometry.
 * They automatically subdivide meshes and calculate UVs based on world-space dimensions,
 * ensuring textures tile correctly without stretching or warping.
 */
import * as THREE from 'three';

/** Texture scale (pixels per world unit) for UV mapping — prevents stretching. */
const TEXTURE_SCALE = 256; // 128px texture = 0.5 world units

/**
 * Create a subdivided box geometry with aspect-ratio-corrected UVs.
 * Prevents texture stretching on elongated parts by tiling UVs based on actual dimensions.
 *
 * @param width - Box width (X dimension)
 * @param height - Box height (Y dimension)
 * @param depth - Box depth (Z dimension)
 * @returns BufferGeometry with proper UV mapping
 *
 * @example
 * // Create a wall segment with proper UVs
 * const wall = new THREE.Mesh(
 *   createSubdividedBox(5, 3, 0.2),
 *   wallMaterial
 * );
 */
export function createSubdividedBox(
  width: number,
  height: number,
  depth: number,
): THREE.BufferGeometry {
  // Calculate segments based on size to get roughly square faces
  const segmentsX = Math.max(1, Math.ceil(width * TEXTURE_SCALE / 128));
  const segmentsY = Math.max(1, Math.ceil(height * TEXTURE_SCALE / 128));
  const segmentsZ = Math.max(1, Math.ceil(depth * TEXTURE_SCALE / 128));

  const geometry = new THREE.BoxGeometry(width, height, depth, segmentsX, segmentsY, segmentsZ);

  // Recalculate UVs to tile based on world-space dimensions
  const uvAttr = geometry.getAttribute('uv');
  const posAttr = geometry.getAttribute('position');
  const normalAttr = geometry.getAttribute('normal');

  for (let i = 0; i < uvAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const nx = normalAttr.getX(i);
    const ny = normalAttr.getY(i);
    const nz = normalAttr.getZ(i);

    let u = 0, v = 0;

    // Use normals to reliably determine face orientation
    if (Math.abs(nx) > 0.9) {
      // Left/Right faces (YZ plane) - normal along X axis
      u = (z + depth / 2) * TEXTURE_SCALE / 128;
      v = (y + height / 2) * TEXTURE_SCALE / 128;
    } else if (Math.abs(ny) > 0.9) {
      // Top/Bottom faces (XZ plane) - normal along Y axis
      u = (x + width / 2) * TEXTURE_SCALE / 128;
      v = (z + depth / 2) * TEXTURE_SCALE / 128;
    } else if (Math.abs(nz) > 0.9) {
      // Front/Back faces (XY plane) - normal along Z axis
      u = (x + width / 2) * TEXTURE_SCALE / 128;
      v = (y + height / 2) * TEXTURE_SCALE / 128;
    }

    uvAttr.setXY(i, u, v);
  }

  uvAttr.needsUpdate = true;
  return geometry;
}

/**
 * Create a subdivided cylinder geometry with proper UV wrapping.
 * Prevents texture stretching along cylinder length and around circumference.
 *
 * @param radiusTop - Radius at the top of the cylinder
 * @param radiusBottom - Radius at the bottom of the cylinder
 * @param height - Cylinder height (Y dimension)
 * @param radialSegments - Number of segments around the circumference (default: 8)
 * @returns BufferGeometry with proper UV mapping
 *
 * @example
 * // Create a pillar with proper UVs
 * const pillar = new THREE.Mesh(
 *   createSubdividedCylinder(0.5, 0.5, 3, 16),
 *   pillarMaterial
 * );
 */
export function createSubdividedCylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  radialSegments: number = 8,
): THREE.BufferGeometry {
  const heightSegments = Math.max(1, Math.ceil(height * TEXTURE_SCALE / 128));
  const geometry = new THREE.CylinderGeometry(
    radiusTop,
    radiusBottom,
    height,
    radialSegments,
    heightSegments,
  );

  // Recalculate UVs for proper tiling along cylinder length
  const uvAttr = geometry.getAttribute('uv');
  const posAttr = geometry.getAttribute('position');
  const normalAttr = geometry.getAttribute('normal');

  // Calculate average radius for circumference-based tiling
  const avgRadius = (radiusTop + radiusBottom) / 2;
  const circumference = 2 * Math.PI * avgRadius;

  for (let i = 0; i < uvAttr.count; i++) {
    const y = posAttr.getY(i);
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const ny = normalAttr.getY(i);

    // Check if this is a cap vertex using normal (caps have normal along Y axis)
    const isCap = Math.abs(ny) > 0.9;

    if (!isCap) {
      // Cylindrical surface - wrap horizontally based on circumference, tile vertically
      const angle = Math.atan2(z, x);
      const u = (angle / (Math.PI * 2)) * circumference * TEXTURE_SCALE / 128;
      const v = (y + height / 2) * TEXTURE_SCALE / 128;
      uvAttr.setXY(i, u, v);
    }
    // Keep cap UVs as-is (radial pattern from Three.js)
  }

  uvAttr.needsUpdate = true;
  return geometry;
}

/**
 * Create a subdivided plane geometry with proper UV tiling.
 * Useful for floors, ceilings, and wall sections.
 *
 * @param width - Plane width (X dimension)
 * @param height - Plane height (Z dimension)
 * @returns BufferGeometry with proper UV mapping
 *
 * @example
 * // Create a floor tile with proper UVs
 * const floor = new THREE.Mesh(
 *   createSubdividedPlane(10, 10),
 *   floorMaterial
 * );
 * floor.rotation.x = -Math.PI / 2; // Horizontal
 */
export function createSubdividedPlane(
  width: number,
  height: number,
): THREE.BufferGeometry {
  const segmentsX = Math.max(1, Math.ceil(width * TEXTURE_SCALE / 128));
  const segmentsY = Math.max(1, Math.ceil(height * TEXTURE_SCALE / 128));

  const geometry = new THREE.PlaneGeometry(width, height, segmentsX, segmentsY);

  // Recalculate UVs to tile based on world-space dimensions
  const uvAttr = geometry.getAttribute('uv');
  const posAttr = geometry.getAttribute('position');

  for (let i = 0; i < uvAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);

    // PlaneGeometry is in XY plane by default
    const u = (x + width / 2) * TEXTURE_SCALE / 128;
    const v = (y + height / 2) * TEXTURE_SCALE / 128;

    uvAttr.setXY(i, u, v);
  }

  uvAttr.needsUpdate = true;
  return geometry;
}
