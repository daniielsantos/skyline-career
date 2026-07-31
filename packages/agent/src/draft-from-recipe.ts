import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AircraftProfile, VendorRecipe } from '@msfs-compat/shared';
import { inferPublisher, normalizeAircraftTitle } from '@msfs-compat/shared';
import type { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';
import { cleanIcaoCode } from './promote-profile.js';

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function readLvarOr(
  bridge: NamedPipeSimBridge,
  name: string | undefined,
  fallback: number,
): Promise<number> {
  if (!name) return fallback;
  try {
    const v = await bridge.readLVar(name);
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

async function readSimOr(
  bridge: NamedPipeSimBridge,
  name: string | undefined,
  unit: string,
  fallback: number,
): Promise<number> {
  if (!name) return fallback;
  try {
    const v = await bridge.readSimVar({ name, unit });
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

function stripPublisherPrefix(title: string, publisher: string): string {
  const esc = publisher.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return title.replace(new RegExp(`^${esc}\\s+`, 'i'), '');
}

/**
 * Draft an AircraftProfile from a vendor recipe + live capacities.
 * Used when classic SimVar writetest fails and recipe says try-lvar-bridge.
 */
export async function draftProfileFromVendorRecipe(
  bridge: NamedPipeSimBridge,
  recipe: VendorRecipe,
  options: { outDir: string; matchTitle?: string; icao?: string },
): Promise<{ path: string; profile: AircraftProfile }> {
  const identity = await bridge.getAircraftIdentity();
  const rawTitle = identity.title || recipe.displayName;
  const title = normalizeAircraftTitle(options.matchTitle ?? rawTitle) || rawTitle;
  const icao = cleanIcaoCode({
    icao: options.icao ?? identity.icao,
    atcModel: identity.atcModel,
    title,
  });
  const publisher =
    recipe.publisher ||
    inferPublisher(title, process.env.MSFS_COMPAT_PUBLISHER);

  if (recipe.fuel.strategy !== 'lvar-bridge') {
    throw new Error(
      `draftProfileFromVendorRecipe only supports lvar-bridge (got ${recipe.fuel.strategy})`,
    );
  }

  const tanks: AircraftProfile['fuel']['tanks'] = [];
  const fuelWritePlan: AircraftProfile['fuel']['writePlan'] = [];

  for (const hint of recipe.fuel.tanks) {
    if (!hint.writeLVar || !hint.readSimVar) continue;

    // Prefer usable Accu-Sim capacity LVar, then classic CAPACITY SimVar.
    let capacity = 0;
    if (recipe.fuel.preferUsableCapacity && hint.capacityLVar) {
      capacity = await readLvarOr(bridge, hint.capacityLVar, 0);
    }
    if (capacity < 5 && hint.capacitySimVar) {
      capacity = await readSimOr(bridge, hint.capacitySimVar, 'gallons', 0);
    }

    // Skip optional / ghost tanks (e.g. FuelFuselageTank exists on Comanche but CENTER cap=0
    // and does not mirror). Never invent a fake 40 gal capacity.
    if (capacity < 5) {
      try {
        await bridge.readLVar(hint.writeLVar);
      } catch {
        continue;
      }
      // Readable LVar alone is not enough without real capacity ≥ 5.
      continue;
    }

    // Confirm write LVar is at least readable before including.
    try {
      await bridge.readLVar(hint.writeLVar);
    } catch {
      continue;
    }

    tanks.push({
      id: hint.id,
      name: hint.label ?? hint.writeLVar,
      capacity,
      readVar: hint.readSimVar,
      readUnit: 'gallons',
      writeVar: hint.writeLVar,
      writeUnit: 'number',
    });
    fuelWritePlan.push({
      op: 'lvar_set',
      name: hint.writeLVar,
      valueExpr: `{${hint.id}}`,
    });
  }

  if (tanks.length === 0) {
    throw new Error(`Recipe ${recipe.recipeId}: no usable LVar tanks after live probe`);
  }

  fuelWritePlan.push({ op: 'delay', ms: 400 });

  const fuelChecks: AircraftProfile['fuel']['verify']['checks'] = tanks.map((t) => ({
    var: t.readVar,
    unit: 'gallons',
    tolerancePct: 2,
    valueExpr: `{${t.id}}`,
  }));

  const stations: AircraftProfile['payload']['stations'] = [];
  const payloadPlan: AircraftProfile['payload']['writePlan'] = [];
  const stationLVars = recipe.payload.stationLVars ?? {};
  const stationIndexes = Object.keys(stationLVars)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  for (const index of stationIndexes) {
    const lvar = stationLVars[String(index)];
    if (!lvar) continue;
    stations.push({ index, name: lvar, maxLoad: 300 });
    payloadPlan.push({
      op: 'lvar_set',
      name: lvar,
      valueExpr: `{station_${index}}`,
    });
    // Accu-Sim tablet only shows a seat when occupancy is set (SeatNCharacter).
    // Expr engine is arithmetic-only → soft bool (~0 empty, ~1 when weight > 0).
    const seat = /^Character(\d+)Weight$/i.exec(lvar);
    if (seat) {
      payloadPlan.push({
        op: 'lvar_set',
        name: `Seat${seat[1]}Character`,
        valueExpr: `{station_${index}} / ({station_${index}} + 0.001)`,
      });
    }
  }

  let nextIndex = (stationIndexes[stationIndexes.length - 1] ?? 0) + 1;
  for (const extra of recipe.payload.extras ?? []) {
    const maxLoad = await readLvarOr(bridge, extra.maxLVar, 400);
    stations.push({ index: nextIndex, name: extra.id, maxLoad });
    payloadPlan.push({
      op: 'lvar_set',
      name: extra.lvar,
      valueExpr: `{station_${nextIndex}}`,
    });
    nextIndex += 1;
  }

  if (stations.length === 0) {
    stations.push({ index: 1, name: 'Station 1', maxLoad: 500 });
    payloadPlan.push({
      op: 'simvar_set',
      var: 'PAYLOAD STATION WEIGHT:1',
      unit: 'pounds',
      valueExpr: '{station_1}',
    });
  }

  payloadPlan.push({ op: 'delay', ms: 400 });

  const titleSlug = slugify(stripPublisherPrefix(title, publisher));
  const slug = slugify(`${publisher}-${titleSlug}`);
  const profile: AircraftProfile = {
    schemaVersion: '1.0.0',
    profileId: slug,
    profileKey: `${publisher}/${titleSlug}`,
    semver: '0.1.0-draft',
    displayName: `${title} (draft)`,
    match: {
      fingerprint: '0'.repeat(64),
      title,
      publisher,
      icao,
    },
    capabilities: [...recipe.capabilities],
    gating: {
      requireOnGround: true,
      requireEnginesOff: false,
      blockWhenPaused: true,
      blockWhenSlew: true,
      minSimRate: 0.9,
      maxSimRate: 1.1,
    },
    fuel: {
      strategy: 'lvar-bridge',
      unit: 'gallons',
      tanks,
      writePlan: fuelWritePlan,
      verify: { timeoutMs: 6000, pollIntervalMs: 250, checks: fuelChecks },
    },
    payload: {
      strategy: recipe.payload.strategy === 'lvar-bridge' ? 'lvar-bridge' : 'station-writeback',
      stations,
      writePlan: payloadPlan,
      verify: {
        timeoutMs: 6000,
        pollIntervalMs: 250,
        checks: [
          {
            var: 'PAYLOAD STATION WEIGHT:1',
            unit: 'pounds',
            tolerancePct: 2,
            valueExpr: '{station_1}',
          },
        ],
      },
    },
    cg: {
      readVar: 'CG PERCENT',
      readUnit: 'Percent over 100',
      envelopeSource: 'calibrated-live',
      toleranceMac: 0.5,
      constraints: { minMac: 0, maxMac: 50 },
    },
    fallback: { chain: ['lvar-bridge'] },
    notes: [
      `AUTO-DRAFT from vendor recipe ${recipe.recipeId}.`,
      recipe.summary,
      recipe.docs ? `See ${recipe.docs}` : undefined,
    ].filter(Boolean) as string[],
  };

  await mkdir(options.outDir, { recursive: true });
  const path = join(options.outDir, `${slug}.json`);
  await writeFile(path, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
  return { path, profile };
}
