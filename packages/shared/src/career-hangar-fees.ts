/**
 * Daily hangar / parking fees for idle player airframes.
 */

import { hubTierOf, type CareerEconomyWorld } from './career-economy.js';
import { applyWalletDelta } from './career-ledger.js';
import { economyDayIndex } from './career-weather.js';
import type {
  CareerMissionsState,
  FreighterClassId,
  HubTier,
  PlayerAircraft,
} from './types/career-economy.js';

/** Base USD/day at a regional hub (tier mult = 1). */
export const HANGAR_PARKING_BASE_USD: Record<FreighterClassId, number> = {
  light_ga: 45,
  light_turboprop: 85,
  light_jet: 180,
  narrow_freighter: 320,
  wide_freighter: 900,
};

/** Spoke cheaper, majors cost more to sit on the ramp. */
export const HANGAR_PARKING_TIER_MULT: Record<HubTier, number> = {
  spoke: 0.7,
  regional: 1,
  major: 1.45,
};

export type HangarParkingLine = {
  aircraftId: string;
  label: string;
  locationIcao: string;
  days: number;
  usdPerDay: number;
  debitUsd: number;
};

export type HangarParkingSettleResult = {
  debitUsd: number;
  requestedUsd: number;
  shortfallUsd: number;
  daysCharged: number;
  lines: HangarParkingLine[];
};

/** Parked on the ramp or in the shop — assigned / leased_out / listed are exempt. */
export function isHangarParkingBillable(
  aircraft: Pick<PlayerAircraft, 'status'>,
): boolean {
  return aircraft.status === 'parked' || aircraft.status === 'maintenance';
}

export function quoteHangarParkingUsdPerDay(
  aircraftClassId: FreighterClassId,
  hubTier: HubTier,
): number {
  const base = HANGAR_PARKING_BASE_USD[aircraftClassId];
  const mult = HANGAR_PARKING_TIER_MULT[hubTier];
  return Math.round(base * mult * 100) / 100;
}

export function resolveHangarParkingUsdPerDay(
  aircraft: PlayerAircraft,
  world: Pick<CareerEconomyWorld, 'airports'>,
): number | null {
  if (!isHangarParkingBillable(aircraft)) return null;
  const icao = aircraft.locationIcao.toUpperCase();
  const airport = world.airports.find((a) => a.icao.toUpperCase() === icao);
  return quoteHangarParkingUsdPerDay(
    aircraft.aircraftClassId,
    hubTierOf(airport ?? { icao }),
  );
}

/**
 * Debit wallet for hangar parking across economy days crossed by [fromTick, toTick).
 * Days charged = economyDayIndex(toTick) − economyDayIndex(fromTick).
 * Insufficient funds: take what's left and report shortfall (no soft-ground).
 */
export function settleHangarParkingFees(
  state: CareerMissionsState,
  world: Pick<CareerEconomyWorld, 'airports'>,
  opts: { fromTick: number; toTick: number },
): HangarParkingSettleResult {
  const daysCharged = Math.max(
    0,
    economyDayIndex(opts.toTick) - economyDayIndex(opts.fromTick),
  );
  if (daysCharged <= 0) {
    return {
      debitUsd: 0,
      requestedUsd: 0,
      shortfallUsd: 0,
      daysCharged: 0,
      lines: [],
    };
  }

  const lines: HangarParkingLine[] = [];
  let requestedUsd = 0;

  for (const aircraft of state.fleet) {
    const usdPerDay = resolveHangarParkingUsdPerDay(aircraft, world);
    if (usdPerDay == null || usdPerDay <= 0) continue;
    const debitUsd = Math.round(usdPerDay * daysCharged * 100) / 100;
    requestedUsd += debitUsd;
    lines.push({
      aircraftId: aircraft.id,
      label: aircraft.label,
      locationIcao: aircraft.locationIcao,
      days: daysCharged,
      usdPerDay,
      debitUsd,
    });
  }

  requestedUsd = Math.round(requestedUsd * 100) / 100;
  const debitUsd = Math.min(
    Math.max(0, Math.round(state.walletUsd * 100) / 100),
    requestedUsd,
  );
  const shortfallUsd = Math.round((requestedUsd - debitUsd) * 100) / 100;
  if (debitUsd > 0) {
    const labels = lines.map((l) => l.label).slice(0, 3).join(', ');
    applyWalletDelta(state, {
      amountUsd: -debitUsd,
      kind: 'hangar_parking',
      atTick: opts.toTick,
      note:
        shortfallUsd > 0
          ? `${daysCharged}d · ${lines.length} acf · short $${shortfallUsd}`
          : `${daysCharged}d · ${lines.length} acf${labels ? ` · ${labels}` : ''}`,
    });
  }

  return { debitUsd, requestedUsd, shortfallUsd, daysCharged, lines };
}
