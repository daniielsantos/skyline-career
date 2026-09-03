/**
 * BR/US skipAll vs vitality eligibility (densify live%).
 * Usage: node scripts/analyze-br-us-vitality.mjs [baseUrl]
 *
 * Confirms: skipAll frequent + dead spokes eligible >> fixed form budget (12).
 */
const BASE = process.argv[2] ?? 'http://127.0.0.1:8787';

const SOFT_CAP = 1550;
const INTL_SHARE = 80; // intlCommodityQuota floor-ish; matches seed ~80
const COUNTRY_FLOOR = 50;
const SPOKE_FILL_MIN = 0.14;
const VIABLE_KG = 180;
const FIXED_FORM_BUDGET = 12;
const FIXED_VITALITY_CAP = 16;
const US_TERRITORY_REGIONS = new Set([
  'US-HI',
  'US-PR',
  'US-VI',
  'US-GU',
  'US-AS',
  'US-MP',
]);

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

function countryFromRegion(region) {
  const m = /^([A-Z]{2})-/.exec(region ?? '');
  return m ? m[1] : '??';
}

function isNetwork(h) {
  return h.bushTripOnly !== true && h.bush !== true;
}

function isUsContinental(h) {
  return countryFromRegion(h.region) === 'US' && !US_TERRITORY_REGIONS.has(h.region);
}

function isUsTerritory(h) {
  return countryFromRegion(h.region) === 'US' && US_TERRITORY_REGIONS.has(h.region);
}

function quotaFor(countryHubs, totalHubs) {
  const pool = Math.max(0, SOFT_CAP - INTL_SHARE);
  return Math.max(COUNTRY_FLOOR, Math.round((pool * countryHubs) / Math.max(1, totalHubs)));
}

function clamp(lo, hi, n) {
  return Math.max(lo, Math.min(hi, n));
}

function scaledSpokeForm(spokeCount) {
  return clamp(12, 32, Math.ceil(spokeCount / 6));
}

function scaledSpokeCap(spokeCount) {
  return clamp(16, 48, Math.ceil(spokeCount / 4));
}

function scaledRegionalForm(regionalCount) {
  return clamp(8, 16, Math.ceil(regionalCount / 3));
}

async function analyzeCountry({
  id,
  hubs,
  lots,
  pulseCountry,
  totalHubs,
}) {
  const network = hubs.filter(isNetwork);
  const spokes = network.filter((h) => (h.hubTier ?? 'spoke') === 'spoke');
  const regionals = network.filter((h) => h.hubTier === 'regional');
  const majors = network.filter((h) => h.hubTier === 'major');

  const hubByIcao = new Map(hubs.map((h) => [h.icao.toUpperCase(), h]));
  const openByOriginSku = new Map();
  const openBySku = { general: 0, supplies: 0 };
  const openAnyOrigin = new Set();
  for (const lot of lots) {
    // Market board omits status; treat listed rows as available.
    if (lot.status && lot.status !== 'available' && lot.status !== 'reserved') {
      continue;
    }
    const o = (lot.originIcao ?? lot.origin ?? '').toUpperCase();
    if (!o) continue;
    const region = hubByIcao.get(o)?.region;
    if (countryFromRegion(region) !== id) continue;
    openAnyOrigin.add(o);
    const cid = lot.commodityId;
    if (cid !== 'general' && cid !== 'supplies') continue;
    openBySku[cid] = (openBySku[cid] ?? 0) + 1;
    const key = `${o}|${cid}`;
    openByOriginSku.set(key, (openByOriginSku.get(key) ?? 0) + 1);
  }

  const q = quotaFor(hubs.length, totalHubs);
  const skipAll = {
    general: openBySku.general >= q,
    supplies: openBySku.supplies >= q,
  };

  // Candidates: cargo spokes with zero open GA Dry for that SKU.
  const candidates = { general: [], supplies: [] };
  for (const sku of ['general', 'supplies']) {
    for (const h of spokes) {
      const open = openByOriginSku.get(`${h.icao.toUpperCase()}|${sku}`) ?? 0;
      if (open !== 0) continue;
      candidates[sku].push(h);
    }
  }

  // Stock check only for candidates (cap fetch count).
  async function countEligible(sku) {
    const list = candidates[sku].slice(0, 80);
    const eligible = [];
    const chunk = 16;
    for (let i = 0; i < list.length; i += chunk) {
      const batch = list.slice(i, i + chunk);
      const rows = await Promise.all(
        batch.map(async (h) => {
          try {
            const snap = await getJson(`/api/airport/${h.icao}?part=stock`);
            const pile = snap?.commodities?.find((c) => c.commodityId === sku);
            const stockKg = pile?.stockKg ?? 0;
            const cap = pile?.capacityKg ?? 0;
            const fill = cap > 0 ? stockKg / cap : 0;
            return { icao: h.icao, stockKg, fill };
          } catch {
            return null;
          }
        }),
      );
      for (const row of rows) {
        if (!row) continue;
        if (row.fill < SPOKE_FILL_MIN) continue;
        if (row.stockKg < VIABLE_KG) continue;
        eligible.push(row.icao);
      }
    }
    return {
      candidates: candidates[sku].length,
      sampled: list.length,
      eligible: eligible.length,
      sampleIcaos: eligible.slice(0, 12),
    };
  }

  const eligG = await countEligible('general');
  const eligS = await countEligible('supplies');

  console.log(`\n=== ${id} ===`);
  console.log(
    'pulse live',
    pulseCountry ? `${(pulseCountry.liveHubPct * 100).toFixed(1)}%` : '—',
    'dead',
    pulseCountry?.deadHubs ?? '—',
    'lots',
    pulseCountry?.availableLots ?? '—',
  );
  console.log(
    'network hubs',
    network.length,
    `(spoke ${spokes.length} / regional ${regionals.length} / major ${majors.length})`,
  );
  console.log(
    'quota/SKU est',
    q,
    '| open Dry general',
    openBySku.general,
    'supplies',
    openBySku.supplies,
    '| any-origin hubs',
    openAnyOrigin.size,
  );
  console.log('skipAll?', skipAll);
  console.log(
    'eligible dead spokes (fill≥14%, stock≥180, open GA Dry=0):',
    `general ${eligG.eligible}/${eligG.candidates} (sampled ${eligG.sampled})`,
    `supplies ${eligS.eligible}/${eligS.candidates} (sampled ${eligS.sampled})`,
  );
  console.log(
    'vs fixed budget form',
    FIXED_FORM_BUDGET,
    '/ cap',
    FIXED_VITALITY_CAP,
    '| scaled form',
    scaledSpokeForm(spokes.length),
    '/ cap',
    scaledSpokeCap(spokes.length),
    '| regional form',
    scaledRegionalForm(regionals.length),
  );
  const eligMax = Math.max(eligG.eligible, eligS.eligible);
  const gate =
    (skipAll.general || skipAll.supplies) && eligMax > FIXED_FORM_BUDGET;
  console.log('Fase1 gate (skipAll && eligible ≫ 12):', gate ? 'PASS' : 'FAIL');
  if (eligG.sampleIcaos.length) {
    console.log('  sample general eligible:', eligG.sampleIcaos.join(', '));
  }
}

