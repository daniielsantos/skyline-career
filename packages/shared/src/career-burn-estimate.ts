/**
 * Forward-looking fixed / recurring burn from current company footprint.
 * Estimate only — parking, storage, and Port FBO lease move with ops.
 */

import type { CareerEconomyWorld } from './career-economy.js';
import { ensureBaseDispatchers } from './career-base-dispatcher.js';
import { ensureCompanyCrew } from './career-crew.js';
import {
  ensurePlayerFbos,
  FBO_STORAGE_USD_PER_KG_DAY,
  FBO_STORAGE_VALUE_MULT,
} from './career-fbo.js';
import { ensureGroundStaff } from './career-ground-staff.js';
import { resolveHangarParkingUsdPerDay } from './career-hangar-fees.js';
import {
  concessionLeaseUsdPerDay,
  ensurePlayerPortConcessions,
} from './career-port-concessions.js';
import {
  ensurePlayerPortPickups,
  portYardHoldUsdPerDay,
} from './career-ports.js';
import {
  COMPANY_CREDIT_DAILY_RATE,
  ensureCompanyCredit,
} from './career-company-credit.js';
import {
  ensureVaLineCrew,
  resolveVaLineCrewTier,
} from './career-va-line-crew.js';
import {
  ensurePlayerWarehouses,
  WAREHOUSE_STORAGE_USD_PER_KG_DAY,
  WAREHOUSE_STORAGE_VALUE_MULT,
} from './career-warehouse.js';
import type {
  CareerMissionsState,
  CommodityId,
} from './types/career-economy.js';

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function storageUsdPerKgDay(commodityId: CommodityId, kind: 'wh' | 'fbo'): number {
  const base =
    kind === 'wh' ? WAREHOUSE_STORAGE_USD_PER_KG_DAY : FBO_STORAGE_USD_PER_KG_DAY;
  const mult =
    kind === 'wh' ? WAREHOUSE_STORAGE_VALUE_MULT : FBO_STORAGE_VALUE_MULT;
  if (commodityId === 'electronics' || commodityId === 'machinery') {
    return base * mult;
  }
  return base;
}

export type CareerBurnLineId =
  | 'crew'
  | 'ground_staff'
  | 'base_dispatcher'
  | 'va_line_crew'
  | 'aircraft_leases'
  | 'hangar_parking'
  | 'warehouse_storage'
  | 'port_yard'
  | 'port_fbo_lease'
  | 'base_storage'
  | 'credit_interest';

export type CareerBurnLine = {
  id: CareerBurnLineId;
  label: string;
  usdPerDay: number;
};

export type CareerBurnEstimate = {
  /** Sum of lines — economy $/day at current footprint. */
  totalUsdPerDay: number;
  /** Floor(wallet / total); null when burn is ~0. */
  runwayDays: number | null;
  lines: CareerBurnLine[];
};

function pushLine(
  lines: CareerBurnLine[],
  id: CareerBurnLineId,
  label: string,
  usdPerDay: number,
): void {
  const n = money(usdPerDay);
  if (n <= 0) return;
  lines.push({ id, label, usdPerDay: n });
}

/**
 * Quote recurring obligations if the company footprint stays as-is for one
 * economy day. Aircraft lease installments are weekly → amortize / 7.
 */
export function estimateCareerBurnUsdPerDay(
  state: CareerMissionsState,
  world: Pick<CareerEconomyWorld, 'tick' | 'airports'>,
): CareerBurnEstimate {
  const lines: CareerBurnLine[] = [];
  const tick = world.tick;

  const crewMembers = ensureCompanyCrew(state).members;
  let crewUsd = 0;
  for (const m of crewMembers) {
    crewUsd += m.salaryUsdPerDay ?? 85;
  }
  pushLine(lines, 'crew', `Crew salary (${crewMembers.length})`, crewUsd);

  const ground = ensureGroundStaff(state).members;
  let groundUsd = 0;
  for (const m of ground) groundUsd += m.salaryUsdPerDay;
  pushLine(lines, 'ground_staff', `Ground staff (${ground.length})`, groundUsd);

  const dispatchers = ensureBaseDispatchers(state).dispatchers ?? [];
  let dispUsd = 0;
  for (const m of dispatchers) dispUsd += m.salaryUsdPerDay;
  pushLine(
    lines,
    'base_dispatcher',
    `Base dispatcher (${dispatchers.length})`,
    dispUsd,
  );

  const vaCrew = ensureVaLineCrew(state, tick);
  if (vaCrew.hired) {
    const week = resolveVaLineCrewTier(vaCrew.tier).salaryUsdPerWeek;
    pushLine(lines, 'va_line_crew', 'VA Line crew', week / 7);
  }

  let leaseUsd = 0;
  let leaseCount = 0;
  for (const acf of state.fleet ?? []) {
    if (acf.ownership !== 'leased' || !acf.lease) continue;
    const weekly = acf.lease.monthlyUsd;
    if (!(weekly > 0)) continue;
    leaseUsd += weekly / 7;
    leaseCount += 1;
  }
  pushLine(
    lines,
    'aircraft_leases',
    `Aircraft leases (${leaseCount})`,
    leaseUsd,
  );

  let parkingUsd = 0;
  let parkingCount = 0;
  for (const acf of state.fleet ?? []) {
    const day = resolveHangarParkingUsdPerDay(acf, world, state);
    if (day == null || day <= 0) continue;
    parkingUsd += day;
    parkingCount += 1;
  }
  pushLine(
    lines,
    'hangar_parking',
    `Hangar parking (${parkingCount})`,
    parkingUsd,
  );

  const whs = ensurePlayerWarehouses(state);
  let whStorage = 0;
  for (const pile of whs.stock) {
    whStorage += pile.kg * storageUsdPerKgDay(pile.commodityId, 'wh');
  }
  pushLine(lines, 'warehouse_storage', 'Warehouse storage', whStorage);

  const pickups = ensurePlayerPortPickups(state);
  let yardUsd = 0;
  for (const p of pickups) {
    yardUsd += portYardHoldUsdPerDay({
      kg: p.kg,
      commodityId: p.commodityId,
      hubIcao: p.hubIcao,
      state,
    });
  }
  pushLine(lines, 'port_yard', `Port yard hold (${pickups.length})`, yardUsd);

  const concs = ensurePlayerPortConcessions(state).filter(
    (c) => c.leasePaidThroughTick > tick,
  );
  let fboLease = 0;
  for (const c of concs) {
    fboLease += concessionLeaseUsdPerDay(c, tick);
  }
  pushLine(
    lines,
    'port_fbo_lease',
    `Port FBO lease (${concs.length})`,
    fboLease,
  );

  const fbos = ensurePlayerFbos(state);
  let baseStorage = 0;
  for (const hold of fbos.holds) {
    baseStorage += hold.cargoKg * storageUsdPerKgDay(hold.commodityId, 'fbo');
  }
  pushLine(lines, 'base_storage', 'Base storage', baseStorage);

  const credit = ensureCompanyCredit(state, tick);
  const creditInterest = money(
    Math.max(0, credit.principalUsd) * COMPANY_CREDIT_DAILY_RATE,
  );
  pushLine(lines, 'credit_interest', 'Credit interest', creditInterest);

  const totalUsdPerDay = money(lines.reduce((s, l) => s + l.usdPerDay, 0));
  const wallet = Math.max(0, state.walletUsd ?? 0);
  const runwayDays =
    totalUsdPerDay > 0.009
      ? Math.floor(wallet / totalUsdPerDay)
      : null;

  return { totalUsdPerDay, runwayDays, lines };
}
