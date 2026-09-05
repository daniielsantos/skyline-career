/**
 * Measure-only tooling: shock recovery time + NPC-only soak wrappers.
 * Does not retune Dry / CARGO_FLOW_BALANCE.
 */
import { TICKS_PER_DAY } from './career-clock.js';
import { isBushTripOnlyHub } from './career-bush.js';
import { listOpenDemandOrders } from './career-demand.js';
import {
  tickEconomyN,
} from './career-economy.js';
import {
  computeEconomyPulse,
  median,
  sweepEconomyPulse,
  type EconomyPulseSweepResult,
} from './career-economy-pulse.js';
import type {
  AirportTerminal,
  CareerEconomyWorld,
  CommodityId,
  EconomyEvent,
  EconomyEventKind,
  StockPile,
} from './types/career-economy.js';

function fillPct(stock: StockPile): number {
  return stock.capacityKg > 0 ? stock.stockKg / stock.capacityKg : 0;
}

function isCargoEconomyHub(ap: AirportTerminal): boolean {
  return !(ap.bushTripOnly === true || isBushTripOnlyHub(ap.icao));
}

function hubsInRegion(
  world: CareerEconomyWorld,
  region: string,
): AirportTerminal[] {
  const want = region.trim().toUpperCase();
  return (world.airports ?? []).filter(
    (ap) =>
      isCargoEconomyHub(ap) && (ap.region ?? '').toUpperCase() === want,
  );
}

/** Median fill of `commodityId` across cargo hubs in `region` (null if none). */
export function regionCommodityFillP50(
  world: CareerEconomyWorld,
  region: string,
  commodityId: CommodityId,
): number | null {
  const fills: number[] = [];
  for (const ap of hubsInRegion(world, region)) {
    const pile = ap.inventory?.[commodityId];
    if (!pile || pile.capacityKg <= 0) continue;
    fills.push(fillPct(pile));
  }
  return median(fills);
}

export function regionCommodityShortageHubCount(
  world: CareerEconomyWorld,
  region: string,
  commodityId: CommodityId,
  shortageFill = 0.45,
): number {
  let n = 0;
  for (const ap of hubsInRegion(world, region)) {
    const pile = ap.inventory?.[commodityId];
    if (!pile || pile.capacityKg <= 0) continue;
    if (fillPct(pile) <= shortageFill) n += 1;
  }
  return n;
}

export type InjectEconomyEventProbeOpts = {
  kind: EconomyEventKind;
  region: string;
  commodityId?: CommodityId;
  /** Shock length in ticks (default 96 = 1 day). */
  durationTicks?: number;
  /** Stable id for tests; default `recovery_${tick}_${kind}`. */
  id?: string;
  label?: string;
};

/** Push one explicit {@link EconomyEvent} (no RNG). Returns the event. */
export function injectEconomyEventForProbe(
  world: CareerEconomyWorld,
  opts: InjectEconomyEventProbeOpts,
): EconomyEvent {
  if (!world.events) world.events = [];
  const duration = Math.max(
    1,
    Math.floor(opts.durationTicks ?? TICKS_PER_DAY),
  );
  const region = opts.region.trim().toUpperCase();
  const event: EconomyEvent = {
    id: opts.id ?? `recovery_${world.tick}_${opts.kind}`,
    kind: opts.kind,
    region,
    commodityId: opts.commodityId,
    startsAtTick: world.tick,
    endsAtTick: world.tick + duration,
    label: opts.label ?? 'recovery-probe',
  };
  world.events.push(event);
  return event;
}

export type RecoveryProbeSample = {
  atTick: number;
  fillP50: number | null;
  shortageHubs: number;
  spokeRecoveryActive: boolean;
};

export type RecoveryProbeResult = {
  region: string;
  kind: EconomyEventKind;
  commodityId: CommodityId | undefined;
  eventId: string;
  startsAtTick: number;
  endsAtTick: number;
  baselineFill: number | null;
  minFill: number | null;
  recovered: boolean;
  noEffect: boolean;
  timeout: boolean;
  recoveryTicks: number | null;
  /** Ticks from inject to recovery decision (or timeout). */
  elapsedTicks: number;
  lastFill: number | null;
  lastShortageHubs: number;
  spokeRecoveryEverActive: boolean;
  samples: RecoveryProbeSample[];
};

