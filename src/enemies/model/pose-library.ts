/**
 * Animation pose definitions for low-poly 3D enemy models.
 * Each animation is a sequence of keyframe poses that get interpolated.
 */

export type AnimationName = 'idle' | 'alert' | 'shoot' | 'hit' | 'death' | 'walk';

/** Joint rotation values (radians). Undefined = 0 (neutral). */
export interface Pose {
  // Core body
  hipsY?: number;        // vertical offset (for crouching / death collapse)
  torsoX?: number;       // lean forward/back
  torsoZ?: number;       // lean left/right
  headX?: number;        // nod
  headY?: number;        // turn
  headZ?: number;        // tilt
  // Arms (rotation around X = forward/back swing, Z = in/out spread)
  leftShoulderX?: number;
  leftShoulderZ?: number;
  rightShoulderX?: number;
  rightShoulderZ?: number;
  leftElbowX?: number;
  rightElbowX?: number;
  // Legs (rotation around X = forward/back swing)
  leftHipX?: number;
  rightHipX?: number;
  leftKneeX?: number;
  rightKneeX?: number;
}

export interface PoseKeyframe {
  pose: Pose;
  duration: number; // seconds to transition TO this pose
}

export interface AnimationDef {
  keyframes: PoseKeyframe[];
  loop: boolean;
}

// ─── Animation Definitions ───

const IDLE: AnimationDef = {
  loop: true,
  keyframes: [
    {
      duration: 1.0,
      pose: {
        leftShoulderX: 0.05,
        rightShoulderX: 0.05,
        leftShoulderZ: -0.08,
        rightShoulderZ: 0.08,
      },
    },
    {
      duration: 1.0,
      pose: {
        torsoX: -0.02,
        headZ: 0.03,
        leftShoulderX: -0.03,
        rightShoulderX: -0.03,
        leftShoulderZ: -0.1,
        rightShoulderZ: 0.1,
      },
    },
  ],
};

const WALK: AnimationDef = {
  loop: true,
  keyframes: [
    {
      // Right leg forward, left arm forward
      duration: 0.15,
      pose: {
        leftShoulderX: -0.4,
        rightShoulderX: 0.3,
        leftShoulderZ: -0.06,
        rightShoulderZ: 0.06,
        leftElbowX: -0.2,
        rightElbowX: -0.3,
        leftHipX: 0.3,
        rightHipX: -0.5,
        leftKneeX: 0.1,
        rightKneeX: 0.5,
      },
    },
    {
      // Pass through center
      duration: 0.15,
      pose: {
        leftShoulderX: 0,
        rightShoulderX: 0,
        leftShoulderZ: -0.06,
        rightShoulderZ: 0.06,
        leftElbowX: -0.15,
        rightElbowX: -0.15,
        leftHipX: 0,
        rightHipX: 0,
        leftKneeX: 0.15,
        rightKneeX: 0.15,
      },
    },
    {
      // Left leg forward, right arm forward
      duration: 0.15,
      pose: {
        leftShoulderX: 0.3,
        rightShoulderX: -0.4,
        leftShoulderZ: -0.06,
        rightShoulderZ: 0.06,
        leftElbowX: -0.3,
        rightElbowX: -0.2,
        leftHipX: -0.5,
        rightHipX: 0.3,
        leftKneeX: 0.5,
        rightKneeX: 0.1,
      },
    },
    {
      // Pass through center
      duration: 0.15,
      pose: {
        leftShoulderX: 0,
        rightShoulderX: 0,
        leftShoulderZ: -0.06,
        rightShoulderZ: 0.06,
        leftElbowX: -0.15,
        rightElbowX: -0.15,
        leftHipX: 0,
        rightHipX: 0,
        leftKneeX: 0.15,
        rightKneeX: 0.15,
      },
    },
  ],
};

const ALERT: AnimationDef = {
  loop: true,
  keyframes: [
    {
      duration: 0.5,
      pose: {
        torsoX: -0.08,
        hipsY: -0.05,
        // Right arm raised holding weapon
        rightShoulderX: -0.9,
        rightShoulderZ: 0.1,
        rightElbowX: -0.9,
        // Left arm slightly up
        leftShoulderX: -0.35,
        leftShoulderZ: -0.15,
        leftElbowX: -0.4,
        // Slight stance
        leftHipX: -0.1,
        rightHipX: 0.05,
        leftKneeX: 0.15,
        rightKneeX: 0.1,
      },
    },
    {
      duration: 0.5,
      pose: {
        torsoX: -0.1,
        headY: 0.1,
        hipsY: -0.05,
        rightShoulderX: -0.85,
        rightShoulderZ: 0.12,
        rightElbowX: -0.85,
        leftShoulderX: -0.3,
        leftShoulderZ: -0.12,
        leftElbowX: -0.35,
        leftHipX: -0.08,
        rightHipX: 0.08,
        leftKneeX: 0.12,
        rightKneeX: 0.12,
      },
    },
  ],
};

