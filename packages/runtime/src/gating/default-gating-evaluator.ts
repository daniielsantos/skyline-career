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

    if (rules.blockWhenSlew && snapshot.slewActive) {
      return { allowed: false, reason: 'SLEW_ACTIVE' };
    }

    const minRate = rules.minSimRate ?? 0.9;
    const maxRate = rules.maxSimRate ?? 1.1;

    if (snapshot.simRate < minRate || snapshot.simRate > maxRate) {
      return { allowed: false, reason: 'SIM_RATE_OUT_OF_RANGE' };
    }

    return { allowed: true };
  }
}
