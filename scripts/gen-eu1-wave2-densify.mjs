/**
 * EU-1 densify Wave 2 — append commercial hubs toward ~300 EU-1.
 * Usage: node scripts/gen-eu1-wave2-densify.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'packages', 'shared', 'src');
const OA = path.join(ROOT, 'packages', 'shared', '.cache', 'ourairports', 'airports.csv');

const FORBIDDEN = new Set(['LPPS','LPLA','GCTS','EDDT','EDFE','LEZG','LEBZ','LPVL','LPSI']);

const PREFERRED = {
  pt: [['LPSJ','PT-A','spoke','tourism'],['LPCR','PT-A','spoke','tourism'],['LPCV','PT-C','spoke','agro'],['LPIB','PT-C','spoke','city'],['LPJM','PT-N','spoke','agro'],['LPSN','PT-S','spoke','agro']],
  es: [['LERS','ES-E','spoke','city'],['LEHC','ES-N','spoke','agro'],['LELC','ES-S','spoke','tourism'],['LEMI','ES-S','regional','city'],['LEXJ','ES-N','spoke','city'],['LELL','ES-E','spoke','city'],['LECU','ES-C','spoke','city'],['LEVS','ES-C','spoke','city'],['GCHI','ES-CN','spoke','tourism'],['GCLA','ES-CN','spoke','tourism'],['GCGM','ES-CN','spoke','tourism'],['LEAS','ES-N','spoke','city']],
  fr: [['LFPB','FR-N','spoke','city'],['LFPN','FR-N','spoke','city'],['LFRG','FR-N','spoke','tourism'],['LFRK','FR-N','spoke','city'],['LFOK','FR-N','spoke','industrial'],['LFGJ','FR-E','spoke','agro'],['LFLY','FR-E','spoke','city'],['LFMH','FR-E','spoke','industrial'],['LFMQ','FR-S','spoke','tourism'],['LFCK','FR-S','spoke','agro'],['LFAT','FR-N','spoke','tourism'],['LFRO','FR-N','spoke','tourism'],['LFRT','FR-N','spoke','agro'],['LFQB','FR-E','spoke','agro'],['LFLN','FR-C','spoke','agro'],['LFEA','FR-N','spoke','tourism']],
  gb: [['EGJA','GB-S','spoke','tourism'],['EGJB','GB-S','spoke','tourism'],['EGNS','GB-M','spoke','tourism'],['EGPO','GB-N','spoke','tourism'],['EGPL','GB-N','spoke','tourism'],['EGPC','GB-N','spoke','tourism'],['EGHQ','GB-S','spoke','tourism'],['EGKB','GB-S','spoke','city'],['EGLF','GB-S','spoke','city'],['EGMD','GB-S','spoke','tourism'],['EGNJ','GB-M','spoke','industrial'],['EGPA','GB-N','spoke','tourism'],['EGEC','GB-N','spoke','tourism'],['EGCK','GB-M','spoke','agro']],
  de: [['EDMA','DE-S','spoke','industrial'],['EDMO','DE-S','spoke','industrial'],['EDQM','DE-S','spoke','agro'],['EDTY','DE-S','spoke','industrial'],['EDBC','DE-E','spoke','industrial'],['EDHI','DE-N','spoke','industrial'],['EDBH','DE-N','spoke','tourism'],['EDWE','DE-N','spoke','industrial'],['EDWR','DE-N','spoke','tourism'],['EDWS','DE-N','spoke','tourism'],['EDTF','DE-S','spoke','city'],['EDWL','DE-N','spoke','tourism'],['EDWJ','DE-N','spoke','tourism'],['EDXN','DE-N','spoke','tourism']],
  nl: [['EHDR','NL-C','spoke','agro'],['EHHO','NL-C','spoke','agro'],['EHHV','NL-C','spoke','city'],['EHOW','NL-C','spoke','agro'],['EHST','NL-C','spoke','agro'],['EHGG','NL-C','spoke','city'],['EHAM','NL-C','major','city'],['EHRD','NL-C','regional','city']],
  be: [['EBCV','BE-C','spoke','agro'],['EBGB','BE-C','spoke','city'],['EBTY','BE-C','spoke','agro'],['EBUL','BE-C','spoke','agro'],['EBZH','BE-C','spoke','city'],['EBAW','BE-C','spoke','city']],
  it: [['LIMZ','IT-N','spoke','tourism'],['LIPB','IT-N','spoke','agro'],['LICR','IT-S','spoke','tourism'],['LIBC','IT-S','spoke','agro'],['LICG','IT-S','spoke','tourism'],['LIPH','IT-N','spoke','tourism'],['LIPQ','IT-N','spoke','city'],['LIRI','IT-S','spoke','agro'],['LIQR','IT-C','spoke','agro'],['LIRQ','IT-C','spoke','city'],['LIRZ','IT-C','spoke','city'],['LIAF','IT-C','spoke','agro']],
};

const QUOTAS = { pt: 6, es: 12, fr: 16, gb: 14, de: 14, nl: 8, be: 6, it: 12 };
const DEFAULT_REGION = { pt: 'PT-C', es: 'ES-C', fr: 'FR-C', gb: 'GB-M', de: 'DE-W', nl: 'NL-C', be: 'BE-C', it: 'IT-C' };
const ISO = { pt: 'PT', es: 'ES', fr: 'FR', gb: 'GB', de: 'DE', nl: 'NL', be: 'BE', it: 'IT' };

const BIASES = {
  drySpoke: { produce: { general: 1.1, supplies: 1.0, perishables: 1.05 }, consume: { electronics: 0.9, machinery: 0.85 } },
  industrial: { produce: { machinery: 1.25, electronics: 1.15, general: 1.15 }, consume: { perishables: 1.05, supplies: 1.0 } },
  agro: { produce: { perishables: 1.35, general: 1.1, supplies: 1.0 }, consume: { electronics: 0.9, machinery: 0.85 } },
  city: { produce: { general: 1.2, electronics: 1.1, supplies: 1.0 }, consume: { perishables: 1.1, machinery: 0.9 } },
  tourism: { produce: { perishables: 1.15, general: 1.1, supplies: 1.05 }, consume: { electronics: 1.0, machinery: 0.85 } },
};

function parseCsvLine(line) {
  const out = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false; else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur); return out;
}

function loadOurAirports() {
  const text = fs.readFileSync(OA, 'utf8');
  const lines = text.split(/\r?\n/);
  const header = parseCsvLine(lines[0]);
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const byIcao = new Map();
  const byCountry = new Map();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]; if (!line) continue;
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

function existingIcaos(cc) {
  const set = new Set();
  for (const f of [`career-${cc}-hubs.ts`, `career-${cc}-hubs-densify.ts`]) {
    const p = path.join(SRC, f);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, 'utf8');
    for (const m of text.matchAll(/icao:\s*'([A-Z0-9]{4})'/g)) set.add(m[1]);
  }
  return set;
}

function formatHub(h) {
  const b = BIASES[h.kind] || BIASES.drySpoke;
  const prod = Object.entries(b.produce).map(([k, v]) => `${k}: ${v}`).join(', ');
  const cons = Object.entries(b.consume).map(([k, v]) => `${k}: ${v}`).join(', ');
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

function appendDensify(cc, hubs) {
  const file = path.join(SRC, `career-${cc}-hubs-densify.ts`);
  let text = fs.readFileSync(file, 'utf8');
  const countRe = new RegExp(`\\];\\s*\\n\\s*export const ${cc.toUpperCase()}_DENSIFY_HUB_COUNT`);
  const m = text.match(countRe);
  const insertAt = m && m.index != null ? m.index : text.lastIndexOf('\n];');
  if (insertAt < 0) throw new Error(`Cannot find densify array end in ${file}`);
  const block = `\n  // Wave 2 EU-1 densify (+${hubs.length})\n` + hubs.map(formatHub).join('\n') + '\n';
  text = text.slice(0, insertAt) + block + text.slice(insertAt);
  fs.writeFileSync(file, text);
  console.log(`[wave2] ${cc}: +${hubs.length} → ${file}`);
}

function main() {
  const { byIcao, byCountry } = loadOurAirports();
  const fuel = [];
  let total = 0;
  const pickedAll = {};

  for (const cc of Object.keys(QUOTAS)) {
    const have = existingIcaos(cc);
    const want = QUOTAS[cc];
    const out = [];
    const used = new Set(have);

    for (const [icao, region, hubTier, kind] of PREFERRED[cc] || []) {
      if (out.length >= want) break;
      if (FORBIDDEN.has(icao) || used.has(icao)) continue;
      if (hubTier === 'major') continue;
      const oa = byIcao.get(icao);
      if (!oa) { console.warn(`[wave2] skip ${icao}: not OA medium/large`); continue; }
      out.push({ icao, name: oa.name, region, hubTier: hubTier === 'regional' ? 'regional' : 'spoke', lat: oa.lat, lon: oa.lon, kind });
      used.add(icao);
    }

    const pool = (byCountry.get(ISO[cc]) || []).filter((icao) => {
      if (FORBIDDEN.has(icao) || used.has(icao)) return false;
      const oa = byIcao.get(icao);
      return oa && oa.type === 'medium_airport';
    }).sort();

    for (const icao of pool) {
      if (out.length >= want) break;
      const oa = byIcao.get(icao);
      out.push({ icao, name: oa.name, region: DEFAULT_REGION[cc], hubTier: 'spoke', lat: oa.lat, lon: oa.lon, kind: 'drySpoke' });
      used.add(icao);
    }

    if (out.length < want) console.warn(`[wave2] ${cc}: only ${out.length}/${want}`);
    pickedAll[cc] = out;
    for (let i = 0; i < out.length; i += 2) fuel.push(out[i].icao);
  }

  // BE shortfall → extra FR then NL from OA pool
  let beShort = QUOTAS.be - (pickedAll.be?.length || 0);
  if (beShort > 0) {
    console.log(`[wave2] BE shortfall ${beShort} → FR/NL redirect`);
    for (const cc of ['fr', 'nl']) {
      while (beShort > 0) {
        const have = new Set([...existingIcaos(cc), ...pickedAll[cc].map((h) => h.icao)]);
        const next = (byCountry.get(ISO[cc]) || []).find((icao) => {
          if (FORBIDDEN.has(icao) || have.has(icao)) return false;
          const oa = byIcao.get(icao);
          return oa && oa.type === 'medium_airport';
        });
        if (!next) break;
        const oa = byIcao.get(next);
        pickedAll[cc].push({ icao: next, name: oa.name, region: DEFAULT_REGION[cc], hubTier: 'spoke', lat: oa.lat, lon: oa.lon, kind: 'drySpoke' });
        fuel.push(next);
        beShort--;
      }
    }
  }

  for (const cc of Object.keys(pickedAll)) {
    appendDensify(cc, pickedAll[cc]);
    total += pickedAll[cc].length;
  }

  fs.mkdirSync(path.join(ROOT, 'artifacts'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'artifacts', 'eu1-wave2-fuel.txt'), fuel.join('\n') + '\n');
  console.log(`[wave2] total +${total}; fuel → artifacts/eu1-wave2-fuel.txt; assert airports ${2012 + total}`);
}

main();
