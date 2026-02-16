/**
 * Shared weapon mesh builder — used by player view model, pickups, and enemies.
 * Single source of truth for PP7, KF7 Soviet, Shotgun, and Sniper Rifle geometry.
 */
import * as THREE from 'three';
import { getTextureSetForSkin, cloneTextureWithRepeat } from './weapon-skins';
import type { WeaponSkin, SkinTextureRole, WeaponPartUVScale } from './weapon-skins';
import { createPlasmaAccentMaterial } from './weapon-plasma-material';
import { createSubdividedBox, createSubdividedCylinder } from '../core/geometry-utils';

export type WeaponType = 'pistol' | 'rifle' | 'shotgun' | 'sniper';

/** UV repeat values — 1×1 = no tiling, one texture per face. */
const UV_REPEAT: Record<WeaponPartUVScale, [number, number]> = {
  longMetal: [1, 1],
  cylinderMetal: [1, 1],
  shortMetal: [1, 1],
  longWood: [1, 1],
  shortWood: [1, 1],
  grip: [1, 1],
  scope: [1, 1],
};

function createMaterial(
  skin: WeaponSkin,
  role: SkinTextureRole,
  baseRoughness: number,
  baseMetalness: number,
  uvScale: WeaponPartUVScale,
): THREE.Material {
  const set = getTextureSetForSkin(skin, role);
  const [repeatX, repeatY] = UV_REPEAT[uvScale];

  if (skin === 'plasma' && (role === 'metal' || role === 'metalMid' || role === 'scope')) {
    const map = cloneTextureWithRepeat(set.map, repeatX, repeatY);
    return createPlasmaAccentMaterial(map, new THREE.Color(0x181a20));
  }

  const map = cloneTextureWithRepeat(set.map, repeatX, repeatY);
  let roughnessMap = set.roughnessMap;
  let metalnessMap = set.metalnessMap;
  if (roughnessMap) {
    roughnessMap = roughnessMap.clone();
    roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
    roughnessMap.repeat.set(repeatX, repeatY);
  }
  if (metalnessMap) {
    metalnessMap = metalnessMap.clone();
    metalnessMap.wrapS = metalnessMap.wrapT = THREE.RepeatWrapping;
    metalnessMap.repeat.set(repeatX, repeatY);
  }

  // Only include PBR maps if they exist (avoid THREE.js warnings)
  const matProps: THREE.MeshStandardMaterialParameters = {
    map,
    color: 0xffffff,
    roughness: set.roughnessMap ? 1 : baseRoughness,
    metalness: set.metalnessMap ? 1 : baseMetalness,
  };
  if (roughnessMap) matProps.roughnessMap = roughnessMap;
  if (metalnessMap) matProps.metalnessMap = metalnessMap;

  return new THREE.MeshStandardMaterial(matProps);
}

/** Build the full weapon mesh (player view, pickup, enemy held). */
export function buildWeaponMesh(type: WeaponType, skin: WeaponSkin = 'default'): THREE.Group {
  switch (type) {
    case 'rifle': return buildRifleMesh(skin);
    case 'shotgun': return buildShotgunMesh(skin);
    case 'sniper': return buildSniperMesh(skin);
    default: return buildPistolMesh(skin);
  }
}

