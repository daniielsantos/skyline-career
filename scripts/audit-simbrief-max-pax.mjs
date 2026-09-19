#!/usr/bin/env node
/**
 * Diff (and optionally sync) Market catalog passenger seats vs the matched
 * SimBrief airframes.json row (`simbriefIcao` + `simbriefAirframeMatch`).
 *
 * Source of truth for charter Fit seats: **matched SimBrief `airframe_passengers`**.
 * OFP pack `passengerStations` are inject weight zones — reported for diagnostics
 * only; never used to cap catalog seats (airliner packs often have 2–8 zones).
 *
 *   node scripts/audit-simbrief-max-pax.mjs
 *   node scripts/audit-simbrief-max-pax.mjs --sync
 *   node scripts/audit-simbrief-max-pax.mjs --sync --include-fallback
 *
 * `--include-fallback` also rewrites SKUs that only hit Default (no match string).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = join(
  root,
  'packages',
  'shared',
  'src',
  'data',
  'career-player-airframes.json',
);
const AIRFRAMES_URL = 'https://www.simbrief.com/api/inputs.airframes.json';

const args = new Set(process.argv.slice(2));
const doSync = args.has('--sync');
const includeFallback = args.has('--include-fallback');

function findMatch(entry, matchRe) {
  const frames = entry?.airframes ?? [];
  if (frames.length === 0) return null;
  const re = matchRe ? new RegExp(matchRe, 'i') : null;
  for (const a of frames) {
    const hay = [a.airframe_name, a.airframe_comments, a.airframe_internal_id]
      .map(String)
      .join(' | ');
    if (!re || re.test(hay)) {
      return {
        id: a.airframe_internal_id,
        name: a.airframe_name,
        comments: a.airframe_comments,
        pax: Number(a.airframe_passengers),
        fallback: false,
      };
    }
  }
  const def =
    frames.find(
      (a) => String(a.airframe_comments).toLowerCase() === 'default',
    ) ?? frames[0];
  return def
    ? {
        id: def.airframe_internal_id,
        name: def.airframe_name,
        comments: def.airframe_comments,
        pax: Number(def.airframe_passengers),
        fallback: true,
      }
    : null;
}

function packPassengerStationCount(rolesPackRelPath) {
  if (!rolesPackRelPath) return null;
  const packPath = join(root, rolesPackRelPath);
  if (!existsSync(packPath)) return null;
  try {
    const pack = JSON.parse(readFileSync(packPath, 'utf8'));
    const roles = pack?.payload?.stationRoles?.passengerStations;
    if (Array.isArray(roles) && roles.length > 0) return roles.length;
    const mapped = (pack?.stationMap ?? []).filter(
      (s) => s && s.role === 'passenger',
    );
    return mapped.length > 0 ? mapped.length : null;
  } catch {
    return null;
  }
}

const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
const res = await fetch(AIRFRAMES_URL, { headers: { Accept: 'application/json' } });
if (!res.ok) throw new Error(`SimBrief airframes HTTP ${res.status}`);
const data = await res.json();

const rows = [];
let changed = 0;

for (const a of catalog) {
  if (a.enabled === false) continue;
  const icao = a.simbriefIcao;
  if (!icao) continue;

  const cfgIdx = (a.configurations ?? []).findIndex(
    (c) => c.role === 'passenger' && c.certificationState !== 'catalog_only',
  );
  const cfg = cfgIdx >= 0 ? a.configurations[cfgIdx] : null;
  const catalogPax = cfg?.passengerCapacity ?? a.maxPaxSeats ?? null;
  if (catalogPax == null) continue;

  const hit = findMatch(data[icao], a.simbriefAirframeMatch);
  if (!hit || !Number.isFinite(hit.pax) || hit.pax <= 0) {
    rows.push({
      typeId: a.typeId,
      icao,
      catalogPax,
      sbPax: null,
      target: null,
      status: 'NO_SB_PAX',
    });
    continue;
  }

  const packPath = cfg?.rolesPackRelPath ?? a.rolesPackRelPath;
  const stations = packPassengerStationCount(packPath);
  const target = hit.pax;
  const stationNote =
    stations != null && stations > 0 && stations !== target
      ? stations
      : stations;

  const status =
    catalogPax === target
      ? 'OK'
      : hit.fallback && !includeFallback
        ? 'MISMATCH_FALLBACK'
        : 'MISMATCH';

  rows.push({
    typeId: a.typeId,
    icao,
    catalogPax,
    sbPax: hit.pax,
    stations: stationNote,
    target,
    status,
    sbComments: hit.comments,
    fallback: hit.fallback,
  });

  const canWrite =
    doSync &&
    catalogPax !== target &&
    (!hit.fallback || includeFallback) &&
    target >= 1;

  if (canWrite) {
    if (typeof a.maxPaxSeats === 'number') a.maxPaxSeats = target;
    else if (a.loadLayout === 'pax_and_cargo' || cfg) a.maxPaxSeats = target;
    if (cfg) {
      cfg.passengerCapacity = target;
      const per =
        typeof cfg.baggageAllowanceLbPerPassenger === 'number' &&
        cfg.baggageAllowanceLbPerPassenger > 0
          ? cfg.baggageAllowanceLbPerPassenger
          : 55;
      const holdCap =
        typeof a.simconnectCargoHoldMaxLb === 'number' &&
        a.simconnectCargoHoldMaxLb > 0
          ? a.simconnectCargoHoldMaxLb
          : null;
      const bags = target * per;
      cfg.baggageCapacityLb =
        holdCap != null ? Math.min(holdCap, bags) : bags;
    }
    changed += 1;
  }
}

const bad = rows.filter((r) => r.status !== 'OK');
console.log(
  `checked ${rows.length} · ok ${rows.length - bad.length} · issues ${bad.length}` +
    (doSync ? ` · synced ${changed}` : ' · (dry-run; pass --sync to write)'),
);
if (bad.length) console.log(JSON.stringify(bad, null, 2));

if (doSync) {
  writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  console.log(`wrote ${catalogPath}`);
}
