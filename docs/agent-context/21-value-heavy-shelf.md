# Value / Heavy shelf — slice **CLOSED 2026-09-04** (PASS)

Base: measure 2026-09-03 → close G2b+H1 2026-09-04.  
Related: [`20-economy-recovery-soak.md`](./20-economy-recovery-soak.md), `career-economy.ts`.

**Estado final (NPC-only soak 7d):** elec fill **~65%**, lots **~520**, claimShare **~0.49**, recovery BR-SE **~128** ticks. Sem mais knobs neste slice; dial-back cosmético só com ask (G2c).

## Goal

Electronics/machinery deixam de ficar em **barbell ~9% fill + ~3k lots stuck**, e um `factory_outage` regional **rebound** em ~1–3× duração do choque — **sem** mexer Dry / `CARGO_FLOW_BALANCE` / general.

## Non-goals

- Retune `CARGO_FLOW_BALANCE` / Dry / last-mile GA.
- Supplies no mesmo PR.
- UI Pulse / Demand ATM / CI 30d full world.

## Baseline (pré-slice)

| Métrica | Valor observado |
|---------|-----------------|
| Soak 30d general fill | 35% → **68%** (OK) |
| Soak elec/mach fill | → **~9%** flat após dia 1 |
| Elec lots on board | 0 → **~3.1–3.3k** |
| claimShare (all) | ~**0.30** |
| Recovery BR-SE elec | 31.6% → 5.7% → **8.5% timeout** |
| Soft origin | `DRY_SURPLUS_ORIGIN_FILL = 0.48` |
| Heavy idle pay (pré) | `1.08` |
| Stale large recycle (pré) | progress **0.4**, max **4** |

---

## Phase A — Lift / board — **SHIPPED 2026-09-03**

| Lever | Antes → depois |
|-------|----------------|
| A1 `IDLE_LOT_PAY_MAX_MULT_HEAVY` | **1.08 → 1.25** (ainda &lt; LTL 1.4; = bulk 1.25) |
| A2 `STALE_LARGE_RECYCLE_PROGRESS` | **0.4 → 0.34** |
| A2 `STALE_LARGE_RECYCLE_MAX_PER_COMMODITY` | **4 → 7** |

Sem A3 (NPC bid bias). Sem bump de `COMMODITY_LARGE_AVAILABLE_SOFT_CAP`. Sem Dry/flow.

### Measure (user / next)

```text
node packages/agent/dist/cli.js career soak --days 7 --save "$env:APPDATA\Skyline Career\career\local-economy.json" --copy --out profiles/career/economy-soak-7d-after-A.json
node packages/agent/dist/cli.js career recovery --region BR-SE --kind factory_outage --commodity electronics --duration-days 1 --save "$env:APPDATA\Skyline Career\career\local-economy.json" --copy --out profiles/career/economy-recovery-br-se-after-A.json
```

| Gate | Alvo |
|------|------|
| Electronics fill p50 (end) | **≥ 18%** (aspiracional 25–40%) |
| Electronics availableLots | **&lt; ~2.2k** ou ↓ ≥25% vs ~3.2k |
| claimShare | **≥ 0.38** |
| General fill / BR·US live | sem cliff |
| Pay elec p50 | sem moonshot (&gt; ~2× ~$2.89) |
| Recovery | se ainda **timeout** sticky → Phase B |

Rebuild shared+agent antes de rodar. Não commitar JSONs.

### Measure after A (2026-09-03) — **FAIL heavy gates**

Artifacts: `economy-soak-7d-after-A.json`, `economy-recovery-br-se-after-A.json`.

| Gate | Result | Pass? |
|------|--------|-------|
| Elec fill p50 | **9.2%** (dia1→7 flat; same barbell) | **no** |
| Elec lots | **3088** (~flat vs ~3.2k) | **no** |
| claimShare | **0.33** (era ~0.30) | **no** (↑ ínfimo) |
| General / BR·US live | 67% / 97% / 99% | **yes** |
| Pay elec | ~$3.03/kg (não moonshot) | **yes** |
| Recovery BR-SE | 31.5→5.5→**8.6% timeout** | **no** (igual pré-A) |

Recycle/dia ↑ um pouco; idle 1.25 não moveu lift o bastante. **Next: Phase B** (soft-origin rebound) — A sozinho insuficiente.

