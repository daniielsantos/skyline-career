/**
 * Repair career-runways.json rows stuck at Null Island (lat=0, lon=0).
 *
 * Root cause: Number("") === 0 treated empty OurAirports end coords as valid,
 * so merge-missing wrote centers at 0,0 + heading 0 → touchdown debrief shows
 * multi-million-meter "OFF runway" offsets (e.g. SBCH RWY 11/29).
 *
 *   node packages/shared/scripts/repair-null-island-runways.mjs
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

const OA_AIRPORT_ALIASES = {
  EGCN: 'GB-1212',
  EVDA: 'LV-8040',
  LKHO: 'CZ-0268',
  RPVT: 'PH-0683',
  SAAJ: 'AR-0743',
  SACT: 'AR-0744',
  SBQV: 'BR-1961',
  SEQU: 'SEQM',
  MZSP: 'BZ-SPR',
};

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

/** Parse number; blank / missing → undefined (do NOT treat "" as 0). */
function num(v) {
  if (v == null) return undefined;
  const s = String(v).trim();
  if (s === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function isNullIsland(lat, lon) {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Math.abs(lat) < 1e-9 &&
    Math.abs(lon) < 1e-9
  );
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

function headingFromIdent(ident) {
  const m = String(ident ?? '')
    .trim()
    .toUpperCase()
    .match(/^(\d{1,2})/);
  if (!m) return null;
  let n = Number(m[1]);
  if (!Number.isFinite(n) || n < 1 || n > 36) return null;
  return (n * 10) % 360;
}

function buildRunway(row, airportFallback) {
  const lengthFt = num(row.length_ft);
  const widthFt = num(row.width_ft);
  if (!(lengthFt > 0)) return null;
  const leLat = num(row.le_latitude_deg);
  const leLon = num(row.le_longitude_deg);
  const heLat = num(row.he_latitude_deg);
  const heLon = num(row.he_longitude_deg);
  let lat;
  let lon;
  if (
    leLat != null &&
    leLon != null &&
    heLat != null &&
    heLon != null &&
    !isNullIsland(leLat, leLon) &&
    !isNullIsland(heLat, heLon)
  ) {
    lat = (leLat + heLat) / 2;
    lon = (leLon + heLon) / 2;
  } else if (leLat != null && leLon != null && !isNullIsland(leLat, leLon)) {
    lat = leLat;
    lon = leLon;
  } else if (heLat != null && heLon != null && !isNullIsland(heLat, heLon)) {
    lat = heLat;
    lon = heLon;
  } else if (
    airportFallback &&
    Number.isFinite(airportFallback.lat) &&
    Number.isFinite(airportFallback.lon) &&
    !isNullIsland(airportFallback.lat, airportFallback.lon)
  ) {
    lat = airportFallback.lat;
    lon = airportFallback.lon;
  } else {
    return null;
  }

  let heading = null;
  if (
    leLat != null &&
    leLon != null &&
    heLat != null &&
    heLon != null &&
    !isNullIsland(leLat, leLon) &&
    !isNullIsland(heLat, heLon)
  ) {
    const dLat = heLat - leLat;
    const dLon = heLon - leLon;
    const latMid = ((leLat + heLat) / 2) * (Math.PI / 180);
    heading =
      ((Math.atan2(dLon * Math.cos(latMid), dLat) * 180) / Math.PI + 360) % 360;
  }
  const ident = String(row.le_ident ?? '')
    .trim()
    .toUpperCase();
  const identReciprocal = String(row.he_ident ?? '')
    .trim()
    .toUpperCase();
  if (!ident) return null;
  if (heading == null) {
    heading =
      headingFromIdent(ident) ?? headingFromIdent(identReciprocal) ?? 90;
  }
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

function patchFromHub(
  broken,
  hubCoords,
) {
  if (
    !hubCoords ||
    !Number.isFinite(hubCoords.lat) ||
    !Number.isFinite(hubCoords.lon) ||
    isNullIsland(hubCoords.lat, hubCoords.lon)
  ) {
    return null;
  }
  const heading =
    headingFromIdent(broken.ident) ??
    headingFromIdent(broken.identReciprocal) ??
    (typeof broken.headingTrueDeg === 'number' && broken.headingTrueDeg !== 0
      ? broken.headingTrueDeg
      : 90);
  return {
    ...broken,
    lat: Math.round(hubCoords.lat * 1e6) / 1e6,
    lon: Math.round(hubCoords.lon * 1e6) / 1e6,
    headingTrueDeg: Math.round(heading * 10) / 10,
  };
}

function dedupeSort(list) {
  const seen = new Set();
  return list
    .filter((r) => {
      const key = `${r.ident}|${r.identReciprocal ?? ''}|${r.lengthM}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.lengthM - a.lengthM || a.ident.localeCompare(b.ident));
}

function runwayIsBroken(r) {
  return (
    !r ||
    !Number.isFinite(r.lat) ||
    !Number.isFinite(r.lon) ||
    isNullIsland(r.lat, r.lon)
  );
}

async function main() {
  const existing = JSON.parse(await readFile(outPath, 'utf8'));
  const { CAREER_HUB_COORDS } = await import(
    pathToFileURL(join(sharedRoot, 'dist', 'career-economy.js')).href
  );

  const brokenHubs = new Set();
  for (const [icao, rwys] of Object.entries(existing)) {
    if (!Array.isArray(rwys)) continue;
    for (const r of rwys) {
      if (runwayIsBroken(r)) brokenHubs.add(icao);
    }
  }
  console.log(`Hubs with Null Island / invalid runway centers: ${brokenHubs.size}`);
  if (brokenHubs.size === 0) {
    console.log('Nothing to repair');
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

  const airportCoordsByIdent = new Map();
  for (const a of airportRows) {
    const lat = num(a.latitude_deg);
    const lon = num(a.longitude_deg);
    if (lat == null || lon == null || isNullIsland(lat, lon)) continue;
    const gps = String(a.gps_code ?? '')
      .trim()
      .toUpperCase();
    const ident = String(a.ident ?? '')
      .trim()
      .toUpperCase();
    const coords = { lat, lon };
    if (ident) airportCoordsByIdent.set(ident, coords);
    if (gps) airportCoordsByIdent.set(gps, coords);
  }

  const hubIdents = new Map();
  for (const icao of brokenHubs) {
    const set = new Set([icao]);
    const alias = OA_AIRPORT_ALIASES[icao];
    if (alias) set.add(alias);
    hubIdents.set(icao, set);
  }
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

  /** @type {Map<string, object[]>} */
  const rebuilt = new Map();
  for (const icao of brokenHubs) rebuilt.set(icao, []);

  for (const row of runwayRows) {
    const airportIdent = String(row.airport_ident ?? '')
      .trim()
      .toUpperCase();
    const hub = identToHub.get(airportIdent);
    if (!hub) continue;
    const fallback =
      airportCoordsByIdent.get(airportIdent) ??
      CAREER_HUB_COORDS[hub] ??
      null;
    const rwy = buildRunway(row, fallback);
    if (!rwy || runwayIsBroken(rwy)) continue;
    rebuilt.get(hub).push(rwy);
  }

  let fromOa = 0;
  let fromHubPatch = 0;
  let stillBroken = 0;

  for (const icao of brokenHubs) {
    const oaList = dedupeSort(rebuilt.get(icao) ?? []);
    if (oaList.length > 0) {
      existing[icao] = oaList;
      fromOa += 1;
      continue;
    }
    // Keep length/idents from broken rows; only move center + fix heading 0.
    const prev = Array.isArray(existing[icao]) ? existing[icao] : [];
    const hubCoords =
      CAREER_HUB_COORDS[icao] ?? airportCoordsByIdent.get(icao) ?? null;
    const patched = [];
    for (const r of prev) {
      if (!runwayIsBroken(r)) {
        patched.push(r);
        continue;
      }
      const fixed = patchFromHub(r, hubCoords);
      if (fixed) patched.push(fixed);
    }
    if (patched.length > 0 && patched.every((r) => !runwayIsBroken(r))) {
      existing[icao] = dedupeSort(patched);
      fromHubPatch += 1;
    } else {
      stillBroken += 1;
      console.warn(`Still broken: ${icao}`);
    }
  }

  // Sanity: no Null Island left.
  let remain = 0;
  for (const rwys of Object.values(existing)) {
    if (!Array.isArray(rwys)) continue;
    for (const r of rwys) {
      if (runwayIsBroken(r)) remain += 1;
    }
  }

  await writeFile(outPath, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
  console.log(
    `Repaired OA rebuild ${fromOa}; hub-center patch ${fromHubPatch}; still broken hubs ${stillBroken}; remaining null-island rows ${remain}`,
  );
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
