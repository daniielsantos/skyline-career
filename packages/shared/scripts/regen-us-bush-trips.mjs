/**
 * Regenerate packages/shared/src/career-bush-trips-us-data.json from Activities PLNs.
 * One-way catalog-hub collapsed legs (K**** + bushTripOnly; no synthetic return).
 *
 * Usage (from packages/shared after build):
 *   node scripts/regen-us-bush-trips.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sharedRoot = join(__dirname, '..');
const plnDir = join(sharedRoot, '..', '..', 'profiles', 'career', 'bush_PLN');
const outPath = join(sharedRoot, 'src', 'career-bush-trips-us-data.json');

const { bushTripDefFromPln } = await import(
  pathToFileURL(join(sharedRoot, 'dist', 'career-bush-pln.js')).href
);

const specs = [
  {
    file: 'Appalachian Summits.PLN',
    id: 'us-appalachian-summits',
    displayTitle: 'Appalachian Summits',
    summary:
      'Appalachian ridge tour from Ashland/Lineville (26A). One-way to Frederick.',
    payUsd: 12_000,
  },
  {
    file: 'California Dreams.PLN',
    id: 'us-california-dreams',
    displayTitle: 'California Dreams',
    summary:
      'California VFR tour from Catalina through the Sierra corridor. One-way to CA51.',
    payUsd: 14_000,
  },
  {
    file: 'Breckenridge to Mariposa Yosemite.PLN',
    id: 'us-breckenridge-yosemite',
    displayTitle: 'Breckenridge to Mariposa Yosemite',
    summary:
      'Long Sierra / Nevada tour from Breckenridge (O64) to Mariposa-Yosemite (KMPI). One-way.',
    payUsd: 16_000,
  },
];

const trips = specs.map((spec) => {
  const xml = readFileSync(join(plnDir, spec.file), 'utf8');
  return bushTripDefFromPln({
    id: spec.id,
    displayTitle: spec.displayTitle,
    summary: spec.summary,
    countryId: 'US',
    xml,
    payUsd: spec.payUsd,
    appendReturn: false,
    msfsValidated: true,
  });
});

writeFileSync(outPath, `${JSON.stringify(trips, null, 2)}\n`, 'utf8');
for (const t of trips) {
  const first = t.legs[0].fromIcao;
  const last = t.legs[t.legs.length - 1].toIcao;
  console.log(`${t.id}: ${t.legs.length} legs · ${first}→…→${last}`);
}
console.log(`Wrote ${outPath}`);
