import {
  applyFreightDelivery,
  getCommodity,
  listMarketLots,
  routeDistanceNm,
  type CareerEconomyWorld,
  type MarketLotView,
} from './career-economy.js';
import { applyPlayerDepartFuel, relocateAircraftOnSettle, releaseAircraftOnCancel } from './career-fleet.js';
import { deliverFuelUplift, quoteFuelUplift } from './career-fuel.js';
import type {
  CareerMissionsState,
} from './types/career-economy.js';
import { KG_TO_LB } from './ofp-compliance.js';
import type {
  ComplianceFinding,
  ComplianceVerdict,
  OfpExpectation,
} from './types/ofp-compliance.js';
import type {
  AircraftClass,
  FreighterClassId,
  InboundPending,
  MissionIntent,
  MissionLotLine,
  MissionSettlement,
  MissionSettlementLine,
  ShipmentLot,
} from './types/career-economy.js';
import { MAX_MANIFEST_LOTS } from './types/career-economy.js';

export type {
  AircraftClass,
  FreighterClassId,
  MissionIntent,
  MissionLotLine,
  MissionSettlement,
  MissionSettlementLine,
  MissionStatus,
  CareerMissionsState,
  MissionFuelUplift,
} from './types/career-economy.js';
export { MAX_MANIFEST_LOTS } from './types/career-economy.js';
export {
  quoteFuelUplift,
  deliverFuelUplift,
  estimateUpliftKg,
  debitWalletForFuel,
  applyNpcFuelUplift,
  type FuelUpliftQuote,
} from './career-fuel.js';

export const CAREER_AIRCRAFT_CLASSES: readonly AircraftClass[] = [
  {
    id: 'narrow_freighter',
    name: 'Narrow freighter (B738 BCF class)',
    /** Fallback when SimBrief airframes.json is unreachable; live limit ≈ maxcargo. */
    maxCargoKg: 18_137,
    maxRangeNm: 2_500,
    rolesPackRelPath: 'profiles/ofp/pmdg-738-bcf.json',
    loadMethod: 'native-simbrief',
    injectCapable: false,
    simbriefIcao: 'B738',
    simbriefAirframeMatch: 'PMDG \\(MSFS\\) - Boeing Converted Freighter',
    fuelBurnKgPerNm: 5,
    fuelTaxiKg: 400,
    fuelCapacityKg: 20_894,
    oewKg: 42_264,
    mtowKg: 79_333,
    fuelRouteFactor: 1.3,
    fuelReserveKg: 1_500,
  },
  {
    id: 'wide_freighter',
    name: 'Wide freighter (MD-11F class)',
    /** Fallback; live limit prefers SimBrief mzfw−oew when maxcargo is 0. */
    maxCargoKg: 90_000,
    maxRangeNm: 6_000,
    rolesPackRelPath: 'profiles/ofp/tfdi-md11f.json',
    loadMethod: 'native-simbrief',
    injectCapable: false,
    simbriefIcao: 'MD1F',
    simbriefAirframeMatch: 'TFDi Design \\(MSFS\\) - MD-11F',
    fuelBurnKgPerNm: 12,
    fuelTaxiKg: 900,
    fuelCapacityKg: 117_400,
    oewKg: 112_748,
    mtowKg: 286_000,
    fuelRouteFactor: 1.25,
    fuelReserveKg: 5_000,
  },
  {
    id: 'light_turboprop',
    name: 'Light turboprop (C208 Caravan Cargo Pod)',
    /** Fallback; live prefer SimBrief C208 mzfw−oew (~1704 kg). */
    maxCargoKg: 1_704,
    maxRangeNm: 900,
    rolesPackRelPath: 'profiles/ofp/blacksquare-caravan-cargo-pod.json',
    loadMethod: 'direct-injection',
    injectCapable: true,
    simbriefIcao: 'C208',
    simbriefAirframeMatch: 'Default',
    fuelBurnKgPerNm: 0.8,
    fuelTaxiKg: 40,
    /** SimBrief Default C208 maxfuel 2265 lb. */
    fuelCapacityKg: 1_027,
    /** Default C208 weights aligned with SimBrief OFP (SBCT→SBGL MTOW case). */
    oewKg: 2_152,
    mtowKg: 3_969,
    fuelRouteFactor: 1.8,
    fuelReserveKg: 200,
  },
  {
    id: 'light_ga',
    name: 'Light GA (BE36 Bonanza Professional)',
    /**
     * Fallback structural payload for BE36 family (A36 / A36TC / B36TP).
     * B36TP cfg: MTOW 4050 lb − OEW 2355 lb ≈ 769 kg useful; ~450 kg after typical fuel.
     */
    maxCargoKg: 450,
    maxRangeNm: 800,
    rolesPackRelPath: 'profiles/ofp/blacksquare-bonanza-professional.json',
    loadMethod: 'direct-injection',
    injectCapable: true,
    simbriefIcao: 'BE36',
    simbriefAirframeMatch: 'Default',
    fuelBurnKgPerNm: 0.35,
    fuelTaxiKg: 20,
    /** B36TP mains 62+62 gal Jet-A ≈ 380 kg usable planning capacity. */
    fuelCapacityKg: 380,
    oewKg: 1_068,
    mtowKg: 1_837,
    fuelRouteFactor: 1.8,
    fuelReserveKg: 80,
  },
] as const;

const CLASS_BY_ID: Record<FreighterClassId, AircraftClass> = Object.fromEntries(
  CAREER_AIRCRAFT_CLASSES.map((c) => [c.id, c]),
) as Record<FreighterClassId, AircraftClass>;

export function getAircraftClass(id: FreighterClassId): AircraftClass {
  return CLASS_BY_ID[id];
}

/** Preferred load path for a mission's aircraft class (manual always allowed in UI). */
export function missionLoadPolicy(mission: {
  aircraftClassId: FreighterClassId | string;
}): {
  loadMethod: AircraftClass['loadMethod'];
  injectCapable: boolean;
} {
  const aircraft = getAircraftClass(mission.aircraftClassId as FreighterClassId);
  return {
    loadMethod: aircraft.loadMethod,
    injectCapable: aircraft.injectCapable,
  };
}

export function withMissionLoadPolicy<T extends { aircraftClassId: FreighterClassId | string }>(
  mission: T,
): T & { loadMethod: AircraftClass['loadMethod']; injectCapable: boolean } {
  return { ...mission, ...missionLoadPolicy(mission) };
}

/** Server/API gate: only direct-injection + injectCapable may call load-ofp apply. */
export function careerAllowsDirectInject(policy: {
  loadMethod?: string;
  injectCapable?: boolean;
}): boolean {
  return policy.loadMethod === 'direct-injection' && policy.injectCapable === true;
}

