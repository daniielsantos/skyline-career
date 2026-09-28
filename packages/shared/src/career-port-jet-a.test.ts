import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSeedEconomyWorld } from './career-economy.js';
import { departMission } from './career-mission.js';
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
import {
  acceptPortJetAHaul,
  setPortJetAStockKg,
  startPortJetAReposition,
} from './career-port-jet-a-flights.js';
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
    const draw = state.ledger?.find((row) => row.note?.startsWith('From tank'));
    assert.equal(draw?.amountUsd, 0);
    assert.equal(draw?.kind, 'port_fbo_jet_a');
    assert.match(draw?.note ?? '', /100 kg/);
    assert.equal(draw?.icao, 'SBGR');

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
    assert.equal(started.kg, 0);
    assert.equal(started.costUsd, 0);
    assert.equal(started.mission.cargoKg, 0);
    assert.equal(state.walletUsd, walletBefore);
    const ceiling = started.mission.fuelHaul?.maxKg ?? 0;
    assert.ok(ceiling > 0);
    assert.ok(ceiling < 1_000);
    assert.equal(started.mission.pilotAccountId, 'acc_pilot');
    assert.equal(started.mission.vaFlight, true);
    const bought = setPortJetAStockKg(state, world, {
      missionId: started.mission.id,
      kg: ceiling,
    });
    assert.equal(bought.kg, ceiling);
    assert.equal(bought.mission.cargoKg, ceiling);
    assert.ok(state.walletUsd < walletBefore);
    const beforeSlider = state.walletUsd;
    const half = Math.max(1, Math.floor(ceiling / 2));
    const reduced = setPortJetAStockKg(state, world, {
      missionId: started.mission.id,
      kg: half,
    });
    assert.equal(reduced.kg, half);
    assert.equal(reduced.mission.cargoKg, half);
    assert.ok(state.walletUsd > beforeSlider);
    const raised = setPortJetAStockKg(state, world, {
      missionId: started.mission.id,
      kg: ceiling,
    });
    assert.equal(raised.kg, ceiling);
    assert.equal(raised.mission.cargoKg, ceiling);
    assert.ok(Math.abs(state.walletUsd - beforeSlider) <= 1);
    const tankBefore = state.playerPortConcessions?.[0]?.jetAKg ?? 0;
    deliverPortJetAHaul(state, world, started.mission);
    assert.equal(
      state.playerPortConcessions?.[0]?.jetAKg,
      tankBefore + ceiling,
    );

    const sellableBefore = fuelTerminalSellableKg(
      world.airports.find((ap) => ap.icao === 'SBGR')!,
    );
    const orderId = 'fj_test';
    aircraft.locationIcao = 'SBGR';
    aircraft.status = 'parked';
    state.pilotIcao = 'SBGR';
    world.demandOrders = [
      {
        id: 'fj_heavy',
        portId: 'BRSSZ',
        destIcao: 'SBKP',
        commodityId: 'fuel',
        wantedKg: 5_000,
        remainingKg: 5_000,
        maxUnitPriceUsd: 0.5,
        arrivedAtTick: world.tick,
        expiresAtTick: world.tick + 100,
        status: 'open',
        fuelHaul: { pickupIcao: 'SBGR' },
      },
      {
        id: orderId,
        portId: 'BRSSZ',
        destIcao: 'SBKP',
        commodityId: 'fuel',
        wantedKg: 80,
        remainingKg: 80,
        maxUnitPriceUsd: 0.5,
        arrivedAtTick: world.tick,
        expiresAtTick: world.tick + 100,
        status: 'open',
        fuelHaul: { pickupIcao: 'SBGR' },
      },
    ];
    assert.throws(
      () =>
        acceptPortJetAHaul(state, world, {
          orderId: 'fj_heavy',
          aircraftId: aircraft.id,
        }),
      /can carry/,
    );
    assert.equal(aircraft.status, 'parked');
    const cash = state.walletUsd;
    const accepted = acceptPortJetAHaul(state, world, {
      orderId,
      aircraftId: aircraft.id,
    });
    assert.equal(accepted.payUsd, 40);
    assert.equal(accepted.mission.cargoKg, 80);
    assert.equal(accepted.mission.lots?.[0]?.cargoKg, 80);
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

  it('stocks up to the tank when the aircraft and the hub can cover it', () => {
    const { world, state } = atSantos();
    const light = state.fleet[0]!;
    const sbkp = world.airports.find((ap) => ap.icao === 'SBKP');
    assert.ok(sbkp?.inventory.fuel);
    sbkp!.inventory.fuel!.stockKg = sbkp!.inventory.fuel!.capacityKg * 0.9;
    state.fleet.push({
      ...light,
      id: 'acf_heavy',
      registration: 'N737TS',
      airframeTypeId: 'asobo-737-max-8-passengers',
      aircraftClassId: 'narrow_freighter',
      locationIcao: 'SBKP',
      status: 'parked',
      fuelKg: 0,
    });
    state.pilotIcao = 'SBKP';
    const started = startPortJetAReposition(state, world, {
      portId: 'BRSSZ',
      originIcao: 'SBKP',
      aircraftId: 'acf_heavy',
    });
    assert.equal(started.mission.cargoKg, 0);
    assert.equal(started.costUsd, 0);
    assert.equal(started.mission.fuelHaul?.maxKg, portJetATankCapacityKg(1));
    assert.ok((started.mission.fuelHaul?.maxKg ?? 0) > 2_500);
    assert.throws(
      () => departMission(world, started.mission, { fleet: state }),
      /manifest/,
    );
    const bought = setPortJetAStockKg(state, world, {
      missionId: started.mission.id,
      kg: started.mission.fuelHaul?.maxKg ?? 0,
    });
    assert.equal(bought.kg, portJetATankCapacityKg(1));
    assert.ok(bought.mission.lots?.[0]?.shipmentLotId.startsWith('jeta_'));
    const departed = departMission(world, bought.mission, { fleet: state });
    assert.equal(departed.mission.status, 'in_flight');
    bought.mission.status = 'dispatched';
    assert.throws(
      () =>
        setPortJetAStockKg(state, world, {
          missionId: bought.mission.id,
          kg: 1,
        }),
      /flight plan is open/,
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
