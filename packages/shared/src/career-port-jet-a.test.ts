import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSeedEconomyWorld } from './career-economy.js';
import { fuelTerminalSellableKg } from './career-fuel.js';
import { emptyMissionsStateV2, selectStarterHub } from './career-fleet.js';
import {
  quotePlayerMissionOfpFuel,
  purchasePlayerMissionOfpFuel,
} from './career-fleet.js';
import './career-ports.js';
import {
  claimPortConcession,
  PORT_CONCESSION_SHIPPED_KG,
} from './career-port-concessions.js';
import { acceptPortJetAHaul, startPortJetAReposition } from './career-port-jet-a-flights.js';
import {
  buyPortFboJetA,
  deliverPortJetAHaul,
  ensurePortJetAHaulOrders,
  fuelHaulFeeUsd,
  fuelHaulGapKg,
  portJetATankCapacityKg,
  refundPortJetAHaul,
} from './career-port-jet-a.js';
import { ensurePlayerWarehouses, WAREHOUSE_CAPACITY_KG } from './career-warehouse-stock.js';
import type { MissionIntent } from './types/career-economy.js';

function atSantos() {
  const world = createSeedEconomyWorld({ seed: 'port-jet-a' });
  const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
    pilotName: 'Jet',
    airframeTypeId: 'asobo-c172sp-cargo',
  });
  state.walletUsd = 2_000_000;
  const warehouses = ensurePlayerWarehouses(state);
  warehouses.warehouses.push({
    id: 'wh_sbgr_t3',
    icao: 'SBGR',
    capacityKg: WAREHOUSE_CAPACITY_KG[3],
    tier: 3,
    lifetimeShippedKg: PORT_CONCESSION_SHIPPED_KG,
  });
  claimPortConcession(state, world, { portId: 'BRSSZ' });
  return { world, state };
}