/** Roles-pack gate used by ofp-load before writing SimVars. */
export function assertRolesPackAllowsDirectInjection(pack: {
  loadMethod?: string;
  injectCapable?: boolean;
}): void {
  if (pack.loadMethod && pack.loadMethod !== 'direct-injection') {
    throw new Error(
      `Roles pack loadMethod=${pack.loadMethod} — direct injection is not allowed for this aircraft`,
    );
  }
  if (pack.injectCapable === false) {
    throw new Error(
      'Roles pack is not injectCapable — use native SimBrief/EFB import + Validate',
    );
  }
}

/** Career Preflight Loaded vs Due: fuel+payload only; CG never blocks alone. */
export function careerPreflightReady(opts: {
  fuelFailed: boolean;
  payloadFailed: boolean;
}): boolean {
  return !opts.fuelFailed && !opts.payloadFailed;
}

export function softenCareerPreflightVerdict(
  ready: boolean,
  snapshotVerdict: 'pass' | 'warn' | 'fail',
): 'pass' | 'warn' | 'fail' {
  if (!ready) return 'fail';
  if (snapshotVerdict === 'fail') return 'warn';
  return snapshotVerdict;
}

export function softenCgFindingSeverity(code: string, severity: string): string {
  const isCg = code.startsWith('CG_') || code.includes('CG');
  if (isCg && severity === 'fail') return 'warn';
  return severity;
}

/**
 * Route operational cargo cap for Staging / Dispatch prefill.
 * Uses homologated class weights (or live SimBrief OEW/MTOW override):
 * min(structuralMaxCargo, MTOW − OEW − takeoffFuel − margin).
 * New aircraft homologations must fill oewKg/mtowKg/fuel* on AircraftClass.
 */
export function estimateRouteCargoLimit(
  aircraftClassId: FreighterClassId,
  distanceNm: number,
  structuralMaxCargoKg: number,
  weights: {
    oewKg?: number;
    mtowKg?: number;
    fuelCapacityKg?: number;
  } = {},
): {
  operationalMaxCargoKg: number;
  estimatedBlockFuelKg: number;
  fuelCapacityKg: number;
  fuelDeficitKg: number;
  fuelFeasible: boolean;
  structuralMaxCargoKg: number;
  oewKg: number;
  mtowKg: number;
} {
  const aircraft = getAircraftClass(aircraftClassId);
  const oewKg = weights.oewKg ?? aircraft.oewKg;
  const mtowKg = weights.mtowKg ?? aircraft.mtowKg;
  const fuelCapacityKg =
    weights.fuelCapacityKg ?? aircraft.fuelCapacityKg;
  const nm = Math.max(0, Number.isFinite(distanceNm) ? distanceNm : 0);
  const structural = Math.max(0, Math.floor(structuralMaxCargoKg));
  const estimatedBlockFuelKg = Math.round(
    aircraft.fuelTaxiKg +
      aircraft.fuelBurnKgPerNm * nm * aircraft.fuelRouteFactor +
      aircraft.fuelReserveKg,
  );
  const takeoffFuelKg = Math.max(0, estimatedBlockFuelKg - aircraft.fuelTaxiKg);
  const marginKg = Math.max(25, Math.round(structural * 0.02));
  const mtowPayloadKg = Math.max(
    0,
    Math.floor(mtowKg - oewKg - takeoffFuelKg - marginKg),
  );
  return {
    operationalMaxCargoKg: Math.min(structural, mtowPayloadKg),
    estimatedBlockFuelKg,
    fuelCapacityKg,
    fuelDeficitKg: Math.max(0, estimatedBlockFuelKg - fuelCapacityKg),
    fuelFeasible: estimatedBlockFuelKg <= fuelCapacityKg,
    structuralMaxCargoKg: structural,
    oewKg,
    mtowKg,
  };
}

export function parseFreighterClassId(raw: string | undefined): FreighterClassId | undefined {
  if (!raw) return undefined;
  if (
    raw === 'narrow_freighter' ||
    raw === 'wide_freighter' ||
    raw === 'light_turboprop' ||
    raw === 'light_ga'
  ) {
    return raw;
  }
  if (raw === 'narrow' || raw === 'bcf' || raw === '738') return 'narrow_freighter';
  if (raw === 'wide' || raw === 'md11' || raw === 'md-11f') return 'wide_freighter';
  if (raw === 'caravan' || raw === 'c208' || raw === 'light' || raw === 'turboprop') {
    return 'light_turboprop';
  }
  if (raw === 'bonanza' || raw === 'be36' || raw === 'ga' || raw === 'a36' || raw === 'b36tp') {
    return 'light_ga';
  }
  return undefined;
}

function lotAvailableKg(lot: ShipmentLot): number {
  if (lot.status !== 'available' && lot.status !== 'reserved') {
    return 0;
  }
  return Math.max(0, lot.quantityKg - lot.reservedKg);
}

function findLot(world: CareerEconomyWorld, lotId: string): ShipmentLot {
  const lot = world.lots.find((l) => l.id === lotId);
  if (!lot) {
    throw new Error(`Unknown shipment lot: ${lotId}`);
  }
  return lot;
}

function missionLines(mission: MissionIntent): MissionLotLine[] {
  if (Array.isArray(mission.lots) && mission.lots.length > 0) {
    return mission.lots;
  }
  // Legacy single-lot saves / test fixtures without `lots`.
  if (mission.shipmentLotId) {
    return [
      {
        shipmentLotId: mission.shipmentLotId,
        commodityId: mission.commodityId,
        cargoKg: mission.cargoKg,
        payUsd: mission.payUsd,
        urgency: mission.urgency,
        reason: mission.reason,
        deadlineTick: mission.deadlineTick,
      },
    ];
  }
  return [];
}

/** Recompute top-level mirrors from `lots` (or legacy single-lot fields). */
export function recomputeMissionTotals(mission: MissionIntent): MissionIntent {
  const lots = missionLines(mission);
  if (lots.length === 0) {
    throw new Error(`Mission ${mission.id} has no lot lines`);
  }
  const cargoKg = lots.reduce((sum, line) => sum + line.cargoKg, 0);
  const payUsd = lots.reduce((sum, line) => sum + line.payUsd, 0);
  const deadlineTick = Math.min(...lots.map((line) => line.deadlineTick));
  const urgency = lots.some((line) => line.urgency === 'urgent') ? 'urgent' : 'normal';
  const primary = lots.reduce((best, line) =>
    line.cargoKg > best.cargoKg ? line : best,
  );
  const reason =
    lots.length === 1
      ? primary.reason
      : `${lots.length} lots · ${(cargoKg / 1000).toFixed(1)} t · primary ${getCommodity(primary.commodityId).name}`;
  return {
    ...mission,
    lots,
    shipmentLotId: lots[0]!.shipmentLotId,
    commodityId: primary.commodityId,
    cargoKg,
    payUsd,
    deadlineTick,
    urgency,
    reason,
  };
}

