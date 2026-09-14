/**
 * Fleet aircraft column split — promote payload fields + round-trip.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assembleFleetAircraftFromRow,
  splitFleetAircraftForPersist,
} from './career-store-fleet-columns.js';
import type { PlayerAircraft } from './types/career-economy.js';

function sampleAircraft(
  overrides: Partial<PlayerAircraft> = {},
): PlayerAircraft {
  return {
    id: 'acf_atr_1',
    aircraftClassId: 'light_turboprop',
    airframeTypeId: 'microsoft-atr-72',
    airframeConfigurationId: 'cfg_cargo',
    rolesPackRelPath: 'ofp/atr.json',
    label: 'ATR 72-600',
    registration: 'PR-ATR',
    locationIcao: 'SBAT',
    fuelKg: 1_200,
    fuelCapacityKg: 5_000,
    status: 'parked',
    ownership: 'owned',
    condition: 'good',
    hoursAirframe: 412,
    hoursEngine: 380,
    airframeConditionPct: 88,
    engineConditionPct: 90,
    hoursSinceInspection: 40,
    maintenanceDueAtHours: 500,
    leaseOverdue: false,
    ...overrides,
  };
}

describe('fleet aircraft columns', () => {
  it('splits promoted fields out of payload_json', () => {
    const { cols, leaseJson, leaseOutJson, payloadJson } =
      splitFleetAircraftForPersist(
        sampleAircraft({
          lease: {
            monthlyUsd: 10_000,
            nextDueTick: 100,
            termEndsTick: 1_000,
            buyoutUsd: 500_000,
            startIcao: 'SBAT',
          },
          listedListingId: 'inst_x',
        }),
      );
    assert.equal(cols.registration, 'PR-ATR');
    assert.equal(cols.hoursAirframe, 412);
    assert.equal(cols.listedListingId, 'inst_x');
    assert.ok(leaseJson && leaseJson.includes('monthlyUsd'));
    assert.equal(leaseOutJson, null);
    assert.equal(payloadJson, null);
  });

  it('round-trips through assemble with column values winning over payload', () => {
    const split = splitFleetAircraftForPersist(sampleAircraft());
    const row = {
      id: split.cols.id,
      aircraft_class_id: split.cols.aircraftClassId,
      airframe_type_id: split.cols.airframeTypeId ?? null,
      label: split.cols.label,
      location_icao: split.cols.locationIcao,
      fuel_kg: split.cols.fuelKg,
      fuel_capacity_kg: split.cols.fuelCapacityKg,
      status: split.cols.status,
      assigned_mission_id: null,
      ownership: split.cols.ownership ?? null,
      registration: split.cols.registration ?? null,
      condition: split.cols.condition ?? null,
      hours_airframe: split.cols.hoursAirframe ?? null,
      hours_engine: split.cols.hoursEngine ?? null,
      airframe_condition_pct: split.cols.airframeConditionPct ?? null,
      engine_condition_pct: split.cols.engineConditionPct ?? null,
      hours_since_inspection: split.cols.hoursSinceInspection ?? null,
      maintenance_due_at_hours: split.cols.maintenanceDueAtHours ?? null,
      airframe_configuration_id: split.cols.airframeConfigurationId ?? null,
      roles_pack_rel_path: split.cols.rolesPackRelPath ?? null,
      lease_overdue: null,
      listed_listing_id: null,
      lease_json: split.leaseJson,
      lease_out_json: split.leaseOutJson,
      // Stale payload must lose to columns.
      payload_json: JSON.stringify({
        registration: 'STALE',
        hoursAirframe: 1,
      }),
    };
    const assembled = assembleFleetAircraftFromRow(row);
    assert.equal(assembled.registration, 'PR-ATR');
    assert.equal(assembled.hoursAirframe, 412);
    assert.equal(assembled.airframeTypeId, 'microsoft-atr-72');
    assert.equal(assembled.rolesPackRelPath, 'ofp/atr.json');
  });
});