---

## Phase B — Rebound pós-choque — **SHIPPED 2026-09-03**

| Lever | Valor |
|-------|--------|
| Soft origin sob relief | **0.30** (`VALUE_HEAVY_SOFT_ORIGIN_RELIEF_FILL`) |
| Bulk origin min fill sob relief | **0.32** (era 0.55) |
| Janela | **2d** após `endsAtTick` only (durante outage = sem relief) |
| SKUs / scope | electronics + machinery; só `region` do `factory_outage` |

Wired em `rankAirports` / `tryFormPair` / intl surplus set via `softOriginFillForFormation` + `isBulkSurplusOriginRow`.

### Measure after B (2026-09-03) — **FAIL** (relief never engages)

| Gate | Result |
|------|--------|
| Recovery | ainda **timeout** 31.5→5.6→**8.5%** (idêntico a A) |
| Max fill após `endsAtTick` | **~8.6%** |
| Relief thresholds | soft **0.30** / origin min **0.32** |

**Causa:** pós-outage o p50 regional **nunca sobe até a banda do relief**. Phase B só destrava hubs em ~30–45%; o rebound real está preso em **~6–9%**. Soft-origin 0.30 é no-op aqui.

Soak 7d: elec fill →**9.2%**, lots ~3k, claimShare **0.32** — mesma barbell; general/live OK.

### Next options (explicit ask)

| Opt | Ideia |
|-----|--------|
| **B2** | Relief **profundo** quando fill regional &lt; ~15% pós-outage: soft/origin ~**0.08–0.12** (ou isenção de soft enquanto `valueHeavyDeepRelief`) — só elec/mach × região × janela 2d |
| **C** | Micro `CARGO_FLOW_BALANCE` elec/mach (último recurso) |
| Measure | Contar hubs BR-SE com fill≥0.32 durante recovery (deve ser ~0 hoje) |

## Phase B2 — Deep relief — **SHIPPED 2026-09-03**

Quando a janela pós-outage está aberta **e** fill p50 regional &lt; **0.15**:

| | Standard B | Deep B2 |
|--|------------|---------|
| Soft origin | 0.30 | **0.10** |
| Origin min fill | 0.32 | **0.10** |
| Min surplus kg | 400 | **200** |

API: `valueHeavyReliefTier` → `none` \| `standard` \| `deep` (cached per world×tick×region×SKU).

### Measure after B2 (2026-09-03) — **FAIL**

| | |
|--|--|
| Recovery | 30.8% → 5.5% → **8.6% timeout** (mesma curva A/B) |
| Max fill após end | **~8.6%** |
| Shortage hubs | 17 flat |

Deep relief (0.10) **deveria** engajar (&lt;15%), mas o gate de recovery é **fill de warehouse**. Formar lots **drena** stock na origem; o p50 regional só sobe com entrega nos sinks ou acumulo prod−cons. O platô ~8.5% é equilíbrio de fluxo, não soft-origin.

**Conclusão:** A/B/B2 (lift/board/soft-origin) não movem este gate. Próximo real: **Phase C** (flow balance / prod pós-outage) **ou** redefinir sucesso do recovery (ex. lots formados + claim na região, não fill p50→baseline).

## Phase C — **SHIPPED 2026-09-03** (explicit ask)

| Lever | Antes → depois |
|-------|----------------|
| `CARGO_FLOW_BALANCE` electronics | prod **2.0→2.15**, cons **0.7→0.62** |
| `CARGO_FLOW_BALANCE` machinery | prod **2.05→2.2**, cons **0.68→0.6** |
| Post-outage (relief window only) | prod **×1.45**, cons **×0.75** |
| Deep soft / origin min | **0.10→0.20** (B2 tetava fill ~8–10%) |

Sem Dry/general. Post-outage mult só com `valueHeavySoftOriginReliefActive` (após `endsAtTick`, 2d, region×elec/mach).

### Measure after C (2026-09-03) — **PASS recovery**

| | Result |
|--|--------|
| Recovery BR-SE elec | **recovered=true** — 31.4% → 7.0% → **27.2%** in **216** ticks (~1.25d após fim do choque; sweet spot 1–3×) |
| Soak general / live | 67% / BR 94% / US 100% — OK (`[risk]` fill↑ falso; BR live watch −5 pt aceitável) |
| Elec fill soak end | **11.3%** (era ~9%) — barbell steady-state ainda existe; claimShare ~0.33 |
| Board | estável ~12k |

