/**
 * Hub development level (1→5): progression driven by real traffic,
 * separate from static hubTier (major/regional/spoke).
 *
 * Quiet hubs slowly lose XP and can demote (hysteresis). L5 is a rare
 * ceiling that needs recent activity to reach and traffic to hold.
 */

import type {
  AirportTerminal,
  CareerEconomyWorld,
  CommodityId,
} from './types/career-economy.js';

/** Keep in sync with CAREER_COMMODITIES ids (avoid circular import). */
const COMMODITY_IDS: readonly CommodityId[] = [
  'electronics',
  'perishables',
  'machinery',
  'general',
  'supplies',
  'fuel',
  'mro_parts',
];

export const HUB_LEVEL_MIN = 1;
export const HUB_LEVEL_MAX = 5;

/**
 * Balance generation for XP thresholds / rates.
 * Bump when retuning so saves resync level from XP (may demote overleveled hubs once).
 */
export const HUB_LEVEL_CURVE_VERSION = 2;

/**
 * Cumulative XP to *reach* each level.
 * Tuned so L5 is a multi-week goal under +1 day traffic, not ~10 days.
 * Lot formation is cheap; settled freights / fuel ops carry most weight.
 */
export const HUB_LEVEL_XP_TO_REACH: Record<number, number> = {
  1: 0,
  2: 400,
  3: 1_200,
  4: 2_800,
  5: 5_500,
};

/**
 * Bonuses relative to level 1.
 * Capacity/flow are applied as one-shot rescale on level-up/down (ratio next/prev).
 * Lane/pay/bid are read live each tick.
 */
export const HUB_LEVEL_PROFILE: Record<
  number,
  {
    capacityMult: number;
    flowMult: number;
    /** Extra concurrent lots allowed on lanes touching this hub. */
    laneBonus: number;
    /** Origin freight pay bump when lots form here. */
    originPayMult: number;
    /** Local NPC bid aggression when home-region avg level is high. */
    npcBidMult: number;
  }
> = {
  1: {
    capacityMult: 1,
    flowMult: 1,
    laneBonus: 0,
    originPayMult: 1,
    npcBidMult: 1,
  },
  2: {
    capacityMult: 1.08,
    flowMult: 1.05,
    laneBonus: 0,
    originPayMult: 1.03,
    npcBidMult: 1.05,
  },
  3: {
    capacityMult: 1.18,
    flowMult: 1.1,
    laneBonus: 1,
    originPayMult: 1.06,
    npcBidMult: 1.1,
  },
  4: {
    capacityMult: 1.28,
    flowMult: 1.15,
    laneBonus: 1,
    originPayMult: 1.1,
    npcBidMult: 1.15,
  },
  5: {
    capacityMult: 1.4,
    flowMult: 1.2,
    laneBonus: 2,
    originPayMult: 1.14,
    npcBidMult: 1.2,
  },
};

/**
 * Activity points. Formation is intentionally tiny — the market spawns many
 * lots per tick; settles and fuel ops are the real signal.
 */
export const HUB_ACTIVITY = {
  lotOrigin: 0.15,
  lotDest: 0.08,
  freightSettleOrigin: 2.5,
  freightSettleDest: 3.5,
  fuelUpliftPerKg: 1 / 4000,
  fuelUpliftCap: 2,
  fuelTruckDelivery: 3,
} as const;

/** Who caused the XP — NPC/market traffic is discounted so levels are not a timer. */
export type HubActivitySource = 'player' | 'npc' | 'market';

export const HUB_ACTIVITY_SOURCE_MULT: Record<HubActivitySource, number> = {
  player: 1,
  npc: 0.4,
  market: 0.5,
};

/** Hard cap so a busy formation hour cannot dump a whole level alone (~6/hour ÷ 4). */
export const HUB_LEVEL_XP_PER_TICK_CAP = 1.5;

/**
 * Quiet hubs lose XP each tick. ~0.45 × 96 ≈ 43 XP/day.
 * L5 hysteresis slack (~675) drains in ~2 weeks of neglect.
 */
export const HUB_LEVEL_XP_DECAY_PER_TICK = 0.45;

/**
 * Demote only after XP falls this fraction of the span *into* the current level
 * below the reach threshold (anti yo-yo right after promote).
 */
export const HUB_LEVEL_DEMOTE_SLACK_FRAC = 0.25;

/** L5 promotion needs recent traffic, not XP + warehouse alone. */
export const HUB_LEVEL_L5_MIN_ACTIVITY_SCORE = 35;
/** Max idle ticks since last XP grant to allow L5 (~12 wall-hours). */
export const HUB_LEVEL_L5_MAX_IDLE_TICKS = 48;

