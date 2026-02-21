# Map Editor Guide

This document covers map editor controls and the hotbar thumbnail pipeline.

## Basic Controls

- `Tab`: Switch mode (`PICKUPS` / `PROPS`)
- `Mouse Wheel`: Cycle selected hotbar item
- `Left Click`: Place selected item
- `Delete`: Remove nearest item under cursor
- `SAVE`: Write map config
- `EXIT`: Leave editor mode

## Hotbar Thumbnails (Real 3D)

The editor hotbar now uses real rendered item thumbnails (not hand-drawn icons).

- Thumbnails are rendered from the same 3D meshes used by pickups/props/weapons.
- A single shared preview renderer is reused for all thumbnail renders.
- Thumbnails are generated asynchronously in small batches to avoid frame hitches.
- Rendered results are cached by item key (for example: `pickup:weapon-rifle`, `prop:barrel`).
- Temporary preview meshes/materials/geometries are disposed after capture.
- In-flight thumbnail generation is canceled when editor UI is closed/replaced.

## Performance Notes

- Small thumbnail render targets are used to limit GPU/CPU cost.
- Cached image data is reused when returning to editor mode.
- Batch generation uses a short per-frame budget so gameplay/editor input stays responsive.