**Veredito:** Phase C resolve o **rebound pós-outage**. Prateleira Value em soak NPC-only continua magra (não cliff). Sem mais retune agora; opcional depois: claimShare/lift se quiser fill elec 25–40% em steady state.

## Phase D — **SHIPPED 2026-09-03** (steady-state lift / claimShare)

| Lever | Antes → depois |
|-------|----------------|
| `valueHeavyNpcLiftBonus` | NPC bid score +**0.34…0.89** em large elec/mach (×**1.25** heavy classes); hot path `consider`/`ceilingOf` + `scoreLotForNpc` |
| `IDLE_LOT_PAY_MAX_MULT_HEAVY` | **1.25→1.32** |
| `COMMODITY_LARGE_AVAILABLE_SOFT_CAP` elec/mach | **1100→900** |

Sem Dry / sem mais `CARGO_FLOW_BALANCE`.

### Gates (measure)

```text
career soak --days 7 --copy --out economy-soak-7d-after-D.json
career recovery --region BR-SE --commodity electronics --copy
```

| Métrica | Gate |
|---------|------|
| Elec fill (soak end) | aspiracional **≥18%** (não cliff se 12–17%) |
| Elec lots | ↓ vs ~3k |
| claimShare | **≥ 0.38** |
| general / live | sem cliff vs Phase C |
| Recovery BR-SE | ainda **PASS** |

### Measure after D (2026-09-03) — **FAIL heavy gates** (recovery OK)

Artifacts: `economy-soak-7d-after-D.json`, `economy-recovery-br-se-after-D.json` (repo root; não commit).

| Gate | Result | Pass? |
|------|--------|-------|
| Elec fill p50 end | **11.4%** (dia0 33.5% → dia1–7 flat ~11–12%; = Phase C) | **no** |
| Elec lots | **3074** (~flat vs ~3k) | **no** |
| claimShare (flow/day) | **0.33** (= C) | **no** |
| General / BR·US live | 67% / 98% / 100% | **yes** |
| Pay elec | ~$3.06/kg | **yes** |
| Recovery BR-SE | **recovered** 28.6→6.7→24.1% em **196** ticks | **yes** |

**Veredito:** lift no score + idle 1.32 + soft cap 900 **não alteram** form≫claim. Recovery pós-C permanece OK. Steady Value ainda barbell.

### Next (explicit ask)

| Opt | Ideia |
|-----|--------|
| **E1** | Cap / throttle **formação** large elec/mach quando board lots SKU alto (menos dump WH→board) |
| **E2** | Preferência de claim **mais dura** (threshold / exclusão de LTL concorrente) só elec/mach large |
| **E3** | Aceitar fill ~11% NPC-only; Value shelf é janela **player** (documentar + fechar slice) |
| Sem | Mais `CARGO_FLOW_BALANCE` / Dry sem ask |

## Phase E — **SHIPPED 2026-09-03** (E1 form throttle + E2 claim)

| Lever | Valor |
|-------|--------|
| `COMMODITY_LARGE_AVAILABLE_SOFT_CAP` elec/mach | **900→520** |
| Global `skipHeavy` | quando `largeByCommodity ≥ softCap` (não só partition) |
| Stale large recycle | progress **0.28**, max **10**/SKU; crowded também se global ≥55% cap |
| `valueHeavyNpcLiftBonus` | **0.55+0.75·expiry**, heavy ×**1.35** |
| `valueHeavyNpcLtlPenalty` | **0.55** Narrow/Wide em elec/mach &lt; large |

Sem Dry / sem mais flow balance.

### Gates (measure)

```text
npm run career -- soak --days 7 --copy --out economy-soak-7d-after-E.json
npm run career -- recovery --region BR-SE --commodity electronics --copy --out economy-recovery-br-se-after-E.json
```

| Métrica | Gate |
|---------|------|
| Elec fill end | **≥18%** aspiracional |
| Elec lots | **≪ 3k** (alvo &lt;~2.2k) |
| claimShare | **≥ 0.38** |
| general / live | sem cliff |
| Recovery | ainda **PASS** |

