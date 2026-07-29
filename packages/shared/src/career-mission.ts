import {
  getCommodity,
  listMarketLots,
  type CareerEconomyWorld,
  type MarketLotView,
} from './career-economy.js';
import { KG_TO_LB } from './ofp-compliance.js';
import type {
  ComplianceFinding,
  ComplianceVerdict,
  OfpExpectation,
} from './types/ofp-compliance.js';
import type {
  AircraftClass,
  FreighterClassId,
  MissionIntent,
  ShipmentLot,
} from './types/career-economy.js';

export type {
  AircraftClass,
  FreighterClassId,
  MissionIntent,
  MissionStatus,
  CareerMissionsState,
} from './types/career-economy.js';

export const CAREER_AIRCRAFT_CLASSES: readonly AircraftClass[] = [
  {
    id: 'narrow_freighter',
    name: 'Narrow freighter (B738 BCF class)',
    maxCargoKg: 22_000,
    maxRangeNm: 2_500,
    rolesPackRelPath: 'profiles/ofp/pmdg-738-bcf.json',
    simbriefIcao: 'B738',
    simbriefAirframeMatch: 'PMDG \\(MSFS\\) - Boeing Converted Freighter',
  },
  {
    id: 'wide_freighter',
    name: 'Wide freighter (MD-11F class)',
    maxCargoKg: 90_000,
    maxRangeNm: 6_000,
    rolesPackRelPath: 'profiles/ofp/tfdi-md11f.json',
    simbriefIcao: 'MD1F',
    simbriefAirframeMatch: 'TFDi Design \\(MSFS\\) - MD-11F',
  },
] as const;

const CLASS_BY_ID: Record<FreighterClassId, AircraftClass> = Object.fromEntries(
  CAREER_AIRCRAFT_CLASSES.map((c) => [c.id, c]),
) as Record<FreighterClassId, AircraftClass>;

export function getAircraftClass(id: FreighterClassId): AircraftClass {
  return CLASS_BY_ID[id];
}

export function parseFreighterClassId(raw: string | undefined): FreighterClassId | undefined {
  if (!raw) return undefined;
  if (raw === 'narrow_freighter' || raw === 'wide_freighter') return raw;
  if (raw === 'narrow' || raw === 'bcf' || raw === '738') return 'narrow_freighter';
  if (raw === 'wide' || raw === 'md11' || raw === 'md-11f') return 'wide_freighter';
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
    missionId?: string;
  },
): MissionIntent {
  const aircraft = getAircraftClass(opts.aircraftClassId ?? 'narrow_freighter');
  const lot = findLot(world, opts.lotId);
  const avail = lotAvailableKg(lot);
  if (avail <= 0) {
    throw new Error(`Lot ${opts.lotId} has no remaining cargo`);
  }

  const requested =
    opts.cargoKg !== undefined ? Math.floor(opts.cargoKg) : Math.min(avail, aircraft.maxCargoKg);
  const cargoKg = Math.min(requested, avail, aircraft.maxCargoKg);
  if (cargoKg <= 0) {
    throw new Error(
      `Nothing to accept: requested=${requested} avail=${avail} aircraftMax=${aircraft.maxCargoKg}`,
    );
  }

  const { payUsd } = reserveShipmentLot(world, opts.lotId, cargoKg);
  const id =
    opts.missionId?.trim() ||
    `msn_${world.tick}_${lot.originIcao}_${lot.destIcao}_${Math.floor(Math.random() * 1e6)}`;

  return {
    id,
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
  };
}

export function cancelMission(
  world: CareerEconomyWorld,
  mission: MissionIntent,
): MissionIntent {
  if (mission.status !== 'accepted' && mission.status !== 'dispatched') {
    throw new Error(`Cannot cancel mission in status=${mission.status}`);
  }
  releaseShipmentReservation(world, mission.shipmentLotId, mission.cargoKg);
  return { ...mission, status: 'cancelled' };
}

/** Market rows that fit under the aircraft cargo limit (at least 1 kg). */
export function listViableMarketLots(
  world: CareerEconomyWorld,
  aircraftClassId: FreighterClassId,
  opts: { originIcao?: string; destIcao?: string; commodityId?: MarketLotView['lot']['commodityId'] } = {},
): MarketLotView[] {
  const aircraft = getAircraftClass(aircraftClassId);
  return listMarketLots(world, opts).filter((row) => row.availableKg >= 1 && aircraft.maxCargoKg >= 1);
}

export function formatMissionSummary(mission: MissionIntent): string {
  const commodity = getCommodity(mission.commodityId);
  const aircraft = getAircraftClass(mission.aircraftClassId);
  const urgent = mission.urgency === 'urgent' ? ' URGENT' : '';
  return (
    `${mission.id}  [${mission.status}]  ${mission.originIcao}→${mission.destIcao}  ` +
    `${commodity.name}  ${(mission.cargoKg / 1000).toFixed(1)}t  pay=$${mission.payUsd.toLocaleString()}` +
    `${urgent}  via ${aircraft.id}  due@tick ${mission.deadlineTick}`
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
