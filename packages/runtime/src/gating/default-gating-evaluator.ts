import type { GatingRules } from '@msfs-compat/shared';
import type { GatingEvaluator, SimSnapshot } from '../types.js';

export class DefaultGatingEvaluator implements GatingEvaluator {
  evaluate(rules: GatingRules, snapshot: SimSnapshot): { allowed: boolean; reason?: string } {
    if (rules.requireOnGround && !snapshot.onGround) {
      return { allowed: false, reason: 'AIRCRAFT_NOT_ON_GROUND' };
    }

    if (rules.requireEnginesOff && snapshot.enginesRunning) {
      return { allowed: false, reason: 'ENGINES_MUST_BE_OFF' };
    }

    if (rules.requireParkingBrake && !snapshot.parkingBrake) {
      return { allowed: false, reason: 'PARKING_BRAKE_REQUIRED' };
    }

    if (rules.blockWhenPaused && snapshot.paused) {
      return { allowed: false, reason: 'SIM_PAUSED' };
    }

    // Intentionally ignore blockWhenSlew, minSimRate, maxSimRate.
    // Career does not use slew/accel as product gates; MSFS 2024 Host does not
    // even pack IS SLEW ACTIVE (alignment), and SIMULATION RATE often reports
    // 0 / garbage that false-failed inject.

    return { allowed: true };
  }
}