/** Soft-migrate legacy MissionIntent / dirty saves into canonical `lots[]`. */
export function normalizeMissionIntent(
  raw: MissionIntent | (Omit<MissionIntent, 'lots'> & { lots?: MissionLotLine[] }),
): MissionIntent {
  return recomputeMissionTotals(raw as MissionIntent);
}

export function normalizeMissionsList(missions: MissionIntent[]): MissionIntent[] {
  return missions.map((m) => normalizeMissionIntent(m));
}

/** Remaining payload capacity on an open flight (kg). */
export function missionRemainingCapacityKg(
  mission: MissionIntent,
  maxCargoKg: number,
): number {
  const normalized = normalizeMissionIntent(mission);
  return Math.max(0, Math.floor(maxCargoKg) - normalized.cargoKg);
}

/**
 * Find the single open same-OD+aircraft flight to auto-append into.
 * Returns undefined if zero or more than one match (caller creates a new flight).
 */
export function findOpenManifestForRoute(
  missions: readonly MissionIntent[],
  opts: {
    originIcao: string;
    destIcao: string;
    aircraftClassId: FreighterClassId;
  },
): MissionIntent | undefined {
  const matches = missions
    .map((m) => normalizeMissionIntent(m))
    .filter(
      (m) =>
        (m.status === 'accepted' || m.status === 'dispatched') &&
        m.aircraftClassId === opts.aircraftClassId &&
        m.originIcao === opts.originIcao &&
        m.destIcao === opts.destIcao,
    );
  return matches.length === 1 ? matches[0] : undefined;
}

const ACTIVE_MISSION_STATUSES = new Set(['accepted', 'dispatched', 'in_flight']);

export function isActiveMissionStatus(status: string): boolean {
  return ACTIVE_MISSION_STATUSES.has(status);
}

/** Drop all player inbound rows for one mission. */
export function clearPlayerInbound(
  world: CareerEconomyWorld,
  missionId: string,
): void {
  if (!Array.isArray(world.inboundPending) || world.inboundPending.length === 0) {
    return;
  }
  world.inboundPending = world.inboundPending.filter(
    (pending) => pending.missionId !== missionId,
  );
}

/**
 * Publish (or refresh) destination-notified inbound for an active player flight.
 * Soft fill / lane saturation read these rows alongside NPC airborne cargo.
 */
export function syncPlayerInbound(
  world: CareerEconomyWorld,
  mission: MissionIntent,
): void {
  const normalized = normalizeMissionIntent(mission);
  clearPlayerInbound(world, normalized.id);
  if (!isActiveMissionStatus(normalized.status)) {
    return;
  }
  if (!Array.isArray(world.inboundPending)) {
    world.inboundPending = [];
  }
  const rows: InboundPending[] = normalized.lots.map((line) => ({
    id: `${normalized.id}:${line.shipmentLotId}`,
    missionId: normalized.id,
    originIcao: normalized.originIcao,
    destIcao: normalized.destIcao,
    commodityId: line.commodityId,
    cargoKg: line.cargoKg,
    expiresAtTick: line.deadlineTick,
    source: 'player' as const,
  }));
  world.inboundPending.push(...rows);
}

/** Rebuild player inbound from the missions file (source of truth). */
export function reconcilePlayerInbound(
  world: CareerEconomyWorld,
  missions: readonly MissionIntent[],
): void {
  world.inboundPending = (world.inboundPending ?? []).filter(
    (pending) => pending.source !== 'player',
  );
  for (const mission of missions) {
    syncPlayerInbound(world, mission);
  }
}

/** Player missions that are still operational (not settled/cancelled). */
export function listActivePlayerMissions(
  missions: readonly MissionIntent[],
): MissionIntent[] {
  return missions
    .map((m) => normalizeMissionIntent(m))
    .filter((m) => isActiveMissionStatus(m.status));
}

/**
 * Prefer the most recently accepted active mission when recovering UI state.
 * With the single-active gate there should be at most one.
 */
export function findActivePlayerMission(
  missions: readonly MissionIntent[],
): MissionIntent | undefined {
  const active = listActivePlayerMissions(missions);
  if (active.length === 0) return undefined;
  return active.reduce((best, mission) =>
    (mission.acceptedAtTick ?? 0) >= (best.acceptedAtTick ?? 0) ? mission : best,
  );
}

/**
 * Reserve cargoKg from a market lot. Mutates the lot; returns pay pro-rata.
 */
export function reserveShipmentLot(
  world: CareerEconomyWorld,
  lotId: string,
  cargoKg: number,
): { lot: ShipmentLot; reservedKg: number; payUsd: number } {
  const lot = findLot(world, lotId);
  if (lot.status === 'in_transit' || lot.status === 'delivered' || lot.status === 'expired') {
    throw new Error(`Lot ${lotId} is not bookable (status=${lot.status})`);
  }
  const avail = lotAvailableKg(lot);
  if (avail <= 0) {
    throw new Error(`Lot ${lotId} has no remaining cargo`);
  }
  const qty = Math.floor(cargoKg);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error(`cargoKg must be a positive number (got ${cargoKg})`);
  }
  if (qty > avail) {
    throw new Error(`Requested ${qty} kg but lot only has ${avail} kg available`);
  }

  lot.reservedKg += qty;
  if (lot.reservedKg >= lot.quantityKg) {
    lot.status = 'reserved';
  }

  const payUsd = Math.max(1, Math.round((qty / lot.quantityKg) * lot.payUsd));
  return { lot, reservedKg: qty, payUsd };
}

/** Release a prior reservation (cancel before dispatch / settle). */
export function releaseShipmentReservation(
  world: CareerEconomyWorld,
  lotId: string,
  cargoKg: number,
): void {
  const lot = findLot(world, lotId);
  const release = Math.min(Math.max(0, Math.floor(cargoKg)), lot.reservedKg);
  lot.reservedKg -= release;
  if (lot.status === 'reserved' && lot.reservedKg < lot.quantityKg) {
    lot.status = 'available';
  }
}

