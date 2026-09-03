/**
 * Americas Wave A economy snapshot via running Career API.
 * Usage: node scripts/analyze-americas-economy.mjs [baseUrl]
 *
 * Gate before Wave B: affected-country live% ≥85% (7d avg) or stable without cliff; lots↑.
 * Excludes deep BR/US densify (Wave A did not add those).
 */
const BASE = process.argv[2] ?? 'http://127.0.0.1:8787';

/** Wave A densify countries + anchors (no new BR/US deep hubs). */
const WAVE_A = [
  'CA',
  'MX',
  'AR',
  'CL',
  'PE',
  'BO',
  'EC',
  'CO',
  'VE',
  'GY',
  'SR',
  'GF',
  'PA',
  'CR',
  'NI',
  'HN',
  'GT',
  'BZ',
  'CU',
  'DO',
  'HT',
  'JM',
  'BS',
  'GP',
  'GD',
];

const ANCHORS = ['BR', 'US'];

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

function printCountry(id, c) {
  if (!c) {
    console.log(id, 'missing');
    return { hubs: 0, dead: 0, lots: 0 };
  }
  console.log(
    id,
    'hubs',
    c.hubs,
    'live',
    `${(c.liveHubPct * 100).toFixed(1)}%`,
    'dead',
    c.deadHubs,
    'lots',
    c.availableLots,
    'fill',
    c.fillP50 != null ? `${Math.round(c.fillP50 * 100)}%` : '—',
    'payKg',
    c.payPerKgP50?.toFixed(2) ?? '—',
  );
  return { hubs: c.hubs, dead: c.deadHubs, lots: c.availableLots };
}

async function main() {
  const [pulse, history] = await Promise.all([
    getJson('/api/debug/economy-pulse'),
    getJson('/api/debug/hub-economy-history?days=30'),
  ]);
  const day = Math.floor(pulse.tick / 96);
  console.log('=== Americas Wave A @ day', day, 'tick', pulse.tick, '===');

  let hubs = 0;
  let dead = 0;
  let lots = 0;
  for (const id of WAVE_A) {
    const c = pulse.countries?.find((x) => x.countryId === id);
    const t = printCountry(id, c);
    hubs += t.hubs;
    dead += t.dead;
    lots += t.lots;
  }
  console.log(
    'WAVE_A TOTAL',
    hubs,
    'hubs · dead',
    dead,
    '· lots',
    lots,
    '· live',
    hubs > 0 ? `${(((hubs - dead) / hubs) * 100).toFixed(1)}%` : '—',
  );

  console.log('\n--- anchors (not densified in Wave A) ---');
  for (const id of ANCHORS) {
    const c = pulse.countries?.find((x) => x.countryId === id);
    printCountry(id, c);
  }

  const last = history.days?.[history.days.length - 1];
  if (last?.byCountry) {
    console.log('\nHistory day', last.dayIndex, 'focus buckets:');
    for (const id of ['BR', 'US', 'CA', 'MX', 'AR', 'CO']) {
      const b = last.byCountry[id];
      if (!b) continue;
      console.log(
        id,
        'live',
        `${(b.liveHubPct * 100).toFixed(1)}%`,
        `(${b.liveHubs}/${b.hubs}) outbound`,
        b.outboundLots,
        'payP50',
        b.payP50Usd != null ? Math.round(b.payP50Usd) : '—',
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
