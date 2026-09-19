/**
 * Asia densify Wave B/C — +50 each (300→350→400).
 * Usage:
 *   node scripts/gen-asia-wave-b-densify.mjs --wave b
 *   node scripts/gen-asia-wave-b-densify.mjs --wave c
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
  'ZBTJ',
  'ZUTF',
  'VTBD',
  'VTPI',
  'VTBK',
  'VTSY',
  'VOBG',
  'VOHY',
  'VIDD',
  'VOGA',
  'VOML',
  'WABP',
  'WARJ',
  'WIPT',
  'WARQ',
  'WALK',
  'WMKM',
  'VEKI',
  'VVVD',
  'RPSP',
  'WIHH',
  'WIMK',
  'WARS',
  'WAHS',
  'WAHI',
  'WALR',
  'WAFB',
  'WIDD',
  'WAJJ',
  'WAMM',
  'WRRR',
  'RPLB',
  'RPLH',
  'RPLT',
  'RPMA',
  'RPML',
  'RPVP',
  'RJTT',
  'RJOO',
  'RJNN',
  'ROAH',
  'RJGG',
  'RKSS',
  'RKJB',
  'RKTY',
  'RCSS',
  'RCMQ',
  'RCNN',
  'RCQC',
  'VVGL',
  'VVLT',
  'VEVZ',
  'VABM',
  'VAHB',
  'VAKJ',
  'VALT',
  'VAND',
  'VARP',
  'WAKT',
  'ZBCD',
  'ZGSD',
  'ZUTR',
  'ZBDH',
  'VYML',
  'VYNP',
  'VYST',
  'OPRN',
  'OPMR',
  'VNPR',
  'VGZR',
  'VNLK',
  'OAIX',
  'OAJL',
  'UAFM',
  'UAFO',
  'UTDK',
  'UTDT',
  'UTNN',
  'UTBK',
  'WMKB',
  'WMSA',
]);

const QUOTAS_B = {
  cn: 10,
  in: 8,
  jp: 6,
  id: 6,
  ph: 5,
  th: 3,
  pk: 3,
  my: 2,
  tw: 2,
  mm: 2,
  kr: 1,
  vn: 1,
  kz: 1,
};

const QUOTAS_C = {
  cn: 10,
  in: 8,
  jp: 6,
  id: 6,
  ph: 5,
  th: 3,
  pk: 3,
  my: 2,
  tw: 2,
  mm: 2,
  kr: 1,
  // Central +2 (UZ/BD); LK deferred if OA/MSFS thin
  uz: 1,
  bd: 1,
};

const ISO = {
  cn: 'CN',
  in: 'IN',
  jp: 'JP',
  id: 'ID',
  ph: 'PH',
  th: 'TH',
  pk: 'PK',
  my: 'MY',
  tw: 'TW',
  mm: 'MM',
  kr: 'KR',
  vn: 'VN',
  kz: 'KZ',
  uz: 'UZ',
  bd: 'BD',
  lk: 'LK',
};

const DEFAULT_REGION = {
  cn: 'CN-E',
  in: 'IN-N',
  jp: 'JP-E',
  id: 'ID-J',
  ph: 'PH-L',
  th: 'TH-C',
  pk: 'PK-N',
  my: 'MY-C',
  tw: 'TW-N',
  mm: 'MM-S',
  kr: 'KR-C',
  vn: 'VN-S',
  kz: 'KZ-S',
  uz: 'UZ-E',
  bd: 'BD-C',
  lk: 'LK-W',
};

const REGION_TYPE = {
  cn: 'CnCareerRegion',
  in: 'InCareerRegion',
  jp: 'JpCareerRegion',
  id: 'IdCareerRegion',
  ph: 'PhCareerRegion',
  th: 'ThCareerRegion',
  pk: 'PkCareerRegion',
  my: 'MyCareerRegion',
  tw: 'TwCareerRegion',
  mm: 'MmCareerRegion',
  kr: 'KrCareerRegion',
  vn: 'VnCareerRegion',
  kz: 'KzCareerRegion',
  uz: 'UzCareerRegion',
  bd: 'BdCareerRegion',
  lk: 'LkCareerRegion',
};

/** Countries that need densify file create + wire on first use. */
const CREATE_DENSIFY = new Set(['kz', 'uz', 'bd', 'lk']);

