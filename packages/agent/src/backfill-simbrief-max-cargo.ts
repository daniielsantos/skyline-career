/**
 * Replace catalog maxCargoKg that still looks like N×500 lb station placeholders
 * with SimBrief structural ceilings (mzfw−oew / credible maxcargo).
 *
 * Dry-run by default; pass apply: true to write career-player-airframes.json.
 */
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  clampCareerMaxCargoKg,
  KG_TO_LB,
  type AircraftProfile,
} from '@msfs-compat/shared';
import {
  listCareerPlayerAirframeCatalog,
  setCareerPlayerAirframePayloadWeights,
  stationCargoCeilingIsPlaceholder,
  type CareerPlayerAirframeCatalogRow,
} from './career-player-airframe-catalog.js';
import { STATION_MAX_LOAD_PLACEHOLDER_LB } from './discover-payload-stations.js';
import type { OfpRolesPackFile } from './ofp-compliance/scaffold-roles.js';
import { resolveSimBriefMaxCargoKg } from './ofp-compliance/simbrief-airframes.js';

export type BackfillSimbriefMaxCargoRow = {
  typeId: string;
  label: string;
  reason: string;
  catalogMaxCargoKg: number;
  placeholderKg: number;
  simbriefMaxCargoKg?: number;
  nextMaxCargoKg?: number;
  source?: string;
  status: 'would-update' | 'updated' | 'skip' | 'error';
  detail?: string;
};

function placeholderKgForBags(bagCount: number): number {
  return Math.round((bagCount * STATION_MAX_LOAD_PLACEHOLDER_LB) / KG_TO_LB);
}

async function loadJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

async function loadRolesPack(
  repoRoot: string,
  row: CareerPlayerAirframeCatalogRow,
): Promise<OfpRolesPackFile | undefined> {
  const rel = row.rolesPackRelPath?.trim();
  if (!rel) return undefined;
  return loadJson<OfpRolesPackFile>(join(repoRoot, rel));
}

async function loadExampleProfile(
  repoRoot: string,
  row: CareerPlayerAirframeCatalogRow,
  pack: OfpRolesPackFile | undefined,
): Promise<AircraftProfile | undefined> {
  const candidates = [
    pack?.ofpId?.trim(),
    row.typeId,
    pack ? basename(row.rolesPackRelPath, '.json') : undefined,
  ].filter((id): id is string => Boolean(id));
  for (const id of candidates) {
    const profile = await loadJson<AircraftProfile>(
      join(repoRoot, 'profiles', 'examples', `${id}.json`),
    );
    if (profile?.payload?.stations?.length) return profile;
  }
  return undefined;
}