/** Per 15-min tick; ≈ 0.985 per wall-hour (0.985^(1/4)). */
const ACTIVITY_DECAY_PER_TICK = 0.99622;
const ACTIVITY_SCORE_CAP = 100;
export const HUB_QUIET_ACTIVITY_SCORE = 8;
const QUIET_FLOW_MULT = 0.92;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function clampHubLevel(level: number): number {
  if (!Number.isFinite(level)) return HUB_LEVEL_MIN;
  return clamp(Math.round(level), HUB_LEVEL_MIN, HUB_LEVEL_MAX);
}

export function hubLevelFromXp(xp: number): number {
  const points = Math.max(0, xp);
  let level = 1;
  for (let L = 2; L <= HUB_LEVEL_MAX; L++) {
    const need = HUB_LEVEL_XP_TO_REACH[L] ?? Infinity;
    if (points >= need) level = L;
    else break;
  }
  return level;
}

export function hubLevelProfile(level: number) {
  return HUB_LEVEL_PROFILE[clampHubLevel(level)] ?? HUB_LEVEL_PROFILE[1]!;
}

/** XP must fall below this to demote from `level` (hysteresis under reach threshold). */
export function hubLevelDemoteBelowXp(level: number): number {
  const L = clampHubLevel(level);
  if (L <= 1) return 0;
  const at = HUB_LEVEL_XP_TO_REACH[L] ?? 0;
  const prev = HUB_LEVEL_XP_TO_REACH[L - 1] ?? 0;
  const span = Math.max(1, at - prev);
  return Math.max(prev, at - span * HUB_LEVEL_DEMOTE_SLACK_FRAC);
}

export function hubLevelIsQuiet(ap: AirportTerminal): boolean {
  return (ap.activityScore ?? ACTIVITY_SCORE_CAP * 0.4) < HUB_QUIET_ACTIVITY_SCORE;
}

export function hubLevelXpProgress(ap: AirportTerminal): {
  level: number;
  xp: number;
  xpIntoLevel: number;
  xpForNext: number | null;
  progressPct: number;
  atRisk: boolean;
  demoteBelowXp: number | null;
} {
  const level = clampHubLevel(ap.level ?? 1);
  const xp = Math.max(0, ap.levelXp ?? HUB_LEVEL_XP_TO_REACH[level] ?? 0);
  const quiet = hubLevelIsQuiet(ap);
  const demoteBelow = level > 1 ? hubLevelDemoteBelowXp(level) : null;
  const atRisk = level >= 2 && (quiet || (demoteBelow != null && xp < demoteBelow + (HUB_LEVEL_XP_TO_REACH[level]! - demoteBelow) * 0.35));

  if (level >= HUB_LEVEL_MAX) {
    // Bar = maintenance band from demote floor → reach threshold.
    const floor = demoteBelow ?? HUB_LEVEL_XP_TO_REACH[level]!;
    const at = HUB_LEVEL_XP_TO_REACH[level] ?? floor;
    const span = Math.max(1, at - floor);
    const into = clamp(xp - floor, 0, span);
    return {
      level,
      xp,
      xpIntoLevel: into,
      xpForNext: null,
      progressPct: Math.round((into / span) * 100),
      atRisk: quiet || xp < at,
      demoteBelowXp: floor,
    };
  }
  const at = HUB_LEVEL_XP_TO_REACH[level] ?? 0;
  const next = HUB_LEVEL_XP_TO_REACH[level + 1] ?? at;
  const span = Math.max(1, next - at);
  const into = clamp(xp - at, 0, span);
  return {
    level,
    xp,
    xpIntoLevel: into,
    xpForNext: next - at,
    progressPct: Math.round((into / span) * 100),
    atRisk,
    demoteBelowXp: demoteBelow,
  };
}

/** Live lane bonus from the stronger end of an OD pair. */
export function hubLevelLaneBonus(originLevel: number, destLevel: number): number {
  const a = hubLevelProfile(originLevel).laneBonus;
  const b = hubLevelProfile(destLevel).laneBonus;
  return Math.max(a, b);
}

export function hubLevelOriginPayMult(level: number): number {
  return hubLevelProfile(level).originPayMult;
}

export function hubLevelNpcBidMult(level: number): number {
  return hubLevelProfile(level).npcBidMult;
}

/**
 * Soft neglect: quiet hubs also lose a bit of throughput (on top of XP decay).
 * Returns 1 when healthy.
 */
export function hubLevelHealthMult(ap: AirportTerminal): number {
  const score = ap.activityScore ?? ACTIVITY_SCORE_CAP * 0.4;
  if (score >= HUB_QUIET_ACTIVITY_SCORE) return 1;
  const t = score / HUB_QUIET_ACTIVITY_SCORE;
  return QUIET_FLOW_MULT + (1 - QUIET_FLOW_MULT) * t;
}

