/**
 * Canonical casing for public labels (account display, company, pilot callsign).
 * login_name stays lowercase [a-z0-9_] elsewhere — not handled here.
 */

export const ACCOUNT_DISPLAY_NAME_MIN = 2;
export const ACCOUNT_DISPLAY_NAME_MAX = 48;
export const COMPANY_DISPLAY_NAME_MAX = 64;

/** Title-case one whitespace-delimited token; also splits on - and '. */
export function titleCaseDisplayWord(word: string): string {
  if (!word) return word;
  return word
    .split(/([-'])/g)
    .map((part) => {
      if (part === '-' || part === "'") return part;
      if (!part) return part;
      return (
        part.charAt(0).toLocaleUpperCase('en-US') +
        part.slice(1).toLocaleLowerCase('en-US')
      );
    })
    .join('');
}

/** Trim, collapse spaces, Title Case each word. Empty → ''. */
export function formatDisplayLabel(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(titleCaseDisplayWord)
    .join(' ');
}

export function normalizeAccountDisplayName(raw: string): string {
  const formatted = formatDisplayLabel(raw);
  if (
    formatted.length < ACCOUNT_DISPLAY_NAME_MIN ||
    formatted.length > ACCOUNT_DISPLAY_NAME_MAX
  ) {
    throw new Error('display name must be 2–48 characters');
  }
  return formatted;
}

/**
 * Company / airline label. Empty throws when `required` (VA publish).
 * Soft path (ensureCompany) may pass through empty via caller.
 */
export function normalizeCompanyDisplayName(
  raw: string,
  opts: { maxLen?: number; required?: boolean } = {},
): string {
  const maxLen = opts.maxLen ?? COMPANY_DISPLAY_NAME_MAX;
  const formatted = formatDisplayLabel(raw);
  if (!formatted) {
    if (opts.required !== false) throw new Error('displayName required');
    return '';
  }
  if (formatted.length > maxLen) throw new Error('displayName too long');
  return formatted;
}

const TITLECASE_META_KEY = 'display_name_titlecase_v1';

/** One-shot rewrite of accounts/companies display_name to Title Case (SQLite). */
export function ensureDisplayNameTitleCaseSqlite(db: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prepare: (sql: string) => any;
}): number {
  try {
    const flag = db
      .prepare(`SELECT value FROM meta WHERE key = ?`)
      .get(TITLECASE_META_KEY) as { value: string } | undefined;
    if (flag?.value === '1') return 0;
  } catch {
    return 0;
  }

  let changed = 0;
  try {
    const accounts = db
      .prepare(`SELECT id, display_name FROM accounts`)
      .all() as { id: string; display_name: string }[];
    const updA = db.prepare(`UPDATE accounts SET display_name = ? WHERE id = ?`);
    for (const row of accounts) {
      const next = formatDisplayLabel(row.display_name ?? '').slice(
        0,
        ACCOUNT_DISPLAY_NAME_MAX,
      );
      if (
        next.length >= ACCOUNT_DISPLAY_NAME_MIN &&
        next !== row.display_name
      ) {
        updA.run(next, row.id);
        changed += 1;
      }
    }
  } catch {
    /* accounts table may not exist yet */
  }
  try {
    const companies = db
      .prepare(`SELECT id, display_name FROM companies`)
      .all() as { id: string; display_name: string }[];
    const updC = db.prepare(`UPDATE companies SET display_name = ? WHERE id = ?`);
    for (const row of companies) {
      const next = formatDisplayLabel(row.display_name ?? '').slice(
        0,
        COMPANY_DISPLAY_NAME_MAX,
      );
      if (next && next !== row.display_name) {
        updC.run(next, row.id);
        changed += 1;
      }
    }
  } catch {
    /* companies table may not exist yet */
  }

  try {
    db.prepare(
      `INSERT INTO meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(TITLECASE_META_KEY, '1');
  } catch {
    try {
      db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`).run(
        TITLECASE_META_KEY,
        '1',
      );
    } catch {
      /* ignore */
    }
  }
  return changed;
}

/** One-shot rewrite for Postgres accounts/companies display_name. */
export async function ensureDisplayNameTitleCasePg(pool: {
  query: (
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[] }>;
}): Promise<number> {
  try {
    const flag = await pool.query(`SELECT value FROM meta WHERE key = $1`, [
      TITLECASE_META_KEY,
    ]);
    if (flag.rows[0]?.value === '1') return 0;
  } catch {
    return 0;
  }

  let changed = 0;
  try {
    const accounts = await pool.query(`SELECT id, display_name FROM accounts`);
    for (const row of accounts.rows) {
      const id = String(row.id ?? '');
      const prev = String(row.display_name ?? '');
      const next = formatDisplayLabel(prev).slice(0, ACCOUNT_DISPLAY_NAME_MAX);
      if (
        id &&
        next.length >= ACCOUNT_DISPLAY_NAME_MIN &&
        next !== prev
      ) {
        await pool.query(`UPDATE accounts SET display_name = $1 WHERE id = $2`, [
          next,
          id,
        ]);
        changed += 1;
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const companies = await pool.query(`SELECT id, display_name FROM companies`);
    for (const row of companies.rows) {
      const id = String(row.id ?? '');
      const prev = String(row.display_name ?? '');
      const next = formatDisplayLabel(prev).slice(0, COMPANY_DISPLAY_NAME_MAX);
      if (id && next && next !== prev) {
        await pool.query(`UPDATE companies SET display_name = $1 WHERE id = $2`, [
          next,
          id,
        ]);
        changed += 1;
      }
    }
  } catch {
    /* ignore */
  }

  try {
    await pool.query(
      `INSERT INTO meta (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [TITLECASE_META_KEY, '1'],
    );
  } catch {
    /* ignore */
  }
  return changed;
}
