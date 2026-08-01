/**
 * Sketch: scrape FSLTL Traffic base flight_model.cfg → abstract type catalog.
 *
 * Why this is NOT the player's flight_model:
 * - Player OFP/load uses the homologated payware/default profile (stations, LVars, SimBrief).
 * - Career NPCs are abstract FreighterClassId sims (cargo kg, range, burn) — no SimConnect load.
 * - FSLTL models are AI traffic approximations; useful as type-level OEW/MTOW/payload hints,
 *   especially freighter codes (*F), to seed/refine NPC class tables — not to load the player's plane.
 *
 * Usage (Windows, FSLTL installed):
 *   node scripts/scrape-fsltl-traffic-catalog.mjs
 *   node scripts/scrape-fsltl-traffic-catalog.mjs --out packages/shared/src/data/fsltl-type-catalog.json
 *
 * Does not wire into CAREER_AIRCRAFT_CLASSES / NPC fleet automatically.
 * After review, hand-curate overrides into packages/shared/src/career-npc-airframes.ts
 * (NPC bids already consume that table via airframeTypeId / maxCargoKg).
 */
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const LB_TO_KG = 0.45359237;
const US_GAL_JET_A_LB = 6.7; // rough Jet-A density for capacity estimate
const US_GAL_AVGAS_LB = 6.0;

const DEFAULT_OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'packages',
  'shared',
  'src',
  'data',
  'fsltl-type-catalog.json',
);

function parseArgs(argv) {
  const outIdx = argv.indexOf('--out');
  return {
    out: outIdx >= 0 && argv[outIdx + 1] ? argv[outIdx + 1] : DEFAULT_OUT,
    root: (() => {
      const i = argv.indexOf('--root');
      return i >= 0 && argv[i + 1] ? argv[i + 1] : undefined;
    })(),
  };
}

async function pathExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function resolveFsltlAirplanesRoot(explicit) {
  if (explicit) {
    const airplanes = explicit.endsWith('Airplanes')
      ? explicit
      : join(explicit, 'SimObjects', 'Airplanes');
    if (await pathExists(airplanes)) return airplanes;
    throw new Error(`No SimObjects/Airplanes under --root ${explicit}`);
  }
  const roaming = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
  const candidates = [
    join(
      roaming,
      'Microsoft Flight Simulator 2024',
      'Packages',
      'Community',
      'fsltl-traffic-base',
      'SimObjects',
      'Airplanes',
    ),
    join(
      roaming,
      'Microsoft Flight Simulator',
      'Packages',
      'Community',
      'fsltl-traffic-base',
      'SimObjects',
      'Airplanes',
    ),
  ];
  for (const c of candidates) {
    if (await pathExists(c)) return c;
  }
  throw new Error(
    'fsltl-traffic-base not found under %APPDATA%\\…\\Packages\\Community. Pass --root <package-or-Airplanes>',
  );
}

/** Pull first number from `key = 1234 ; comment` lines. */
function cfgNumber(text, key) {
  const re = new RegExp(`^\\s*${key}\\s*=\\s*([-+]?[0-9]*\\.?[0-9]+)`, 'im');
  const m = re.exec(text);
  return m ? Number(m[1]) : undefined;
}

function parseFuelGallons(text) {
  // Tank lines: Name = z, x, y, capacity_gal, unusable_gal
  const tankRe =
    /^\s*(LeftMain|RightMain|Center\d*|LeftAux|RightAux|LeftTip|RightTip|External\d*)\s*=\s*[^,]+,[^,]+,[^,]+,\s*([0-9.]+)\s*,\s*([0-9.]+)/gim;
  let usableGal = 0;
  let match;
  while ((match = tankRe.exec(text)) !== null) {
    const cap = Number(match[2]);
    const unusable = Number(match[3]);
    if (Number.isFinite(cap) && Number.isFinite(unusable)) {
      usableGal += Math.max(0, cap - unusable);
    }
  }
  return usableGal;
}

function parseStations(text) {
  const stations = [];
  const re =
    /^\s*station_load\.(\d+)\s*=\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*(.+)$/gim;
  let m;
  while ((m = re.exec(text)) !== null) {
    const weightLb = Number(m[2]);
    const label = String(m[6] ?? '')
      .split(',')[0]
      .trim()
      .replace(/^"|"$/g, '');
    stations.push({
      index: Number(m[1]),
      weightLb: Number.isFinite(weightLb) ? weightLb : 0,
      label,
    });
  }
  return stations;
}

function icaoFromFolder(folder) {
  // FSLTL_B738F → B738F ; FSLTL_Asobo_C172SP → C172SP ; FSLTL_a332F → A332F
  const stripped = folder.replace(/^FSLTL_/i, '').replace(/^Asobo_/i, '');
  return stripped.toUpperCase();
}

