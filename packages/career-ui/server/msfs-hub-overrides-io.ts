/**
 * Load / persist MSFS hub coordinate overrides under career AppData.
 * (Shipped layer lives in shared; runtime layer is stamped onto economy airports.)
 */

import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  filterMsfsBushHubOverridesToIcaos,
  listCareerHubIcaos,
  listMsfsBushHubOverrides,
  pruneRuntimeMsfsBushHubOverrides,
  setRuntimeMsfsBushHubOverrides,
  SIMBRIEF_DISPATCH_DENY_ICAOS,
  type MsfsBushHubOverridesFile,
} from '@msfs-compat/shared';
import {
  MSFS_HUB_OVERRIDES_FILENAME,
  MSFS_HUB_OVERRIDES_LEGACY_FILENAME,
} from './skyline-paths.ts';

export function profileMsfsBushHubOverridesPath(careerDir: string): string {
  return join(careerDir, MSFS_HUB_OVERRIDES_FILENAME);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Prefer new filename; rename legacy AppData copy once. */
async function ensureHubOverridesPath(careerDir: string): Promise<string> {
  const next = join(careerDir, MSFS_HUB_OVERRIDES_FILENAME);
  const legacy = join(careerDir, MSFS_HUB_OVERRIDES_LEGACY_FILENAME);
  if ((await pathExists(legacy)) && !(await pathExists(next))) {
    await rename(legacy, next);
  } else if ((await pathExists(legacy)) && (await pathExists(next))) {
    await rm(legacy, { force: true });
  }
  return next;
}

function catalogOverrideKeepIcaos(): string[] {
  const deny = new Set(
    SIMBRIEF_DISPATCH_DENY_ICAOS.map((icao) => icao.toUpperCase()),
  );
  return listCareerHubIcaos().filter((icao) => !deny.has(icao));
}

export async function loadProfileMsfsBushHubOverrides(
  careerDir: string,
): Promise<MsfsBushHubOverridesFile> {
  const path = await ensureHubOverridesPath(careerDir);
  try {
    const raw = JSON.parse(await readFile(path, 'utf8')) as unknown;
    setRuntimeMsfsBushHubOverrides(raw);
  } catch {
    setRuntimeMsfsBushHubOverrides({});
  }
  pruneRuntimeMsfsBushHubOverrides(catalogOverrideKeepIcaos());
  return listMsfsBushHubOverrides();
}

export async function persistProfileMsfsBushHubOverrides(
  careerDir: string,
): Promise<string> {
  const path = await ensureHubOverridesPath(careerDir);
  await mkdir(dirname(path), { recursive: true });
  const keep = catalogOverrideKeepIcaos();
  pruneRuntimeMsfsBushHubOverrides(keep);
  const payload = filterMsfsBushHubOverridesToIcaos(
    listMsfsBushHubOverrides(),
    keep,
  );
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return path;
}
