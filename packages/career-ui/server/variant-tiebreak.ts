/**
 * When the live MSFS title misses the purchased family, structuralHash
 * (tanks + station indexes) narrows the glasses. One operational group is
 * accepted. Several groups are one user question. The chosen profile's
 * canonical title is what SimBrief already understands.
 */
import { join } from 'node:path';
import {
  careerPlayerAirframePackPaths,
  computeFingerprintV2,
  findCareerPlayerAirframe,
  fingerprintFromProfile,
  type AircraftStructure,
} from '@msfs-compat/shared';
import { loadProfilesFromDirs } from '../../agent/src/profile-registry.ts';
import { inferSimBriefAirframeMatchFromTitle } from '../../agent/src/ofp-compliance/simbrief-airframes.ts';
import {
  loadRolesPackFile,
  packMatchesTitle,
  type OfpRolesPackFile,
} from '../../agent/src/ofp-compliance/scaffold-roles.ts';
import { resolveMissionRolesPack } from './roles-pack-helpers.ts';

export type VariantChoice = {
  profileKey: string;
  label: string;
  canonicalTitle: string;
};

export type FamilyVariantDecision =
  | { kind: 'none' }
  | { kind: 'auto'; choice: VariantChoice; choices: VariantChoice[] }
  | { kind: 'choose'; choices: VariantChoice[] };

function stationKey(pack: OfpRolesPackFile): string {
  const roles = pack.payload?.stationRoles;
  const norm = (xs?: number[]) =>
    [...(xs ?? [])].sort((a, b) => a - b).join(',');
  return [
    norm(roles?.crewStations),
    norm(roles?.baggageStations),
    norm(roles?.passengerStations),
  ].join('|');
}

function simbriefKey(title: string, pack: OfpRolesPackFile): string {
  return (
    inferSimBriefAirframeMatchFromTitle(title)?.trim() ||
    pack.simbriefAirframeMatch?.trim() ||
    'Default'
  );
}

export function liveStructuralHash(structure: AircraftStructure): string {
  return computeFingerprintV2({
    identity: { title: '', publisher: 'asobo' },
    structure,
  }).structuralHash;
}

export async function decideFamilyVariant(opts: {
  repoRoot: string;
  airframeTypeId: string;
  liveStructure: AircraftStructure;
}): Promise<FamilyVariantDecision> {
  const airframe = findCareerPlayerAirframe(opts.airframeTypeId);
  if (!airframe) return { kind: 'none' };

  const packPaths = careerPlayerAirframePackPaths(airframe);
  const packs: Array<{ pack: OfpRolesPackFile }> = [];
  for (const rel of packPaths) {
    try {
      packs.push({ pack: await loadRolesPackFile(join(opts.repoRoot, rel)) });
    } catch {
      // Missing pack file — skip.
    }
  }
  if (packs.length === 0) return { kind: 'none' };

  const liveHash = liveStructuralHash(opts.liveStructure);
  const profiles = await loadProfilesFromDirs([
    join(opts.repoRoot, 'profiles', 'examples'),
  ]);

  const groups = new Map<string, VariantChoice[]>();
  for (const loaded of profiles) {
    const title = loaded.profile.match.title?.trim();
    if (!title) continue;
    const pack = packs.find((entry) => packMatchesTitle(entry.pack, title));
    if (!pack) continue;
    if (fingerprintFromProfile(loaded.profile).structuralHash !== liveHash) {
      continue;
    }
    const choice: VariantChoice = {
      profileKey: loaded.profile.profileKey,
      label: title,
      canonicalTitle: title,
    };
    const key = `${stationKey(pack.pack)}|${simbriefKey(title, pack.pack)}`;
    const list = groups.get(key) ?? [];
    list.push(choice);
    groups.set(key, list);
  }

  const choices = [...groups.values()].map((list) =>
    [...list].sort((a, b) => a.label.localeCompare(b.label)),
  );
  choices.sort((a, b) => a[0]!.label.localeCompare(b[0]!.label));
  if (choices.length === 0) return { kind: 'none' };
  if (choices.length === 1) {
    const only = choices[0]!;
    return { kind: 'auto', choice: only[0]!, choices: only };
  }
  return {
    kind: 'choose',
    choices: choices.map((list) => list[0]!),
  };
}

export function variantChoiceAllowed(
  decision: FamilyVariantDecision,
  canonicalTitle: string,
): boolean {
  const title = canonicalTitle.trim();
  if (!title) return false;
  if (decision.kind === 'none') return false;
  return decision.choices.some((choice) => choice.canonicalTitle === title);
}

export async function resolveDispatchTitle(opts: {
  repoRoot: string;
  airframeTypeId?: string | null;
  rolesPackRelPath: string;
  liveTitle: string;
  hintedTitle?: string | null;
  sampleStructure: () => Promise<AircraftStructure>;
}): Promise<
  | { kind: 'title'; title: string; saveVariant: string | null }
  | { kind: 'choose'; choices: VariantChoice[] }
> {
  const liveTitle = opts.liveTitle.trim();
  const typeId = opts.airframeTypeId?.trim() ?? '';
  if (!typeId) {
    return { kind: 'title', title: liveTitle, saveVariant: null };
  }

  try {
    await resolveMissionRolesPack({
      repoRoot: opts.repoRoot,
      rolesPackRelPath: opts.rolesPackRelPath,
      airframeTypeId: typeId,
      strictAirframeMatch: true,
      liveTitle,
    });
    return { kind: 'title', title: liveTitle, saveVariant: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('not homologated for the purchased airframe')) {
      throw error;
    }
  }

  const liveStructure = await opts.sampleStructure();
  const decision = await decideFamilyVariant({
    repoRoot: opts.repoRoot,
    airframeTypeId: typeId,
    liveStructure,
  });
  if (decision.kind === 'none') {
    const airframe = findCareerPlayerAirframe(typeId);
    const purchased = airframe?.label?.trim() || opts.rolesPackRelPath;
    throw new Error(
      `Live aircraft "${liveTitle}" is not homologated for the purchased airframe (${purchased})`,
    );
  }

  const hinted = opts.hintedTitle?.trim() ?? '';
  if (hinted && variantChoiceAllowed(decision, hinted)) {
    return { kind: 'title', title: hinted, saveVariant: hinted };
  }
  if (decision.kind === 'auto') {
    return {
      kind: 'title',
      title: decision.choice.canonicalTitle,
      saveVariant: decision.choice.canonicalTitle,
    };
  }
  return { kind: 'choose', choices: decision.choices };
}
