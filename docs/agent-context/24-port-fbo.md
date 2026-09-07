# Port FBO — chão, não ar

Atualizado 2026-09-06. **Phase 0–10 shipped** (lease-out/crew off; Port FBO desk+stevedore; Base perks; Scout bridge+Demand+Haul; Port shuttle). **IH-1 Internal Haul pay shipped**. **1ª Base free** + **Base Dispatcher seat** (hire) + **fleet Market scout** (single-leg) + **tour Search** (2–3 Market legs) + **Active Tour** (Accept L2/L3, no multi-reserve).
Relacionado: [`08-economy.md`](./08-economy.md), [`16-va-logistics.md`](./16-va-logistics.md), [`23-port-xl-warehouse.md`](./23-port-xl-warehouse.md), [`10-aircraft-pool.md`](./10-aircraft-pool.md) (lease-out).

## Fantasia (uma frase)

Você é **operador de porto / FBO de chão**: compra, guarda, despacha last-mile terrestre e **você** (ou piloto VA humano) voa frete pago. Exceção: **Port shuttle** só move WH→WH bridge (custo, sem payout).

## Diagnóstico

| Peça hoje | O que é | Problema? |
|-----------|---------|-----------|
| **Port concession P1–P3** | CAPEX + lease diário + buffs (preço, ETA, listings, restock) | Saudável — é o embrião do Port FBO |
| **WH T1–T4 + yard + Demand** | Loop porto → stock → você voa | Core — manter |
| **Port XL / Wide haul** | Tronco gordo a partir do WH | Core — manter |
| **Airport FBO** (`career-fbo.ts`) | Base em hub: CAPEX, bonded holds, parking/fuel perk, reroute | Spot já morto; holds ainda pedem **você** voar. Duplica WH como “storage story” |
| **Lease-out** (Market) | NPC aluga sua cauda → weekly + wear simulado | **Renda aérea passiva** — o “NPC voa por você” de verdade |

Conclusão: o desconforto não é “ter FBO”; é **dinheiro de avião sem sentar no cockpit**. Matar concession/WH seria jogar fora o endgame portuário. O corte certo é **passivo aéreo** + **não criar segundo império de FBO em hub**.

---

## Princípio (travado nesta proposta)

1. **Ar = humano** para frete pago (player SP, ou membro VA). Exceção: Port shuttle só bridge interno (custo, sem payout).
2. **Chão = pode automatizar** (auto-buy, discharge, truck) — comodidade, não pay-to-win de preço ([`16`](./16-va-logistics.md)).
3. **Um FBO de verdade = porto** (concession). Hub “FBO” vira **company base** (perks), não logística paralela.
4. **Não** retunar Dry / `CARGO_FLOW_BALANCE` neste trilho.

---

## Decisões propostas

### D1 — Lease-out: cortar ou esmagar (Phase 0)

**Recomendação Skyline: disable lease-out para player** (list/NPC-take/income), manter buy/sell + dealer lease **in** (você aluga do dealer e voa).

Alternativa mais suave (se quiser preservar fantasia de lessor):

| Knob | Valor sugerido |
|------|----------------|
| Max caudas `leased_out` | **1** |
| Termo | só **1 mês** |
| Weekly ask | teto **0.9×** catálogo (NPC band aperta) |
| Wear | ×**1.5** vs `LEASE_OUT_HOURS_PER_MONTH` |
| Return | inspeção **sempre** + repair floor mínimo |

Depósito: hoje credita wallet na entrada e não volta ao lessee — se lease-out sobreviver, tratar depósito como **escrow** (não renda livre).

### D2 — Airport FBO → “Company base” (não crescer)

| Manter | Remover / não expandir | Migrar depois |
|--------|------------------------|---------------|
| Parking fee mult + Jet-A/MRO mult no ICAO da base | Spot inventory (já gone) | Bonded **holds** → WH hold no mesmo hub (um storage story) |
| Capex 1 home base (talvez 2º só com gate duro) | Reroute como “produto” se virar atalho de pay sem voo | UI rename FBO → Base |
| | Terceiro FBO / capacidade que rivalize WH | |

