/**
 * Registration bridge between homologation and Skyline Career.
 *
 * A successful homologation upserts the concrete model into the JSON imported
 * by @msfs-compat/shared. No hand edit to Aircraft Market code is required.
 * Disable with setCareerPlayerAirframeEnabled(..., false) to leave the Market
 * without deleting the roles pack.
 *
 * Family heuristics register one Market SKU (heuristic.marketTypeId / ofpId).
 * Vendor forks with different stations accumulate familyRolesPackRelPaths.
 */
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import type { FreighterClassId } from '@msfs-compat/shared';
import {
  matchHeuristic,
  type OfpRolesPackFile,
} from './ofp-compliance/scaffold-roles.js';

type CareerPlayerAirframeRow = {
  typeId: string;
  aircraftClassId: FreighterClassId;
  label: string;
  rolesPackRelPath: string;
  familyRolesPackRelPaths?: string[];
  simbriefIcao: string;
  simbriefAirframeMatch: string;
  /** Omitted / true = on Aircraft Market. false = homologated but hidden. */
  enabled?: boolean;
  oewKg?: number;
  mtowKg?: number;
  maxCargoKg?: number;
  fuelCapacityKg?: number;
  maxRangeNm?: number;
  cruiseFuelFlowKgPerHour?: number;
  cruiseSpeedKt?: number;
  fuelBurnKgPerNm?: number;
};

export const CAREER_CLASS_CHOICES: Array<{
  value: FreighterClassId;
  label: string;
}> = [
  { value: 'light_ga', label: 'light_ga — piston / small GA' },
  { value: 'light_turboprop', label: 'light_turboprop — C208-size turboprop' },
  { value: 'light_jet', label: 'light_jet — Learjet / Citation-size bizjet' },
  { value: 'medium_piston', label: 'medium_piston — DC-6 / classic 4-engine' },
  { value: 'narrow_freighter', label: 'narrow_freighter — narrow-body jet' },
  { value: 'wide_freighter', label: 'wide_freighter — wide-body jet' },
];

export function inferCareerClassFromIcao(icao: string): FreighterClassId {
  const normalized = icao.trim().toUpperCase();
  if (
    [
      'C152',
      'C172',
      'C182',
      'C185',
      'C404',
      'AC11',
      'BE36',
      'BE58',
      'BE60',
      'PA24',
      'PA31',
      'PA32',
      'C400',
      'P46T',
      'BN2P',
      'M20P',
      'SR22',
    ].includes(normalized)
  ) {
    return 'light_ga';
  }
  if (['C208', 'B190', 'E110', 'PC12', 'TBM9'].includes(normalized)) {
    return 'light_turboprop';
  }
  if (['DC6', 'DC6A', 'DC6B', 'DC3', 'DC4', 'C46', 'L188'].includes(normalized)) {
    return 'medium_piston';
  }
  if (
    [
      'LJ35',
      'LJ36',
      'C25A',
      'C25B',
      'C25C',
      'C510',
      'C525',
      'C56X',
      'E50P',
      'E55P',
      'EA50',
      'CL30',
    ].includes(normalized)
  ) {
    return 'light_jet';
  }
  if (['B738', 'B737', 'A320', 'A321'].includes(normalized)) {
    return 'narrow_freighter';
  }
  if (['MD11', 'MD1F', 'B744', 'B748', 'A332', 'A333', 'A339', 'A388'].includes(normalized)) {
    return 'wide_freighter';
  }
  // Unknown ICAO — prefer GA over widebody so burn/range fallbacks stay sane.
  return 'light_ga';
}

function catalogPath(repoRoot: string): string {
  return resolve(
    repoRoot,
    'packages',
    'shared',
    'src',
    'data',
    'career-player-airframes.json',
  );
}

function distCatalogPath(repoRoot: string): string {
  return resolve(
    repoRoot,
    'packages',
    'shared',
    'dist',
    'data',
    'career-player-airframes.json',
  );
}

