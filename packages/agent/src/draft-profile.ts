import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AircraftProfile } from '@msfs-compat/shared';
import { inferPublisher, normalizeAircraftTitle } from '@msfs-compat/shared';
import type { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';
import { cleanIcaoCode } from './promote-profile.js';

export interface DraftOptions {
  outDir: string;
  publisher?: string;
  /** Catalog match title (livery stripped). Defaults to normalized live title. */
  matchTitle?: string;
  /** Confirmed ICAO type designator (SimBrief / catalog). */
  icao?: string;
  fuelOffset?: number;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Drop leading publisher words so profileKey is `fsreborn/phenom-300e`, not `fsreborn/fsreborn-…`. */
function titleSlugForKey(title: string): string {
  return slugify(
    title
      .replace(/^black\s*square\s+/i, '')
      .replace(/^fs\s*reborn\s+/i, '')
      .replace(/^fsreborn\s+/i, '')
      .replace(/^pmdg\s+/i, '')
      .replace(/^fenix\s+/i, '')
      .replace(/^inibuilds\s+/i, '')
      .replace(/^working\s*title\s+/i, '')
      .replace(/^asobo\s+/i, ''),
  );
}

/**
 * Build a draft profile from live SimConnect reads.
 * Fuel writeOffset defaults to 0 — refine with writetest before production use.
 */
export async function draftProfileFromLive(
  bridge: NamedPipeSimBridge,
  options: DraftOptions,
): Promise<{ path: string; profile: AircraftProfile }> {
  const identity = await bridge.getAircraftIdentity();
  const rawTitle = identity.title || 'Unknown Aircraft';
  const title =
    normalizeAircraftTitle(options.matchTitle ?? rawTitle) ||
    normalizeAircraftTitle(rawTitle) ||
    rawTitle;
  const icao = options.icao
    ? cleanIcaoCode({ icao: options.icao, title })
    : cleanIcaoCode({
        icao: identity.icao,
        atcModel: identity.atcModel,
        title,
      });
  const publisher =
    options.publisher ??
    inferPublisher(title, process.env.MSFS_COMPAT_PUBLISHER);
  const fuelOffset = options.fuelOffset ?? 0;

  const tanks: AircraftProfile['fuel']['tanks'] = [];
  const writePlan: AircraftProfile['fuel']['writePlan'] = [];
  const fuelChecks: AircraftProfile['fuel']['verify']['checks'] = [];

  for (let i = 1; i <= 8; i++) {
    try {
      const capacity = await bridge.readSimVar({
        name: `FUELSYSTEM TANK CAPACITY:${i}`,
        unit: 'gallons',
      });
      // Skip empty slots and tiny collector tanks (< 5 gal capacity).
      if (!Number.isFinite(capacity) || capacity < 5) {
        continue;
      }

      const id = i === 1 ? 'LEFT_MAIN' : i === 2 ? 'RIGHT_MAIN' : `TANK_${i}`;
      const varName = `FUELSYSTEM TANK QUANTITY:${i}`;
      tanks.push({
        id,
        name: `FUELSYSTEM:${i}`,
        capacity,
        readVar: varName,
        readUnit: 'gallons',
        writeVar: varName,
        writeUnit: 'gallons',
      });
      writePlan.push({
        op: 'simvar_set',
        var: varName,
        unit: 'gallons',
        valueExpr: fuelOffset > 0 ? `{${id}} + ${fuelOffset}` : `{${id}}`,
      });
      fuelChecks.push({
        var: varName,
        unit: 'gallons',
        tolerancePct: 2.0,
        valueExpr: `{${id}}`,
      });
    } catch {
      // tank index not present
    }
  }

  // Black Square / classic: FUELSYSTEM often reports capacity 0 — fall back to named tanks.
  if (tanks.length === 0) {
    const classicSlots: Array<{ id: string; name: string; capacityVar: string; quantityVar: string }> = [
      {
        id: 'LEFT_MAIN',
        name: 'Left Main',
        capacityVar: 'FUEL TANK LEFT MAIN CAPACITY',
        quantityVar: 'FUEL TANK LEFT MAIN QUANTITY',
      },
      {
        id: 'RIGHT_MAIN',
        name: 'Right Main',
        capacityVar: 'FUEL TANK RIGHT MAIN CAPACITY',
        quantityVar: 'FUEL TANK RIGHT MAIN QUANTITY',
      },
      {
        id: 'CENTER',
        name: 'Center',
        capacityVar: 'FUEL TANK CENTER CAPACITY',
        quantityVar: 'FUEL TANK CENTER QUANTITY',
      },
      {
        id: 'CENTER2',
        name: 'Center 2',
        capacityVar: 'FUEL TANK CENTER2 CAPACITY',
        quantityVar: 'FUEL TANK CENTER2 QUANTITY',
      },
    ];

    let totalCapacity = 0;
    try {
      totalCapacity = await bridge.readSimVar({ name: 'FUEL TOTAL CAPACITY', unit: 'gallons' });
    } catch {
      totalCapacity = 0;
    }

    for (const slot of classicSlots) {
      let capacity = 0;
      try {
        capacity = await bridge.readSimVar({ name: slot.capacityVar, unit: 'gallons' });
      } catch {
        capacity = 0;
      }

      // Some payware omit per-tank CAPACITY; split FUEL TOTAL CAPACITY across mains.
      if (
        (!Number.isFinite(capacity) || capacity < 5) &&
        (slot.id === 'LEFT_MAIN' || slot.id === 'RIGHT_MAIN') &&
        totalCapacity >= 10
      ) {
        capacity = totalCapacity / 2;
      }

      if (!Number.isFinite(capacity) || capacity < 5) {
        continue;
      }

      // Confirm quantity var is readable before adding.
      try {
        await bridge.readSimVar({ name: slot.quantityVar, unit: 'gallons' });
      } catch {
        continue;
      }

      tanks.push({
        id: slot.id,
        name: slot.name,
        capacity: Math.round(capacity * 10) / 10,
        readVar: slot.quantityVar,
        readUnit: 'gallons',
        writeVar: slot.quantityVar,
        writeUnit: 'gallons',
      });
      writePlan.push({
        op: 'simvar_set',
        var: slot.quantityVar,
        unit: 'gallons',
        valueExpr: fuelOffset > 0 ? `{${slot.id}} + ${fuelOffset}` : `{${slot.id}}`,
      });
      fuelChecks.push({
        var: slot.quantityVar,
        unit: 'gallons',
        tolerancePct: 2.0,
        valueExpr: `{${slot.id}}`,
      });
    }
  }

  writePlan.push({ op: 'delay', ms: 400 });

  let stationCount = 8;
  try {
    stationCount = Math.max(1, Math.min(16, Math.round(await bridge.readSimVar({
      name: 'PAYLOAD STATION COUNT',
      unit: 'number',
    }))));
  } catch {
    stationCount = 8;
  }

  const stations: AircraftProfile['payload']['stations'] = [];
  const payloadPlan: AircraftProfile['payload']['writePlan'] = [];
  const payloadChecks: AircraftProfile['payload']['verify']['checks'] = [];

  for (let i = 1; i <= stationCount; i++) {
    stations.push({ index: i, name: `Station ${i}`, maxLoad: 500 });
    payloadPlan.push({
      op: 'simvar_set',
      var: `PAYLOAD STATION WEIGHT:${i}`,
      unit: 'pounds',
      valueExpr: `{station_${i}}`,
    });
  }
  payloadPlan.push({ op: 'delay', ms: 400 });
  payloadChecks.push(
    {
      var: 'PAYLOAD STATION WEIGHT:1',
      unit: 'pounds',
      tolerancePct: 1.0,
      valueExpr: '{station_1}',
    },
  );

  const titleSlug = titleSlugForKey(title);
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
    capabilities: ['simconnect'],
    gating: {
      requireOnGround: true,
      requireEnginesOff: false,
      blockWhenPaused: true,
      blockWhenSlew: true,
      minSimRate: 0.9,
      maxSimRate: 1.1,
    },
    fuel: {
      strategy: 'simconnect-direct',
      unit: 'gallons',
      tanks,
      writePlan,
      verify: {
        timeoutMs: 6000,
        pollIntervalMs: 250,
        checks: fuelChecks,
      },
    },
    payload: {
      strategy: 'station-writeback',
      stations,
      writePlan: payloadPlan,
      verify: {
        timeoutMs: 6000,
        pollIntervalMs: 250,
        checks: payloadChecks,
      },
    },
    cg: {
      readVar: 'CG PERCENT',
      readUnit: 'Percent over 100',
      // Wide default; calibrate --profile / draft-profile --calibrate tightens from live CG.
      constraints: { minMac: 0, maxMac: 50 },
    },
    fallback: { chain: ['simconnect-direct'] },
    notes: [
      'AUTO-DRAFT from live aircraft. Prefer: draft-profile --calibrate (or calibrate --profile).',
      'Move to profiles/examples after smoke succeeds; bump semver and remove -draft.',
      `Detected tanks=${tanks.length}, stations=${stationCount}, fuelOffset=${fuelOffset}`,
    ],
  };

  await mkdir(options.outDir, { recursive: true });
  const path = join(options.outDir, `${slug}.json`);
  await writeFile(path, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');

  return { path, profile };
}
