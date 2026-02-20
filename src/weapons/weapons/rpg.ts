import { WeaponBase } from '../weapon-base';

export class RPG extends WeaponBase {
  constructor() {
    super({
      name: 'RPG-7',
      damage: 120,
      fireRate: 0.5,      // 1 shot per 2 seconds
      maxAmmo: 1,
      reserveAmmo: 4,
      reloadTime: 3.0,
      spread: 0,
      range: 200,
      automatic: false,
      raysPerShot: 1,
      spreadCone: 0,
    });
  }
}
