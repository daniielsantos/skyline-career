/**
 * EU-1 Western core economy snapshot via running Career API.
 * Usage: node scripts/analyze-eu-west-economy.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? 'http://127.0.0.1:8787';

const EU1 = ['PT', 'ES', 'FR', 'GB', 'DE', 'NL', 'BE', 'IT'];

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

async function main() {
  const [pulse, history] = await Promise.all([
    getJson('/api/debug/economy-pulse'),
    getJson('/api/debug/hub-economy-history?days=30'),
  ]);
  const day = Math.floor(pulse.tick / 96);
  console.log('=== EU-1 West @ day', day, 'tick', pulse.tick, '===');
  let hubs = 0;
  let dead = 0;
  let lots = 0;
  for (const id of EU1) {
    const c = pulse.countries?.find((x) => x.countryId === id);
    if (!c) {
      console.log(id, 'missing');
      continue;
    }
    hubs += c.hubs;
    dead += c.deadHubs;
    lots += c.availableLots;
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
  }
  console.log(
    'TOTAL',
    hubs,
    'hubs · dead',
    dead,
    '· lots',
    lots,
    '· live',
    hubs > 0 ? `${(((hubs - dead) / hubs) * 100).toFixed(1)}%` : '—',
  );

  const last = history.days?.[history.days.length - 1];
  if (last?.byCountry?.EU) {
    const eu = last.byCountry.EU;
    console.log(
      '\nHistory day',
      last.dayIndex,
      'EU aggregate: live',
      `${(eu.liveHubPct * 100).toFixed(1)}%`,
      `(${eu.liveHubs}/${eu.hubs}) outbound`,
      eu.outboundLots,
      'payP50',
      eu.payP50Usd != null ? Math.round(eu.payP50Usd) : '—',
    );
  } else {
    console.log('\nNo EU aggregate in history yet (needs samples + focusCountries).');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
