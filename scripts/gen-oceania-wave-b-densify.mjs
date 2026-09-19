/**
 * Oceania densify Wave B — +40 → OC ~150 (seed 2328→2368).
 * Usage: node scripts/gen-oceania-wave-b-densify.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'packages', 'shared', 'src');
const OA = path.join(
  ROOT,
  'packages',
  'shared',
  '.cache',
  'ourairports',
  'airports.csv',
);
const ART = path.join(ROOT, 'artifacts');

const FORBIDDEN = new Set([
  'YMAV',
  'YSBK',
  'YMEN',
  'NZQN',
  'NZDN',
  'AYNZ',
  'WAJJ',
  'NFSF',
  'NWWM',
  'NGTU',
  'YSSY',
  'YMML',
  'YBBN',
  'YPPH',
  'YPDN',
  'YMHB',
  'NZAA',
  'NZWN',
  'AYPY',
  'NFFN',
  'NWWW',
  'NTAA',
  'NTTB',
  'NVVV',
  'NVSS',
  'NGTA',
  'PLCH',
  'AGGH',
  'AGGM',
  'NSFA',
  'NSAU',
  'NFTF',
  'NFTV',
  'NCRG',
  'NCAI',
]);

/** AU+15 PG+7 NZ+6 PF+6 NC+3 KI+1 TO+1 = 39; +1 AU redirect if needed → 40 */
const QUOTAS = {
  au: 15,
  pg: 7,
  nz: 6,
  pf: 6,
  nc: 3,
  ki: 1,
  to: 1,
};

const ISO = {
  au: 'AU',
  pg: 'PG',
  nz: 'NZ',
  pf: 'PF',
  nc: 'NC',
  ki: 'KI',
  to: 'TO',
};

const DEFAULT_REGION = {
  au: 'AU-E',
  pg: 'PG-S',
  nz: 'NZ-N',
  pf: 'PF-I',
  nc: 'NC-S',
  ki: 'KI-L',
  to: 'TO-T',
};

const REGION_TYPE = {
  au: 'AuCareerRegion',
  pg: 'PgCareerRegion',
  nz: 'NzCareerRegion',
  pf: 'PfCareerRegion',
  nc: 'NcCareerRegion',
  ki: 'KiCareerRegion',
  to: 'ToCareerRegion',
};

const CREATE_DENSIFY = new Set(['to']);

const PREFERRED = {
  au: [
    ['YBTI', 'AU-NT', 'city'],
    ['YBTR', 'AU-Q', 'city'],
    ['YCCA', 'AU-E', 'city'],
    ['YCCY', 'AU-Q', 'city'],
    ['YCDU', 'AU-S', 'city'],
    ['YCEE', 'AU-S', 'city'],
    ['YCFS', 'AU-E', 'city'],
    ['YCKN', 'AU-Q', 'city'],
    ['YCMT', 'AU-Q', 'city'],
    ['YCMU', 'AU-Q', 'city'],
    ['YCNM', 'AU-E', 'city'],
    ['YCOE', 'AU-Q', 'city'],
    ['YCOM', 'AU-E', 'city'],
    ['YCOR', 'AU-E', 'city'],
    ['YCRG', 'AU-Q', 'city'],
    ['YCIN', 'AU-W', 'city'],
    ['YCTM', 'AU-E', 'city'],
  ],
  pg: [
    ['AYWD', 'PG-S', 'city'],
    ['AYBA', 'PG-S', 'drySpoke'],
    ['AYBK', 'PG-S', 'drySpoke'],
    ['AYBM', 'PG-S', 'drySpoke'],
    ['AYCH', 'PG-S', 'city'],
    ['AYDU', 'PG-S', 'city'],
    ['AYGR', 'PG-S', 'city'],
  ],
  nz: [
    ['NZTU', 'NZ-S', 'city'],
    ['NZWB', 'NZ-S', 'city'],
    ['NZWF', 'NZ-S', 'tourism'],
    ['NZWK', 'NZ-N', 'city'],
    ['NZWS', 'NZ-S', 'city'],
    ['NZWU', 'NZ-N', 'city'],
    ['NZMO', 'NZ-S', 'tourism'],
    ['NZOU', 'NZ-S', 'city'],
  ],
  pf: [
    ['NTAR', 'PF-I', 'tourism'],
    ['NTAT', 'PF-I', 'tourism'],
    ['NTHE', 'PF-I', 'tourism'],
    ['NTGA', 'PF-I', 'tourism'],
    ['NTGB', 'PF-I', 'tourism'],
    ['NTGC', 'PF-I', 'tourism'],
    ['NTGE', 'PF-I', 'tourism'],
    ['NTGF', 'PF-I', 'tourism'],
  ],
  nc: [
    ['NWWR', 'NC-S', 'city'],
    ['NWWU', 'NC-S', 'city'],
    ['NWWV', 'NC-S', 'city'],
    ['NWWA', 'NC-S', 'city'],
    ['NWWD', 'NC-S', 'tourism'],
  ],
  ki: [['PCIS', 'KI-L', 'drySpoke']],
  to: [
    ['NFTL', 'TO-T', 'city'],
  ],
};