const SHOOT: AnimationDef = {
  loop: true,
  keyframes: [
    {
      // Arms extended — firing
      duration: 0.12,
      pose: {
        torsoX: -0.1,
        hipsY: -0.03,
        // Both arms forward — aiming weapon
        rightShoulderX: -1.35,
        rightShoulderZ: 0.05,
        rightElbowX: -0.15,
        leftShoulderX: -1.25,
        leftShoulderZ: -0.05,
        leftElbowX: -0.15,
        // Combat stance
        leftHipX: -0.1,
        rightHipX: 0.08,
        leftKneeX: 0.15,
        rightKneeX: 0.1,
      },
    },
    {
      // Recoil
      duration: 0.12,
      pose: {
        torsoX: -0.06,
        hipsY: -0.03,
        rightShoulderX: -1.2,
        rightShoulderZ: 0.08,
        rightElbowX: -0.25,
        leftShoulderX: -1.15,
        leftShoulderZ: -0.08,
        leftElbowX: -0.25,
        leftHipX: -0.1,
        rightHipX: 0.08,
        leftKneeX: 0.15,
        rightKneeX: 0.1,
      },
    },
  ],
};

const HIT: AnimationDef = {
  loop: false,
  keyframes: [
    {
      // Stagger backward
      duration: 0.15,
      pose: {
        torsoX: 0.25,
        torsoZ: 0.15,
        headX: 0.15,
        leftShoulderX: 0.3,
        leftShoulderZ: -0.5,
        rightShoulderX: 0.3,
        rightShoulderZ: 0.5,
        leftElbowX: -0.2,
        rightElbowX: -0.2,
        leftHipX: -0.15,
        rightHipX: -0.1,
        leftKneeX: 0.2,
        rightKneeX: 0.15,
      },
    },
    {
      // Partial recovery
      duration: 0.2,
      pose: {
        torsoX: 0.08,
        torsoZ: 0.05,
        leftShoulderX: 0.1,
        leftShoulderZ: -0.15,
        rightShoulderX: 0.1,
        rightShoulderZ: 0.15,
      },
    },
  ],
};

const DEATH: AnimationDef = {
  loop: false,
  keyframes: [
    {
      // Clutch chest
      duration: 0.3,
      pose: {
        torsoX: 0.1,
        // Arms cross inward over chest
        leftShoulderX: -0.6,
        leftShoulderZ: 0.5,
        leftElbowX: -1.0,
        rightShoulderX: -0.6,
        rightShoulderZ: -0.5,
        rightElbowX: -1.0,
        headX: 0.2,
      },
    },
    {
      // Fall backward
      duration: 0.5,
      pose: {
        hipsY: -0.3,
        torsoX: 0.6,
        headX: 0.4,
        // Arms flung out
        leftShoulderX: 0.3,
        leftShoulderZ: -0.6,
        leftElbowX: -0.3,
        rightShoulderX: 0.3,
        rightShoulderZ: 0.6,
        rightElbowX: -0.3,
        // Legs buckle
        leftHipX: -0.4,
        rightHipX: -0.3,
        leftKneeX: 0.8,
        rightKneeX: 0.6,
      },
    },
    {
      // Collapsed on ground
      duration: 0.7,
      pose: {
        hipsY: -0.7,
        torsoX: 1.2,
        headX: 0.5,
        leftShoulderX: 0.5,
        leftShoulderZ: -0.8,
        leftElbowX: -0.1,
        rightShoulderX: 0.4,
        rightShoulderZ: 0.7,
        rightElbowX: -0.1,
        leftHipX: -0.5,
        rightHipX: -0.4,
        leftKneeX: 1.0,
        rightKneeX: 0.8,
      },
    },
  ],
};

export const ANIMATIONS: Record<AnimationName, AnimationDef> = {
  idle: IDLE,
  walk: WALK,
  alert: ALERT,
  shoot: SHOOT,
  hit: HIT,
  death: DEATH,
};
