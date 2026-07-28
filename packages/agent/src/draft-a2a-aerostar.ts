import { join } from 'node:path';
import type { AircraftProfile } from '@msfs-compat/shared';
import type { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';
import { draftProfileFromVendorRecipe } from './draft-from-recipe.js';
import { loadVendorRecipes } from './vendor-recipes.js';

/**
 * @deprecated Prefer draftProfileFromVendorRecipe + a2a-accusim recipe.
 * Kept as a thin wrapper for callers that still import this module.
 */
export async function draftA2aAerostarProfile(
  bridge: NamedPipeSimBridge,
  options: { outDir: string; matchTitle?: string; icao?: string; recipesDir?: string },
): Promise<{ path: string; profile: AircraftProfile }> {
  const recipesDir = options.recipesDir ?? join(options.outDir, '..', 'vendors');
  const recipes = await loadVendorRecipes(recipesDir);
  const recipe = recipes.find((r) => r.recipeId === 'a2a-accusim');
  if (!recipe) {
    throw new Error(`a2a-accusim recipe not found under ${recipesDir}`);
  }
  return draftProfileFromVendorRecipe(bridge, recipe, options);
}
