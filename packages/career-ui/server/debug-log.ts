/**
 * Append-only debug log for Watch / pipe / OFP inject / Loaded vs Due.
 * File: <careerRoot>/watch-debug.log
 * Inject lines use scope `[inject]` — filter: Select-String '\[inject\]'
 */
import { appendFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { getRepoRoot } from './skyline-paths.ts';

function logDir(): string {
  if (process.env.SKYLINE_CAREER_DATA?.trim()) {
    return resolve(process.env.SKYLINE_CAREER_DATA.trim());
  }
  return join(getRepoRoot(), 'profiles', 'career');
}

export const WATCH_DEBUG_LOG_PATH = join(logDir(), 'watch-debug.log');

/** Same file — inject/CDU lines use scopes `[inject]` and `[cdu]`. */
export const INJECT_DEBUG_LOG_PATH = WATCH_DEBUG_LOG_PATH;

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
        await mkdir(logDir(), { recursive: true });
        ensuredDir = true;
      }
      await appendFile(WATCH_DEBUG_LOG_PATH, line, 'utf8');
    })
    .catch(() => {
      /* never break Watch on log I/O */
    });
}
