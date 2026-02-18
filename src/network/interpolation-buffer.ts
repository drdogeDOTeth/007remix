import { PlayerStateUpdate } from './network-events';

/**
 * Snapshot stored in interpolation buffer.
 */
interface Snapshot {
  timestamp: number;
  state: PlayerStateUpdate;
}

/**
 * InterpolationBuffer stores recent state snapshots and interpolates between them
 * to provide smooth movement for remote players despite network updates arriving at ~20Hz.
 *
 * By rendering remote players 100ms behind real-time, we ensure smooth interpolation
 * between snapshots without jitter from network variability.
 */
export class InterpolationBuffer {
  private snapshots: Snapshot[] = [];
  private interpolationDelay: number; // ms
  private baseTime: number = 0; // Base time offset

  /**
   * @param interpolationDelay How far behind real-time to render (default: 100ms)
   */
  constructor(interpolationDelay: number = 100) {
    this.interpolationDelay = interpolationDelay;
  }

  /**
   * Add a new state snapshot to the buffer.
   * @param timestamp Server timestamp (performance.now())
   * @param state Player state at this timestamp
   */
  addSnapshot(timestamp: number, state: PlayerStateUpdate): void {
    // Use local performance.now() for consistent timing
    const localTimestamp = performance.now();

    this.snapshots.push({ timestamp: localTimestamp, state });

    // Keep only last 10 snapshots (500ms of history for better interpolation)
    if (this.snapshots.length > 10) {
      this.snapshots.shift();
    }
  }

  /**
   * Get interpolated state at the given render time.
   * Returns null if not enough snapshots available.
   * @param renderTime Current time (performance.now())
   */
  getInterpolatedState(renderTime: number): PlayerStateUpdate | null {
    if (this.snapshots.length === 0) {
      return null;
    }

    if (this.snapshots.length === 1) {
      // Only one snapshot, return it as-is
      return this.snapshots[0].state;
    }

    // Target time is renderTime minus interpolation delay
    const targetTime = renderTime - this.interpolationDelay;

    // Find two snapshots to interpolate between
    let from: Snapshot | null = null;
    let to: Snapshot | null = null;

    for (let i = 0; i < this.snapshots.length - 1; i++) {
      if (
        this.snapshots[i].timestamp <= targetTime &&
        this.snapshots[i + 1].timestamp >= targetTime
      ) {
        from = this.snapshots[i];
        to = this.snapshots[i + 1];
        break;
      }
    }

    // If target time is ahead of all snapshots, extrapolate from last two
    if (!from && !to && targetTime > this.snapshots[this.snapshots.length - 1].timestamp) {
      from = this.snapshots[this.snapshots.length - 2];
      to = this.snapshots[this.snapshots.length - 1];
    }

    // If target time is before all snapshots, use first two
    if (!from && !to && targetTime < this.snapshots[0].timestamp) {
      from = this.snapshots[0];
      to = this.snapshots[1];
    }

    // Fallback: use two most recent
    if (!from || !to) {
      from = this.snapshots[this.snapshots.length - 2];
      to = this.snapshots[this.snapshots.length - 1];
    }

    // Calculate interpolation factor (0 to 1)
    const duration = to.timestamp - from.timestamp;
    const elapsed = targetTime - from.timestamp;
    let t = duration > 0 ? elapsed / duration : 0;

    // Clamp t to 1.0 — extrapolation causes visual/hitbox drift over time
    t = Math.max(0, Math.min(1, t));

    // Linearly interpolate position and rotation
    return {
      playerId: from.state.playerId,
      position: {
        x: this.lerp(from.state.position.x, to.state.position.x, t),
        y: this.lerp(from.state.position.y, to.state.position.y, t),
        z: this.lerp(from.state.position.z, to.state.position.z, t),
      },
      rotation: this.lerpAngle(from.state.rotation, to.state.rotation, t),
      health: to.state.health, // Don't interpolate discrete values
      armor: to.state.armor,
      currentWeapon: to.state.currentWeapon,
      crouching: to.state.crouching,
      isMoving: to.state.isMoving,
      timestamp: targetTime,
    };
  }

  /**
   * Inject a rotation update (e.g. from weapon fire direction) so interpolation
   * uses it immediately. Adds a snapshot with latest position but new rotation.
   */
  injectRotation(localTimestamp: number, rotation: number): void {
    if (this.snapshots.length === 0) return;
    const latest = this.snapshots[this.snapshots.length - 1].state;
    const injected: PlayerStateUpdate = {
      ...latest,
      rotation,
      timestamp: localTimestamp,
    };
    this.snapshots.push({ timestamp: localTimestamp, state: injected });
    if (this.snapshots.length > 10) this.snapshots.shift();
  }

  /**
   * Clear all snapshots in the buffer.
   */
  clear(): void {
    this.snapshots = [];
  }

  /**
   * Linear interpolation between two values.
   */
  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  /**
   * Linear interpolation for angles (handles wrapping at 2π).
   */
  private lerpAngle(a: number, b: number, t: number): number {
    // Normalize angles to [0, 2π]
    a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    b = ((b % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

    // Take shortest path
    let diff = b - a;
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;

    return a + diff * t;
  }
}