### Measure after E (2026-09-03) — **PARTIAL PASS**

Artifacts: `economy-soak-7d-after-E.json`, `economy-recovery-br-se-after-E.json` (repo root; não commit).

| Gate | Result | Pass? |
|------|--------|-------|
| Elec fill p50 end | **10.9%** (dia0 33% → flat ~11%; = D/C) | **no** |
| Elec lots | **2269** (era ~3.1k / D 3074) | **partial** (↓26%; alvo &lt;~2.2k) |
| claimShare | **0.41** (era ~0.33) | **yes** |
| General / BR·US live | 65% / 95% / 99% | **yes** (BR watch −5 pt) |
| Pay elec | ~$3.09/kg | **yes** |
| Recovery BR-SE | **recovered** 28.1→6.6→24.1% em **196** ticks | **yes** |

**Veredito:** E1+E2 **movem claimShare e enxugam a prateleira large**; não sobem warehouse fill (barbell — skipHeavy só large; LTL/small ainda drena WH). Recovery intacto.

### Next (explicit ask)

| Opt | Ideia |
|-----|--------|
| **E3** | Aceitar fill ~11% NPC-only; Value = janela **player** (fechar slice) |
| **F1** | Throttle **small** elec/mach formation quando board SKU alto / fill p50 baixo |
| **F2** | Soft-origin steady-state **mais alto** só elec/mach (cuidado recovery) |
| Sem | Mais `CARGO_FLOW_BALANCE` / Dry sem ask |

## Phase F — **SHIPPED 2026-09-03** (F1 small throttle + F2 steady soft-origin)

| Lever | Valor |
|-------|--------|
| `skipSmall` (Value) | large global ≥70% cap **ou** avail SKU ≥ **1800** **ou** large full |
| `VALUE_HEAVY_STEADY_SOFT_ORIGIN_FILL` | **0.58** (era Dry 0.48; relief pós-outage ainda override) |
| `VALUE_HEAVY_STEADY_ORIGIN_FILL_MIN` | **0.62** (era 0.55) |

Sem Dry / sem mais flow balance. Objetivo: WH fill sobe sem matar recovery.

### Gates (measure)

```text
npm run career -- soak --days 7 --copy --out economy-soak-7d-after-F.json
npm run career -- recovery --region BR-SE --commodity electronics --copy --out economy-recovery-br-se-after-F.json
```

| Métrica | Gate |
|---------|------|
| Elec fill end | **≥18%** aspiracional |
| Elec lots | **&lt; ~2.2k** |
| claimShare | **≥ 0.38** (manter E) |
| general / live | sem cliff |
| Recovery | ainda **PASS** |

### Measure after F (2026-09-03) — **PARTIAL PASS** (shelf OK, fill FAIL)

Artifacts: `economy-soak-7d-after-F.json`, `economy-recovery-br-se-after-F.json` (repo root; não commit).

| Gate | Result | Pass? |
|------|--------|-------|
| Elec fill p50 end | **10.8%** (flat ~11% desde dia2; = E/D/C) | **no** |
| Elec lots | **522** (era E 2269 / pré ~3k) | **yes** |
| claimShare | **0.44** (era E 0.41) | **yes** |
| General / BR·US live | 65% / 99% / 98% | **yes** |
| deadHubs | 43→**65** watch | mild |
| Recovery BR-SE | **recovered** 27.7→6.5→23.4% em **192** ticks | **yes** |

**Veredito:** F1+F2 **limpam a prateleira Value** e mantêm claimShare↑ / recovery. Warehouse fill p50 **não responde** — barbell estrutural (surplus nos hubs ricos; mediana nos vazios). Mais throttle de form não sobe fill.

### Next (explicit ask)

| Opt | Ideia |
|-----|--------|
| **E3** | Fechar slice: Value NPC-only ~11% fill + shelf viva é **janela player** |
| **G1** | Redistribuição / bias de dest para shortage hubs (sem Dry/flow) |
| **G2** | `CARGO_FLOW_BALANCE` elec/mach cons↓ ou prod↑ só com ask |
| Sem | Mais soft-cap / skipSmall (já saturado) |

## Phase G — **SHIPPED 2026-09-03** (G1 shortage dest bias)

