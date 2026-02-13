import * as THREE from 'three';
import type { State } from '../state-machine';
import type { EnemyBase } from '../../enemy-base';
import type { EnemyManager } from '../../enemy-manager';
import { GameSettings } from '../../../core/game-settings';

const ALERT_DURATION = 2.0;
const MOVE_SPEED = 2.5;

/**
 * Alert state: enemy heard something or was alerted by a nearby guard.
 * Turns toward the sound, moves toward last known position.
 * Transitions to 'attack' if player is spotted, or back to 'idle' after timeout.
 */
export function createAlertState(manager: EnemyManager): State<EnemyBase> {
  let timer = 0;
  let seenPlayerTimer = 0;

  return {
    name: 'alert',

    enter(enemy) {
      timer = ALERT_DURATION;
      enemy.model.play('alert');
      if (enemy.lastKnownPlayerPos) {
        enemy.lookAt(enemy.lastKnownPlayerPos);
      }
      manager.propagateAlert(enemy);
    },

    update(enemy, dt) {
      timer -= dt;

      const perception = manager.getPerception(enemy);
      if (perception?.canSeePlayer) {
        seenPlayerTimer += dt;
        enemy.lastKnownPlayerPos = manager.getPlayerPosition().clone();
        if (seenPlayerTimer >= GameSettings.getAISightConfirmDuration()) {
          enemy.stateMachine.transition('attack', enemy);
          return;
        }
      } else {
        seenPlayerTimer = 0;
      }

      // Move toward last known position
      if (enemy.lastKnownPlayerPos) {
        const pos = enemy.group.position;
        const dir = new THREE.Vector3()
          .subVectors(enemy.lastKnownPlayerPos, pos);
        dir.y = 0;
        const dist = dir.length();

        if (dist > 1) {
          enemy.model.play('walk');  // show walk animation when moving
          dir.normalize();
          enemy.lookAt(enemy.lastKnownPlayerPos);

          // Move with separation from other enemies
          const repulsion = manager.getRepulsionForce(enemy);
          pos.x += (dir.x + repulsion.x * 0.8) * MOVE_SPEED * dt;
          pos.z += (dir.z + repulsion.z * 0.8) * MOVE_SPEED * dt;

          // Sync physics body
          manager.syncPhysicsBody(enemy);
        } else {
          enemy.model.play('alert');  // alert pose when stopped
          // Reached last known position, look around
          enemy.targetFacingAngle += dt * 2;
        }
      }

      // Timeout — go back to idle
      if (timer <= 0) {
        enemy.stateMachine.transition('idle', enemy);
      }

      if (perception?.canHearPlayer) {
        enemy.lastKnownPlayerPos = manager.getPlayerPosition().clone();
        timer = ALERT_DURATION; // Reset timer
      }
    },

    exit() {},
  };
}