export function acceptMission(
  world: CareerEconomyWorld,
  opts: {
    lotId: string;
    cargoKg?: number;
    aircraftClassId?: FreighterClassId;
    /** Id for a brand-new flight (ignored when appending). */
    missionId?: string;
    /** Override class max (e.g. live SimBrief maxcargo). */
    maxCargoKg?: number;
    /** Append cargo onto this open flight (same OD + aircraft). */
    intoMission?: MissionIntent;
  },
): MissionIntent {
  const aircraft = getAircraftClass(opts.aircraftClassId ?? 'narrow_freighter');
  const maxCargoKg =
    opts.maxCargoKg !== undefined && Number.isFinite(opts.maxCargoKg) && opts.maxCargoKg > 0
      ? Math.floor(opts.maxCargoKg)
      : aircraft.maxCargoKg;
  const lot = findLot(world, opts.lotId);
  const avail = lotAvailableKg(lot);
  if (avail <= 0) {
    throw new Error(`Lot ${opts.lotId} has no remaining cargo`);
  }

  const into = opts.intoMission
    ? normalizeMissionIntent(opts.intoMission)
    : undefined;

  if (into) {
    if (into.status !== 'accepted' && into.status !== 'dispatched') {
      throw new Error(`Cannot add cargo to mission in status=${into.status}`);
    }
    if (into.aircraftClassId !== aircraft.id) {
      throw new Error(
        `Aircraft class mismatch: flight is ${into.aircraftClassId}, accept requested ${aircraft.id}`,
      );
    }
    if (into.originIcao !== lot.originIcao || into.destIcao !== lot.destIcao) {
      throw new Error(
        `Route mismatch: flight is ${into.originIcao}→${into.destIcao}, lot is ${lot.originIcao}→${lot.destIcao}`,
      );
    }
    if (into.lots.length >= MAX_MANIFEST_LOTS) {
      throw new Error(
        `Manifest full (${MAX_MANIFEST_LOTS} lots) — dispatch this flight or start a new one`,
      );
    }
  }

  const remainingCap = into
    ? missionRemainingCapacityKg(into, maxCargoKg)
    : maxCargoKg;
  if (remainingCap <= 0) {
    throw new Error(
      `No remaining capacity on flight ${into?.id ?? '(new)'} (max ${maxCargoKg} kg)`,
    );
  }

  const requested =
    opts.cargoKg !== undefined
      ? Math.floor(opts.cargoKg)
      : Math.min(avail, remainingCap);
  const cargoKg = Math.min(requested, avail, remainingCap);
  if (cargoKg <= 0) {
    throw new Error(
      `Nothing to accept: requested=${requested} avail=${avail} remainingCap=${remainingCap}`,
    );
  }

  const { payUsd } = reserveShipmentLot(world, opts.lotId, cargoKg);
  const line: MissionLotLine = {
    shipmentLotId: lot.id,
    commodityId: lot.commodityId,
    cargoKg,
    payUsd,
    urgency: lot.urgency,
    reason: lot.reason,
    deadlineTick: lot.expiresAtTick,
  };

  if (into) {
    const appended = recomputeMissionTotals({
      ...into,
      lots: [...into.lots, line],
    });
    syncPlayerInbound(world, appended);
    return appended;
  }

  const id =
    opts.missionId?.trim() ||
    `msn_${world.tick}_${lot.originIcao}_${lot.destIcao}_${Math.floor(Math.random() * 1e6)}`;

  const created = recomputeMissionTotals({
    id,
    lots: [line],
    shipmentLotId: lot.id,
    commodityId: lot.commodityId,
    originIcao: lot.originIcao,
    destIcao: lot.destIcao,
    cargoKg,
    pax: 0,
    aircraftClassId: aircraft.id,
    rolesPackRelPath: aircraft.rolesPackRelPath,
    deadlineTick: lot.expiresAtTick,
    payUsd,
    urgency: lot.urgency,
    reason: lot.reason,
    status: 'accepted',
    acceptedAtTick: world.tick,
  });
  syncPlayerInbound(world, created);
  return created;
}

export type StagedManifestLine = {
  lotId: string;
  cargoKg: number;
};

/**
 * Atomically reserve one or more staged lots onto a new or existing same-OD flight.
 * Validates first; on mid-apply failure restores lot reservations from a snapshot.
 */
export function commitStagedManifest(
  world: CareerEconomyWorld,
  opts: {
    lines: StagedManifestLine[];
    aircraftClassId?: FreighterClassId;
    maxCargoKg?: number;
    intoMission?: MissionIntent;
    /** Id for a brand-new flight (ignored when appending). */
    missionId?: string;
  },
): { mission: MissionIntent; appended: boolean; lineCount: number } {
  const aircraft = getAircraftClass(opts.aircraftClassId ?? 'narrow_freighter');
  const maxCargoKg =
    opts.maxCargoKg !== undefined && Number.isFinite(opts.maxCargoKg) && opts.maxCargoKg > 0
      ? Math.floor(opts.maxCargoKg)
      : aircraft.maxCargoKg;

  if (!Array.isArray(opts.lines) || opts.lines.length === 0) {
    throw new Error('Staging requires at least one cargo line');
  }
  if (opts.lines.length > MAX_MANIFEST_LOTS) {
    throw new Error(`Staging allows at most ${MAX_MANIFEST_LOTS} lots`);
  }

  const seen = new Set<string>();
  const normalizedLines: StagedManifestLine[] = [];
  for (const raw of opts.lines) {
    const lotId = raw.lotId?.trim();
    const cargoKg = Math.floor(raw.cargoKg);
    if (!lotId) throw new Error('Each staging line needs a lotId');
    if (seen.has(lotId)) throw new Error(`Duplicate lot in staging: ${lotId}`);
    seen.add(lotId);
    if (!Number.isFinite(cargoKg) || cargoKg <= 0) {
      throw new Error(`Invalid cargoKg for ${lotId}`);
    }
    normalizedLines.push({ lotId, cargoKg });
  }

  const into = opts.intoMission
    ? normalizeMissionIntent(opts.intoMission)
    : undefined;
  if (into) {
    if (into.status !== 'accepted' && into.status !== 'dispatched') {
      throw new Error(`Cannot stage onto mission in status=${into.status}`);
    }
    if (into.aircraftClassId !== aircraft.id) {
      throw new Error(
        `Aircraft class mismatch: flight is ${into.aircraftClassId}, staging requested ${aircraft.id}`,
      );
    }
    if (into.lots.length + normalizedLines.length > MAX_MANIFEST_LOTS) {
      throw new Error(
        `Manifest would exceed ${MAX_MANIFEST_LOTS} lots (${into.lots.length} existing + ${normalizedLines.length} staged)`,
      );
    }
  }

  let originIcao: string | undefined;
  let destIcao: string | undefined;
  let totalNewKg = 0;
  for (const line of normalizedLines) {
    const lot = findLot(world, line.lotId);
    const avail = lotAvailableKg(lot);
    if (line.cargoKg > avail) {
      throw new Error(
        `Lot ${line.lotId} only has ${avail} kg available (requested ${line.cargoKg})`,
      );
    }
    if (!originIcao) {
      originIcao = lot.originIcao;
      destIcao = lot.destIcao;
    } else if (lot.originIcao !== originIcao || lot.destIcao !== destIcao) {
      throw new Error(
        `Staging lots must share one route (expected ${originIcao}→${destIcao}, got ${lot.originIcao}→${lot.destIcao})`,
      );
    }
    if (into && (into.originIcao !== lot.originIcao || into.destIcao !== lot.destIcao)) {
      throw new Error(
        `Route mismatch: flight is ${into.originIcao}→${into.destIcao}, lot is ${lot.originIcao}→${lot.destIcao}`,
      );
    }
    totalNewKg += line.cargoKg;
  }

  const distanceNm = routeDistanceNm(world, originIcao!, destIcao!);
  if (distanceNm === undefined) {
    throw new Error(`Unknown route distance for ${originIcao}→${destIcao}`);
  }
  if (distanceNm > aircraft.maxRangeNm) {
    throw new Error(
      `Route ${originIcao}→${destIcao} is ${Math.round(distanceNm)} nm; ${aircraft.name} max range is ${aircraft.maxRangeNm} nm`,
    );
  }

  const remainingCap = into
    ? missionRemainingCapacityKg(into, maxCargoKg)
    : maxCargoKg;
  if (totalNewKg > remainingCap) {
    throw new Error(
      `Staged cargo ${totalNewKg} kg exceeds remaining capacity ${remainingCap} kg`,
    );
  }

  const snapshot = world.lots.map((lot) => ({
    id: lot.id,
    reservedKg: lot.reservedKg,
    status: lot.status,
  }));

  let mission: MissionIntent | undefined = into;
  try {
    for (let i = 0; i < normalizedLines.length; i++) {
      const line = normalizedLines[i]!;
      mission = acceptMission(world, {
        lotId: line.lotId,
        cargoKg: line.cargoKg,
        aircraftClassId: aircraft.id,
        maxCargoKg,
        intoMission: mission,
        missionId: i === 0 && !into ? opts.missionId : undefined,
      });
    }
    if (!mission) {
      throw new Error('Staging commit produced no mission');
    }
    return {
      mission,
      appended: Boolean(into),
      lineCount: normalizedLines.length,
    };
  } catch (error) {
    for (const snap of snapshot) {
      const lot = world.lots.find((candidate) => candidate.id === snap.id);
      if (!lot) continue;
      lot.reservedKg = snap.reservedKg;
      lot.status = snap.status;
    }
    if (into) {
      syncPlayerInbound(world, into);
    } else if (mission) {
      clearPlayerInbound(world, mission.id);
    }
    throw error;
  }
}

