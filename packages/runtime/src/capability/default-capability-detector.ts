import type { AircraftProfile } from '@msfs-compat/shared';
import type { CapabilityDetector, CapabilityScore, SimBridge } from '../types.js';

export class DefaultCapabilityDetector implements CapabilityDetector {
  async detect(profile: AircraftProfile, bridge: SimBridge): Promise<CapabilityScore[]> {
    const scores: CapabilityScore[] = [];

    if (profile.capabilities.includes('simconnect')) {
      scores.push({
        strategy: 'simconnect-direct',
        score: profile.fuel.strategy === 'simconnect-direct' ? 0.9 : 0.6,
        reasons: ['Profile declares simconnect capability'],
      });
    }

    if (profile.capabilities.includes('lvar') || profile.capabilities.includes('hvar')) {
      scores.push({
        strategy: 'hybrid-sync',
        score: profile.fuel.strategy === 'hybrid-sync' ? 0.95 : 0.7,
        reasons: ['Profile declares lvar/hvar bridge'],
      });
    }

    if (profile.fuel.strategy === 'vendor-specific') {
      scores.push({
        strategy: 'vendor-specific',
        score: 0.85,
        reasons: ['Profile requires vendor-specific adapter'],
      });
    }

    const snapshot = await bridge.snapshot();
    if (snapshot.vars && Object.keys(snapshot.vars).length > 0) {
      scores.push({
        strategy: 'runtime-snapshot',
        score: 0.5,
        reasons: ['Runtime snapshot available for verification'],
      });
    }

    return scores.sort((a, b) => b.score - a.score);
  }
}