**Não** inventar “NPC lift do FBO bonded”. Hold expire penalty ok; fulfillment = Dispatch player.

### D3 — Port FBO = concession com nome e desk

UI/copy: chip **Port FBO · P1/P2/P3** (mesmo schema `concession`) — **Phase 1 shipped**.

**Stacks em cima do que já existe** (sem segundo CAPEX paralelo):

| Camada | O quê | Status nesta proposta |
|--------|-------|------------------------|
| **P0 Ground** | Buffs atuais (buy, ETA, listings, restock, lease×throughput) | Já shipped |
| **P1 Desk buy** | Auto-buy limit order porto → WH/yard (igual Fase 1 de [`16`](./16-va-logistics.md)) | **Phase 2 shipped** |
| **P2 Stevedore** | Last-mile **terrestre** porto/yard → WH pickup hub (taxa + ETA ticks; sem missão aérea) | **Phase 3 shipped** |
| **P3 Scout** | Sugere Demand / haul / WH→WH; humano confirma | **Bridge + Demand + Haul shipped** (Phase 7/9/10) |
| **P3b Shuttle** | NPC wall-clock só em bridge hold (fee+fuel; $0 freight) | **Phase 8 shipped** |

**Non-goals Port FBO**

- NPC voa Demand/Market/Wide na frota do player
- Revenda porto→porto (já **CAI** em [`16`](./16-va-logistics.md))
- Demand wanted 90 t / subir T1–T3 globais
- Pay-to-win: auto-buy com preço melhor que manual

---

## Loop jogador (alvo)

```
Buy surplus (manual ou desk P1)
    → inbound / yard
    → Store WH (T1–T4)
    → [opcional P2 truck até outro pickup]
    → Demand Hold / Fly  OU  Wide haul / Internal haul / Port shuttle (bridge)
    → VOCÊ voa → settle   (ou shuttle wall-clock no bridge)
```

Renda de frota extra = **você** usando mais caudas (ou VA pilots), não lease-out.

---

## Fases de build

| Phase | Escopo | Status |
|-------|--------|--------|
| **0** | Disable lease-out + force-return on settle | **DONE** 2026-09-06 |
| **1** | Rename UI concession → Port FBO; doc/tooltips | **DONE** 2026-09-06 |
| **2** | Auto-buy desk (P1) | **DONE** 2026-09-06 |
| **3** | Stevedore truck (P2) | **DONE** 2026-09-06 |
| **4** | Airport FBO slim | **DONE** 2026-09-06 |
| **5** | New Base bonded holds off | **DONE** 2026-09-06 |
| **6** | Company crew off | **DONE** 2026-09-06 |
| **7** | Scout WH→WH (confirm → bridge hold) | **DONE** 2026-09-06 |
| **8** | Port shuttle NPC (bridge only) | **DONE** 2026-09-06 |
| **9** | Scout Demand (WH stock → Demand hold) | **DONE** 2026-09-06 |
| **10** | Scout Haul (WH → short-fill terminal) | **DONE** 2026-09-06 |

### Phase 10 — shipped (Port Scout Haul)

- `listPortScoutHaulSuggestions` / `confirmPortScoutHaul` → `holdWarehouseHaul` (trunk pay; dest fill ≤40%; ≤1800 nm).
- Caps: max **8**; min **200 kg**; Port FBO on origin; score by pay − nm − fill.
- API `POST /api/ports/scout` returns `haulSuggestions`; confirm `kind: 'haul'`.
- Ports desk: **Hold Haul**. Player flies (not shuttle).

### Phase 9 — shipped (Port Scout Demand)

- `listPortScoutDemandSuggestions` / `confirmPortScoutDemand` → `holdDemandOrder` (same gates: corridor, intl, Cargo Ops).
- Caps: max **8**; min **200 kg**; Port FBO on origin; score by pay − mild nm.
- API `POST /api/ports/scout` returns `demandSuggestions`; confirm `kind: 'demand'`.
- Ports desk: **Hold Demand** + bridge rows. Player flies (shuttle = bridge only).

### Phase 8 — shipped (Port shuttle)

