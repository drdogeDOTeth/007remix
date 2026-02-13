import type { State } from '../state-machine';
import type { EnemyBase } from '../../enemy-base';
import type { EnemyManager } from '../../enemy-manager';
import { GameSettings } from '../../../core/game-settings';

/**
 * Idle state: enemy stands at post, slowly looks around.
 * Transitions to 'alert' if player is seen or heard.
 */
export function createIdleState(manager: EnemyManager): State<EnemyBase> {
  let lookTimer = 0;
  let baseFacing = 0;
  let seenPlayerTimer = 0;

  return {
    name: 'idle',

    enter(enemy) {
      lookTimer = 2 + Math.random() * 3;
      baseFacing = enemy.facingAngle;
      enemy.model.play('idle');
    },

    update(enemy, dt) {
      lookTimer -= dt;
      if (lookTimer <= 0) {
        lookTimer = 2 + Math.random() * 3;
        enemy.targetFacingAngle = baseFacing + (Math.random() - 0.5) * 1.2;
      }

      const perception = manager.getPerception(enemy);
      if (!perception) return;

      if (perception.canSeePlayer) {
        seenPlayerTimer += dt;
        enemy.lastKnownPlayerPos = manager.getPlayerPosition().clone();
        if (seenPlayerTimer >= GameSettings.getAISightConfirmDuration()) {
          enemy.stateMachine.transition('attack', enemy);
        }
      } else {
        seenPlayerTimer = 0;
        if (perception.canHearPlayer) {
          enemy.lastKnownPlayerPos = manager.getPlayerPosition().clone();
          enemy.stateMachine.transition('alert', enemy);
        }
      }
    },

    exit() {},
  };
}