function marketLabel(title: string, icao: string): string {
  const clean = title
    .replace(/\s*\(MSFS(?: 2024)?\)\s*/gi, ' ')
    .replace(/^Black Square\s+/i, '')
    .trim();
  if (icao.toUpperCase() === 'C172' && /^C172/i.test(clean)) {
    return clean.replace(/^C172SP/i, 'Cessna 172SP');
  }
  if (icao.toUpperCase() === 'AC11' && /^Commander/i.test(clean)) {
    return `Rockwell ${clean.replace(/TC$/i, '').trim()}`;
  }
  return clean;
}

async function readCatalogRows(path: string): Promise<CareerPlayerAirframeRow[]> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as CareerPlayerAirframeRow[];
  } catch {
    return [];
  }
}

async function writeCatalogRows(
  repoRoot: string,
  rows: CareerPlayerAirframeRow[],
): Promise<void> {
  rows.sort((a, b) =>
    `${a.aircraftClassId}:${a.label}`.localeCompare(
      `${b.aircraftClassId}:${b.label}`,
    ),
  );
  const path = catalogPath(repoRoot);
  await mkdir(dirname(path), { recursive: true });
  const serialized = `${JSON.stringify(rows, null, 2)}\n`;
  await writeFile(path, serialized, 'utf8');
  const distPath = distCatalogPath(repoRoot);
  try {
    await mkdir(dirname(distPath), { recursive: true });
    await writeFile(distPath, serialized, 'utf8');
  } catch {
    // Source catalog is authoritative; dist may be read-only in packaged runs.
  }
}

const LB_TO_KG = 0.45359237;
const DEFAULT_FUEL_LB_PER_GAL = 6.7;

/** Convert live / profile pounds+gallons into Market catalog kg fields. */
export function deriveCareerMarketWeights(opts: {
  emptyWeightLb?: number;
  mtowLb?: number;
  /** Operational cargo ceiling (lb) — from careerOperationalCargoMaxLb. */
  cargoMaxLoadLb?: number;
  fuelCapacityGal?: number;
  lbPerGal?: number;
}): {
  oewKg?: number;
  mtowKg?: number;
  maxCargoKg?: number;
  fuelCapacityKg?: number;
} {
  const out: {
    oewKg?: number;
    mtowKg?: number;
    maxCargoKg?: number;
    fuelCapacityKg?: number;
  } = {};
  if (
    typeof opts.emptyWeightLb === 'number' &&
    Number.isFinite(opts.emptyWeightLb) &&
    opts.emptyWeightLb > 0
  ) {
    out.oewKg = Math.round(opts.emptyWeightLb * LB_TO_KG);
  }
  if (
    typeof opts.mtowLb === 'number' &&
    Number.isFinite(opts.mtowLb) &&
    opts.mtowLb > 0
  ) {
    out.mtowKg = Math.round(opts.mtowLb * LB_TO_KG);
  }
  if (
    typeof opts.cargoMaxLoadLb === 'number' &&
    Number.isFinite(opts.cargoMaxLoadLb) &&
    opts.cargoMaxLoadLb > 0
  ) {
    out.maxCargoKg = Math.round(opts.cargoMaxLoadLb * LB_TO_KG);
  }
  if (
    typeof opts.fuelCapacityGal === 'number' &&
    Number.isFinite(opts.fuelCapacityGal) &&
    opts.fuelCapacityGal > 0
  ) {
    const dens =
      typeof opts.lbPerGal === 'number' &&
      Number.isFinite(opts.lbPerGal) &&
      opts.lbPerGal > 0.1
        ? opts.lbPerGal
        : DEFAULT_FUEL_LB_PER_GAL;
    out.fuelCapacityKg = Math.round(opts.fuelCapacityGal * dens * LB_TO_KG);
  }
  return out;
}

