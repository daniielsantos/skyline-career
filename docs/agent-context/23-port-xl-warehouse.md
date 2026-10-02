# Port XL + Warehouse T4

Related: [`08-economy.md`](./08-economy.md), [`16-va-logistics.md`](./16-va-logistics.md), Value/Supplies CLOSED (`21` / `22`).

Atualizado 2026-10-02: **Card comprado inteiro volta igual** — sintoma = electronics 16,5 klb some da carteira e entra no trânsito, e o mesmo card (mesmo kg, mesmo prazo curto) continua no balcão. Causa = a compra marca `sold_out`, o snapshot tira a linha da memória, e o save da company procura essa linha e não acha. O banco fica com o card aberto. Fix = a linha vendida fica guardada para o upsert.

Atualizado 2026-10-02: **Catálogo do porto troca de listing sem o navio** — sintoma = comprou os cards de electronics e outro commodity apareceu na hora; sair e voltar trocou a linha de novo, com o Discharge ainda em ~10 h. Causa = o navio só põe kg no pátio. O balcão (P3 = 6 cards) completa o buraco na hora com kg que já estava no pátio, em qualquer commodity, inclusive no GET do catálogo. Card novo nasce com ~3 dias; um card com 1 h restante já estava aberto. Sem mudança de código.

Atualizado 2026-10-02: **T5 acima do T4** — 45 t não cabe uma viagem de wide (~104 t). T5 = **100 t**, opt-in. T4 fica 45 t. Gate = 60 t embarcadas no Demand Board + CAPEX ~2× T4 (major $110k). Hold de Demand no T5 dura ~1,5 dia. Staff continua em 3 vagas.

Atualizado 2026-10-02: **Abandon de lote travava a commodity inteira** — um hold reserva kg, não uma pilha. Qualquer hold dessa commodity recusava todas as pilhas. Fix = a pilha sai se o que sobra ainda cobre o hold. A pilha que deixaria o hold sem estoque continua recusada.

Atualizado 2026-10-02: **Navio do porto não segue a pressão do hub** — sintoma = todo porto descarrega no mesmo minuto e o pátio enche até o teto mesmo com Machinery high. Causa = o primeiro navio nasce no tick do mundo e depois soma um dia fixo; o kg é 8% do teto, e a linha Hub pressure só é texto. Fix = o navio traz kg só na medida em que algum pickup hub está curto (surplus = zero, a mesma faixa 42/58). O próximo horário de cada porto fica espalhado no dia. Pátio cheio continua sem receber mais.

Atualizado 2026-10-02: **Abandonar o prédio da warehouse** — só o lote tinha Abandon. O dono agora fecha a warehouse vazia (sem estoque, sem inbound, sem hold de desk na origem ou no destino). CAPEX não volta. Staff daquele prédio sai junto. Com carga dentro, recusa.

Atualizado 2026-09-25: **WH T2/T3 mid ladder** — caps 10/15 klb → **12/25 klb** (5443 / 11340 kg); T1 5 klb + T4 45 t intactos. Migrate expande saves no mesmo tier. CAPEX/shipped gates inalterados (mid fica mais valioso).

## Fantasia

Porto descarrega carga oceânica → hub de pickup → **WH do player (T4 tronco)** e/ou **Market XL** → missão **Wide** (player ou NPC). Demand continua feeder 8–12 t.

## Decisões (fechadas)

| Peça | Decisão |
|------|----------|
| WH T1–T3 | Feeder ladder **5 / 12 / 25 klb** (T2/T3 stepped 2026-09-25) |
| **WH T4 Port Bonded** | **45_000 kg**; só em ICAO ∈ `pickupHubs`; unlock T3→T4 com `lifetimeShippedKg ≥ 25_000` + CAPEX |
| **WH T5** | **100_000 kg**; mesmo pickup hub; unlock T4→T5 com `lifetimeShippedKg ≥ 60_000` + CAPEX ~2× T4 |
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