- `career-port-shuttle.ts`: dispatch bridge hold → `crewOperated` + `portShuttle` wall-clock; settle via existing `settleCrewOpsDue`.
- Caps: max **1** active; classes **light_ga / light_turboprop** only; active Port FBO on origin pickup.
- Costs: ledger `port_shuttle` fee (floor $100 + $/kg + $/nm) + Jet-A; **payUsd = 0** (no Demand/Market). No `crewRoundTrip` deadhead.
- API `POST /api/ports/shuttle` (`quote` | `dispatch`); Ports Dispatch dialog **You fly** / **Port shuttle**.
- **Recusa** Internal Haul holds com `pilotPayUsd` &gt; 0 (quote + dispatch).
- **Não** reabre company crew Hangar/Market.

### Phase 7 — shipped (Port Scout bridge) · + IH-1 pay

- `career-port-scout.ts`: lista sugestões WH→WH (≥200 kg, Port FBO no origin pickup, dest room); confirm → `holdWarehouseBridge` (**default suggest Internal Haul pay**; `$0` = unpaid for shuttle).
- API `POST /api/ports/scout` (`list` | `confirm`); Ports UI desk **Hold bridge**.
- Player Dispatch (paid Internal Haul) **ou** Phase 8 Port shuttle (unpaid only).

### IH-1 — shipped (Internal Haul pay)

- `quoteInternalHaulPayUsd` / band 80–150%; APIs bridge hold/accept/dispatch + `/api/warehouses/bridge/quote`.
- Mission flags: `warehouseBridge` + `internalHaul`; settle dest WH + ledger `internal_haul_pay` (± solo net 0).
- Ports UI: bridge dialog slider; Dispatch shows frozen pay; shuttle disabled when paid.
- Paths: `career-warehouse-bridge.ts`, settle em `career-mission.ts` / `applySettleWalletDeltas`.

### Phase 6 — shipped (company crew off)

- `COMPANY_CREW_ENABLED = false` — hire / assign / dispatch / split throw; APIs **410**; Hangar Crew tab + Crew fly hidden.
- Idle roster purged on reconcile (no salary burn); in-flight crew legs still settle.
- Base keeps parking / Jet-A / MRO perks only. Aligns “ar = humano” (player cockpit).

### Phase 5 — shipped (new bonded holds off)

- `FBO_BONDED_HOLD_ENABLED = false` — `holdLotAtFbo` throws; `POST /api/fbo/hold` → **410**; UI **Hold at Base** hidden.
- Grandfather: cancel / release / split / return / expire / storage fees still work for existing holds.
- Copy aponta WH (pickup hub) + Demand Hold, ou Accept Market.
- **Não** redirect Market lot → WH stock / Demand order (backlog).

### Phase 4 — shipped (airport Base slim)

- Cap `FBO_MAX_OWNED = 2` (home + 2ª com fleet + Cargo Ops Value); **sem 3ª**.
- `FBO_REROUTE_ENABLED = false` — `rerouteFboHold` throws; `POST /api/fbo/reroute` → **410**; UI Reroute removida.
- Player copy **Airport FBO → Base** (nav, buy/hold/upgrade, cashflow, help). **Port FBO** intacto.
- Mantém parking / Jet-A / MRO perks (`career-fbo-perks.ts`). Spot continua 410. Phase 5 corta **novos** bonded holds.
- Saves com 3 bases: grandfather (não vende); só bloqueia compra nova.
- **2026-09-06:** **1ª Base CAPEX $0** (`quoteFboBuyUsd` owned===0); 2ª paga `tier × FBO_SECOND_BUY_MULT`. Sem ledger se debit 0.
- **UI Base:** sem barra/capacidade bonded (legado); header = T# + perks parking/Jet-A. Holds grandfather só se ainda existirem na save.

### Base Dispatcher seat + scout — shipped (Market single-leg)

