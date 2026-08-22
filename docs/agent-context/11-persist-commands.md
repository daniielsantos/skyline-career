# Persist commands (MP-ready) — settle first

Atualizado 2026-08-22. GET `/api/ports` = port listings+inventory tables. Ports buy = listing upsert. Accept/dispatch/cancel = command-slice.

## Objetivo

Single-player mais rápido no parking brake **e** o mesmo formato de comando que MP vai usar: `company_id` + `world_id`, poucas linhas, idempotente.

MP **não** começa neste doc. Sem writes incrementais + lock fino, MP só serializa a lentidão.

## Dois cadeados (depois do comando)

| Lock | Dono | Exemplos |
|------|------|----------|
| `company` | uma empresa / um save de player hoje | missão, wallet, ledger, frota, WH, cargo-ops |
| `world` | mapa compartilhado | `airport_stock` do dest, shrink de lot, inbound_pending |

Hoje os dois estão em `worldLock` + `companyLock`. Acquire **world then company**. `updateOpenMission` só pega `company`. Settle precisa dos dois **só nas linhas que mudam**, não do planeta. RAM quente: usa o mundo em memória. RAM fria: `loadCommandWorldSlice` (SQL origin/dest + lots da missão) e `persistCommandWorldSlice` (patch, sem prune).

Não esperar o tick horário no clique. O mundo anda no timer (~60s).

`withCareerWrite` default: `catchUp !== true`. `persist: 'company'` = só `saveMissions`. `commandSlice*` = patch origin/dest + lots.

## Comando `SettleFlight`

**Quem dispara:** Watch (`event.type === 'settle'`) ou Advanced/manual settle. UI já pode mostrar `settling` (shipped `228d6c1`).

**Input (já existe no Watch):** `missionId`, `residualFuelKg?`, `landingFpm?`, `airborneEndedAtMs?`, `nowMs`, `flightScore?`, `weatherOps?`, `touchdown?`, `hoursMult?`.

**Idempotência (obrigatório p/ retry / MP):** se a missão já está `completed` com settlement, **devolver o mesmo payout** — não pagar de novo. Watch pode reenviar se o pipe cair no `stop()`.

**Hot path (commitar antes do debrief):**

1. Missão → `completed` + campos settled (fuel, fpm, score, duration, runway).
2. Wallet credit/debit + 1–2 linhas de ledger (`freight_payout`, `fuel`).
3. Tail: reloc `destIcao`, combustível residual, hours AF/ENG, `assignedMissionId` limpo.
4. Piloto ICAO = dest.
5. Stock **só do dest** (e origin se `applyFreightDelivery` debitar): `UPDATE airport_stock … WHERE world_id AND icao AND commodity`. Sem `DELETE FROM airports`.
6. Lot: shrink/remove **aquele** `shipmentLotId` (não reescrever `lots[]` inteiro na RAM).
7. `inbound_pending` da missão: delete por `mission_id`.
8. Demand/port/WH: as mesmas regras de `settleMission` hoje, mas em `company_state` / stock — não via `world.airports.map`.

**Fora do hot path (não precisa de fila):**

- Cruise EMA / `airframePerfOverrides`: no mesmo `saveMissions` do settle (um objeto pequeno). Sem job.
- Relógio airborne após settle: **não** persistir de novo (Watch `228d6c1`).
- Crew ops due / orphan cancel: **não** no settle; próximo write de company que já abra missões, ou o timer de 60s.
- Tick NPC, port discharge, dealer pool, `persistWorldAirports` full rewrite.

**Debrief:** payload do comando (payout, penalty, score). Disco alcança no mesmo write das linhas quentes — **não** fire-and-forget o payout. Sem fila de jobs até existir um side-effect pesado de verdade.

## O que `settleMission` faz hoje (para não perder regra)

Função: `packages/shared/src/career-mission.ts` `settleMission`. Além de pay/late/score/weather:

- Auto-`departMission` se ainda `accepted`/`dispatched` (cheat/offline).
- Gate min airborne (Watch live).
- `relocateAircraftOnSettle` + `applyAircraftHoursAfterMission`.
- Loop de lots: market delivery, demand (enche dest), port pickup → WH, empty/deadhead skip.
- Cargo ops / class ops deltas.
- Fuel debit residual vs loaded.

O **comando** deve chamar a **mesma regra pura** com um *world view* mínimo (`getAirportStock(dest)`, `getLot(id)`, frota da company) — não o array de 800+ hubs. Refatorar `settleMission` para depender de um port `EconomySlice`, não reescrever a fórmula de pay nesta etapa.

## Fatia de implementação (ordem)

1. ~~**Dirty airports:**~~ **feito:** patch por ICAO + skip live/ops/blob. Tick que toca ≥80 hubs ainda faz rewrite completo.
2. ~~**`SettleFlight` comando:**~~ `executeSettleFlight` idempotente; Watch/API; housekeeping off no settle.
3. ~~**Hot path persist:**~~ settle `catchUp: false`; RAM fria hidrata OD; **RAM quente também** `persistCommandWorldSlice` (só `icaos`/`lotIds`, nunca o array inteiro).
4. ~~**Fila de jobs:**~~ **não faremos** até um side-effect ser pesado o bastante. Cruise EMA fica no settle.
5. **MP:** N `company_id` no mesmo `world_id`. Fora de escopo.
6. ~~**Ports buy / concession:**~~ company + listing upsert / concession index. Deposit/abandon company-only.
7. ~~**GET `/api/ports`:**~~ `persist: 'portMarket'` (listings + inventory tables only). Accept/dispatch/cancel already use command-slice lots.

## Outros comandos (mesmo molde, depois)

| Comando | Hot | Não no comando |
|---------|-----|----------------|
| `AcceptLot` | lot reserved, missão `accepted`, inbound_pending, tail assign | spawn de lots novos |
| `DepartFlight` | status `in_flight`, fuel debit, airborne stamps | — |
| `CancelMission` | status cancel, release tail, lot devolve | — |
| `BuyAircraft` | wallet + instance `sold` + fleet row | rebalance pool mundial |

Cada um: idempotência por id de negócio (lot+company, missionId).

## Fora

- Não retunar `Dry` / `CARGO_FLOW_BALANCE`.
- Não misturar inject/SimConnect neste recorte.
- Não apagar `economy_json` stub até o hot path não hidratar mais o blob.

## Como validar a fatia 1–2

- Settle live: overlay Settling → debrief; save ainda consistente no reload (missão completed, wallet, dest stock, tail no dest).
- Log/tempo: `saveEconomy` no settle **sem** `DELETE FROM airports` (watch-debug ou timer no store).
- Teste unitário: segundo `SettleFlight` no mesmo `missionId` não duplica payout.