async function main() {
  const [state, pulse, market] = await Promise.all([
    getJson('/api/state'),
    getJson('/api/debug/economy-pulse'),
    getJson('/api/market?page=1&pageSize=8000'),
  ]);

  const hubs = state.hubs ?? [];
  const lots = market.lots ?? [];
  const totalHubs = state.airportCount ?? hubs.length;
  const day = Math.floor((pulse.tick ?? 0) / 96);

  console.log('=== BR/US vitality @ day', day, 'tick', pulse.tick, '===');
  console.log('world hubs', totalHubs, '| market lots page', lots.length, '/', market.totalLots);

  const brHubs = hubs.filter((h) => countryFromRegion(h.region) === 'BR');
  const usHubs = hubs.filter((h) => countryFromRegion(h.region) === 'US');
  const usCont = usHubs.filter(isUsContinental);
  const usTerr = usHubs.filter(isUsTerritory);

  await analyzeCountry({
    id: 'BR',
    hubs: brHubs,
    lots,
    pulseCountry: pulse.countries?.find((c) => c.countryId === 'BR'),
    totalHubs,
  });
  await analyzeCountry({
    id: 'US',
    hubs: usHubs,
    lots,
    pulseCountry: pulse.countries?.find((c) => c.countryId === 'US'),
    totalHubs,
  });

  // Continental vs territory split (US)
  const origin = new Map();
  for (const lot of lots) {
    if (lot.status && lot.status !== 'available' && lot.status !== 'reserved') {
      continue;
    }
    const o = (lot.originIcao ?? lot.origin ?? '').toUpperCase();
    if (o) origin.set(o, (origin.get(o) ?? 0) + 1);
  }
  const contNet = usCont.filter(isNetwork);
  const terrNet = usTerr.filter(isNetwork);
  const contDead = contNet.filter((h) => (origin.get(h.icao.toUpperCase()) ?? 0) === 0);
  const terrDead = terrNet.filter((h) => (origin.get(h.icao.toUpperCase()) ?? 0) === 0);
  console.log('\n=== US continental vs territories (market-origin proxy) ===');
  console.log(
    'continental network',
    contNet.length,
    'dead',
    contDead.length,
    `(${contNet.length ? ((1 - contDead.length / contNet.length) * 100).toFixed(1) : '—'}% live)`,
  );
  console.log(
    'territory network',
    terrNet.length,
    'dead',
    terrDead.length,
    terrDead.map((h) => h.icao).join(', ') || '—',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
