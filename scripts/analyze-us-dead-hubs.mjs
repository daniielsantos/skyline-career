/**
 * US dead-hub breakdown via running Career API.
 * Usage: node scripts/analyze-us-dead-hubs.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? 'http://127.0.0.1:8787';

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

function countryFromRegion(region) {
  const m = /^([A-Z]{2})-/.exec(region ?? '');
  return m ? m[1] : '??';
}

function tierKey(h) {
  return h.hubTier ?? 'unknown';
}

function hubKind(h) {
  if (h.bushTripOnly) return 'bushTripOnly';
  if (h.bush) return 'bush';
  return 'network';
}

function summarizeDead(dead, allByIcao) {
  const byTier = {};
  const byKind = {};
  const nonK = [];
  for (const icao of dead) {
    const h = allByIcao.get(icao.toUpperCase()) ?? allByIcao.get(icao);
    const tier = h ? tierKey(h) : 'missing';
    const kind = h ? hubKind(h) : 'missing';
    byTier[tier] = (byTier[tier] ?? 0) + 1;
    byKind[kind] = (byKind[kind] ?? 0) + 1;
    if (!/^K[A-Z0-9]{2,3}$/.test(icao)) nonK.push(icao);
  }
  return { byTier, byKind, nonK };
}

async function main() {
  const [state, pulse, history, market] = await Promise.all([
    getJson('/api/state'),
    getJson('/api/debug/economy-pulse'),
    getJson('/api/debug/hub-economy-history?days=30'),
    getJson('/api/market?page=1&pageSize=8000'),
  ]);

  const hubs = state.hubs ?? [];
  const usHubs = hubs.filter((h) => countryFromRegion(h.region) === 'US');
  const byIcao = new Map(hubs.map((h) => [h.icao.toUpperCase(), h]));

  const usPulse = pulse.countries?.find((c) => c.countryId === 'US');
  const deadCount = usPulse?.deadHubs ?? 0;
  const liveCount = usHubs.length - deadCount;

  const originFromMarket = new Map();
  for (const lot of market.lots ?? []) {
    const o = (lot.originIcao ?? lot.origin ?? '').toUpperCase();
    if (!o) continue;
    originFromMarket.set(o, (originFromMarket.get(o) ?? 0) + 1);
  }

  const deadFromMarket = usHubs
    .filter((h) => (originFromMarket.get(h.icao.toUpperCase()) ?? 0) === 0)
    .map((h) => h.icao);

  const totalHubs = state.airportCount ?? hubs.length;
  const usQuotaEst = Math.max(
    50,
    Math.round(((1550 - 80) * usHubs.length) / Math.max(1, totalHubs)),
  );

  console.log('=== US dead hubs @ tick', pulse.tick, '===');
  console.log('US hubs:', usHubs.length, '| dead (pulse):', deadCount, '| live:', liveCount);
  console.log(
    'liveHubPct:',
    ((usPulse?.liveHubPct ?? 0) * 100).toFixed(1) + '%',
    '| US available lots (pulse country bucket):',
    usPulse?.availableLots,
  );
  console.log('World available lots (pulse):', pulse.availableLots);
  console.log('Market page totalLots:', market.totalLots, '| origins on page:', originFromMarket.size);
  console.log('Est. US partition quota (hub-proportional):', usQuotaEst, 'of soft cap ~1550');

  const deadSummary = summarizeDead(deadFromMarket, byIcao);
  console.log('\n--- Dead hub profile (market-origin proxy, all', deadFromMarket.length, 'dead) ---');
  console.log('by tier:', deadSummary.byTier);
  console.log('by kind:', deadSummary.byKind);
  console.log('non-K FAA codes:', deadSummary.nonK.length, deadSummary.nonK.slice(0, 15).join(', '));

  const liveByTier = {};
  for (const h of usHubs) {
    if (deadFromMarket.includes(h.icao)) continue;
    const t = tierKey(h);
    liveByTier[t] = (liveByTier[t] ?? 0) + 1;
  }
  const deadByTier = deadSummary.byTier;
  console.log('\n--- Live vs dead by tier ---');
  for (const tier of ['major', 'regional', 'spoke']) {
    const d = deadByTier[tier] ?? 0;
    const l = liveByTier[tier] ?? 0;
    const tot = d + l;
    console.log(
      `${tier}: ${l} live / ${d} dead (${tot} total, ${tot ? ((d / tot) * 100).toFixed(0) : 0}% dead)`,
    );
  }

  const bushDead = deadFromMarket.filter((icao) => byIcao.get(icao.toUpperCase())?.bushTripOnly);
  console.log('\nbushTripOnly dead:', bushDead.length, '/ US bushTripOnly', usHubs.filter((h) => h.bushTripOnly).length);

  const days = history.days ?? [];
  if (days.length) {
    console.log('\n--- US liveHubPct (hub_economy_history, cargo hubs only) ---');
    for (const day of days.slice(-10)) {
      const us = day.byCountry?.US;
      if (!us) continue;
      console.log(
        `day ${day.dayIndex}: live ${(us.liveHubPct * 100).toFixed(1)}% (${us.liveHubs}/${us.hubs}) outboundLots ${us.outboundLots}`,
      );
    }
  }

  const brPulse = pulse.countries?.find((c) => c.countryId === 'BR');
  if (brPulse) {
    console.log('\n--- BR compare ---');
    console.log(
      `BR: ${brPulse.deadHubs} dead / ${brPulse.hubs} hubs (${((brPulse.liveHubPct ?? 0) * 100).toFixed(1)}% live)`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
