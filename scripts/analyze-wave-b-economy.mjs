/**
 * Wave B (Asia + Europe thin) economy snapshot via running Career API.
 * Usage: node scripts/analyze-wave-b-economy.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? 'http://127.0.0.1:8787';

const EU2 = ['IE', 'DK', 'NO', 'SE', 'FI', 'CH', 'AT'];
const EU3 = ['PL', 'CZ', 'SK', 'HU', 'EE', 'LV', 'LT'];
const EU4 = ['HR', 'SI', 'RO', 'BG', 'GR', 'RS'];
const ASIA_B = ['CN', 'IN', 'ID', 'JP', 'KR', 'TH', 'VN', 'MY', 'PH', 'MM', 'TW', 'AU'];

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

function summarize(label, ids, pulse) {
  let hubs = 0;
  let dead = 0;
  let lots = 0;
  console.log(`\n=== ${label} ===`);
  for (const id of ids) {
    const c = pulse.countries?.find((x) => x.countryId === id);
    if (!c) {
      console.log(id, 'missing');
      continue;
    }
    hubs += c.hubs;
    dead += c.deadHubs;
    lots += c.availableLots ?? 0;
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
    );
  }
  const live = hubs > 0 ? (1 - dead / hubs) * 100 : 0;
  console.log(
    `${label} TOTAL`,
    hubs,
    'hubs · dead',
    dead,
    '· lots',
    lots,
    '· live',
    `${live.toFixed(1)}%`,
  );
  return { hubs, dead, lots, livePct: live / 100 };
}

async function main() {
  const pulse = await getJson('/api/debug/economy-pulse');
  const day = Math.floor((pulse.tick ?? 0) / 96);
  console.log('=== Wave B densify lens @ day', day, 'tick', pulse.tick, '===');
  const eu2 = summarize('EU-2', EU2, pulse);
  const eu3 = summarize('EU-3', EU3, pulse);
  const eu4 = summarize('EU-4', EU4, pulse);
  const asia = summarize('Asia-B', ASIA_B, pulse);
  const gate =
    eu2.livePct >= 0.85 &&
    eu3.livePct >= 0.85 &&
    eu4.livePct >= 0.85 &&
    asia.livePct >= 0.85;
  console.log('\nGate live≥85% (EU-2/3/4 + Asia-B):', gate ? 'PASS' : 'FAIL');
  const rr = pulse.regionalRecovery ?? { activeRegions: 0 };
  console.log('regionalRecovery active', rr.activeRegions ?? 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
