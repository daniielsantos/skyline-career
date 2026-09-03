/**
 * Strip densify ICAOs forbidden by catalog asserts.
 * Usage: node scripts/sanitize-densify-forbidden.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'shared', 'src');

/** ICAOs known-forbidden by assert*CareerHubCatalog. */
const FORBIDDEN = new Set([
  // IN
  'VOGA', 'VIDD', 'VOBG', 'VOHY', 'VOML',
  // CN
  'ZUTF', 'ZBTJ', 'ZLSN', 'ZBAD',
  // JP — Centrair / Itami / Komaki / Naha
  'RJGG', 'RJOO', 'RJNN', 'ROAH', 'RJNA',
  // AU
  'YSBK', 'YMEN', 'YMAV',
  // others commonly blocked
  'URRR', 'UTBK', 'GOBD', 'FADN', 'FNUB', 'HSSJ', 'HSSS', 'HLLT',
]);

function stripFile(file) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) return 0;
  let txt = fs.readFileSync(p, 'utf8');
  let removed = 0;
  for (const icao of FORBIDDEN) {
    const re = new RegExp(
      `\\s*\\{\\s*icao: '${icao}',[\\s\\S]*?consume: \\{[\\s\\S]*?\\},\\s*\\},`,
      'g',
    );
    const next = txt.replace(re, () => {
      removed += 1;
      return '';
    });
    txt = next;
  }
  if (removed) fs.writeFileSync(p, txt);
  return removed;
}

let total = 0;
for (const f of fs.readdirSync(ROOT)) {
  if (!f.endsWith('-hubs-densify.ts')) continue;
  const n = stripFile(f);
  if (n) {
    console.log(f, 'removed', n);
    total += n;
  }
}
console.log('total removed', total);
