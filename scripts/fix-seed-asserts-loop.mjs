/**
 * Iteratively strip densify ICAOs that fail catalog asserts, then recount seed.
 * Usage: node scripts/fix-seed-asserts-loop.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'packages', 'shared', 'src');
const SHARED = path.join(ROOT, 'packages', 'shared');

  const EXTRA = [
  'WIMK', 'WRRR', 'WIDD', 'WAJJ', 'WAMM',
  'VOGA', 'VIDD', 'VOBG', 'VOHY', 'VOML',
  'ZUTF', 'ZBTJ', 'ZLSN', 'ZBAD',
  'RJGG', 'RJOO', 'RJNN', 'ROAH',
  'YSBK', 'YMEN', 'YMAV',
  'GOBD', 'FADN', 'FNUB', 'HSSJ', 'HSSS', 'HLLT', 'UTBK', 'URRR',
  'RPML', 'RPLB', 'RPVP', 'RKSS', 'RKJB', 'RCQC', 'NZQN', 'NZDN',
];

function stripIcao(icao) {
  let removed = 0;
  for (const f of fs.readdirSync(SRC)) {
    if (!f.endsWith('-hubs-densify.ts')) continue;
    const p = path.join(SRC, f);
    let txt = fs.readFileSync(p, 'utf8');
    const re = new RegExp(
      `\\s*\\{\\s*icao: '${icao}',[\\s\\S]*?consume: \\{[\\s\\S]*?\\},\\s*\\},`,
      'g',
    );
    const next = txt.replace(re, () => {
      removed += 1;
      return '';
    });
    if (next !== txt) fs.writeFileSync(p, next);
  }
  return removed;
}

function build() {
  const r = spawnSync('npm', ['run', 'build'], { cwd: SHARED, shell: true, encoding: 'utf8' });
  return r.status === 0;
}

function trySeed() {
  const r = spawnSync('node', ['scripts/count-seed.mjs'], {
    cwd: ROOT,
    shell: true,
    encoding: 'utf8',
  });
  return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || '') };
}

// Pre-strip known bad
for (const icao of EXTRA) stripIcao(icao);

for (let i = 0; i < 40; i += 1) {
  if (!build()) {
    console.error('build failed');
    process.exit(1);
  }
  const { ok, out } = trySeed();
  if (ok) {
    console.log(out.trim());
    process.exit(0);
  }
  console.log('--- attempt', i + 1, '---');
  console.log(out.split('\n').filter((l) => /Error:|must not|SEED_COUNT/.test(l)).slice(0, 8).join('\n'));
  const icaos = new Set();
  for (const m of out.matchAll(/\b([A-Z]{4})\b/g)) {
    const x = m[1];
    if (['Error', 'SEED', 'CAREER', 'HUBS', 'COUNT', 'MAJOR'].includes(x)) continue;
    if (/^[A-Z]{4}$/.test(x)) icaos.add(x);
  }
  // Prefer ICAOs mentioned near "must not"
  const near = [...out.matchAll(/must not[^\n]*/g)].flatMap((m) =>
    [...m[0].matchAll(/\b([A-Z]{4})\b/g)].map((x) => x[1]),
  );
  const targets = near.length ? near : [...icaos].slice(0, 8);
  let stripped = 0;
  for (const icao of targets) {
    if (icao.length !== 4) continue;
    stripped += stripIcao(icao);
  }
  console.log('stripped', stripped, 'from', targets.join(','));
  if (!stripped) {
    // Fallback: parse SEED_FAIL message words and strip matching densify ICAOs by name
    const fail = out.match(/SEED_FAIL ([^\n]+)/)?.[1] ?? '';
    const densifyFiles = fs.readdirSync(SRC).filter((f) => f.endsWith('-hubs-densify.ts'));
    let byName = 0;
    for (const word of fail.split(/[^A-Za-z0-9]+/).filter((w) => w.length >= 4)) {
      for (const f of densifyFiles) {
        const p = path.join(SRC, f);
        let txt = fs.readFileSync(p, 'utf8');
        const nameRe = new RegExp(
          `\\s*\\{\\s*icao: '([A-Z0-9]+)',\\s*name: "[^"]*${word}[^"]*",[\\s\\S]*?consume: \\{[\\s\\S]*?\\},\\s*\\},`,
          'gi',
        );
        const next = txt.replace(nameRe, () => {
          byName += 1;
          return '';
        });
        if (next !== txt) fs.writeFileSync(p, next);
      }
    }
    console.log('name-strip', byName, 'for', fail);
    if (!byName) {
      console.error('could not strip offending ICAOs');
      process.exit(1);
    }
  }
}
console.error('too many attempts');
process.exit(1);
