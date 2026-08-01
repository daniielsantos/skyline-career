/**
 * Prefer OFP roles pack matched to the live MSFS title; fall back to the
 * mission class pack (rolesPackRelPath). Lets light_turboprop fly Asobo or
 * Black Square Caravan with the correct station map.
 */
import { resolve } from 'node:path';
import {
  careerPlayerAirframePackPaths,
  findCareerPlayerAirframe,
} from '@msfs-compat/shared';
import {
  loadRolesPackFile,
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
      if (opts.strictAirframeMatch && !allowedAbs.has(resolvedAbs)) {
        throw new Error(
          `Live aircraft "${title}" does not match the purchased airframe (${opts.rolesPackRelPath})`,
        );
      }
      return {
        path: byTitle.path,
        pack: byTitle.pack,
        via: byTitle.via,
      };
    }
    if (opts.strictAirframeMatch) {
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
