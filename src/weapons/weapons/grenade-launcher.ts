import { WeaponBase } from '../weapon-base';

export class GrenadeLauncher extends WeaponBase {
  constructor() {
    super({
      name: 'M79 Grenade Launcher',
      damage: 75,
      fireRate: 0.8,      // ~1 shot per 1.25 seconds
      maxAmmo: 6,
      reserveAmmo: 12,
      reloadTime: 2.0,
      spread: 0,
      range: 150,
      automatic: false,
      raysPerShot: 1,
      spreadCone: 0,
    });
  }
}
