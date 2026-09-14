/**
 * Career API process roles for SP lab vs MP production split.
 *
 * - full: local store + SimBridge Watch/inject (SP / all-in-one lab)
 * - world: store only (VPS); sim routes → 501 sim_on_client
 * - gateway: desktop; sim local + HTTP proxy to CAREER_WORLD_API_URL
 */

export type CareerApiMode = 'full' | 'world' | 'gateway';

const SIM_PATH_PREFIXES = [
  '/api/watch',
  '/api/preflight',
  '/api/load-ofp',
  '/api/simbridge',
] as const;

/** Paths handled on the desktop gateway (NamedPipe / SimBridge). */
export function isSimLocalApiPath(path: string): boolean {
  const p = path.split('?')[0] ?? path;
  return SIM_PATH_PREFIXES.some(
    (prefix) => p === prefix || p.startsWith(`${prefix}/`),
  );
}

/**
 * Settle/depart stay on the world host, but the gateway may enrich the body
 * with local Watch telemetry before forwarding.
 */
export function isGatewayEnrichApiPath(path: string): boolean {
  const p = path.split('?')[0] ?? path;
  return p === '/api/settle' || p === '/api/depart';
}

/**
 * Paths the desktop gateway forwards to CAREER_WORLD_API_URL.
 * Static UI (`/`, assets) stays local — never proxy HTML/JS to the world host.
 */
export function isGatewayProxiedPath(path: string): boolean {
  const p = path.split('?')[0] ?? path;
  if (p === '/api/health') return false;
  // Map style uses host/.env MAPTILER_KEY — keep on gateway (world may lack the key).
  if (p === '/api/map/satellite-style') return false;
  if (isSimLocalApiPath(p)) return false;
  if (p.startsWith('/api/')) return true;
  if (p.startsWith('/worlds/')) return true;
  return false;
}

function envFlagTrue(raw: string | undefined): boolean {
  const v = (raw ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

export function resolveCareerApiMode(
  env: NodeJS.Dict<string> | Record<string, string | undefined> = process.env,
): CareerApiMode {
  const explicit = (env.CAREER_API_MODE ?? '').trim().toLowerCase();
  if (explicit === 'full' || explicit === 'world' || explicit === 'gateway') {
    return explicit;
  }
  if (envFlagTrue(env.CAREER_DISABLE_SIM)) {
    return 'world';
  }
  const worldUrl = (env.CAREER_WORLD_API_URL ?? '').trim();
  if (worldUrl) {
    return 'gateway';
  }
  return 'full';
}

export function careerWorldApiUrlFromEnv(
  env: NodeJS.Dict<string> | Record<string, string | undefined> = process.env,
): string | null {
  const url = (env.CAREER_WORLD_API_URL ?? '').trim().replace(/\/+$/, '');
  return url || null;
}

export function isSimDisabledMode(mode: CareerApiMode): boolean {
  return mode === 'world';
}

export function isGatewayMode(mode: CareerApiMode): boolean {
  return mode === 'gateway';
}

export const SIM_ON_CLIENT_CODE = 'sim_on_client';
export const SIM_ON_CLIENT_ERROR =
  'SimBridge Watch/inject runs on the desktop client — not on the world host';
