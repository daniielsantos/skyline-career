import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createSeedEconomyWorld,
  emptyMissionsStateV2,
  executeAcceptLot,
  executeAcceptManifest,
  executeBuyAircraft,
  executeCancelMission,
  executeDepartFlight,
  listAircraftMarket,
  listMarketLots,
  selectStarterHub,
  tickEconomyN,
  type ShipmentLot,
} from './index.js';
import { economyDayIndex } from './career-weather.js';

function firstBookableLot(
  world: ReturnType<typeof createSeedEconomyWorld>,
  minAvailableKg = 1,
): ShipmentLot {
  const view = listMarketLots(world).find(
    (entry) => !entry.npcClaim?.crewNeeded && entry.availableKg >= minAvailableKg,
  );
  assert.ok(view, `no bookable lot with >= ${minAvailableKg} kg`);
  return view.lot;
}

describe('persist commands Accept / Depart / Buy', () => {
  it('AcceptLot replays without a second reservation', () => {
    const world = createSeedEconomyWorld({ seed: 'cmd-accept-idem' });
    tickEconomyN(world, 24);
    const lot = firstBookableLot(world, 4_000);
    const reservedBefore = lot.reservedKg;
    const company = emptyMissionsStateV2();
    const first = executeAcceptLot(world, company, {
      lotId: lot.id,
      cargoKg: 4_000,
      aircraftClassId: 'narrow_freighter',
      missionId: 'msn_accept_idem',
    });
    assert.equal(first.kind, 'applied');
    if (first.kind !== 'applied') return;
    const reservedAfter = world.lots.find((row) => row.id === lot.id)!.reservedKg;
    assert.equal(reservedAfter, reservedBefore + 4_000);
    assert.equal(company.missions.length, 1);
    const second = executeAcceptLot(world, company, {
      lotId: lot.id,
      cargoKg: 4_000,
      aircraftClassId: 'narrow_freighter',
      missionId: 'msn_accept_idem_retry',
    });
    assert.equal(second.kind, 'replay');
    assert.equal(world.lots.find((row) => row.id === lot.id)!.reservedKg, reservedAfter);
    assert.equal(company.missions.length, 1);
    if (second.kind === 'replay') {
      assert.equal(second.mission.id, first.mission.id);
    }
  });

  it('AcceptManifest replays when the staged lots are already on the flight', () => {
    const world = createSeedEconomyWorld({ seed: 'cmd-manifest-idem' });
    tickEconomyN(world, 24);
    const lot = firstBookableLot(world, 3_000);
    const company = emptyMissionsStateV2();
    const first = executeAcceptManifest(world, company, {
      lines: [{ lotId: lot.id, cargoKg: 3_000 }],
      aircraftClassId: 'narrow_freighter',
      missionId: 'msn_manifest_idem',
    });
    assert.equal(first.kind, 'applied');
    const reserved = world.lots.find((row) => row.id === lot.id)!.reservedKg;
    const second = executeAcceptManifest(world, company, {
      lines: [{ lotId: lot.id, cargoKg: 3_000 }],
      aircraftClassId: 'narrow_freighter',
      intoMissionId: first.kind === 'applied' ? first.mission.id : undefined,
    });
    assert.equal(second.kind, 'replay');
    assert.equal(world.lots.find((row) => row.id === lot.id)!.reservedKg, reserved);
  });

  it('DepartFlight replays without a second fuel debit', () => {
    const world = createSeedEconomyWorld({ seed: 'cmd-depart-idem' });
    tickEconomyN(world, 24);
    const lot = firstBookableLot(world, 2_000);
    const company = emptyMissionsStateV2();
    company.walletUsd = 50_000;
    const accepted = executeAcceptLot(world, company, {
      lotId: lot.id,
      cargoKg: 2_000,
      aircraftClassId: 'narrow_freighter',
      missionId: 'msn_depart_idem',
    });
    assert.equal(accepted.kind, 'applied');
    if (accepted.kind !== 'applied') return;
    company.missions[0] = { ...accepted.mission, status: 'dispatched' };
    const first = executeDepartFlight(world, company, {
      missionId: accepted.mission.id,
    });
    assert.equal(first.kind, 'applied');
    if (first.kind !== 'applied') return;
    const walletAfter = company.walletUsd;
    const fuel = first.result.fuelDebitUsd;
    assert.ok(fuel > 0);
    const second = executeDepartFlight(world, company, {
      missionId: accepted.mission.id,
    });
    assert.equal(second.kind, 'replay');
    assert.equal(company.walletUsd, walletAfter);
    if (second.kind === 'replay') {
      assert.equal(second.result.fuelDebitUsd, 0);
      assert.equal(second.result.mission.status, 'in_flight');
    }
  });

  it('BuyAircraft replays without a second wallet debit', () => {
    const world = createSeedEconomyWorld({ seed: 'cmd-buy-idem' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'BuyerCmd',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.aircraftMarketDemandDay = economyDayIndex(world.tick);
    const listings = listAircraftMarket(state, world);
    const usedGa = listings.find(
      (row) => row.kind === 'used' && row.aircraftClassId === 'light_ga',
    );
    assert.ok(usedGa, 'expected a used light_ga listing');
    state.walletUsd = usedGa!.askingUsd + 5_000;
    const first = executeBuyAircraft(world, state, { listingId: usedGa!.id });
    assert.equal(first.kind, 'applied');
    if (first.kind !== 'applied') return;
    const walletAfter = state.walletUsd;
    const fleetLen = state.fleet.length;
    const second = executeBuyAircraft(world, state, { listingId: usedGa!.id });
    assert.equal(second.kind, 'replay');
    assert.equal(state.walletUsd, walletAfter);
    assert.equal(state.fleet.length, fleetLen);
    if (second.kind === 'replay') {
      assert.equal(second.debitUsd, 0);
      assert.equal(second.aircraft.registration, first.aircraft.registration);
    }
  });

  it('CancelMission replays without releasing the lot twice', () => {
    const world = createSeedEconomyWorld({ seed: 'cmd-cancel-idem' });
    tickEconomyN(world, 24);
    const lot = firstBookableLot(world, 2_000);
    const company = emptyMissionsStateV2();
    const accepted = executeAcceptLot(world, company, {
      lotId: lot.id,
      cargoKg: 2_000,
      aircraftClassId: 'narrow_freighter',
      missionId: 'msn_cancel_idem',
    });
    assert.equal(accepted.kind, 'applied');
    if (accepted.kind !== 'applied') return;
    const first = executeCancelMission(world, company, {
      missionId: accepted.mission.id,
    });
    assert.equal(first.kind, 'applied');
    const reservedAfter = world.lots.find((row) => row.id === lot.id)!.reservedKg;
    const second = executeCancelMission(world, company, {
      missionId: accepted.mission.id,
    });
    assert.equal(second.kind, 'replay');
    assert.equal(
      world.lots.find((row) => row.id === lot.id)!.reservedKg,
      reservedAfter,
    );
    if (second.kind === 'replay') {
      assert.equal(second.mission.status, 'cancelled');
    }
  });
});
