# Supplies shelf — slice **CLOSED 2026-09-04** (PASS)

Related: [`08-economy.md`](./08-economy.md), [`20-economy-recovery-soak.md`](./20-economy-recovery-soak.md), [`21-value-heavy-shelf.md`](./21-value-heavy-shelf.md) (Value CLOSED — não reabrir).

**Estado final (soak 7d @ day~337):** supplies fill **~83%**, surplus **~1325** / shortage **~492**, general/Value intactos. Sem mais knobs; dial-back cosmético (A2) só com ask.

## Baseline (live day ~337 + soak 30d)

| Métrica | Valor |
|---------|--------|
| Live day 337 supplies fill p50 | **12.3%** (p10 0% / p90 44%) |
| Surplus / shortage hubs | **61 / 1785** |
| Supplies lots | ~2.7k |
| Soak 30d (pré-Value close) | supplies → **~12%**; net warehouse **negative** |
| General (mesmo save) | **66%** — OK; não mexer |
| Elec/mach | ~74% / ~520 lots — Value CLOSED OK |

**Causa:** `CARGO_FLOW_BALANCE.supplies` era **0.26 / 1.28** — cons≫prod global (não é barbell de formação como Value). Soft-origin / skipSmall não aplicam o mesmo remédio.

## Non-goals

- Retune **general** / last-mile GA / Value elec-mach.
- UI / Demand ATM.
- Reabrir G1 Value bypass.

## Phase A — **SHIPPED 2026-09-04** (flow rebuild)

| Lever | Antes → depois |
|-------|----------------|
| `CARGO_FLOW_BALANCE` supplies prod | **0.26 → 0.82** |
| cons | **1.28 → 0.92** |

Só `supplies`. Existing saves pegam no próximo tick.

### Gates (measure)

```text
npm run career -- soak --days 7 --copy --save profiles/career/saves/117b3b109bb9/local-economy.json --out economy-soak-7d-supplies-A.json
npm run career -- pulse --save profiles/career/saves/117b3b109bb9/local-economy.json
```

(Ajuste `--save` se o slot ativo mudar.)

| Métrica | Gate |
|---------|------|
| Supplies fill end | **≥ 35%** (aspiracional **45–60%**) |
| Supplies surplus vs shortage | surplus sobe; shortage ↓ vs ~1785 |
| General fill / BR·US live | sem cliff vs baseline |
| Elec/mach lots+fill | sem regressão Value (lots ~520, fill não cliff) |
| Board | estável |

### Measure after A (2026-09-04) — **PASS** (fill alto)

Artifact: `economy-soak-7d-supplies-A.json` (repo root; não commit). Save `117b3b109bb9` day~337.

| Gate | Result | Pass? |
|------|--------|-------|
| Supplies fill end | **82.8%** (12.3%→56% d1→~83% d3+) | **yes** (≥35%; acima da banda 45–60% — watch “gordo”) |
| Surplus / shortage | **61/1786 → 1325/492** | **yes** |
| Supplies lots | 2662→**4670** | watch (board engordou) |
| General | 66.3%→**67.0%** | **yes** |
| Elec / mach | 73.7% / 73.1%, lots **520** | **yes** (Value OK) |
| BR / US live | 99% / 99% | **yes** |
| deadHubs | 72→**50** | **yes** |

**Veredito:** flow A **resolve** a escassez crônica. Fill estabiliza alto (~83%); lots supplies ↑. General/Value intactos.

## E3 — **CLOSED 2026-09-04**

Slice **encerrado** no estado Phase A PASS. Não retunar general/Value. A2 (fill ~50–60%) só com ask explícito.

### Shipped

| Lever | Valor |
|-------|--------|
| `CARGO_FLOW_BALANCE` supplies | prod **0.82**, cons **0.92** (era **0.26 / 1.28**) |
