import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  cloneEconomyWorld,
  createSeedEconomyWorld,
  type CareerEconomyWorld,
} from '@msfs-compat/shared';

export const DEFAULT_CAREER_ECONOMY_PATH = 'profiles/career/local-economy.json';

export async function loadCareerEconomy(path: string): Promise<CareerEconomyWorld> {
  const raw = await readFile(resolve(path), 'utf8');
  const parsed = JSON.parse(raw) as CareerEconomyWorld;
  if (parsed.version !== 1 || !Array.isArray(parsed.airports)) {
    throw new Error(`Invalid career economy file: ${path}`);
  }
  return parsed;
}

export async function saveCareerEconomy(
  path: string,
  world: CareerEconomyWorld,
): Promise<void> {
  const abs = resolve(path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, `${JSON.stringify(world, null, 2)}\n`, 'utf8');
}

export async function loadOrCreateCareerEconomy(
  path: string,
  opts: { seed?: string; reset?: boolean } = {},
): Promise<CareerEconomyWorld> {
  if (!opts.reset) {
    try {
      return await loadCareerEconomy(path);
    } catch {
      // create fresh
    }
  }
  const world = createSeedEconomyWorld({ seed: opts.seed });
  await saveCareerEconomy(path, world);
  return cloneEconomyWorld(world);
}
