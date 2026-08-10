import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Mission } from './api';
import {
  logbookAircraftLabel,
  logbookCargoLabel,
  logbookDistanceNm,
  logbookFlightKind,
  logbookPayoutUsd,
  logbookStatusLabel,
} from './logbook.js';

function mission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'msn_1',
    status: 'settled',
    originIcao: 'KIAD',
    destIcao: 'KCLT',
    commodityId: 'supplies',
    cargoKg: 1001,
    payUsd: 32_164,
    payoutUsd: 32_164,
    urgency: 'normal',
    aircraftClassId: 'light_jet',
    deadlineTick: 100,
    reason: 'test',
    ...overrides,
  };
}

describe('logbookFlightKind', () => {
  it('labels contract, ferry, and normal freight', () => {
    assert.equal(logbookFlightKind(mission({ contractPilot: true })), 'Contract');
    assert.equal(
      logbookFlightKind(mission({ emptyFlight: true, cargoKg: 0 })),
      'Ferry',
    );
    assert.equal(
      logbookFlightKind(
        mission({ contractPilot: true, contractPilotReposition: true, cargoKg: 0 }),
      ),
      'Ferry',
    );
    assert.equal(logbookFlightKind(mission()), 'Normal');
  });
});

describe('logbookAircraftLabel', () => {
  it('prefers catalog, then OFP ICAO, then fleet, then class', () => {
    assert.equal(
      logbookAircraftLabel(mission({ airframeLabel: 'Pilatus PC-24' })),
      'Pilatus PC-24',
    );
    assert.equal(
      logbookAircraftLabel(
        mission({
          lastOfpCheck: {
            verdict: 'pass',
            summary: 'ok',
            checkedAtIso: '2026-01-01T00:00:00.000Z',
            findings: [],
            briefing: { aircraftIcao: 'pc24' },
          },
        }),
      ),
      'PC24',
    );
    assert.equal(
      logbookAircraftLabel(mission(), { fleetLabel: 'N024SB' }),
      'N024SB',
    );
    assert.equal(logbookAircraftLabel(mission()), 'Light jet');
  });
});

describe('logbookDistanceNm', () => {
  it('uses API distance then OFP briefing', () => {
    assert.equal(logbookDistanceNm(mission({ distanceNm: 316.4 })), 316);
    assert.equal(
      logbookDistanceNm(
        mission({
          lastOfpCheck: {
            verdict: 'pass',
            summary: 'ok',
            checkedAtIso: '2026-01-01T00:00:00.000Z',
            findings: [],
            briefing: { distanceNm: 315.2 },
          },
        }),
      ),
      315,
    );
    assert.equal(logbookDistanceNm(mission()), null);
  });
});

describe('logbookCargoLabel', () => {
  it('shows empty for ferry / zero cargo', () => {
    assert.equal(
      logbookCargoLabel(mission({ emptyFlight: true, cargoKg: 0 }), (kg) => `${kg}`),
      'Empty',
    );
    assert.equal(
      logbookCargoLabel(mission(), (kg) => `${kg} kg`),
      '1001 kg Supplies',
    );
  });
});

describe('logbookPayoutUsd', () => {
  it('hides pay for cancelled; uses payout when settled', () => {
    assert.equal(logbookPayoutUsd(mission({ status: 'cancelled' })), null);
    assert.equal(logbookPayoutUsd(mission({ payoutUsd: 10, payUsd: 20 })), 10);
    assert.equal(
      logbookPayoutUsd(mission({ status: 'dispatched', payoutUsd: undefined })),
      32_164,
    );
  });
});

describe('logbookStatusLabel', () => {
  it('humanizes status chips', () => {
    assert.equal(logbookStatusLabel('in_flight'), 'In flight');
    assert.equal(logbookStatusLabel('settled'), 'Settled');
  });
});