/**
 * Replace an accepted/dispatched mission's cargo lines in place.
 * Releases current reservations, reserves the new lines, keeps mission id /
 * aircraft assignment / staticId, and clears OFP/preflight so the pilot can
 * regenerate the plan after payload changes.
 */
export function replaceMissionManifest(
  world: CareerEconomyWorld,
  mission: MissionIntent,
  opts: {
    lines: StagedManifestLine[];
    aircraftClassId?: FreighterClassId;
    maxCargoKg?: number;
  },
): MissionIntent {
  const normalized = normalizeMissionIntent(mission);
  if (normalized.status !== 'accepted' && normalized.status !== 'dispatched') {
    throw new Error(`Cannot edit mission in status=${normalized.status}`);
  }
  if (!Array.isArray(opts.lines) || opts.lines.length === 0) {
    throw new Error('Edited manifest requires at least one cargo line');
  }
  if (opts.lines.length > MAX_MANIFEST_LOTS) {
    throw new Error(`Staging allows at most ${MAX_MANIFEST_LOTS} lots`);
  }

  const aircraft = getAircraftClass(
    opts.aircraftClassId ?? normalized.aircraftClassId,
  );
  if (aircraft.id !== normalized.aircraftClassId) {
    throw new Error(
      `Aircraft class mismatch: flight is ${normalized.aircraftClassId}, edit requested ${aircraft.id}`,
    );
  }
  const maxCargoKg =
    opts.maxCargoKg !== undefined && Number.isFinite(opts.maxCargoKg) && opts.maxCargoKg > 0
      ? Math.floor(opts.maxCargoKg)
      : aircraft.maxCargoKg;

  const seen = new Set<string>();
  const normalizedLines: StagedManifestLine[] = [];
  for (const raw of opts.lines) {
    const lotId = raw.lotId?.trim();
    const cargoKg = Math.floor(raw.cargoKg);
    if (!lotId) throw new Error('Each staging line needs a lotId');
    if (seen.has(lotId)) throw new Error(`Duplicate lot in staging: ${lotId}`);
    seen.add(lotId);
    if (!Number.isFinite(cargoKg) || cargoKg <= 0) {
      throw new Error(`Invalid cargoKg for ${lotId}`);
    }
    normalizedLines.push({ lotId, cargoKg });
  }

  const snapshot = world.lots.map((lot) => ({
    id: lot.id,
    reservedKg: lot.reservedKg,
    status: lot.status,
  }));

  try {
    for (const line of normalized.lots) {
      if (world.lots.some((lot) => lot.id === line.shipmentLotId)) {
        releaseShipmentReservation(world, line.shipmentLotId, line.cargoKg);
      }
    }

    let totalKg = 0;
    for (const line of normalizedLines) {
      const lot = findLot(world, line.lotId);
      const avail = lotAvailableKg(lot);
      if (line.cargoKg > avail) {
        throw new Error(
          `Lot ${line.lotId} only has ${avail} kg available (requested ${line.cargoKg})`,
        );
      }
      if (
        lot.originIcao !== normalized.originIcao ||
        lot.destIcao !== normalized.destIcao
      ) {
        throw new Error(
          `Route mismatch: flight is ${normalized.originIcao}→${normalized.destIcao}, lot is ${lot.originIcao}→${lot.destIcao}`,
        );
      }
      totalKg += line.cargoKg;
    }
    if (totalKg > maxCargoKg) {
      throw new Error(
        `Edited cargo ${totalKg} kg exceeds aircraft capacity ${maxCargoKg} kg`,
      );
    }

    const distanceNm = routeDistanceNm(
      world,
      normalized.originIcao,
      normalized.destIcao,
    );
    if (distanceNm === undefined) {
      throw new Error(
        `Unknown route distance for ${normalized.originIcao}→${normalized.destIcao}`,
      );
    }
    if (distanceNm > aircraft.maxRangeNm) {
      throw new Error(
        `Route ${normalized.originIcao}→${normalized.destIcao} is ${Math.round(distanceNm)} nm; ${aircraft.name} max range is ${aircraft.maxRangeNm} nm`,
      );
    }

    let next: MissionIntent | undefined;
    for (let index = 0; index < normalizedLines.length; index++) {
      const line = normalizedLines[index]!;
      next = acceptMission(world, {
        lotId: line.lotId,
        cargoKg: line.cargoKg,
        aircraftClassId: aircraft.id,
        maxCargoKg,
        intoMission: next,
        missionId: index === 0 ? normalized.id : undefined,
      });
    }
    if (!next) {
      throw new Error('Edited manifest produced no mission');
    }

    const replaced: MissionIntent = {
      ...normalized,
      ...recomputeMissionTotals(next),
      id: normalized.id,
      aircraftId: normalized.aircraftId,
      staticId: normalized.staticId,
      acceptedAtTick: normalized.acceptedAtTick ?? world.tick,
      status: 'accepted',
      lastOfpCheck: undefined,
      lastPreflightCheck: undefined,
      // Purchased fuel remains in the aircraft and its expense remains in the logbook.
      fuelUplift: normalized.fuelUplift,
      fuelAuthorizedOfpId: undefined,
      tripFuelBurnKg: undefined,
      dispatchedAtTick: undefined,
    };
    syncPlayerInbound(world, replaced);
    return replaced;
  } catch (error) {
    for (const snap of snapshot) {
      const lot = world.lots.find((candidate) => candidate.id === snap.id);
      if (!lot) continue;
      lot.reservedKg = snap.reservedKg;
      lot.status = snap.status;
    }
    syncPlayerInbound(world, normalized);
    throw error;
  }
}

