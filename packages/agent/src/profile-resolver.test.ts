import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AircraftProfile } from '@msfs-compat/shared';
import { resolveProfile } from './profile-resolver.js';
import type { LoadedProfile } from './profile-registry.js';

function saabProfile(overrides: Partial<AircraftProfile['match']> = {}): LoadedProfile {
  const profile = {
    schemaVersion: '1.0.0' as const,
    profileId: 'carenado-saab-340-cargo',
    profileKey: 'carenado/saab-340-cargo',
    semver: '1.0.0',
    match: {
      fingerprint: 'a'.repeat(64),
      title: 'Saab 340 Cargo',
      publisher: 'carenado',
      icao: 'SF34',
      ...overrides,
    },
    capabilities: ['simconnect' as const],
    gating: {
      requireOnGround: true,
      requireEnginesOff: false,
      blockWhenPaused: true,
      blockWhenSlew: true,
      minSimRate: 0.9,
      maxSimRate: 1.1,
    },
    fuel: {
      strategy: 'simconnect-direct' as const,
      unit: 'gallons' as const,
      tanks: [],
      writePlan: [],
      verify: { timeoutMs: 1, pollIntervalMs: 1, checks: [] },
    },
    payload: {
      strategy: 'station-writeback' as const,
      stations: [],
      writePlan: [],
      verify: { timeoutMs: 1, pollIntervalMs: 1, checks: [] },
    },
  } satisfies AircraftProfile;
  return { path: 'profiles/examples/carenado-saab-340-cargo.json', profile };
}

describe('resolveProfile Saab live title', () => {
  it('matches 340 Cargo - Loaded to Saab 340 Cargo via title tokens', () => {
    const result = resolveProfile(
      {
        title: '340 Cargo - Loaded',
        publisher: 'carenado',
        icao: '$$:S340B',
        atcModel: '$$:S340B',
      },
      [saabProfile()],
    );
    assert.equal(result.matched, true);
    assert.ok(result.confidence >= 0.9);
    assert.equal(result.profile?.profileKey, 'carenado/saab-340-cargo');
  });

  it('matches via liveTitles fingerprint when titles differ', () => {
    const fp = 'b'.repeat(64);
    const result = resolveProfile(
      {
        title: '340 Cargo - Loaded',
        publisher: 'carenado',
      },
      [
        saabProfile({
          fingerprint: fp,
          liveTitles: ['340 Cargo - Loaded'],
        }),
      ],
      { fingerprint: fp },
    );
    assert.equal(result.matched, true);
    assert.equal(result.reason, 'exact_fingerprint');
  });
});

describe('resolveProfile NextGenSim Bandeirante variants', () => {
  function bandeiranteProfile(
    profileKey: string,
    title: string,
    fingerprint: string,
  ): LoadedProfile {
    const profile = {
      schemaVersion: '1.0.0' as const,
      profileId: profileKey.replace(/\//g, '-'),
      profileKey,
      semver: '1.0.0',
      match: {
        fingerprint,
        title,
        publisher: 'nextgensim',
        icao: 'E110',
        liveTitles: [title],
      },
      capabilities: ['simconnect' as const],
      gating: {
        requireOnGround: true,
        requireEnginesOff: false,
        blockWhenPaused: true,
        blockWhenSlew: true,
        minSimRate: 0.9,
        maxSimRate: 1.1,
      },
      fuel: {
        strategy: 'simconnect-direct' as const,
        unit: 'gallons' as const,
        tanks: [],
        writePlan: [],
        verify: { timeoutMs: 1, pollIntervalMs: 1, checks: [] },
      },
      payload: {
        strategy: 'station-writeback' as const,
        stations: [],
        writePlan: [],
        verify: { timeoutMs: 1, pollIntervalMs: 1, checks: [] },
      },
    } satisfies AircraftProfile;
    return {
      path: `profiles/examples/${profile.profileId}.json`,
      profile,
    };
  }

  it('does not resolve EMB-110P to an EMB-110P1F profile', () => {
    const result = resolveProfile(
      {
        title: 'NextGenSim EMB-110P Bandeirante',
        publisher: 'nextgensim',
        icao: 'E110',
      },
      [
        bandeiranteProfile(
          'nextgensim/emb-110p1f-bandeirante',
          'NextGenSim EMB-110P1F Bandeirante',
          '1'.repeat(64),
        ),
        bandeiranteProfile(
          'nextgensim/emb-110p1-bandeirante',
          'NextGenSim EMB-110P1 Bandeirante',
          '2'.repeat(64),
        ),
      ],
      { fingerprint: '3'.repeat(64) },
    );
    assert.equal(result.matched, false);
    assert.ok(
      result.reason === 'below_threshold:icao_only' ||
        result.reason === 'ambiguous_icao' ||
        result.reason === 'no_candidates' ||
        result.confidence < 0.7,
    );
  });
});
