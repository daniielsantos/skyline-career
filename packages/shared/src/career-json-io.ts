/**
 * Atomic JSON file helpers for career saves (JSON backend + migrate source).
 */

import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Returns null only when the file does not exist yet.
 * Unreadable JSON is quarantined and throws — never treated as "no save".
 */
export async function readJsonFile<T>(path: string): Promise<T | null> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    const quarantine = `${path}.corrupt-${Date.now()}`;
    await copyFile(path, quarantine).catch(() => undefined);
    throw new Error(
      `Save at ${path} is unreadable; kept a copy at ${quarantine}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Write via temp file + rename so a concurrent reader always sees either the
 * previous or the next save, never a half-written one.
 */
export async function writeJsonFileAtomic(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(tmp, path);
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (
          attempt >= 4 ||
          (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')
        ) {
          throw error;
        }
        await new Promise((done) => setTimeout(done, 25 * (attempt + 1)));
      }
    }
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function renameJsonAside(path: string, suffix: string): Promise<string | null> {
  const dest = `${path}${suffix}`;
  try {
    await rename(path, dest);
    return dest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    // Already migrated / race — leave source.
    return null;
  }
}