export function cancelMission(
  world: CareerEconomyWorld,
  mission: MissionIntent,
  opts: { fleet?: CareerMissionsState } = {},
): MissionIntent {
  const normalized = normalizeMissionIntent(mission);
  if (normalized.status !== 'accepted' && normalized.status !== 'dispatched') {
    throw new Error(`Cannot cancel mission in status=${normalized.status}`);
  }
  // A mission can outlive its shipment lots: expired lots are pruned after a
  // short retention window, and a world reset can leave orphan missions behind.
  for (const line of normalized.lots) {
    if (world.lots.some((lot) => lot.id === line.shipmentLotId)) {
      releaseShipmentReservation(world, line.shipmentLotId, line.cargoKg);
    }
  }
  if (opts.fleet) {
    releaseAircraftOnCancel(opts.fleet, normalized);
  }
  const cancelled = { ...normalized, status: 'cancelled' as const };
  clearPlayerInbound(world, cancelled.id);
  return cancelled;
}

/**
 * Mark cargo airborne. Allowed from accepted or dispatched.
 * Fully-reserved lots flip to in_transit so the market stops offering them.
 * Applies origin Jet-A uplift once (stock drain + mission.fuelUplift).
 * When `fleet` is provided with mission.aircraftId, only the tank shortfall is purchased.
 */
export function departMission(
  world: CareerEconomyWorld,
  mission: MissionIntent,
  opts: { fleet?: CareerMissionsState } = {},
): DepartMissionResult {
  const normalized = normalizeMissionIntent(mission);
  if (normalized.status !== 'accepted' && normalized.status !== 'dispatched') {
    throw new Error(`Cannot depart mission in status=${normalized.status}`);
  }
  for (const line of normalized.lots) {
    const lot = findLot(world, line.shipmentLotId);
    if (lot.reservedKg >= lot.quantityKg && lot.quantityKg > 0) {
      lot.status = 'in_transit';
    }
  }

  let fuelDebitUsd = 0;
  let nextMission: MissionIntent = {
    ...normalized,
    status: 'in_flight',
    departedAtTick: world.tick,
  };

  if (opts.fleet && normalized.aircraftId) {
    const playerFuel = applyPlayerDepartFuel(world, opts.fleet, nextMission);
    nextMission = {
      ...playerFuel.mission,
      status: 'in_flight',
      departedAtTick: world.tick,
    };
    fuelDebitUsd = playerFuel.fuelDebitUsd;
  } else if (!normalized.fuelUplift) {
    const quote = quoteFuelUplift(world, {
      originIcao: normalized.originIcao,
      destIcao: normalized.destIcao,
      aircraftClassId: normalized.aircraftClassId as FreighterClassId,
    });
    const fuelUplift = deliverFuelUplift(world, quote);
    fuelDebitUsd = fuelUplift.costUsd;
    nextMission = { ...nextMission, fuelUplift };
  }

  syncPlayerInbound(world, nextMission);
  return {
    mission: nextMission,
    fuelDebitUsd,
  };
}

export interface DepartMissionResult {
  mission: MissionIntent;
  /** Wallet debit for fuel purchased on this call (0 if already uplifted). */
  fuelDebitUsd: number;
}

export interface SettleMissionOpts {
  /** Override world.tick for late calculation (tests). */
  tick?: number;
  /** Player fleet — relocates aircraft and applies tank fuel on depart/settle. */
  fleet?: CareerMissionsState;
  /** Actual fuel remaining in MSFS; falls back to estimated burn when unavailable. */
  residualFuelKg?: number;
}

export interface SettleMissionResult {
  mission: MissionIntent;
  settlement: MissionSettlement;
  /** Wallet delta to apply (payoutUsd). */
  walletCreditUsd: number;
  /** Fuel debit if this settle auto-departed (else 0). */
  fuelDebitUsd: number;
}

/** Late penalty as a fraction of pay per overdue tick. */
function latePenaltyRate(urgency: MissionIntent['urgency']): number {
  return urgency === 'urgent' ? 0.12 : 0.06;
}

function computeSettlementPay(
  mission: MissionIntent,
  settleTick: number,
): { lateTicks: number; penaltyUsd: number; payoutUsd: number; onTime: boolean } {
  const lateTicks = Math.max(0, settleTick - mission.deadlineTick);
  const onTime = lateTicks === 0;
  const rate = latePenaltyRate(mission.urgency);
  const penaltyUsd = onTime
    ? 0
    : Math.min(mission.payUsd, Math.round(mission.payUsd * lateTicks * rate));
  const payoutUsd = Math.max(0, mission.payUsd - penaltyUsd);
  return { lateTicks, penaltyUsd, payoutUsd, onTime };
}

function shrinkDeliveredLot(lot: ShipmentLot, bookKg: number): void {
  lot.reservedKg = Math.max(0, lot.reservedKg - bookKg);
  lot.quantityKg = Math.max(0, lot.quantityKg - bookKg);
  if (lot.quantityKg <= 0) {
    lot.quantityKg = 0;
    lot.reservedKg = 0;
    lot.status = 'delivered';
  } else if (lot.reservedKg <= 0) {
    lot.reservedKg = 0;
    lot.status = 'available';
  } else {
    lot.status = 'reserved';
  }
}

/**
 * Deliver cargo into the destination terminal, shrink each lot, pay freight (minus late penalty).
 * Accepts dispatched or in_flight (auto-departs if still dispatched).
 */
