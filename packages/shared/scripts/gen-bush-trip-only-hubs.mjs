/**
 * Build bushTripOnly hub defs from the 3 US Activities PLNs.
 * Airport nodes often lack WorldPosition — use preceding User WP coords.
 * MSFS overrides (shipped + profiles) win over PLN estimates — never OurAirports.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..', '..');
const plnDir = join(repoRoot, 'profiles', 'career', 'bush_PLN');
const shippedOverridesPath = join(
  __dirname,
  '..',
  'src',
  'data',
  'msfs-bush-hub-overrides.json',
);
const profileOverridesPath = join(
  repoRoot,
  'profiles',
  'career',
  'msfs-bush-hub-overrides.json',
);
const outTs = join(__dirname, 'bush-trip-only-hubs.generated.ts');
const outSrc = join(__dirname, '..', 'src', 'career-us-bush-trip-hubs.ts');

const US_ICAO_RE = /^K[A-Z]{3}$/;

const DISPLAY_NAMES = {
  O64: 'Breckenridge',
  '26A': 'Ashland / Lineville',
  CA51: 'Sea Ranch',
  '57NC': 'Sossamon Field',
  NC06: 'Elk River',
  WV09: 'Mike Ferrell Field',
  WV30: 'Rainelle',
  WV52: 'Green Bank Observatory',
  '2G4': 'Garrett County',
  O99: 'Olancha / Grant Airpark',
  O67: 'Manzanar',
  O56: 'California Pines / local',
  '3Q0': 'Mina',
  O77: 'Fallon / local',
  O43: 'Yerington Municipal',
  NV47: 'New Farm / local',
  H37: 'Herlong',
  '88NV': 'Black Rock City',
  NV16: 'Gerlach area / local',
  O39: 'Ravendale',
  '1Q2': 'Spalding',
  CA11: 'McCloud Airstrip',
  O79: 'Sierraville Dearwater',
  M45: 'Alpine County',
  O57: 'Bryant Field',
  O24: 'Lee Vining',
  '0O2': 'Baker',
  L61: 'Shoshone',
  L06: 'Furnace Creek',
  O26: 'Lone Pine / Death Valley',
  O22: 'Columbia',
  CA35: 'San Rafael',
};

function loadOverridesFile(path) {
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    if (!raw || typeof raw !== 'object') return {};
    /** @type {Record<string, { name: string, lat: number, lon: number }>} */
    const out = {};
    for (const [key, value] of Object.entries(raw)) {
      const icao = String(key).trim().toUpperCase();
      if (!icao || !value || typeof value !== 'object') continue;
      const row = value;
      if (
        typeof row.lat !== 'number' ||
        !Number.isFinite(row.lat) ||
        typeof row.lon !== 'number' ||
        !Number.isFinite(row.lon)
      ) {
        continue;
      }
      out[icao] = {
        name:
          typeof row.name === 'string' && row.name.trim()
            ? row.name.trim()
            : icao,
        lat: row.lat,
        lon: row.lon,
      };
    }
    return out;
  } catch (err) {
    console.warn('Failed to read overrides', path, err);
    return {};
  }
}

const MSFS_OVERRIDES = {
  ...loadOverridesFile(shippedOverridesPath),
  ...loadOverridesFile(profileOverridesPath),
};

function parseWorldPosition(raw) {
  const m = String(raw).match(
    /([NS])\s*(\d+)[°\s]+(\d+)['\s]+([\d.]+)"\s*,\s*([EW])\s*(\d+)[°\s]+(\d+)['\s]+([\d.]+)"/i,
  );
  if (!m) return undefined;
  let lat = Number(m[2]) + Number(m[3]) / 60 + Number(m[4]) / 3600;
  let lon = Number(m[6]) + Number(m[7]) / 60 + Number(m[8]) / 3600;
  if (m[1].toUpperCase() === 'S') lat = -lat;
  if (m[5].toUpperCase() === 'W') lon = -lon;
  return { lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4 };
}

function regionFromLonLat(lat, lon) {
  if (lon <= -115) return 'US-W';
  if (lon <= -104) return 'US-MT';
  if (lon <= -95 && lat < 36) return 'US-SC';
  if (lon <= -95) return 'US-MW';
  if (lon <= -84) return 'US-SE';
  return 'US-NE';
}

function cleanName(id) {
  if (!id.startsWith('@')) return id;
  const tail = id.split(',').pop()?.trim() ?? id;
  return tail.replace(/^TT:[^.]+\./, '').replace(/_/g, ' ');
}

/** @type {Map<string, { icao: string, name: string, lat: number, lon: number, region: string, msfsValidated: boolean }>} */
const hubs = new Map();