function buildPistolMesh(skin: WeaponSkin): THREE.Group {
  const gun = new THREE.Group();
  const longMetalMat = createMaterial(skin, 'metal', 0.3, 0.8, 'longMetal');
  const cylinderMetalMat = createMaterial(skin, 'metal', 0.3, 0.8, 'cylinderMetal');
  const shortMetalMat = createMaterial(skin, 'metal', 0.3, 0.8, 'shortMetal');
  const gripMat = createMaterial(skin, 'grip', 0.8, 0.2, 'grip');
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x181818,
    roughness: 0.5,
    metalness: 0.6,
  });
  const body = new THREE.Mesh(createSubdividedBox(0.046, 0.046, 0.25), longMetalMat);
  body.position.set(0, 0.04, -0.03); gun.add(body);
  const barrel = new THREE.Mesh(createSubdividedCylinder(0.014, 0.014, 0.09, 8), cylinderMetalMat);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.04, -0.2); gun.add(barrel);
  const barrelRing = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.01, 8), shortMetalMat);
  barrelRing.rotation.x = Math.PI / 2; barrelRing.position.set(0, 0.04, -0.245); gun.add(barrelRing);
  const slide = new THREE.Mesh(createSubdividedBox(0.04, 0.034, 0.18), longMetalMat);
  slide.position.set(0, 0.01, 0); gun.add(slide);
  for (let i = 0; i < 4; i++) {
    const serr = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.003, 0.005), accentMat);
    serr.position.set(0, 0.028, -0.09 - i * 0.012); gun.add(serr);
  }
  const ejectionPort = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.015, 0.03), accentMat);
  ejectionPort.position.set(0.024, 0.04, -0.04); gun.add(ejectionPort);
  const triggerGuardBack = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.02), shortMetalMat);
  triggerGuardBack.position.set(0, -0.02, 0.06); gun.add(triggerGuardBack);
  const triggerGuardLeft = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.06), shortMetalMat);
  triggerGuardLeft.position.set(-0.018, -0.035, 0.04); gun.add(triggerGuardLeft);
  const triggerGuardRight = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.06), shortMetalMat);
  triggerGuardRight.position.set(0.018, -0.035, 0.04); gun.add(triggerGuardRight);
  const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.018, 0.006), accentMat);
  trigger.position.set(0, -0.015, 0.02); gun.add(trigger);
  const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.015, 0.015), shortMetalMat);
  frontSight.position.set(0, 0.05, -0.2); gun.add(frontSight);
  const rearSightL = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.01), shortMetalMat);
  rearSightL.position.set(-0.012, 0.04, 0.06); gun.add(rearSightL);
  const rearSightR = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.01), shortMetalMat);
  rearSightR.position.set(0.012, 0.04, 0.06); gun.add(rearSightR);
  const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.015, 0.02), shortMetalMat);
  hammer.position.set(0, 0.025, -0.11); gun.add(hammer);
  const slideStop = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.008, 0.02), accentMat);
  slideStop.position.set(-0.025, 0.02, -0.02); gun.add(slideStop);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.045), gripMat);
  grip.position.set(0, -0.05, 0.04); grip.rotation.x = 0.15; gun.add(grip);
  const screwMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.3, metalness: 0.9 });
  const screwGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.004, 6);
  const screwL = new THREE.Mesh(screwGeo, screwMat);
  screwL.rotation.z = Math.PI / 2; screwL.position.set(-0.022, -0.05, 0.04); gun.add(screwL);
  const screwR = new THREE.Mesh(screwGeo, screwMat);
  screwR.rotation.z = Math.PI / 2; screwR.position.set(0.022, -0.05, 0.04); gun.add(screwR);
  const mag = new THREE.Mesh(createSubdividedBox(0.028, 0.065, 0.032), longMetalMat);
  mag.position.set(0, -0.065, 0.05);
  mag.name = 'reloadMag';
  (mag.userData as Record<string, number>).restY = -0.065;
  gun.add(mag);
  return gun;
}

function buildRifleMesh(skin: WeaponSkin): THREE.Group {
  const gun = new THREE.Group();
  const longMetalMat = createMaterial(skin, 'metalMid', 0.3, 0.7, 'longMetal');
  const cylinderMetalMat = createMaterial(skin, 'metalMid', 0.3, 0.7, 'cylinderMetal');
  const shortMetalMat = createMaterial(skin, 'metalMid', 0.3, 0.7, 'shortMetal');
  const longWoodMat = createMaterial(skin, 'wood', 0.7, 0.1, 'longWood');
  const shortWoodMat = createMaterial(skin, 'wood', 0.7, 0.1, 'shortWood');
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x181818,
    roughness: 0.5,
    metalness: 0.6,
  });
  const receiver = new THREE.Mesh(createSubdividedBox(0.05, 0.055, 0.32), longMetalMat);
  receiver.position.set(0, 0.02, -0.05); gun.add(receiver);
  const barrel = new THREE.Mesh(createSubdividedCylinder(0.013, 0.013, 0.2, 8), cylinderMetalMat);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.03, -0.32); gun.add(barrel);
  const muzzleRing = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.008, 8), shortMetalMat);
  muzzleRing.rotation.x = Math.PI / 2; muzzleRing.position.set(0, 0.03, -0.42); gun.add(muzzleRing);
  const handguard = new THREE.Mesh(createSubdividedBox(0.035, 0.035, 0.15), longMetalMat);
  handguard.position.set(0, 0.03, -0.25); gun.add(handguard);
  for (let i = 0; i < 3; i++) {
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.037, 0.004, 0.018), accentMat);
    slot.position.set(0, 0.048, -0.21 - i * 0.035); gun.add(slot);
  }
  const ejectionPort = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.02, 0.035), accentMat);
  ejectionPort.position.set(0.027, 0.025, -0.08); gun.add(ejectionPort);
  const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.02), shortMetalMat);
  frontSight.position.set(0, 0.045, -0.4); gun.add(frontSight);
  const frontSightEarL = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.008, 0.012), shortMetalMat);
  frontSightEarL.position.set(-0.008, 0.042, -0.4); gun.add(frontSightEarL);
  const frontSightEarR = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.008, 0.012), shortMetalMat);
  frontSightEarR.position.set(0.008, 0.042, -0.4); gun.add(frontSightEarR);
  const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.015, 0.015), shortMetalMat);
  rearSight.position.set(0, 0.045, -0.2); gun.add(rearSight);
  const chargingHandle = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.01, 0.04), shortMetalMat);
  chargingHandle.position.set(0.03, 0.045, -0.08); gun.add(chargingHandle);
  const triggerGuard = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.035, 0.06), shortMetalMat);
  triggerGuard.position.set(0, -0.045, 0.02); gun.add(triggerGuard);
  const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.016, 0.006), accentMat);
  trigger.position.set(0, -0.032, 0.01); gun.add(trigger);
  const pinGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.004, 6);
  const pinMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.3, metalness: 0.9 });
  const pin1 = new THREE.Mesh(pinGeo, pinMat);
  pin1.rotation.z = Math.PI / 2; pin1.position.set(-0.027, 0.02, -0.03); gun.add(pin1);
  const pin2 = new THREE.Mesh(pinGeo, pinMat);
  pin2.rotation.z = Math.PI / 2; pin2.position.set(-0.027, 0.02, 0.06); gun.add(pin2);
  const buttPlate = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.05, 0.02), shortMetalMat);
  buttPlate.position.set(0, -0.01, 0.26); gun.add(buttPlate);
  const mag = new THREE.Mesh(createSubdividedBox(0.032, 0.085, 0.042), longMetalMat);
  mag.position.set(0, -0.045, -0.02);
  mag.name = 'reloadMag';
  (mag.userData as Record<string, number>).restY = -0.045;
  gun.add(mag);
  const stock = new THREE.Mesh(createSubdividedBox(0.042, 0.055, 0.14), longWoodMat);
  stock.position.set(0, -0.01, 0.15); gun.add(stock);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.075, 0.038), shortWoodMat);
  grip.position.set(0, -0.045, 0.05); grip.rotation.x = 0.2; gun.add(grip);
  return gun;
}

