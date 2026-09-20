/**
 * Rare world kill switch: when forceUpdate is on, refuse Prepare/accept until
 * the desktop client is ≥ minClientVersion. PG: economy_meta columns
 * force_client_update + min_client_version (schema v29).
 *
 * Ops-owned: flipped via SQL (or future ops API). Economy persist must not
 * overwrite those columns from in-memory world state.
 */

export const CLIENT_UPDATE_REQUIRED = 'client_update_required';

export const CLIENT_VERSION_HEADER = 'x-skyline-client-version';

export type ClientUpdatePolicy = {
  forceUpdate: boolean;
  minClientVersion: string;
};

export const DEFAULT_CLIENT_UPDATE_POLICY: ClientUpdatePolicy = {
  forceUpdate: false,
  minClientVersion: '0.0.0',
};

/** major.minor.patch only; ignores -prerelease / +build suffixes. */
export function parseSemverCore(
  raw: string | null | undefined,
): [number, number, number] | null {
  if (raw == null) return null;
  const m = String(raw)
    .trim()
    .match(/^v?(\d+)\.(\d+)\.(\d+)/i);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Negative if a < b, 0 if equal/uncomparable pair handled by callers. */
export function compareSemverCore(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const pa = parseSemverCore(a);
  const pb = parseSemverCore(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    const d = pa[i]! - pb[i]!;
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export function parseClientUpdatePolicy(raw: unknown): ClientUpdatePolicy {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_CLIENT_UPDATE_POLICY };
  }
  const src = raw as Record<string, unknown>;
  const min =
    typeof src.minClientVersion === 'string' && src.minClientVersion.trim()
      ? src.minClientVersion.trim()
      : DEFAULT_CLIENT_UPDATE_POLICY.minClientVersion;
  return {
    forceUpdate: src.forceUpdate === true,
    minClientVersion: min,
  };
}

/**
 * True when ops flipped forceUpdate and the client is below min (or version
 * missing/unparseable). Invalid minClientVersion never gates (avoid brick).
 */
export function isClientUpdateRequired(
  policy: ClientUpdatePolicy | unknown,
  clientVersion: string | null | undefined,
): boolean {
  const p = parseClientUpdatePolicy(policy);
  if (!p.forceUpdate) return false;
  const min = parseSemverCore(p.minClientVersion);
  if (!min) return false;
  const client = parseSemverCore(clientVersion);
  if (!client) return true;
  return compareSemverCore(clientVersion, p.minClientVersion) < 0;
}

export type ClientUpdateGateRejection = {
  status: 426;
  body: {
    error: typeof CLIENT_UPDATE_REQUIRED;
    minClientVersion: string;
  };
};

/** Authoritative accept-path gate; null when allowed. */
export function clientUpdateGateRejection(
  policy: ClientUpdatePolicy | unknown,
  clientVersion: string | null | undefined,
): ClientUpdateGateRejection | null {
  const p = parseClientUpdatePolicy(policy);
  if (!isClientUpdateRequired(p, clientVersion)) return null;
  return {
    status: 426,
    body: {
      error: CLIENT_UPDATE_REQUIRED,
      minClientVersion: p.minClientVersion,
    },
  };
}
