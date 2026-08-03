/**
 * Append-only debug log for Watch / pipe / Loaded vs Due.
 * File: profiles/career/watch-debug.log (repo root).
 */
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const logDir = join(repoRoot, 'profiles', 'career');
export const WATCH_DEBUG_LOG_PATH = join(logDir, 'watch-debug.log');

let chain: Promise<void> = Promise.resolve();
let ensuredDir = false;

function serialize(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Fire-and-forget line logger (serialized writes). */
export function watchDebugLog(
  scope: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  const ts = new Date().toISOString();
  const payload = data ? ` ${serialize(data)}` : '';
  const line = `[${ts}] [${scope}] ${message}${payload}\n`;
  chain = chain
    .then(async () => {
      if (!ensuredDir) {
        await mkdir(logDir, { recursive: true });
        ensuredDir = true;
      }
      await appendFile(WATCH_DEBUG_LOG_PATH, line, 'utf8');
    })
    .catch(() => {
      /* never break Watch on log I/O */
    });
}
