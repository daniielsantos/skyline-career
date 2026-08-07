/**
 * Generate packages/shared/src/data/career-runways.json from OurAirports.
 *
 * Usage (from repo root, after shared build for hub ICAO list — or standalone):
 *   node packages/shared/scripts/generate-career-runways.mjs
 *
 * Downloads:
 *   https://davidmegginson.github.io/ourairports-data/airports.csv
 *   https://davidmegginson.github.io/ourairports-data/runways.csv
 */

import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sharedRoot = join(__dirname, '..');
const outPath = join(sharedRoot, 'src', 'data', 'career-runways.json');
const cacheDir = join(sharedRoot, '.cache', 'ourairports');

const AIRPORTS_URL =
  'https://davidmegginson.github.io/ourairports-data/airports.csv';
const RUNWAYS_URL =
  'https://davidmegginson.github.io/ourairports-data/runways.csv';

const FT_TO_M = 0.3048;

/** @param {string} surface */
function mapSurface(surface) {
  const s = String(surface ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, ' ');
  if (!s) return 'other';
  const tokens = new Set(s.split(/\s+/).filter(Boolean));
  if (tokens.has('WATER')) return 'water';
  if (
    tokens.has('ASPH') ||
    tokens.has('ASP') ||
    tokens.has('ASPHALT') ||
    tokens.has('BITUM') ||
    tokens.has('TARMAC') ||
    tokens.has('MACADAM')
  )
    return 'asphalt';
  if (tokens.has('CONC') || tokens.has('CON') || tokens.has('CONCRETE') || tokens.has('CEMENT'))
    return 'concrete';
  if (tokens.has('GRASS') || tokens.has('TURF')) return 'grass';
  if (tokens.has('GRVL') || tokens.has('GRAVEL') || tokens.has('GVL') || tokens.has('GRV'))
    return 'gravel';
  if (
    tokens.has('DIRT') ||
    tokens.has('SOIL') ||
    tokens.has('SAND') ||
    tokens.has('CLAY') ||
    tokens.has('EARTH')
  )
    return 'dirt';
  return 'other';
}

/** Minimal CSV parser (handles quoted fields). */
function parseCsv(text) {
  const rows = [];
  let i = 0;
  const len = text.length;
  while (i < len) {
    const row = [];
    while (i < len) {
      let cell = '';
      if (text[i] === '"') {
        i += 1;
        while (i < len) {
          if (text[i] === '"') {
            if (text[i + 1] === '"') {
              cell += '"';
              i += 2;
              continue;
            }
            i += 1;
            break;
          }
          cell += text[i++];
        }
      } else {
        while (i < len && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
          cell += text[i++];
        }
      }
      row.push(cell);
      if (text[i] === ',') {
        i += 1;
        continue;
      }
      if (text[i] === '\r') i += 1;
      if (text[i] === '\n') i += 1;
      break;
    }
    if (row.length > 1 || (row.length === 1 && row[0] !== '')) rows.push(row);
  }
  return rows;
}

function rowsToObjects(rows) {
  const header = rows[0];
  if (!header) return [];
  return rows.slice(1).map((r) => {
    /** @type {Record<string, string>} */
    const o = {};
    for (let c = 0; c < header.length; c++) o[header[c]] = r[c] ?? '';
    return o;
  });
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  const body = Readable.fromWeb(res.body);
  await pipeline(body, createWriteStream(dest));
}

async function ensureCsv(name, url) {
  await mkdir(cacheDir, { recursive: true });
  const dest = join(cacheDir, name);
  try {
    await readFile(dest, 'utf8');
    return dest;
  } catch {
    console.log(`Downloading ${url} …`);
    await download(url, dest);
    return dest;
  }
}

