/**
 * Top-up densify to reach ~2000 seed airports.
 * Usage: node scripts/topup-densify-2000.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'shared', 'src');

const HUBS = [
  { code: 'ie', icao: 'EIIR', name: 'Inisheer', region: 'IE-W', hubTier: 'spoke', lat: 53.0647, lon: -9.5108 },
  { code: 'dk', icao: 'EKKA', name: 'Karup', region: 'DK-W', hubTier: 'spoke', lat: 56.2975, lon: 9.12472 },
  { code: 'se', icao: 'ESMX', name: 'Vaxjo Kronoberg', region: 'SE-S', hubTier: 'spoke', lat: 56.9291, lon: 14.728 },
  { code: 'fi', icao: 'EFKT', name: 'Kittila', region: 'FI-N', hubTier: 'spoke', lat: 67.701, lon: 24.8468 },
  { code: 'ch', icao: 'LSME', name: 'Emmen', region: 'CH-C', hubTier: 'spoke', lat: 47.0925, lon: 8.305 },
  { code: 'cz', icao: 'LKHO', name: 'Holesov', region: 'CZ-E', hubTier: 'spoke', lat: 49.3128, lon: 17.57 },
  { code: 'hu', icao: 'LHPP', name: 'Pecs Pogany', region: 'HU-C', hubTier: 'spoke', lat: 45.9909, lon: 18.242 },
  { code: 'pl', icao: 'EPBP', name: 'Biala Podlaska', region: 'PL-C', hubTier: 'spoke', lat: 52.0753, lon: 23.1367 },
  { code: 'ro', icao: 'LRBM', name: 'Baia Mare', region: 'RO-W', hubTier: 'spoke', lat: 47.6584, lon: 23.4673 },
  { code: 'gr', icao: 'LGIO', name: 'Ioannina', region: 'GR-N', hubTier: 'spoke', lat: 39.6964, lon: 20.8225 },
];

function existing(code) {
  const set = new Set();
  for (const f of [`career-${code}-hubs.ts`, `career-${code}-hubs-densify.ts`]) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    for (const m of fs.readFileSync(p, 'utf8').matchAll(/icao:\s*'([A-Z0-9]+)'/g)) set.add(m[1]);
  }
  return set;
}

let added = 0;
for (const h of HUBS) {
  if (existing(h.code).has(h.icao)) {
    console.log('skip dupe', h.icao);
    continue;
  }
  const p = path.join(ROOT, `career-${h.code}-hubs-densify.ts`);
  let txt = fs.readFileSync(p, 'utf8');
  const block = `  {
    icao: '${h.icao}',
    name: ${JSON.stringify(h.name)},
    region: '${h.region}',
    hubTier: '${h.hubTier}',
    lat: ${h.lat},
    lon: ${h.lon},
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
`;
  txt = txt.replace(/(\n\];\n\nexport const [A-Z]+_DENSIFY_HUB_COUNT)/, `\n${block}$1`);
  fs.writeFileSync(p, txt);
  added += 1;
  console.log('+', h.icao);
}
console.log('added', added);
