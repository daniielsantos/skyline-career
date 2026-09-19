/**
 * MENA densify Wave A — create densify files + wire hubs.ts (+35 → ~115).
 * Usage: node scripts/gen-mena-wave-a-densify.mjs
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

const FORBIDDEN = new Set([
  'HEAX',
  'OETH',
  'OKBK',
  'ORBS',
  'OIBA',
  'HLLT',
  'HSSS',
  'OTBD',
  'OIII',
  'LPPS',
  'LPLA',
  'GCTS',
  'EDDT',
]);

const QUOTAS = {
  sa: 6,
  eg: 4,
  ir: 4,
  dz: 3,
  ma: 3,
  ae: 3,
  iq: 2,
  om: 2,
  ly: 2,
  tn: 2,
  sy: 1,
  sd: 1,
  ye: 1,
  il: 1,
};

const DEFAULT_REGION = {
  sa: 'SA-C',
  eg: 'EG-N',
  ir: 'IR-C',
  dz: 'DZ-N',
  ma: 'MA-C',
  ae: 'AE-N',
  iq: 'IQ-C',
  om: 'OM-N',
  ly: 'LY-W',
  tn: 'TN-N',
  sy: 'SY-S',
  sd: 'SD-C',
  ye: 'YE-N',
  il: 'IL-C',
};

const ISO = {
  sa: 'SA',
  eg: 'EG',
  ir: 'IR',
  dz: 'DZ',
  ma: 'MA',
  ae: 'AE',
  iq: 'IQ',
  om: 'OM',
  ly: 'LY',
  tn: 'TN',
  sy: 'SY',
  sd: 'SD',
  ye: 'YE',
  il: 'IL',
};

const CORE_COUNT = {
  sa: 10,
  eg: 6,
  ir: 8,
  dz: 5,
  ma: 7,
  ae: 6,
  iq: 6,
  om: 4,
  ly: 3,
  tn: 4,
  sy: 3,
  sd: 3,
  ye: 4,
  il: 3,
};

const REGION_TYPE = {
  sa: 'SaCareerRegion',
  eg: 'EgCareerRegion',
  ir: 'IrCareerRegion',
  dz: 'DzCareerRegion',
  ma: 'MaCareerRegion',
  ae: 'AeCareerRegion',
  iq: 'IqCareerRegion',
  om: 'OmCareerRegion',
  ly: 'LyCareerRegion',
  tn: 'TnCareerRegion',
  sy: 'SyCareerRegion',
  sd: 'SdCareerRegion',
  ye: 'YeCareerRegion',
  il: 'IlCareerRegion',
};

const PREFERRED = {
  sa: [
    ['OETB', 'SA-W', 'spoke', 'city'],
    ['OEGN', 'SA-W', 'spoke', 'city'],
    ['OEPA', 'SA-E', 'spoke', 'city'],
    ['OERR', 'SA-C', 'spoke', 'drySpoke'],
    ['OEWD', 'SA-C', 'spoke', 'agro'],
    ['OEJB', 'SA-E', 'spoke', 'industrial'],
  ],
  eg: [
    ['HEMA', 'EG-R', 'spoke', 'tourism'],
    ['HEAT', 'EG-S', 'spoke', 'city'],
    ['HESG', 'EG-S', 'spoke', 'city'],
    ['HETB', 'EG-R', 'spoke', 'tourism'],
  ],
  ir: [
    ['OIAW', 'IR-S', 'spoke', 'industrial'],
    ['OIBB', 'IR-S', 'spoke', 'city'],
    ['OIBK', 'IR-S', 'spoke', 'tourism'],
    ['OITR', 'IR-N', 'spoke', 'city'],
  ],
  dz: [
    ['DABB', 'DZ-E', 'spoke', 'city'],
    ['DAUG', 'DZ-N', 'spoke', 'agro'],
    ['DAAT', 'DZ-W', 'spoke', 'drySpoke'],
  ],
  ma: [
    ['GMMW', 'MA-N', 'spoke', 'city'],
    ['GMTA', 'MA-N', 'spoke', 'tourism'],
    ['GMMI', 'MA-C', 'spoke', 'tourism'],
  ],
  ae: [
    ['OMDW', 'AE-N', 'spoke', 'industrial'],
    ['OMSW', 'AE-N', 'spoke', 'tourism'],
    ['OMDL', 'AE-C', 'spoke', 'tourism'],
  ],
  iq: [
    ['ORQW', 'IQ-N', 'spoke', 'city'],
    ['ORTQ', 'IQ-C', 'spoke', 'drySpoke'],
  ],
  om: [
    ['OODQ', 'OM-S', 'spoke', 'industrial'],
    ['OOTH', 'OM-S', 'spoke', 'drySpoke'],
  ],
  ly: [
    ['HLGT', 'LY-W', 'spoke', 'drySpoke'],
    ['HLKF', 'LY-E', 'spoke', 'drySpoke'],
  ],
  tn: [
    ['DTTZ', 'TN-S', 'spoke', 'tourism'],
    ['DTNH', 'TN-N', 'spoke', 'city'],
  ],
  sy: [['OSKL', 'SY-N', 'spoke', 'city']],
  sd: [['HSNN', 'SD-C', 'spoke', 'agro']],
  ye: [['OYTZ', 'YE-S', 'spoke', 'city']],
  il: [['LLBS', 'IL-S', 'spoke', 'city']],
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
    const text = fs.readFileSync(path.join(SRC, f), 'utf8');
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
    hubTier: '${h.hubTier}',
    lat: ${Number(h.lat.toFixed(5))},
    lon: ${Number(h.lon.toFixed(5))},
    produce: { ${prod} },
    consume: { ${cons} },
  },`;
}

function writeDensifyFile(cc, hubs) {
  const CC = cc.toUpperCase();
  const Pascal = CC[0] + CC.slice(1).toLowerCase();
  const regionType = REGION_TYPE[cc];
  const body = `/**
 * ${ISO[cc]} densify Wave A — commercial spokes (MSFS + SimBrief).
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

/** Wave A MENA densify (+${hubs.length}). */
export const ${CC}_DENSIFY_HUBS: readonly ${Pascal}DensifyHub[] = [
${hubs.map(formatHub).join('\n')}
];