async function loadHubIcaos() {
  const distUrl = pathToFileURL(
    join(sharedRoot, 'dist', 'career-fleet.js'),
  ).href;
  try {
    const mod = await import(distUrl);
    return mod.listCareerHubIcaos();
  } catch {
    // Fallback: scrape hub TS files for icao: 'XXXX'
    const hubFiles = [
      'career-br-hubs.ts',
      'career-us-hubs.ts',
      'career-ca-hubs.ts',
      'career-mx-hubs.ts',
    ];
    const set = new Set();
    for (const f of hubFiles) {
      const text = await readFile(join(sharedRoot, 'src', f), 'utf8');
      for (const m of text.matchAll(/\bicao:\s*'([A-Z0-9]{3,4})'/g)) {
        set.add(m[1]);
      }
    }
    return [...set].sort();
  }
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function buildRunway(row) {
  const lengthFt = num(row.length_ft);
  const widthFt = num(row.width_ft);
  if (lengthFt == null || lengthFt <= 0) return null;
  if (row.closed === '1') return null;

  const leLat = num(row.le_latitude_deg);
  const leLon = num(row.le_longitude_deg);
  const heLat = num(row.he_latitude_deg);
  const heLon = num(row.he_longitude_deg);
  let lat;
  let lon;
  if (leLat != null && leLon != null && heLat != null && heLon != null) {
    lat = (leLat + heLat) / 2;
    lon = (leLon + heLon) / 2;
  } else if (leLat != null && leLon != null) {
    lat = leLat;
    lon = leLon;
  } else if (heLat != null && heLon != null) {
    lat = heLat;
    lon = heLon;
  } else {
    return null;
  }

  let heading = num(row.le_heading_degT);
  if (heading == null) heading = num(row.he_heading_degT);
  if (heading != null && num(row.he_heading_degT) != null && heading === num(row.he_heading_degT)) {
    /* keep */
  }
  if (heading == null && leLat != null && heLat != null && leLon != null && heLon != null) {
    const dLat = heLat - leLat;
    const dLon = heLon - leLon;
    const latMid = ((leLat + heLat) / 2) * (Math.PI / 180);
    heading =
      ((Math.atan2(dLon * Math.cos(latMid), dLat) * 180) / Math.PI + 360) % 360;
  }
  if (heading == null) return null;

  const ident = String(row.le_ident ?? '')
    .trim()
    .toUpperCase();
  const identReciprocal = String(row.he_ident ?? '')
    .trim()
    .toUpperCase();
  if (!ident) return null;

  const widthM =
    widthFt != null && widthFt > 0 ? Math.round(widthFt * FT_TO_M * 10) / 10 : 45;

  const lightedRaw = String(row.lighted ?? '')
    .trim()
    .toLowerCase();
  const lighted =
    lightedRaw === '1' || lightedRaw === 'yes' || lightedRaw === 'true';

  return {
    ident,
    ...(identReciprocal ? { identReciprocal } : {}),
    headingTrueDeg: Math.round(heading * 10) / 10,
    lengthM: Math.round(lengthFt * FT_TO_M),
    widthM,
    lat: Math.round(lat * 1e6) / 1e6,
    lon: Math.round(lon * 1e6) / 1e6,
    surface: mapSurface(row.surface),
    lighted,
  };
}

async function main() {
  const hubIcaos = await loadHubIcaos();
  console.log(`Hub ICAOs: ${hubIcaos.length}`);

  const airportsPath = await ensureCsv('airports.csv', AIRPORTS_URL);
  const runwaysPath = await ensureCsv('runways.csv', RUNWAYS_URL);

  const airportRows = rowsToObjects(
    parseCsv(await readFile(airportsPath, 'utf8')),
  );
  const runwayRows = rowsToObjects(parseCsv(await readFile(runwaysPath, 'utf8')));

  /** ICAO → set of OurAirports idents that match this hub */
  const hubIdents = new Map();
  for (const icao of hubIcaos) hubIdents.set(icao, new Set([icao]));

  for (const a of airportRows) {
    const gps = String(a.gps_code ?? '')
      .trim()
      .toUpperCase();
    const ident = String(a.ident ?? '')
      .trim()
      .toUpperCase();
    if (gps && hubIdents.has(gps)) {
      hubIdents.get(gps).add(ident);
      hubIdents.get(gps).add(gps);
    }
    if (ident && hubIdents.has(ident)) {
      hubIdents.get(ident).add(ident);
      if (gps) hubIdents.get(ident).add(gps);
    }
  }

  /** airport_ident → hub ICAO */
  const identToHub = new Map();
  for (const [icao, idents] of hubIdents) {
    for (const id of idents) identToHub.set(id, icao);
  }

  /** @type {Record<string, object[]>} */
  const out = {};
  for (const icao of hubIcaos) out[icao] = [];

  for (const row of runwayRows) {
    const airportIdent = String(row.airport_ident ?? '')
      .trim()
      .toUpperCase();
    const hub = identToHub.get(airportIdent);
    if (!hub) continue;
    const rwy = buildRunway(row);
    if (!rwy) continue;
    out[hub].push(rwy);
  }

  // Dedupe by ident+reciprocal+length
  for (const icao of Object.keys(out)) {
    const seen = new Set();
    out[icao] = out[icao].filter((r) => {
      const key = `${r.ident}|${r.identReciprocal ?? ''}|${r.lengthM}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    out[icao].sort((a, b) => b.lengthM - a.lengthM || a.ident.localeCompare(b.ident));
  }

  const withRw = hubIcaos.filter((i) => out[i].length > 0).length;
  const missing = hubIcaos.filter((i) => out[i].length === 0);
  console.log(`Hubs with runways: ${withRw}/${hubIcaos.length}`);
  if (missing.length) console.log(`Missing: ${missing.join(', ')}`);

  await writeFile(outPath, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