| Lever | Valor |
|-------|--------|
| `VALUE_HEAVY_DEST_SOFT_FILL` | **0.72** (era 0.58 bulk) |
| Deep-shortage bypass | dest fill ≤**0.18** ignora `skipHeavy`/`skipSmall` |
| Dest pool | **20** (era 12); fill max **0.50** (era 0.45) |
| Pair order | Value: prioriza fill baixo antes de corridor weight |

Sem Dry / sem `CARGO_FLOW_BALANCE`. Objetivo: refill lado vazio do barbell sem reabrir dump livre.

### Gates (measure)

```text
npm run career -- soak --days 7 --copy --out economy-soak-7d-after-G.json
npm run career -- recovery --region BR-SE --commodity electronics --copy --out economy-recovery-br-se-after-G.json
```

| Métrica | Gate |
|---------|------|
| Elec fill end | **≥18%** aspiracional |
| Elec lots | manter **≪ 3k** (F era 522) |
| claimShare | **≥ 0.38** |
| general / live | sem cliff |
| Recovery | ainda **PASS** |

### Measure after G (2026-09-03) — **FAIL / REGRESSION vs F**

Artifacts: `economy-soak-7d-after-G.json`, `economy-recovery-br-se-after-G.json` (repo root; não commit).

| Gate | Result | vs F | Pass? |
|------|--------|------|-------|
| Elec fill p50 end | **11.4%** | ~igual | **no** |
| Elec lots | **2846** | era **522** | **no** (reabriu dump) |
| claimShare | **0.32** | era **0.44** | **no** |
| General / BR·US live | 67% / 95% / 99% | OK | **yes** |
| Recovery BR-SE | **recovered** 27.4→6.5→23.4% em **192** ticks | OK | **yes** |

**Veredito:** deep-shortage bypass **desfaz** o ganho F (lots/claimShare) e **não** move fill p50. Barbell não é falta de dest bias — surplus↔shortage via board não sobe a mediana dos vazios o bastante sob NPC-only.

### Next (explicit ask)

| Opt | Ideia |
|-----|--------|
| **G0** | Reverter G1 (manter F) — melhor steady shelf |
| **E3** | Fechar slice no estado **F**: Value ~11% fill + shelf viva = janela player |
| **G2** | `CARGO_FLOW_BALANCE` elec/mach (prod↑/cons↓) — só com ask explícito |
| Sem | Mais bypass / dest soft (já provado no-op no fill) |

## Phase G0+G2 — **SHIPPED 2026-09-03** (revert G1 + flow rebuild)

| Lever | Valor |
|-------|--------|
| **G0** | Reverte G1 (dest soft / deep-shortage bypass / pool 20 / fill-first order) — volta ao comportamento **F** na formação |
| **G2** `CARGO_FLOW_BALANCE` electronics | prod **2.15→2.35**, cons **0.62→0.52** |
| **G2** machinery | prod **2.2→2.4**, cons **0.6→0.5** |

Mantém F1/F2/E (shelf + claim). Sem Dry. Ask explícito via “continuar ajustes” pós-G FAIL.

### Gates (measure)

```text
npm run career -- soak --days 7 --copy --out economy-soak-7d-after-G2.json
npm run career -- recovery --region BR-SE --commodity electronics --copy --out economy-recovery-br-se-after-G2.json
```

| Métrica | Gate |
|---------|------|
| Elec fill end | **≥18%** aspiracional (G2 alvo) |
| Elec lots | perto de F (**≪ 3k**, ~500–1.5k) |
| claimShare | **≥ 0.38** (nível F) |
| general / live | sem cliff |
| Recovery | ainda **PASS** |

### Measure after G0+G2 (2026-09-04) — **PARTIAL PASS** (melhor fill até agora)

Artifacts: `economy-soak-7d-after-G2.json`, `economy-recovery-br-se-after-G2.json` (repo root; não commit).

| Gate | Result | vs F | Pass? |
|------|--------|------|-------|
| Elec fill p50 end | **14.6%** (trajetória 32→28→…→14.6; mid-soak ainda ≥18% até ~d5) | era **10.8%** | **partial** (&lt;18% end) |
| Elec lots | **520** | = F **522** | **yes** |
| claimShare | **0.45** | era **0.44** | **yes** |
| General / BR·US live | 65% / 99% / 98% | OK | **yes** |
| deadHubs | 41→65 watch | = F | mild |
| Recovery BR-SE | **recovered** 28.3→**9.7**→25.6% em **148** ticks | era 192 / min 6.5% | **yes** (melhor) |