function fillPct(stock: { stockKg: number; capacityKg: number }): number {
  if (!(stock.capacityKg > 0)) return 0;
  return clamp(stock.stockKg / stock.capacityKg, 0, 1);
}

/** Healthy warehouse mix required to actually promote. */
export function hubLevelHealthyForPromotion(ap: AirportTerminal): boolean {
  let ok = 0;
  let n = 0;
  for (const id of COMMODITY_IDS) {
    const s = ap.inventory[id];
    if (!s || !(s.capacityKg > 0)) continue;
    n += 1;
    const f = fillPct(s);
    if (f >= 0.22 && f <= 0.92) ok += 1;
  }
  return n > 0 && ok / n >= 0.55;
}

/** Extra gate for L5 — recent traffic, not just cumulative XP. */
export function hubLevelEligibleForPromotionTo(
  world: CareerEconomyWorld,
  ap: AirportTerminal,
  toLevel: number,
): boolean {
  if (!hubLevelHealthyForPromotion(ap)) return false;
  if (toLevel < HUB_LEVEL_MAX) return true;
  if ((ap.activityScore ?? 0) < HUB_LEVEL_L5_MIN_ACTIVITY_SCORE) return false;
  const idle = world.tick - (ap.lastActivityTick ?? 0);
  return idle <= HUB_LEVEL_L5_MAX_IDLE_TICKS;
}

function findAirport(
  world: CareerEconomyWorld,
  icao: string,
): AirportTerminal | undefined {
  return world.airports.find((a) => a.icao === icao.toUpperCase());
}

/** Ensure XP/activity fields exist; resync level when the XP curve is retuned. */
export function ensureAirportHubLevel(ap: AirportTerminal): void {
  if (typeof ap.levelXp !== 'number' || !Number.isFinite(ap.levelXp)) {
    // Pre-XP / pre-curve saves must not inherit stamped L5 floors.
    ap.levelXp =
      ap.levelCurveVersion === HUB_LEVEL_CURVE_VERSION
        ? HUB_LEVEL_XP_TO_REACH[clampHubLevel(ap.level ?? 1)] ?? 0
        : 0;
  } else {
    ap.levelXp = Math.max(0, ap.levelXp);
  }

  if (ap.levelCurveVersion !== HUB_LEVEL_CURVE_VERSION) {
    const target = hubLevelFromXp(ap.levelXp);
    let current = clampHubLevel(ap.level ?? 1);
    while (current > target) {
      applyLevelRescale(ap, current, current - 1);
      current -= 1;
    }
    while (current < target) {
      applyLevelRescale(ap, current, current + 1);
      current += 1;
    }
    ap.level = current;
    ap.levelCurveVersion = HUB_LEVEL_CURVE_VERSION;
  } else {
    ap.level = clampHubLevel(ap.level ?? 1);
  }

  if (typeof ap.activityScore !== 'number' || !Number.isFinite(ap.activityScore)) {
    ap.activityScore = 40;
  }
  if (typeof ap.lastActivityTick !== 'number') {
    ap.lastActivityTick = 0;
  }
}

export function ensureWorldHubLevels(world: CareerEconomyWorld): void {
  for (const ap of world.airports) {
    ensureAirportHubLevel(ap);
  }
}

function applyLevelRescale(ap: AirportTerminal, fromLevel: number, toLevel: number): void {
  const prev = hubLevelProfile(fromLevel);
  const next = hubLevelProfile(toLevel);
  const capRatio = next.capacityMult / prev.capacityMult;
  const flowRatio = next.flowMult / prev.flowMult;
  if (!ap.baseProduction) ap.baseProduction = { ...(ap.production ?? {}) };
  if (!ap.baseConsumption) ap.baseConsumption = { ...(ap.consumption ?? {}) };
  for (const id of COMMODITY_IDS) {
    const pile = ap.inventory[id];
    if (pile && pile.capacityKg > 0) {
      const fill = fillPct(pile);
      pile.capacityKg = Math.max(1, Math.round(pile.capacityKg * capRatio));
      pile.stockKg = clamp(Math.round(fill * pile.capacityKg), 0, pile.capacityKg);
    }
    ap.baseProduction[id] = Math.max(
      0,
      Math.round((ap.baseProduction[id] ?? ap.production[id] ?? 0) * flowRatio),
    );
    ap.baseConsumption[id] = Math.max(
      0,
      Math.round((ap.baseConsumption[id] ?? ap.consumption[id] ?? 0) * flowRatio),
    );
  }
}

