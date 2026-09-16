/**
 * Lab 24/7 world pulse for Postgres MP — advances economy wall-clock without
 * the Career UI host. Company mission settlement still happens on login.
 *
 * Uses a Postgres session advisory lock so two workers do not double-advance.
 * Prefer CAREER_HEADLESS_PULSE=0 on the UI host while this runs.
 */

import pg from 'pg';
import {
  CATCH_UP_LOCK_CHUNK_TICKS,
  CATCH_UP_PULSE_MS,
  CATCH_UP_TICKS_PER_PULSE,
  LOGIN_CATCH_UP_TICKS,
} from './career-clock.js';
import { ensureEconomyCaughtUpCooperative } from './career-economy.js';
import {
  careerDatabaseUrlFromEnv,
  openPostgresCareerStore,
  type PostgresCareerStore,
} from './career-store-postgres.js';
import {
  withPostgresReadyRetry,
} from './career-postgres-retry.js';
export { isTransientPostgresStartupError } from './career-postgres-retry.js';

/** Stable int4 key for pg_try_advisory_lock (skyline world pulse). */
export const CAREER_PG_WORLD_PULSE_LOCK_KEY = 87_201_401;

/** Default: wait up to ~90s for Postgres recovery / first accept. */
const DEFAULT_PG_READY_ATTEMPTS = 45;
const DEFAULT_PG_READY_DELAY_MS = 2_000;

type PulseLock = { client: pg.PoolClient; pool: pg.Pool };

export type PostgresWorldWorkerOpts = {
  databaseUrl?: string;
  /** Run a single burst then exit (tests / cron). */
  once?: boolean;
  pulseMs?: number;
  ticksPerPulse?: number;
  loginBurstTicks?: number;
  /** Injected clock for tests. */
  nowMs?: () => number;
  log?: (line: string) => void;
  /** Retries while Postgres is starting / in recovery (57P03). */
  pgReadyAttempts?: number;
  pgReadyDelayMs?: number;
};

function resolveUrl(explicit?: string): string {
  const url =
    explicit?.trim() || careerDatabaseUrlFromEnv(process.env) || '';
  if (!url) {
    throw new Error(
      'CAREER_DATABASE_URL or CAREER_PG=1 required for world worker',
    );
  }
  return url;
}

async function tryAcquirePulseLock(databaseUrl: string): Promise<PulseLock | null> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  let client: pg.PoolClient | null = null;
  try {
    client = await pool.connect();
    const res = await client.query<{ ok: boolean }>(
      `SELECT pg_try_advisory_lock($1) AS ok`,
      [CAREER_PG_WORLD_PULSE_LOCK_KEY],
    );
    if (!res.rows[0]?.ok) {
      client.release();
      client = null;
      await pool.end();
      return null;
    }
    return { client, pool };
  } catch (err) {
    if (client) {
      try {
        client.release();
      } catch {
        /* ignore */
      }
    }
    await pool.end().catch(() => undefined);
    throw err;
  }
}

async function releasePulseLock(lock: PulseLock): Promise<void> {
  try {
    await lock.client.query(`SELECT pg_advisory_unlock($1)`, [
      CAREER_PG_WORLD_PULSE_LOCK_KEY,
    ]);
  } finally {
    lock.client.release();
    await lock.pool.end();
  }
}

async function pulseOnce(
  store: PostgresCareerStore,
  ticks: number,
  nowMs: number,
  log: (line: string) => void,
): Promise<{ advancedTicks: number; tick: number }> {
  const loaded = await store.loadEconomy({ maxCatchUpTicks: 0 });
  let remaining = Math.max(1, Math.floor(ticks));
  let advancedTotal = 0;
  let world = loaded.world;
  const t0 = performance.now();
  while (remaining > 0) {
    const chunk = Math.min(CATCH_UP_LOCK_CHUNK_TICKS, remaining);
    const coop = await ensureEconomyCaughtUpCooperative(world, nowMs, {
      maxTicks: chunk,
    });
    world = coop.world;
    advancedTotal += coop.advancedTicks;
    remaining -= chunk;
    if (coop.advancedTicks === 0) break;
    if (remaining > 0) {
      await new Promise<void>((r) => setImmediate(r));
    }
  }
  if (advancedTotal > 0 || loaded.dirty) {
    await store.saveEconomy(world);
  }
  log(
    `[career:world:pg] pulse ticks=${advancedTotal} world.tick=${world.tick} ` +
      `${Math.round(performance.now() - t0)}ms`,
  );
  return { advancedTicks: advancedTotal, tick: world.tick };
}

/**
 * Run the Postgres world worker until stopped (SIGINT/SIGTERM) or `once`.
 * Holds the advisory lock for the process lifetime.
 */
export async function runPostgresWorldWorker(
  opts: PostgresWorldWorkerOpts = {},
): Promise<void> {
  const log = opts.log ?? ((line: string) => console.log(line));
  const url = resolveUrl(opts.databaseUrl);
  const pulseMs = opts.pulseMs ?? CATCH_UP_PULSE_MS;
  const ticksPerPulse = opts.ticksPerPulse ?? CATCH_UP_TICKS_PER_PULSE;
  const loginBurst = opts.loginBurstTicks ?? LOGIN_CATCH_UP_TICKS;
  const nowFn = opts.nowMs ?? (() => Date.now());
  const readyAttempts = Math.max(
    1,
    opts.pgReadyAttempts ?? DEFAULT_PG_READY_ATTEMPTS,
  );
  const readyDelayMs = Math.max(
    200,
    opts.pgReadyDelayMs ?? DEFAULT_PG_READY_DELAY_MS,
  );
  const retry = {
    attempts: readyAttempts,
    delayMs: readyDelayMs,
    log,
  };

  log(
    `[career:world:pg] opening ${url.replace(/:[^:@/]+@/, ':***@')}`,
  );

  const lock = await withPostgresReadyRetry(
    'advisory lock',
    () => tryAcquirePulseLock(url),
    retry,
  );
  if (!lock) {
    throw new Error(
      'world pulse advisory lock held by another process — stop the other worker or set CAREER_HEADLESS_PULSE=0 on the host',
    );
  }
  log(
    `[career:world:pg] advisory lock ${CAREER_PG_WORLD_PULSE_LOCK_KEY} acquired`,
  );

  const store = await withPostgresReadyRetry(
    'open store',
    () => openPostgresCareerStore(url),
    retry,
  );

  let stopped = false;
  const stop = () => {
    stopped = true;
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  try {
    await pulseOnce(store, loginBurst, nowFn(), log);
    if (opts.once) return;

    while (!stopped) {
      await new Promise<void>((r) => setTimeout(r, pulseMs));
      if (stopped) break;
      await pulseOnce(store, ticksPerPulse, nowFn(), log);
    }
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    store.close();
    await releasePulseLock(lock);
    log('[career:world:pg] stopped');
  }
}