function isPlaceholderCandidate(opts: {
  row: CareerPlayerAirframeCatalogRow;
  pack: OfpRolesPackFile;
  profile?: AircraftProfile;
}): { ok: boolean; reason: string; placeholderKg: number; bagCount: number } {
  const roles = opts.pack.payload?.stationRoles;
  const bags = roles?.baggageStations ?? [];
  const bagCount = bags.length;
  const placeholderKg = placeholderKgForBags(Math.max(1, bagCount));
  const catalog = opts.row.maxCargoKg;

  if (typeof catalog !== 'number' || !Number.isFinite(catalog) || catalog <= 0) {
    return {
      ok: false,
      reason: 'no catalog maxCargoKg',
      placeholderKg,
      bagCount,
    };
  }

  if (
    opts.profile &&
    stationCargoCeilingIsPlaceholder(opts.profile.payload.stations, roles)
  ) {
    return {
      ok: true,
      reason: 'profile stations still N×500 placeholders',
      placeholderKg,
      bagCount,
    };
  }

  // Catalog still equals the N×500 kg conversion (homologated before SimBrief
  // preference), even if the example profile was later calibrated.
  if (bagCount > 0 && Math.abs(catalog - placeholderKg) <= 1) {
    return {
      ok: true,
      reason: `catalog maxCargoKg ≈ ${bagCount}×500 lb (${placeholderKg} kg)`,
      placeholderKg,
      bagCount,
    };
  }

  return {
    ok: false,
    reason: 'catalog maxCargoKg not placeholder-shaped',
    placeholderKg,
    bagCount,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function backfillSimbriefMaxCargo(opts: {
  repoRoot: string;
  /** Write catalog. Default dry-run. */
  apply?: boolean;
  /** Limit to one typeId. */
  typeId?: string;
  fetchImpl?: typeof fetch;
  /** Pause between SimBrief fetches (ms). */
  delayMs?: number;
}): Promise<{
  apply: boolean;
  rows: BackfillSimbriefMaxCargoRow[];
  wouldUpdate: number;
  updated: number;
  errors: number;
}> {
  const apply = Boolean(opts.apply);
  const delayMs = opts.delayMs ?? 150;
  const all = await listCareerPlayerAirframeCatalog(opts.repoRoot);
  const targets = opts.typeId?.trim()
    ? all.filter((row) => row.typeId === opts.typeId!.trim())
    : all;

  const cache = new Map<
    string,
    Awaited<ReturnType<typeof resolveSimBriefMaxCargoKg>>
  >();
  const rows: BackfillSimbriefMaxCargoRow[] = [];
  let wouldUpdate = 0;
  let updated = 0;
  let errors = 0;

  for (const row of targets) {
    const icao = row.simbriefIcao?.trim();
    if (!icao) {
      rows.push({
        typeId: row.typeId,
        label: row.label,
        reason: 'no simbriefIcao',
        catalogMaxCargoKg: row.maxCargoKg ?? 0,
        placeholderKg: 0,
        status: 'skip',
      });
      continue;
    }

    const pack = await loadRolesPack(opts.repoRoot, row);
    if (!pack) {
      rows.push({
        typeId: row.typeId,
        label: row.label,
        reason: 'roles pack missing',
        catalogMaxCargoKg: row.maxCargoKg ?? 0,
        placeholderKg: 0,
        status: 'skip',
      });
      continue;
    }

    const profile = await loadExampleProfile(opts.repoRoot, row, pack);
    const candidate = isPlaceholderCandidate({ row, pack, profile });
    if (!candidate.ok) {
      rows.push({
        typeId: row.typeId,
        label: row.label,
        reason: candidate.reason,
        catalogMaxCargoKg: row.maxCargoKg ?? 0,
        placeholderKg: candidate.placeholderKg,
        status: 'skip',
      });
      continue;
    }

    const match = row.simbriefAirframeMatch?.trim() || 'Default';
    const cacheKey = `${icao}::${match}::${row.label}`;
    try {
      let resolved = cache.get(cacheKey);
      if (!resolved) {
        if (cache.size > 0 && delayMs > 0) await sleep(delayMs);
        resolved = await resolveSimBriefMaxCargoKg({
          simbriefIcao: icao,
          simbriefAirframeMatch: match,
          titleHint: row.label,
          ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
        });
        cache.set(cacheKey, resolved);
      }

      const nextMax =
        clampCareerMaxCargoKg({
          maxCargoKg: resolved.maxCargoKg,
          oewKg: row.oewKg ?? resolved.airframe.oewKg,
          mtowKg: row.mtowKg ?? resolved.airframe.mtowKg,
          mzfwKg: resolved.airframe.mzfwKg,
        }) ?? resolved.maxCargoKg;

      if (nextMax === row.maxCargoKg) {
        rows.push({
          typeId: row.typeId,
          label: row.label,
          reason: candidate.reason,
          catalogMaxCargoKg: row.maxCargoKg ?? 0,
          placeholderKg: candidate.placeholderKg,
          simbriefMaxCargoKg: resolved.maxCargoKg,
          nextMaxCargoKg: nextMax,
          source: resolved.source,
          status: 'skip',
          detail: 'already matches SimBrief',
        });
        continue;
      }

      if (apply) {
        await setCareerPlayerAirframePayloadWeights({
          repoRoot: opts.repoRoot,
          typeId: row.typeId,
          maxCargoKg: nextMax,
        });
        updated += 1;
        rows.push({
          typeId: row.typeId,
          label: row.label,
          reason: candidate.reason,
          catalogMaxCargoKg: row.maxCargoKg ?? 0,
          placeholderKg: candidate.placeholderKg,
          simbriefMaxCargoKg: resolved.maxCargoKg,
          nextMaxCargoKg: nextMax,
          source: resolved.source,
          status: 'updated',
        });
      } else {
        wouldUpdate += 1;
        rows.push({
          typeId: row.typeId,
          label: row.label,
          reason: candidate.reason,
          catalogMaxCargoKg: row.maxCargoKg ?? 0,
          placeholderKg: candidate.placeholderKg,
          simbriefMaxCargoKg: resolved.maxCargoKg,
          nextMaxCargoKg: nextMax,
          source: resolved.source,
          status: 'would-update',
        });
      }
    } catch (err) {
      errors += 1;
      rows.push({
        typeId: row.typeId,
        label: row.label,
        reason: candidate.reason,
        catalogMaxCargoKg: row.maxCargoKg ?? 0,
        placeholderKg: candidate.placeholderKg,
        status: 'error',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { apply, rows, wouldUpdate, updated, errors };
}

export function formatBackfillSimbriefMaxCargoReport(
  result: Awaited<ReturnType<typeof backfillSimbriefMaxCargo>>,
): string {
  const lines: string[] = [];
  const mode = result.apply ? 'APPLY' : 'DRY-RUN';
  lines.push(
    `[backfill-simbrief-max-cargo] ${mode} · would=${result.wouldUpdate} updated=${result.updated} errors=${result.errors}`,
  );
  for (const row of result.rows) {
    if (row.status === 'skip' && !row.detail?.includes('already')) continue;
    const arrow =
      row.nextMaxCargoKg != null
        ? `${row.catalogMaxCargoKg} → ${row.nextMaxCargoKg} kg`
        : `${row.catalogMaxCargoKg} kg`;
    lines.push(
      `  ${row.status.padEnd(12)} ${row.typeId.padEnd(40)} ${arrow}` +
        (row.source ? ` (${row.source})` : '') +
        (row.detail ? ` — ${row.detail}` : '') +
        (row.reason && row.status !== 'skip' ? ` · ${row.reason}` : ''),
    );
  }
  const skipped = result.rows.filter((r) => r.status === 'skip').length;
  lines.push(`  (skipped ${skipped} non-placeholder / unchanged)`);
  return lines.join('\n');
}