export type RunRecoveryProbeOpts = {
  kind?: EconomyEventKind;
  region: string;
  commodityId?: CommodityId;
  durationTicks?: number;
  /** Pre-inject baseline window (default 12). */
  baselineTicks?: number;
  /** ± fraction of fill (default 0.05 = 5 pt). */
  bandPts?: number;
  /** Consecutive in-band ticks after shock ends (default 8). */
  stableTicks?: number;
  /** Extra ticks after endsAtTick before timeout (default 2 days). */
  timeoutTicksAfterEnd?: number;
  /** Sample cadence during shock/recovery (default 4). */
  sampleEvery?: number;
  eventId?: string;
  fromBatchAtMs?: number;
};

function spokeRecoveryActiveInRegion(
  world: CareerEconomyWorld,
  region: string,
): boolean {
  const key = region.trim().toUpperCase();
  const state = world.regionalRecovery?.[key] ?? world.regionalRecovery?.[region];
  return state?.active === true;
}

/**
 * Warm baseline → inject one shock → tick until fill recovers in-band after
 * shock ends, or timeout. Disables RNG event spawn for the measured window.
 */
export function runRecoveryProbe(
  world: CareerEconomyWorld,
  opts: RunRecoveryProbeOpts,
): RecoveryProbeResult {
  const kind = opts.kind ?? 'factory_outage';
  const commodityId =
    opts.commodityId ??
    (kind === 'factory_outage' ? 'electronics' : undefined);
  const region = opts.region.trim().toUpperCase();
  const baselineTicks = Math.max(1, Math.floor(opts.baselineTicks ?? 12));
  const bandPts = opts.bandPts ?? 0.05;
  const stableTicks = Math.max(1, Math.floor(opts.stableTicks ?? 8));
  const timeoutExtra = Math.max(
    0,
    Math.floor(opts.timeoutTicksAfterEnd ?? TICKS_PER_DAY * 2),
  );
  const sampleEvery = Math.max(1, Math.floor(opts.sampleEvery ?? 4));
  const batchOpts = {
    skipEventSpawn: true as const,
    fromBatchAtMs: opts.fromBatchAtMs ?? world.lastBatchAtMs,
  };

  const baselineFills: number[] = [];
  for (let i = 0; i < baselineTicks; i++) {
    tickEconomyN(world, 1, batchOpts);
    const f = regionCommodityFillP50(world, region, commodityId ?? 'general');
    if (f !== null) baselineFills.push(f);
  }
  const baselineFill = median(baselineFills);

  const event = injectEconomyEventForProbe(world, {
    kind,
    region,
    commodityId,
    durationTicks: opts.durationTicks ?? TICKS_PER_DAY,
    id: opts.eventId,
  });

  const fillAtInject = regionCommodityFillP50(
    world,
    region,
    commodityId ?? 'general',
  );
  let minFill = fillAtInject;
  let spokeRecoveryEverActive = spokeRecoveryActiveInRegion(world, region);
  const samples: RecoveryProbeSample[] = [
    {
      atTick: world.tick,
      fillP50: fillAtInject,
      shortageHubs: regionCommodityShortageHubCount(
        world,
        region,
        commodityId ?? 'general',
      ),
      spokeRecoveryActive: spokeRecoveryEverActive,
    },
  ];

  const timeoutAt = event.endsAtTick + timeoutExtra;
  let stableRun = 0;
  let recovered = false;
  let noEffect = false;
  let recoveryTicks: number | null = null;
  const injectTick = world.tick;

  while (world.tick < timeoutAt) {
    const step = Math.min(sampleEvery, timeoutAt - world.tick);
    tickEconomyN(world, step, batchOpts);
    const fill = regionCommodityFillP50(
      world,
      region,
      commodityId ?? 'general',
    );
    const shortage = regionCommodityShortageHubCount(
      world,
      region,
      commodityId ?? 'general',
    );
    const spokeOn = spokeRecoveryActiveInRegion(world, region);
    if (spokeOn) spokeRecoveryEverActive = true;
    if (fill !== null && (minFill === null || fill < minFill)) minFill = fill;
    samples.push({
      atTick: world.tick,
      fillP50: fill,
      shortageHubs: shortage,
      spokeRecoveryActive: spokeOn,
    });

    if (baselineFill === null || fill === null) {
      stableRun = 0;
      continue;
    }
    const inBand = Math.abs(fill - baselineFill) <= bandPts;
    const shockOver = world.tick >= event.endsAtTick;
    if (shockOver && inBand) {
      stableRun += step;
      if (stableRun >= stableTicks) {
        recovered = true;
        recoveryTicks = world.tick - injectTick;
        break;
      }
    } else {
      stableRun = 0;
    }
  }

  if (
    !recovered &&
    baselineFill !== null &&
    minFill !== null &&
    Math.abs(minFill - baselineFill) <= bandPts
  ) {
    noEffect = true;
  }

  const last = samples[samples.length - 1]!;
  return {
    region,
    kind,
    commodityId,
    eventId: event.id,
    startsAtTick: event.startsAtTick,
    endsAtTick: event.endsAtTick,
    baselineFill,
    minFill,
    recovered,
    noEffect,
    timeout: !recovered && !noEffect,
    recoveryTicks,
    elapsedTicks: world.tick - injectTick,
    lastFill: last.fillP50,
    lastShortageHubs: last.shortageHubs,
    spokeRecoveryEverActive,
    samples,
  };
}

