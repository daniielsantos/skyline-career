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

  it('maps TFDi titles to tfdi even when MSFS reports asobo', async () => {
    const { inferPublisher } = await import('./index.js');
    assert.equal(inferPublisher('TFDi Design MD-11F GE'), 'tfdi');
    assert.equal(inferPublisher('TFDi Design MD-11F GE', 'asobo'), 'tfdi');
  });

  it('maps Maddog / Leonardo titles to leonardo', async () => {
    const { inferPublisher } = await import('./index.js');
    assert.equal(inferPublisher('Fly The Maddog X MD-88 20th'), 'leonardo');
    assert.equal(inferPublisher('Fly The Maddog X MD-82 20th', 'asobo'), 'leonardo');
  });
});

describe('titlesMatchForCatalog', () => {
  it('matches cleaned Saab live title to catalog match title', () => {
    assert.equal(
      titlesMatchForCatalog('340 Cargo - Loaded', 'Saab 340 Cargo'),
      true,
    );
  });

  it('does not alias Cargo Loaded onto Cargo Empty (different station maps)', () => {
    assert.equal(
      titlesMatchForCatalog(
        'C408 SkyCourier Cargo - Loaded',
        'C408 SkyCourier Cargo - Empty',
      ),
      false,
    );
    assert.equal(
      titlesMatchForCatalog(
        'C408 SkyCourier Cargo - Empty',
        'C408 SkyCourier Cargo - Empty',
      ),
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

  it('does not alias ATR Stol / Highline onto plain Passenger', () => {
    assert.equal(
      titlesMatchForCatalog('ATR 42-600 Stol', 'ATR 42-600 Passenger'),
      false,
    );
    assert.equal(
      titlesMatchForCatalog('ATR 42-600 STOL', 'ATR 42-600 Passenger'),
      false,
    );
    assert.equal(
      titlesMatchForCatalog('ATR 42-600 Highline 02', 'ATR 42-600 Passenger'),
      false,
    );
    assert.equal(
      titlesMatchForCatalog('ATR 42-600 Passenger', 'ATR 42-600 Passenger'),
      true,
    );
    assert.equal(
      titlesMatchForCatalog('ATR 42-600 Stol', 'ATR 42-600 Stol'),
      true,
    );
  });

  it('does not alias Learjet / Saab cargo onto passenger', () => {
    assert.equal(
      titlesMatchForCatalog('LEARJET 35A PASSENGER', 'LEARJET 35A CARGO'),
      false,
    );
    assert.equal(
      titlesMatchForCatalog('LEARJET 35A CARGO', 'LEARJET 35A CARGO'),
      true,
    );
    assert.equal(
      titlesMatchForCatalog('Saab 340 Passenger', 'Saab 340 Cargo'),
      false,
    );
    assert.equal(
      titlesMatchForCatalog('340 Cargo - Loaded', 'Saab 340 Cargo'),
      true,
    );
  });

  it('does not alias unmarked A340 EIS onto Freighter (same structural hash)', () => {
    assert.equal(
      titlesMatchForCatalog('A340-300 EIS1', 'A340-300 Freighter EIS1'),
      false,
    );
    assert.equal(
      titlesMatchForCatalog('A340-300 EIS2', 'A340-300 Freighter EIS1'),
      false,
    );
    assert.equal(
      titlesMatchForCatalog('A340-300 Freighter EIS2', 'A340-300 Freighter EIS1'),
      false,
    );
    assert.equal(
      titlesMatchForCatalog('A340-300 Freighter EIS1', 'A340-300 Freighter EIS1'),
      true,
    );
    assert.equal(
      titlesMatchForCatalog('A340-300 VIP EIS1', 'A340-300 Freighter EIS1'),
      false,
    );
  });

  it('does not alias BN2 Passenger Tip Tanks onto SpecialOps or Cargo', () => {
    assert.equal(
      titlesMatchForCatalog(
        'BN2 Islander - Passenger / Analogue / Tip Tanks',
        'BN2 Islander - SpecialOps / Analogue',
      ),
      false,
    );
    assert.equal(
      titlesMatchForCatalog(
        'BN2 Islander - Passenger / Analogue / Tip Tanks',
        'BN2 Islander - Cargo / Analogue / Tip Tanks',
      ),
      false,
    );
    // Glass-only Cargo Tip Tanks stay one family.
    assert.equal(
      titlesMatchForCatalog(
        'BN2 Islander - Cargo / Garmin / Tip Tanks',
        'BN2 Islander - Cargo / Analogue / Tip Tanks',
      ),
      true,
    );
  });

  it('does not alias Learjet PASSENGER LONG RANGE onto plain PASSENGER', () => {
    assert.equal(
      titlesMatchForCatalog(
        'LEARJET 35A PASSENGER LONG RANGE',
        'LEARJET 35A PASSENGER',
      ),
      false,
    );
    assert.equal(
      titlesMatchForCatalog(
        'LEARJET 35A PASSENGER LONG RANGE',
        'LEARJET 35A PASSENGER LONG RANGE',
      ),
      true,
    );
  });

  it('does not alias Kodiak Combi onto Commuter (comma titles)', () => {
    assert.equal(
      titlesMatchForCatalog(
        'Kodiak 100 Combi, Cargopod, Tundra wheels',
        'Kodiak 100 Commuter, Cargopod, Tundra wheels',
      ),
      false,
    );
    assert.equal(
      titlesMatchForCatalog(
        'Kodiak 100 Commuter, Cargopod, Tundra wheels',
        'Kodiak 100 Commuter, Cargopod, Tundra wheels',
      ),
      true,
    );
    assert.equal(
      titlesMatchForCatalog(
        'Kodiak 100 Skydive, Cargopod, Tundra wheels',
        'Kodiak 100 Commuter, Cargopod, Tundra wheels',
      ),
      false,
    );
  });

  it('does not alias Kodiak without Cargopod onto Cargopod profile', () => {
    assert.equal(
      titlesMatchForCatalog(
        'Kodiak 100 Commuter, Tundra wheels',
        'Kodiak 100 Commuter, Cargopod, Tundra wheels',
      ),
      false,
    );
    assert.equal(
      titlesMatchForCatalog(
        'Kodiak 100 Commuter, Cargopod, Tundra wheels',
        'Kodiak 100 Commuter, Tundra wheels',
      ),
      false,
    );
  });

  it('does not alias short Kodiak Combi onto Combi Tundra wheels', () => {
    assert.equal(
      titlesMatchForCatalog(
        'Kodiak 100 Combi',
        'Kodiak 100 Combi, Tundra wheels',
      ),
      false,
    );
    assert.equal(
      titlesMatchForCatalog(
        'Kodiak 100 Combi, Tundra wheels',
        'Kodiak 100 Combi, Tundra wheels',
      ),
      true,
    );
  });

  it('does not alias Bonanza A36TC onto A36 Professional', () => {
    assert.equal(
      titlesMatchForCatalog(
        'Black Square A36TC Bonanza Professional N5172C',
        'Black Square A36 Bonanza Professional',
      ),
      false,
    );
    assert.equal(
      titlesMatchForCatalog(
        'Black Square A36 Bonanza Professional',
        'Black Square A36 Bonanza Professional',
      ),
      true,
    );
  });

  it('does not alias Duke Grand / Turbine onto base B60', () => {
    assert.equal(
      titlesMatchForCatalog(
        'Black Square Grand Duke N18VK',
        'Black Square B60 Duke',
      ),
      false,
    );
    assert.equal(
      titlesMatchForCatalog(
        'Black Square Turbine Duke',
        'Black Square B60 Duke',
      ),
      false,
    );
    assert.equal(
      titlesMatchForCatalog(
        'Black Square B60T Turbine Duke',
        'Black Square B60 Duke',
      ),
      false,
    );
    assert.equal(
      titlesMatchForCatalog('Black Square B60 Duke', 'Black Square B60 Duke'),
      true,
    );
    assert.equal(
      titlesMatchForCatalog(
        'Black Square Grand Duke',
        'Black Square Grand Duke',
      ),
      true,
    );
  });

  it('does not alias Black Square Caravan onto Bonanza via Professional branding', () => {
    assert.equal(
      titlesMatchForCatalog(
        'Black Square Caravan Professional Gear N95EJ',
        'Black Square A36 Bonanza Professional',
      ),
      false,
    );
    assert.equal(
      titlesMatchForCatalog(
        'Black Square Caravan Professional Gear',
        'Black Square B36TP Bonanza Professional',
      ),
      false,
    );
    assert.equal(
      titlesMatchForCatalog(
        'Black Square A36 Bonanza Professional',
        'Black Square A36 Bonanza Professional',
      ),
      true,
    );
  });

  it('does not alias Fenix A319 engine or pack variants', () => {
    assert.equal(
      titlesMatchForCatalog('FenixA319 CFM WF SD', 'FenixA319 IAE WF SD'),
      false,
    );
    assert.equal(
      titlesMatchForCatalog('FenixA319 CFM SL HD', 'FenixA319 IAE SL HD'),
      false,
    );
    assert.equal(
      titlesMatchForCatalog('FenixA319 CFM WF SD', 'FenixA319 CFM SL HD'),
      false,
    );
    assert.equal(
      titlesMatchForCatalog('FenixA319 IAE WF SD', 'FenixA319 IAE WF SD'),
      true,
    );
    assert.equal(
      titlesMatchForCatalog('FenixA319 CFM WF SD', 'FenixA319 CFM WF SD'),
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
