/**
 * Asia densify Wave A — +46 → Asia 300 (seed 2135→2181).
 * Usage:
 *   node scripts/gen-asia-wave-a-densify.mjs           # pick + write densify
 *   node scripts/gen-asia-wave-a-densify.mjs --probe   # probe preferred via career-hubs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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
  'ZBAD',
  'ZLSN',
  'VTBD',
  'VTPI',
  'VTBK',
  'VTSY',
  'VOBG',
  'VOHY',
  'VIDD',
  'VOGA',
  'VOML',
  'VOPB',
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
  'WIDD',
  'WAJJ',
  'WAMM',
  'WRRR',
  'RPLB',
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
  'VVGL',
  'VVLT',
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

const QUOTAS = {
  cn: 10,
  in: 8,
  jp: 6,
  id: 6,
  ph: 5,
  pk: 4,
  th: 3,
  vn: 2,
  my: 1,
  kr: 1,
};

const ISO = {
  cn: 'CN',
  in: 'IN',
  jp: 'JP',
  id: 'ID',
  ph: 'PH',
  pk: 'PK',
  th: 'TH',
  vn: 'VN',
  my: 'MY',
  kr: 'KR',
};

const DEFAULT_REGION = {
  cn: 'CN-E',
  in: 'IN-N',
  jp: 'JP-E',
  id: 'ID-J',
  ph: 'PH-L',
  pk: 'PK-N',
  th: 'TH-C',
  vn: 'VN-S',
  my: 'MY-C',
  kr: 'KR-C',
};

const REGION_TYPE = {
  cn: 'CnCareerRegion',
  in: 'InCareerRegion',
  jp: 'JpCareerRegion',
  id: 'IdCareerRegion',
  ph: 'PhCareerRegion',
  pk: 'PkCareerRegion',
  th: 'ThCareerRegion',
  vn: 'VnCareerRegion',
  my: 'MyCareerRegion',
  kr: 'KrCareerRegion',
};

/** Prefer commercial spokes known in stock MSFS catalogs (letter ICAOs only). */
const PREFERRED = {
  cn: [
    ['ZBSJ', 'CN-E', 'city'],
    ['ZBYN', 'CN-E', 'industrial'],
    ['ZSWZ', 'CN-E', 'city'],
    ['ZSWX', 'CN-E', 'industrial'],
    ['ZSYN', 'CN-E', 'city'],
    ['ZGDY', 'CN-S', 'tourism'],
    ['ZGZJ', 'CN-S', 'city'],
    ['ZLXN', 'CN-W', 'city'],
    ['ZPJH', 'CN-S', 'tourism'],
    ['ZBYC', 'CN-E', 'industrial'],
    ['ZSCG', 'CN-E', 'city'],
    ['ZSNT', 'CN-E', 'city'],
    ['ZSXZ', 'CN-E', 'city'],
    ['ZGSD', 'CN-S', 'city'],
    ['ZSYW', 'CN-E', 'industrial'],
  ],
  in: [
    ['VISR', 'IN-N', 'tourism'],
    ['VICG', 'IN-N', 'city'],
    ['VABO', 'IN-W', 'industrial'],
    ['VASU', 'IN-W', 'industrial'],
    ['VOTR', 'IN-S', 'city'],
    ['VOTV', 'IN-S', 'city'],
    ['VASD', 'IN-W', 'city'],
    ['VEKI', 'IN-N', 'city'],
    ['VAHB', 'IN-S', 'city'],
    ['VAJB', 'IN-N', 'city'],
    ['VAAU', 'IN-W', 'city'],
  ],
  jp: [
    ['RJSN', 'JP-E', 'city'],
    ['RJSS', 'JP-E', 'city'],
    ['RJOT', 'JP-W', 'city'],
    ['RJFM', 'JP-S', 'tourism'],
    ['RJFU', 'JP-S', 'city'],
    ['RJNS', 'JP-E', 'tourism'],
    ['RJOB', 'JP-W', 'city'],
    ['RJSI', 'JP-N', 'city'],
  ],
  id: [
    ['WIPT', 'ID-S', 'city'],
    ['WARQ', 'ID-J', 'city'],
    ['WILL', 'ID-S', 'city'],
    ['WICA', 'ID-J', 'industrial'],
    ['WALS', 'ID-K', 'city'],
    ['WALK', 'ID-K', 'city'],
    ['WARJ', 'ID-J', 'city'],
    ['WAKK', 'ID-U', 'city'],
  ],
  ph: [
    ['RPMZ', 'PH-M', 'city'],
    ['RPSP', 'PH-V', 'tourism'],
    ['RPME', 'PH-M', 'city'],
    ['RPMG', 'PH-M', 'city'],
    ['RPMP', 'PH-M', 'city'],
    ['RPMC', 'PH-M', 'city'],
    ['RPLH', 'PH-L', 'city'],
  ],
  pk: [
    ['OPFA', 'PK-N', 'city'],
    ['OPST', 'PK-N', 'industrial'],
    ['OPSK', 'PK-S', 'city'],
    ['OPGD', 'PK-S', 'tourism'],
    ['OPSD', 'PK-N', 'tourism'],
    ['OPTU', 'PK-S', 'drySpoke'],
    ['OPBW', 'PK-N', 'agro'],
  ],
  th: [
    ['VTSB', 'TH-S', 'city'],
    ['VTPP', 'TH-N', 'city'],
    ['VTPO', 'TH-N', 'tourism'],
    ['VTBO', 'TH-C', 'tourism'],
    ['VTCN', 'TH-N', 'city'],
  ],
  vn: [
    ['VVPB', 'VN-S', 'city'],
    ['VVVD', 'VN-N', 'tourism'],
    ['VVPC', 'VN-S', 'city'],
    ['VVPK', 'VN-S', 'city'],
  ],
  my: [
    ['WMKM', 'MY-C', 'city'],
    ['WMKN', 'MY-E', 'city'],
  ],
  kr: [
    ['RKPD', 'KR-S', 'tourism'],
    ['RKNW', 'KR-C', 'city'],
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

function existingIcaos() {
  const set = new Set();
  for (const f of fs.readdirSync(SRC)) {
    if (!/^career-.*-hubs.*\.ts$/.test(f)) continue;
    // Regenerating Wave A: ignore densify Wave A block + PK densify file
    if (f === 'career-pk-hubs-densify.ts') continue;
    let text = fs.readFileSync(path.join(SRC, f), 'utf8');
    if (f.includes('densify') && text.includes('Wave A Asia densify')) {
      const i = text.indexOf('\n  // Wave A Asia densify');
      const j = text.indexOf('\n];', i);
      if (i >= 0 && j >= 0) text = text.slice(0, i) + text.slice(j);
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

function rankedPool(byIcao, byCountry, cc, usedLocal, probeOk) {
  return (byCountry.get(ISO[cc]) || [])
    .filter((icao) => {
      if (!isLetterIcao(icao)) return false;
      if (FORBIDDEN.has(icao) || usedLocal.has(icao)) return false;
      if (probeOk && !probeOk.has(icao)) return false;
      const oa = byIcao.get(icao);
      if (!oa) return false;
      if (oa.type !== 'medium_airport' && oa.type !== 'large_airport')
        return false;
      return commercialScore(oa) >= 1;
    })
    .sort((a, b) => {
      const sa = commercialScore(byIcao.get(a));
      const sb = commercialScore(byIcao.get(b));
      return sb - sa || a.localeCompare(b);
    });
}

function pickHubs(byIcao, byCountry, used, probeOk) {
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
      if (probeOk && !probeOk.has(icao)) continue;
      const oa = byIcao.get(icao);
      if (!oa) {
        console.warn(`[asiaA] skip ${icao}: not OA medium/large`);
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

    for (const icao of rankedPool(byIcao, byCountry, cc, usedLocal, probeOk)) {
      if (out.length >= want) break;
      const oa = byIcao.get(icao);
      const kind =
        commercialScore(oa) >= 4
          ? 'city'
          : commercialScore(oa) >= 3
            ? 'industrial'
            : 'drySpoke';
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
      console.warn(`[asiaA] ${cc}: only ${out.length}/${want}`);
    }
    pickedAll[cc] = out;
    for (const h of out) used.add(h.icao);
    total += out.length;
  }

  // Redirect shortfall → CN/IN/ID
  let short =
    Object.values(QUOTAS).reduce((a, b) => a + b, 0) - total;
  if (short > 0) {
    console.log(`[asiaA] shortfall ${short} → CN/IN/ID redirect`);
    for (const cc of ['cn', 'in', 'id']) {
      while (short > 0) {
        const have = new Set([
          ...used,
          ...pickedAll[cc].map((h) => h.icao),
        ]);
        const next = rankedPool(byIcao, byCountry, cc, have, null)[0];
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

function writeAppendDensify(cc, hubs) {
  const file = path.join(SRC, `career-${cc}-hubs-densify.ts`);
  const CC = cc.toUpperCase();
  if (cc === 'pk') {
    const Pascal = 'Pk';
    const regionType = REGION_TYPE.pk;
    const body = `/**
 * Pakistan densify Wave A — commercial OP* spokes (MSFS + SimBrief).
 * Merged into PK_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { ${regionType} } from './career-pk-hubs.js';

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

/** Wave A Asia densify (+${hubs.length}). */
export const PK_DENSIFY_HUBS: readonly ${Pascal}DensifyHub[] = [
${hubs.map(formatHub).join('\n')}
];

export const PK_DENSIFY_HUB_COUNT = PK_DENSIFY_HUBS.length;
`;
    fs.writeFileSync(file, body);
    console.log(`[asiaA] created career-pk-hubs-densify.ts (+${hubs.length})`);
    return;
  }

  let text = fs.readFileSync(file, 'utf8');
  if (text.includes('Wave A Asia densify')) {
    const i = text.indexOf('\n  // Wave A Asia densify');
    const j = text.indexOf('\n];', i);
    if (i >= 0 && j >= 0) {
      text = text.slice(0, i) + text.slice(j);
      console.log(`[asiaA] ${cc}: stripped prior Wave A block`);
    } else {
      console.warn(`[asiaA] ${cc}: Wave A block already present — skip append`);
      return;
    }
  }
  const countRe = new RegExp(
    `\\];\\s*\\n\\s*export const ${CC}_DENSIFY_HUB_COUNT`,
  );
  const m = text.match(countRe);
  const insertAt =
    m && m.index != null ? m.index : text.lastIndexOf('\n];');
  if (insertAt < 0) throw new Error(`Cannot find densify end in ${file}`);
  const block =
    `\n  // Wave A Asia densify (+${hubs.length})\n` +
    hubs.map(formatHub).join('\n') +
    '\n';
  text = text.slice(0, insertAt) + block + text.slice(insertAt);
  fs.writeFileSync(file, text);
  console.log(`[asiaA] ${cc}: appended +${hubs.length}`);
}

function wirePkHubs() {
  const file = path.join(SRC, 'career-pk-hubs.ts');
  let text = fs.readFileSync(file, 'utf8');
  if (!text.includes('PK_DENSIFY_HUBS')) {
    const lastImport = [...text.matchAll(/^import .+;$/gm)].pop();
    if (!lastImport) throw new Error('No import in pk hubs');
    const at = lastImport.index + lastImport[0].length;
    text = `${text.slice(0, at)}
import { PK_DENSIFY_HUBS, PK_DENSIFY_HUB_COUNT } from './career-pk-hubs-densify.js';${text.slice(at)}`;
  }
  if (!text.includes('...PK_DENSIFY_HUBS')) {
    const re = /(export const PK_CAREER_HUBS[\s\S]*?)(\n\];)/;
    text = text.replace(re, (_, body, close) => {
      const trimmed = body.replace(/,(\s*)$/, '$1');
      return `${trimmed},\n  ...PK_DENSIFY_HUBS${close}`;
    });
  }
  text = text.replace(
    /export const PK_CAREER_HUB_COUNT = 6;/,
    'export const PK_CAREER_HUB_COUNT = 6 + PK_DENSIFY_HUB_COUNT;',
  );
  fs.writeFileSync(file, text);
  console.log('[asiaA] wired career-pk-hubs.ts');
}

function preferredList(byIcao, used) {
  const list = [];
  for (const cc of Object.keys(PREFERRED)) {
    for (const [icao] of PREFERRED[cc]) {
      if (FORBIDDEN.has(icao) || used.has(icao)) continue;
      if (!byIcao.has(icao)) continue;
      list.push(icao);
    }
  }
  return list;
}

function probeIcaos(icaos) {
  fs.mkdirSync(ART, { recursive: true });
  const ok = new Set();
  const fail = [];
  for (let i = 0; i < icaos.length; i++) {
    const icao = icaos[i];
    console.log(`[probe] ${i + 1}/${icaos.length} ${icao}`);
    const r = spawnSync(
      'npm',
      ['run', 'career-hubs', '--', icao, '--yes'],
      {
        cwd: ROOT,
        encoding: 'utf8',
        shell: true,
        timeout: 60_000,
      },
    );
    const out = `${r.stdout || ''}\n${r.stderr || ''}`;
    if (/ok=1|FAIL/.test(out) === false && r.status === 0) {
      // single ICAO success often prints Done ok=1
    }
    if (/FAIL|not found|fail=1/i.test(out) && !/ok=1/.test(out)) {
      fail.push(icao);
      console.log(`  FAIL ${icao}`);
    } else if (/ok=1|Facility|stamped/i.test(out) || r.status === 0) {
      // Heuristic: no FAIL in output
      if (/FAIL|not found/i.test(out)) {
        fail.push(icao);
        console.log(`  FAIL ${icao}`);
      } else {
        ok.add(icao);
        console.log(`  OK ${icao}`);
      }
    } else {
      fail.push(icao);
      console.log(`  FAIL? ${icao}`);
    }
  }
  fs.writeFileSync(
    path.join(ART, 'asia-wave-a-probe.json'),
    JSON.stringify({ ok: [...ok], fail }, null, 2),
  );
  console.log(`[probe] ok=${ok.size} fail=${fail.length}`);
  return ok;
}

function main() {
  const args = new Set(process.argv.slice(2));
  const { byIcao, byCountry } = loadOurAirports();
  const used = existingIcaos();
  fs.mkdirSync(ART, { recursive: true });

  const prefs = preferredList(byIcao, used);
  fs.writeFileSync(
    path.join(ART, 'asia-wave-a-probe.txt'),
    prefs.join('\n') + '\n',
  );
  console.log(`[asiaA] preferred candidates ${prefs.length} → artifacts/asia-wave-a-probe.txt`);

  let probeOk = null;
  if (args.has('--probe')) {
    probeOk = probeIcaos(prefs);
  } else if (fs.existsSync(path.join(ART, 'asia-wave-a-probe.json'))) {
    const j = JSON.parse(
      fs.readFileSync(path.join(ART, 'asia-wave-a-probe.json'), 'utf8'),
    );
    probeOk = new Set(j.ok || []);
    console.log(`[asiaA] loaded probe ok=${probeOk.size}`);
  }

  // Prefer probe filter for preferred picks, but OA fill still allowed
  const { pickedAll, total } = pickHubs(
    byIcao,
    byCountry,
    used,
    null, // don't gate OA fill on probe — homolog missing after
  );

  // If we have probe results, reorder: prefer probed OK first per country
  if (probeOk && probeOk.size > 0) {
    for (const cc of Object.keys(pickedAll)) {
      const prefer = [];
      const rest = [];
      for (const h of pickedAll[cc]) {
        if (probeOk.has(h.icao)) prefer.push(h);
        else rest.push(h);
      }
      pickedAll[cc] = [...prefer, ...rest].slice(0, QUOTAS[cc]);
    }
  }

  for (const cc of Object.keys(pickedAll)) {
    writeAppendDensify(cc, pickedAll[cc]);
  }
  wirePkHubs();

  const allHubs = Object.values(pickedAll).flat();
  const fuel = [];
  for (let i = 0; i < allHubs.length; i += 3) fuel.push(allHubs[i].icao);
  fs.writeFileSync(
    path.join(ART, 'asia-wave-a-fuel.txt'),
    fuel.join('\n') + '\n',
  );
  console.log(
    `[asiaA] total +${allHubs.length}; fuel ${fuel.length}; assert airports ${2135 + allHubs.length}`,
  );
}

main();
