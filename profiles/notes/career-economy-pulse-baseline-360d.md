# Career economy pulse baseline — 360 days

Archived reference after dry sweeps (2026-08). **Do not retune fills/pay from pulse alone** until playtest shows a gameplay problem.

## How to reproduce

```bash
node packages/agent/dist/cli.js career pulse --days 360
```

Local report path (gitignored): `profiles/career/economy-pulse-sweep.json`.  
This note + companion JSON are the durable baseline.

## Run metadata

| Field | Value |
|---|---|
| Days / ticks | 360 / 34 560 |
| Sample every | 96 ticks (1 day) |
| Samples | 361 (start + daily) |
| Command date (approx) | 2026-08-05 |
| Economy | in-memory only (`--write` not used) |
| Git context | post `77db1ec` balance + `6040c1c` net/margin + tick perf |

Companion machine-readable snapshot: [`career-economy-pulse-baseline-360d.json`](./career-economy-pulse-baseline-360d.json).

## Verdict (product)

| Area | Call |
|---|---|
| Physical fills | **Keep** — Value ~30–43%, Dry/general ~55%, supplies ~65% |
| Board creep | Accept slow rise (~4.6k → ~6.7k); UI only if crowded |
| Reward ladder | **Keep** — Value ~90–97% net after Jet-A is unlock jackpot; Dry/general ~45–50% is early work |
| Supplies margin creep (~45% → ~70%) | Watch in playtest; no code change yet |
| NPC | Crew-limited (~70 resting, util ~37%, ready ~3–11%, thin 11/11) — accept as hot/duty market |
| Hub specialization | Keep soft produce/consume biases; no hard commodity removal |
| New commodities | Defer |
| Next work | Playtest early Dry career + board legibility — not more 360d retunes |

## Start → end (day 0 → 360)

### Board

| Metric | Start | End | Δ |
|---|---:|---:|---:|
| Available lots | 4 637 | 6 710 | +2 073 |
| Pay p50 | $9 066 | $13 029 | +$3 963 |
| Pay avg | $35 903 | $65 770 | +$29 867 |
| Intl share | 1% | 1% | ~0 |

### Commodities (p50)

| Commodity | Lots | Pay | Net | Margin | Fill |
|---|---:|---:|---:|---:|---:|
| electronics | 817→1246 | $31.2k→$49.7k | $28.1k→$44.8k | 96%→97% | 12%→38% |
| perishables | 1297→1424 | $6.7k→$9.5k | $3.9k→$7.5k | 75%→85% | 53%→58% |
| machinery | 803→1496 | $12.9k→$16.9k | $10.2k→$13.5k | 91%→90% | 11%→43% |
| general | 802→1172 | $3.8k→$4.4k | $1.0k→$2.0k | 47%→50% | 62%→55% |
| supplies | 918→1372 | $3.8k→$6.5k | $1.3k→$4.0k | 45%→71% | 71%→65% |

Net = pro-rata lot pay − Jet-A uplift for smallest class that can lift leftover (pulse estimate).

### NPC

| Metric | Start | End |
|---|---:|---:|
| Fleet | 160 | 160 |
| Airborne | 78 | 62 |
| Ready % | 11% | 3% |
| Util % | 49% | 39% |
| Thin regions | 11/11 | 11/11 |
| Cargo aloft kg | ~552k | ~725k |

## Year 1 vs year 2 (sample means)

| Window | Lots avg | Pay p50 avg | Util | Ready | Resting (avg) |
|---|---:|---:|---:|---:|---:|
| Days 0–180 | 5 719 | $17 188 | 37% | 5.7% | ~72 |
| Days 180–360 | 6 801 | $12 477 | 37% | 5.2% | ~73 |

Year 2 is a **plateau**: lots stabilize ~6.5–7k, pay softens after the ~day-30 peak, margins stay flat. No late-year collapse.

## Checkpoints (fills / margins / pressure)

| Day | Lots | Pay p50 | Ready | Util | Elec fill | Mach fill | Gen fill | Elec margin | Gen margin | Supp margin |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 4637 | 9066 | 11% | 49% | 12% | 11% | 62% | 96% | 47% | 45% |
| 90 | 5791 | 19450 | 6% | 36% | 30% | 36% | 57% | 97% | 54% | 77% |
| 180 | 6538 | 13744 | 3% | 39% | 41% | 41% | 56% | 97% | 53% | 68% |
| 270 | 6752 | 11982 | 6% | 39% | 35% | 35% | 55% | 97% | 44% | 67% |
| 360 | 6710 | 13029 | 3% | 39% | 38% | 43% | 55% | 97% | 50% | 71% |

## Design notes locked with this baseline

1. **Predictable attractor, noisy day-to-day** — closed sim with seeded RNG; regime is stable, freights are not.
2. **Early player** — Dry only; can profit with work (~50% general net); Value jackpot after unlock.
3. **Price spikes** — already mild via shocks / idle / thin fleet; amplify later only if UI makes them legible.
4. **Hub “specialization”** — existing produce/consume bias is enough; do not strip commodities from hubs yet.

## When to reopen balance

Re-run pulse / retune only if playtest shows:

- Early Dry cannot cover fuel + hangar, or
- Value feels mandatory/broken (never fly Dry again), or
- Board UI unusable from lot creep / dead regions.

Otherwise treat this file as the freeze point.
