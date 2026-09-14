/**
 * Resolve install vs. repo paths for Career API (dev + Electron packaged).
 *
 * Env (packaged):
 *   SKYLINE_REPO_ROOT       — read-only app payload (packages/, profiles/examples, …)
 *   SKYLINE_CAREER_CONTENT  — seed hub overrides (copied once into data)
 *   SKYLINE_CAREER_DATA     — writable AppData career root (profiles.json, saves/)
 *   SKYLINE_UI_DIST         — Vite build output served by the API
 */
import { access, cp, mkdir, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Runtime + seed filename (was msfs-bush-hub-overrides.json). */
export const MSFS_HUB_OVERRIDES_FILENAME = 'msfs-hub-overrides.json';
/** Pre-rename AppData / seed name — migrated once on open. */
export const MSFS_HUB_OVERRIDES_LEGACY_FILENAME =
  'msfs-bush-hub-overrides.json';

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Monorepo root in dev; `resources/skyline` when packaged. */
export function getRepoRoot(): string {
  if (process.env.SKYLINE_REPO_ROOT?.trim()) {
    return resolve(process.env.SKYLINE_REPO_ROOT.trim());
  }
  // packages/career-ui/server → repo
  return resolve(here, '..', '..', '..');
}

/** Vite `dist` (UI static files). Empty / missing → API-only (dev with Vite proxy). */
export function getUiDist(): string {
  if (process.env.SKYLINE_UI_DIST?.trim()) {
    return resolve(process.env.SKYLINE_UI_DIST.trim());
  }
  return join(here, '..', 'dist');
}

function careerContentSeed(): string {
  if (process.env.SKYLINE_CAREER_CONTENT?.trim()) {
    return resolve(process.env.SKYLINE_CAREER_CONTENT.trim());
  }
  return join(getRepoRoot(), 'profiles', 'career');
}

/**
 * Writable career root. In packaged mode seeds shared assets from content once.
 */
export async function resolveCareerRoot(): Promise<string> {
  const data = process.env.SKYLINE_CAREER_DATA?.trim()
    ? resolve(process.env.SKYLINE_CAREER_DATA.trim())
    : join(getRepoRoot(), 'profiles', 'career');
  await mkdir(data, { recursive: true });
  await mkdir(join(data, 'saves'), { recursive: true });

  const seed = careerContentSeed();
  if (resolve(seed) !== resolve(data)) {
    await seedSharedCareerAssets(seed, data);
  } else {
    await migrateLegacyHubOverridesFile(data);
    await removeLegacyBushPlnDir(data);
  }
  return data;
}

/** Drop retired bush-trip PLN seed from AppData (product removed). */
async function removeLegacyBushPlnDir(dataRoot: string): Promise<void> {
  const bushDest = join(dataRoot, 'bush_PLN');
  if (await pathExists(bushDest)) {
    await rm(bushDest, { recursive: true, force: true });
  }
}

/** Rename msfs-bush-hub-overrides.json → msfs-hub-overrides.json when needed. */
export async function migrateLegacyHubOverridesFile(
  dir: string,
): Promise<void> {
  const next = join(dir, MSFS_HUB_OVERRIDES_FILENAME);
  const legacy = join(dir, MSFS_HUB_OVERRIDES_LEGACY_FILENAME);
  if ((await pathExists(legacy)) && !(await pathExists(next))) {
    await rename(legacy, next);
  } else if ((await pathExists(legacy)) && (await pathExists(next))) {
    await rm(legacy, { force: true });
  }
}

async function seedSharedCareerAssets(
  seedRoot: string,
  dataRoot: string,
): Promise<void> {
  await removeLegacyBushPlnDir(dataRoot);
  await migrateLegacyHubOverridesFile(dataRoot);

  const ovDest = join(dataRoot, MSFS_HUB_OVERRIDES_FILENAME);
  if (await pathExists(ovDest)) return;

  const ovSrcNext = join(seedRoot, MSFS_HUB_OVERRIDES_FILENAME);
  const ovSrcLegacy = join(seedRoot, MSFS_HUB_OVERRIDES_LEGACY_FILENAME);
  if (await pathExists(ovSrcNext)) {
    await cp(ovSrcNext, ovDest);
  } else if (await pathExists(ovSrcLegacy)) {
    await cp(ovSrcLegacy, ovDest);
  }
}
