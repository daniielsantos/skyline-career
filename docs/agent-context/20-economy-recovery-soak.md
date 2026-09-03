# Economy recovery time + NPC-only 30d soak

Spec for a **measure** slice (not a flow retune). Dev agent: read this, reuse existing pulse/tick, implement only if the gaps below are still real.

Constraints: **do not** retune `CARGO_FLOW_BALANCE` / Dry. **Do not** commit pulse JSON dumps. **Do not** `--write` the live career save.

Related: `08-economy.md` (pulse numbers), `19-hub-stats.md` (daily samples), `career-economy-pulse.ts` (`computeEconomyPulse`, `sweepEconomyPulse`), CLI `career pulse --days N`.

## Why

Pulse already answers “is fill/pay/live% OK *now*?” and 150d live saves are mostly NPC. Two holes:

1. **Recovery time** — shocks exist (`maybeSpawnEvents`: harvest / outage / congestion / festival / strike) but nothing clocks “ticks until this region’s SKU fill returns to band.”
2. **Soak protocol** — `career pulse --days 7 --every-days 1` already sweeps, but nothing **copies** the save, forbids player Accept, or applies **gates**. 365d is optional later; **30d first**.

Player print-money on **Demand** (NPC does not Accept) is **out of scope** for this slice. Report Demand backlog during soak only.

---

## A. Recovery time (shock → fill band)

### Question

After a single injected shock, how many economy ticks until the **shocked region × commodity** fill is back inside a band around the **pre-shock baseline**, with **no player Accept**?

Sweet spot (qualitative, not auto-fail):

| Outcome | Meaning |
|---------|---------|
| Recovers in ≲ event duration | Shock is cosmetic; prémio never exists |
| Recovers in ~1–3× event duration after `endsAtTick` | NPC is a stabilizer; player still had a window |
| Never recovers before timeout | Shortage is sticky (vitality / skipAll / no lift) |

### Do not

- New price formula.
- Country-level p50 only (pulse `commodities[].fillP50` is **world**). Recovery is **region**.
- Random `maybeSpawnEvents` during the measured window (disable extra spawns or filter them out).

### Inject (reuse `EconomyEvent`)

One event, explicit, not the 1.75%/tick RNG:

```ts
world.events.push({
  id: `recovery_${tick}_${kind}`,
  kind,            // default factory_outage
  region,          // e.g. BR-SE — must have ≥1 hub stocking the SKU
  commodityId,     // electronics | machinery for outage
  startsAtTick: world.tick,
  endsAtTick: world.tick + durationTicks, // default 96 (1d); outage in code is 48–192
  label: 'recovery-probe',
});
```

Default probe: `factory_outage` + `electronics` + a dense region (BR-SE or US-SE). Duration **96 ticks** unless flagged.

Export a helper (e.g. `injectEconomyEventForProbe`) next to `maybeSpawnEvents` — same shape, testable, no UI.

### Metric

Per tick (or every 4 ticks / 1h):

- `fillP50` of `commodityId` across **cargo hubs in `region`** (exclude `bushTripOnly`).
- Baseline = median of last **8–16 ticks** *before* inject (or a 4h warm if the copy just loaded).
- **Recovered** when fill is within **±5 pt** of baseline for **8 consecutive ticks** (2h), and `world.tick >= endsAtTick` (don’t call it recovered while the shock is still on unless fill never moved — then mark `noEffect`).
- **Timeout** = `endsAtTick + 2 * TICKS_PER_DAY` (shock + 2d). Record `recovered: false`, last fill, shortage hub count.

Also log: `payPerKgP50` on lots with dest in region (optional; fill is the gate).

### CLI sketch

```text
career recovery --region BR-SE --kind factory_outage --commodity electronics \
  --duration-days 1 --save path --copy --out recovery.json
```

- `--copy`: work on a sibling file (`*.recovery.sqlite` / json), never the live path.
- Default `--save` same as other career commands.
- stdout: baseline fill, min fill during shock, recoveryTicks, recovered yes/no, timeout.
- JSON to `--out` (local, gitignored / not committed).

### Tests (tiny world)

- Seed or fixture with 2–3 hubs in one region, electronics consume-heavy dest + produce origin.
- Inject outage → fill drops or `noEffect` is explicit.
- With NPCs able to bid, recoveryTicks is finite before timeout **or** test documents sticky shortage (don’t retune Dry to make it pass).
- Inject is deterministic (`id` stable if rng seeded).

