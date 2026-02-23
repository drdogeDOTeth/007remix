# Map Editor Guide

This document covers map editor controls and the hotbar thumbnail pipeline.

See also: `docs/MINIMAP_WIDGET.md` for detailed minimap behavior and clustering rules.

## Basic Controls

- `Tab`: Switch mode (`PICKUPS` / `PROPS`)
- `Mouse Wheel`: Cycle selected hotbar item
- `Left Click`: Place selected item
- `Delete`: Remove nearest item under cursor
- `9`: Save aerial map (`.png`) + coordinate metadata (`.json`) for minimap/waypoints
- `M`: Toggle minimap size (compact/expanded)
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

## Live Minimap Widget

- In editor mode, a live minimap appears in the top-right for Custom Arena.
- It uses a top-down orthographic terrain capture with real world bounds.
- Player marker and heading update in real time from world position + camera yaw.
- Default minimap zoom is `7.0x`, adjustable up to `25.0x`.
- Manual zoom controls: hover/click minimap and use `Mouse Wheel` (fine), `Left Click` (zoom in step), `Right Click` (zoom out step), `Middle Click` (reset to `7.0x`).
- Press `M` to toggle compact and expanded minimap size.
- Expanded minimap size adapts to viewport dimensions (so it stays usable on smaller screens).
- Entity markers are shown on top of the minimap:
  - Red dots: enemies
  - `?` badge: clustered item hotspot (single marker for grouped nearby items)
  - Individual item markers are suppressed to reduce clutter.

## Performance Notes

- Small thumbnail render targets are used to limit GPU/CPU cost.
- Cached image data is reused when returning to editor mode.
- Batch generation uses a short per-frame budget so gameplay/editor input stays responsive.

## Aerial Export Output

Press `9` while in Custom Arena to save:

- `custom-arena-aerial-<timestamp>.png`: top-down orthographic terrain map
- `custom-arena-aerial-<timestamp>.json`: world bounds and world<->pixel conversion formulas

Files are written to:

- `public/maps/quickplay/surveys/`

If the server API is unavailable, the client falls back to browser download.

Use the JSON formulas directly for waypoint, checkpoint, and enemy icon placement.