export type DemandBacklogSnapshot = {
  openOrders: number;
  remainingKg: number;
  byCommodity: Record<string, { openOrders: number; remainingKg: number }>;
};

export function snapshotDemandBacklog(
  world: CareerEconomyWorld,
): DemandBacklogSnapshot {
  const open = listOpenDemandOrders(world);
  const byCommodity: DemandBacklogSnapshot['byCommodity'] = {};
  let remainingKg = 0;
  for (const o of open) {
    remainingKg += o.remainingKg;
    const acc = byCommodity[o.commodityId] ?? {
      openOrders: 0,
      remainingKg: 0,
    };
    acc.openOrders += 1;
    acc.remainingKg += o.remainingKg;
    byCommodity[o.commodityId] = acc;
  }
  return { openOrders: open.length, remainingKg, byCommodity };
}

export type SoakGateNote = {
  level: 'ok' | 'watch' | 'risk';
  signal: string;
  detail: string;
};

function countryPulse(
  pulse: ReturnType<typeof computeEconomyPulse>,
  countryId: string,
) {
  return pulse.countries.find((c) => c.countryId === countryId);
}

function commodityPulse(
  pulse: ReturnType<typeof computeEconomyPulse>,
  commodityId: string,
) {
  return pulse.commodities.find((c) => c.commodityId === commodityId);
}