/**
 * Map ICAO-ish type to Skyline abstract class. Freighter suffixes preferred.
 * This is a sketch heuristic — review before wiring NPC fleet.
 */
function suggestSkylineClass(icao) {
  const t = icao.toUpperCase();
  if (/F$/.test(t) || t === 'MD11F') {
    if (
      /^(B74|B77|B78|A33|A34|A35|A38|MD11|A30)/.test(t) ||
      t.includes('744') ||
      t.includes('748')
    ) {
      return 'wide_freighter';
    }
    return 'narrow_freighter';
  }
  if (/^(B73|B73X|A31|A32|A20|A21|BCS|E17|E19|CRJ|AT7|AT4|DH8|SF34|SU95)/.test(t)) {
    return 'narrow_freighter';
  }
  if (/^(B74|B77|B78|A33|A34|A35|A38|MD11)/.test(t)) {
    return 'wide_freighter';
  }
  if (/^(208|B350|TBM|C25|LJ25|DA62)/.test(t)) {
    return 'light_turboprop';
  }
  if (/^(C15|C17|DA40|DR40|G36|VL3|P28|Generic)/i.test(t) || t.includes('C172')) {
    return 'light_ga';
  }
  return null;
}

function scrapeOne(folder, text, sourcePath) {
  const icao = icaoFromFolder(folder);
  const emptyLb = cfgNumber(text, 'empty_weight');
  const mtowLb = cfgNumber(text, 'max_gross_weight');
  const fuelType = cfgNumber(text, 'fuel_type'); // 1/3/4 avgas-ish, 2/5 jet
  const usableGal = parseFuelGallons(text);
  const lbPerGal = fuelType === 2 || fuelType === 5 ? US_GAL_JET_A_LB : US_GAL_AVGAS_LB;
  const fuelCapacityLb = usableGal * lbPerGal;
  const stations = parseStations(text);
  const cargoStationLb = stations
    .filter((s) => /cargo|baggage|freight|hold|pod/i.test(s.label))
    .reduce((sum, s) => sum + s.weightLb, 0);

  const oewKg = emptyLb != null ? Math.round(emptyLb * LB_TO_KG) : null;
  const mtowKg = mtowLb != null ? Math.round(mtowLb * LB_TO_KG) : null;
  const fuelCapacityKg = Math.round(fuelCapacityLb * LB_TO_KG);
  // Structural payload ≈ MTOW − OEW − full fuel (conservative AI estimate).
  let estPayloadKg = null;
  if (mtowKg != null && oewKg != null) {
    estPayloadKg = Math.max(0, mtowKg - oewKg - fuelCapacityKg);
  }
  const cargoFromStationsKg =
    cargoStationLb > 0 ? Math.round(cargoStationLb * LB_TO_KG) : null;

  return {
    folder,
    icaoType: icao,
    freighterVariant: /F$/i.test(icao),
    suggestedClassId: suggestSkylineClass(icao),
    oewKg,
    mtowKg,
    fuelCapacityKg,
    fuelType: fuelType ?? null,
    estimatedPayloadKg: estPayloadKg,
    cargoStationsMaxKg: cargoFromStationsKg,
    stationCount: stations.length,
    stations: stations.map((s) => ({
      index: s.index,
      label: s.label,
      weightLb: s.weightLb,
    })),
    sourcePath,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const airplanesRoot = await resolveFsltlAirplanesRoot(args.root);
  const dirs = await readdir(airplanesRoot, { withFileTypes: true });
  const rows = [];

  for (const ent of dirs) {
    if (!ent.isDirectory()) continue;
    const cfg = join(airplanesRoot, ent.name, 'flight_model.cfg');
    if (!(await pathExists(cfg))) continue;
    const text = await readFile(cfg, 'utf8');
    rows.push(scrapeOne(ent.name, text, cfg));
  }

  rows.sort((a, b) => a.icaoType.localeCompare(b.icaoType));

  const byClass = {};
  for (const row of rows) {
    const key = row.suggestedClassId ?? 'unmapped';
    byClass[key] ??= [];
    byClass[key].push(row.icaoType);
  }

  const catalog = {
    generatedAtIso: new Date().toISOString(),
    sourcePackage: 'fsltl-traffic-base',
    airplanesRoot,
    note:
      'AI traffic flight models — abstract type hints for Skyline NPC classes only. Do not use for player OFP homologation.',
    count: rows.length,
    bySuggestedClass: byClass,
    types: rows,
  };

  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${rows.length} types → ${args.out}`);
  for (const [cls, list] of Object.entries(byClass).sort()) {
    console.log(`  ${cls}: ${list.length} (${list.slice(0, 8).join(', ')}${list.length > 8 ? ', …' : ''})`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
