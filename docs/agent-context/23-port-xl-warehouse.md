# Port XL + Warehouse T4

Related: [`08-economy.md`](./08-economy.md), [`16-va-logistics.md`](./16-va-logistics.md), Value/Supplies CLOSED (`21` / `22`).

Atualizado 2026-09-25: **WH T2/T3 mid ladder** — caps 10/15 klb → **12/25 klb** (5443 / 11340 kg); T1 5 klb + T4 45 t intactos. Migrate expande saves no mesmo tier. CAPEX/shipped gates inalterados (mid fica mais valioso).

## Fantasia

Porto descarrega carga oceânica → hub de pickup → **WH do player (T4 tronco)** e/ou **Market XL** → missão **Wide** (player ou NPC). Demand continua feeder 8–12 t.

## Decisões (fechadas)

| Peça | Decisão |
|------|----------|
| WH T1–T3 | Feeder ladder **5 / 12 / 25 klb** (T2/T3 stepped 2026-09-25) |
| **WH T4 Port Bonded** | **45_000 kg**; só em ICAO ∈ `pickupHubs`; unlock T3→T4 com `lifetimeShippedKg ≥ 25_000` + CAPEX |
| Demand | **não** sobe para XL |
| Market Port XL | Bias formação quando **origin** é pickup de porto **e** major↔major; soft cap global XL |
| Supplies high-fill | Fora deste trilho |
| Listings >45 t | Ficam no **yard** ou split ao depositar (`warehouseFreeKg`) |

## Fases

1. **WH T4** — **SHIPPED** `WAREHOUSE_CAPACITY_KG[4]`, upgrade T3→T4 (25 t shipped + CAPEX), Demand hold TTL T4, UI Ports
2. **Deposit/split** — **SHIPPED** Store in WH = `min(yard, freeKg)`; resto yard; Value listings porto 8–45 t
3. **Market Port XL** — **SHIPPED** `xlLotOdEligible` port bias + `formLots` +1 maxXl / 35 t floor + soft cap 80
4. **Wide from WH** — **SHIPPED** `career-warehouse-haul.ts` + API + Ports **Haul** button
5. **Haul amount + pay quote (2026-09-12)** — dialog picks partial kg (presets 50% / Max / Ops cap); live `POST /api/warehouses/haul/quote`; accept/hold pass `kg`. Fix: full WH stock was forced → ops-cap error on small airframes.
6. **OFP trim → WH (2026-09-12)** — `trimMissionCargoToKg(..., fleet)` deposits leftover to origin WH for Haul/Bridge/Demand (Accept OFP cargo / dispatch flyable trim). Before: Market board only; Haul leftover was lost.

## Paths

- Cap / migrate: `packages/shared/src/career-warehouse-stock.ts`
- Upgrade / pickup gate: `packages/shared/src/career-warehouse.ts`
- Pickup set (shared, no cycle): `packages/shared/src/career-port-pickup-hubs.ts`
- Deposit: `depositPortPickupToWarehouse` in `career-ports.ts`
- XL formation: `xlLotOdEligible` / `formLotsFromImbalances` in `career-economy.ts`
- Haul: `packages/shared/src/career-warehouse-haul.ts` + settle em `career-mission.ts`

## Non-goals

- Subir T1–T3 globais para ~100 klb
- Demand wanted 90 t
- XL em regional/spoke ou sem porto
- Retune supplies/general neste trilho
