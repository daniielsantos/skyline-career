/**
 * Multi-save career profiles under profiles/career (SP).
 *
 * Layout (SP):
 *   profiles/career/profiles.json          — index + activeId
 *   profiles/career/saves/<id>/skyline.sqlite
 *   profiles/career/bush_PLN/              — shared (read-only assets)
 *   profiles/career/msfs-bush-hub-overrides.json — shared
 *
 * Layout (MP / CAREER_WORLD_FIXED):
 *   profiles/career/world/skyline.sqlite   — one shared world forever
 *   (no profiles.json; game state lives in SQL tables inside that DB)
 *
 * Legacy single-save: root skyline.sqlite is claimed into the **first**
 * profile created in the UI (keeps that world, uses the player-typed name).
 * We never invent a ghost "Pilot 1" entry.
 */

import { randomBytes } from 'node:crypto';
import { access, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openCareerStore, careerDatabaseUrlFromEnv, type CareerStore } from '@msfs-compat/shared';

/** Synthetic profile id for CAREER_WORLD_FIXED (not a multi-save row). */
export const FIXED_WORLD_PROFILE_ID = 'world';
export const FIXED_WORLD_PROFILE_NAME = 'World';

export type CareerProfileMeta = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type CareerProfilesFile = {
  version: 1;
  activeId: string | null;
  profiles: CareerProfileMeta[];
};

function newId(): string {
  return randomBytes(6).toString('hex');
}

function todayIso(): string {
  return new Date().toISOString();
}

export function careerFixedWorldDir(careerRoot: string): string {
  return join(careerRoot, 'world');
}

export function fixedWorldProfileMeta(): CareerProfileMeta {
  const now = todayIso();
  return {
    id: FIXED_WORLD_PROFILE_ID,
    name: FIXED_WORLD_PROFILE_NAME,
    createdAt: now,
    updatedAt: now,
  };
}

/** Open (or create schema in) the single MP world — Postgres when CAREER_PG / URL set. */
export async function openCareerFixedWorldStore(
  careerRoot: string,
): Promise<CareerStore> {
  const pgUrl = careerDatabaseUrlFromEnv();
  if (pgUrl) {
    return openCareerStore({
      careerDir: careerFixedWorldDir(careerRoot),
      backend: 'postgres',
      connectionString: pgUrl,
    });
  }
  const dir = careerFixedWorldDir(careerRoot);
  await mkdir(dir, { recursive: true });
  return openCareerStore({ careerDir: dir });
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function careerProfilesIndexPath(careerRoot: string): string {
  return join(careerRoot, 'profiles.json');
}

export function careerSaveDir(careerRoot: string, profileId: string): string {
  return join(careerRoot, 'saves', profileId.trim());
}

export function emptyProfilesFile(): CareerProfilesFile {
  return { version: 1, activeId: null, profiles: [] };
}

export async function readProfilesFile(
  careerRoot: string,
): Promise<CareerProfilesFile> {
  const path = careerProfilesIndexPath(careerRoot);
  try {
    const raw = JSON.parse(await readFile(path, 'utf8')) as unknown;
    if (!raw || typeof raw !== 'object') return emptyProfilesFile();
    const row = raw as Record<string, unknown>;
    const profiles = Array.isArray(row.profiles)
      ? row.profiles
          .map((p): CareerProfileMeta | null => {
            if (!p || typeof p !== 'object') return null;
            const r = p as Record<string, unknown>;
            const id = typeof r.id === 'string' ? r.id.trim() : '';
            const name = typeof r.name === 'string' ? r.name.trim() : '';
            if (!id || !name) return null;
            return {
              id,
              name,
              createdAt:
                typeof r.createdAt === 'string' ? r.createdAt : todayIso(),
              updatedAt:
                typeof r.updatedAt === 'string' ? r.updatedAt : todayIso(),
            };
          })
          .filter((p): p is CareerProfileMeta => p != null)
      : [];
    const activeId =
      typeof row.activeId === 'string' && row.activeId.trim()
        ? row.activeId.trim()
        : null;
    return {
      version: 1,
      activeId:
        activeId && profiles.some((p) => p.id === activeId) ? activeId : null,
      profiles,
    };
  } catch {
    return emptyProfilesFile();
  }
}

export async function writeProfilesFile(
  careerRoot: string,
  file: CareerProfilesFile,
): Promise<void> {
  await mkdir(careerRoot, { recursive: true });
  const path = careerProfilesIndexPath(careerRoot);
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
}

async function moveIfExists(from: string, to: string): Promise<boolean> {
  if (!(await pathExists(from))) return false;
  await mkdir(join(to, '..'), { recursive: true });
  await rename(from, to);
  return true;
}

/**
 * Move legacy root skyline.sqlite (+ sidecars) into `saveDir`.
 * Returns true if a root DB was claimed.
 */
async function claimLegacyRootSaveInto(
  careerRoot: string,
  saveDir: string,
): Promise<boolean> {
  const rootSqlite = join(careerRoot, 'skyline.sqlite');
  if (!(await pathExists(rootSqlite))) return false;
  await mkdir(saveDir, { recursive: true });
  await moveIfExists(rootSqlite, join(saveDir, 'skyline.sqlite'));
  await moveIfExists(
    join(careerRoot, 'skyline.sqlite-wal'),
    join(saveDir, 'skyline.sqlite-wal'),
  );
  await moveIfExists(
    join(careerRoot, 'skyline.sqlite-shm'),
    join(saveDir, 'skyline.sqlite-shm'),
  );
  await moveIfExists(
    join(careerRoot, 'local-economy.json'),
    join(saveDir, 'local-economy.json'),
  );
  await moveIfExists(
    join(careerRoot, 'local-missions.json'),
    join(saveDir, 'local-missions.json'),
  );
  return true;
}

/**
 * Ensure career dirs + profiles index exist.
 * Does **not** invent a fake "Pilot 1" profile — a legacy root
 * `skyline.sqlite` is claimed into the first profile the player creates.
 */
export async function ensureCareerProfilesLayout(
  careerRoot: string,
): Promise<CareerProfilesFile> {
  await mkdir(careerRoot, { recursive: true });
  await mkdir(join(careerRoot, 'saves'), { recursive: true });
  return readProfilesFile(careerRoot);
}

export async function createCareerProfile(
  careerRoot: string,
  name: string,
): Promise<CareerProfileMeta> {
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    throw new Error('Profile name must be at least 2 characters');
  }
  const file = await ensureCareerProfilesLayout(careerRoot);
  if (file.profiles.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error(`Profile "${trimmed}" already exists`);
  }
  const id = newId();
  const saveDir = careerSaveDir(careerRoot, id);
  await mkdir(saveDir, { recursive: true });
  // First profile + leftover single-save DB → keep that world under the name
  // the player typed (never auto-register a ghost "Pilot 1").
  const claimedLegacy =
    file.profiles.length === 0
      ? await claimLegacyRootSaveInto(careerRoot, saveDir)
      : false;
  if (!claimedLegacy) {
    const store = await openCareerStore({ careerDir: saveDir });
    store.close();
  }
  const now = todayIso();
  const meta: CareerProfileMeta = {
    id,
    name: trimmed,
    createdAt: now,
    updatedAt: now,
  };
  file.profiles.push(meta);
  await writeProfilesFile(careerRoot, file);
  return meta;
}

