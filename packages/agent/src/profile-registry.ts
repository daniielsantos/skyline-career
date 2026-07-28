import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { AircraftProfile } from '@msfs-compat/shared';

export interface LoadedProfile {
  path: string;
  profile: AircraftProfile;
}

export async function loadProfilesFromDirs(dirs: string[]): Promise<LoadedProfile[]> {
  const loaded: LoadedProfile[] = [];

  for (const dir of dirs) {
    const abs = resolve(dir);
    let files: string[];
    try {
      files = await readdir(abs);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const path = join(abs, file);
      try {
        const raw = await readFile(path, 'utf8');
        const parsed = JSON.parse(raw) as AircraftProfile | { profile: AircraftProfile };
        const profile =
          'schemaVersion' in parsed && parsed.schemaVersion
            ? (parsed as AircraftProfile)
            : 'profile' in parsed
              ? parsed.profile
              : null;
        if (profile?.schemaVersion && profile?.match?.title) {
          loaded.push({ path, profile });
        }
      } catch {
        // skip invalid
      }
    }
  }

  return loaded;
}

export function defaultProfileDirs(repoRoot: string): string[] {
  return [
    join(repoRoot, 'profiles', 'examples'),
    join(repoRoot, 'profiles', 'catalog'),
    join(repoRoot, 'profiles', 'cache'),
    join(repoRoot, 'profiles', 'drafts'),
  ];
}

export function defaultCacheDir(repoRoot: string): string {
  return join(repoRoot, 'profiles', 'cache');
}
