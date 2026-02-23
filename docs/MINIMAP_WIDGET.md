# Minimap Widget Guide

This document covers the live minimap behavior used in Custom Arena editor mode.

## Overview

- Live top-down minimap image from aerial terrain capture.
- Real-time player marker + heading.
- Real-time enemy and item hotspot overlays.
- Manual zoom and expanded view toggle.

## Controls

- `M`: Toggle minimap compact/expanded size.
- `Mouse Wheel` (over minimap): Fine zoom in/out.
- `Left Click` (over minimap): Zoom in step.
- `Right Click` (over minimap): Zoom out step.
- `Middle Click` (over minimap): Reset zoom to `7.0x`.

## Zoom And Size

- Default zoom: `7.0x`.
- Min zoom: `1.2x`.
- Max zoom: `25.0x`.
- Compact size target: `210px`.
- Expanded size target: `420px`.
- Expanded size is viewport-adaptive (clamped to visible screen space).

## Marker Rules

- Red dot: enemy marker.
- `?` badge: item hotspot cluster marker.
- Standalone item dots are intentionally suppressed to reduce clutter.

## Item Clustering

Item hotspots are clustered in world space before rendering:

- Cluster cell size: `4.8` world units.
- Minimum cluster size: `3` items before a `?` is shown.
- Maximum rendered hotspot markers: `48`.

These values are currently tuned for readability over exact per-item visibility.

## Tuning Presets

Use these presets when adjusting clustering behavior in code.

### Clean (least clutter)

- `cellSize`: `5.6`
- `clusterMinSize`: `4`
- `maxMarkers`: `32`

### Balanced (current default)

- `cellSize`: `4.8`
- `clusterMinSize`: `3`
- `maxMarkers`: `48`

### Detailed (more coverage)

- `cellSize`: `4.0`
- `clusterMinSize`: `2`
- `maxMarkers`: `72`

## Related Docs

- `docs/MAP_EDITOR.md`
