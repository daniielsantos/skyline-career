/**
 * Env helpers for CAREER_DATABASE_URL / CAREER_PG — no `pg` import.
 * Desktop SP packs omit `pg`; keep these sync helpers free of that dependency.
 */

export const DEFAULT_CAREER_DATABASE_URL =
  'postgres://skyline:skyline@127.0.0.1:5432/skyline';

export const DEFAULT_CAREER_TEST_DATABASE_URL =
  'postgres://skyline:skyline@127.0.0.1:5432/skyline_test';

export function careerDatabaseUrlFromEnv(
  env: NodeJS.Dict<string> | Record<string, string | undefined> = process.env,
): string | null {
  const url = (env.CAREER_DATABASE_URL ?? '').trim();
  if (url) return url;
  const flag = (env.CAREER_PG ?? '').trim().toLowerCase();
  if (flag === '1' || flag === 'true' || flag === 'on' || flag === 'yes') {
    return DEFAULT_CAREER_DATABASE_URL;
  }
  return null;
}

/** Prefer isolated test DB — never default to live lab `skyline`. */
export function careerTestDatabaseUrlFromEnv(
  env: NodeJS.Dict<string> | Record<string, string | undefined> = process.env,
): string | null {
  const testUrl = (env.CAREER_DATABASE_URL_TEST ?? '').trim();
  if (testUrl) return testUrl;
  const flag = (env.CAREER_PG_TEST ?? '').trim().toLowerCase();
  if (flag === '1' || flag === 'true' || flag === 'on' || flag === 'yes') {
    return DEFAULT_CAREER_TEST_DATABASE_URL;
  }
  return null;
}

/** True when URL path/db name looks like the live lab database. */
export function isCareerLabDatabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const db = (parsed.pathname.replace(/^\//, '') || '').trim().toLowerCase();
    return db === 'skyline';
  } catch {
    return /\/skyline(?:\?|$)/i.test(url) && !/skyline_test/i.test(url);
  }
}