describe('port FBO Jet-A', () => {
  it('sizes the tank with the concession and clamps a haul to one trip', () => {
    assert.equal(portJetATankCapacityKg(1), 4_000);
    assert.ok(portJetATankCapacityKg(3) > portJetATankCapacityKg(2));
    assert.equal(fuelHaulGapKg(100_000, 120_000, 'spoke'), null);
    const qty = fuelHaulGapKg(1_000, 120_000, 'spoke');
    assert.equal(qty, 2_500);
    assert.equal(fuelHaulGapKg(1_000, 120_000, 'regional'), 5_000);
    assert.ok(fuelHaulFeeUsd(2_500, 400) < 2_500 * 2);
  });

  it('buys spot into the tank and stops at the cap', () => {
    const { world, state } = atSantos();
    const before = state.walletUsd;
    const bought = buyPortFboJetA(state, world, { portId: 'BRSSZ', kg: 50_000 });
    assert.equal(bought.kg, 4_000);
    assert.equal(state.playerPortConcessions?.[0]?.jetAKg, 4_000);
    assert.ok(state.walletUsd < before);
    assert.equal(
      state.ledger?.some((row) => row.kind === 'port_fbo_jet_a' && row.amountUsd < 0),
      true,
    );
    assert.throws(
      () => buyPortFboJetA(state, world, { portId: 'BRSSZ', kg: 100 }),
      /full/,
    );
  });

  it('draws the tank before spot and still sells hangar surplus', () => {
    const { world, state } = atSantos();
    buyPortFboJetA(state, world, { portId: 'BRSSZ', kg: 800 });
    const aircraft = state.fleet[0]!;
    aircraft.fuelKg = 20;
    const mission = {
      id: 'm-fuel',
      originIcao: 'SBGR',
      destIcao: 'SBKP',
      aircraftId: aircraft.id,
      aircraftClassId: aircraft.aircraftClassId,
      status: 'dispatched',
      contractPilot: false,
    } as MissionIntent;
    const quote = quotePlayerMissionOfpFuel(world, state, mission, {
      ofpId: 'ofp-1',
      requiredBlockFuelKg: 120,
    });
    assert.equal(quote.shortfallKg, 100);
    assert.equal(quote.tankKg, 100);
    assert.equal(quote.spotShortfallKg, 0);
    assert.equal(quote.uplift.costUsd, 0);
    const purchased = purchasePlayerMissionOfpFuel(world, state, mission, {
      ofpId: 'ofp-1',
      requiredBlockFuelKg: 120,
    });
    assert.equal(purchased.fuelDebitUsd, 0);
    assert.equal(aircraft.fuelKg, 120);
    assert.equal(state.playerPortConcessions?.[0]?.jetAKg, 700);

    aircraft.fuelKg = 140;
    const surplus = quotePlayerMissionOfpFuel(world, state, mission, {
      ofpId: 'ofp-2',
      requiredBlockFuelKg: 80,
    });
    assert.equal(surplus.surplusKg, 60);
    assert.equal(surplus.tankKg, 0);
    assert.ok(surplus.surplusCreditUsd > 0);
  });

  it('stocks the tank with an unpaid flight and pays a demand haul fee only', () => {
    const { world, state } = atSantos();
    const aircraft = state.fleet[0]!;
    const sbkp = world.airports.find((ap) => ap.icao === 'SBKP');
    assert.ok(sbkp?.inventory.fuel);
    sbkp!.inventory.fuel!.stockKg = sbkp!.inventory.fuel!.capacityKg * 0.9;
    aircraft.locationIcao = 'SBKP';
    state.pilotIcao = 'SBKP';
    const walletBefore = state.walletUsd;
    const started = startPortJetAReposition(state, world, {
      portId: 'BRSSZ',
      originIcao: 'SBKP',
      aircraftId: aircraft.id,
      kg: 1_000,
      pilotAccountId: 'acc_pilot',
      vaFlight: true,
    });
    assert.equal(started.mission.payUsd, 0);
    assert.equal(started.mission.cargoKg, 0);
    assert.equal(started.mission.pilotAccountId, 'acc_pilot');
    assert.equal(started.mission.vaFlight, true);
    assert.equal(started.kg, 1_000);
    assert.ok(state.walletUsd < walletBefore);
    const tankBefore = state.playerPortConcessions?.[0]?.jetAKg ?? 0;
    deliverPortJetAHaul(state, world, started.mission);
    assert.equal(state.playerPortConcessions?.[0]?.jetAKg, tankBefore + 1_000);

    const sellableBefore = fuelTerminalSellableKg(
      world.airports.find((ap) => ap.icao === 'SBGR')!,
    );
    const orderId = 'fj_test';
    world.demandOrders = [
      {
        id: orderId,
        portId: 'BRSSZ',
        destIcao: 'SBKP',
        commodityId: 'fuel',
        wantedKg: 500,
        remainingKg: 500,
        maxUnitPriceUsd: 0.5,
        arrivedAtTick: world.tick,
        expiresAtTick: world.tick + 100,
        status: 'open',
        fuelHaul: { pickupIcao: 'SBGR' },
      },
    ];
    aircraft.locationIcao = 'SBGR';
    aircraft.status = 'parked';
    state.pilotIcao = 'SBGR';
    const cash = state.walletUsd;
    const accepted = acceptPortJetAHaul(state, world, {
      orderId,
      aircraftId: aircraft.id,
    });
    assert.equal(accepted.payUsd, 250);
    assert.equal(accepted.mission.cargoKg, 0);
    assert.ok(state.walletUsd <= cash);
    const dest = world.airports.find((ap) => ap.icao === 'SBKP')!;
    const destBefore = dest.inventory.fuel!.stockKg;
    deliverPortJetAHaul(state, world, accepted.mission);
    assert.ok(dest.inventory.fuel!.stockKg >= destBefore);
    assert.ok(fuelTerminalSellableKg(
      world.airports.find((ap) => ap.icao === 'SBGR')!,
    ) <= sellableBefore);
    refundPortJetAHaul(state, world, accepted.mission);
    assert.equal(
      world.demandOrders.find((o) => o.id === orderId)?.status,
      'open',
    );
  });

  it('posts at most one restricted line for a short quiet field', () => {
    const world = createSeedEconomyWorld({ seed: 'port-jet-a-spawn' });
    const spoke = world.airports.find(
      (ap) =>
        (ap.hubTier ?? 'spoke') === 'spoke' &&
        ap.inventory.fuel &&
        ap.inventory.fuel.capacityKg > 10_000,
    );
    assert.ok(spoke);
    spoke!.inventory.fuel!.stockKg = 100;
    const spawned = ensurePortJetAHaulOrders(world);
    const lines = (world.demandOrders ?? []).filter(
      (o) => o.commodityId === 'fuel' && o.status === 'open',
    );
    assert.ok(spawned >= 1);
    assert.ok(lines.length <= 18);
    const mine = lines.find((o) => o.destIcao === spoke!.icao);
    assert.ok(mine?.fuelHaul?.pickupIcao);
    assert.ok(mine!.remainingKg >= 1_500);
    assert.ok(mine!.remainingKg <= 2_500);
    assert.equal(ensurePortJetAHaulOrders(world), 0);
  });
});
