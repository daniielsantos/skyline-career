/**
 * Persisted SP vs MP choice for the Electron shell.
 * File: %APPDATA%/Airframe Career/career/desktop-play.json
 * (legacy Skyline Career path is copied once by migrate-userdata.mjs)
 * (legacy folder name; display brand is Airframe Career)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** @typedef {'sp' | 'mp'} DesktopPlayMode */

/**
 * @typedef {object} DesktopPlayConfig
 * @property {DesktopPlayMode} [mode]
 * @property {string} [worldApiUrl]
 * @property {number} [chosenAtMs]
 */

export const DEFAULT_WORLD_API_URL = 'http://127.0.0.1:8787';

/** Public multiplayer world (PlayModeGate placeholder / first-run MP suggest). */
export const PUBLIC_WORLD_API_URL = 'https://world.playairframe.com';

/**
 * @param {string} raw
 * @returns {string}
 */
export function normalizeWorldApiUrl(raw) {
  const trimmed = String(raw ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('World URL must be a valid http(s) address');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('World URL must start with http:// or https://');
  }
  return trimmed;
}

/**
 * @param {string} path
 * @returns {DesktopPlayConfig}
 */
export function readDesktopPlayConfig(path) {
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    /** @type {DesktopPlayConfig} */
    const out = {};
    if (parsed.mode === 'sp' || parsed.mode === 'mp') out.mode = parsed.mode;
    if (typeof parsed.worldApiUrl === 'string' && parsed.worldApiUrl.trim()) {
      try {
        out.worldApiUrl = normalizeWorldApiUrl(parsed.worldApiUrl);
      } catch {
        /* ignore bad saved URL */
      }
    }
    if (typeof parsed.chosenAtMs === 'number' && Number.isFinite(parsed.chosenAtMs)) {
      out.chosenAtMs = parsed.chosenAtMs;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * @param {string} path
 * @param {DesktopPlayConfig} config
 */
export function writeDesktopPlayConfig(path, config) {
  mkdirSync(dirname(path), { recursive: true });
  const body = {
    mode: config.mode,
    worldApiUrl: config.worldApiUrl ?? DEFAULT_WORLD_API_URL,
    chosenAtMs: config.chosenAtMs ?? Date.now(),
  };
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
}

/**
 * Resolve world URL for the Career API child.
 * Process env wins (lab: CAREER_WORLD_API_URL=… npm start).
 * @param {NodeJS.ProcessEnv} env
 * @param {DesktopPlayConfig} config
 * @returns {{ worldApiUrl: string, envForced: boolean, mode: DesktopPlayMode | null }}
 */
export function resolveDesktopPlayLaunch(env, config) {
  const envUrl = (env.CAREER_WORLD_API_URL ?? '').trim();
  if (envUrl) {
    return {
      worldApiUrl: normalizeWorldApiUrl(envUrl),
      envForced: true,
      mode: 'mp',
    };
  }
  if (config.mode === 'mp') {
    const url = normalizeWorldApiUrl(
      config.worldApiUrl?.trim() || PUBLIC_WORLD_API_URL,
    );
    return { worldApiUrl: url, envForced: false, mode: 'mp' };
  }
  if (config.mode === 'sp') {
    return { worldApiUrl: '', envForced: false, mode: 'sp' };
  }
  return { worldApiUrl: '', envForced: false, mode: null };
}