function buildShotgunMesh(skin: WeaponSkin): THREE.Group {
  const gun = new THREE.Group();
  const longMetalMat = createMaterial(skin, 'metal', 0.3, 0.8, 'longMetal');
  const cylinderMetalMat = createMaterial(skin, 'metal', 0.3, 0.8, 'cylinderMetal');
  const shortMetalMat = createMaterial(skin, 'metal', 0.3, 0.8, 'shortMetal');
  const longWoodMat = createMaterial(skin, 'woodMid', 0.6, 0.1, 'longWood');
  const shortWoodMat = createMaterial(skin, 'woodMid', 0.6, 0.1, 'shortWood');
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x181818,
    roughness: 0.5,
    metalness: 0.6,
  });
  const barrel = new THREE.Mesh(createSubdividedCylinder(0.024, 0.024, 0.4, 8), cylinderMetalMat);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.03, -0.2); gun.add(barrel);
  const muzzleRing = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.01, 8), shortMetalMat);
  muzzleRing.rotation.x = Math.PI / 2; muzzleRing.position.set(0, 0.03, -0.4); gun.add(muzzleRing);
  const magTube = new THREE.Mesh(createSubdividedCylinder(0.012, 0.012, 0.32, 8), cylinderMetalMat);
  magTube.rotation.x = Math.PI / 2; magTube.position.set(0, -0.02, -0.15); gun.add(magTube);
  const tubeCap = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.012, 8), shortMetalMat);
  tubeCap.rotation.x = Math.PI / 2; tubeCap.position.set(0, -0.02, -0.31); gun.add(tubeCap);
  const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.06, 0.012), shortMetalMat);
  clamp.position.set(0, 0.005, -0.28); gun.add(clamp);
  const beadSight = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 6), shortMetalMat);
  beadSight.position.set(0, 0.04, -0.38); gun.add(beadSight);
  const triggerGuard = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.07), shortMetalMat);
  triggerGuard.position.set(0, -0.045, 0.08); gun.add(triggerGuard);
  const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.016, 0.006), accentMat);
  trigger.position.set(0, -0.03, 0.065); gun.add(trigger);
  const pump = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.04, 0.1), shortWoodMat);
  pump.position.set(0, 0.0, -0.15); gun.add(pump);
  for (let i = 0; i < 5; i++) {
    const groove = new THREE.Mesh(new THREE.BoxGeometry(0.047, 0.002, 0.008), accentMat);
    groove.position.set(0, 0.021, -0.17 + i * 0.02); gun.add(groove);
  }
  const ejectionPort = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.025, 0.04), accentMat);
  ejectionPort.position.set(0.03, 0.015, 0.04); gun.add(ejectionPort);
  const receiver = new THREE.Mesh(createSubdividedBox(0.055, 0.065, 0.15), longMetalMat);
  receiver.position.set(0, 0.01, 0.05); gun.add(receiver);
  const safety = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.006, 6), accentMat);
  safety.position.set(0, 0.045, 0.09); gun.add(safety);
  const stock = new THREE.Mesh(createSubdividedBox(0.042, 0.058, 0.18), longWoodMat);
  stock.position.set(0, -0.005, 0.2); gun.add(stock);
  const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.06, 0.008), accentMat);
  buttPad.position.set(0, -0.005, 0.292); gun.add(buttPad);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.075, 0.038), shortWoodMat);
  grip.position.set(0, -0.045, 0.08); grip.rotation.x = 0.15; gun.add(grip);
  const shellMat = new THREE.MeshStandardMaterial({
    map: cloneTextureWithRepeat(getTextureSetForSkin(skin, 'metal').map, 1, 1),
    color: 0xcc8833,
    roughness: 0.6,
    metalness: 0.3,
  });
  const shellTubeZ = [-0.22, -0.18, -0.14, -0.10, -0.06];
  for (let i = 0; i < 5; i++) {
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.04, 8), shellMat);
    shell.rotation.x = Math.PI / 2;
    shell.position.set(0, -0.01, shellTubeZ[i]);
    shell.name = `reloadShell${i + 1}`;
    (shell.userData as Record<string, number>).restZ = shellTubeZ[i];
    gun.add(shell);
  }
  return gun;
}

