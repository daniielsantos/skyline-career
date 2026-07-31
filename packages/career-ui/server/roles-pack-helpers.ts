/**
 * Prefer OFP roles pack matched to the live MSFS title; fall back to the
 * mission class pack (rolesPackRelPath). Lets light_turboprop fly Asobo or
 * Black Square Caravan with the correct station map.
 */
import { resolve } from 'node:path';
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

export async function resolveMissionRolesPack(opts: {
  repoRoot: string;
  rolesPackRelPath: string;
  liveTitle?: string | null;
}): Promise<ResolvedMissionRolesPack> {
  const ofpDir = resolve(opts.repoRoot, 'profiles', 'ofp');
  const title = opts.liveTitle?.trim();
  if (title) {
    const byTitle = await resolveRolesPackForTitle(title, ofpDir);
    if (byTitle) {
      return {
        path: byTitle.path,
        pack: byTitle.pack,
        via: byTitle.via,
      };
    }
  }

  const fallbackPath = resolve(opts.repoRoot, opts.rolesPackRelPath);
  const pack = await loadRolesPackFile(fallbackPath);
  return {
    path: fallbackPath,
    pack,
    via: `mission class (${opts.rolesPackRelPath})`,
  };
}
