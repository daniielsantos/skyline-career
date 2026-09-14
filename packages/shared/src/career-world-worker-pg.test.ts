/**
 * Postgres world worker smoke (skipped when CAREER_PG / DATABASE unreachable).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CAREER_PG_WORLD_PULSE_LOCK_KEY,
  runPostgresWorldWorker,
} from './career-world-worker-pg.js';
import { careerDatabaseUrlFromEnv } from './career-store-postgres.js';

describe('career world worker postgres', () => {
  it('exports a stable advisory lock key', () => {
    assert.equal(CAREER_PG_WORLD_PULSE_LOCK_KEY, 87_201_401);
  });

  it('runs a single --once pulse when Postgres is up', async (t) => {
    const url =
      process.env.CAREER_DATABASE_URL?.trim() ||
      careerDatabaseUrlFromEnv({ CAREER_PG: '1' });
    if (!url) {
      t.skip('no CAREER_DATABASE_URL');
      return;
    }
    const lines: string[] = [];
    try {
      await runPostgresWorldWorker({
        databaseUrl: url,
        once: true,
        loginBurstTicks: 2,
        log: (line) => lines.push(line),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        /ECONNREFUSED|unreachable|connect|advisory lock held/i.test(msg) ||
        msg.includes('password authentication')
      ) {
        t.skip(`postgres unreachable or lock busy: ${msg}`);
        return;
      }
      throw err;
    }
    assert.ok(
      lines.some((l) => l.includes('pulse ticks=')),
      `expected pulse log, got: ${lines.join(' | ')}`,
    );
  });
});