export function recordHubActivity(
  world: CareerEconomyWorld,
  icao: string,
  points: number,
  source: HubActivitySource = 'player',
): void {
  if (!(points > 0)) return;
  const mult = HUB_ACTIVITY_SOURCE_MULT[source] ?? 1;
  const scaled = points * mult;
  if (!(scaled > 0)) return;
  const ap = findAirport(world, icao);
  if (!ap) return;
  ensureAirportHubLevel(ap);

  if (ap.levelXpTickAt !== world.tick) {
    ap.levelXpTickAt = world.tick;
    ap.levelXpTick = 0;
  }
  const already = ap.levelXpTick ?? 0;
  const room = Math.max(0, HUB_LEVEL_XP_PER_TICK_CAP - already);
  const grant = Math.min(scaled, room);
  if (!(grant > 0)) return;

  ap.levelXpTick = already + grant;
  ap.levelXp = (ap.levelXp ?? 0) + grant;
  ap.activityScore = Math.min(
    ACTIVITY_SCORE_CAP,
    (ap.activityScore ?? 0) + grant * 1.5,
  );
  ap.lastActivityTick = world.tick;
}

export function recordLotFormationActivity(
  world: CareerEconomyWorld,
  originIcao: string,
  destIcao: string,
): void {
  recordHubActivity(world, originIcao, HUB_ACTIVITY.lotOrigin, 'market');
  recordHubActivity(world, destIcao, HUB_ACTIVITY.lotDest, 'market');
}

export function recordFreightSettleActivity(
  world: CareerEconomyWorld,
  originIcao: string,
  destIcao: string,
  source: HubActivitySource = 'player',
): void {
  recordHubActivity(world, originIcao, HUB_ACTIVITY.freightSettleOrigin, source);
  recordHubActivity(world, destIcao, HUB_ACTIVITY.freightSettleDest, source);
}

export function recordFuelUpliftActivity(
  world: CareerEconomyWorld,
  originIcao: string,
  deliveredKg: number,
): void {
  if (!(deliveredKg > 0)) return;
  const pts = Math.min(
    HUB_ACTIVITY.fuelUpliftCap,
    deliveredKg * HUB_ACTIVITY.fuelUpliftPerKg,
  );
  recordHubActivity(world, originIcao, pts, 'player');
}

export function recordFuelTruckDeliveryActivity(
  world: CareerEconomyWorld,
  destIcao: string,
): void {
  recordHubActivity(world, destIcao, HUB_ACTIVITY.fuelTruckDelivery, 'npc');
}

/**
 * Decay activity + quiet XP, demote when below hysteresis floor, then promote.
 */
export function tickHubLevels(world: CareerEconomyWorld): {
  promoted: Array<{ icao: string; from: number; to: number }>;
  demoted: Array<{ icao: string; from: number; to: number }>;
} {
  ensureWorldHubLevels(world);
  const promoted: Array<{ icao: string; from: number; to: number }> = [];
  const demoted: Array<{ icao: string; from: number; to: number }> = [];

  for (const ap of world.airports) {
    ap.activityScore = Math.max(
      0,
      (ap.activityScore ?? 0) * ACTIVITY_DECAY_PER_TICK,
    );

    if (hubLevelIsQuiet(ap) && clampHubLevel(ap.level) >= 2) {
      ap.levelXp = Math.max(0, (ap.levelXp ?? 0) - HUB_LEVEL_XP_DECAY_PER_TICK);
    }

    let from = clampHubLevel(ap.level);
    while (from > 1 && (ap.levelXp ?? 0) < hubLevelDemoteBelowXp(from)) {
      const to = from - 1;
      applyLevelRescale(ap, from, to);
      ap.level = to;
      demoted.push({ icao: ap.icao, from, to });
      from = to;
    }

    if (from >= HUB_LEVEL_MAX) continue;
    // Evaluate promotion at most once every 6 ticks to avoid +1 day blasting many levels.
    if (world.tick % 6 !== 0) continue;
    if (!hubLevelHealthyForPromotion(ap)) continue;

    while (from < HUB_LEVEL_MAX) {
      const need = HUB_LEVEL_XP_TO_REACH[from + 1] ?? Infinity;
      if ((ap.levelXp ?? 0) < need) break;
      const to = from + 1;
      if (!hubLevelEligibleForPromotionTo(world, ap, to)) break;
      applyLevelRescale(ap, from, to);
      ap.level = to;
      promoted.push({ icao: ap.icao, from, to });
      from = to;
    }
  }

  return { promoted, demoted };
}

/** Average clamped level of airports in a region (for NPC bid mult). */
export function regionAverageHubLevel(
  world: CareerEconomyWorld,
  region: string,
): number {
  const list = world.airports.filter((a) => a.region === region);
  if (list.length === 0) return 1;
  const sum = list.reduce((s, a) => s + clampHubLevel(a.level ?? 1), 0);
  return sum / list.length;
}
