import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from '../../core/physics-world';
import type { EnemyBase } from '../enemy-base';
import { GameSettings } from '../../core/game-settings';

export interface PerceptionResult {
  canSeePlayer: boolean;
  canHearPlayer: boolean;
  distanceToPlayer: number;
  directionToPlayer: THREE.Vector3;
}

/**
 * Checks whether an enemy can see or hear the player.
 * Uses Rapier raycasting for line-of-sight and distance for hearing.
 * Respects GameSettings for sight range, FOV, hearing range, and playerTargetable.
 */
export function perceivePlayer(
  enemy: EnemyBase,
  playerPos: THREE.Vector3,
  playerCollider: RAPIER.Collider,
  physics: PhysicsWorld,
  playerIsMoving: boolean,
  playerFiredRecently: boolean,
  playerTargetable: boolean,
): PerceptionResult {
  const enemyPos = enemy.getHeadPosition();
  const toPlayer = new THREE.Vector3().subVectors(playerPos, enemyPos);
  const distance = toPlayer.length();
  const directionToPlayer = toPlayer.clone().normalize();

  const sightRange = GameSettings.getAISightRange();
  const fovHalfAngle = GameSettings.getAIFovHalfAngle();
  const hearingGunshot = GameSettings.getAIHearingGunshotRange();
  const hearingFootstep = GameSettings.getAIHearingFootstepRange();

  let canSeePlayer = false;
  let canHearPlayer = false;

  if (!playerTargetable) {
    return {
      canSeePlayer: false,
      canHearPlayer: false,
      distanceToPlayer: distance,
      directionToPlayer,
    };
  }

  if (distance <= sightRange) {
    const enemyForward = enemy.getForwardDirection();
    const angle = enemyForward.angleTo(directionToPlayer);

    if (angle <= fovHalfAngle) {
      // Raycast to check for walls between enemy and player (exclude enemy's own collider)
      const hit = physics.castRay(
        enemyPos.x, enemyPos.y, enemyPos.z,
        directionToPlayer.x, directionToPlayer.y, directionToPlayer.z,
        distance + 0.5,
        enemy.collider,
      );

      if (hit) {
        // Clear LOS if we hit the player, or something at/beyond player distance (edge case)
        const hitDist = hit.toi;
        if (hit.collider.handle === playerCollider.handle) {
          canSeePlayer = true;
        } else if (hitDist >= distance - 0.5) {
          canSeePlayer = true;
        }
      } else {
        // No hit means nothing in the way (unlikely in enclosed space)
        canSeePlayer = true;
      }
    }
  }

  if (playerFiredRecently && distance <= hearingGunshot) {
    canHearPlayer = true;
  } else if (playerIsMoving && distance <= hearingFootstep) {
    canHearPlayer = true;
  }

  return {
    canSeePlayer,
    canHearPlayer,
    distanceToPlayer: distance,
    directionToPlayer,
  };
}
