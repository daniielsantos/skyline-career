/**
 * Port FBO stevedore — terrestrial yard → WH truck (cross-hub, same port).
 * Reuses WarehouseInboundTransfer + settleWarehouseInboundTransfers.
 * Same-hub Store stays free/instant via depositPortPickupToWarehouse.
 */

import { hubDistanceNm } from './career-ferry-route.js';
import { routeDistanceNm } from './career-economy.js';
import { applyWalletDelta } from './career-ledger.js';
import { LOCAL_COMPANY_ID } from './career-store-v3.js';
import { isPortOperator, portOperatorEtaMult } from './career-port-concessions.js';
import { getCareerPort, ensurePlayerPortPickups } from './career-ports.js';
import {
  ensurePlayerWarehouses,
  warehouseInboundFreeKg,
} from './career-warehouse-stock.js';
import {
  warehouseInboundTransferTicks,
} from './career-warehouse.js';
import { logisticsMultForWarehouse } from './career-ground-staff.js';
import type {
  CareerEconomyWorld,
  CareerMissionsState,
  WarehouseInboundTransfer,
} from './types/career-economy.js';

/** Base $/kg for stevedore truck (before distance). */
export const PORT_STEVEDORE_USD_PER_KG = 0.03;
/** Extra $/kg per nm between yard hub and dest WH hub. */
export const PORT_STEVEDORE_USD_PER_KG_NM = 0.0004;
/** Cap on distance add-on ticks (beyond inbound transfer formula). */
export const PORT_STEVEDORE_MAX_EXTRA_TICKS = 4;

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function nextId(prefix: string, tick: number): string {
  return `${prefix}_${tick}_${Math.floor(Math.random() * 1e6)}`;
}

function distanceNm(
  world: CareerEconomyWorld,
  fromIcao: string,
  toIcao: string,
): number {
  const a = fromIcao.trim().toUpperCase();
  const b = toIcao.trim().toUpperCase();
  if (a === b) return 0;
  return hubDistanceNm(a, b) ?? routeDistanceNm(world, a, b) ?? 0;
}

export type PortStevedoreQuote = {
  pickupId: string;
  portId: string;
  fromHubIcao: string;
  destWarehouseId: string;
  destHubIcao: string;
  commodityId: string;
  kg: number;
  distanceNm: number;
  feeUsd: number;
  unitFeeUsd: number;
  transferTicks: number;
  readyAtTick: number;
  remainingYardKg: number;
};

function resolveHaul(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { pickupId: string; destWarehouseId: string; kg?: number },
  companyId: string,
): {
  pickupIndex: number;
  pickup: NonNullable<CareerMissionsState['portPickups']>[number];
  portId: string;
  fromHub: string;
  destWh: { id: string; icao: string };
  destHub: string;
  take: number;
  nm: number;
  feeUsd: number;
  unitFeeUsd: number;
  transferTicks: number;
  readyAtTick: number;
} {
  const pickups = ensurePlayerPortPickups(state);
  const pickupIndex = pickups.findIndex((p) => p.id === opts.pickupId.trim());
  if (pickupIndex < 0) throw new Error('Port pickup not found');
  const pickup = pickups[pickupIndex]!;
  const portId = pickup.portId.trim().toUpperCase();
  if (!isPortOperator(world, portId, companyId)) {
    throw new Error('Stevedore truck requires an active Port FBO on this port');
  }
  const port = getCareerPort(portId);
  if (!port) throw new Error(`Unknown port ${portId}`);

  const fromHub = pickup.hubIcao.trim().toUpperCase();
  const destWh = ensurePlayerWarehouses(state).warehouses.find(
    (w) => w.id === opts.destWarehouseId.trim(),
  );
  if (!destWh) throw new Error('Destination warehouse not found');
  const destHub = destWh.icao.trim().toUpperCase();
  if (fromHub === destHub) {
    throw new Error(
      'Same hub — use Store in WH (free). Stevedore is for another pickup hub.',
    );
  }
  const hubs = port.pickupHubs.map((h) => h.toUpperCase());
  if (!hubs.includes(fromHub) || !hubs.includes(destHub)) {
    throw new Error('Stevedore only moves cargo between pickup hubs of this port');
  }

  const inboundFree = warehouseInboundFreeKg(state, destWh.id);
  if (inboundFree <= 0) {
    throw new Error(`No inbound capacity at warehouse ${destHub}`);
  }
  const want =
    opts.kg != null && Number.isFinite(opts.kg)
      ? Math.max(0, Math.floor(opts.kg))
      : pickup.kg;
  const take = Math.min(want, pickup.kg, inboundFree);
  if (take <= 0) throw new Error('Nothing to truck');

  const nm = distanceNm(world, fromHub, destHub);
  const unitFeeUsd = money(
    PORT_STEVEDORE_USD_PER_KG + PORT_STEVEDORE_USD_PER_KG_NM * nm,
  );
  const feeUsd = money(unitFeeUsd * take);
  if (state.walletUsd < feeUsd) {
    throw new Error(
      `Stevedore fee $${feeUsd.toLocaleString()} exceeds wallet`,
    );
  }

  const logisticsMult = logisticsMultForWarehouse(state, destWh.id);
  const operatorEta = portOperatorEtaMult(world, portId, companyId);
  const baseTicks = warehouseInboundTransferTicks(
    take,
    logisticsMult * operatorEta,
  );
  const extra = Math.min(
    PORT_STEVEDORE_MAX_EXTRA_TICKS,
    Math.max(0, Math.ceil(nm / 50)),
  );
  const transferTicks = baseTicks + extra;
  const readyAtTick = world.tick + transferTicks;

  return {
    pickupIndex,
    pickup,
    portId,
    fromHub,
    destWh,
    destHub,
    take,
    nm,
    feeUsd,
    unitFeeUsd,
    transferTicks,
    readyAtTick,
  };
}

