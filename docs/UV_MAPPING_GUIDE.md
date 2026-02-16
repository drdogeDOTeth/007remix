# UV Mapping Guide - Preventing Texture Stretching

This guide documents the proper way to create 3D geometry in the 007 Remix project to prevent texture stretching and warping.

## The Problem

When creating 3D meshes with `THREE.BoxGeometry`, `THREE.CylinderGeometry`, etc., Three.js generates UV coordinates that map textures from [0,1] across each face, regardless of the face's actual dimensions. This causes:

- **Stretching** on elongated surfaces (long barrels, tall walls)
- **Warping** on cylinders with different radii
- **Inconsistent texture scale** across different parts

## The Solution

Always use the geometry utility functions from `src/core/geometry-utils.ts`. These functions:

1. **Subdivide geometry** based on dimensions to create roughly square faces
2. **Recalculate UVs** based on world-space dimensions (TEXTURE_SCALE = 256 pixels/unit)
3. **Tile textures correctly** so a 128px texture = 0.5 world units

## Usage

### Box Geometry (Walls, Crates, Weapon Parts)

```typescript
import { createSubdividedBox } from '../core/geometry-utils';

// ❌ WRONG - will stretch texture
const crate = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  crateMaterial
);

// ✅ CORRECT - proper UV tiling
const crate = new THREE.Mesh(
  createSubdividedBox(1, 1, 1),
  crateMaterial
);
```

### Cylinder Geometry (Barrels, Pillars, Gun Barrels)

```typescript
import { createSubdividedCylinder } from '../core/geometry-utils';

// ❌ WRONG - will stretch vertically and warp horizontally
const barrel = new THREE.Mesh(
  new THREE.CylinderGeometry(0.5, 0.5, 3, 16),
  barrelMaterial
);

// ✅ CORRECT - proper UV wrapping
const barrel = new THREE.Mesh(
  createSubdividedCylinder(0.5, 0.5, 3, 16),
  barrelMaterial
);
```

### Plane Geometry (Floors, Ceilings)

```typescript
import { createSubdividedPlane } from '../core/geometry-utils';

// ❌ WRONG - will stretch texture
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 10),
  floorMaterial
);

// ✅ CORRECT - proper UV tiling
const floor = new THREE.Mesh(
  createSubdividedPlane(10, 10),
  floorMaterial
);
floor.rotation.x = -Math.PI / 2; // Make horizontal
```

## Technical Details

### TEXTURE_SCALE

The constant `TEXTURE_SCALE = 256` defines the relationship between texture pixels and world units:

- 128px texture = 0.5 world units
- 256px texture = 1.0 world unit

This means:
- A box that's 0.25 units wide shows half the texture (UV 0 to 0.5)
- A box that's 0.5 units wide shows the full texture once (UV 0 to 1.0)
- A box that's 1.0 unit wide shows the texture twice (UV 0 to 2.0)

### UV Calculation (Box)

For each face, UVs are calculated based on the face's dimensions:

```typescript
// Right face (YZ plane)
u = (z + depth / 2) * TEXTURE_SCALE / 128;
v = (y + height / 2) * TEXTURE_SCALE / 128;
```

### UV Calculation (Cylinder)

Horizontal (U): Wraps around circumference
```typescript
const circumference = 2 * Math.PI * avgRadius;
u = (angle / (2 * Math.PI)) * circumference * TEXTURE_SCALE / 128;
```

Vertical (V): Tiles based on height
```typescript
v = (y + height / 2) * TEXTURE_SCALE / 128;
```

### Face Detection

Uses vertex **normals** (not positions) to determine face orientation:
- `Math.abs(nx) > 0.9` → X-facing face (left/right)
- `Math.abs(ny) > 0.9` → Y-facing face (top/bottom or cylinder caps)
- `Math.abs(nz) > 0.9` → Z-facing face (front/back)

Normals are more reliable than position checks, especially with subdivided geometry.

### Subdivision

Geometry is subdivided to create roughly 128-pixel-square faces:

```typescript
const segmentsX = Math.max(1, Math.ceil(width * TEXTURE_SCALE / 128));
```

This ensures:
- Proper vertex distribution for smooth tiling
- Correct UV interpolation across long surfaces
- Better lighting/shadow quality on large faces

## Texture Requirements

For this system to work properly, textures must:

1. **Use RepeatWrapping** (set automatically by texture generators)
   ```typescript
   texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
   ```

2. **Be tileable** - edges should seamlessly connect when repeated
3. **Have consistent scale** - features should be roughly the same size across different textures

## Project-Wide Implementation

### Already Updated
- ✅ All weapon meshes (`weapon-mesh-factory.ts`)
- ✅ Weapon view models
- ✅ Weapon pickups

### Needs Update
- ⬜ Level geometry (walls, floors, ceilings) - `level-builder.ts`
- ⬜ Destructibles (crates, barrels) - `destructible-system.ts`
- ⬜ Item pickups (health, armor, ammo) - `pickup-system.ts`
- ⬜ Props (doors, furniture) - `door-system.ts`

## Future Guidelines

### When Creating New Geometry

1. **Always import from geometry-utils**:
   ```typescript
   import { createSubdividedBox, createSubdividedCylinder, createSubdividedPlane } from '../core/geometry-utils';
   ```

2. **Never use Three.js primitives directly** for textured surfaces:
   - ❌ `new THREE.BoxGeometry(...)`
   - ❌ `new THREE.CylinderGeometry(...)`
   - ❌ `new THREE.PlaneGeometry(...)`
   - ✅ `createSubdividedBox(...)`
   - ✅ `createSubdividedCylinder(...)`
   - ✅ `createSubdividedPlane(...)`

3. **Exceptions** (when primitives are OK):
   - Very small geometry where stretching is imperceptible (< 0.05 units)
   - Untextured geometry (solid colors, emissive materials)
   - Temporary debug visualization

### When Importing GLTF Models

If using external 3D models (`.glb`, `.gltf`):

1. Ensure UVs are properly unwrapped in the modeling software (Blender, Maya, etc.)
2. Test texture scale against project standards (128px = 0.5 units)
3. If textures look stretched, re-unwrap UVs or scale them in post-processing

### Performance Considerations

Subdivided geometry has more vertices than simple primitives:
- A `BoxGeometry(1, 1, 1)` has 24 vertices
- A `createSubdividedBox(1, 1, 1)` might have 96+ vertices

This is acceptable for weapons and small props, but for large-scale level geometry:
- Consider using larger texture sizes (256x256, 512x512)
- Optimize subdivision levels for distant objects
- Use LOD (Level of Detail) for very large scenes

## Troubleshooting

### "Texture still looks stretched"
- Check that texture has RepeatWrapping enabled
- Verify TEXTURE_SCALE matches your texture resolution
- Ensure geometry dimensions are correct

### "Texture is too small/large"
- Adjust TEXTURE_SCALE (higher = larger features)
- Or change texture resolution (64x64 vs 128x128)

### "Performance is poor"
- Too much subdivision on large geometry
- Consider texture atlasing or larger textures
- Use simpler geometry for distant objects

### "Seams visible on cylinders"
- Ensure texture is perfectly tileable horizontally
- Check that circumference calculation is correct
- Increase radialSegments for smoother wrapping

## References

- Utility Module: `src/core/geometry-utils.ts`
- Weapon Implementation: `src/weapons/weapon-mesh-factory.ts`
- Procedural Textures: `src/levels/procedural-textures.ts` and `src/weapons/weapon-textures.ts`
