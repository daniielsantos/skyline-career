/**
 * Repair magnetic runway-number heading stubs in career-runways.json.
 *
 * merge-missing filled empty OA geometry with heading = ident×10 (magnetic).
 * Touchdown projection needs TRUE heading — wrong by local declination
 * (e.g. SBKG 150° mag stub vs ~125° true → false "OFF runway").
 *
 * Strategy:
 *  1. OurAirports LE→HE bearing when both ends exist (authoritative)
 *  2. Else if heading ≈ ident×10: convert mag→true via World Magnetic Model
 *     (geomagnetism). Skip when OA geometry already confirms the catalog heading.
 *
 *   npm run repair:runways:magnetic -w @msfs-compat/shared
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const geomagnetism = require('geomagnetism');

const __dirname = dirname(fileURLToPath(import.meta.url));
const sharedRoot = join(__dirname, '..');
const outPath = join(sharedRoot, 'src', 'data', 'career-runways.json');
const cacheDir = join(sharedRoot, '.cache', 'ourairports');
const RUNWAYS_CSV = join(cacheDir, 'runways.csv');

function angAbs(a, b) {
  const d = ((((a - b) % 360) + 540) % 360) - 180;
  return Math.abs(d);
}

function headingFromIdent(ident) {
  const m = String(ident ?? '')
    .trim()
    .toUpperCase()
    .match(/^(\d{1,2})/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 1 || n > 36) return null;
  return (n * 10) % 360;
}

function bearingDeg(lat1, lon1, lat2, lon2) {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dlon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dlon) * Math.cos(p2);
  const x =
    Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dlon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function num(v) {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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
      if (text[i] === '\n') {
        i += 1;
        break;
      }
      break;
    }
    if (row.length > 1 || (row.length === 1 && row[0] !== '')) rows.push(row);
  }
  return rows;
}

function rowsToObjects(rows) {
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).map((r) => {
    const o = {};
    for (let i = 0; i < header.length; i++) o[header[i]] = r[i] ?? '';
    return o;
  });
}

function declinationDeg(lat, lon) {
  const model = geomagnetism.model(new Date());
  // geomagnetism expects [lat, lon]
  return model.point([lat, lon]).decl;
}

/** Magnetic runway heading → true. Declination East-positive. */
function magneticToTrue(magneticDeg, lat, lon) {
  const decl = declinationDeg(lat, lon);
  return (((magneticDeg + decl) % 360) + 360) % 360;
}

async function main() {
  const catalog = JSON.parse(await readFile(outPath, 'utf8'));
  let oaByIdent = new Map();
  try {
    const csv = await readFile(RUNWAYS_CSV, 'utf8');
    for (const row of rowsToObjects(parseCsv(csv))) {
      const aid = String(row.airport_ident ?? '').trim().toUpperCase();
      if (!aid) continue;
      if (!oaByIdent.has(aid)) oaByIdent.set(aid, []);
      oaByIdent.get(aid).push(row);
    }
  } catch {
    console.warn('OA runways.csv missing — declination-only repairs');
  }

  let geoFixed = 0;
  let declFixed = 0;
  let skippedOk = 0;

  for (const [icao, rows] of Object.entries(catalog)) {
    if (!Array.isArray(rows)) continue;
    for (const rwy of rows) {
      const ident = String(rwy.ident ?? '').toUpperCase();
      const current = Number(rwy.headingTrueDeg);
      if (!Number.isFinite(current)) continue;

      // 1) Prefer OA threshold geometry.
      const oaRows = oaByIdent.get(icao) ?? [];
      const oa = oaRows.find(
        (row) => String(row.le_ident ?? '').trim().toUpperCase() === ident,
      );
      if (oa) {
        const leLat = num(oa.le_latitude_deg);
        const leLon = num(oa.le_longitude_deg);
        const heLat = num(oa.he_latitude_deg);
        const heLon = num(oa.he_longitude_deg);
        if (
          leLat != null &&
          leLon != null &&
          heLat != null &&
          heLon != null &&
          !(Math.abs(leLat) < 1e-9 && Math.abs(leLon) < 1e-9) &&
          !(Math.abs(heLat) < 1e-9 && Math.abs(heLon) < 1e-9)
        ) {
          const geo = bearingDeg(leLat, leLon, heLat, heLon);
          if (angAbs(current, geo) >= 2) {
            rwy.headingTrueDeg = Math.round(geo * 10) / 10;
            geoFixed += 1;
          } else {
            skippedOk += 1;
          }
          continue;
        }
      }

      // 2) Magnetic stub (ident×10) without OA ends → WMM mag→true.
      const fromIdent = headingFromIdent(ident);
      if (fromIdent == null || angAbs(current, fromIdent) > 3) {
        skippedOk += 1;
        continue;
      }
      const lat = Number(rwy.lat);
      const lon = Number(rwy.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        skippedOk += 1;
        continue;
      }
      const trueHdg = magneticToTrue(current, lat, lon);
      if (angAbs(current, trueHdg) < 2) {
        skippedOk += 1;
        continue;
      }
      rwy.headingTrueDeg = Math.round(trueHdg * 10) / 10;
      declFixed += 1;
    }
  }

  await writeFile(outPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  console.log(
    JSON.stringify(
      {
        geoFixed,
        declFixed,
        skippedOk,
        sbkg: catalog.SBKG?.[0]?.headingTrueDeg,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