export function quotePortStevedoreHaul(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { pickupId: string; destWarehouseId: string; kg?: number },
  companyId = LOCAL_COMPANY_ID,
): PortStevedoreQuote {
  const r = resolveHaul(state, world, opts, companyId);
  return {
    pickupId: r.pickup.id,
    portId: r.portId,
    fromHubIcao: r.fromHub,
    destWarehouseId: r.destWh.id,
    destHubIcao: r.destHub,
    commodityId: r.pickup.commodityId,
    kg: r.take,
    distanceNm: Math.round(r.nm),
    feeUsd: r.feeUsd,
    unitFeeUsd: r.unitFeeUsd,
    transferTicks: r.transferTicks,
    readyAtTick: r.readyAtTick,
    remainingYardKg: Math.max(0, r.pickup.kg - r.take),
  };
}

export function startPortStevedoreHaul(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { pickupId: string; destWarehouseId: string; kg?: number },
  companyId = LOCAL_COMPANY_ID,
): {
  quote: PortStevedoreQuote;
  inboundTransfer: WarehouseInboundTransfer;
  remainingYardKg: number;
} {
  const r = resolveHaul(state, world, opts, companyId);
  const pickups = ensurePlayerPortPickups(state);
  const pickup = pickups[r.pickupIndex]!;

  applyWalletDelta(state, {
    amountUsd: -r.feeUsd,
    kind: 'port_drayage',
    atTick: world.tick,
    icao: r.fromHub,
    note: `Stevedore ${r.fromHub}→${r.destHub} · ${pickup.commodityId} · ${r.take} kg`,
  });

  pickup.kg -= r.take;
  if (pickup.kg <= 0) {
    pickups.splice(r.pickupIndex, 1);
  }

  const inboundTransfer: WarehouseInboundTransfer = {
    id: nextId('whin', world.tick),
    warehouseId: r.destWh.id,
    hubIcao: r.destHub,
    portId: r.portId,
    listingId: pickup.listingId,
    commodityId: pickup.commodityId,
    kg: r.take,
    unitCostUsd: pickup.avgCostUsdPerKg,
    purchasedAtTick: world.tick,
    readyAtTick: r.readyAtTick,
    source: 'stevedore',
  };
  ensurePlayerWarehouses(state).inboundTransfers!.push(inboundTransfer);

  const quote: PortStevedoreQuote = {
    pickupId: opts.pickupId.trim(),
    portId: r.portId,
    fromHubIcao: r.fromHub,
    destWarehouseId: r.destWh.id,
    destHubIcao: r.destHub,
    commodityId: pickup.commodityId,
    kg: r.take,
    distanceNm: Math.round(r.nm),
    feeUsd: r.feeUsd,
    unitFeeUsd: r.unitFeeUsd,
    transferTicks: r.transferTicks,
    readyAtTick: r.readyAtTick,
    remainingYardKg: Math.max(0, pickup.kg),
  };

  return { quote, inboundTransfer, remainingYardKg: quote.remainingYardKg };
}

/** Dest WH options at other pickup hubs of the same port (inbound free > 0). */
export function listPortStevedoreDestinations(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  pickupId: string,
  companyId = LOCAL_COMPANY_ID,
): Array<{
  warehouseId: string;
  hubIcao: string;
  inboundFreeKg: number;
  distanceNm: number;
  feeUsdPerKg: number;
}> {
  const pickups = ensurePlayerPortPickups(state);
  const pickup = pickups.find((p) => p.id === pickupId.trim());
  if (!pickup) return [];
  const portId = pickup.portId.trim().toUpperCase();
  if (!isPortOperator(world, portId, companyId)) return [];
  const port = getCareerPort(portId);
  if (!port) return [];
  const fromHub = pickup.hubIcao.trim().toUpperCase();
  const hubs = new Set(port.pickupHubs.map((h) => h.toUpperCase()));
  const out: Array<{
    warehouseId: string;
    hubIcao: string;
    inboundFreeKg: number;
    distanceNm: number;
    feeUsdPerKg: number;
  }> = [];
  for (const wh of ensurePlayerWarehouses(state).warehouses) {
    const hub = wh.icao.trim().toUpperCase();
    if (!hubs.has(hub) || hub === fromHub) continue;
    const inboundFreeKg = warehouseInboundFreeKg(state, wh.id);
    if (inboundFreeKg <= 0) continue;
    const nm = distanceNm(world, fromHub, hub);
    out.push({
      warehouseId: wh.id,
      hubIcao: hub,
      inboundFreeKg,
      distanceNm: Math.round(nm),
      feeUsdPerKg: money(
        PORT_STEVEDORE_USD_PER_KG + PORT_STEVEDORE_USD_PER_KG_NM * nm,
      ),
    });
  }
  out.sort((a, b) => a.distanceNm - b.distanceNm || a.hubIcao.localeCompare(b.hubIcao));
  return out;
}
