/**
 * Audit cargo hubs vs major count per country.
 * Guideline: ~1 major / 25–40 cargo hubs (floor 1). No promotions — report only.
 *
 * Usage: node scripts/analyze-major-balance.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createSeedEconomyWorld } = require(
  path.join(root, 'packages/shared/dist/career-economy.js'),
);

const LO = 25;
const HI = 40;

const w = createSeedEconomyWorld();
const by = new Map();
for (const a of w.airports) {
  if (a.bushTripOnly) continue;
  const c = a.countryId || (a.region && String(a.region).slice(0, 2)) || '?';
  if (!by.has(c)) by.set(c, { major: 0, regional: 0, spoke: 0, majors: [] });
  const t = a.hubTier || 'spoke';
  by.get(c)[t] = (by.get(c)[t] || 0) + 1;
  if (t === 'major') by.get(c).majors.push(a.icao);
}

function suggest(total, ratio) {
  return Math.max(1, Math.ceil(total / ratio));
}

const rows = [...by.entries()]
  .map(([c, t]) => {
    const total = t.major + t.regional + t.spoke;
    const sugHi = suggest(total, HI);
    const sugLo = suggest(total, LO);
    const deficitLo = Math.max(0, sugLo - t.major);
    const deficitHi = Math.max(0, sugHi - t.major);
    const surplus = Math.max(0, t.major - sugLo);
    const hubsPerMajor = t.major > 0 ? total / t.major : Infinity;
    let status;
    if (t.major === 0) status = 'NO_MAJOR';
    else if (deficitHi > 0) status = 'UNDER';
    else if (deficitLo > 0) status = 'SOFT';
    else if (surplus > 0 && hubsPerMajor < LO * 0.5) status = 'RICH';
    else if (surplus > 0) status = 'ABOVE';
    else status = 'OK';
    return {
      c,
      total,
      major: t.major,
      regional: t.regional,
      spoke: t.spoke,
      hubsPerMajor: t.major ? +hubsPerMajor.toFixed(1) : null,
      sugLo,
      sugHi,
      deficitLo,
      deficitHi,
      surplus,
      status,
      majors: t.majors.sort().join(','),
    };
  })
  .sort((a, b) => {
    const rank = {
      NO_MAJOR: 0,
      UNDER: 1,
      SOFT: 2,
      OK: 3,
      ABOVE: 4,
      RICH: 5,
    };
    return (
      rank[a.status] - rank[b.status] ||
      b.deficitLo - a.deficitLo ||
      b.total - a.total
    );
  });

const under = rows.filter((r) => r.status === 'UNDER' || r.status === 'NO_MAJOR');
const soft = rows.filter((r) => r.status === 'SOFT');
const large = rows.filter((r) => r.total >= 20);

console.log('Major balance audit (cargo hubs, bushTripOnly excluded)');
console.log(`Guideline: 1 major / ${LO}–${HI} hubs · seed ${w.airports.length}`);
console.log(
  'Status counts:',
  Object.fromEntries(
    ['NO_MAJOR', 'UNDER', 'SOFT', 'OK', 'ABOVE', 'RICH'].map((s) => [
      s,
      rows.filter((r) => r.status === s).length,
    ]),
  ),
);
console.log('\nUNDER / NO_MAJOR (all sizes):');
for (const r of under) {
  console.log(
    `  ${r.c}: ${r.major}M / ${r.total} hubs (${r.hubsPerMajor ?? '∞'}/M) → suggest ${r.sugHi}–${r.sugLo}  majors=${r.majors}`,
  );
}
console.log('\nSOFT (≥15 hubs):');
for (const r of soft.filter((x) => x.total >= 15)) {
  console.log(
    `  ${r.c}: ${r.major}M / ${r.total} hubs (${r.hubsPerMajor}/M) → suggest up to ${r.sugLo}  majors=${r.majors}`,
  );
}
console.log('\nLarge countries (≥20 hubs):');
for (const r of large) {
  console.log(
    `  ${r.status.padEnd(6)} ${r.c}: M${r.major} R${r.regional} S${r.spoke} = ${r.total}  (${r.hubsPerMajor}/M)`,
  );
}