const PREFERRED_B = {
  cn: [
    ['ZBAD', 'CN-E', 'city'],
    ['ZSZS', 'CN-E', 'city'],
    ['ZBER', 'CN-E', 'city'],
    ['ZPMS', 'CN-S', 'tourism'],
    ['ZSCG', 'CN-E', 'industrial'],
    ['ZSNT', 'CN-E', 'city'],
    ['ZSXZ', 'CN-E', 'city'],
    ['ZWYN', 'CN-W', 'city'],
    ['ZYDD', 'CN-E', 'industrial'],
    ['ZYJM', 'CN-E', 'city'],
    ['ZYMD', 'CN-E', 'industrial'],
    ['ZGSD', 'CN-S', 'city'],
  ],
  in: [
    ['VOPB', 'IN-S', 'city'],
    ['VEVZ', 'IN-S', 'city'],
    ['VABJ', 'IN-W', 'industrial'],
    ['VABM', 'IN-W', 'city'],
    ['VADN', 'IN-W', 'city'],
    ['VAHB', 'IN-S', 'city'],
    ['VAJB', 'IN-N', 'city'],
    ['VABV', 'IN-W', 'industrial'],
    ['VAAK', 'IN-W', 'city'],
    ['VAJM', 'IN-N', 'city'],
  ],
  jp: [
    ['RJOB', 'JP-W', 'city'],
    ['RJAF', 'JP-E', 'city'],
    ['RJBD', 'JP-W', 'city'],
    ['RJBT', 'JP-W', 'tourism'],
    ['RJCB', 'JP-N', 'city'],
    ['RJCK', 'JP-N', 'city'],
    ['RJCM', 'JP-N', 'city'],
    ['RJCN', 'JP-N', 'city'],
  ],
  id: [
    ['WAHI', 'ID-J', 'city'],
    ['WALR', 'ID-K', 'city'],
    ['WABI', 'ID-U', 'tourism'],
    ['WABO', 'ID-U', 'city'],
    ['WAEE', 'ID-S', 'city'],
    ['WAEW', 'ID-S', 'city'],
    ['WAFB', 'ID-S', 'city'],
    ['WAFP', 'ID-S', 'city'],
  ],
  ph: [
    ['RPLH', 'PH-L', 'city'],
    ['RPLT', 'PH-L', 'city'],
    ['RPLU', 'PH-L', 'tourism'],
    ['RPMA', 'PH-M', 'city'],
    ['RPMF', 'PH-M', 'city'],
    ['RPMH', 'PH-M', 'city'],
    ['RPMJ', 'PH-M', 'city'],
  ],
  th: [
    ['VTBO', 'TH-C', 'tourism'],
    ['VTCN', 'TH-N', 'city'],
    ['VTCP', 'TH-N', 'city'],
    ['VTPB', 'TH-N', 'city'],
    ['VTPT', 'TH-N', 'tourism'],
  ],
  pk: [
    ['OPSD', 'PK-N', 'tourism'],
    ['OPTU', 'PK-S', 'drySpoke'],
    ['OPBW', 'PK-N', 'agro'],
    ['OPCH', 'PK-N', 'city'],
    ['OPDG', 'PK-S', 'city'],
  ],
  my: [
    ['WMKN', 'MY-E', 'city'],
    ['WMAP', 'MY-C', 'city'],
    ['WMKC', 'MY-E', 'city'],
    ['WBGK', 'MY-E', 'city'],
  ],
  tw: [
    ['RCKW', 'TW-S', 'tourism'],
    ['RCFN', 'TW-S', 'city'],
    ['RCSQ', 'TW-N', 'city'],
  ],
  mm: [
    ['VYLK', 'MM-N', 'city'],
    ['VYLS', 'MM-N', 'city'],
    ['VYME', 'MM-N', 'city'],
    ['VYMK', 'MM-N', 'city'],
  ],
  kr: [
    ['RKNN', 'KR-C', 'city'],
    ['RKSW', 'KR-C', 'city'],
  ],
  vn: [
    ['VVPK', 'VN-S', 'city'],
    ['VVDL', 'VN-S', 'tourism'],
    ['VVRG', 'VN-S', 'city'],
  ],
  kz: [
    ['UACK', 'KZ-N', 'city'],
    ['UACP', 'KZ-N', 'city'],
    ['UADD', 'KZ-S', 'city'],
  ],
};

