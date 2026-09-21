import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  companySessionFromTick,
  settleCompanyPassiveFeesForTickRange,
} from './career-company-session.js';
import { createSeedEconomyWorld } from './career-economy.js';
import { emptyMissionsStateV2 } from './career-fleet.js';
import { TICKS_PER_DAY } from './career-clock.js';

describe('companySessionFromTick', () => {
  it('uses persisted lastSeenTick when set', () => {
    const from = companySessionFromTick({ lastSeenTick: 100 }, 50, 120);
    assert.equal(from, 100);
  });

  it('falls back when lastSeenTick is absent', () => {
    const from = companySessionFromTick({}, 80, 120);
    assert.equal(from, 80);
  });

  it('returns 0 when toTick equals from', () => {
    const from = companySessionFromTick({ lastSeenTick: 200 }, 100, 200);
    assert.equal(from, 200);
  });
});

describe('settleCompanyPassiveFees watermark', () => {
  it('does not double-bill hangar when lastSeenTick already caught up', () => {
    const world = createSeedEconomyWorld({ seed: 'fee-watermark' });
    const missions = emptyMissionsStateV2();
    missions.walletUsd = 50_000;
    const hub =
      world.airports.find((a) => a.hubTier === 'major') ?? world.airports[0]!;
    missions.fleet.push({
      id: 'acf_fee_wm_1',
      aircraftClassId: 'light_ga',
      label: 'Fee Probe',
      locationIcao: hub.icao,
      fuelKg: 100,
      fuelCapacityKg: 200,
      status: 'parked',
      ownership: 'owned',
    });
    const day0 = Math.floor(world.tick / TICKS_PER_DAY) * TICKS_PER_DAY;
    const day7 = day0 + TICKS_PER_DAY * 7;
    world.tick = day7;

    const walletBefore = missions.walletUsd;
    const first = settleCompanyPassiveFeesForTickRange(
      missions,
      world,
      day0,
      day7,
    );
    // Uncapped windows return null summary (banner quiet) but still debit.
    void first;
    assert.ok(missions.walletUsd < walletBefore);
    const hangarEntries = (missions.ledger ?? []).filter(
      (e) => e.kind === 'hangar_parking',
    );
    assert.ok(hangarEntries.length >= 1);
    const walletAfterFirst = missions.walletUsd;

    missions.lastSeenTick = day7;
    const secondFrom = companySessionFromTick(missions, day0, day7);
    const second = settleCompanyPassiveFeesForTickRange(
      missions,
      world,
      secondFrom,
      day7,
    );
    assert.equal(second, null);
    assert.equal(missions.walletUsd, walletAfterFirst);
    assert.equal(
      (missions.ledger ?? []).filter((e) => e.kind === 'hangar_parking').length,
      hangarEntries.length,
    );
  });

  it('skips hangar/salary when the settle window stays on the same economy day', () => {
    const world = createSeedEconomyWorld({ seed: 'fee-same-day' });
    const missions = emptyMissionsStateV2();
    missions.walletUsd = 50_000;
    const hub =
      world.airports.find((a) => a.hubTier === 'major') ?? world.airports[0]!;
    missions.fleet.push({
      id: 'acf_fee_sd_1',
      aircraftClassId: 'light_ga',
      label: 'Same Day Probe',
      locationIcao: hub.icao,
      fuelKg: 100,
      fuelCapacityKg: 200,
      status: 'parked',
      ownership: 'owned',
    });
    const dayStart = Math.floor(world.tick / TICKS_PER_DAY) * TICKS_PER_DAY;
    const midA = dayStart + 24;
    const midB = dayStart + 48;
    world.tick = midB;
    const walletBefore = missions.walletUsd;
    const summary = settleCompanyPassiveFeesForTickRange(
      missions,
      world,
      midA,
      midB,
    );
    assert.equal(summary, null);
    assert.equal(missions.walletUsd, walletBefore);
    assert.equal(
      (missions.ledger ?? []).filter((e) => e.kind === 'hangar_parking').length,
      0,
    );
  });
});
