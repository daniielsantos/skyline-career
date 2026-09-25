/**
 * Identify live MSFS aircraft against Market SKU / OFP pack / inject profile.
 * Title-string matching only (no paint / livery textures).
 */
import { basename, join, relative, resolve } from 'node:path';
import {
  careerPlayerAirframePackPaths,
  findCareerPlayerAirframe,
  listCareerPlayerAirframes,
  type CareerPlayerAirframe,
} from '@msfs-compat/shared';
import { liveTitleMatchesMarketSku } from '../../agent/src/ofp-compliance/simbrief-airframes.ts';
import {
  matchHeuristic,
  resolveRolesPackForTitle,
} from '../../agent/src/ofp-compliance/scaffold-roles.ts';
import {
  loadProfilesFromDirs,
  type LoadedProfile,
} from '../../agent/src/profile-registry.ts';
import { resolveProfile } from '../../agent/src/profile-resolver.ts';

export type IdentifyLiveMarketSku = {
  typeId: string;
  label: string;
  aircraftClassId: string;
  enabled: boolean;
  via: 'live_title_sku' | 'ofp_pack' | 'heuristic';
};

export type IdentifyLiveAircraftResult = {
  aircraftTitle: string | null;
  market: {
    matched: boolean;
    skus: IdentifyLiveMarketSku[];
  };
  ofp: {
    matched: boolean;
    ofpId: string | null;
    icao: string | null;
    packRelPath: string | null;
    via: string | null;
    loadMethod: string | null;
    injectCapable: boolean | null;
  };
  inject: {
    matched: boolean;
    profileKey: string | null;
    displayName: string | null;
    path: string | null;
    reason: string | null;
    confidence: number | null;
  };
  /**
   * ready = Market SKU recognized (buy/fly path).
   * recognized = OFP and/or inject without a Market SKU row.
   * unknown = no layer matched.
   * no_aircraft = empty title.
   */
  verdict: 'no_aircraft' | 'ready' | 'recognized' | 'unknown';
};

function normalizeAbs(path: string): string {
  return resolve(path).replace(/\\/g, '/').toLowerCase();
}

function toRepoRel(path: string, repoRoot: string): string {
  const rel = relative(repoRoot, path).replace(/\\/g, '/');
  if (!rel || rel.startsWith('..')) return basename(path);
  return rel;
}

function skuRow(
  airframe: CareerPlayerAirframe,
  via: IdentifyLiveMarketSku['via'],
): IdentifyLiveMarketSku {
  return {
    typeId: airframe.typeId,
    label: airframe.label,
    aircraftClassId: airframe.aircraftClassId,
    enabled: airframe.enabled !== false,
    via,
  };
}

