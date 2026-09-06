# Port FBO — chão, não ar

Atualizado 2026-09-06. **Phase 0–6 shipped** (lease-out off; Port FBO desk; stevedore; Base slim; bonded holds off; **company crew off**). Market→WH redirect backlog.
Relacionado: [`08-economy.md`](./08-economy.md), [`16-va-logistics.md`](./16-va-logistics.md), [`23-port-xl-warehouse.md`](./23-port-xl-warehouse.md), [`10-aircraft-pool.md`](./10-aircraft-pool.md) (lease-out).

## Fantasia (uma frase)

Você é **operador de porto / FBO de chão**: compra, guarda, despacha last-mile terrestre e **você** (ou piloto VA humano) voa a saída. Nenhum NPC completa frete aéreo na sua frota.

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

1. **Ar = humano** (player SP, ou membro VA no futuro). Desk/NPC/company crew **não** settle frete da frota player.
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
| **P3 Scout** | Sugere Demand / haul WH→WH; humano confirma | Alinha Fase 2 VA; SP opcional |

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
    → Demand Hold / Fly  OU  Wide haul / Internal haul
    → VOCÊ voa → settle
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
