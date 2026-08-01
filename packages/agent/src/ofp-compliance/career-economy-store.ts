import { resolve } from 'node:path';
import {
  cloneEconomyWorld,
  createSeedEconomyWorld,
  openCareerStore,
  type CareerEconomyWorld,
  type CareerStore,
} from '@msfs-compat/shared';

export const DEFAULT_CAREER_ECONOMY_PATH = 'profiles/career/local-economy.json';
export const DEFAULT_CAREER_DIR = 'profiles/career';

function careerDirFromEconomyPath(path: string): string {
  const abs = resolve(path);
  // …/profiles/career/local-economy.json → …/profiles/career
  return abs.replace(/[\\/][^\\/]+$/, '');
}

async function storeForPath(path: string): Promise<CareerStore> {
  return openCareerStore({ careerDir: careerDirFromEconomyPath(path) });
}

export async function loadCareerEconomy(path: string): Promise<CareerEconomyWorld> {
  const store = await storeForPath(path);
  try {
    const { world, dirty } = await store.loadEconomy();
    if (dirty) await store.saveEconomy(world);
    return world;
  } finally {
    store.close();
  }
}

export async function saveCareerEconomy(
  path: string,
  world: CareerEconomyWorld,
): Promise<void> {
  const store = await storeForPath(path);
  try {
    await store.saveEconomy(world);
  } finally {
    store.close();
  }
}

export async function loadOrCreateCareerEconomy(
  path: string,
  opts: { seed?: string; reset?: boolean } = {},
): Promise<CareerEconomyWorld> {
  const store = await storeForPath(path);
  try {
    if (opts.reset) {
      const world = createSeedEconomyWorld({ seed: opts.seed });
      await store.saveEconomy(world);
      return cloneEconomyWorld(world);
    }
    try {
      const { world, dirty } = await store.loadEconomy();
      if (dirty) await store.saveEconomy(world);
      return world;
    } catch {
      const world = createSeedEconomyWorld({ seed: opts.seed });
      await store.saveEconomy(world);
      return cloneEconomyWorld(world);
    }
  } finally {
    store.close();
  }
}
