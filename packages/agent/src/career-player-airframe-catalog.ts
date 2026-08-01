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
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
};

export const CAREER_CLASS_CHOICES: Array<{
  value: FreighterClassId;
  label: string;
}> = [
  { value: 'light_ga', label: 'light_ga — piston / small GA' },
  { value: 'light_turboprop', label: 'light_turboprop — C208-size turboprop' },
  { value: 'narrow_freighter', label: 'narrow_freighter — narrow-body jet' },
  { value: 'wide_freighter', label: 'wide_freighter — wide-body jet' },
];

export function inferCareerClassFromIcao(icao: string): FreighterClassId {
  const normalized = icao.trim().toUpperCase();
  if (
    ['C172', 'AC11', 'BE36', 'BE60', 'PA24', 'C185', 'C400', 'P46T', 'BE58', 'BN2P'].includes(
      normalized,
    )
  ) {
    return 'light_ga';
  }
  if (['C208', 'B190', 'E110'].includes(normalized)) {
    return 'light_turboprop';
  }
  if (['B738', 'B737', 'A320', 'A321'].includes(normalized)) {
    return 'narrow_freighter';
  }
  return 'wide_freighter';
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

export async function registerCareerPlayerAirframe(opts: {
  repoRoot: string;
  rolesPackPath: string;
  pack: OfpRolesPackFile;
  aircraftClassId: FreighterClassId;
  title?: string;
  /** Profile id for one-off SKUs; families pass marketTypeId / pack.ofpId. */
  typeId?: string;
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

  const row: CareerPlayerAirframeRow = {
    typeId,
    aircraftClassId: opts.aircraftClassId,
    label: marketLabel(labelSource, simbriefIcao),
    rolesPackRelPath: primary,
    ...(extras.length > 0 ? { familyRolesPackRelPaths: [primary, ...extras].sort() } : {}),
    simbriefIcao,
    simbriefAirframeMatch,
  };
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

export async function listCareerPlayerAirframeCatalog(
  repoRoot: string,
): Promise<CareerPlayerAirframeRow[]> {
  return readCatalogRows(catalogPath(repoRoot));
}