export const ${CC}_DENSIFY_HUB_COUNT = ${CC}_DENSIFY_HUBS.length;
`;
  fs.writeFileSync(path.join(SRC, `career-${cc}-hubs-densify.ts`), body);
  console.log(`[waveA] ${cc}: +${hubs.length} → career-${cc}-hubs-densify.ts`);
}

function wireHubsTs(cc) {
  const file = path.join(SRC, `career-${cc}-hubs.ts`);
  let text = fs.readFileSync(file, 'utf8');
  const CC = cc.toUpperCase();
  const densifyImport = `import { ${CC}_DENSIFY_HUBS, ${CC}_DENSIFY_HUB_COUNT } from './career-${cc}-hubs-densify.js';`;

  if (!text.includes(`${CC}_DENSIFY_HUBS`)) {
    const lastImport = [...text.matchAll(/^import .+;$/gm)].pop();
    if (!lastImport) throw new Error(`No import in ${file}`);
    const at = lastImport.index + lastImport[0].length;
    text = `${text.slice(0, at)}\n${densifyImport}${text.slice(at)}`;
  }

  if (!text.includes(`...${CC}_DENSIFY_HUBS`)) {
    const re = new RegExp(
      `(export const ${CC}_CAREER_HUBS[\\s\\S]*?)(\\n\\];)`,
    );
    if (!re.test(text)) throw new Error(`Cannot find ${CC}_CAREER_HUBS array end`);
    // Avoid `},,` when the last hub entry already ends with a trailing comma.
    text = text.replace(re, (_, body, close) => {
      const trimmed = body.replace(/,(\s*)$/, '$1');
      return `${trimmed},\n  ...${CC}_DENSIFY_HUBS${close}`;
    });
  }

  const core = CORE_COUNT[cc];
  const countRe = new RegExp(`export const ${CC}_CAREER_HUB_COUNT = ${core};`);
  if (!countRe.test(text)) {
    throw new Error(`Cannot find ${CC}_CAREER_HUB_COUNT = ${core}`);
  }
  text = text.replace(
    countRe,
    `export const ${CC}_CAREER_HUB_COUNT = ${core} + ${CC}_DENSIFY_HUB_COUNT;`,
  );

  fs.writeFileSync(file, text);
  console.log(`[waveA] wired career-${cc}-hubs.ts`);
}

function main() {
  const { byIcao, byCountry } = loadOurAirports();
  const used = existingIcaos();
  const fuel = [];
  const pickedAll = {};
  let total = 0;

  for (const cc of Object.keys(QUOTAS)) {
    const want = QUOTAS[cc];
    const out = [];
    const usedLocal = new Set(used);

    for (const [icao, region, hubTier, kind] of PREFERRED[cc] || []) {
      if (out.length >= want) break;
      if (FORBIDDEN.has(icao) || usedLocal.has(icao)) continue;
      const oa = byIcao.get(icao);
      if (!oa) {
        console.warn(`[waveA] skip ${icao}: not OA medium/large`);
        continue;
      }
      out.push({
        icao,
        name: oa.name,
        region,
        hubTier: hubTier === 'regional' ? 'regional' : 'spoke',
        lat: oa.lat,
        lon: oa.lon,
        kind,
      });
      usedLocal.add(icao);
    }

    const pool = (byCountry.get(ISO[cc]) || []).filter((icao) => {
      if (FORBIDDEN.has(icao) || usedLocal.has(icao)) return false;
      const oa = byIcao.get(icao);
      return oa && oa.type === 'medium_airport';
    });

    for (const icao of pool) {
      if (out.length >= want) break;
      const oa = byIcao.get(icao);
      out.push({
        icao,
        name: oa.name,
        region: DEFAULT_REGION[cc],
        hubTier: 'spoke',
        lat: oa.lat,
        lon: oa.lon,
        kind: 'drySpoke',
      });
      usedLocal.add(icao);
    }

    if (out.length < want) {
      console.warn(`[waveA] ${cc}: only ${out.length}/${want}`);
    }

    pickedAll[cc] = out;
    for (let i = 0; i < out.length; i += 3) fuel.push(out[i].icao);
    for (const h of out) used.add(h.icao);
    total += out.length;
  }

  // Redirect shortfall to SA/AE/EG
  let short = Object.values(QUOTAS).reduce((a, b) => a + b, 0) - total;
  if (short > 0) {
    console.log(`[waveA] shortfall ${short} → SA/AE/EG redirect`);
    for (const cc of ['sa', 'ae', 'eg']) {
      while (short > 0) {
        const have = new Set([
          ...used,
          ...pickedAll[cc].map((h) => h.icao),
        ]);
        const next = (byCountry.get(ISO[cc]) || []).find((icao) => {
          if (FORBIDDEN.has(icao) || have.has(icao)) return false;
          const oa = byIcao.get(icao);
          return oa && oa.type === 'medium_airport';
        });
        if (!next) break;
        const oa = byIcao.get(next);
        pickedAll[cc].push({
          icao: next,
          name: oa.name,
          region: DEFAULT_REGION[cc],
          hubTier: 'spoke',
          lat: oa.lat,
          lon: oa.lon,
          kind: 'drySpoke',
        });
        used.add(next);
        if (pickedAll[cc].length % 3 === 1) fuel.push(next);
        short--;
        total++;
      }
    }
  }

  for (const cc of Object.keys(pickedAll)) {
    writeDensifyFile(cc, pickedAll[cc]);
    wireHubsTs(cc);
  }

  fs.mkdirSync(path.join(ROOT, 'artifacts'), { recursive: true });
  // Unique fuel ~ every 3rd overall
  const fuelUnique = [];
  const allHubs = Object.values(pickedAll).flat();
  for (let i = 0; i < allHubs.length; i += 3) fuelUnique.push(allHubs[i].icao);
  fs.writeFileSync(
    path.join(ROOT, 'artifacts', 'mena-wave-a-fuel.txt'),
    fuelUnique.join('\n') + '\n',
  );
  console.log(
    `[waveA] total +${total}; fuel ${fuelUnique.length} → artifacts/mena-wave-a-fuel.txt; assert airports ${2100 + total}`,
  );
}

main();
