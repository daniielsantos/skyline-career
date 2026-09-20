#!/usr/bin/env node
/**
 * Mint / revoke one-time MP product access keys.
 *
 * Usage:
 *   npm run career:access-keys -- mint --count 50 [--out keys.csv] [--batch id]
 *   npm run career:access-keys -- revoke --key XXXX-XXXX-XXXX-XXXX
 *
 * Store: CAREER_DATABASE_URL / DATABASE_URL → Postgres (prod world).
 * Or CAREER_DIR + sqlite for local lab.
 */
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openCareerStore } from '@msfs-compat/shared';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function usage() {
  console.log(`Usage:
  npm run career:access-keys -- mint --count N [--out path.csv] [--batch id]
  npm run career:access-keys -- revoke --key XXXX-XXXX-XXXX-XXXX

Env:
  CAREER_DATABASE_URL or DATABASE_URL  Postgres world (preferred)
  CAREER_DIR                           SQLite career dir (lab fallback)
`);
}

function parseArgs(argv) {
  const cmd = argv[0];
  const flags = {
    count: 10,
    out: null,
    batch: null,
    key: null,
  };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--count') flags.count = Number(argv[++i]);
    else if (a === '--out') flags.out = argv[++i];
    else if (a === '--batch') flags.batch = argv[++i];
    else if (a === '--key') flags.key = argv[++i];
    else if (a === '--help' || a === '-h') flags.help = true;
    else throw new Error(`Unknown arg: ${a}`);
  }
  return { cmd, flags };
}

async function openStore() {
  const databaseUrl =
    process.env.CAREER_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    '';
  if (databaseUrl) {
    return openCareerStore({
      backend: 'postgres',
      connectionString: databaseUrl,
      careerDir: process.env.CAREER_DIR?.trim() || resolve(root, 'profiles', 'career'),
    });
  }
  const careerDir =
    process.env.CAREER_DIR?.trim() || resolve(root, 'profiles', 'career');
  console.warn(
    `[access-keys] no DATABASE_URL — using SQLite at ${careerDir}`,
  );
  return openCareerStore({ backend: 'sqlite', careerDir });
}

async function main() {
  const { cmd, flags } = parseArgs(process.argv.slice(2));
  if (!cmd || flags.help || cmd === 'help') {
    usage();
    process.exit(cmd ? 0 : 1);
  }

  const store = await openStore();
  try {
    if (cmd === 'mint') {
      const minted = await Promise.resolve(
        store.mintAccessKeys({
          count: flags.count,
          batchId: flags.batch ?? undefined,
        }),
      );
      const lines = [
        'key,batch_id,created_at_ms',
        ...minted.map(
          (m) => `${m.key},${m.batchId},${m.createdAtMs}`,
        ),
      ];
      const csv = `${lines.join('\n')}\n`;
      if (flags.out) {
        const outPath = resolve(flags.out);
        await writeFile(outPath, csv, 'utf8');
        console.log(
          `[access-keys] minted ${minted.length} → ${outPath} (batch ${minted[0]?.batchId ?? ''})`,
        );
      } else {
        process.stdout.write(csv);
      }
      return;
    }

    if (cmd === 'revoke') {
      if (!flags.key?.trim()) {
        throw new Error('--key required for revoke');
      }
      const ok = await Promise.resolve(
        store.revokeAccessKey({ code: flags.key }),
      );
      if (!ok) {
        console.error('[access-keys] revoke failed (unknown or already revoked)');
        process.exit(2);
      }
      console.log('[access-keys] revoked');
      return;
    }

    throw new Error(`Unknown command: ${cmd}`);
  } finally {
    store.close?.();
  }
}

main().catch((err) => {
  console.error(
    '[access-keys] FAILED',
    err instanceof Error ? err.message || String(err) : err,
  );
  process.exit(1);
});