export async function renameCareerProfile(
  careerRoot: string,
  profileId: string,
  name: string,
): Promise<CareerProfileMeta> {
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    throw new Error('Profile name must be at least 2 characters');
  }
  const file = await readProfilesFile(careerRoot);
  const idx = file.profiles.findIndex((p) => p.id === profileId);
  if (idx < 0) throw new Error('Unknown profile');
  if (
    file.profiles.some(
      (p) =>
        p.id !== profileId && p.name.toLowerCase() === trimmed.toLowerCase(),
    )
  ) {
    throw new Error(`Profile "${trimmed}" already exists`);
  }
  const next = {
    ...file.profiles[idx]!,
    name: trimmed,
    updatedAt: todayIso(),
  };
  file.profiles[idx] = next;
  await writeProfilesFile(careerRoot, file);
  return next;
}

export async function deleteCareerProfile(
  careerRoot: string,
  profileId: string,
): Promise<CareerProfilesFile> {
  const file = await readProfilesFile(careerRoot);
  const idx = file.profiles.findIndex((p) => p.id === profileId);
  if (idx < 0) throw new Error('Unknown profile');
  // Last remaining save is allowed — the gate then offers Create profile.
  if (file.activeId === profileId) {
    file.activeId = null;
  }
  file.profiles.splice(idx, 1);
  await writeProfilesFile(careerRoot, file);
  try {
    await rm(careerSaveDir(careerRoot, profileId), {
      recursive: true,
      force: true,
    });
  } catch {
    /* leave orphan folder */
  }
  return file;
}

export async function setActiveCareerProfile(
  careerRoot: string,
  profileId: string,
): Promise<CareerProfilesFile> {
  const file = await readProfilesFile(careerRoot);
  if (!file.profiles.some((p) => p.id === profileId)) {
    throw new Error('Unknown profile');
  }
  file.activeId = profileId;
  const idx = file.profiles.findIndex((p) => p.id === profileId);
  if (idx >= 0) {
    file.profiles[idx] = {
      ...file.profiles[idx]!,
      updatedAt: todayIso(),
    };
  }
  await writeProfilesFile(careerRoot, file);
  return file;
}

export async function clearActiveCareerProfile(
  careerRoot: string,
): Promise<CareerProfilesFile> {
  const file = await readProfilesFile(careerRoot);
  file.activeId = null;
  await writeProfilesFile(careerRoot, file);
  return file;
}

export async function listSaveProfileIds(careerRoot: string): Promise<string[]> {
  const saves = join(careerRoot, 'saves');
  if (!(await pathExists(saves))) return [];
  const entries = await readdir(saves, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

export async function openCareerProfileStore(
  careerRoot: string,
  profileId: string,
): Promise<CareerStore> {
  const saveDir = careerSaveDir(careerRoot, profileId);
  await mkdir(saveDir, { recursive: true });
  return openCareerStore({ careerDir: saveDir });
}
