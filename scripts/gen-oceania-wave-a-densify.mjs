/**
 * Oceania densify Wave A — +47 → OC ~110 (seed 2281→2328).
 * Usage: node scripts/gen-oceania-wave-a-densify.mjs
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
]);

const QUOTAS = {
  au: 18,
  pg: 12,
  nz: 6,
  pf: 4,
  nc: 2,
  fj: 2,
  vu: 2,
  ki: 1,
};

const ISO = {
  au: 'AU',
  pg: 'PG',
  nz: 'NZ',
  pf: 'PF',
  nc: 'NC',
  fj: 'FJ',
  vu: 'VU',
  ki: 'KI',
};

const DEFAULT_REGION = {
  au: 'AU-E',
  pg: 'PG-S',
  nz: 'NZ-N',
  pf: 'PF-I',
  nc: 'NC-S',
  fj: 'FJ-W',
  vu: 'VU-C',
  ki: 'KI-T',
};

const REGION_TYPE = {
  au: 'AuCareerRegion',
  pg: 'PgCareerRegion',
  nz: 'NzCareerRegion',
  pf: 'PfCareerRegion',
  nc: 'NcCareerRegion',
  fj: 'FjCareerRegion',
  vu: 'VuCareerRegion',
  ki: 'KiCareerRegion',
};

const CREATE_DENSIFY = new Set(['pg', 'fj', 'nc', 'pf', 'vu', 'ki']);

const PREFERRED = {
  au: [
    ['YARA', 'AU-E', 'agro'],
    ['YBCV', 'AU-Q', 'city'],
    ['YBHM', 'AU-Q', 'tourism'],
    ['YBLA', 'AU-Q', 'city'],
    ['YBMA', 'AU-Q', 'industrial'],
    ['YBMK', 'AU-Q', 'tourism'],
    ['YBNS', 'AU-E', 'city'],
    ['YBPN', 'AU-Q', 'tourism'],
    ['YBRK', 'AU-Q', 'city'],
    ['YBRN', 'AU-NT', 'city'],
    ['YBRW', 'AU-W', 'industrial'],
    ['YBTL', 'AU-Q', 'city'],
    ['YBUD', 'AU-Q', 'city'],
    ['YBWP', 'AU-Q', 'city'],
    ['YCAR', 'AU-W', 'city'],
    ['YCBA', 'AU-E', 'city'],
    ['YCBB', 'AU-Q', 'city'],
    ['YCBP', 'AU-S', 'city'],
    ['YBTI', 'AU-NT', 'city'],
    ['YBTR', 'AU-Q', 'city'],
  ],
  pg: [
    ['AYWK', 'PG-S', 'city'],
    ['AYMD', 'PG-S', 'city'],
    ['AYTK', 'PG-S', 'city'],
    ['AYGA', 'PG-S', 'city'],
    ['AYGN', 'PG-S', 'city'],
    ['AYHK', 'PG-S', 'city'],
    ['AYKM', 'PG-S', 'city'],
    ['AYKV', 'PG-S', 'city'],
    ['AYMH', 'PG-S', 'city'],
    ['AYMN', 'PG-S', 'city'],
    ['AYMO', 'PG-S', 'city'],
    ['AYVN', 'PG-S', 'city'],
    ['AYWD', 'PG-S', 'city'],
    ['AYBA', 'PG-S', 'drySpoke'],
    ['AYBK', 'PG-S', 'drySpoke'],
  ],
  nz: [
    ['NZAP', 'NZ-N', 'city'],
    ['NZAR', 'NZ-N', 'city'],
    ['NZGT', 'NZ-S', 'city'],
    ['NZMS', 'NZ-N', 'city'],
    ['NZPP', 'NZ-N', 'city'],
    ['NZTG', 'NZ-N', 'city'],
    ['NZTU', 'NZ-S', 'city'],
    ['NZWB', 'NZ-S', 'city'],
  ],
  pf: [
    ['NTMD', 'PF-I', 'tourism'],
    ['NTMN', 'PF-I', 'tourism'],
    ['NTTG', 'PF-L', 'tourism'],
    ['NTTH', 'PF-L', 'tourism'],
    ['NTAR', 'PF-I', 'tourism'],
    ['NTAT', 'PF-I', 'tourism'],
  ],
  nc: [
    ['NWWE', 'NC-S', 'tourism'],
    ['NWWL', 'NC-S', 'city'],
    ['NWWR', 'NC-S', 'city'],
    ['NWWU', 'NC-S', 'city'],
  ],
  fj: [
    ['NFNL', 'FJ-W', 'city'],
    ['NFNA', 'FJ-W', 'city'],
  ],
  vu: [
    ['NVSQ', 'VU-C', 'tourism'],
    ['NVVW', 'VU-S', 'tourism'],
  ],
  ki: [
    ['NGTE', 'KI-T', 'city'],
    ['PCIS', 'KI-L', 'drySpoke'],
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

const MARKER = 'Wave A Oceania densify';

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
        console.warn(`[oceania] skip ${icao}: not OA medium/large`);
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
      console.warn(`[oceania] ${cc}: only ${out.length}/${want}`);
    }
    pickedAll[cc] = out;
    for (const h of out) used.add(h.icao);
    total += out.length;
  }

  let short = Object.values(QUOTAS).reduce((a, b) => a + b, 0) - total;
  if (short > 0) {
    console.log(`[oceania] shortfall ${short} → AU redirect`);
    while (short > 0) {
      const have = new Set([
        ...used,
        ...pickedAll.au.map((h) => h.icao),
      ]);
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
 * ${Pascal} densify Wave A Oceania — commercial spokes (MSFS + SimBrief).
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
  console.log(`[oceania] created career-${cc}-hubs-densify.ts (+${hubs.length})`);
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
  console.log(`[oceania] wired career-${cc}-hubs.ts`);
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
      console.log(`[oceania] ${cc}: stripped prior ${MARKER} block`);
    } else if (CREATE_DENSIFY.has(cc) && text.includes(`/** ${MARKER}`)) {
      createDensifyFile(cc, hubs);
      wireDensify(cc);
      return;
    } else {
      console.warn(`[oceania] ${cc}: ${MARKER} present — skip`);
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
  console.log(`[oceania] ${cc}: appended +${hubs.length}`);
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
    path.join(ART, 'oceania-wave-a-fuel.txt'),
    fuel.join('\n') + '\n',
  );
  fs.writeFileSync(
    path.join(ART, 'oceania-wave-a-picked.json'),
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
    `[oceania wave a] total +${allHubs.length} (want ${Object.values(QUOTAS).reduce((a, b) => a + b, 0)}); fuel ${fuel.length}; assert airports ${2281 + allHubs.length}`,
  );
}

main();
