# Port XL + Warehouse T4

Related: [`08-economy.md`](./08-economy.md), [`16-va-logistics.md`](./16-va-logistics.md), Value/Supplies CLOSED (`21` / `22`).

## Fantasia

Porto descarrega carga oceânica → hub de pickup → **WH do player (T4 tronco)** e/ou **Market XL** → missão **Wide** (player ou NPC). Demand continua feeder 8–12 t.

## Decisões (fechadas)

| Peça | Decisão |
|------|----------|
| WH T1–T3 | Intactos (~5 / 10 / 15 klb) — jogo diário / feeder |
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