/** Sum maxLoad for the given station indexes (Career cargo ceiling). */
export function cargoMaxLoadLbFromStations(
  stations: Array<{ index: number; maxLoad?: number }>,
  cargoIndexes: number[],
): number {
  const want = new Set(cargoIndexes);
  let sum = 0;
  for (const st of stations) {
    if (!want.has(st.index)) continue;
    if (typeof st.maxLoad === 'number' && Number.isFinite(st.maxLoad) && st.maxLoad > 0) {
      sum += st.maxLoad;
    }
  }
  return sum;
}

export async function registerCareerPlayerAirframe(opts: {
  repoRoot: string;
  rolesPackPath: string;
  pack: OfpRolesPackFile;
  aircraftClassId: FreighterClassId;
  title?: string;
  /** Profile id for one-off SKUs; families pass marketTypeId / pack.ofpId. */
  typeId?: string;
  oewKg?: number;
  mtowKg?: number;
  maxCargoKg?: number;
  fuelCapacityKg?: number;
  maxRangeNm?: number;
  cruiseFuelFlowKgPerHour?: number;
  cruiseSpeedKt?: number;
  fuelBurnKgPerNm?: number;
}): Promise<CareerPlayerAirframeRow> {
  const path = catalogPath(opts.repoRoot);
  const rows = await readCatalogRows(path);

  const titleHint =
    opts.title?.trim() ?? opts.pack.matchTitles?.[0]?.trim() ?? '';
  const heuristic =
    (titleHint ? matchHeuristic(titleHint) : undefined) ??
    opts.pack.matchTitles
      ?.map((title) => matchHeuristic(title))
      .find((item) => item != null);

  const typeId =
    opts.typeId?.trim() ||
    heuristic?.marketTypeId?.trim() ||
    opts.pack.ofpId?.trim();
  const simbriefIcao = (opts.pack.simbriefIcao ?? opts.pack.icao)?.trim();
  const simbriefAirframeMatch = opts.pack.simbriefAirframeMatch?.trim();
  const labelHint = titleHint || typeId;
  if (!typeId || !simbriefIcao || !simbriefAirframeMatch || !labelHint) {
    throw new Error(
      'Career registration needs ofpId, title, simbriefIcao and simbriefAirframeMatch',
    );
  }

  const labelSource = heuristic?.marketLabel?.trim() || labelHint;
  const rolesPackRelPath = relative(opts.repoRoot, opts.rolesPackPath).replace(
    /\\/g,
    '/',
  );
  const existing = rows.find((item) => item.typeId === typeId);
  const familyPaths = new Set<string>([
    rolesPackRelPath,
    ...(existing?.familyRolesPackRelPaths ?? []),
  ]);
  if (existing?.rolesPackRelPath) familyPaths.add(existing.rolesPackRelPath);

  const primary =
    existing?.rolesPackRelPath && familyPaths.has(existing.rolesPackRelPath)
      ? existing.rolesPackRelPath
      : rolesPackRelPath;
  const extras = [...familyPaths]
    .filter((item) => item !== primary)
    .sort((a, b) => a.localeCompare(b));

  const pickNum = (
    next: number | undefined,
    prev: number | undefined,
  ): number | undefined => {
    if (typeof next === 'number' && Number.isFinite(next) && next > 0) return next;
    if (typeof prev === 'number' && Number.isFinite(prev) && prev > 0) return prev;
    return undefined;
  };

  const row: CareerPlayerAirframeRow = {
    typeId,
    aircraftClassId: opts.aircraftClassId,
    label: marketLabel(labelSource, simbriefIcao),
    rolesPackRelPath: primary,
    ...(extras.length > 0 ? { familyRolesPackRelPaths: [primary, ...extras].sort() } : {}),
    simbriefIcao,
    simbriefAirframeMatch,
  };
  const oewKg = pickNum(opts.oewKg, existing?.oewKg);
  const mtowKg = pickNum(opts.mtowKg, existing?.mtowKg);
  const maxCargoKg = pickNum(opts.maxCargoKg, existing?.maxCargoKg);
  const fuelCapacityKg = pickNum(opts.fuelCapacityKg, existing?.fuelCapacityKg);
  const maxRangeNm = pickNum(opts.maxRangeNm, existing?.maxRangeNm);
  const cruiseFuelFlowKgPerHour = pickNum(
    opts.cruiseFuelFlowKgPerHour,
    existing?.cruiseFuelFlowKgPerHour,
  );
  const cruiseSpeedKt = pickNum(opts.cruiseSpeedKt, existing?.cruiseSpeedKt);
  const fuelBurnKgPerNm = pickNum(opts.fuelBurnKgPerNm, existing?.fuelBurnKgPerNm);
  if (oewKg != null) row.oewKg = Math.round(oewKg);
  if (mtowKg != null) row.mtowKg = Math.round(mtowKg);
  if (maxCargoKg != null) row.maxCargoKg = Math.round(maxCargoKg);
  if (fuelCapacityKg != null) row.fuelCapacityKg = Math.round(fuelCapacityKg);
  if (maxRangeNm != null) row.maxRangeNm = Math.round(maxRangeNm);
  if (cruiseFuelFlowKgPerHour != null) {
    row.cruiseFuelFlowKgPerHour =
      Math.round(cruiseFuelFlowKgPerHour * 10) / 10;
  }
  if (cruiseSpeedKt != null) {
    row.cruiseSpeedKt = Math.round(cruiseSpeedKt);
  }
  if (fuelBurnKgPerNm != null) {
    row.fuelBurnKgPerNm = Math.round(fuelBurnKgPerNm * 1000) / 1000;
  }
  // Keep family list unique sorted (primary may appear twice above).
  if (row.familyRolesPackRelPaths) {
    row.familyRolesPackRelPaths = [...new Set(row.familyRolesPackRelPaths)].sort();
  }

  const idx = rows.findIndex((item) => item.typeId === row.typeId);
  if (idx >= 0) rows[idx] = row;
  else rows.push(row);

  await writeCatalogRows(opts.repoRoot, rows);
  return row;
}