### Effort

Small: helper + region fill + CLI wrapping `tickEconomyN`. No Pulse UI required (dev CLI is enough). Optional later: one card on `/pulse`.

---

## B. NPC-only 30d soak

### Question

Copy of a **mature** save (or seed after warm), **zero player Accept / Demand fulfill / port buy**, 30 economy days. Does fill, pay/kg, live%, dead spokes, board size stay in the same band as day 0, or cliff?

This is Caso E with a protocol. Live 150d saves already hint NPC can hold Dry ~59%; soak must **not** densify or Accept in the middle.

### Reuse

`sweepEconomyPulse(world, { ticks: 30 * 96, every: 96 })` + CLI:

```text
career pulse --days 30 --every-days 1 --save COPY --out soak-30d.json
```

(`--write` off). That is almost the soak. Gaps to close:

1. **Copy** — refuse to run 30d against the live AppData save; require `--copy` or write only to `--out`.
2. **Player freeze** — at start: no `career accept`; abandon or ignore in-progress **player** missions (NPC `in_flight` must keep settling). Snapshot `missions` player vs NPC counts in the report.
3. **Demand backlog** — pulse has no Demand fields today. Add a **read-only** stub to the soak report (not necessarily to `computeEconomyPulse` forever): `openOrders`, `remainingKg` by commodity. Expect this to **grow** (player-only fulfill). Not a soak fail by itself.
4. **Gates** (advisory notes, not assert-fail in CI on the 1679-hub world):

| Signal | Watch |
|--------|--------|
| `general` fill p50 | stay in ~50–70% (live band ~59%); cliff >15 pt |
| BR / US `liveHubPct` | no drop ≥10 pt vs start (bush excluded, same as pulse) |
| `deadHubs` / spoke dead | no new country-scale graveyard |
| board `availableLots` | no explode past soft-cap pathology; no collapse to ~0 |
| `payPerKgP50` general | no crash to ~0 or moonshot |
| tick ms (optional `--profile`) | no 4s/tick regression; note npc bid share |

5. **SKU elasticity (read the JSON, don’t code a new market)** — in the same report, compare start→end fill/pay **shape** of `general` vs `electronics` / `machinery` / `perishables` / `supplies`. If they move in lockstep, they’re Dry skins. Comment in the out JSON `notes[]`; no new commodities.

### Runtime (order of magnitude)

~0.7 s/tick × 96 × 30 ≈ **30–40 min** CPU on a ~1700-hub save. Fine as a manual/dev command. **Do not** put 30d soak on default CI. Tiny-world test: 2 days (`--days 2`) on seed in a unit/integration test that only checks sweep finishes and `sampleCount`.

90d / 365d = same command, longer; only after 30d is boring.

### CLI sketch (thin wrapper)

```text
career soak --days 30 --save path --copy --out soak-30d.json [--profile]
```

Implementation: copy sqlite/json → `sweepEconomyPulse` → attach Demand stub + gate notes → write `--out`. Prefer this over a new `scripts/analyze-*.mjs` unless CLI copy of sqlite is painful (`openCareerStore`).

### Tests

- Seed world, `sweepEconomyPulse` 2 days, `sampleCount >= 3`, lots finite.
- `--copy` does not change original file bytes.
- Optional: Demand remainingKg non-decreasing when no player fulfill (if Demand is ticked).

---

## Implement?

**Yes, if still missing after reading the CLI** (`career pulse --days` already exists — don’t duplicate the sweeper).

Priority:

1. `career recovery` (new; real gap).
2. `career soak` as copy + gates + Demand stub on top of `sweepEconomyPulse`.
3. Skip Pulse UI, skip 365d, skip Demand ATM playtest, skip any Dry/knob change “to look greener.”

Pass/fail of the **1679-hub** 30d run is a human read of `--out`, not a red CI.

## Agent checklist

1. Confirm `sweepEconomyPulse` / `career pulse --days` still match this doc.
2. Add `injectEconomyEventForProbe` + region fill helper + tests.
3. CLI `recovery` + `soak --copy`.
4. Tiny tests only in CI; document how to run 30d on a copied save.
5. Update this file with the actual command names/paths when shipped.
6. One line in `06-open-work.md` when done.
