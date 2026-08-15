/**
 * Player FBO Tier-1 + bonded contract holds.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buyFboTier1,
  cancelFboHold,
  FBO_CAPACITY_KG,
  FBO_T1_CAPACITY_KG,
  fboParkingFeeMult,
  fboServiceCostMult,
  holdLotAtFbo,
  playerFboSnapshot,
  quoteFboBuyUsd,
  quoteFboTier1BuyUsd,
  quoteFboRerouteUsd,
  quoteFboReroutePayAfterUsd,
  releaseFboHoldToMission,
  rerouteFboHold,
  splitFboHold,
  returnMissionToFboHold,
  settleFboHoldExpiries,
  settleFboStorageFees,
  upgradeFboToTier2,
  buyFboSpot,
  sellFboSpot,
} from './career-fbo.js';
import { normalizeCareerCargoOps } from './career-cargo-ops.js';
import { quoteHangarParkingUsdPerDay, resolveHangarParkingUsdPerDay } from './career-hangar-fees.js';
import {
  createSeedEconomyWorld,
  tickEconomyN,
  ensureSeedMarketFormed,
  routeDistanceNm,
} from './career-economy.js';
import { emptyMissionsStateV2, selectStarterHub } from './career-fleet.js';
import type { CareerEconomyWorld, ShipmentLot } from './types/career-economy.js';

// Post-calibration SBGR is a Value source / Dry sink, so it no longer exports
// general/supplies naturally. Starter pilots can only lift Dry (heavier cargo is
// locked), so these FBO tests inject a deterministic short-haul Dry contract at
// SBGR rather than depending on the equilibrium board. SBGR→SBGL is ~180 nm, so
// it satisfies every short-haul (≤850 nm) predicate below.
function primeSbgrDryLot(
  world: CareerEconomyWorld,
  overrides: Partial<ShipmentLot> = {},
): ShipmentLot {
  const lot: ShipmentLot = {
    id: `lot_test_dry_${world.lots.length}`,
    commodityId: 'general',
    originIcao: 'SBGR',
    destIcao: 'SBGL',
    quantityKg: 6_000,
    reservedKg: 0,
    createdAtTick: world.tick,
    expiresAtTick: world.tick + 96,
    payUsd: 4_000,
    basePayUsd: 4_000,
    urgency: 'normal',
    reason: 'test dry source',
    status: 'available',
    ...overrides,
  };
  world.lots.push(lot);
  return lot;
}

describe('player FBO', () => {
  it('buys T1 only at home hub and rejects a second purchase', () => {
    const world = createSeedEconomyWorld({ seed: 'fbo-buy' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'FboBuyer',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    const price = playerFboSnapshot(state, world).homeBuyUsd;
    assert.ok(price != null && price > 0);

    assert.throws(
      () => buyFboTier1(state, world, 'SBPA'),
      /home hub/i,
    );

    const bought = buyFboTier1(state, world, 'SBGR');
    assert.equal(bought.fbo.icao, 'SBGR');
    assert.equal(bought.fbo.capacityKg, FBO_T1_CAPACITY_KG);
    assert.equal(state.playerFbos!.fbos.length, 1);
    assert.ok(
      (state.ledger ?? []).some((e) => e.kind === 'fbo_buy'),
    );

    state.walletUsd = 500_000;
    assert.throws(
      () => buyFboTier1(state, world, 'SBGR'),
      /maximum|already/i,
    );
  });

  it('holds a lot without publishing inboundPending; release creates mission + inbound', () => {
    const world = createSeedEconomyWorld({ seed: 'fbo-hold' });
    ensureSeedMarketFormed(world);
    tickEconomyN(world, 48);
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'FboHold',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    buyFboTier1(state, world, 'SBGR');

    primeSbgrDryLot(world);
    const lot = world.lots.find(
      (l) =>
        l.originIcao === 'SBGR' &&
        (l.status === 'available' || l.status === 'reserved') &&
        (l.commodityId === 'general' || l.commodityId === 'supplies') &&
        l.quantityKg - l.reservedKg >= 100,
    );
    assert.ok(lot, 'expected an outbound lot from SBGR');

    const beforeInbound = (world.inboundPending ?? []).length;
    const cargoKg = Math.min(500, lot!.quantityKg - lot!.reservedKg);
    const { hold } = holdLotAtFbo(state, world, {
      lotId: lot!.id,
      cargoKg,
    });
    assert.equal(hold.originIcao, 'SBGR');
    assert.equal(state.playerFbos!.holds.length, 1);
    assert.ok(lot!.reservedKg >= cargoKg);
    assert.equal(
      (world.inboundPending ?? []).length,
      beforeInbound,
      'hold must not soft-fill destination',
    );

    assert.throws(
      () =>
        holdLotAtFbo(state, world, {
          lotId: world.lots.find((l) => l.commodityId === 'perishables')?.id ?? 'missing',
        }),
      /perish|Unknown/i,
    );

    const { mission } = releaseFboHoldToMission(state, world, {
      holdId: hold.id,
      aircraftClassId: 'light_ga',
      maxCargoKg: Math.max(cargoKg, 450),
    });
    assert.equal(mission.status, 'accepted');
    assert.equal(state.playerFbos!.holds.length, 0);
    assert.ok(state.missions.some((m) => m.id === mission.id));
    assert.ok(
      (world.inboundPending ?? []).some((row) => row.missionId === mission.id),
      'release must publish inbound',
    );
  });

  it('rejects hold when capacity is exceeded', () => {
    const world = createSeedEconomyWorld({ seed: 'fbo-cap' });
    ensureSeedMarketFormed(world);
    tickEconomyN(world, 48);
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'FboCap',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    buyFboTier1(state, world, 'SBGR');

    primeSbgrDryLot(world);
    const lot = world.lots.find(
      (l) =>
        l.originIcao === 'SBGR' &&
        l.status === 'available' &&
        (l.commodityId === 'general' || l.commodityId === 'supplies') &&
        l.quantityKg - l.reservedKg >= 200,
    );
    assert.ok(lot);
    state.playerFbos!.fbos[0]!.capacityKg = 100;
    assert.throws(
      () =>
        holdLotAtFbo(state, world, {
          lotId: lot!.id,
          cargoKg: 200,
        }),
      /full/i,
    );
  });

  it('cancels a hold and releases the lot reservation', () => {
    const world = createSeedEconomyWorld({ seed: 'fbo-cancel' });
    ensureSeedMarketFormed(world);
    tickEconomyN(world, 48);
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'FboCancel',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    buyFboTier1(state, world, 'SBGR');
    primeSbgrDryLot(world);
    const lot = world.lots.find(
      (l) =>
        l.originIcao === 'SBGR' &&
        l.status === 'available' &&
        (l.commodityId === 'general' || l.commodityId === 'supplies') &&
        l.quantityKg - l.reservedKg >= 100,
    );
    assert.ok(lot);
    const reservedBefore = lot!.reservedKg;
    const { hold } = holdLotAtFbo(state, world, {
      lotId: lot!.id,
      cargoKg: 100,
    });
    assert.equal(lot!.reservedKg, reservedBefore + 100);
    cancelFboHold(state, world, hold.id);
    assert.equal(state.playerFbos!.holds.length, 0);
    assert.equal(lot!.reservedKg, reservedBefore);
  });

  it('charges storage fees and expires overdue holds with penalty', () => {
    const world = createSeedEconomyWorld({ seed: 'fbo-fees' });
    ensureSeedMarketFormed(world);
    tickEconomyN(world, 48);
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'FboFees',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    buyFboTier1(state, world, 'SBGR');
    primeSbgrDryLot(world);
    const lot = world.lots.find(
      (l) =>
        l.originIcao === 'SBGR' &&
        (l.status === 'available' || l.status === 'reserved') &&
        (l.commodityId === 'general' || l.commodityId === 'supplies') &&
        l.quantityKg - l.reservedKg >= 200,
    );
    assert.ok(lot, 'expected a Dry lot at SBGR for FBO hold fees');
    holdLotAtFbo(state, world, {
      lotId: lot!.id,
      cargoKg: 200,
    });

    const beforeFees = state.walletUsd;
    const storage = settleFboStorageFees(state, {
      fromTick: world.tick,
      toTick: world.tick + 96, // one economy day
    });
    assert.ok(storage.debitUsd > 0);
    assert.equal(state.walletUsd, beforeFees - storage.debitUsd);
    assert.ok((state.ledger ?? []).some((e) => e.kind === 'fbo_storage'));

    const held = state.playerFbos!.holds[0]!;
    held.deadlineTick = world.tick; // force expire on next settle
    const beforeExp = state.walletUsd;
    const exp = settleFboHoldExpiries(state, world);
    assert.equal(exp.expired.length, 1);
    assert.ok(exp.penaltyUsd > 0);
    assert.ok(state.walletUsd < beforeExp);
    assert.equal(state.playerFbos!.holds.length, 0);
    assert.ok((state.ledger ?? []).some((e) => e.kind === 'fbo_hold_expire'));
  });

  it('upgrades T1→T2, raises capacity, and applies parking/service perks', () => {
    const world = createSeedEconomyWorld({ seed: 'fbo-t2' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'FboUpgrade',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    const { fbo } = buyFboTier1(state, world, 'SBGR');
    assert.equal(fbo.tier, 1);
    assert.equal(fboParkingFeeMult(state, 'SBGR'), 0.85);
    assert.equal(fboServiceCostMult(state, 'SBGR'), 0.95);

    const acf = state.fleet[0]!;
    acf.locationIcao = 'SBGR';
    acf.status = 'parked';
    const basePark = quoteHangarParkingUsdPerDay(acf.aircraftClassId, 'major');
    const withPerk = resolveHangarParkingUsdPerDay(acf, world, state);
    assert.equal(withPerk, Math.round(basePark * 0.85 * 100) / 100);

    const snap = playerFboSnapshot(state, world);
    assert.ok(snap.fbos[0]!.canUpgradeToTier2);
    assert.ok((snap.fbos[0]!.upgradeUsd ?? 0) > 0);

    const upgraded = upgradeFboToTier2(state, world, fbo.id);
    assert.equal(upgraded.fbo.tier, 2);
    assert.equal(upgraded.fbo.capacityKg, FBO_CAPACITY_KG[2]);
    assert.equal(fboParkingFeeMult(state, 'SBGR'), 0.7);
    assert.equal(fboServiceCostMult(state, 'SBGR'), 0.9);
    assert.throws(
      () => upgradeFboToTier2(state, world, fbo.id),
      /already Tier/i,
    );
  });

  it('allows a second FBO at another hub with fleet + Cargo Ops Value', () => {
    const world = createSeedEconomyWorld({ seed: 'fbo-second' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'FboSecond',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 1_000_000;
    buyFboTier1(state, world, 'SBGR');

    assert.throws(
      () => buyFboTier1(state, world, 'SBPA'),
      /owned aircraft|Cargo Ops Value/i,
    );

    // Second owned airframe
    state.fleet.push({
      ...state.fleet[0]!,
      id: 'acf_second',
      ownership: 'owned',
      status: 'parked',
      locationIcao: 'SBPA',
    });
    assert.throws(() => buyFboTier1(state, world, 'SBPA'), /Cargo Ops Value/i);

    state.cargoOps = normalizeCareerCargoOps(state.cargoOps);
    state.cargoOps.commodities.electronics.unlocked = true;

    const homePrice = quoteFboBuyUsd(state, world, 'SBGR'); // already owned — N/A
    void homePrice;
    const second = buyFboTier1(state, world, 'SBPA');
    assert.equal(second.fbo.icao, 'SBPA');
    assert.equal(state.playerFbos!.fbos.length, 2);
    assert.ok(second.debitUsd > quoteFboTier1BuyUsd(world, 'SBPA'));

    // Third FBO gates: T2 + 3 owned aircraft + Cargo Ops Time
    assert.throws(
      () => buyFboTier1(state, world, 'SBGL'),
      /Tier 2|owned aircraft|perishables|Time/i,
    );

    upgradeFboToTier2(state, world, state.playerFbos!.fbos[0]!.id);
    state.fleet.push({
      ...state.fleet[0]!,
      id: 'acf_third',
      ownership: 'owned',
      status: 'parked',
      locationIcao: 'SBGL',
    });
    assert.throws(() => buyFboTier1(state, world, 'SBGL'), /Time|perishables/i);

    state.cargoOps.commodities.perishables.unlocked = true;
    const third = buyFboTier1(state, world, 'SBGL');
    assert.equal(third.fbo.icao, 'SBGL');
    assert.equal(state.playerFbos!.fbos.length, 3);
    assert.ok(third.debitUsd > second.debitUsd);

    assert.throws(
      () => buyFboTier1(state, world, 'SBSV'),
      /already owns 3/i,
    );
  });

  it('reroutes a hold for a fee; haircut only when not longer', () => {
    const world = createSeedEconomyWorld({ seed: 'fbo-reroute' });
    ensureSeedMarketFormed(world);
    tickEconomyN(world, 48);
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'Rerouter',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    buyFboTier1(state, world, 'SBGR');
    primeSbgrDryLot(world);
    const lot = world.lots.find(
      (l) =>
        l.originIcao === 'SBGR' &&
        l.destIcao !== 'SBPA' &&
        (l.commodityId === 'general' || l.commodityId === 'supplies') &&
        (l.status === 'available' || l.status === 'reserved') &&
        l.quantityKg - l.reservedKg >= 100,
    );
    assert.ok(lot, 'expected a Dry lot at SBGR to reroute');
    const { hold } = holdLotAtFbo(state, world, {
      lotId: lot!.id,
      cargoKg: Math.min(300, lot!.quantityKg - lot!.reservedKg),
    });
    const payBefore = hold.payUsd;
    const oldNm = routeDistanceNm(world, hold.originIcao, hold.destIcao) ?? 0;
    const newNm = routeDistanceNm(world, hold.originIcao, 'SBPA') ?? 0;
    const longer = newNm > oldNm;
    const fee = quoteFboRerouteUsd(world, hold, 'SBPA');
    const payQuote = quoteFboReroutePayAfterUsd(world, hold, 'SBPA');
    assert.ok(fee >= 75);
    assert.equal(payQuote.haircutApplied, !longer);
    if (longer) {
      assert.equal(payQuote.bumpApplied, payQuote.bumpFrac > 0);
      assert.ok(payQuote.payAfterUsd >= payBefore);
      if (newNm - oldNm > 0) {
        assert.ok(payQuote.payAfterUsd > payBefore);
      }
    } else {
      assert.equal(payQuote.bumpApplied, false);
      assert.ok(payQuote.payAfterUsd < payBefore);
    }
    const walletBefore = state.walletUsd;
    const result = rerouteFboHold(state, world, {
      holdId: hold.id,
      destIcao: 'SBPA',
    });
    assert.equal(result.hold.destIcao, 'SBPA');
    assert.equal(result.haircutApplied, !longer);
    assert.equal(result.bumpApplied, longer && payQuote.bumpFrac > 0);
    assert.equal(result.hold.payUsd, payQuote.payAfterUsd);
    assert.ok(
      result.hold.distanceNm !== undefined && result.hold.distanceNm > 0,
    );
    assert.equal(state.walletUsd, walletBefore - fee);
    assert.ok((state.ledger ?? []).some((e) => e.kind === 'fbo_reroute'));
  });

  it('splits a hold into sister missions and leaves remainder bonded', () => {
    const world = createSeedEconomyWorld({ seed: 'fbo-split' });
    ensureSeedMarketFormed(world);
    tickEconomyN(world, 48);
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'Splitter',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    buyFboTier1(state, world, 'SBGR');

    primeSbgrDryLot(world);
    const lot = world.lots.find(
      (l) =>
        l.originIcao === 'SBGR' &&
        (l.commodityId === 'general' || l.commodityId === 'supplies') &&
        (l.status === 'available' || l.status === 'reserved') &&
        l.quantityKg - l.reservedKg >= 600 &&
        (routeDistanceNm(world, l.originIcao, l.destIcao) ?? 9_999) <= 850,
    );
    assert.ok(lot, 'expected a short-haul Dry lot at SBGR for FBO split');
    const cargoKg = Math.min(800, lot!.quantityKg - lot!.reservedKg);
    const { hold } = holdLotAtFbo(state, world, {
      lotId: lot!.id,
      cargoKg,
    });
    const payBefore = hold.payUsd;
    const reservedBefore = lot!.reservedKg;

    const acf1 = state.fleet[0]!;
    // Split legs need Caravan range/payload — starter GA is too short-legged.
    acf1.aircraftClassId = 'light_turboprop';
    acf1.airframeTypeId = 'c208-caravan-cargo';
    acf1.label = 'Cessna 208B Grand Caravan';
    acf1.status = 'parked';
    acf1.locationIcao = 'SBGR';
    const acf2 = {
      ...acf1,
      id: `${acf1.id}_b`,
      label: `${acf1.label} B`,
      assignedMissionId: undefined,
    };
    state.fleet.push(acf2);

    const legA = Math.min(250, Math.floor(cargoKg / 3));
    const legB = Math.min(200, Math.floor(cargoKg / 3));
    assert.ok(legA > 0 && legB > 0);

    const beforeInbound = (world.inboundPending ?? []).length;
    const result = splitFboHold(state, world, {
      holdId: hold.id,
      legs: [
        { aircraftId: acf1.id, cargoKg: legA },
        { aircraftId: acf2.id, cargoKg: legB },
      ],
    });

    assert.equal(result.missions.length, 2);
    assert.equal(result.allocatedKg, legA + legB);
    assert.equal(result.remainingKg, cargoKg - legA - legB);
    assert.ok(result.hold);
    assert.equal(result.hold!.cargoKg, cargoKg - legA - legB);
    assert.equal(
      result.missions[0]!.cargoKg + result.missions[1]!.cargoKg + result.hold!.cargoKg,
      cargoKg,
    );
    assert.ok(
      Math.abs(
        result.missions[0]!.payUsd +
          result.missions[1]!.payUsd +
          result.hold!.payUsd -
          payBefore,
      ) < 0.02,
    );
    assert.equal(lot!.reservedKg, reservedBefore);
    assert.equal(acf1.status, 'assigned');
    assert.equal(acf2.status, 'assigned');
    assert.equal(
      (world.inboundPending ?? []).length,
      beforeInbound + 2,
      'each sister mission soft-fills destination',
    );

    assert.throws(
      () =>
        splitFboHold(state, world, {
          holdId: result.hold!.id,
          legs: [{ aircraftId: acf1.id, cargoKg: 50 }],
        }),
      /parked/i,
    );
  });

  it('rejects split legs over aircraft cargo capacity', () => {
    const world = createSeedEconomyWorld({ seed: 'fbo-split-cap' });
    ensureSeedMarketFormed(world);
    tickEconomyN(world, 48);
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'CapGate',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    buyFboTier1(state, world, 'SBGR');
    primeSbgrDryLot(world);
    const lot = world.lots.find(
      (l) =>
        l.originIcao === 'SBGR' &&
        (l.commodityId === 'general' || l.commodityId === 'supplies') &&
        (l.status === 'available' || l.status === 'reserved') &&
        l.quantityKg - l.reservedKg >= 200,
    );
    assert.ok(lot);
    const { hold } = holdLotAtFbo(state, world, {
      lotId: lot!.id,
      cargoKg: Math.min(400, lot!.quantityKg - lot!.reservedKg),
    });
    const acf = state.fleet[0]!;
    acf.status = 'parked';
    acf.locationIcao = 'SBGR';
    assert.throws(
      () =>
        splitFboHold(state, world, {
          holdId: hold.id,
          legs: [{ aircraftId: acf.id, cargoKg: 9_999_999 }],
        }),
      /max cargo/i,
    );
  });

  it('returns a split mission cargo into the bonded hold', () => {
    const world = createSeedEconomyWorld({ seed: 'fbo-return-msn' });
    ensureSeedMarketFormed(world);
    tickEconomyN(world, 48);
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'ReturnHold',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    buyFboTier1(state, world, 'SBGR');
    primeSbgrDryLot(world);
    // Take the deepest short-haul Dry lot rather than the first match — how much
    // NPCs have already claimed varies with the wall clock.
    const lot = world.lots
      .filter(
        (l) =>
          l.originIcao === 'SBGR' &&
          (l.commodityId === 'general' || l.commodityId === 'supplies') &&
          (l.status === 'available' || l.status === 'reserved') &&
          l.quantityKg - l.reservedKg >= 400 &&
          (routeDistanceNm(world, l.originIcao, l.destIcao) ?? 9_999) <= 850,
      )
      .sort(
        (a, b) => b.quantityKg - b.reservedKg - (a.quantityKg - a.reservedKg),
      )[0];
    assert.ok(lot, 'expected a short-haul Dry lot at SBGR for the split return');
    const cargoKg = Math.min(600, lot!.quantityKg - lot!.reservedKg);
    const { hold } = holdLotAtFbo(state, world, {
      lotId: lot!.id,
      cargoKg,
    });
    const reservedBefore = lot!.reservedKg;
    const acf1 = state.fleet[0]!;
    // Split legs need Caravan range/payload — starter GA is too short-legged.
    acf1.aircraftClassId = 'light_turboprop';
    acf1.airframeTypeId = 'c208-caravan-cargo';
    acf1.label = 'Cessna 208B Grand Caravan';
    acf1.status = 'parked';
    acf1.locationIcao = 'SBGR';
    const acf2 = {
      ...acf1,
      id: `${acf1.id}_b`,
      label: `${acf1.label} B`,
      assignedMissionId: undefined,
    };
    state.fleet.push(acf2);
    const legA = Math.min(200, Math.floor(cargoKg / 3));
    const legB = Math.min(150, Math.floor(cargoKg / 3));
    const split = splitFboHold(state, world, {
      holdId: hold.id,
      legs: [
        { aircraftId: acf1.id, cargoKg: legA },
        { aircraftId: acf2.id, cargoKg: legB },
      ],
    });
    const remBefore = split.hold!.cargoKg;
    const returned = returnMissionToFboHold(state, world, split.missions[0]!.id);
    assert.equal(returned.mission.status, 'cancelled');
    assert.equal(returned.merged, true);
    assert.equal(returned.hold.cargoKg, remBefore + legA);
    assert.equal(lot!.reservedKg, reservedBefore);
    assert.equal(acf1.status, 'parked');
    assert.equal(
      state.playerFbos!.holds.filter((h) => h.lotId === lot!.id).length,
      1,
    );
  });

  it('rejects removed FBO spot buy/sell', () => {
    const world = createSeedEconomyWorld({ seed: 'fbo-spot' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'SpotTrader',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    buyFboTier1(state, world, 'SBGR');
    assert.throws(
      () =>
        buyFboSpot(state, world, {
          icao: 'SBGR',
          commodityId: 'general',
          kg: 500,
        }),
      /removed/i,
    );
    assert.throws(
      () =>
        sellFboSpot(state, world, {
          icao: 'SBGR',
          commodityId: 'general',
          kg: 200,
        }),
      /removed/i,
    );
  });

  it('storage fees ignore wiped spot piles (bonded only)', () => {
    const world = createSeedEconomyWorld({ seed: 'fbo-spot-fee' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'SpotFee',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    buyFboTier1(state, world, 'SBGR');
    state.playerFbos!.stock = [
      {
        id: 'legacy',
        fboId: state.playerFbos!.fbos[0]!.id,
        commodityId: 'general',
        kg: 400,
        avgCostUsdPerKg: 1,
        acquiredAtTick: world.tick,
      },
    ];
    const before = state.walletUsd;
    const storage = settleFboStorageFees(state, {
      fromTick: world.tick,
      toTick: world.tick + 96,
    });
    assert.equal(storage.debitUsd, 0);
    assert.equal(state.walletUsd, before);
  });
});
