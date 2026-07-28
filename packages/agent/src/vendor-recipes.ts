import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { VendorRecipe } from '@msfs-compat/shared';

/**
 * Load vendor recipe JSON files (sketch — not yet wired into homologate).
 */
export async function loadVendorRecipes(dir: string): Promise<VendorRecipe[]> {
  const names = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  const recipes: VendorRecipe[] = [];
  for (const name of names) {
    const raw = JSON.parse(await readFile(join(dir, name), 'utf8')) as VendorRecipe;
    if (raw?.schemaVersion && raw?.recipeId) recipes.push(raw);
  }
  return recipes.sort((a, b) => a.recipeId.localeCompare(b.recipeId));
}

export function findRecipesForPublisher(
  recipes: VendorRecipe[],
  publisher: string,
): VendorRecipe[] {
  const p = publisher.trim().toLowerCase();
  return recipes.filter((r) => r.publisher.toLowerCase() === p);
}