const PREFERRED_C = {
  cn: [
    ['ZYMD', 'CN-E', 'industrial'],
    ['ZGSD', 'CN-S', 'city'],
    ['ZWWW', 'CN-W', 'city'],
    ['ZUGY', 'CN-S', 'city'],
    ['ZUTR', 'CN-W', 'city'],
    ['ZUXC', 'CN-W', 'city'],
    ['ZWSH', 'CN-W', 'city'],
    ['ZWTN', 'CN-W', 'city'],
    ['ZYYY', 'CN-E', 'city'],
    ['ZYTL', 'CN-E', 'city'],
    ['ZYTX', 'CN-E', 'city'],
    ['ZYYJ', 'CN-E', 'city'],
  ],
  in: [
    ['VAJM', 'IN-N', 'city'],
    ['VAKE', 'IN-W', 'city'],
    ['VAKJ', 'IN-W', 'city'],
    ['VAPR', 'IN-W', 'city'],
    ['VARG', 'IN-W', 'city'],
    ['VARK', 'IN-W', 'city'],
    ['VAAH', 'IN-W', 'city'],
    ['VAID', 'IN-N', 'city'],
    ['VANP', 'IN-N', 'city'],
    ['VANY', 'IN-S', 'city'],
  ],
  jp: [
    ['RJCM', 'JP-N', 'city'],
    ['RJCN', 'JP-N', 'city'],
    ['RJCO', 'JP-N', 'city'],
    ['RJCT', 'JP-E', 'city'],
    ['RJDA', 'JP-W', 'city'],
    ['RJDC', 'JP-W', 'city'],
    ['RJDK', 'JP-W', 'city'],
    ['RJDO', 'JP-W', 'tourism'],
  ],
  id: [
    ['WAFW', 'ID-S', 'city'],
    ['WAGG', 'ID-K', 'city'],
    ['WAHL', 'ID-J', 'city'],
    ['WAHH', 'ID-J', 'city'],
    ['WAPH', 'ID-U', 'city'],
    ['WAPN', 'ID-U', 'tourism'],
    ['WAPP', 'ID-U', 'city'],
    ['WASC', 'ID-U', 'city'],
  ],
  ph: [
    ['RPMN', 'PH-M', 'city'],
    ['RPMO', 'PH-M', 'city'],
    ['RPMQ', 'PH-M', 'city'],
    ['RPMS', 'PH-M', 'city'],
    ['RPMT', 'PH-M', 'city'],
    ['RPMW', 'PH-M', 'city'],
    ['RPUD', 'PH-L', 'city'],
  ],
  th: [
    ['VTSC', 'TH-S', 'city'],
    ['VTSF', 'TH-S', 'tourism'],
    ['VTSH', 'TH-S', 'city'],
    ['VTSK', 'TH-S', 'city'],
    ['VTSN', 'TH-S', 'tourism'],
  ],
  pk: [
    ['OPCH', 'PK-N', 'city'],
    ['OPDG', 'PK-S', 'city'],
    ['OPDI', 'PK-N', 'city'],
    ['OPGT', 'PK-N', 'tourism'],
    ['OPMJ', 'PK-S', 'city'],
  ],
  my: [
    ['WMKC', 'MY-E', 'city'],
    ['WBGK', 'MY-E', 'city'],
    ['WBGM', 'MY-E', 'city'],
    ['WBGS', 'MY-E', 'city'],
  ],
  tw: [
    ['RCKW', 'TW-S', 'tourism'],
    ['RCSQ', 'TW-N', 'city'],
    ['RCDC', 'TW-S', 'city'],
  ],
  mm: [
    ['VYME', 'MM-N', 'city'],
    ['VYMK', 'MM-N', 'city'],
    ['VYMO', 'MM-N', 'city'],
    ['VYMS', 'MM-S', 'city'],
  ],
  kr: [
    ['RKSW', 'KR-C', 'city'],
    ['RKSG', 'KR-C', 'city'],
  ],
  uz: [
    ['UTFN', 'UZ-E', 'city'],
    ['UTNU', 'UZ-W', 'city'],
    ['UTKA', 'UZ-E', 'city'],
  ],
  bd: [
    ['VGBR', 'BD-E', 'city'],
    ['VGCB', 'BD-E', 'city'],
    ['VGIS', 'BD-C', 'city'],
  ],
  lk: [
    ['VCCB', 'LK-W', 'city'],
    ['VCCA', 'LK-W', 'city'],
    ['VCCG', 'LK-E', 'city'],
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

function waveMarker(wave) {
  return `Wave ${wave.toUpperCase()} Asia densify`;
}

function existingIcaos(wave) {
  const marker = waveMarker(wave);
  const set = new Set();
  for (const f of fs.readdirSync(SRC)) {
    if (!/^career-.*-hubs.*\.ts$/.test(f)) continue;
    let text = fs.readFileSync(path.join(SRC, f), 'utf8');
    // Strip this wave's block so re-runs are idempotent
    if (text.includes(marker)) {
      const i = text.indexOf(`\n  // ${marker}`);
      if (i >= 0) {
        const j = text.indexOf('\n];', i);
        if (j >= 0) text = text.slice(0, i) + text.slice(j);
      } else {
        // Whole-file densify created for this wave (e.g. first KZ file)
        const cc = f.match(/^career-([a-z]{2})-hubs-densify\.ts$/)?.[1];
        if (cc && CREATE_DENSIFY.has(cc) && text.includes(marker)) {
          continue; // treat as unused for re-pick
        }
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

function pickHubs(byIcao, byCountry, used, quotas, preferred) {
  const pickedAll = {};
  let total = 0;
  for (const cc of Object.keys(quotas)) {
    const want = quotas[cc];
    const out = [];
    const usedLocal = new Set(used);

    for (const [icao, region, kind] of preferred[cc] || []) {
      if (out.length >= want) break;
      if (!isLetterIcao(icao)) continue;
      if (FORBIDDEN.has(icao) || usedLocal.has(icao)) continue;
      const oa = byIcao.get(icao);
      if (!oa) {
        console.warn(`[asia] skip ${icao}: not OA medium/large`);
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
      console.warn(`[asia] ${cc}: only ${out.length}/${want}`);
    }
    pickedAll[cc] = out;
    for (const h of out) used.add(h.icao);
    total += out.length;
  }

  let short =
    Object.values(quotas).reduce((a, b) => a + b, 0) - total;
  if (short > 0) {
    console.log(`[asia] shortfall ${short} → CN/IN/ID redirect`);
    for (const cc of ['cn', 'in', 'id']) {
      while (short > 0) {
        const have = new Set([
          ...used,
          ...pickedAll[cc].map((h) => h.icao),
        ]);
        const next = rankedPool(byIcao, byCountry, cc, have)[0];
        if (!next) break;
        const oa = byIcao.get(next);
        pickedAll[cc].push({
          icao: next,
          name: oa.name,
          region: DEFAULT_REGION[cc],
          lat: oa.lat,
          lon: oa.lon,
          kind: 'city',
        });
        used.add(next);
        short--;
        total++;
      }
    }
  }
  return { pickedAll, total };
}

function pascal(cc) {
  return cc.charAt(0).toUpperCase() + cc.slice(1);
}

function createDensifyFile(cc, hubs, wave) {
  const file = path.join(SRC, `career-${cc}-hubs-densify.ts`);
  const Pascal = pascal(cc);
  const CC = cc.toUpperCase();
  const regionType = REGION_TYPE[cc];
  const body = `/**
 * ${Pascal} densify Wave ${wave.toUpperCase()} — commercial spokes (MSFS + SimBrief).
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

/** ${waveMarker(wave)} (+${hubs.length}). */
export const ${CC}_DENSIFY_HUBS: readonly ${Pascal}DensifyHub[] = [
${hubs.map(formatHub).join('\n')}
];

export const ${CC}_DENSIFY_HUB_COUNT = ${CC}_DENSIFY_HUBS.length;
`;
  fs.writeFileSync(file, body);
  console.log(`[asia] created career-${cc}-hubs-densify.ts (+${hubs.length})`);
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
  if (
    countLine &&
    !countLine[0].includes('DENSIFY_HUB_COUNT')
  ) {
    text = text.replace(
      new RegExp(`export const ${CC}_CAREER_HUB_COUNT = (\\d+);`),
      `export const ${CC}_CAREER_HUB_COUNT = $1 + ${CC}_DENSIFY_HUB_COUNT;`,
    );
  }
  fs.writeFileSync(file, text);
  console.log(`[asia] wired career-${cc}-hubs.ts`);
}

function writeAppendDensify(cc, hubs, wave) {
  const marker = waveMarker(wave);
  if (CREATE_DENSIFY.has(cc)) {
    const file = path.join(SRC, `career-${cc}-hubs-densify.ts`);
    if (!fs.existsSync(file)) {
      createDensifyFile(cc, hubs, wave);
      wireDensify(cc);
      return;
    }
    // File exists: append like others
  }

  const file = path.join(SRC, `career-${cc}-hubs-densify.ts`);
  if (!fs.existsSync(file)) {
    createDensifyFile(cc, hubs, wave);
    wireDensify(cc);
    return;
  }

  let text = fs.readFileSync(file, 'utf8');
  if (text.includes(marker)) {
    const i = text.indexOf(`\n  // ${marker}`);
    const j = text.indexOf('\n];', i);
    if (i >= 0 && j >= 0) {
      text = text.slice(0, i) + text.slice(j);
      console.log(`[asia] ${cc}: stripped prior ${marker} block`);
    } else if (CREATE_DENSIFY.has(cc) && text.includes(`/** ${marker}`)) {
      // Whole-file recreate
      createDensifyFile(cc, hubs, wave);
      wireDensify(cc);
      return;
    } else {
      console.warn(`[asia] ${cc}: ${marker} present — skip`);
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
    `\n  // ${marker} (+${hubs.length})\n` +
    hubs.map(formatHub).join('\n') +
    '\n';
  text = text.slice(0, insertAt) + block + text.slice(insertAt);
  fs.writeFileSync(file, text);
  console.log(`[asia] ${cc}: appended +${hubs.length}`);
}

function main() {
  const args = process.argv.slice(2);
  const wi = args.indexOf('--wave');
  const wave = (wi >= 0 ? args[wi + 1] : 'b')?.toLowerCase();
  if (wave !== 'b' && wave !== 'c') {
    console.error('Usage: node scripts/gen-asia-wave-b-densify.mjs --wave b|c');
    process.exit(1);
  }

  const quotas = wave === 'b' ? QUOTAS_B : QUOTAS_C;
  const preferred = wave === 'b' ? PREFERRED_B : PREFERRED_C;
  const baseSeed = wave === 'b' ? 2181 : 2231;

  const { byIcao, byCountry } = loadOurAirports();
  const used = existingIcaos(wave);
  fs.mkdirSync(ART, { recursive: true });

  const { pickedAll, total } = pickHubs(
    byIcao,
    byCountry,
    used,
    quotas,
    preferred,
  );

  for (const cc of Object.keys(pickedAll)) {
    if (pickedAll[cc].length === 0) continue;
    writeAppendDensify(cc, pickedAll[cc], wave);
  }

  const allHubs = Object.values(pickedAll).flat();
  const fuel = [];
  for (let i = 0; i < allHubs.length; i += 3) fuel.push(allHubs[i].icao);
  const artPrefix = `asia-wave-${wave}`;
  fs.writeFileSync(
    path.join(ART, `${artPrefix}-fuel.txt`),
    fuel.join('\n') + '\n',
  );
  fs.writeFileSync(
    path.join(ART, `${artPrefix}-picked.json`),
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
    `[asia wave ${wave}] total +${allHubs.length} (want ${Object.values(quotas).reduce((a, b) => a + b, 0)}); fuel ${fuel.length}; assert airports ${baseSeed + allHubs.length}`,
  );
  console.log(`[asia] fuel list → artifacts/${artPrefix}-fuel.txt`);
}

main();