function upsert(icao, lat, lon, nameHint) {
  if (!icao || US_ICAO_RE.test(icao)) return;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  if (hubs.has(icao)) return;
  const ov = MSFS_OVERRIDES[icao];
  const useLat = ov?.lat ?? lat;
  const useLon = ov?.lon ?? lon;
  const name = ov?.name || DISPLAY_NAMES[icao] || nameHint || icao;
  hubs.set(icao, {
    icao,
    name,
    lat: useLat,
    lon: useLon,
    region: regionFromLonLat(useLat, useLon),
    msfsValidated: Boolean(ov),
  });
}

for (const file of [
  'Appalachian Summits.PLN',
  'California Dreams.PLN',
  'Breckenridge to Mariposa Yosemite.PLN',
]) {
  const xml = readFileSync(join(plnDir, file), 'utf8');
  const dep = xml.match(/<DepartureID>([^<]+)<\/DepartureID>/i)?.[1]?.trim()?.toUpperCase();
  const dest = xml.match(/<DestinationID>([^<]+)<\/DestinationID>/i)?.[1]?.trim()?.toUpperCase();

  let lastUserPos = null;
  let firstUserPos = null;
  const blockRe = /<ATCWaypoint\s+id="([^"]+)">([\s\S]*?)<\/ATCWaypoint>/gi;
  let m;
  while ((m = blockRe.exec(xml))) {
    const id = m[1];
    const body = m[2];
    const type = body.match(/<ATCWaypointType>([^<]+)<\/ATCWaypointType>/i)?.[1]?.trim();
    const posRaw = body.match(/<WorldPosition>([^<]+)<\/WorldPosition>/i)?.[1];
    const pos = posRaw ? parseWorldPosition(posRaw) : undefined;
    const icao = body.match(/<ICAOIdent>([^<]+)<\/ICAOIdent>/i)?.[1]?.trim()?.toUpperCase();

    if (type === 'User' && pos) {
      if (!firstUserPos) firstUserPos = pos;
      lastUserPos = pos;
      continue;
    }
    if (type === 'Airport' && icao && !US_ICAO_RE.test(icao)) {
      const use = pos || lastUserPos;
      if (use) upsert(icao, use.lat, use.lon, cleanName(id));
    }
  }

  if (dep && !US_ICAO_RE.test(dep) && firstUserPos) {
    upsert(dep, firstUserPos.lat, firstUserPos.lon, DISPLAY_NAMES[dep] || dep);
  }
  if (dest && !US_ICAO_RE.test(dest) && lastUserPos) {
    upsert(dest, lastUserPos.lat, lastUserPos.lon, DISPLAY_NAMES[dest] || dest);
  }
}

// Ensure every MSFS override appears even if missing from PLN parse.
for (const [icao, ov] of Object.entries(MSFS_OVERRIDES)) {
  if (hubs.has(icao)) continue;
  upsert(icao, ov.lat, ov.lon, ov.name);
}

const rows = [...hubs.values()].sort((a, b) => a.icao.localeCompare(b.icao));
console.log(`Generated ${rows.length} bushTripOnly hubs (${Object.keys(MSFS_OVERRIDES).length} MSFS overrides)`);
for (const r of rows) {
  console.log(
    `${r.icao}\t${r.region}\t${r.lat}\t${r.lon}\t${r.name}${r.msfsValidated ? '\tmsfs' : ''}`,
  );
}

function hubBlock(r) {
  return `  {
    icao: '${r.icao}',
    name: ${JSON.stringify(r.name)},
    region: '${r.region}',
    hubTier: 'spoke',
    lat: ${r.lat},
    lon: ${r.lon},
    bushTripOnly: true,${r.msfsValidated ? '\n    msfsValidated: true,' : ''}
    ...tripOnlySpoke,
  }`;
}

const header = `/**
 * FAA locals used only as bush-trip endpoints (not Market/ferry hubs).
 * Coords from Activities PLN (prev User WP), except MSFS overrides in
 * data/msfs-bush-hub-overrides.json (+ profiles/career overlay).
 * Regenerated via scripts/gen-bush-trip-only-hubs.mjs — do not edit by hand.
 */`;

const body = `
const tripOnlySpoke = {
  produce: { general: 0.4, supplies: 0.35 } as const,
  consume: { general: 0.4, supplies: 0.35 } as const,
};

export const US_BUSH_TRIP_ONLY_HUBS: readonly UsCareerHubDef[] = [
${rows.map(hubBlock).join(',\n')}
] as const;
`;

const genTs = `/** Auto-generated by scripts/gen-bush-trip-only-hubs.mjs — do not edit by hand. */
import type { UsCareerHubDef } from '../src/career-us-hubs.js';
${body}
`;

const srcTs = `${header}
import type { UsCareerHubDef } from './career-us-hubs.js';
${body}
`;

writeFileSync(outTs, genTs);
writeFileSync(outSrc, srcTs);
writeFileSync(join(__dirname, 'bush-trip-only-hubs.json'), JSON.stringify(rows, null, 2) + '\n');
console.log('Wrote', outTs);
console.log('Wrote', outSrc);