function dedupeSkus(rows: IdentifyLiveMarketSku[]): IdentifyLiveMarketSku[] {
  const byId = new Map<string, IdentifyLiveMarketSku>();
  const viaRank: Record<IdentifyLiveMarketSku['via'], number> = {
    live_title_sku: 0,
    ofp_pack: 1,
    heuristic: 2,
  };
  for (const row of rows) {
    const prev = byId.get(row.typeId);
    if (!prev || viaRank[row.via] < viaRank[prev.via]) {
      byId.set(row.typeId, row);
    }
  }
  return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function marketSkusForPackAbs(
  packAbs: string,
  repoRoot: string,
): CareerPlayerAirframe[] {
  const target = normalizeAbs(packAbs);
  return listCareerPlayerAirframes(undefined, { includeDisabled: true }).filter(
    (airframe) =>
      careerPlayerAirframePackPaths(airframe).some(
        (rel) => normalizeAbs(join(repoRoot, rel)) === target,
      ),
  );
}

export function buildIdentifyVerdict(
  result: Pick<IdentifyLiveAircraftResult, 'aircraftTitle' | 'market' | 'ofp' | 'inject'>,
): IdentifyLiveAircraftResult['verdict'] {
  if (!result.aircraftTitle?.trim()) return 'no_aircraft';
  if (result.market.matched) return 'ready';
  if (result.ofp.matched || result.inject.matched) return 'recognized';
  return 'unknown';
}

/** Pure identify from a known MSFS title (no SimBridge). */
export async function identifyLiveAircraftFromTitle(opts: {
  title: string;
  repoRoot: string;
  /** Test seam — preloaded inject profiles. */
  injectCatalog?: LoadedProfile[];
}): Promise<IdentifyLiveAircraftResult> {
  const title = opts.title.trim();
  const empty: IdentifyLiveAircraftResult = {
    aircraftTitle: title || null,
    market: { matched: false, skus: [] },
    ofp: {
      matched: false,
      ofpId: null,
      icao: null,
      packRelPath: null,
      via: null,
      loadMethod: null,
      injectCapable: null,
    },
    inject: {
      matched: false,
      profileKey: null,
      displayName: null,
      path: null,
      reason: null,
      confidence: null,
    },
    verdict: 'no_aircraft',
  };
  if (!title) {
    return { ...empty, verdict: 'no_aircraft' };
  }

  const marketRows: IdentifyLiveMarketSku[] = [];
  for (const airframe of listCareerPlayerAirframes(undefined, {
    includeDisabled: true,
  })) {
    if (liveTitleMatchesMarketSku(title, airframe.typeId)) {
      marketRows.push(skuRow(airframe, 'live_title_sku'));
    }
  }

  const ofpDir = resolve(opts.repoRoot, 'profiles', 'ofp');
  const ofpResolved = await resolveRolesPackForTitle(title, ofpDir);
  let ofp: IdentifyLiveAircraftResult['ofp'] = empty.ofp;
  if (ofpResolved) {
    ofp = {
      matched: true,
      ofpId: ofpResolved.pack.ofpId?.trim() || null,
      icao: ofpResolved.pack.icao?.trim() || null,
      packRelPath: toRepoRel(ofpResolved.path, opts.repoRoot),
      via: ofpResolved.via,
      loadMethod: ofpResolved.pack.loadMethod ?? null,
      injectCapable:
        typeof ofpResolved.pack.injectCapable === 'boolean'
          ? ofpResolved.pack.injectCapable
          : null,
    };
    for (const airframe of marketSkusForPackAbs(ofpResolved.path, opts.repoRoot)) {
      marketRows.push(skuRow(airframe, 'ofp_pack'));
    }
  }

  const heuristic = matchHeuristic(title);
  if (heuristic?.marketTypeId) {
    const airframe = findCareerPlayerAirframe(heuristic.marketTypeId);
    if (airframe) {
      marketRows.push(skuRow(airframe, 'heuristic'));
    }
  }

  const skus = dedupeSkus(marketRows);

  const catalog =
    opts.injectCatalog ??
    (await loadProfilesFromDirs([
      join(opts.repoRoot, 'profiles', 'examples'),
      join(opts.repoRoot, 'profiles', 'catalog'),
    ]));
  const resolved = resolveProfile({ title }, catalog);
  const best = resolved.matched ? resolved : undefined;
  const inject: IdentifyLiveAircraftResult['inject'] = best?.profile
    ? {
        matched: true,
        profileKey: best.profile.profileKey,
        displayName:
          best.profile.displayName?.trim() ||
          best.profile.match.title?.trim() ||
          null,
        path: best.path ? toRepoRel(best.path, opts.repoRoot) : null,
        reason: best.reason,
        confidence: best.confidence,
      }
    : {
        matched: false,
        profileKey: null,
        displayName: null,
        path: null,
        reason: resolved.reason || 'no_match',
        confidence: resolved.confidence || 0,
      };

  const partial = {
    aircraftTitle: title,
    market: { matched: skus.length > 0, skus },
    ofp,
    inject,
  };
  return { ...partial, verdict: buildIdentifyVerdict(partial) };
}