export function settleMission(
  world: CareerEconomyWorld,
  mission: MissionIntent,
  opts: SettleMissionOpts = {},
): SettleMissionResult {
  let working = normalizeMissionIntent(mission);
  if (
    working.status !== 'dispatched' &&
    working.status !== 'in_flight' &&
    working.status !== 'accepted'
  ) {
    throw new Error(`Cannot settle mission in status=${working.status}`);
  }

  let fuelDebitUsd = 0;
  if (working.status === 'accepted' || working.status === 'dispatched') {
    const departed = departMission(world, working, { fleet: opts.fleet });
    working = departed.mission;
    fuelDebitUsd = departed.fuelDebitUsd;
  }

  const residualFuelKg =
    typeof opts.residualFuelKg === 'number' && Number.isFinite(opts.residualFuelKg)
      ? Math.max(0, Math.round(opts.residualFuelKg))
      : undefined;
  if (opts.fleet) {
    relocateAircraftOnSettle(opts.fleet, working, world, residualFuelKg);
  }

  const settleTick = opts.tick ?? world.tick;
  let lastOriginStock = 0;
  let lastDestStock = 0;
  const settlementLines: MissionSettlementLine[] = [];

  const pay = computeSettlementPay(working, settleTick);
  // Allocate penalty across lines proportional to payUsd.
  let penaltyLeft = pay.penaltyUsd;

  for (let i = 0; i < working.lots.length; i++) {
    const line = working.lots[i]!;
    const delivery = applyFreightDelivery(world, {
      commodityId: line.commodityId,
      originIcao: working.originIcao,
      destIcao: working.destIcao,
      kg: line.cargoKg,
    });
    lastOriginStock = delivery.originStockKg;
    lastDestStock = delivery.destStockKg;

    const lot = findLot(world, line.shipmentLotId);
    shrinkDeliveredLot(lot, line.cargoKg);

    const isLast = i === working.lots.length - 1;
    const linePenalty = isLast
      ? penaltyLeft
      : Math.min(
          line.payUsd,
          Math.round(pay.penaltyUsd * (line.payUsd / Math.max(1, working.payUsd))),
        );
    penaltyLeft = Math.max(0, penaltyLeft - linePenalty);
    const linePayout = Math.max(0, line.payUsd - linePenalty);
    settlementLines.push({
      shipmentLotId: line.shipmentLotId,
      commodityId: line.commodityId,
      deliveredKg: line.cargoKg,
      payUsd: line.payUsd,
      penaltyUsd: linePenalty,
      payoutUsd: linePayout,
    });
  }

  const settled: MissionIntent = {
    ...working,
    status: 'settled',
    settledAtTick: settleTick,
    settledFuelKg: residualFuelKg,
    payoutUsd: pay.payoutUsd,
    penaltyUsd: pay.penaltyUsd,
    lateTicks: pay.lateTicks,
  };
  clearPlayerInbound(world, settled.id);

  return {
    mission: settled,
    walletCreditUsd: pay.payoutUsd,
    fuelDebitUsd,
    settlement: {
      missionId: settled.id,
      deliveredKg: working.cargoKg,
      payoutUsd: pay.payoutUsd,
      penaltyUsd: pay.penaltyUsd,
      lateTicks: pay.lateTicks,
      onTime: pay.onTime,
      originStockAfterKg: lastOriginStock,
      destStockAfterKg: lastDestStock,
      lines: settlementLines,
    },
  };
}

export function formatSettlementSummary(
  settlement: MissionSettlement,
  walletUsd: number,
): string {
  const late =
    settlement.lateTicks > 0
      ? ` LATE +${settlement.lateTicks} tick(s) penalty=$${settlement.penaltyUsd.toLocaleString()}`
      : ' on-time';
  return (
    `Settled ${settlement.missionId}: delivered ${(settlement.deliveredKg / 1000).toFixed(1)}t` +
    `  payout=$${settlement.payoutUsd.toLocaleString()}${late}  wallet=$${walletUsd.toLocaleString()}`
  );
}

/** Market rows that have cargo and fit the aircraft class range. */
export function listViableMarketLots(
  world: CareerEconomyWorld,
  aircraftClassId: FreighterClassId,
  opts: {
    originIcao?: string;
    destIcao?: string;
    commodityId?: MarketLotView['lot']['commodityId'];
    /** Override class max (e.g. live SimBrief maxcargo). */
    maxCargoKg?: number;
    nowMs?: number;
  } = {},
): MarketLotView[] {
  const aircraft = getAircraftClass(aircraftClassId);
  const maxCargoKg =
    opts.maxCargoKg !== undefined && Number.isFinite(opts.maxCargoKg) && opts.maxCargoKg > 0
      ? Math.floor(opts.maxCargoKg)
      : aircraft.maxCargoKg;
  return listMarketLots(world, opts).filter((row) => {
    const distance = routeDistanceNm(world, row.lot.originIcao, row.lot.destIcao);
    return (
      row.availableKg >= 1 &&
      maxCargoKg >= 1 &&
      distance !== undefined &&
      distance <= aircraft.maxRangeNm
    );
  });
}

export function formatMissionSummary(mission: MissionIntent): string {
  const normalized = normalizeMissionIntent(mission);
  const commodity = getCommodity(normalized.commodityId);
  const aircraft = getAircraftClass(normalized.aircraftClassId);
  const urgent = normalized.urgency === 'urgent' ? ' URGENT' : '';
  const lotsLabel =
    normalized.lots.length > 1 ? `  ${normalized.lots.length}lots` : '';
  const payout =
    normalized.status === 'settled' && normalized.payoutUsd !== undefined
      ? `  paid=$${normalized.payoutUsd.toLocaleString()}`
      : '';
  return (
    `${normalized.id}  [${normalized.status}]  ${normalized.originIcao}→${normalized.destIcao}  ` +
    `${commodity.name}  ${(normalized.cargoKg / 1000).toFixed(1)}t${lotsLabel}  pay=$${normalized.payUsd.toLocaleString()}` +
    `${urgent}  via ${aircraft.id}  due@tick ${normalized.deadlineTick}${payout}`
  );
}

export interface IntentOfpTolerances {
  /** Absolute cargo tolerance (kg). Default 500. */
  cargoAbsKg: number;
  /** Relative cargo tolerance vs intent. Default 0.03. */
  cargoPct: number;
  /** Max allowed OFP passenger count when mission.pax is 0. Default 0. */
  maxExtraPax: number;
}

export const DEFAULT_INTENT_OFP_TOLERANCES: IntentOfpTolerances = {
  cargoAbsKg: 500,
  cargoPct: 0.03,
  maxExtraPax: 0,
};

