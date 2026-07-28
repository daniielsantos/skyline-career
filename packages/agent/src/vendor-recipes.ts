import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { VendorDetectSignal, VendorRecipe } from '@msfs-compat/shared';
import { inferPublisher, normalizeAircraftTitle } from '@msfs-compat/shared';
import type { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';
import { probeLVars } from './probe-lvars.js';

/**
 * Load vendor recipe JSON files from profiles/vendors.
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

export type RecipeMatchContext = {
  title: string;
  publisher: string;
  classicWritetestFailed: boolean;
  /** LVar names that read successfully (pre-probed). */
  readableLVars: Set<string>;
};

function signalMatches(signal: VendorDetectSignal, ctx: RecipeMatchContext): boolean {
  switch (signal.kind) {
    case 'publisher':
      return ctx.publisher.toLowerCase() === signal.value.toLowerCase();
    case 'title_regex':
      try {
        return new RegExp(signal.value, 'i').test(ctx.title);
      } catch {
        return false;
      }
    case 'classic_writetest_fails':
      return ctx.classicWritetestFailed;
    case 'lvar_readable':
      return ctx.readableLVars.has(signal.name);
    case 'simvar_capacity_lt':
    case 'simvar_capacity_gte':
      // Evaluated only when live bridge probes are supplied via scoreRecipeLive.
      return false;
    default:
      return false;
  }
}

/**
 * Score recipes for classic-write-fail fallback (publisher/title/LVar hints).
 * Higher score wins; require onClassicWriteFail === try-lvar-bridge for Accu-Sim path.
 */
export function scoreRecipesForLvarFallback(
  recipes: VendorRecipe[],
  ctx: RecipeMatchContext,
): Array<{ recipe: VendorRecipe; score: number; reasons: string[] }> {
  const scored: Array<{ recipe: VendorRecipe; score: number; reasons: string[] }> = [];

  for (const recipe of recipes) {
    if (recipe.wizard.onClassicWriteFail !== 'try-lvar-bridge') continue;

    const reasons: string[] = [];
    let score = 0;

    const pubHit = recipe.detect.some(
      (s) => s.kind === 'publisher' && signalMatches(s, ctx),
    );
    const titleHit = recipe.detect.some(
      (s) => s.kind === 'title_regex' && signalMatches(s, ctx),
    );
    if (pubHit) {
      score += 50;
      reasons.push('publisher');
    }
    if (titleHit) {
      score += 40;
      reasons.push('title');
    }
    if (!pubHit && !titleHit) continue;

    if (ctx.classicWritetestFailed) {
      score += 10;
      reasons.push('classic_writetest_fails');
    }

    const lvarSignals = recipe.detect.filter((s) => s.kind === 'lvar_readable');
    let lvarHits = 0;
    for (const s of lvarSignals) {
      if (s.kind === 'lvar_readable' && ctx.readableLVars.has(s.name)) {
        lvarHits += 1;
        score += 15;
      }
    }
    if (lvarHits > 0) reasons.push(`lvars=${lvarHits}`);

    // Prefer recipes whose probe list overlaps readable set.
    for (const name of recipe.fuel.probeLVars ?? []) {
      if (ctx.readableLVars.has(name)) score += 2;
    }

    scored.push({ recipe, score, reasons });
  }

  return scored.sort((a, b) => b.score - a.score);
}

export function inferPublisherFromLiveTitle(title: string): string {
  return inferPublisher(normalizeAircraftTitle(title), process.env.MSFS_COMPAT_PUBLISHER);
}

/**
 * Probe recipe LVar candidates and return readable names + first successful fuel write probe.
 */
export async function probeRecipeLvars(
  bridge: NamedPipeSimBridge,
  recipe: VendorRecipe,
): Promise<{
  readable: Set<string>;
  writeProbe?: { name: string; ok: boolean; before: number; after: number; target: number };
}> {
  const names = [
    ...(recipe.fuel.probeLVars ?? []),
    ...recipe.fuel.tanks.map((t) => t.writeLVar).filter(Boolean) as string[],
    ...Object.values(recipe.payload.stationLVars ?? {}),
    ...(recipe.payload.extras?.map((e) => e.lvar) ?? []),
  ];
  const unique = [...new Set(names)];
  const readings = await probeLVars(bridge, unique);
  const readable = new Set(readings.filter((r) => r.ok).map((r) => r.name));

  const primaryWrite =
    recipe.fuel.tanks.find((t) => t.writeLVar && readable.has(t.writeLVar!))?.writeLVar ??
    recipe.fuel.tanks.find((t) => t.writeLVar)?.writeLVar;

  let writeProbe: { name: string; ok: boolean; before: number; after: number; target: number } | undefined;
  if (primaryWrite) {
    try {
      const before = await bridge.readLVar(primaryWrite);
      const target = Math.max(5, Math.min(30, Math.floor((Number.isFinite(before) ? before : 40) * 0.5) || 20));
      await bridge.writeLVar({ name: primaryWrite, value: target });
      await bridge.delay(400);
      const after = await bridge.readLVar(primaryWrite);
      const ok = Math.abs(after - target) <= Math.max(target * 0.05, 0.25);
      writeProbe = { name: primaryWrite, ok, before, after, target };
      await bridge.writeLVar({ name: primaryWrite, value: before });
      await bridge.delay(200);
    } catch {
      writeProbe = { name: primaryWrite, ok: false, before: 0, after: 0, target: 0 };
    }
  }

  return { readable, writeProbe };
}
