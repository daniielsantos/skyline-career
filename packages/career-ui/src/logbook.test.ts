import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Mission } from './api';
import {
  logbookAircraftLabel,
  logbookCargoLabel,
  logbookDistanceNm,
  logbookFlightDurationLabel,
  logbookFlightKind,
  logbookFlightWhenLabel,
  logbookIsVaFlight,
  logbookPayoutIsPilotCut,
  logbookPayoutUsd,
  logbookStatusLabel,
  mergeLogbookMissions,
  formatEconomyClock,
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
    assert.equal(
      logbookFlightKind(mission({ missionType: 'charter', pax: 5, cargoKg: 0 })),
      'Charter',
    );
  });
});

describe('Charter logbook payload', () => {
  it('shows passengers and baggage instead of Empty', () => {
    assert.equal(
      logbookCargoLabel(
        mission({ missionType: 'charter', pax: 5, baggageKg: 90, cargoKg: 0 }),
        (kg) => `${kg} kg`,
      ),
      '5 pax · 90 kg baggage',
    );
  });
});

describe('logbookAircraftLabel', () => {
  it('prefers catalog hangar name, then fleet, then class — never OFP ICAO', () => {
    assert.equal(
      logbookAircraftLabel(mission({ airframeLabel: 'Pilatus PC-24' })),
      'Pilatus PC-24',
    );
    assert.equal(
      logbookAircraftLabel(
        mission({
          airframeLabel: 'Cessna 172SP',
          lastOfpCheck: {
            verdict: 'pass',
            summary: 'ok',
            checkedAtIso: '2026-01-01T00:00:00.000Z',
            findings: [],
            briefing: { aircraftIcao: 'c172' },
          },
        }),
      ),
      'Cessna 172SP',
    );
    assert.equal(
      logbookAircraftLabel(
        mission({
          lastOfpCheck: {
            verdict: 'pass',
            summary: 'ok',
            checkedAtIso: '2026-01-01T00:00:00.000Z',
            findings: [],
            briefing: { aircraftIcao: 'c172' },
          },
        }),
      ),
      'Light jet',
    );
    assert.equal(
      logbookAircraftLabel(mission(), { fleetLabel: 'N024SB' }),
      'N024SB',
    );
    assert.equal(logbookAircraftLabel(mission()), 'Light jet');
  });

  it('falls back to airframeTypeId before class', () => {
    assert.equal(
      logbookAircraftLabel(
        mission({
          aircraftClassId: 'light_ga',
          airframeTypeId: 'microsoft-404-titan',
        }),
      ),
      '404 Titan',
    );
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

  it('prefers pilot cut over route gross', () => {
    assert.equal(
      logbookPayoutUsd(
        mission({ payoutUsd: 1000, pilotPayoutUsd: 240, vaFlight: true }),
      ),
      240,
    );
    assert.equal(
      logbookPayoutIsPilotCut(
        mission({ payoutUsd: 1000, pilotPayoutUsd: 240, vaFlight: true }),
      ),
      true,
    );
    assert.equal(
      logbookPayoutIsPilotCut(
        mission({ payoutUsd: 1000, pilotPayoutUsd: 1000, vaFlight: true }),
      ),
      false,
    );
  });
});

describe('logbookIsVaFlight', () => {
  it('tags listed VA ops and Internal Haul', () => {
    assert.equal(logbookIsVaFlight(mission()), false);
    assert.equal(logbookIsVaFlight(mission({ vaFlight: true })), true);
    assert.equal(
      logbookIsVaFlight(
        mission({ warehouseBridge: true, internalHaul: true }),
      ),
      true,
    );
  });
});

describe('mergeLogbookMissions', () => {
  it('unions by id and lets secondary win collisions', () => {
    const home = mission({ id: 'msn_home', payoutUsd: 100 });
    const vaOnly = mission({ id: 'msn_va', vaFlight: true, payoutUsd: 50 });
    const homeDup = mission({ id: 'msn_clash', payoutUsd: 10 });
    const vaDup = mission({
      id: 'msn_clash',
      vaFlight: true,
      pilotPayoutUsd: 3,
      payoutUsd: 10,
    });
    const merged = mergeLogbookMissions([home, homeDup], [vaOnly, vaDup]);
    assert.equal(merged.length, 3);
    assert.ok(merged.some((m) => m.id === 'msn_home'));
    assert.ok(merged.some((m) => m.id === 'msn_va' && m.vaFlight));
    const clash = merged.find((m) => m.id === 'msn_clash');
    assert.equal(clash?.vaFlight, true);
    assert.equal(clash?.pilotPayoutUsd, 3);
  });
});

describe('logbookStatusLabel', () => {
  it('humanizes status chips', () => {
    assert.equal(logbookStatusLabel('in_flight'), 'In flight');
    assert.equal(logbookStatusLabel('settled'), 'Settled');
  });
});

describe('logbookFlightDurationLabel', () => {
  it('prefers settled Watch duration, then planned with tilde', () => {
    assert.equal(
      logbookFlightDurationLabel(
        mission({ settledFlightDurationMs: 5_040_000 }),
      ),
      '1h 24m',
    );
    assert.equal(
      logbookFlightDurationLabel(
        mission({ status: 'in_flight', expectedRouteMs: 3_600_000 }),
      ),
      '~1h',
    );
    assert.equal(
      logbookFlightDurationLabel(
        mission({
          departedAtTick: 10,
          settledAtTick: 14,
          settledFlightDurationMs: undefined,
          expectedRouteMs: undefined,
        }),
      ),
      '1h',
    );
  });
});

describe('logbookFlightWhenLabel', () => {
  it('uses settle tick as world Day·time', () => {
    assert.equal(formatEconomyClock(0), 'Day 1 · 00:00');
    assert.equal(formatEconomyClock(96), 'Day 2 · 00:00');
    assert.equal(
      logbookFlightWhenLabel(mission({ settledAtTick: 96 + 4 })),
      'Day 2 · 01:00',
    );
    assert.equal(
      logbookFlightWhenLabel(
        mission({
          settledAtTick: undefined,
          departedAtTick: 8,
          acceptedAtTick: 1,
        }),
      ),
      'Day 1 · 02:00',
    );
  });
});
