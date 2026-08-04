import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  fingerprintFromProfile,
  normalizeAircraftTitle,
  titlesMatchForCatalog,
  type AircraftProfile,
} from './index.js';

describe('normalizeAircraftTitle', () => {
  it('strips Loaded / Empty payload-state suffixes', () => {
    assert.equal(normalizeAircraftTitle('340 Cargo - Loaded'), '340 Cargo');
    assert.equal(normalizeAircraftTitle('340 Cargo Loaded'), '340 Cargo');
    assert.equal(normalizeAircraftTitle('C208B Cargo - Empty'), 'C208B Cargo');
  });
});

describe('inferPublisher', () => {
  it('maps C400 Corvalis to carenado without vendor prefix', async () => {
    const { inferPublisher } = await import('./index.js');
    assert.equal(inferPublisher('C400 Corvalis'), 'carenado');
    assert.equal(inferPublisher('C400 Corvalis', 'asobo'), 'carenado');
  });

  it('maps C185F Skywagon to carenado without vendor prefix', async () => {
    const { inferPublisher } = await import('./index.js');
    assert.equal(inferPublisher('C185F Skywagon Standard'), 'carenado');
  });

  it('maps DC-6A to pmdg without vendor prefix', async () => {
    const { inferPublisher } = await import('./index.js');
    assert.equal(inferPublisher('DC-6A'), 'pmdg');
    assert.equal(inferPublisher('DC-6A', 'asobo'), 'pmdg');
  });
});

describe('titlesMatchForCatalog', () => {
  it('matches cleaned Saab live title to catalog match title', () => {
    assert.equal(
      titlesMatchForCatalog('340 Cargo - Loaded', 'Saab 340 Cargo'),
      true,
    );
  });

  it('rejects unrelated titles', () => {
    assert.equal(titlesMatchForCatalog('C172 Classic', 'Saab 340 Cargo'), false);
  });

  it('does not alias NextGenSim EMB-110P onto EMB-110P1F', () => {
    assert.equal(
      titlesMatchForCatalog(
        'NextGenSim EMB-110P Bandeirante',
        'NextGenSim EMB-110P1F Bandeirante',
      ),
      false,
    );
    assert.equal(
      titlesMatchForCatalog(
        'NextGenSim EMB-110P1 Bandeirante',
        'NextGenSim EMB-110P1F Bandeirante',
      ),
      false,
    );
  });

  it('still matches Commander 114 to itself with TC sibling only via exact tokens', () => {
    assert.equal(
      titlesMatchForCatalog(
        'Black Square Commander 114',
        'Black Square Commander 114',
      ),
      true,
    );
  });
});

describe('fingerprintFromProfile liveTitles', () => {
  it('prefers liveTitles over cleaned match.title for fingerprint identity', () => {
    const base = {
      schemaVersion: '1.0.0' as const,
      profileId: 'carenado-saab-340-cargo',
      profileKey: 'carenado/saab-340-cargo',
      semver: '1.0.0',
      match: {
        fingerprint: '0'.repeat(64),
        title: 'Saab 340 Cargo',
        publisher: 'carenado',
        icao: 'SF34',
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
        tanks: [
          {
            id: 'LEFT_MAIN',
            capacity: 360,
            readVar: 'FUELSYSTEM TANK QUANTITY:1',
            readUnit: 'gallons',
            writeVar: 'FUELSYSTEM TANK QUANTITY:1',
            writeUnit: 'gallons',
          },
          {
            id: 'RIGHT_MAIN',
            capacity: 360,
            readVar: 'FUELSYSTEM TANK QUANTITY:2',
            readUnit: 'gallons',
            writeVar: 'FUELSYSTEM TANK QUANTITY:2',
            writeUnit: 'gallons',
          },
        ],
        writePlan: [],
        verify: { timeoutMs: 1000, pollIntervalMs: 100, checks: [] },
      },
      payload: {
        strategy: 'station-writeback' as const,
        stations: [
          { index: 1, name: 'Pilot', maxLoad: 500 },
          { index: 2, name: 'Copilot', maxLoad: 500 },
        ],
        writePlan: [],
        verify: { timeoutMs: 1000, pollIntervalMs: 100, checks: [] },
      },
    } satisfies AircraftProfile;

    const cleaned = fingerprintFromProfile(base);
    const withLive = fingerprintFromProfile({
      ...base,
      match: {
        ...base.match,
        liveTitles: ['340 Cargo - Loaded'],
      },
    });
    assert.notEqual(cleaned.fingerprint, withLive.fingerprint);
  });
});