function buildSniperMesh(skin: WeaponSkin): THREE.Group {
  const gun = new THREE.Group();
  const longMetalMat = createMaterial(skin, 'metal', 0.3, 0.8, 'longMetal');
  const cylinderMetalMat = createMaterial(skin, 'metal', 0.3, 0.8, 'cylinderMetal');
  const shortMetalMat = createMaterial(skin, 'metal', 0.3, 0.8, 'shortMetal');
  const scopeMat = createMaterial(skin, 'scope', 0.2, 0.9, 'scope');
  const longWoodMat = createMaterial(skin, 'woodDark', 0.6, 0.1, 'longWood');
  const shortWoodMat = createMaterial(skin, 'woodDark', 0.6, 0.1, 'shortWood');
  const barrel = new THREE.Mesh(createSubdividedCylinder(0.013, 0.016, 0.45, 8), cylinderMetalMat);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.03, -0.25); gun.add(barrel);
  const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.018, 0.04, 8), shortMetalMat);
  muzzleBrake.rotation.x = Math.PI / 2; muzzleBrake.position.set(0, 0.03, -0.48); gun.add(muzzleBrake);
  const receiver = new THREE.Mesh(createSubdividedBox(0.042, 0.052, 0.2), longMetalMat);
  receiver.position.set(0, 0.02, 0); gun.add(receiver);
  const scope = new THREE.Mesh(createSubdividedCylinder(0.02, 0.02, 0.12, 8), scopeMat);
  scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.07, -0.02); gun.add(scope);
  const scopeRingFront = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.015, 8), shortMetalMat);
  scopeRingFront.rotation.x = Math.PI / 2; scopeRingFront.position.set(0, 0.07, -0.06); gun.add(scopeRingFront);
  const scopeRingRear = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.015, 8), shortMetalMat);
  scopeRingRear.rotation.x = Math.PI / 2; scopeRingRear.position.set(0, 0.07, 0.02); gun.add(scopeRingRear);
  const stock = new THREE.Mesh(createSubdividedBox(0.042, 0.058, 0.2), longWoodMat);
  stock.position.set(0, 0, 0.2); gun.add(stock);
  const cheekRest = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.08), shortWoodMat);
  cheekRest.position.set(0, 0.035, 0.15); gun.add(cheekRest);
  const triggerGuard = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.032, 0.055), shortMetalMat);
  triggerGuard.position.set(0, -0.042, 0.04); gun.add(triggerGuard);
  const boltKnob = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 6), shortMetalMat);
  boltKnob.position.set(0.03, 0.035, 0.02); gun.add(boltKnob);
  const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.025, 6), shortMetalMat);
  bolt.position.set(0.025, 0.03, 0.02); gun.add(bolt);
  const mag = new THREE.Mesh(createSubdividedBox(0.03, 0.075, 0.036), longMetalMat);
  mag.position.set(0, -0.038, -0.02);
  mag.name = 'reloadMag';
  (mag.userData as Record<string, number>).restY = -0.038;
  gun.add(mag);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.075, 0.038), shortWoodMat);
  grip.position.set(0, -0.045, 0.06); grip.rotation.x = 0.15; gun.add(grip);
  return gun;
}