export async function setCareerPlayerAirframeEnabled(opts: {
  repoRoot: string;
  typeId: string;
  enabled: boolean;
}): Promise<CareerPlayerAirframeRow> {
  const typeId = opts.typeId.trim();
  if (!typeId) throw new Error('typeId is required');
  const rows = await readCatalogRows(catalogPath(opts.repoRoot));
  const idx = rows.findIndex((row) => row.typeId === typeId);
  if (idx < 0) {
    throw new Error(`No Skyline player airframe registered as ${typeId}`);
  }
  const current = rows[idx]!;
  const next: CareerPlayerAirframeRow = { ...current };
  if (opts.enabled) {
    delete next.enabled;
  } else {
    next.enabled = false;
  }
  rows[idx] = next;
  await writeCatalogRows(opts.repoRoot, rows);
  return next;
}

export type RemoveCareerPlayerAirframeFamilyResult = {
  typeId: string;
  label: string;
  deletedPaths: string[];
  missingPaths: string[];
};

function packStem(relPath: string): string {
  const base = relPath.replace(/\\/g, '/').split('/').pop() ?? relPath;
  return base.replace(/\.json$/i, '');
}

async function tryUnlink(path: string): Promise<'deleted' | 'missing'> {
  try {
    await unlink(path);
    return 'deleted';
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';
    if (code === 'ENOENT') return 'missing';
    throw error;
  }
}

/**
 * Remove a Market SKU and its family homologation artifacts (OFP packs,
 * example/draft profiles, notes). Hangar fleet is left alone — sell those
 * in-game if needed.
 */
