import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { attachDeskHoldToCargoTrip } from './career-cargo-trip-desk.js';
import {
  buyWarehouseAtPickupHub,
  depositCargoToWarehouse,
} from './career-warehouse.js';
import {
  dispatchWarehouseHaulHold,
  holdWarehouseHaul,
} from './career-warehouse-haul.js';
import {
  createSeedEconomyWorld,
  emptyMissionsStateV2,
  selectStarterHub,
} from './index.js';

describe('desk hold on a cargo trip', () => {
  it('adds a second destination from the desk without taking the aircraft', () => {
    const world = createSeedEconomyWorld({ seed: 'trip-desk' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'Trip Desk',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 80_000;
    buyWarehouseAtPickupHub(state, world, 'SBGR');
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 400,
      avgCostUsdPerKg: 1,
      tick: world.tick,
    });
    const aircraft = state.fleet.find((row) => row.status === 'parked')!;
    aircraft.locationIcao = 'SBGR';
    const first = holdWarehouseHaul(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBSP',
      commodityId: 'general',
      kg: 40,
    });
    const second = holdWarehouseHaul(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBKP',
      commodityId: 'general',
      kg: 30,
    });
    const host = dispatchWarehouseHaulHold(state, world, {
      holdId: first.hold.id,
      aircraftId: aircraft.id,
    });
    assert.throws(
      () =>
        dispatchWarehouseHaulHold(state, world, {
          holdId: second.hold.id,
          aircraftId: aircraft.id,
        }),
      /Finish or cancel/,
    );
    const armed = attachDeskHoldToCargoTrip(state, world, {
      hostMissionId: host.mission.id,
      holdId: second.hold.id,
      maxCargoKg: 500,
    });
    assert.equal(armed.throughLoads?.length, 1);
    assert.equal(armed.throughLoads?.[0]?.destIcao, 'SBKP');
    assert.equal(armed.cargoKg, 40);
    const rider = state.missions.find((row) => row.destIcao === 'SBKP')!;
    assert.equal(rider.throughHostId, host.mission.id);
    assert.equal(rider.aircraftId, undefined);
    assert.equal(aircraft.assignedMissionId, host.mission.id);
    assert.equal(aircraft.status, 'assigned');
    assert.equal(
      state.playerWarehouses!.demandHolds!.some((row) => row.id === second.hold.id),
      false,
    );
  });

  it('keeps a tail reserved for the pilot who is adding the stop', () => {
    const world = createSeedEconomyWorld({ seed: 'trip-desk-reserve' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'Trip Desk',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 80_000;
    buyWarehouseAtPickupHub(state, world, 'SBGR');
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 400,
      avgCostUsdPerKg: 1,
      tick: world.tick,
    });
    const aircraft = state.fleet.find((row) => row.status === 'parked')!;
    aircraft.locationIcao = 'SBGR';
    const first = holdWarehouseHaul(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBSP',
      commodityId: 'general',
      kg: 40,
    });
    const second = holdWarehouseHaul(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBKP',
      commodityId: 'general',
      kg: 30,
    });
    const host = dispatchWarehouseHaulHold(state, world, {
      holdId: first.hold.id,
      aircraftId: aircraft.id,
      pilotAccountId: 'pilot-a',
    });
    assert.equal(aircraft.reservedByAccountId, 'pilot-a');
    const armed = attachDeskHoldToCargoTrip(state, world, {
      hostMissionId: host.mission.id,
      holdId: second.hold.id,
      maxCargoKg: 500,
      actorAccountId: 'pilot-a',
    });
    assert.equal(armed.throughLoads?.[0]?.destIcao, 'SBKP');
    assert.equal(aircraft.assignedMissionId, host.mission.id);
    assert.equal(aircraft.reservedByAccountId, 'pilot-a');
    assert.equal(
      state.playerWarehouses!.demandHolds!.some((row) => row.id === second.hold.id),
      false,
    );
  });

  it('leaves the hold on the desk when the first leg cannot lift the sum', () => {
    const world = createSeedEconomyWorld({ seed: 'trip-desk-heavy' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'Trip Desk Heavy',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 80_000;
    buyWarehouseAtPickupHub(state, world, 'SBGR');
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 400,
      avgCostUsdPerKg: 1,
      tick: world.tick,
    });
    const aircraft = state.fleet.find((row) => row.status === 'parked')!;
    aircraft.locationIcao = 'SBGR';
    const first = holdWarehouseHaul(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBSP',
      commodityId: 'general',
      kg: 40,
    });
    const second = holdWarehouseHaul(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBKP',
      commodityId: 'general',
      kg: 30,
    });
    const host = dispatchWarehouseHaulHold(state, world, {
      holdId: first.hold.id,
      aircraftId: aircraft.id,
    });
    assert.throws(
      () =>
        attachDeskHoldToCargoTrip(state, world, {
          hostMissionId: host.mission.id,
          holdId: second.hold.id,
          maxCargoKg: 50,
        }),
      /trip would be/,
    );
    assert.equal(
      state.playerWarehouses!.demandHolds!.some((row) => row.id === second.hold.id),
      true,
    );
    assert.equal(state.missions.length, 1);
  });
});
