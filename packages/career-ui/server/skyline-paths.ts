/**
 * Resolve install vs. repo paths for Career API (dev + Electron packaged).
 *
 * Env (packaged):
 *   SKYLINE_REPO_ROOT       — read-only app payload (packages/, profiles/examples, …)
 *   SKYLINE_CAREER_CONTENT  — seed bush_PLN + hub overrides (copied once into data)
 *   SKYLINE_CAREER_DATA     — writable AppData career root (profiles.json, saves/)
 *   SKYLINE_UI_DIST         — Vite build output served by the API
 */
import { access, cp, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

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
  }
  return data;
}

async function seedSharedCareerAssets(
  seedRoot: string,
  dataRoot: string,
): Promise<void> {
  const bushSrc = join(seedRoot, 'bush_PLN');
  const bushDest = join(dataRoot, 'bush_PLN');
  if ((await pathExists(bushSrc)) && !(await pathExists(bushDest))) {
    await cp(bushSrc, bushDest, { recursive: true });
  }

  const overridesName = 'msfs-bush-hub-overrides.json';
  const ovSrc = join(seedRoot, overridesName);
  const ovDest = join(dataRoot, overridesName);
  if ((await pathExists(ovSrc)) && !(await pathExists(ovDest))) {
    await cp(ovSrc, ovDest);
  }
}