export interface IntentOfpCheck {
  verdict: ComplianceVerdict;
  findings: ComplianceFinding[];
}

/** ICAO codes that count as the same airframe family for Intent→OFP. */
const AIRFRAME_ICAO_ALIASES: Record<string, readonly string[]> = {
  B738: ['B738', 'B38M'],
  MD1F: ['MD1F', 'MD11'],
  MD11: ['MD11', 'MD1F'],
};

function normalizeIcao(code: string | undefined): string | undefined {
  const c = code?.trim().toUpperCase();
  return c || undefined;
}

function airframesCompatible(expectedIcao: string, actualIcao: string | undefined): boolean {
  const actual = normalizeIcao(actualIcao);
  if (!actual) return false;
  const expected = expectedIcao.toUpperCase();
  if (actual === expected) return true;
  const aliases = AIRFRAME_ICAO_ALIASES[expected] ?? [expected];
  return aliases.includes(actual);
}

function cargoToleranceKg(intentCargoKg: number, tolerances: IntentOfpTolerances): number {
  return Math.max(tolerances.cargoAbsKg, Math.abs(intentCargoKg) * tolerances.cargoPct);
}

/** Prefer SimBrief cargo/baggage; if freighter (pax≈0) fall back to payload. */
export function ofpCargoKg(ofp: OfpExpectation): number | undefined {
  const sheet = ofp.loadSheet;
  if (!sheet) return undefined;
  const unit = sheet.unit ?? ofp.fuel.unit ?? 'kg';
  const baggage = sheet.baggage;
  const payload = sheet.payload ?? ofp.payload?.total;
  const pax = sheet.passengerCount ?? 0;

  let value: number | undefined;
  if (baggage !== undefined) {
    value = baggage;
  } else if (payload !== undefined && pax <= 0) {
    value = payload;
  } else {
    return undefined;
  }

  // Intent cargo is always kg.
  return unit === 'kg' ? value : value / KG_TO_LB;
}

function worstVerdict(findings: ComplianceFinding[]): ComplianceVerdict {
  if (findings.some((f) => f.severity === 'fail')) return 'fail';
  if (findings.some((f) => f.severity === 'warn')) return 'warn';
  return 'pass';
}

/**
 * Validate MissionIntent against a fetched OFP (Slice 3).
 * Catches SimBrief edits to orig/dest/cargo/pax/airframe after dispatch prefill.
 */
export function compareMissionIntentToOfp(
  mission: MissionIntent,
  ofp: OfpExpectation,
  opts: { tolerances?: Partial<IntentOfpTolerances> } = {},
): IntentOfpCheck {
  const tolerances: IntentOfpTolerances = {
    ...DEFAULT_INTENT_OFP_TOLERANCES,
    ...(opts.tolerances ?? {}),
  };
  const findings: ComplianceFinding[] = [];
  const aircraft = getAircraftClass(mission.aircraftClassId);

  const ofpOrig = normalizeIcao(ofp.originIcao);
  const ofpDest = normalizeIcao(ofp.destIcao);
  const intentOrig = mission.originIcao.toUpperCase();
  const intentDest = mission.destIcao.toUpperCase();

  if (!ofpOrig) {
    findings.push({
      code: 'INTENT_ORIGIN_MISSING',
      severity: 'warn',
      message: 'OFP has no origin ICAO — cannot verify departure airport',
    });
  } else if (ofpOrig !== intentOrig) {
    findings.push({
      code: 'INTENT_ORIGIN_MISMATCH',
      severity: 'fail',
      message: `OFP origin ${ofpOrig} does not match mission ${intentOrig}`,
    });
  }

  if (!ofpDest) {
    findings.push({
      code: 'INTENT_DEST_MISSING',
      severity: 'warn',
      message: 'OFP has no destination ICAO — cannot verify arrival airport',
    });
  } else if (ofpDest !== intentDest) {
    findings.push({
      code: 'INTENT_DEST_MISMATCH',
      severity: 'fail',
      message: `OFP destination ${ofpDest} does not match mission ${intentDest}`,
    });
  }

  const ofpPax = ofp.loadSheet?.passengerCount;
  if (ofpPax === undefined) {
    findings.push({
      code: 'INTENT_PAX_MISSING',
      severity: 'warn',
      message: 'OFP has no passenger count — freighter missions expect pax=0',
    });
  } else if (ofpPax > mission.pax + tolerances.maxExtraPax) {
    findings.push({
      code: 'INTENT_PAX_MISMATCH',
      severity: 'fail',
      message: `OFP pax=${ofpPax} but mission expects pax=${mission.pax}`,
      expected: mission.pax,
      actual: ofpPax,
      delta: ofpPax - mission.pax,
    });
  }

  const ofpCargo = ofpCargoKg(ofp);
  if (ofpCargo === undefined) {
    findings.push({
      code: 'INTENT_CARGO_MISSING',
      severity: 'warn',
      message: 'OFP has no cargo/baggage weight — cannot verify freight load',
    });
  } else {
    const tol = cargoToleranceKg(mission.cargoKg, tolerances);
    const delta = ofpCargo - mission.cargoKg;
    if (Math.abs(delta) > tol) {
      findings.push({
        code: 'INTENT_CARGO_MISMATCH',
        severity: 'fail',
        message: `OFP cargo ${ofpCargo.toFixed(0)} kg vs mission ${mission.cargoKg} kg (tol ±${tol.toFixed(0)} kg)`,
        expected: mission.cargoKg,
        actual: ofpCargo,
        delta,
      });
    }
  }

  if (!ofp.icao) {
    findings.push({
      code: 'INTENT_AIRFRAME_MISSING',
      severity: 'warn',
      message: 'OFP has no aircraft ICAO — cannot verify freighter type',
    });
  } else if (!airframesCompatible(aircraft.simbriefIcao, ofp.icao)) {
    findings.push({
      code: 'INTENT_AIRFRAME_MISMATCH',
      severity: 'fail',
      message: `OFP airframe ${ofp.icao} is not compatible with mission class ${aircraft.id} (${aircraft.simbriefIcao})`,
    });
  }

  if (findings.length === 0) {
    findings.push({
      code: 'INTENT_OFP_OK',
      severity: 'info',
      message: `Intent matches OFP: ${intentOrig}→${intentDest} cargo≈${mission.cargoKg} kg pax=${mission.pax}`,
    });
  }

  return { verdict: worstVerdict(findings), findings };
}

export function formatIntentOfpCheck(check: IntentOfpCheck): string {
  const lines = [`Intent→OFP: ${check.verdict.toUpperCase()}`];
  for (const f of check.findings) {
    lines.push(`  [${f.severity}] ${f.code}: ${f.message}`);
  }
  return lines.join('\n');
}
