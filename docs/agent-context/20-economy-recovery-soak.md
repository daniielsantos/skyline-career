# Economy recovery time + NPC-only soak

**Shipped (measure-only).** Does not retune Dry / `CARGO_FLOW_BALANCE`. Do not commit pulse/recovery/soak JSON dumps. Do not `--write` the live career save.

Related: `08-economy.md`, `19-hub-stats.md`, `career-economy-pulse.ts`, `career-economy-recovery-probe.ts`.

Naming: **fill recovery** (this doc / `career recovery`) ≠ **spoke `regionalRecovery`** controller (dead-spoke live%). Probe reports `spokeRecoveryEverActive` when the latter fired during the window.

## Commands

```text
# Shock → region×SKU fill back to band (in-memory clone with --copy)
msfs-compat-agent career recovery --region BR-SE --kind factory_outage \
  --commodity electronics --duration-days 1 --save path --copy --out recovery.json

# NPC-only soak (requires --copy; never writes economy)
msfs-compat-agent career soak --days 30 --every-days 1 --save path --copy --out soak-30d.json

# Short CI-friendly soak sample
msfs-compat-agent career soak --days 2 --save path --copy --out soak-2d.json
```

Shared API: `injectEconomyEventForProbe`, `regionCommodityFillP50`, `runRecoveryProbe`, `buildNpcOnlySoakReport`, `snapshotDemandBacklog`, `soakGateNotes`. Tick flag: `skipEventSpawn` on `tickEconomy` / `tickEconomyN`.

## A. Recovery time

After one injected shock (`factory_outage` default), how many ticks until region×commodity fill is back within ±5 pt of pre-shock baseline for 8 consecutive ticks **after** `endsAtTick`? Timeout = end + 2d. RNG event spawn disabled for the window.

Sweet spot (qualitative): recover in ~1–3× event duration after end → NPC stabilizes with a player window. Instant = cosmetic; never = sticky shortage (do not retune Dry to force pass).

## B. NPC-only soak

`buildNpcOnlySoakReport` → `sweepEconomyPulse` + Demand backlog stub + advisory gates (fill cliff, BR/US live%, dead hubs, board size, pay/kg, SKU lockstep). Expect Demand remainingKg to grow. Human-read `--out`; not CI assert on the full world.

Runtime ~0.7 s/tick × 96 × 30 ≈ 30–40 min on ~2k hubs. Skip default CI for 30d.

## Tests

`career-economy-recovery-probe.test.ts` — tiny world inject/fill/short probe; seed soak days=0; `skipEventSpawn` no RNG events.

## Live measure (2026-09-03) — AppData save

Artifacts (local, do not commit): `profiles/career/economy-recovery-br-se.json`, `economy-soak-30d.json`. Save tick clock was ~2 at load (board already warm).

### Recovery — BR-SE × electronics × factory_outage 1d

| | |
|--|--|
| Baseline → min → last | **31.6% → 5.7% → 8.5%** |
| Outcome | **timeout** (shock + 2d); `spokeRecoveryEverActive=false` |
| Shortage hubs | ~17 stuck |

Shock is real (not cosmetic). Post-end fill plateaus ~8% — **sticky regional shortage**.

### Soak — 30d NPC-only

| Signal | Start → end | Read |
|--------|-------------|------|
| General fill | 35% → **68%** | Healthy Dry band; advisory `[risk]` was **wrong direction** (rise ≠ cliff) |
| BR / US live | 62% → **96% / 99%** | NPC stabilizes network |
| Dead hubs | 315 → **51** | Strong clear |
| Board | 8.8k → 12k | Stable |
| Electronics fill | 33% → **9%** (day1 already ~13%) | Barbell steady state |
| Machinery fill | 33% → **9%** | Same shape |
| Supplies fill | 52% → **12%** | Net warehouse **negative** (Dry-like sink) |
| Electronics lots | 0 → **~3.1–3.3k** | Mass on board, not in terminal fill |
| Flow claimShare | ~**0.30** | Form ≫ claim; expired kg ≫ delivered |
| Demand remainingKg | 1.5M → 5.0M | Expected (player-only fulfill) |

### Diagnosis (no knob change)

1. **General / live%:** NPC-only soak is fine — do not touch Dry for this.
2. **Electronics/machinery warehouse fill:** not “zero production”. Soak net warehouse **positive** (~+4 Mt/day elec) while **p50 fill stays ~9%** → **barbell**: ~600 surplus hubs vs ~1350 shortage; median sits on the empty side. Day 0→1: formation dumps stock onto the board (elec lots 0→3k) faster than NPC lifts (`claimShare` ~30%; heavy idle pay cap only **1.08×**).
3. **Sticky recovery:** `factory_outage` cuts prod ×0.55; consumption continues → region drains below **soft origin ~48%** (`surplusKgAboveSoftOrigin`). While every hub is sub-soft, **no local surplus lots** form; rebound is local prod−cons climb only. Climbing 6%→~48% did not finish in shock+2d. Pay bump on outage lanes (×1.16 dest) is not enough if origins have nothing to ship.
4. **Supplies** collapse is a **different** mechanism (global cons>prod under flow balance) — don’t bundle with Value heavy shelf when retuning later.
5. **Next experiments (measure-only, if asked):** (a) recovery with longer timeout / post-warm tick; (b) count BR-SE hubs above soft-origin during rebound; (c) pulse claimShare + large-lot age for electronics only; (d) **still no** `CARGO_FLOW_BALANCE` / Dry change without explicit ask.

Value/Heavy shelf slice: **CLOSED** PASS — [`21-value-heavy-shelf.md`](./21-value-heavy-shelf.md). Dial-back cosmético (G2c) só com ask.

Supplies shelf: **CLOSED** PASS — [`22-supplies-shelf.md`](./22-supplies-shelf.md). Dial-back (A2) só com ask.