- `career-base-dispatcher.ts`: **1 seat / Base** (ground desk, not flying crew). Hire pool / fire severance / daily salary (`base_dispatcher_*` ledger). Persist inside `player_fbos_json` (`dispatchers`, hire pools).
- Perks via skill: fleet scout mode, max suggestions 6–12, milder ferry $/nm penalty. Sem hire = **manual** desk (aircraft already @ lot origin, max 3).
- `career-base-dispatch-scout.ts`: rank Market lots by `estimateBoardLotEconomics` (pay − Jet-A) − ferry penalty; reason shows ferry nm.
- Confirm → `executeAcceptLot` (você voa; parked required). **Não** multi-perna; **não** NPC fly; **não** Port Scout (WH).
- API `POST /api/base/dispatch-scout` (`list` | `confirm`) + `POST /api/base/dispatcher` (`list` | `refresh` | `hire` | `fire`); UI desk na aba Base.
- **2026-09-06 persist bug:** hire gravava `dispatchers` em `player_fbos_json`, mas `normalizeMissionsState` / `readCompanyStateScalars` só reidratavam `fbos`+`holds` → reload apagava o seat (ledger `base_dispatcher_hire` ficava). Fix: preservar `dispatchers` + hire pools no load.
- **Desk lens:** Scan passa `hubIcao` da Base → só lots com **origin na mesma region** do hub (ex. BR-S @ SBKP), não worldwide.
- **Map:** selecionar linha do Market freights traça OD no `FboRouteMapCard` abaixo.

### Base Dispatcher tour Search — shipped (multi-option table)

- `career-base-dispatch-tour.ts`: chains **2–3 real Market lots** (region lens, ferry between legs ≤180 nm, soft return Base/origin). Cap **8** options. Requires hired Dispatcher (`policy.mode === 'fleet'`).
- Filters (desk): aircraft, legs, origin ICAO, min/max nm, return prefer. UI button **Search** (busca no board — não soft-spawn).
- **Empty Min nm** → tour floors (`BASE_DISPATCH_TOUR_MIN_NM`, light_jet **120**), **not** Scout’s 400 — otherwise BR-SE Citation chains almost never match.
- **Region lens:** 1ª perna usa region do **Origin** (fallback Base); pernas seguintes sem lock de region (só ferry ≤180 nm) — evita matar cadeias SBSP(`BR-SE`)→SBCT(`BR-S`).
- Confirm → **leg 1 only** via `confirmBaseDispatchScout` / `executeAcceptLot` + **persist Active Tour** (`playerFbos.activeTour`) when `tourLegs` ≥ 2.
- API `POST /api/base/dispatch-tours` (`list` | `confirm` | `status` | `accept-leg` | `drop`); UI Search + tour table + **Active Tour** panel.
- **Active Tour (2026-09-06):** no hard-reserve of L2+. After L1 settle + aircraft at next origin → **Accept L2** (rebind same OD if lot gone). Sidebar “Active tour · Continue → Base”. Persist via `player_fbos_json` (same pitfall as dispatchers — keep on normalize/load).
- **Cargo Ops gate (2026-09-07):** Scout/Tour Search + rebind skip locked commodities (e.g. Perishables before Time unlock) — Accept no longer surfaces “Perishables is locked” from a suggested row.
- **Manifest redirect (2026-09-07):** Accept L1/L2 opens **Manifest** (staging) to pick aircraft parked at origin (same gate as Freights). `Accept & Dispatch` then `attach` / `bind-leg` Active Tour — no immediate `confirm` accept.
- **Off-origin Manifest (2026-09-07):** combo lists all parked fleet (`@ hub` / `ferry from`); Ferry → `FerryJourneyDialog` to lot origin; Accept blocked until airframe arrives.
- **Route label:** inclui hop de ferry (`SBKP→SBCT→SBFL→SBCT`), não só dests de carga (`SBKP→SBCT→SBCT`) — alinha tabela/header com o mapa.
- **Return filter:** “End at origin/Base” — last hop busca destinando ao target; se existir cadeia que volta, a tabela só mostra essas. Se não houver lot de volta no board (sem soft-spawn), cai no open-end.
- **Perf (2026-09-06):** Search was O(lots × branching × econ) — now economics **once**/lot, index by origin, ferry only for nearby origins; Scan skips O(lots×flights) NPC claim lookups.
- Map: selected tour draws **cargo legs solid** + **ferry dashed**; headline = cargo routeLabel + ferry nm (2 legs ≠ 2 map segments when reposition needed).
- UI: Search/Scan loading states separated (Search no longer flips Scan to “Scanning…”).

