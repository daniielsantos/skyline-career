/**
 * One-off: Jet-A health with fuel trucks vs trucks parked (no redistribution).
 *
 *   node packages/shared/scripts/measure-fuel-trucks.mjs
 *
 * Requires a built shared package (`npm run build -w @msfs-compat/shared`).
 */

import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');

const {
  createSeedEconomyWorld,
  tickEconomyN,
  FUEL_HUB_ICAOS,
  TICKS_PER_DAY,
} = await import(pathToFileURL(join(dist, 'career-economy.js')).href);

const SHORTAGE_FILL = 0.28;
const HUB_SURPLUS_FILL = 0.4;
const DAYS = 3;
const SEED = 'fuel-truck-measure';

function median(xs) {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function mean(xs) {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function fillOf(ap) {
  const fuel = ap.inventory?.fuel;
  if (!fuel || !(fuel.capacityKg > 0)) return null;
  return Math.min(1, Math.max(0, fuel.stockKg / fuel.capacityKg));
}

function snapshot(world, label) {
  const hubs = [];
  const spokes = [];
  for (const ap of world.airports) {
    if (ap.bushTripOnly) continue;
    const fill = fillOf(ap);
    if (fill == null) continue;
    const row = { icao: ap.icao, fill };
    if (FUEL_HUB_ICAOS.has(ap.icao)) hubs.push(row);
    else spokes.push(row);
  }
  const hubFills = hubs.map((h) => h.fill);
  const spokeFills = spokes.map((s) => s.fill);
  const spokesDry = spokes.filter((s) => s.fill < SHORTAGE_FILL);
  const hubsSurplus = hubs.filter((h) => h.fill >= HUB_SURPLUS_FILL);
  const hubsThin = hubs.filter((h) => h.fill < SHORTAGE_FILL);
  const enroute = (world.fuelHauls ?? []).filter((h) => h.status === 'enroute')
    .length;
  const completed = (world.fuelHauls ?? []).filter(
    (h) => h.status === 'completed',
  ).length;
  const idleTrucks = (world.fuelTrucks ?? []).filter(
    (t) => t.status === 'idle',
  ).length;
  const busyTrucks = (world.fuelTrucks ?? []).filter(
    (t) => t.status !== 'idle',
  ).length;

  return {
    label,
    tick: world.tick,
    hubs: hubs.length,
    spokes: spokes.length,
    hubFillMean: mean(hubFills),
    hubFillP50: median(hubFills),
    spokeFillMean: mean(spokeFills),
    spokeFillP50: median(spokeFills),
    spokesDry: spokesDry.length,
    spokesDryPct: spokes.length ? spokesDry.length / spokes.length : 0,
    hubsSurplus: hubsSurplus.length,
    hubsThin: hubsThin.length,
    trucks: world.fuelTrucks?.length ?? 0,
    idleTrucks,
    busyTrucks,
    haulsEnroute: enroute,
    haulsCompletedRetained: completed,
    driestSpokes: [...spokes]
      .sort((a, b) => a.fill - b.fill)
      .slice(0, 8)
      .map((s) => `${s.icao}:${(s.fill * 100).toFixed(0)}%`),
  };
}

function parkAllTrucks(world) {
  world.fuelHauls = [];
  for (const t of world.fuelTrucks ?? []) {
    t.status = 'busy';
    t.busyUntilMs = Number.MAX_SAFE_INTEGER;
    t.currentHaulId = undefined;
  }
}

function fmtPct(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

function printSnap(s) {
  console.log(
    `  [${s.label}] tick=${s.tick}  hubs=${s.hubs} spokes=${s.spokes}`,
  );
  console.log(
    `    hub fill   mean=${fmtPct(s.hubFillMean)}  p50=${fmtPct(s.hubFillP50)}  surplus(≥40%)=${s.hubsSurplus}  thin(<28%)=${s.hubsThin}`,
  );
  console.log(
    `    spoke fill mean=${fmtPct(s.spokeFillMean)}  p50=${fmtPct(s.spokeFillP50)}  dry(<28%)=${s.spokesDry} (${fmtPct(s.spokesDryPct)})`,
  );
  console.log(
    `    trucks idle/busy=${s.idleTrucks}/${s.busyTrucks}  hauls enroute=${s.haulsEnroute}  completed(retained)=${s.haulsCompletedRetained}`,
  );
  console.log(`    driest spokes: ${s.driestSpokes.join(', ')}`);
}

function runArm(disableTrucks) {
  const label = disableTrucks ? 'NO-TRUCKS' : 'WITH-TRUCKS';
  console.log(`\n=== ${label} ===`);
  const t0 = performance.now();
  const world = createSeedEconomyWorld({ seed: SEED });
  if (disableTrucks) parkAllTrucks(world);
  const snaps = [snapshot(world, `${label} day0`)];
  printSnap(snaps[0]);

  for (let d = 1; d <= DAYS; d++) {
    if (disableTrucks) parkAllTrucks(world); // ensureFuelTruckFleet may top up
    const dayStart = performance.now();
    tickEconomyN(world, TICKS_PER_DAY, {
      fromBatchAtMs: world.lastBatchAtMs,
    });
    if (disableTrucks) parkAllTrucks(world);
    const snap = snapshot(world, `${label} day${d}`);
    snaps.push(snap);
    console.log(
      `  … day ${d} in ${((performance.now() - dayStart) / 1000).toFixed(1)}s`,
    );
    printSnap(snap);
  }
  console.log(
    `  total arm wall: ${((performance.now() - t0) / 1000).toFixed(1)}s`,
  );
  return snaps;
}

console.log(
  `Fuel-truck one-off measure — seed="${SEED}", days=${DAYS}, shortage<${SHORTAGE_FILL}`,
);
const withSnaps = runArm(false);
const noSnaps = runArm(true);

console.log('\n=== DELTA (NO-TRUCKS − WITH-TRUCKS) at day', DAYS, '===');
const a = withSnaps[DAYS];
const b = noSnaps[DAYS];
console.log(
  `  spoke dry count: ${a.spokesDry} → ${b.spokesDry}  (Δ ${b.spokesDry - a.spokesDry})`,
);
console.log(
  `  spoke fill p50:  ${fmtPct(a.spokeFillP50)} → ${fmtPct(b.spokeFillP50)}`,
);
console.log(
  `  hub fill p50:    ${fmtPct(a.hubFillP50)} → ${fmtPct(b.hubFillP50)}`,
);
console.log(
  `  hub thin count:  ${a.hubsThin} → ${b.hubsThin}`,
);
