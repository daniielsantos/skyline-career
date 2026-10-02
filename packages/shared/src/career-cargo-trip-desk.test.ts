import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  attachDeskHoldToCargoTrip,
  syncDeskTripLoads,
} from './career-cargo-trip-desk.js';
import {
  buyWarehouseAtPickupHub,
  depositCargoToWarehouse,
} from './career-warehouse.js';
import {
  dispatchWarehouseHaulHold,
  holdWarehouseHaul,
} from './career-warehouse-haul.js';
import { holdWarehouseBridge } from './career-warehouse-bridge.js';
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

  it('stacks a second contract onto a stop that is already on the trip', () => {
    const world = createSeedEconomyWorld({ seed: 'trip-desk-stack' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'Trip Stack',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 900_000;
    buyWarehouseAtPickupHub(state, world, 'SBGR');
    buyWarehouseAtPickupHub(state, world, 'SBCT');
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 400,
      avgCostUsdPerKg: 1,
      tick: world.tick,
    });
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'supplies',
      kg: 400,
      avgCostUsdPerKg: 1,
      tick: world.tick,
    });
    const aircraft = state.fleet.find((row) => row.status === 'parked')!;
    aircraft.locationIcao = 'SBGR';
    const hostHold = holdWarehouseHaul(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBSP',
      commodityId: 'general',
      kg: 20,
    });
    const host = dispatchWarehouseHaulHold(state, world, {
      holdId: hostHold.hold.id,
      aircraftId: aircraft.id,
    });
    const machinery = holdWarehouseBridge(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBCT',
      commodityId: 'general',
      kg: 10,
      pilotPayUsd: 0,
    });
    const withStop = attachDeskHoldToCargoTrip(state, world, {
      hostMissionId: host.mission.id,
      holdId: machinery.hold.id,
    });
    const supplies = holdWarehouseBridge(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBCT',
      commodityId: 'supplies',
      kg: 8,
      pilotPayUsd: 0,
    });
    const stacked = attachDeskHoldToCargoTrip(state, world, {
      hostMissionId: withStop.id,
      holdId: supplies.hold.id,
    });
    assert.equal(stacked.throughLoads?.length, 1);
    assert.equal(stacked.throughLoads?.[0]?.cargoKg, 18);
    const rider = state.missions.find(
      (row) => row.id === stacked.throughLoads?.[0]?.missionId,
    );
    assert.equal(rider?.lots.length, 2);
    assert.equal(
      state.playerWarehouses!.demandHolds!.some((row) => row.id === supplies.hold.id),
      false,
    );
    assert.equal(
      state.missions.filter((row) => row.status === 'accepted').length,
      2,
    );
  });

  it('puts a second contract for the first airport on that same landing', () => {
    const world = createSeedEconomyWorld({ seed: 'trip-desk-same-dest' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'Trip Same',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 900_000;
    buyWarehouseAtPickupHub(state, world, 'SBGR');
    buyWarehouseAtPickupHub(state, world, 'SBCT');
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 400,
      avgCostUsdPerKg: 1,
      tick: world.tick,
    });
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'supplies',
      kg: 400,
      avgCostUsdPerKg: 1,
      tick: world.tick,
    });
    const aircraft = state.fleet.find((row) => row.status === 'parked')!;
    aircraft.locationIcao = 'SBGR';
    const hostHold = holdWarehouseHaul(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBSP',
      commodityId: 'general',
      kg: 20,
    });
    const host = dispatchWarehouseHaulHold(state, world, {
      holdId: hostHold.hold.id,
      aircraftId: aircraft.id,
    });
    const second = holdWarehouseHaul(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBSP',
      commodityId: 'supplies',
      kg: 8,
    });
    const stacked = attachDeskHoldToCargoTrip(state, world, {
      hostMissionId: host.mission.id,
      holdId: second.hold.id,
      maxCargoKg: 500,
    });
    assert.equal(stacked.throughLoads, undefined);
    assert.equal(stacked.lots.length, 2);
    assert.equal(stacked.cargoKg, 28);
    assert.equal(aircraft.assignedMissionId, host.mission.id);
  });

  it('keeps a different contract type on a destination that is already a stop', () => {
    const world = createSeedEconomyWorld({ seed: 'trip-desk-mixed-dest' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'Trip Mixed',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 900_000;
    buyWarehouseAtPickupHub(state, world, 'SBGR');
    buyWarehouseAtPickupHub(state, world, 'SBCT');
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 400,
      avgCostUsdPerKg: 1,
      tick: world.tick,
    });
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'supplies',
      kg: 400,
      avgCostUsdPerKg: 1,
      tick: world.tick,
    });
    const aircraft = state.fleet.find((row) => row.status === 'parked')!;
    aircraft.locationIcao = 'SBGR';
    const hostHold = holdWarehouseHaul(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBCT',
      commodityId: 'general',
      kg: 20,
    });
    const host = dispatchWarehouseHaulHold(state, world, {
      holdId: hostHold.hold.id,
      aircraftId: aircraft.id,
    });
    const bridge = holdWarehouseBridge(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBCT',
      commodityId: 'supplies',
      kg: 8,
      pilotPayUsd: 0,
    });
    const armed = attachDeskHoldToCargoTrip(state, world, {
      hostMissionId: host.mission.id,
      holdId: bridge.hold.id,
      maxCargoKg: 500,
    });
    assert.equal(armed.destIcao, 'SBCT');
    assert.equal(armed.throughLoads?.length, 1);
    assert.equal(armed.throughLoads?.[0]?.destIcao, 'SBCT');
    assert.equal(aircraft.assignedMissionId, host.mission.id);
    assert.equal(
      state.missions.filter((row) => row.status === 'accepted').length,
      2,
    );
  });

  it('writes manifest sliders onto the flight and drops a later stop at zero', () => {
    const world = createSeedEconomyWorld({ seed: 'trip-desk-sync' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'Trip Sync',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 900_000;
    buyWarehouseAtPickupHub(state, world, 'SBGR');
    buyWarehouseAtPickupHub(state, world, 'SBCT');
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 400,
      avgCostUsdPerKg: 1,
      tick: world.tick,
    });
    const aircraft = state.fleet.find((row) => row.status === 'parked')!;
    aircraft.locationIcao = 'SBGR';
    const hostHold = holdWarehouseHaul(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBSP',
      commodityId: 'general',
      kg: 20,
    });
    const host = dispatchWarehouseHaulHold(state, world, {
      holdId: hostHold.hold.id,
      aircraftId: aircraft.id,
    });
    const riderHold = holdWarehouseBridge(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBCT',
      commodityId: 'general',
      kg: 10,
      pilotPayUsd: 0,
    });
    const armed = attachDeskHoldToCargoTrip(state, world, {
      hostMissionId: host.mission.id,
      holdId: riderHold.hold.id,
    });
    const rider = state.missions.find(
      (row) => row.id === armed.throughLoads?.[0]?.missionId,
    )!;
    const hostLot = armed.lots[0]!.shipmentLotId;
    const riderLot = rider.lots[0]!.shipmentLotId;
    const edited = syncDeskTripLoads(state, world, armed.id, [
      { lotId: hostLot, cargoKg: 20 },
      { lotId: riderLot, cargoKg: 4 },
    ], { maxCargoKg: 500 });
    assert.equal(edited.cargoKg, 20);
    assert.equal(edited.throughLoads?.[0]?.cargoKg, 4);
    assert.equal(aircraft.assignedMissionId, armed.id);
    const dropped = syncDeskTripLoads(state, world, armed.id, [
      { lotId: hostLot, cargoKg: 20 },
      { lotId: riderLot, cargoKg: 0 },
    ], { maxCargoKg: 500 });
    assert.equal(dropped.throughLoads, undefined);
    assert.equal(
      state.missions.find((row) => row.id === rider.id)?.status,
      'cancelled',
    );
    assert.equal(aircraft.assignedMissionId, armed.id);
    assert.equal(aircraft.status, 'assigned');
  });

  it('adds another bridge after SimBrief and stacks it on that stop', () => {
    const world = createSeedEconomyWorld({ seed: 'trip-desk-after-ofp' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'Trip After Ofp',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 900_000;
    buyWarehouseAtPickupHub(state, world, 'SBGR');
    buyWarehouseAtPickupHub(state, world, 'SBCT');
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 400,
      avgCostUsdPerKg: 1,
      tick: world.tick,
    });
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'supplies',
      kg: 400,
      avgCostUsdPerKg: 1,
      tick: world.tick,
    });
    const aircraft = state.fleet.find((row) => row.status === 'parked')!;
    aircraft.locationIcao = 'SBGR';
    const hostHold = holdWarehouseHaul(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBSP',
      commodityId: 'general',
      kg: 20,
    });
    const host = dispatchWarehouseHaulHold(state, world, {
      holdId: hostHold.hold.id,
      aircraftId: aircraft.id,
    });
    const supplies = holdWarehouseBridge(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBCT',
      commodityId: 'supplies',
      kg: 8,
      pilotPayUsd: 0,
    });
    const armed = attachDeskHoldToCargoTrip(state, world, {
      hostMissionId: host.mission.id,
      holdId: supplies.hold.id,
      maxCargoKg: 500,
    });
    const stored = state.missions.find((row) => row.id === armed.id)!;
    stored.status = 'dispatched';
    stored.staticId = 'ofp-1';
    stored.lastOfpCheck = {
      verdict: 'pass',
      summary: 'old',
      checkedAtIso: '2026-10-01T00:00:00.000Z',
      findings: [],
    };
    const secondBridge = holdWarehouseBridge(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBCT',
      commodityId: 'general',
      kg: 12,
      pilotPayUsd: 0,
    });
    const next = attachDeskHoldToCargoTrip(state, world, {
      hostMissionId: armed.id,
      holdId: secondBridge.hold.id,
      maxCargoKg: 500,
    });
    assert.equal(next.status, 'accepted');
    assert.equal(next.lastOfpCheck, undefined);
    assert.equal(next.staticId, undefined);
    assert.equal(next.throughLoads?.length, 1);
    assert.equal(next.throughLoads?.[0]?.cargoKg, 20);
    const rider = state.missions.find(
      (row) => row.id === next.throughLoads?.[0]?.missionId,
    )!;
    assert.equal(rider.lots.length, 2);
    assert.equal(rider.cargoKg, 20);
  });
});