### Base Dispatcher — backlog

- Soft-hold curto em L2+ (opcional; v1 é plan-only + Accept Ln).
- Preferência “sai da Base ICAO” (mais apertado que region) vs corridor vizinho.
- Ferry-first CTA quando suggestion/tour tem ferryNm &gt; 0 (link Ferry → origin).
- Não reabrir company Hangar crew fly (`COMPANY_CREW_ENABLED = false`).

### Phase 3 — shipped

- `career-port-stevedore.ts`: quote / start / list destinations; fee `0.03 + 0.0004*nm` $/kg; ETA = inbound ticks + min(4, ceil(nm/50)).
- Gates: active Port FBO; cross-hub only (same hub → Store); dest ∈ port `pickupHubs`; clamp to inbound free; wallet ≥ fee.
- Persist: `WarehouseInboundTransfer` + optional `source: 'stevedore'`; settle via existing `settleWarehouseInboundTransfers`.
- Ledger `port_drayage` (“Port stevedore”); API `POST /api/ports/stevedore`; yard UI **Truck → {ICAO}**.

### Phase 2 — shipped

- `PortAutoBuyOrder` + `career-port-auto-buy.ts`; persist `port_auto_buy_orders_json`.
- Tick after `ensurePortListings` (catch-up + `/api/tick`): `tickPortAutoBuyOrders` → **`buyPortListing`** only (same price/fila).
- Gates: active Port FBO; max **3** active; max $/kg; max kg/day; wallet floor; WH at pickup hub.
- API `POST /api/ports/auto-buy`; UI desk no dialog Port FBO.

### Phase 1 — shipped

- Ports chip/button/dialog/catalog: **Port FBO · P#** (schema `concession` intacto).
- Corridor label `Port FBO · P#`; ledger/cashflow claim/lease/upgrade labels; gate/error strings player-facing.
- CSS/API paths still `concession*` (internal).

### Phase 0 — shipped

- Flag `PLAYER_LEASE_OUT_ENABLED = false` em [`career-aircraft-market.ts`](../../packages/shared/src/career-aircraft-market.ts) (+ mirror UI `feature-flags.ts`).
- `listAircraftForLease` throws; Hangar “List for lease” hidden; API 400.
- NPC demand skips `player_lease`; take path expires leftover listings.
- `settleLeaseOutIncome`: **0** `lease_out_income`; force-return all `leased_out` (wear → now, clear NPC bind, park + mx gate); expire open lease listings.
- Keep: buy/sell + dealer lease-in.

Ordem importa: **0 antes de 2** — senão o jogador ainda farm lease-out enquanto ganha desk.

---

## Paths (referência)

- Concession: `packages/shared/src/career-port-concessions.ts`
- Ports / deposit: `packages/shared/src/career-ports.ts`
- WH / T4: `packages/shared/src/career-warehouse.ts`, `career-warehouse-stock.ts`
- Airport FBO: `packages/shared/src/career-fbo.ts`, `career-fbo-perks.ts`
- Lease-out: `packages/shared/src/career-aircraft-market.ts` (`settleLeaseOutIncome`, `LEASE_OUT_HOURS_PER_MONTH`)
- Desk auto-buy: `packages/shared/src/career-port-auto-buy.ts`
- Stevedore (Phase 3): `packages/shared/src/career-port-stevedore.ts` → reuse `WarehouseInboundTransfer` / `settleWarehouseInboundTransfers`
- VA desk (já decidido): [`16-va-logistics.md`](./16-va-logistics.md)

---

## Aberturas (só se Daniel discordar)

1. Manter lease-out com nerf D1 em vez de disable.
2. Manter airport FBO holds indefinidamente (aceitável se Phase 4 adiada).
3. Stevedore (P2) antes de auto-buy — só se o pain for “estoque preso no yard”, não “clique de buy”.
