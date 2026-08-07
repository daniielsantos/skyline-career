import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyAircraftHoursAfterMission,
  clearAircraftMaintenance,
  conditionBucketFromPct,
  conditionPctsForListing,
  CRITICAL_CONDITION_PCT,
  ensureAircraftConditionPcts,
  fuelBurnMultFromCondition,
  inspectionCostUsd,
  INSPECTION_INTERVAL_HOURS,
  MX_FUEL_BURN_MULT_MAX,
  padOfpBlockFuelKgForMx,
  repairAircraftCondition,
} from './career-aircraft-maintenance.js';
import { AIRCRAFT_MSRP_USD } from './career-aircraft-pricing.js';
import { createSeedEconomyWorld } from './career-economy.js';
import { emptyMissionsStateV2, selectStarterHub } from './career-fleet.js';
import {
  clearAircraftMaintenanceWithParts,
  repairAircraftConditionWithParts,
} from './career-mro.js';

describe('aircraft wear + maintenance', () => {
  it('migrates bucket condition into AF/eng percentages', () => {
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'WearMig',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    const acf = state.fleet[0]!;
    delete acf.airframeConditionPct;
    delete acf.engineConditionPct;
    delete acf.hoursSinceInspection;
    acf.condition = 'fair';
    ensureAircraftConditionPcts(acf);
    assert.equal(acf.condition, 'fair');
    assert.ok((acf.airframeConditionPct ?? 0) >= 55);
    assert.ok((acf.airframeConditionPct ?? 0) < 75);
  });

  it('wear reduces condition pct after block hours', () => {
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBPA', {
      pilotName: 'WearFly',
      airframeTypeId: 'asobo-c172sp-cargo',
      condition: 'good',
    });
    const acf = state.fleet[0]!;
    ensureAircraftConditionPcts(acf);
    const afBefore = acf.airframeConditionPct!;
    const engBefore = acf.engineConditionPct!;
    const hoursBefore = acf.hoursAirframe ?? 0;
    applyAircraftHoursAfterMission(acf, 10);
    assert.ok(acf.airframeConditionPct! < afBefore);
    assert.ok(acf.engineConditionPct! < engBefore);
    assert.equal(acf.hoursAirframe, hoursBefore + 10);
    assert.ok((acf.hoursSinceInspection ?? 0) >= 10);
  });

  it('inspection gate blocks until paid and costs a fraction of MSRP', () => {
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBCT', {
      pilotName: 'Inspect',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    const acf = state.fleet[0]!;
    ensureAircraftConditionPcts(acf);
    const interval = INSPECTION_INTERVAL_HOURS.light_turboprop;
    acf.hoursSinceInspection = interval - 1;
    applyAircraftHoursAfterMission(acf, 2);
    assert.equal(acf.status, 'maintenance');
    const cost = inspectionCostUsd(acf);
    assert.ok(cost < AIRCRAFT_MSRP_USD.light_turboprop * 0.02);
    state.walletUsd = cost - 1;
    assert.throws(() => clearAircraftMaintenance(state, acf.id));
    state.walletUsd = cost;
    const { needsRepair } = clearAircraftMaintenance(state, acf.id);
    assert.equal(needsRepair, false);
    assert.equal(acf.status, 'parked');
    assert.equal(acf.hoursSinceInspection, 0);
  });

  it('repair restores pct and can clear critical AOG after inspection', () => {
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGL', {
      pilotName: 'Repair',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    const acf = state.fleet[0]!;
    ensureAircraftConditionPcts(acf);
    acf.airframeConditionPct = CRITICAL_CONDITION_PCT - 5;
    acf.engineConditionPct = 70;
    acf.hoursSinceInspection = 0;
    acf.status = 'maintenance';
    ensureAircraftConditionPcts(acf);
    assert.equal(conditionBucketFromPct(acf.airframeConditionPct!), 'tired');
    state.walletUsd = 100_000;
    const insp = clearAircraftMaintenance(state, acf.id);
    assert.equal(insp.needsRepair, true);
    assert.equal(acf.status, 'maintenance');
    repairAircraftCondition(state, acf.id, { airframePts: 20 });
    assert.ok((acf.airframeConditionPct ?? 0) >= CRITICAL_CONDITION_PCT);
    assert.equal(acf.status, 'parked');
  });

  it('MRO inspection drains terminal parts and exceeds base labor', () => {
    const world = createSeedEconomyWorld({ seed: 'inspect-mro' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBCT', {
      pilotName: 'InspectMro',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    const acf = state.fleet[0]!;
    ensureAircraftConditionPcts(acf);
    acf.status = 'maintenance';
    acf.hoursSinceInspection = INSPECTION_INTERVAL_HOURS.light_turboprop;
    const labor = inspectionCostUsd(acf);
    state.walletUsd = 100_000;
    const stockBefore =
      world.airports.find((a) => a.icao === acf.locationIcao)!.inventory.mro_parts!
        .stockKg;
    const { mro, debitUsd } = clearAircraftMaintenanceWithParts(
      state,
      acf.id,
      world,
    );
    assert.ok(debitUsd > labor);
    assert.ok(mro.fromTerminalKg > 0);
    assert.ok(
      world.airports.find((a) => a.icao === acf.locationIcao)!.inventory.mro_parts!
        .stockKg < stockBefore,
    );
  });

  it('dry terminal parts apply labor surcharge without draining stock', () => {
    const world = createSeedEconomyWorld({ seed: 'repair-dry' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBPS', {
      pilotName: 'DryMx',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    const acf = state.fleet[0]!;
    ensureAircraftConditionPcts(acf);
    acf.airframeConditionPct = 90;
    acf.status = 'parked';
    const ap = world.airports.find((a) => a.icao === acf.locationIcao)!;
    ap.inventory.mro_parts!.stockKg = 0;
    state.walletUsd = 100_000;
    const { mro, debitUsd } = repairAircraftConditionWithParts(
      state,
      acf.id,
      world,
      { airframePts: 5 },
    );
    assert.equal(mro.scarcity, 'dry');
    assert.equal(mro.fromTerminalKg, 0);
    assert.equal(mro.partsCostUsd, 0);
    assert.ok(mro.laborSurcharge > 1);
    assert.ok(debitUsd > 0);
    assert.equal(ap.inventory.mro_parts!.stockKg, 0);
  });

  it('fuel burn mult is 1 when healthy and ramps toward max near critical', () => {
    assert.equal(
      fuelBurnMultFromCondition({
        airframeConditionPct: 95,
        engineConditionPct: 95,
      }).mult,
      1,
    );
    const mid = fuelBurnMultFromCondition({
      airframeConditionPct: 65,
      engineConditionPct: 65,
    });
    assert.ok(mid.mult > 1 && mid.mult < MX_FUEL_BURN_MULT_MAX);
    const critical = fuelBurnMultFromCondition({
      airframeConditionPct: CRITICAL_CONDITION_PCT,
      engineConditionPct: CRITICAL_CONDITION_PCT,
    });
    assert.equal(critical.mult, MX_FUEL_BURN_MULT_MAX);
    assert.ok(critical.excessFrac > 0);
  });

  it('keeps OFP block fuel as Due — MX wear is advisory only', () => {
    const healthy = padOfpBlockFuelKgForMx(500, {
      airframeConditionPct: 95,
      engineConditionPct: 95,
      fuelCapacityKg: 800,
    });
    assert.equal(healthy.requiredBlockFuelKg, 500);
    assert.equal(healthy.mxPadKg, 0);
    assert.equal(healthy.excessPct, 0);

    const worn = padOfpBlockFuelKgForMx(500, {
      airframeConditionPct: 40,
      engineConditionPct: 40,
      fuelCapacityKg: 800,
    });
    assert.equal(worn.requiredBlockFuelKg, 500);
    assert.equal(worn.mxPadKg, 0);
    assert.equal(worn.mult, MX_FUEL_BURN_MULT_MAX);
    assert.ok(worn.excessPct > 0);
    assert.equal(worn.cappedByTank, false);

    const overTank = padOfpBlockFuelKgForMx(500, {
      airframeConditionPct: 40,
      engineConditionPct: 40,
      fuelCapacityKg: 400,
    });
    assert.equal(overTank.requiredBlockFuelKg, 500);
    assert.equal(overTank.mxPadKg, 0);
    assert.equal(overTank.cappedByTank, true);
  });

  it('rolls listing condition pcts inside each bucket band', () => {
    const low = conditionPctsForListing('tired', 'used', () => 0);
    const high = conditionPctsForListing('tired', 'used', () => 0.999);
    assert.equal(low.airframeConditionPct, CRITICAL_CONDITION_PCT);
    assert.ok(high.airframeConditionPct >= 53);
    assert.ok(high.airframeConditionPct <= 54);
    assert.notEqual(low.airframeConditionPct, high.airframeConditionPct);

    const fair = conditionPctsForListing('fair', 'used', () => 0.25);
    assert.ok(fair.airframeConditionPct >= 55);
    assert.ok(fair.airframeConditionPct < 75);
    assert.equal(conditionBucketFromPct(fair.airframeConditionPct), 'fair');

    const brandNew = conditionPctsForListing('tired', 'new', () => 0);
    assert.equal(brandNew.airframeConditionPct, 99);
    assert.equal(brandNew.engineConditionPct, 100);
  });
});
