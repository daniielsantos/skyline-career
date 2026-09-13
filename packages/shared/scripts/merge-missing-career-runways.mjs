/**
 * Merge OurAirports runway strips for hubs missing from career-runways.json.
 * Does NOT wipe curated existing rows (unlike full generate-career-runways.mjs).
 *
 *   node packages/shared/scripts/merge-missing-career-runways.mjs
 *   npm run generate:runways:missing -w @msfs-compat/shared
 *
 * Fallbacks when OA has no usable geometry:
 *  1. Career ICAO → OA local-ident aliases (closed / renamed fields)
 *  2. Runway rows with length but no ends → airport lat/lon + heading from RWY number
 *  3. Synthetic strip at CAREER_HUB_COORDS (tier-based length)
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createWriteStream } from 'node:fs';
import { createRequire } from 'node:module';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const sharedRoot = join(__dirname, '..');
const outPath = join(sharedRoot, 'src', 'data', 'career-runways.json');
const cacheDir = join(sharedRoot, '.cache', 'ourairports');
const AIRPORTS_URL =
  'https://davidmegginson.github.io/ourairports-data/airports.csv';
const RUNWAYS_URL =
  'https://davidmegginson.github.io/ourairports-data/runways.csv';
const FT_TO_M = 0.3048;

/** Career ICAO → OurAirports airport_ident when gps_code/ident diverge (closed / rename). */
const OA_AIRPORT_ALIASES = {
  EGCN: 'GB-1212', // Doncaster Sheffield (closed)
  EVDA: 'LV-8040', // Daugavpils (closed)
  LKHO: 'CZ-0268', // Holešov (closed)
  RPVT: 'PH-0683', // Tagbilaran (closed)
  SAAJ: 'AR-0743', // Junín (closed)
  SACT: 'AR-0744', // Chamical
  SBQV: 'BR-1961', // Vitória da Conquista Pedro Otacílio (closed)
  SEQU: 'SEQM', // Quito Mariscal Sucre (new field; career keeps SEQU)
  MZSP: 'BZ-SPR', // San Pedro John Greif II
};

/** Synthetic length when OA has zero runway rows (meters). */
const SYNTH_LENGTH_M = {
  spoke: 1_200,
  regional: 1_800,
  major: 2_800,
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

/** RWY 06 → 60°, RWY 36 → 360°→0° for heading math (normalize to 0–360). */
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

/**
 * @param {Record<string, string>} row
 * @param {{ lat: number; lon: number } | null} airportFallback
 */
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
    // ident×10 is MAGNETIC. Convert to true via WMM so touchdown projection
    // does not invent huge lateral offsets (SBKG 150→~125).
    const mag =
      headingFromIdent(ident) ?? headingFromIdent(identReciprocal) ?? 90;
    try {
      const geomagnetism = require('geomagnetism');
      const decl = geomagnetism.model(new Date()).point([lat, lon]).decl;
      heading = (((mag + decl) % 360) + 360) % 360;
    } catch {
      heading = mag;
    }
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

function synthesizeRunway(icao, coords, tier) {
  const lengthM = SYNTH_LENGTH_M[tier] ?? SYNTH_LENGTH_M.regional;
  const heading = 90;
  return {
    ident: '09',
    identReciprocal: '27',
    headingTrueDeg: heading,
    lengthM,
    widthM: 30,
    lat: Math.round(coords.lat * 1e6) / 1e6,
    lon: Math.round(coords.lon * 1e6) / 1e6,
    surface: 'asphalt',
    lighted: false,
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

async function main() {
  const existing = JSON.parse(await readFile(outPath, 'utf8'));
  const { listCareerHubIcaos } = await import(
    pathToFileURL(join(sharedRoot, 'dist', 'career-fleet.js')).href
  );
  const { CAREER_HUB_COORDS, hubTierOf } = await import(
    pathToFileURL(join(sharedRoot, 'dist', 'career-economy.js')).href
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

  /** @type {Map<string, { lat: number; lon: number }>} */
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
  for (const icao of hubs) {
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

  const added = {};
  for (const icao of hubs) added[icao] = [];
  let fromGeom = 0;
  let fromAirportCenter = 0;
  for (const row of runwayRows) {
    const airportIdent = String(row.airport_ident ?? '')
      .trim()
      .toUpperCase();
    const hub = identToHub.get(airportIdent);
    if (!hub) continue;
    const leLat = num(row.le_latitude_deg);
    const heLat = num(row.he_latitude_deg);
    const hasEnds = leLat != null || heLat != null;
    const fallback = airportCoordsByIdent.get(airportIdent) ?? null;
    const rwy = buildRunway(row, fallback);
    if (!rwy) continue;
    if (hasEnds) fromGeom += 1;
    else fromAirportCenter += 1;
    added[hub].push(rwy);
  }

  let fromAliasGeom = 0;
  for (const icao of Object.keys(added)) {
    added[icao] = dedupeSort(added[icao]);
    if (added[icao].length > 0) {
      existing[icao] = added[icao];
      if (OA_AIRPORT_ALIASES[icao]) fromAliasGeom += 1;
    }
  }

  let synth = 0;
  const stillAfterOa = hubs.filter(
    (i) => !Array.isArray(existing[i]) || existing[i].length === 0,
  );
  for (const icao of stillAfterOa) {
    const coords = CAREER_HUB_COORDS[icao];
    if (
      !coords ||
      !Number.isFinite(coords.lat) ||
      !Number.isFinite(coords.lon)
    ) {
      continue;
    }
    const tier = hubTierOf({ icao });
    existing[icao] = [synthesizeRunway(icao, coords, tier)];
    synth += 1;
  }

  const stillMissing = hubs.filter(
    (i) => !Array.isArray(existing[i]) || existing[i].length === 0,
  );
  console.log(
    `Merged OA ${hubs.length - stillAfterOa.length} (ends ${fromGeom}, airport-center ${fromAirportCenter}, alias hubs ${fromAliasGeom}); synth ${synth}; still missing: ${stillMissing.join(', ') || 'none'}`,
  );
  await writeFile(outPath, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
