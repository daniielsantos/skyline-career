/**
 * BR/US 7-day monitor from hub_economy_history + pulse.
 * Usage: node scripts/analyze-br-us-7d-monitor.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? 'http://127.0.0.1:8787';
const WINDOW_DAYS = 7;

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

function mean(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function min(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => (a < b ? a : b), arr[0]);
}

function max(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => (a > b ? a : b), arr[0]);
}

function pct(x) {
  return `${(x * 100).toFixed(1)}%`;
}

function fmt(n) {
  return n == null ? '—' : Math.round(n).toLocaleString('en-US');
}

function summarizeCountry(days, id) {
  const rows = days
    .map((d) => ({ day: d.dayIndex, row: d.byCountry?.[id] }))
    .filter((x) => x.row);
  const live = rows.map((x) => x.row.liveHubPct);
  const lots = rows.map((x) => x.row.outboundLots ?? 0);
  const pay = rows.map((x) => x.row.payP50Usd ?? null).filter((x) => x != null);
  return {
    rows,
    liveAvg: mean(live),
    liveMin: min(live),
    liveMax: max(live),
    lotsAvg: mean(lots),
    lotsMin: min(lots),
    lotsMax: max(lots),
    payAvg: mean(pay),
  };
}

function classify(countryId, s) {
  if (s.liveAvg == null || s.liveMin == null) return 'NO_DATA';
  if (countryId === 'BR') {
    if (s.liveAvg < 0.82 || s.liveMin < 0.75) return 'REGRESSION_RISK';
    if (s.liveAvg < 0.85) return 'WATCH';
    return 'OK';
  }
  if (countryId === 'US') {
    if (s.liveAvg < 0.88 || s.liveMin < 0.84) return 'REGRESSION_RISK';
    if (s.liveAvg < 0.9) return 'WATCH';
    return 'OK';
  }
  return 'OK';
}

async function main() {
  const [pulse, hist] = await Promise.all([
    getJson('/api/debug/economy-pulse'),
    getJson('/api/debug/hub-economy-history?days=30'),
  ]);

  const day = Math.floor((pulse.tick ?? 0) / 96);
  const days = (hist.days ?? []).filter((d) => d.dayIndex >= day - (WINDOW_DAYS - 1));

  const br = summarizeCountry(days, 'BR');
  const us = summarizeCountry(days, 'US');

  console.log(`=== BR/US 7d monitor @ day ${day} tick ${pulse.tick} ===`);
  console.log(`window: day ${day - (WINDOW_DAYS - 1)}..${day} (${days.length} samples)`);

  for (const [id, s] of [
    ['BR', br],
    ['US', us],
  ]) {
    console.log(`\n[${id}] status=${classify(id, s)}`);
    console.log(
      `live avg/min/max: ${pct(s.liveAvg ?? 0)} / ${pct(s.liveMin ?? 0)} / ${pct(s.liveMax ?? 0)}`,
    );
    console.log(
      `lots avg/min/max: ${fmt(s.lotsAvg)} / ${fmt(s.lotsMin)} / ${fmt(s.lotsMax)}`,
    );
    console.log(`payP50 avg: ${s.payAvg != null ? `$${Math.round(s.payAvg)}` : '—'}`);
    for (const x of s.rows) {
      console.log(
        `  day ${x.day}: live ${pct(x.row.liveHubPct)} · lots ${fmt(x.row.outboundLots)} · payP50 ${x.row.payP50Usd != null ? `$${Math.round(x.row.payP50Usd)}` : '—'}`,
      );
    }
  }

  const rr = pulse.regionalRecovery ?? { activeRegions: 0, regions: [] };
  console.log(`\nregionalRecovery active=${rr.activeRegions}`);
  if (rr.activeRegions > 0) {
    for (const r of rr.regions.filter((x) => x.active).slice(0, 12)) {
      console.log(
        `  ${r.region}: live ${pct(r.lastLivePct)} deadSpoke ${pct(r.lastDeadSpokeShare)} lowStreak ${r.lowLiveStreak} enteredDay ${r.enteredDay ?? '—'}`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
