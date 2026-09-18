/**
 * Audit career-ui server API: company-scoped load/write missing companyId.
 * Run: node scripts/audit-companyid-endpoints.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(
  resolve(root, 'packages/career-ui/server/api.ts'),
  'utf8',
);
const lines = src.split(/\r?\n/);

/** World-only / auth / health — no company missions required. */
const SKIP_PATHS = [
  /^\/api\/health$/,
  /^\/api\/economy\/pulse$/,
  /^\/api\/hub-stats/,
  /^\/api\/world\//,
  /^\/api\/tick$/,
  /^\/api\/auth\//,
  /^\/api\/map\//,
  /^\/api\/companies$/, // list/create — own companyId handling
];

function findRouteAt(lineIdx) {
  for (let i = lineIdx; i >= 0; i--) {
    const m = lines[i].match(
      /if\s*\(\s*req\.method\s*===\s*'([A-Z]+)'\s*&&\s*path\s*===\s*'([^']+)'/,
    );
    if (m) return { method: m[1], path: m[2], defLine: i + 1 };
  }
  return null;
}

function handlerEnd(defLine0) {
  for (let i = defLine0 + 1; i < lines.length; i++) {
    if (/^\s{6}if\s*\(\s*req\.method\s*===\s*'/.test(lines[i])) return i;
  }
  return lines.length;
}

/** Extract opts object text after a withCareer*(fn, OPTS) call starting at line i. */
function extractTrailingOpts(startLine) {
  // Scan forward for `}, {` or `}, {` patterns after the arrow/fn — crude but works for this file.
  let depth = 0;
  let seenFnParen = false;
  let optsStart = -1;
  const joined = lines.slice(startLine, Math.min(startLine + 120, lines.length));
  let buf = '';
  for (let li = 0; li < joined.length; li++) {
    const line = joined[li];
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (!seenFnParen) {
        if (ch === '(') {
          depth++;
          if (depth === 1) seenFnParen = true;
        }
        continue;
      }
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) {
          // End of withCareer*(...)
          return buf;
        }
      }
      if (depth === 1 && optsStart < 0) {
        // Look for comma then `{` at depth 1 — second arg
        // Accumulate everything; we'll regex for companyId in the whole call.
        buf += ch;
      } else if (depth >= 1 && optsStart >= 0) {
        buf += ch;
      } else if (depth >= 1) {
        buf += ch;
      }
    }
    buf += '\n';
  }
  return buf;
}

function callHasCompanyId(startLine, kind) {
  if (kind === 'load') {
    const line = lines[startLine];
    if (/loadMissions\s*\(\s*\)/.test(line)) return false;
    if (/loadMissions\s*\(\s*\{\s*companyId/.test(line)) return true;
    if (/loadMissions\s*\(\s*companyOpts/.test(line)) return true;
    // multi-line
    const chunk = lines.slice(startLine, startLine + 6).join('\n');
    return /companyId/.test(chunk);
  }
  const callText = extractTrailingOpts(startLine);
  // Second argument object should mention companyId:
  // withCareerWrite(fn, { ..., companyId: x })
  // Match last `{...}` at paren depth roughly
  const optsMatch = callText.match(/,\s*\{([\s\S]*)\}\s*$/);
  if (optsMatch) {
    return /\bcompanyId\s*:/.test(optsMatch[1]);
  }
  // Single-arg withCareerRead(fn) — no opts
  return false;
}

const gaps = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // Skip comment-only lines (charter handler mentions withCareerWrite in a comment).
  const trimmed = line.trim();
  if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
  let kind = null;
  if (/withCareerWrite\s*\(/.test(line)) kind = 'write';
  else if (/withCareerRead\s*\(/.test(line)) kind = 'read';
  else if (/(?:await\s+)?loadMissions\s*\(/.test(line)) kind = 'load';
  if (!kind) continue;
  if (/async function (loadMissions|withCareerRead|withCareerWrite)/.test(line))
    continue;

  const route = findRouteAt(i);
  if (!route) continue;
  if (SKIP_PATHS.some((re) => re.test(route.path))) continue;

  const end = handlerEnd(route.defLine - 1);
  const handlerText = lines.slice(route.defLine - 1, end).join('\n');

  // Does the callback ignore missions? withCareerRead((world) => ...) only
  if (kind === 'read' || kind === 'write') {
    const slice = lines.slice(i, Math.min(i + 8, lines.length)).join('\n');
    const missionsParam =
      /\(\s*(?:world|_world|w)\s*,\s*missions/.test(slice) ||
      /\(\s*missions\s*\)/.test(slice);
    // withCareerWrite(() => ...) empty — rare
    if (!missionsParam && !/\(world,\s*missions\)/.test(slice)) {
      // Check if only world
      if (/\(\s*(?:world|_w|w)\s*\)\s*=>/.test(slice)) continue;
    }
  }

  const ok = callHasCompanyId(i, kind);
  if (ok) continue;

  gaps.push({
    line: i + 1,
    method: route.method,
    path: route.path,
    defLine: route.defLine,
    kind,
    hasFromRequest: /companyIdFromRequest\s*\(/.test(handlerText),
    snippet: line.trim().slice(0, 110),
  });
}

const byRoute = new Map();
for (const g of gaps) {
  const key = `${g.method} ${g.path}`;
  if (!byRoute.has(key)) byRoute.set(key, []);
  byRoute.get(key).push(g);
}

/** Priority: player-facing MP desks that already bit us or same mold. */
const HIGH = [
  '/api/charters',
  '/api/base/',
  '/api/ports',
  '/api/warehouses',
  '/api/demand',
  '/api/ground-staff',
  '/api/crew',
  '/api/credit',
  '/api/pilot',
  '/api/cargo-limit',
];

function priority(path) {
  if (HIGH.some((p) => path.startsWith(p) || path === p)) return 0;
  if (path.startsWith('/api/dev') || path.startsWith('/api/debug')) return 2;
  return 1;
}

const keys = [...byRoute.keys()].sort((a, b) => {
  const pa = priority(a.split(' ')[1]);
  const pb = priority(b.split(' ')[1]);
  if (pa !== pb) return pa - pb;
  return a.localeCompare(b);
});

console.log('=== MISSING companyId on company-scoped calls ===\n');
let high = 0;
let mid = 0;
let low = 0;
for (const key of keys) {
  const [method, path] = key.split(' ');
  const pr = priority(path);
  const tag = pr === 0 ? 'HIGH' : pr === 2 ? 'DEV' : 'MID';
  if (pr === 0) high++;
  else if (pr === 2) low++;
  else mid++;
  const gs = byRoute.get(key);
  console.log(`[${tag}] ${key}  (~L${gs[0].defLine})`);
  for (const g of gs) {
    console.log(
      `  L${g.line} ${g.kind}${g.hasFromRequest ? '' : ' · no companyIdFromRequest'}`,
    );
  }
  console.log('');
}
console.log(
  `Routes: ${keys.length}  (HIGH ${high} · MID ${mid} · DEV ${low})  call-sites ${gaps.length}`,
);