export async function removeCareerPlayerAirframeFamily(opts: {
  repoRoot: string;
  typeId: string;
  /** When false, only drop the Market catalog row. Default true. */
  deleteHomologationFiles?: boolean;
}): Promise<RemoveCareerPlayerAirframeFamilyResult> {
  const typeId = opts.typeId.trim();
  if (!typeId) throw new Error('typeId is required');
  const rows = await readCatalogRows(catalogPath(opts.repoRoot));
  const idx = rows.findIndex((row) => row.typeId === typeId);
  if (idx < 0) {
    throw new Error(`No Skyline player airframe registered as ${typeId}`);
  }
  const row = rows[idx]!;
  const packRels = [
    ...new Set([
      row.rolesPackRelPath,
      ...(row.familyRolesPackRelPaths ?? []),
    ]),
  ].filter((p) => p.trim().length > 0);

  rows.splice(idx, 1);
  await writeCatalogRows(opts.repoRoot, rows);

  const deletedPaths: string[] = [];
  const missingPaths: string[] = [];
  if (opts.deleteHomologationFiles === false) {
    return {
      typeId: row.typeId,
      label: row.label,
      deletedPaths,
      missingPaths,
    };
  }

  const stems = [...new Set(packRels.map(packStem))];
  const candidates: string[] = [];
  for (const rel of packRels) {
    candidates.push(resolve(opts.repoRoot, rel));
  }
  for (const stem of stems) {
    candidates.push(
      resolve(opts.repoRoot, 'profiles', 'ofp', `${stem}.json`),
      resolve(opts.repoRoot, 'profiles', 'examples', `${stem}.json`),
      resolve(opts.repoRoot, 'profiles', 'drafts', `${stem}.json`),
      resolve(opts.repoRoot, 'profiles', 'notes', `${stem}.md`),
    );
  }

  const seen = new Set<string>();
  for (const abs of candidates) {
    const key = abs.replace(/\\/g, '/').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const result = await tryUnlink(abs);
    const rel = relative(opts.repoRoot, abs).replace(/\\/g, '/');
    if (result === 'deleted') deletedPaths.push(rel);
    else missingPaths.push(rel);
  }
  deletedPaths.sort((a, b) => a.localeCompare(b));
  missingPaths.sort((a, b) => a.localeCompare(b));

  return {
    typeId: row.typeId,
    label: row.label,
    deletedPaths,
    missingPaths,
  };
}

export async function listCareerPlayerAirframeCatalog(
  repoRoot: string,
): Promise<CareerPlayerAirframeRow[]> {
  return readCatalogRows(catalogPath(repoRoot));
}

/** Patch cruise burn / TAS fields on an already-registered Market airframe. */
export async function updateCareerPlayerAirframeBurn(opts: {
  repoRoot: string;
  typeId: string;
  cruiseFuelFlowKgPerHour: number;
  fuelBurnKgPerNm: number;
  cruiseSpeedKt?: number;
}): Promise<CareerPlayerAirframeRow> {
  const typeId = opts.typeId.trim();
  if (!typeId) throw new Error('typeId is required');
  if (
    !(opts.cruiseFuelFlowKgPerHour > 0) ||
    !(opts.fuelBurnKgPerNm > 0)
  ) {
    throw new Error('cruiseFuelFlowKgPerHour and fuelBurnKgPerNm must be positive');
  }
  if (
    opts.cruiseSpeedKt != null &&
    !(opts.cruiseSpeedKt > 0)
  ) {
    throw new Error('cruiseSpeedKt must be positive when provided');
  }
  const rows = await readCatalogRows(catalogPath(opts.repoRoot));
  const idx = rows.findIndex((row) => row.typeId === typeId);
  if (idx < 0) {
    throw new Error(`No Skyline player airframe registered as ${typeId}`);
  }
  const next: CareerPlayerAirframeRow = {
    ...rows[idx]!,
    cruiseFuelFlowKgPerHour:
      Math.round(opts.cruiseFuelFlowKgPerHour * 10) / 10,
    fuelBurnKgPerNm: Math.round(opts.fuelBurnKgPerNm * 1000) / 1000,
    ...(opts.cruiseSpeedKt != null
      ? { cruiseSpeedKt: Math.round(opts.cruiseSpeedKt) }
      : {}),
  };
  rows[idx] = next;
  await writeCatalogRows(opts.repoRoot, rows);
  return next;
}

