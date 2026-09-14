/**
 * In-memory sliding-window limiter for public auth endpoints (login/register).
 * Per-process only — enough for a single world-api / SP host. Not distributed.
 */

export const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
/** Combined login + register attempts per client key per window. */
export const AUTH_RATE_LIMIT_MAX = 20;

type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();

export function resetAuthRateLimitForTests(): void {
  buckets.clear();
}

function prune(hits: number[], now: number, windowMs: number): number[] {
  const floor = now - windowMs;
  return hits.filter((t) => t > floor);
}

/**
 * Record one attempt. Returns ok=false when over the limit (does not record
 * the overflowing hit so the window can drain).
 */
export function consumeAuthRateLimit(
  key: string,
  opts?: {
    nowMs?: number;
    windowMs?: number;
    max?: number;
  },
): { ok: true; remaining: number } | { ok: false; retryAfterSec: number } {
  const now = opts?.nowMs ?? Date.now();
  const windowMs = opts?.windowMs ?? AUTH_RATE_LIMIT_WINDOW_MS;
  const max = opts?.max ?? AUTH_RATE_LIMIT_MAX;
  const id = key.trim() || 'unknown';
  const bucket = buckets.get(id) ?? { hits: [] };
  bucket.hits = prune(bucket.hits, now, windowMs);
  if (bucket.hits.length >= max) {
    buckets.set(id, bucket);
    const oldest = bucket.hits[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return { ok: false, retryAfterSec };
  }
  bucket.hits.push(now);
  buckets.set(id, bucket);
  return { ok: true, remaining: Math.max(0, max - bucket.hits.length) };
}

/** Best-effort client key for rate limiting (IP). */
export function authRateLimitKeyFromRequest(req: {
  headers: { [key: string]: string | string[] | undefined };
  socket?: { remoteAddress?: string | null };
}): string {
  const xf = req.headers['x-forwarded-for'];
  const forwarded =
    typeof xf === 'string'
      ? xf.split(',')[0]?.trim()
      : Array.isArray(xf)
        ? xf[0]?.trim()
        : '';
  if (forwarded) return forwarded;
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim();
  return (req.socket?.remoteAddress ?? 'unknown').trim() || 'unknown';
}

/** Opt-in world-wide session listing (?scope=all). Off by default. */
export function isAuthSessionsListAllEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = (env.CAREER_AUTH_SESSIONS_LIST_ALL ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
}
