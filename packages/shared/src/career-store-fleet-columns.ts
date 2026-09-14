/**
 * Fleet aircraft column split — promote stable PlayerAircraft fields out of
 * payload_json so registration / hours / MX can be queried without JSON.
 */

import type {
  AirframeCondition,
  FreighterClassId,
  PlayerAircraft,
  PlayerAircraftStatus,
} from './types/career-economy.js';

const CONDITIONS = new Set<AirframeCondition>([
  'excellent',
  'good',
  'fair',
  'tired',
]);

export type FleetAircraftColumnFields = {
  id: string;
  aircraftClassId: FreighterClassId;
  airframeTypeId?: string;
  label: string;
  locationIcao: string;
  fuelKg: number;
  fuelCapacityKg: number;
  status: PlayerAircraftStatus;
  assignedMissionId?: string;
  ownership?: string;
  registration?: string;
  condition?: AirframeCondition;
  hoursAirframe?: number;
  hoursEngine?: number;
  airframeConditionPct?: number;
  engineConditionPct?: number;
  hoursSinceInspection?: number;
  maintenanceDueAtHours?: number;
  airframeConfigurationId?: string;
  rolesPackRelPath?: string;
  leaseOverdue?: boolean;
  listedListingId?: string;
};

function finiteOrUndef(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function strOrUndef(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

export function splitFleetAircraftForPersist(a: PlayerAircraft): {
  cols: FleetAircraftColumnFields;
  leaseJson: string | null;
  leaseOutJson: string | null;
  /** Leftover fields only — promoted keys live in columns. */
  payloadJson: string | null;
} {
  const {
    id,
    aircraftClassId,
    airframeTypeId,
    label,
    locationIcao,
    fuelKg,
    fuelCapacityKg,
    status,
    assignedMissionId,
    ownership,
    lease,
    leaseOut,
    registration,
    condition,
    hoursAirframe,
    hoursEngine,
    airframeConditionPct,
    engineConditionPct,
    hoursSinceInspection,
    maintenanceDueAtHours,
    airframeConfigurationId,
    rolesPackRelPath,
    leaseOverdue,
    listedListingId,
    ...rest
  } = a;

  return {
    cols: {
      id,
      aircraftClassId,
      airframeTypeId,
      label,
      locationIcao,
      fuelKg,
      fuelCapacityKg,
      status,
      assignedMissionId,
      ownership,
      registration: strOrUndef(registration),
      condition:
        typeof condition === 'string' && CONDITIONS.has(condition)
          ? condition
          : undefined,
      hoursAirframe: finiteOrUndef(hoursAirframe),
      hoursEngine: finiteOrUndef(hoursEngine),
      airframeConditionPct: finiteOrUndef(airframeConditionPct),
      engineConditionPct: finiteOrUndef(engineConditionPct),
      hoursSinceInspection: finiteOrUndef(hoursSinceInspection),
      maintenanceDueAtHours: finiteOrUndef(maintenanceDueAtHours),
      airframeConfigurationId: strOrUndef(airframeConfigurationId),
      rolesPackRelPath: strOrUndef(rolesPackRelPath),
      leaseOverdue: leaseOverdue === true ? true : undefined,
      listedListingId: strOrUndef(listedListingId),
    },
    leaseJson: lease ? JSON.stringify(lease) : null,
    leaseOutJson: leaseOut ? JSON.stringify(leaseOut) : null,
    payloadJson: Object.keys(rest).length > 0 ? JSON.stringify(rest) : null,
  };
}

export type FleetAircraftRowInput = {
  id: string;
  aircraft_class_id: string;
  airframe_type_id?: string | null;
  label: string;
  location_icao: string;
  fuel_kg: number;
  fuel_capacity_kg: number;
  status: string;
  assigned_mission_id?: string | null;
  ownership?: string | null;
  registration?: string | null;
  condition?: string | null;
  hours_airframe?: number | null;
  hours_engine?: number | null;
  airframe_condition_pct?: number | null;
  engine_condition_pct?: number | null;
  hours_since_inspection?: number | null;
  maintenance_due_at_hours?: number | null;
  airframe_configuration_id?: string | null;
  roles_pack_rel_path?: string | null;
  lease_overdue?: boolean | number | null;
  listed_listing_id?: string | null;
  lease_json?: string | null | unknown;
  lease_out_json?: string | null | unknown;
  payload_json?: string | null | unknown;
};

function parseJsonObject<T>(raw: unknown): T | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as T;
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/**
 * Assemble PlayerAircraft: payload extras first, then column values win
 * (so backfilled columns override stale payload keys).
 */
export function assembleFleetAircraftFromRow(
  r: FleetAircraftRowInput,
): PlayerAircraft {
  const extra =
    parseJsonObject<Partial<PlayerAircraft>>(r.payload_json) ?? {};
  const aircraft: PlayerAircraft = {
    ...extra,
    id: r.id,
    aircraftClassId: r.aircraft_class_id as FreighterClassId,
    label: r.label,
    locationIcao: r.location_icao,
    fuelKg: Number(r.fuel_kg) || 0,
    fuelCapacityKg: Number(r.fuel_capacity_kg) || 0,
    status: r.status as PlayerAircraftStatus,
  };

  if (r.airframe_type_id) aircraft.airframeTypeId = String(r.airframe_type_id);
  if (r.assigned_mission_id) {
    aircraft.assignedMissionId = String(r.assigned_mission_id);
  }
  if (r.ownership === 'owned' || r.ownership === 'leased') {
    aircraft.ownership = r.ownership;
  }

  const reg = strOrUndef(r.registration);
  if (reg) aircraft.registration = reg;

  const cond = strOrUndef(r.condition);
  if (cond && CONDITIONS.has(cond as AirframeCondition)) {
    aircraft.condition = cond as AirframeCondition;
  }

  const ha = finiteOrUndef(r.hours_airframe == null ? undefined : Number(r.hours_airframe));
  if (ha != null) aircraft.hoursAirframe = ha;
  const he = finiteOrUndef(r.hours_engine == null ? undefined : Number(r.hours_engine));
  if (he != null) aircraft.hoursEngine = he;
  const acp = finiteOrUndef(
    r.airframe_condition_pct == null ? undefined : Number(r.airframe_condition_pct),
  );
  if (acp != null) aircraft.airframeConditionPct = acp;
  const ecp = finiteOrUndef(
    r.engine_condition_pct == null ? undefined : Number(r.engine_condition_pct),
  );
  if (ecp != null) aircraft.engineConditionPct = ecp;
  const hsi = finiteOrUndef(
    r.hours_since_inspection == null ? undefined : Number(r.hours_since_inspection),
  );
  if (hsi != null) aircraft.hoursSinceInspection = hsi;
  const md = finiteOrUndef(
    r.maintenance_due_at_hours == null
      ? undefined
      : Number(r.maintenance_due_at_hours),
  );
  if (md != null) aircraft.maintenanceDueAtHours = md;

  const cfg = strOrUndef(r.airframe_configuration_id);
  if (cfg) aircraft.airframeConfigurationId = cfg;
  const pack = strOrUndef(r.roles_pack_rel_path);
  if (pack) aircraft.rolesPackRelPath = pack;

  if (r.lease_overdue === true || r.lease_overdue === 1) {
    aircraft.leaseOverdue = true;
  }

  const listed = strOrUndef(r.listed_listing_id);
  if (listed) aircraft.listedListingId = listed;

  const lease = parseJsonObject<PlayerAircraft['lease']>(r.lease_json);
  if (lease) aircraft.lease = lease;
  const leaseOut = parseJsonObject<PlayerAircraft['leaseOut']>(r.lease_out_json);
  if (leaseOut) aircraft.leaseOut = leaseOut;

  return aircraft;
}

/** SQL fragments shared by PG / SQLite writers. */
export const FLEET_AIRCRAFT_COLUMN_NAMES = [
  'registration',
  'condition',
  'hours_airframe',
  'hours_engine',
  'airframe_condition_pct',
  'engine_condition_pct',
  'hours_since_inspection',
  'maintenance_due_at_hours',
  'airframe_configuration_id',
  'roles_pack_rel_path',
  'lease_overdue',
  'listed_listing_id',
  'lease_out_json',
] as const;
