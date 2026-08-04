import type { AircraftProfile } from '@msfs-compat/shared';

/**
 * Smoke payload: fill the first few *profile* stations (sorted by index).
 * Avoids magic indices 1/3/5 that skip empty seats on Accu-Sim layouts.
 * Samples are clamped to each station's maxLoad so a bad CFG default (e.g.
 * pilot maxLoad=170) cannot abort the whole write via STATION_OVER_MAX.
 */
export function buildSmokeStationTargets(profile: AircraftProfile): Record<number, number> {
  const targets: Record<number, number> = {};
  for (const station of profile.payload.stations) {
    targets[station.index] = 0;
  }
  const ordered = [...profile.payload.stations].sort((a, b) => a.index - b.index);
  const samples = [180, 50, 25];
  for (let i = 0; i < Math.min(samples.length, ordered.length); i++) {
    const station = ordered[i]!;
    const sample = samples[i]!;
    const max =
      typeof station.maxLoad === 'number' && station.maxLoad > 0
        ? station.maxLoad
        : sample;
    targets[station.index] = Math.min(sample, max);
  }
  return targets;
}
