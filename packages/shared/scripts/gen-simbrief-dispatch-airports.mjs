/**
 * Write packages/shared/src/data/simbrief-dispatch-airports.json from the
 * current cargo-hub catalogs (excludes bush / bushTripOnly).
 *
 *   npm run generate:simbrief-dispatch -w @msfs-compat/shared
 *
 * Confirm the ICAO in SimBrief Dispatch before adding a new cargo hub, then
 * re-run this script so CI stays green.
 */
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sharedRoot = join(here, '..');
const srcOut = join(sharedRoot, 'src', 'data', 'simbrief-dispatch-airports.json');
const distOut = join(sharedRoot, 'dist', 'data', 'simbrief-dispatch-airports.json');
const modUrl = pathToFileURL(
  join(sharedRoot, 'dist', 'career-simbrief-airports.js'),
).href;

const { listDispatchCareerHubIcaos, SIMBRIEF_DISPATCH_DENY_ICAOS } = await import(
  modUrl
);

const deny = new Set(SIMBRIEF_DISPATCH_DENY_ICAOS);
const icaos = listDispatchCareerHubIcaos().filter((icao) => !deny.has(icao));
const payload = {
  note: 'Cargo/Dispatch ICAOs confirmed for SimBrief. Bush-trip-only strips are exempt. Regenerated via scripts/gen-simbrief-dispatch-airports.mjs after adding a hub.',
  icaos,
};
const body = `${JSON.stringify(payload, null, 2)}\n`;

function atomicWrite(path, text) {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, text, 'utf8');
  renameSync(tmp, path);
}

atomicWrite(srcOut, body);
mkdirSync(dirname(distOut), { recursive: true });
atomicWrite(distOut, body);
console.log(`Wrote ${icaos.length} ICAOs → ${srcOut}`);
console.log(`Mirrored → ${distOut}`);
