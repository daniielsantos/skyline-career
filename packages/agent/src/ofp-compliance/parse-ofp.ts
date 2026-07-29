import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  normalizeOfpExpectation,
  type OfpExpectation,
  type OfpFuelPlan,
  type OfpLoadSheet,
  type OfpPayloadPlan,
  type OfpTolerances,
} from '@msfs-compat/shared';

export interface OfpCliOverrides {
  fuelLeft?: number;
  fuelRight?: number;
  fuelCenter?: number;
  fuelTotal?: number;
  fuelUnit?: 'lb' | 'kg';
  blockFuel?: number;
  payloadTotal?: number;
  baggage?: number;
  passengerCount?: number;
  emptyWeight?: number;
  zfw?: number;
  tow?: number;
  stations?: Record<number, number>;
  icao?: string;
  ofpId?: string;
  tolerances?: Partial<OfpTolerances>;
}

export async function loadOfpFromFile(
  path: string,
): Promise<Partial<OfpExpectation> & { fuel?: OfpFuelPlan; loadSheet?: OfpLoadSheet }> {
  const raw = await readFile(resolve(path), 'utf8');
  return JSON.parse(raw) as Partial<OfpExpectation> & {
    fuel?: OfpFuelPlan;
    loadSheet?: OfpLoadSheet;
  };
}

/**
 * Build a normalized OfpExpectation from optional JSON file + CLI overrides.
 * Requires fuel via fuel.* and/or loadSheet.blockFuel.
 */
export async function buildOfpExpectation(
  ofpPath: string | undefined,
  overrides: OfpCliOverrides,
): Promise<OfpExpectation> {
  const fromFile = ofpPath ? await loadOfpFromFile(ofpPath) : {};

  const fuelUnit = overrides.fuelUnit ?? fromFile.fuel?.unit ?? fromFile.loadSheet?.unit ?? 'lb';
  const fuel: OfpFuelPlan = {
    unit: fuelUnit,
    left: overrides.fuelLeft ?? fromFile.fuel?.left,
    right: overrides.fuelRight ?? fromFile.fuel?.right,
    center: overrides.fuelCenter ?? fromFile.fuel?.center,
    total: overrides.fuelTotal ?? fromFile.fuel?.total,
  };

  let loadSheet: OfpLoadSheet | undefined = fromFile.loadSheet
    ? { ...fromFile.loadSheet, unit: fromFile.loadSheet.unit ?? fuelUnit }
    : undefined;

  const sheetPatches: Partial<OfpLoadSheet> = {};
  if (overrides.blockFuel !== undefined) sheetPatches.blockFuel = overrides.blockFuel;
  if (overrides.payloadTotal !== undefined) sheetPatches.payload = overrides.payloadTotal;
  if (overrides.baggage !== undefined) sheetPatches.baggage = overrides.baggage;
  if (overrides.passengerCount !== undefined) sheetPatches.passengerCount = overrides.passengerCount;
  if (overrides.emptyWeight !== undefined) sheetPatches.emptyWeight = overrides.emptyWeight;
  if (overrides.zfw !== undefined) sheetPatches.zfw = overrides.zfw;
  if (overrides.tow !== undefined) sheetPatches.tow = overrides.tow;

  if (Object.keys(sheetPatches).length > 0) {
    loadSheet = {
      unit: loadSheet?.unit ?? fuelUnit,
      ...(loadSheet ?? {}),
      ...sheetPatches,
    };
  }

  let payload: OfpPayloadPlan | undefined = fromFile.payload
    ? {
        unit: fromFile.payload.unit ?? 'lb',
        stations: fromFile.payload.stations,
        total: fromFile.payload.total,
        stationRoles: fromFile.payload.stationRoles,
      }
    : undefined;

  if (
    overrides.payloadTotal !== undefined ||
    (overrides.stations && Object.keys(overrides.stations).length > 0)
  ) {
    payload = {
      unit: payload?.unit ?? fuelUnit,
      total: overrides.payloadTotal ?? payload?.total,
      stations: {
        ...(payload?.stations ?? {}),
        ...(overrides.stations ?? {}),
      },
      stationRoles: payload?.stationRoles,
    };
  }

  return normalizeOfpExpectation({
    source: fromFile.source === 'simbrief' ? 'simbrief' : 'manual',
    ofpId: overrides.ofpId ?? fromFile.ofpId,
    icao: overrides.icao ?? fromFile.icao,
    fuel,
    loadSheet,
    payload,
    tolerances: {
      ...(fromFile.tolerances ?? {}),
      ...(overrides.tolerances ?? {}),
    },
  });
}
