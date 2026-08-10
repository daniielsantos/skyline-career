/**
 * Prefer OFP roles pack matched to the live MSFS title; fall back to the
 * mission class pack (rolesPackRelPath). Lets light_turboprop fly Asobo or
 * Black Square Caravan with the correct station map.
 */
import { resolve } from 'node:path';
import {
  careerPlayerAirframePackPaths,
  findCareerPlayerAirframe,
  titlesMatchForCatalog,
} from '@msfs-compat/shared';
import {
  loadRolesPackFile,
  packMatchesTitle,
  resolveRolesPackForTitle,
  type OfpRolesPackFile,
} from '../../agent/src/ofp-compliance/scaffold-roles.ts';

export type ResolvedMissionRolesPack = {
  path: string;
  pack: OfpRolesPackFile;
  via: string;
};

function normalizePackPath(path: string): string {
  return resolve(path).replace(/\\/g, '/').toLowerCase();
}

/** Exact pack match, or catalog alias (shorter MSFS title vs homologated match.title). */
function packAcceptsLiveTitleAlias(
  pack: OfpRolesPackFile,
  title: string,
): boolean {
  if (packMatchesTitle(pack, title)) return true;
  return (pack.matchTitles ?? []).some((t) => titlesMatchForCatalog(title, t));
}

export async function resolveMissionRolesPack(opts: {
  repoRoot: string;
  rolesPackRelPath: string;
  liveTitle?: string | null;
  /** Purchased concrete airframes must not be flown as another homologated model. */
  strictAirframeMatch?: boolean;
  /** When set, vendor-fork packs listed on the Market SKU are also accepted. */
  airframeTypeId?: string | null;
}): Promise<ResolvedMissionRolesPack> {
  const ofpDir = resolve(opts.repoRoot, 'profiles', 'ofp');
  const fallbackPath = resolve(opts.repoRoot, opts.rolesPackRelPath);
  const airframe = findCareerPlayerAirframe(opts.airframeTypeId);
  const allowedAbs = new Set(
    (airframe ? careerPlayerAirframePackPaths(airframe) : [opts.rolesPackRelPath]).map(
      (rel) => normalizePackPath(resolve(opts.repoRoot, rel)),
    ),
  );
  allowedAbs.add(normalizePackPath(fallbackPath));

  const title = opts.liveTitle?.trim();
  if (title) {
    const byTitle = await resolveRolesPackForTitle(title, ofpDir);
    if (byTitle) {
      const resolvedAbs = normalizePackPath(byTitle.path);
      const inFamily = allowedAbs.has(resolvedAbs);
      if (inFamily) {
        return {
          path: byTitle.path,
          pack: byTitle.pack,
          via: byTitle.via,
        };
      }
      if (opts.strictAirframeMatch) {
        throw new Error(
          `Live aircraft "${title}" does not match the purchased airframe (${opts.rolesPackRelPath})`,
        );
      }
      // Purchased SKU set: ignore a live title from a different Market airframe
      // (e.g. still in Commander while dispatching a Caravan freight).
      // Without airframeTypeId, keep class-level vendor-fork switching by title.
      if (!opts.airframeTypeId) {
        return {
          path: byTitle.path,
          pack: byTitle.pack,
          via: byTitle.via,
        };
      }
    } else if (opts.strictAirframeMatch) {
      // Purchased pack may list a longer match.title while MSFS reports a shorter
      // liveTitles alias (e.g. "Beechcraft King Air" vs "[Beechcraft King Air 350i").
      const purchased = await loadRolesPackFile(fallbackPath);
      if (packAcceptsLiveTitleAlias(purchased, title)) {
        return {
          path: fallbackPath,
          pack: purchased,
          via: `purchased airframe alias (${opts.rolesPackRelPath})`,
        };
      }
      throw new Error(
        `Live aircraft "${title}" is not homologated for the purchased airframe (${opts.rolesPackRelPath})`,
      );
    }
  }

  const pack = await loadRolesPackFile(fallbackPath);
  return {
    path: fallbackPath,
    pack,
    via: `mission class (${opts.rolesPackRelPath})`,
  };
}