const BIAS = {
  drySpoke: {
    produce: { general: 1.1, supplies: 1.0, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  industrial: {
    produce: { machinery: 1.25, electronics: 1.15, general: 1.15 },
    consume: { perishables: 1.05, supplies: 1.0 },
  },
  agro: {
    produce: { perishables: 1.35, general: 1.1, supplies: 1.0 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  city: {
    produce: { general: 1.2, electronics: 1.1, supplies: 1.0 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  tourism: {
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1.0, machinery: 0.85 },
  },
};

const MARKER = 'Wave B Oceania densify';

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function loadOurAirports() {
  const text = fs.readFileSync(OA, 'utf8');
  const lines = text.split(/\r?\n/);
  const header = parseCsvLine(lines[0]);
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const byIcao = new Map();
  const byCountry = new Map();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = parseCsvLine(line);
    const icao = (cols[idx.ident] || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(icao)) continue;
    const type = cols[idx.type] || '';
    if (type !== 'medium_airport' && type !== 'large_airport') continue;
    const lat = Number(cols[idx.latitude_deg]);
    const lon = Number(cols[idx.longitude_deg]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (Math.abs(lat) < 0.01 && Math.abs(lon) < 0.01) continue;
    const country = (cols[idx.iso_country] || '').trim().toUpperCase();
    const name = (cols[idx.name] || icao).replace(/\s+/g, ' ').trim();
    byIcao.set(icao, { name, lat, lon, type, country });
    if (!byCountry.has(country)) byCountry.set(country, []);
    byCountry.get(country).push(icao);
  }
  return { byIcao, byCountry };
}

function existingIcaos() {
  const set = new Set();
  for (const f of fs.readdirSync(SRC)) {
    if (!/^career-.*-hubs.*\.ts$/.test(f)) continue;
    let text = fs.readFileSync(path.join(SRC, f), 'utf8');
    if (text.includes(MARKER)) {
      const i = text.indexOf(`\n  // ${MARKER}`);
      if (i >= 0) {
        const j = text.indexOf('\n];', i);
        if (j >= 0) text = text.slice(0, i) + text.slice(j);
      } else {
        const cc = f.match(/^career-([a-z]{2})-hubs-densify\.ts$/)?.[1];
        if (cc && CREATE_DENSIFY.has(cc) && text.includes(MARKER)) continue;
      }
    }
    for (const m of text.matchAll(/icao: '([A-Z0-9]{4})'/g)) set.add(m[1]);
  }
  return set;
}

function formatBias(kind) {
  const b = BIAS[kind] || BIAS.drySpoke;
  const prod = Object.entries(b.produce)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  const cons = Object.entries(b.consume)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  return { prod, cons };
}

function formatHub(h) {
  const { prod, cons } = formatBias(h.kind);
  return `  {
    icao: '${h.icao}',
    name: ${JSON.stringify(h.name)},
    region: '${h.region}',
    hubTier: 'spoke',
    lat: ${Number(h.lat.toFixed(5))},
    lon: ${Number(h.lon.toFixed(5))},
    produce: { ${prod} },
    consume: { ${cons} },
  },`;
}

function isLetterIcao(icao) {
  return /^[A-Z]{4}$/.test(icao);
}

function commercialScore(oa) {
  const name = oa.name || '';
  let score = 0;
  if (/international/i.test(name)) score += 3;
  if (/airport/i.test(name)) score += 1;
  if (oa.type === 'large_airport') score += 2;
  if (/air ?base|afb|military|airfield|heliport|airstrip|inactive/i.test(name))
    score -= 5;
  return score;
}

function rankedPool(byIcao, byCountry, cc, usedLocal) {
  return (byCountry.get(ISO[cc]) || [])
    .filter((icao) => {
      if (!isLetterIcao(icao)) return false;
      if (FORBIDDEN.has(icao) || usedLocal.has(icao)) return false;
      const oa = byIcao.get(icao);
      if (!oa) return false;
      return commercialScore(oa) >= 1;
    })
    .sort((a, b) => {
      const sa = commercialScore(byIcao.get(a));
      const sb = commercialScore(byIcao.get(b));
      return sb - sa || a.localeCompare(b);
    });
}

function pickHubs(byIcao, byCountry, used) {
  const pickedAll = {};
  let total = 0;
  for (const cc of Object.keys(QUOTAS)) {
    const want = QUOTAS[cc];
    const out = [];
    const usedLocal = new Set(used);

    for (const [icao, region, kind] of PREFERRED[cc] || []) {
      if (out.length >= want) break;
      if (!isLetterIcao(icao)) continue;
      if (FORBIDDEN.has(icao) || usedLocal.has(icao)) continue;
      const oa = byIcao.get(icao);
      if (!oa) {
        console.warn(`[oceaniaB] skip ${icao}: not OA medium/large`);
        continue;
      }
      out.push({
        icao,
        name: oa.name,
        region,
        lat: oa.lat,
        lon: oa.lon,
        kind,
      });
      usedLocal.add(icao);
    }

    for (const icao of rankedPool(byIcao, byCountry, cc, usedLocal)) {
      if (out.length >= want) break;
      const oa = byIcao.get(icao);
      const score = commercialScore(oa);
      const kind =
        score >= 4 ? 'city' : score >= 3 ? 'industrial' : 'drySpoke';
      out.push({
        icao,
        name: oa.name,
        region: DEFAULT_REGION[cc],
        lat: oa.lat,
        lon: oa.lon,
        kind,
      });
      usedLocal.add(icao);
    }

    if (out.length < want) {
      console.warn(`[oceaniaB] ${cc}: only ${out.length}/${want}`);
    }
    pickedAll[cc] = out;
    for (const h of out) used.add(h.icao);
    total += out.length;
  }

  let short = Object.values(QUOTAS).reduce((a, b) => a + b, 0) - total;
  // Target +40: quotas sum 39; fill remainder + any shortfall via AU
  const wantTotal = 40;
  short = wantTotal - total;
  if (short > 0) {
    console.log(`[oceaniaB] shortfall/fill ${short} → AU redirect`);
    while (short > 0) {
      const have = new Set([...used, ...pickedAll.au.map((h) => h.icao)]);
      const next = rankedPool(byIcao, byCountry, 'au', have)[0];
      if (!next) break;
      const oa = byIcao.get(next);
      pickedAll.au.push({
        icao: next,
        name: oa.name,
        region: DEFAULT_REGION.au,
        lat: oa.lat,
        lon: oa.lon,
        kind: 'city',
      });
      used.add(next);
      short--;
      total++;
    }
  }
  return { pickedAll, total };
}

function pascal(cc) {
  return cc.charAt(0).toUpperCase() + cc.slice(1);
}

function createDensifyFile(cc, hubs) {
  const file = path.join(SRC, `career-${cc}-hubs-densify.ts`);
  const Pascal = pascal(cc);
  const CC = cc.toUpperCase();
  const regionType = REGION_TYPE[cc];
  const body = `/**
 * ${Pascal} densify Wave B Oceania — commercial spokes (MSFS + SimBrief).
 * Merged into ${CC}_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { ${regionType} } from './career-${cc}-hubs.js';

type ${Pascal}DensifyHub = {
  icao: string;
  name: string;
  region: ${regionType};
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** ${MARKER} (+${hubs.length}). */
export const ${CC}_DENSIFY_HUBS: readonly ${Pascal}DensifyHub[] = [
${hubs.map(formatHub).join('\n')}
];

export const ${CC}_DENSIFY_HUB_COUNT = ${CC}_DENSIFY_HUBS.length;
`;
  fs.writeFileSync(file, body);
  console.log(`[oceaniaB] created career-${cc}-hubs-densify.ts (+${hubs.length})`);
}

function wireDensify(cc) {
  const file = path.join(SRC, `career-${cc}-hubs.ts`);
  let text = fs.readFileSync(file, 'utf8');
  const CC = cc.toUpperCase();
  if (!text.includes(`${CC}_DENSIFY_HUBS`)) {
    const lastImport = [...text.matchAll(/^import .+;$/gm)].pop();
    if (!lastImport) throw new Error(`No import in ${cc} hubs`);
    const at = lastImport.index + lastImport[0].length;
    text = `${text.slice(0, at)}
import { ${CC}_DENSIFY_HUBS, ${CC}_DENSIFY_HUB_COUNT } from './career-${cc}-hubs-densify.js';${text.slice(at)}`;
  }
  if (!text.includes(`...${CC}_DENSIFY_HUBS`)) {
    const re = new RegExp(
      `(export const ${CC}_CAREER_HUBS[\\s\\S]*?)(\\n\\];)`,
    );
    text = text.replace(re, (_, body, close) => {
      const trimmed = body.replace(/,(\s*)$/, '$1');
      return `${trimmed},\n  ...${CC}_DENSIFY_HUBS${close}`;
    });
  }
  const countLine = text.match(
    new RegExp(`export const ${CC}_CAREER_HUB_COUNT = [^;]+;`),
  );
  if (countLine && !countLine[0].includes('DENSIFY_HUB_COUNT')) {
    text = text.replace(
      new RegExp(`export const ${CC}_CAREER_HUB_COUNT = (\\d+);`),
      `export const ${CC}_CAREER_HUB_COUNT = $1 + ${CC}_DENSIFY_HUB_COUNT;`,
    );
  }
  fs.writeFileSync(file, text);
  console.log(`[oceaniaB] wired career-${cc}-hubs.ts`);
}

function writeAppendDensify(cc, hubs) {
  if (CREATE_DENSIFY.has(cc)) {
    const file = path.join(SRC, `career-${cc}-hubs-densify.ts`);
    if (!fs.existsSync(file)) {
      createDensifyFile(cc, hubs);
      wireDensify(cc);
      return;
    }
  }

  const file = path.join(SRC, `career-${cc}-hubs-densify.ts`);
  if (!fs.existsSync(file)) {
    createDensifyFile(cc, hubs);
    wireDensify(cc);
    return;
  }

  let text = fs.readFileSync(file, 'utf8');
  if (text.includes(MARKER)) {
    const i = text.indexOf(`\n  // ${MARKER}`);
    const j = text.indexOf('\n];', i);
    if (i >= 0 && j >= 0) {
      text = text.slice(0, i) + text.slice(j);
      console.log(`[oceaniaB] ${cc}: stripped prior ${MARKER} block`);
    } else if (CREATE_DENSIFY.has(cc) && text.includes(`/** ${MARKER}`)) {
      createDensifyFile(cc, hubs);
      wireDensify(cc);
      return;
    } else {
      console.warn(`[oceaniaB] ${cc}: ${MARKER} present — skip`);
      return;
    }
  }

  const CC = cc.toUpperCase();
  const countRe = new RegExp(
    `\\];\\s*\\n\\s*export const ${CC}_DENSIFY_HUB_COUNT`,
  );
  const m = text.match(countRe);
  const insertAt =
    m && m.index != null ? m.index : text.lastIndexOf('\n];');
  if (insertAt < 0) throw new Error(`Cannot find densify end in ${file}`);
  const block =
    `\n  // ${MARKER} (+${hubs.length})\n` +
    hubs.map(formatHub).join('\n') +
    '\n';
  text = text.slice(0, insertAt) + block + text.slice(insertAt);
  fs.writeFileSync(file, text);
  console.log(`[oceaniaB] ${cc}: appended +${hubs.length}`);
}

function main() {
  const { byIcao, byCountry } = loadOurAirports();
  const used = existingIcaos();
  fs.mkdirSync(ART, { recursive: true });

  const { pickedAll } = pickHubs(byIcao, byCountry, used);

  for (const cc of Object.keys(pickedAll)) {
    if (pickedAll[cc].length === 0) continue;
    writeAppendDensify(cc, pickedAll[cc]);
  }

  const allHubs = Object.values(pickedAll).flat();
  const fuel = [];
  for (let i = 0; i < allHubs.length; i += 3) fuel.push(allHubs[i].icao);
  fs.writeFileSync(
    path.join(ART, 'oceania-wave-b-fuel.txt'),
    fuel.join('\n') + '\n',
  );
  fs.writeFileSync(
    path.join(ART, 'oceania-wave-b-picked.json'),
    JSON.stringify(
      Object.fromEntries(
        Object.entries(pickedAll).map(([k, v]) => [
          k,
          v.map((h) => h.icao),
        ]),
      ),
      null,
      2,
    ),
  );
  console.log(
    `[oceania wave b] total +${allHubs.length}; fuel ${fuel.length}; assert airports ${2328 + allHubs.length}`,
  );
}

main();
