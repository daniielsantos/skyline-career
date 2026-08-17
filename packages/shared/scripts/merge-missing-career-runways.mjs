/**
 * Merge OurAirports runway strips for hubs missing from career-runways.json.
 * Does NOT wipe curated existing rows (unlike full generate-career-runways.mjs).
 *
 *   node packages/shared/scripts/merge-missing-career-runways.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createWriteStream } from 'node:fs';
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
  if (
    tokens.has('CONC') ||
    tokens.has('CON') ||
    tokens.has('CONCRETE') ||
    tokens.has('CEMENT')
  )
    return 'concrete';
  if (tokens.has('GRASS') || tokens.has('TURF')) return 'grass';
  if (
    tokens.has('GRVL') ||
    tokens.has('GRAVEL') ||
    tokens.has('GVL') ||
    tokens.has('GRV')
  )
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
          cell += text[i];
          i += 1;
        }
      } else {
        while (i < len && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
          cell += text[i];
          i += 1;
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
  const header = rows[0] ?? [];
  return rows.slice(1).map((r) => {
    const o = {};
    for (let i = 0; i < header.length; i++) o[header[i]] = r[i] ?? '';
    return o;
  });
}

async function ensureCsv(name, url) {
  await mkdir(cacheDir, { recursive: true });
  const path = join(cacheDir, name);
  try {
    await readFile(path, 'utf8');
    return path;
  } catch {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(path));
    return path;
  }
}

function buildRunway(row) {
  const lengthFt = Number(row.length_ft);
  const widthFt = Number(row.width_ft);
  if (!(lengthFt > 0)) return null;
  const leLat = Number(row.le_latitude_deg);
  const leLon = Number(row.le_longitude_deg);
  const heLat = Number(row.he_latitude_deg);
  const heLon = Number(row.he_longitude_deg);
  let lat = Number.isFinite(leLat) ? leLat : heLat;
  let lon = Number.isFinite(leLon) ? leLon : heLon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let heading = null;
  if (
    Number.isFinite(leLat) &&
    Number.isFinite(leLon) &&
    Number.isFinite(heLat) &&
    Number.isFinite(heLon)
  ) {
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
  const existing = JSON.parse(await readFile(outPath, 'utf8'));
  const { listCareerHubIcaos } = await import(
    pathToFileURL(join(sharedRoot, 'dist', 'career-fleet.js')).href
  );
  const hubs = listCareerHubIcaos().filter((icao) => {
    const row = existing[icao];
    return !Array.isArray(row) || row.length === 0;
  });
  console.log(`Missing runway hubs: ${hubs.length}`);
  if (hubs.length === 0) {
    console.log('Nothing to merge');
    return;
  }

  const airportsPath = await ensureCsv('airports.csv', AIRPORTS_URL);
  const runwaysPath = await ensureCsv('runways.csv', RUNWAYS_URL);
  const airportRows = rowsToObjects(
    parseCsv(await readFile(airportsPath, 'utf8')),
  );
  const runwayRows = rowsToObjects(
    parseCsv(await readFile(runwaysPath, 'utf8')),
  );

  const hubIdents = new Map();
  for (const icao of hubs) hubIdents.set(icao, new Set([icao]));
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
  const identToHub = new Map();
  for (const [icao, idents] of hubIdents) {
    for (const id of idents) identToHub.set(id, icao);
  }

  const added = {};
  for (const icao of hubs) added[icao] = [];
  for (const row of runwayRows) {
    const airportIdent = String(row.airport_ident ?? '')
      .trim()
      .toUpperCase();
    const hub = identToHub.get(airportIdent);
    if (!hub) continue;
    const rwy = buildRunway(row);
    if (!rwy) continue;
    added[hub].push(rwy);
  }
  for (const icao of Object.keys(added)) {
    const seen = new Set();
    added[icao] = added[icao]
      .filter((r) => {
        const key = `${r.ident}|${r.identReciprocal ?? ''}|${r.lengthM}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort(
        (a, b) => b.lengthM - a.lengthM || a.ident.localeCompare(b.ident),
      );
    if (added[icao].length > 0) existing[icao] = added[icao];
  }

  const stillMissing = hubs.filter(
    (i) => !Array.isArray(existing[i]) || existing[i].length === 0,
  );
  console.log(
    `Merged ${hubs.length - stillMissing.length}; still missing: ${stillMissing.join(', ') || 'none'}`,
  );
  await writeFile(outPath, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
