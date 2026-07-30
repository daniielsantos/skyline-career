import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  cloneEconomyWorld,
  createSeedEconomyWorld,
  ensureEconomyCaughtUp,
  migrateEconomyWorld,
  type CareerEconomyWorld,
} from '@msfs-compat/shared';

export const DEFAULT_CAREER_ECONOMY_PATH = 'profiles/career/local-economy.json';

export async function loadCareerEconomy(path: string): Promise<CareerEconomyWorld> {
  const raw = await readFile(resolve(path), 'utf8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (!Array.isArray(parsed.airports)) {
    throw new Error(`Invalid career economy file: ${path}`);
  }
  const world = migrateEconomyWorld(parsed);
  const { world: caught } = ensureEconomyCaughtUp(world);
  return caught;
}

export async function saveCareerEconomy(
  path: string,
  world: CareerEconomyWorld,
): Promise<void> {
  const abs = resolve(path);
  await mkdir(dirname(abs), { recursive: true });
  const toSave = migrateEconomyWorld(world);
  toSave.lastBatchAtMs = world.lastBatchAtMs ?? toSave.lastBatchAtMs;
  toSave.lastSyncedAtMs = toSave.lastBatchAtMs;
  await writeFile(abs, `${JSON.stringify(toSave, null, 2)}\n`, 'utf8');
}

export async function loadOrCreateCareerEconomy(
  path: string,
  opts: { seed?: string; reset?: boolean } = {},
): Promise<CareerEconomyWorld> {
  if (!opts.reset) {
    try {
      const world = await loadCareerEconomy(path);
      await saveCareerEconomy(path, world);
      return world;
    } catch {
      // create fresh
    }
  }
  const world = createSeedEconomyWorld({ seed: opts.seed });
  await saveCareerEconomy(path, world);
  return cloneEconomyWorld(world);
}
