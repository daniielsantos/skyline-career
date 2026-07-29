import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  acceptMission,
  cancelMission,
  createSeedEconomyWorld,
  getAircraftClass,
  listMarketLots,
  tickEconomyN,
} from './index.js';

describe('acceptMission', () => {
  it('reserves cargo and creates MissionIntent for generate-ofp', () => {
    const world = createSeedEconomyWorld({ seed: 'accept-test' });
    tickEconomyN(world, 24);
    const market = listMarketLots(world);
    assert.ok(market.length > 0);
    const lot = market[0]!.lot;
    const before = lot.reservedKg;

    const mission = acceptMission(world, {
      lotId: lot.id,
      aircraftClassId: 'narrow_freighter',
      missionId: 'msn_test_1',
    });

    assert.equal(mission.id, 'msn_test_1');
    assert.equal(mission.status, 'accepted');
    assert.equal(mission.pax, 0);
    assert.equal(mission.originIcao, lot.originIcao);
    assert.equal(mission.destIcao, lot.destIcao);
    assert.equal(mission.shipmentLotId, lot.id);
    assert.ok(mission.cargoKg > 0);
    assert.ok(mission.cargoKg <= getAircraftClass('narrow_freighter').maxCargoKg);
    assert.ok(mission.payUsd > 0);
    assert.equal(mission.rolesPackRelPath, 'profiles/ofp/pmdg-738-bcf.json');
    assert.equal(lot.reservedKg, before + mission.cargoKg);
  });

  it('clamps cargo to aircraft max and remaining lot', () => {
    const world = createSeedEconomyWorld({ seed: 'clamp-test' });
    tickEconomyN(world, 24);
    const lot = listMarketLots(world)[0]!.lot;
    const mission = acceptMission(world, {
      lotId: lot.id,
      cargoKg: 999_999,
      aircraftClassId: 'narrow_freighter',
    });
    assert.equal(mission.cargoKg, Math.min(lot.quantityKg, 22_000));
  });

  it('cancel releases reservation', () => {
    const world = createSeedEconomyWorld({ seed: 'cancel-test' });
    tickEconomyN(world, 24);
    const lot = listMarketLots(world)[0]!.lot;
    const mission = acceptMission(world, {
      lotId: lot.id,
      cargoKg: 5_000,
      aircraftClassId: 'wide_freighter',
      missionId: 'msn_cancel',
    });
    const reservedAfter = lot.reservedKg;
    const cancelled = cancelMission(world, mission);
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(lot.reservedKg, reservedAfter - 5_000);
  });
});
