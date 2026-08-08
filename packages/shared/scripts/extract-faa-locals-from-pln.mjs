/**
 * Extract Airport + Departure/Destination idents with coords from bush PLNs.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const plnDir = join(__dirname, '..', '..', '..', 'profiles', 'career', 'bush_PLN');

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
  // Rough US career regions
  if (lon <= -115) return 'US-W';
  if (lon <= -104) return 'US-MT';
  if (lon <= -95) return 'US-SC';
  if (lat >= 40 && lon <= -80) return 'US-MW';
  if (lon <= -84) return 'US-SE';
  return 'US-NE';
}

const US_ICAO_RE = /^K[A-Z]{3}$/;
const byIdent = new Map();

for (const file of [
  'Appalachian Summits.PLN',
  'California Dreams.PLN',
  'Breckenridge to Mariposa Yosemite.PLN',
]) {
  const xml = readFileSync(join(plnDir, file), 'utf8');
  const dep = xml.match(/<DepartureID>([^<]+)<\/DepartureID>/i)?.[1]?.trim()?.toUpperCase();
  const dest = xml.match(/<DestinationID>([^<]+)<\/DestinationID>/i)?.[1]?.trim()?.toUpperCase();
  const depPos = xml.match(/<DepartureLLA>([^<]+)<\/DepartureLLA>/i)?.[1];
  const destPos = xml.match(/<DestinationLLA>([^<]+)<\/DestinationLLA>/i)?.[1];

  const add = (ident, pos, nameHint) => {
    if (!ident || US_ICAO_RE.test(ident)) return;
    const existing = byIdent.get(ident);
    if (existing?.lat != null) return;
    byIdent.set(ident, {
      icao: ident,
      name: nameHint || ident,
      ...(pos || {}),
      source: file,
    });
  };

  if (dep) add(dep, depPos ? parseWorldPosition(depPos) : undefined, `${dep} (PLN departure)`);
  if (dest) add(dest, destPos ? parseWorldPosition(destPos) : undefined, `${dest} (PLN destination)`);

  const blockRe = /<ATCWaypoint\s+id="([^"]+)">([\s\S]*?)<\/ATCWaypoint>/gi;
  let m;
  while ((m = blockRe.exec(xml))) {
    const id = m[1];
    const body = m[2];
    const type = body.match(/<ATCWaypointType>([^<]+)<\/ATCWaypointType>/i)?.[1]?.trim();
    if (type !== 'Airport') continue;
    const icao = (body.match(/<ICAOIdent>([^<]+)<\/ICAOIdent>/i)?.[1] || id).trim().toUpperCase();
    if (US_ICAO_RE.test(icao)) continue;
    const posRaw = body.match(/<WorldPosition>([^<]+)<\/WorldPosition>/i)?.[1];
    const pos = posRaw ? parseWorldPosition(posRaw) : undefined;
    const name = id.startsWith('@') ? id.split(',').pop()?.trim() : id;
    add(icao, pos, name || icao);
  }
}

const rows = [...byIdent.values()].sort((a, b) => a.icao.localeCompare(b.icao));
for (const r of rows) {
  const region = r.lat != null ? regionFromLonLat(r.lat, r.lon) : '?';
  console.log(`${r.icao}\t${r.lat}\t${r.lon}\t${region}\t${r.name}\t${r.source}`);
}
console.log('COUNT', rows.length);
writeFileSync(
  join(__dirname, 'faa-locals-from-pln.json'),
  JSON.stringify(rows, null, 2),
);