/** Advisory gates for an NPC-only soak (human-read; not CI asserts). */
export function soakGateNotes(
  first: ReturnType<typeof computeEconomyPulse>,
  last: ReturnType<typeof computeEconomyPulse>,
): SoakGateNote[] {
  const notes: SoakGateNote[] = [];
  const fill0 = commodityPulse(first, 'general')?.fillP50 ?? null;
  const fill1 = commodityPulse(last, 'general')?.fillP50 ?? null;
  if (fill0 !== null && fill1 !== null) {
    const delta = fill1 - fill0;
    const level =
      Math.abs(delta) > 0.15 ? 'risk' : Math.abs(delta) > 0.08 ? 'watch' : 'ok';
    notes.push({
      level,
      signal: 'general.fillP50',
      detail: `${(fill0 * 100).toFixed(1)}% → ${(fill1 * 100).toFixed(1)}% (${(delta * 100).toFixed(1)} pt)`,
    });
  }

  for (const countryId of ['BR', 'US'] as const) {
    const a = countryPulse(first, countryId)?.liveHubPct ?? null;
    const b = countryPulse(last, countryId)?.liveHubPct ?? null;
    if (a === null || b === null) continue;
    const drop = a - b;
    const level = drop >= 0.1 ? 'risk' : drop >= 0.05 ? 'watch' : 'ok';
    notes.push({
      level,
      signal: `${countryId}.liveHubPct`,
      detail: `${(a * 100).toFixed(1)}% → ${(b * 100).toFixed(1)}%`,
    });
  }

  const dead0 = first.countries
    .filter((c) => c.countryId !== 'INTL')
    .reduce((s, c) => s + c.deadHubs, 0);
  const dead1 = last.countries
    .filter((c) => c.countryId !== 'INTL')
    .reduce((s, c) => s + c.deadHubs, 0);
  notes.push({
    level: dead1 > dead0 + 40 ? 'risk' : dead1 > dead0 + 15 ? 'watch' : 'ok',
    signal: 'deadHubs',
    detail: `${dead0} → ${dead1}`,
  });

  const lots0 = first.availableLots;
  const lots1 = last.availableLots;
  let lotsLevel: SoakGateNote['level'] = 'ok';
  if (lots0 === lots1) {
    lotsLevel = 'ok';
  } else if (lots1 < 50 || lots1 > Math.max(5000, lots0 * 3)) {
    lotsLevel = lots1 < 10 ? 'risk' : 'watch';
  } else if (lots1 < lots0 * 0.25) {
    lotsLevel = 'watch';
  }
  notes.push({
    level: lotsLevel,
    signal: 'availableLots',
    detail: `${lots0} → ${lots1}`,
  });

  const pay0 = commodityPulse(first, 'general')?.payPerKgP50 ?? null;
  const pay1 = commodityPulse(last, 'general')?.payPerKgP50 ?? null;
  if (pay0 !== null && pay1 !== null) {
    const ratio = pay0 > 0 ? pay1 / pay0 : 1;
    notes.push({
      level: ratio < 0.4 || ratio > 2.5 ? 'risk' : ratio < 0.7 || ratio > 1.6 ? 'watch' : 'ok',
      signal: 'general.payPerKgP50',
      detail: `$${pay0.toFixed(2)} → $${pay1.toFixed(2)}/kg`,
    });
  }

  const skus = ['general', 'electronics', 'machinery', 'perishables', 'supplies'] as const;
  const fillDeltas = skus
    .map((id) => {
      const a = commodityPulse(first, id)?.fillP50;
      const b = commodityPulse(last, id)?.fillP50;
      if (a == null || b == null) return null;
      return b - a;
    })
    .filter((n): n is number => n !== null);
  if (fillDeltas.length >= 3) {
    const mean =
      fillDeltas.reduce((s, n) => s + n, 0) / fillDeltas.length;
    const lockstep = fillDeltas.every((d) => Math.abs(d - mean) < 0.03);
    notes.push({
      level: lockstep ? 'watch' : 'ok',
      signal: 'skuFillShape',
      detail: lockstep
        ? 'SKU fills moved nearly in lockstep (may be Dry skins)'
        : 'SKU fills diverged across commodities',
    });
  }

  return notes;
}

export type NpcOnlySoakReport = {
  days: number;
  demandStart: DemandBacklogSnapshot;
  demandEnd: DemandBacklogSnapshot;
  gateNotes: SoakGateNote[];
  notes: string[];
  sweep: EconomyPulseSweepResult;
};

/**
 * NPC-only soak: advance with {@link sweepEconomyPulse}, attach Demand backlog
 * and advisory gates. Caller must clone the world first (never mutate live save).
 */
export function buildNpcOnlySoakReport(
  world: CareerEconomyWorld,
  opts: {
    days?: number;
    everyDays?: number;
    nowMs?: number;
  } = {},
): NpcOnlySoakReport {
  const days = Math.max(0, opts.days ?? 30);
  const everyDays = Math.max(1 / TICKS_PER_DAY, opts.everyDays ?? 1);
  const demandStart = snapshotDemandBacklog(world);
  const sweep = sweepEconomyPulse(world, {
    ticks: Math.round(days * TICKS_PER_DAY),
    every: Math.round(everyDays * TICKS_PER_DAY),
    nowMs: opts.nowMs,
  });
  const demandEnd = snapshotDemandBacklog(world);
  const gateNotes = soakGateNotes(sweep.first, sweep.last);
  const notes: string[] = [
    'NPC-only soak: no player Accept / Demand fulfill in this run.',
    'Demand backlog is expected to grow (player-only fulfill).',
    'Gates are advisory — human-read the JSON; not CI fail.',
  ];
  if (demandEnd.remainingKg + 1e-6 < demandStart.remainingKg) {
    notes.push(
      'Demand remainingKg decreased without player fulfill — investigate.',
    );
  }
  for (const g of gateNotes) {
    if (g.level !== 'ok') notes.push(`[${g.level}] ${g.signal}: ${g.detail}`);
  }
  return {
    days,
    demandStart,
    demandEnd,
    gateNotes,
    notes,
    sweep,
  };
}
