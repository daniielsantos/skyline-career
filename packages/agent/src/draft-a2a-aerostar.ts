import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AircraftProfile } from '@msfs-compat/shared';
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

async function readLvarOr(bridge: NamedPipeSimBridge, name: string, fallback: number): Promise<number> {
  try {
    const v = await bridge.readLVar(name);
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Draft Accu-Sim Aerostar profile: LVar writes, classic SimVar verify mirrors.
 */
export async function draftA2aAerostarProfile(
  bridge: NamedPipeSimBridge,
  options: { outDir: string; matchTitle?: string; icao?: string },
): Promise<{ path: string; profile: AircraftProfile }> {
  const identity = await bridge.getAircraftIdentity();
  const rawTitle = identity.title || 'A2A Piper Aerostar 600';
  const title =
    normalizeAircraftTitle(options.matchTitle ?? rawTitle) || 'A2A Piper Aerostar 600';
  const icao = cleanIcaoCode({
    icao: options.icao ?? identity.icao,
    atcModel: identity.atcModel,
    title,
  });
  const publisher = inferPublisher(title, process.env.MSFS_COMPAT_PUBLISHER);

  const wingCap = await readLvarOr(bridge, 'FuelWingTankCapacity', 62);
  const fuseCap = await readLvarOr(bridge, 'FuelFuselageTankCapacity', 41.5);
  const bagMax = await readLvarOr(bridge, 'BaggageMax', 400);

  const tanks: AircraftProfile['fuel']['tanks'] = [
    {
      id: 'LEFT_MAIN',
      name: 'Left wing (Accu-Sim)',
      capacity: wingCap,
      readVar: 'FUEL TANK LEFT MAIN QUANTITY',
      readUnit: 'gallons',
      writeVar: 'FuelLeftWingTank',
      writeUnit: 'number',
    },
    {
      id: 'RIGHT_MAIN',
      name: 'Right wing (Accu-Sim)',
      capacity: wingCap,
      readVar: 'FUEL TANK RIGHT MAIN QUANTITY',
      readUnit: 'gallons',
      writeVar: 'FuelRightWingTank',
      writeUnit: 'number',
    },
    {
      id: 'CENTER',
      name: 'Fuselage (Accu-Sim)',
      capacity: fuseCap,
      readVar: 'FUEL TANK CENTER QUANTITY',
      readUnit: 'gallons',
      writeVar: 'FuelFuselageTank',
      writeUnit: 'number',
    },
  ];

  const fuelWritePlan: AircraftProfile['fuel']['writePlan'] = [
    { op: 'lvar_set', name: 'FuelLeftWingTank', valueExpr: '{LEFT_MAIN}' },
    { op: 'lvar_set', name: 'FuelRightWingTank', valueExpr: '{RIGHT_MAIN}' },
    { op: 'lvar_set', name: 'FuelFuselageTank', valueExpr: '{CENTER}' },
    { op: 'delay', ms: 400 },
  ];

  const fuelChecks: AircraftProfile['fuel']['verify']['checks'] = tanks.map((t) => ({
    var: t.readVar,
    unit: 'gallons',
    tolerancePct: 2,
    valueExpr: `{${t.id}}`,
  }));

  const stations: AircraftProfile['payload']['stations'] = [
    { index: 1, name: 'Pilot / Character1', maxLoad: 300 },
    { index: 2, name: 'Seat 2 / Character2', maxLoad: 300 },
    { index: 3, name: 'Seat 3 / Character3', maxLoad: 300 },
    { index: 4, name: 'Seat 4 / Character4', maxLoad: 300 },
    { index: 5, name: 'Seat 5 / Character5', maxLoad: 300 },
    { index: 6, name: 'Seat 6 / Character6', maxLoad: 300 },
    { index: 7, name: 'Baggage', maxLoad: bagMax },
  ];

  const payloadPlan: AircraftProfile['payload']['writePlan'] = [];
  for (let i = 1; i <= 6; i++) {
    payloadPlan.push({
      op: 'lvar_set',
      name: `Character${i}Weight`,
      valueExpr: `{station_${i}}`,
    });
  }
  payloadPlan.push({ op: 'lvar_set', name: 'BaggageWeight', valueExpr: '{station_7}' });
  payloadPlan.push({ op: 'delay', ms: 400 });

  const titleSlug = slugify(title.replace(/^a2a\s+/i, ''));
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
    capabilities: ['simconnect', 'lvar'],
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
      strategy: 'lvar-bridge',
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
      constraints: { minMac: 0, maxMac: 50 },
    },
    fallback: { chain: ['lvar-bridge'] },
    notes: [
      'AUTO-DRAFT Accu-Sim via LVars (Fuel*Tank / Character*Weight).',
      'Verify uses classic FUEL TANK * / PAYLOAD STATION mirrors.',
      'See profiles/notes/a2a-piper-aerostar-600.md',
    ],
  };

  await mkdir(options.outDir, { recursive: true });
  const path = join(options.outDir, `${slug}.json`);
  await writeFile(path, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
  return { path, profile };
}