**Veredito:** G0 restaurou shelf F. G2 **move fill** (~11%→~15% end; recovery min↑ e ticks↓). Ainda drena ao longo da semana — não estabiliza ≥18%. Melhor fatia Value até agora.

### Next (explicit ask)

| Opt | Ideia |
|-----|--------|
| **G2b** | Mais um passo flow (elec ~2.5/0.45) — measure |
| **E3** | Fechar slice: shelf+claim OK; fill NPC-only ~15% = janela player (aspiracional 25–40% com player) |
| **H1** | Soft-origin steady um pouco mais alto (0.58→0.62) p/ segurar WH no fim da semana |
| Sem | Reabrir G1 bypass |

## Phase G2b+H1 — **SHIPPED 2026-09-04** (flow step + hold soft-origin)

| Lever | Valor |
|-------|--------|
| `CARGO_FLOW_BALANCE` electronics | prod **2.35→2.5**, cons **0.52→0.45** |
| machinery | prod **2.4→2.55**, cons **0.5→0.45** |
| `VALUE_HEAVY_STEADY_SOFT_ORIGIN_FILL` | **0.58→0.62** |
| `VALUE_HEAVY_STEADY_ORIGIN_FILL_MIN` | **0.62→0.66** |

Relief pós-outage intacto. Sem Dry / sem G1.

### Gates (measure)

```text
npm run career -- soak --days 7 --copy --out economy-soak-7d-after-G2b.json
npm run career -- recovery --region BR-SE --commodity electronics --copy --out economy-recovery-br-se-after-G2b.json
```

| Métrica | Gate |
|---------|------|
| Elec fill end | **≥18%** (segurar mid-soak) |
| Elec lots | manter ~F (**≪ 3k**) |
| claimShare | **≥ 0.38** |
| general / live | sem cliff |
| Recovery | ainda **PASS** |

### Measure after G2b+H1 (2026-09-04) — **PASS**

Artifacts: `economy-soak-7d-after-G2b.json`, `economy-recovery-br-se-after-G2b.json` (repo root; não commit).

| Gate | Result | Pass? |
|------|--------|-------|
| Elec fill p50 end | **65.4%** (↑ contínua 32→65% na semana; surplus **1078** / short **778**) | **yes** (≥18%; acima da banda aspiracional 25–40% — watch “gordo”) |
| Mach fill end | **52.3%** | **yes** |
| Elec lots | **520** (= F) | **yes** |
| claimShare | **0.49** | **yes** |
| General / BR·US live | 64% / 98% / 98% | **yes** |
| deadHubs | 38→67 watch | mild |
| Recovery BR-SE | **recovered** 29.1→**14.2**→25.4% em **128** ticks | **yes** (melhor da série) |

**Veredito:** G2b+H1 **fecha o gap de fill** sem reabrir a prateleira. Recovery mais rápida e com piso mais alto. Slice Value/Heavy em estado jogável NPC-only; fill elec ~65% pode ser dial-back cosmético depois se a prateleira parecer “cheia demais” no WH.

## E3 — **CLOSED 2026-09-04**

Slice **encerrado** no estado G2b+H1 PASS. Não reabrir G1. Não retunar Dry. G2c (fill ~35–45%) só com ask explícito.

### Shipped stack (referência)

| Camada | O que ficou |
|--------|-------------|
| A | idle heavy **1.32**; stale large recycle **0.28** / max **10** |
| B/B2/C | soft-origin relief pós-outage + deep + flow nudge inicial + post-outage prod/cons |
| D/E | NPC lift + LTL penalty; soft cap large **520** + global `skipHeavy`; `skipSmall` @ board ≥1800 |
| F | steady soft-origin **→0.62** / origin min **→0.66** (H1) |
| G | **revertido** (G0) — bypass dest foi regressão |
| G2/G2b | `CARGO_FLOW_BALANCE` elec **2.5/0.45**, mach **2.55/0.45** |

Measure tooling: `npm run career -- soak|recovery … --copy` — ver [`20-economy-recovery-soak.md`](./20-economy-recovery-soak.md).
