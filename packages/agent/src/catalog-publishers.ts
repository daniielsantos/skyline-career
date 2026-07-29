import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { KNOWN_PUBLISHERS } from '@msfs-compat/shared';

/**
 * Merge known publisher slugs with those already used in examples/ and vendors/.
 */
export async function listCatalogPublishers(repoRoot: string): Promise<string[]> {
  const set = new Set<string>(KNOWN_PUBLISHERS);

  for (const dir of ['profiles/examples', 'profiles/vendors'] as const) {
    const abs = join(repoRoot, dir);
    let names: string[] = [];
    try {
      names = (await readdir(abs)).filter((f) => f.endsWith('.json'));
    } catch {
      continue;
    }
    for (const name of names) {
      try {
        const raw = JSON.parse(await readFile(join(abs, name), 'utf8')) as {
          match?: { publisher?: string };
          publisher?: string;
        };
        const p = (raw.match?.publisher ?? raw.publisher ?? '').trim().toLowerCase();
        if (p) set.add(p);
      } catch {
        // skip bad json
      }
    }
  }

  return [...set].sort((a, b) => a.localeCompare(b));
}
