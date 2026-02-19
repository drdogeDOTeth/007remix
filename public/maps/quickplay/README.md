# Custom Quickplay Arena Assets

Place your assets here for the **QUICK PLAY — CUSTOM ARENA** mode (outdoor maps with skybox, HDRI, day/night cycle).

> **Full setup guide**: See **[docs/OUTDOOR_LEVELS_SETUP.md](../../docs/OUTDOOR_LEVELS_SETUP.md)** for complete documentation on outdoor levels, skybox, day/night, terrain collision, and enemy/item placement.

## Quick Reference

| Asset        | Default        | Description                                  |
|--------------|----------------|----------------------------------------------|
| environment  | environment.glb | Terrain, geometry (required)                 |
| hdri         | environment.hdr | Equirectangular HDR for lighting              |
| skybox       | skybox.jpg      | LDR sky background                            |
| daySkybox    | —               | Day panorama (for day/night cycle)            |
| nightSkybox  | —               | Night panorama (for day/night cycle)         |

- **config.json**: Define asset names, presets, `skyboxRotationOffset`, `skyDomeScale`. Optional `pickups` and `props` arrays for fine-tuned weapon/ammo/crate/barrel placement (see [OUTDOOR_LEVELS_SETUP.md](../../docs/OUTDOOR_LEVELS_SETUP.md)).
- **Collision**: Trimesh from GLB. Name a mesh `collision` or `collider` for dedicated physics mesh.
- **Player spawn**: Press **F8** to save your current position.
