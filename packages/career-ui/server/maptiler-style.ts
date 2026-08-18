import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** MapTiler Hybrid = satellite photo + labels (airport idents stay readable). */
const MAPTILER_HYBRID_STYLE =
  'https://api.maptiler.com/maps/hybrid/style.json';

const KEY_NAMES = ['MAPTILER_KEY', 'VITE_MAPTILER_KEY'] as const;

export function parseEnvText(text: string): {
  vars: Record<string, string>;
  commentedMaptilerKey: string | null;
} {
  const vars: Record<string, string> = {};
  let commentedMaptilerKey: string | null = null;
  const body = text.replace(/^\uFEFF/, '');
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const commented = line.startsWith('#');
    const payload = commented ? line.replace(/^#\s*/, '') : line;
    const match = payload.match(
      /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/,
    );
    if (!match) continue;
    const name = match[1]!;
    let value = match[2] ?? '';
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    value = value.trim();
    if (commented) {
      if (name === 'MAPTILER_KEY' && value && !commentedMaptilerKey) {
        commentedMaptilerKey = value;
      }
      continue;
    }
    vars[name] = value;
  }
  return { vars, commentedMaptilerKey };
}

function applyParsedEnv(vars: Record<string, string>): void {
  for (const [name, value] of Object.entries(vars)) {
    if (process.env[name] == null || process.env[name] === '') {
      process.env[name] = value;
    }
  }
}

function tryLoadEnvFile(filePath: string): void {
  try {
    const parsed = parseEnvText(readFileSync(filePath, 'utf8'));
    applyParsedEnv(parsed.vars);
    if (!maptilerKeyFromEnv() && parsed.commentedMaptilerKey) {
      process.env.MAPTILER_KEY = parsed.commentedMaptilerKey;
    }
  } catch {
    /* missing / unreadable .env is fine */
  }
}

/** Load gitignored `.env` without overriding vars already in the process. */
export function loadMaptilerEnvFiles(roots: Array<string | undefined>): void {
  const seen = new Set<string>();
  for (const root of roots) {
    const trimmed = root?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    tryLoadEnvFile(join(trimmed, '.env'));
  }
}

export function maptilerKeyFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  for (const name of KEY_NAMES) {
    const key = env[name]?.trim();
    if (key) return key;
  }
  return null;
}

export function maptilerSatelliteStyleUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const key = maptilerKeyFromEnv(env);
  if (!key) return null;
  return `${MAPTILER_HYBRID_STYLE}?key=${encodeURIComponent(key)}`;
}
