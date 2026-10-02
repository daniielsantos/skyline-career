# Persist commands (MP-ready) — settle first

Atualizado 2026-10-02: **Capacity left no En route ignorava a carga das escalas seguintes** — o Flight Plan já somava `throughLoads`. O tile do En route subtraía só `mission.cargoKg`. Fix = o espaço livre desconta também o que segue no avião.

Atualizado 2026-10-02: **Desk mostrava a origem antiga de um contrato que segue no avião** — o Leave freight grava o hub novo só na perna que está valendo. O contrato que continua guarda a origem de onde a carga saiu, porque o cancel devolve para essa warehouse. Fix = a linha do Desk mostra a origem da perna que está valendo. A distância some nessa linha, porque o número gravado ainda é a rota antiga.

Atualizado 2026-10-02: **CI do catalog quebrava no boot** — sintoma = `catalog-api did not become ready` com `Cannot access 'portPickupsFn' before initialization` em `bindPortCorridorLookups`. Causa = o cancel fez a missão importar `career-ports` / o corredor. O corredor ainda está carregando (economia → concessão → `career-ports`) quando o bind grava o `let` que ainda não existe. Fix = os lookups ficam num módulo sem imports; a missão resolve o porto por `portIdForPickupHubBound`.

Atualizado 2026-10-02: **Cancel de haul/bridge com a warehouse cheia engolia a carga** — sintoma = o estoque IN STOCK é o que está no prédio (o hold do desk ainda conta; o voo aceito já saiu no Prepare). No cancel, `depositCargoToWarehouse` falhava se não houvesse vaga e o `catch` descartava o kg. Fix = o que cabe volta para a warehouse de origem; o resto vira yard do porto daquele hub. Sem porto no hub, entra só o que cabe. O Open desk continua ocupando a warehouse até o Prepare.

Atualizado 2026-10-02: **Leave freight não movia o piloto no header** — sintoma = a carga ficou em KTCS e o chip Pilot continuou em MMMY. Causa = o hold gravou `pilotIcao` na company da VA; o header lê a company de casa. O refresh depois do botão recolocava MMMY. Fix = o mesmo caminho do settle também grava o hub na company de casa. O voo que já está em KTCS não se corrige sozinho: o piloto ainda precisa ir até lá (Move) até esse world-api subir.

Atualizado 2026-10-02: **Desk Active mostrava só a commodity do contrato merged** — sintoma = dois Supplies e um Machinery para KMIA apareciam como uma linha “Machinery”. Causa = a linha do Desk usa `commodityId` da missão, e o merge guarda os lots dentro dela. Fix = a coluna Cargo lista cada commodity, com ×N quando repete.

Atualizado 2026-10-02: **Faixa Freight hold saiu do Flight Plan** — “Freight hold · KTCS / Yard storage …/day” repetia o hub que já é a origem do voo. A diária continua sendo cobrada; a faixa saiu.

Atualizado 2026-10-02: **Leave freight here ficou discreto** — no En route o botão era uma faixa laranja na largura do card. Agora é o ghost compacto, alinhado à esquerda, no tom do texto de apoio.

Atualizado 2026-10-01: **Faixa “Also on this aircraft” saiu do Flight Plan** — ela só aparecia com o voo fora de `accepted` e repetia KLAS/KMIA que a rota e os cards de carga já mostram. Removida. O freight hold de pátio continua.

Atualizado 2026-10-01: **O toast do Machinery vem do world, não da API local** — sintoma = Edit cargo + Add do bridge KMIA ainda toastava “Add the next stop before dispatch”. Causa = o desktop está em MP (`desktop-play.json` → `https://world.playairframe.com`). O Save é proxy. O world publicado ainda recusa o stop quando o voo não está `accepted`. O código local já reabre `dispatched` e empilha o bridge do mesmo tipo; isso não roda nesse clique até o world-api ser atualizado. Reiniciar o desktop não muda o toast.

Atualizado 2026-10-01: **Flight Plan listava só a primeira carga, e o Add do bridge recusava depois do OFP** — sintoma = a rota e o payload somavam vários lots (67.2 klb), mas o card de Cargo mostrava só o Supplies que entrega em MMML. No Edit, ao adicionar o Machinery bridge para KMIA, o toast era “Add the next stop before dispatch” com o badge ainda Accepted. Causa = os cards liam só `mission.lots` (a perna atual); os outros contratos estão nos riders de `throughLoads`. O Add só aceitava status `accepted`, então um voo que o SimBrief já tinha passado para `dispatched` recusava o stop. Fix = o Flight Plan e o en route listam cada lot do avião, com o aeroporto onde ele desce, só quando o voo tem `throughLoads`. Frete de mercado, charter, Jet-A, ferry e Payload Lab seguem a tela de antes: charter mostra passageiros, Jet-A o slider, ferry o texto vazio, e o editor de mercado continua em `staging.lines`. O Add no Manifest, antes da decolagem, reabre o voo para `accepted`, limpa o OFP e empilha o bridge do mesmo tipo no stop que já existe. Reiniciar a API local; o voo aberto não precisa ser cancelado.

Atualizado 2026-10-01: **Accept do Manifest recusava destino repetido** — sintoma = ao aceitar, o toast “That destination is already on this trip” e o voo abria sem um dos contratos. Causa = o segundo contrato para um aeroporto que já estava na rota era recusado, inclusive o aeroporto da primeira perna, e também quando o tipo (haul e bridge) era diferente. Fix = o mesmo tipo entra nos lots daquele pouso. Tipo diferente segue no mesmo pouso, num contrato separado, e descarrega junto quando o avião pousa lá.

Atualizado 2026-10-01: **Cancel do voo deixava a escala seguinte aceita** — sintoma = depois de cancelar, o Desk recarregava e o card de active flight voltava (KIAH→KMIA Machinery), com Open flight nos holds. Causa = o cancel do host só soltava o vínculo; o contrato que ia na escala seguinte continuava `accepted`. Fix = cancelar o voo também cancela as escalas que ainda estavam nele. A carga volta pelo mesmo caminho de um cancel normal.

Atualizado 2026-10-01: **Edit cargo abria outro editor** — sintoma = depois do Accept, Edit cargo mostrava Staged lots e um texto travado da escala seguinte; o contrato que já estava no voo não era um slider. Causa = o editor montava linhas de mercado e tratava `throughLoads` como nota, em vez do Manifest do desk. Fix = Edit cargo abre o mesmo Manifest (slider do contrato que abriu o voo, sliders já ativos nas escalas que já entraram, lista com Add para o que ainda está no desk). Save grava esses pesos no voo aceito (`syncDeskTripLoads`); zero numa escala posterior tira esse contrato. O primeiro contrato não zera.

Atualizado 2026-10-01: **Segundo hold do mesmo destino sumia no Edit cargo** — sintoma = Save aceitava Machinery para KMIA, piscava e o Supplies não voltava na lista. Causa = dois contratos para o mesmo aeroporto; o segundo era recusado e a tela saía mesmo assim. O destino já ocupado escondia o hold. Fix = o segundo contrato do mesmo tipo entra no stop que já existe, e um erro de Add não fecha o Manifest.

Atualizado 2026-10-01: **Save do haul ainda batia no mercado** — o processo da API que já estava no ar não tinha o caminho novo, então `whhaul_…` continuava Unknown lot. Se o peso do haul não mudou, o Save não regrava essa linha; só adiciona os holds marcados.

Atualizado 2026-10-01: **Staged lots contava só o haul** — o título usava `staging.lines`. Os holds adicionados no editor (bridge) ficam em `stagingJoinHoldIds` e não entravam no número. O contador e o rodapé agora somam essas linhas.

Atualizado 2026-10-01: **Save do wide haul dizia Unknown lot** — sintoma = Save & re-dispatch toastava `Unknown lot whhaul_KIAH_KLAS_…`. Causa = o editor mandava o lote sintético do haul para o commit de mercado, que só conhece frete do board (e Demand). Fix = haul e bridge aceitos ajustam o kg no warehouse de origem e seguem para o Add dos outros holds.

Atualizado 2026-10-01: **Save do Manifest editava um voo já aceito e ficava morto** — sintoma = Save & re-dispatch desabilitado com “Aircraft must be at KIAH”, e o seletor dizia “ferry from KIAH”. Causa = o tail aceito fica `assigned`, e a tela só contava `parked` como no aeroporto. Fix = no editor desse voo, o avião assigned no origem conta como no lugar. Não é deploy de VPS.

Atualizado 2026-10-01: **Payload só no Manifest** — sintoma = Prepare no desk caía no Flight Plan, com slider e Add de carga nessa página. Causa = o Accept do desk criava o voo inteiro e abria o Dispatch; o Flight Plan ainda listava os outros holds. Fix = o botão do desk abre o Manifest (slider e Add). O Flight Plan só mostra a carga aceita e o botão Edit cargo, que volta ao Manifest. O peso dos holds marcados entra no Save.

Atualizado 2026-10-01: **Lista de Add sem o cartão** — o padding e o fundo da linha tinham ficado fora da regra CSS, então rota, stats e Add colavam. A linha volta ao cartão, e Cargo, Mass, Dist, Pay, Expires e By ficam na mesma coluna em todas as rotas. O Add alinha à direita.

Atualizado 2026-10-01: **Add do Dispatch igual ao Manifest** — a lista de baixo só tem os dados e o Add. O clique tira o contrato da lista e mostra o slider de Load que o Manifest já usa. Zerar devolve à lista. O peso entra no voo quando abre o SimBrief.

Atualizado 2026-10-01: **Add da trip fica sob a carga** — a lista de rotas com Add no Dispatch estava acima do título da perna. Fica debaixo do card de Cargo, no mesmo bloco das outras listas.

Atualizado 2026-10-01: **Settle da primeira perna e a reserva do próprio piloto** — sintoma = com o tail ainda em RESERVED · YOU, o settle do host jogava “reserved by another pilot” e a escala seguinte não recebia o avião. Causa = `continueCargoTripAfterSettle` devolvia o avião sem a conta que já tinha a reserva. Fix = o settle manda essa conta (ou a que já está no tail). A carga que segue não entra no warehouse do pouso; vira freight hold e o próximo OFP é só essa perna.

Atualizado 2026-10-01: **Edit cargo escondia a escala seguinte** — sintoma = ao abrir Edit cargo o payload caía (85.8 → 67.2 klb) e o bridge para o próximo destino sumia da lista. Causa = o editor só copiava os lots desta perna; `throughLoads` não entra nesses lots. O contrato seguia no voo, mas a tela e o Save não o contavam no teto. Fix = a rota do Dispatch mostra a cadeia (KIAH → SKBQ → KMIA) e o payload é a soma do OFP, com a nota do que entrega neste destino. O card âmbar da trip sai; a lista Add fica só quando ainda há hold. No Edit cargo a escala seguinte aparece travada, entra no payload reservado e no teto dos sliders, e o Save mantém `throughLoads`.

Atualizado 2026-10-01: **Manifest: slider na primeira perna, Add nos outros** — sintoma = a lista única só tinha caixa, e o jogador não ajustava o peso. Fix = o hold que abriu o Manifest já nasce com o slider. Os outros ficam na lista da trip com **Add**; o slider daquele contrato aparece depois do Add. Load 0 devolve o hold ao desk. O bridge entra no total: kg no payload e `pilotPayUsd` (proporcional ao slider) no Contract pay.

Atualizado 2026-10-01: **Add respeita a reserva do próprio piloto** — sintoma = Add na lista dizia “reserved by another pilot” com o cartão em RESERVED · YOU. Causa = ao devolver o avião ao voo, o Add não informava a conta que já tinha a reserva. Fix = o Add manda essa conta (e o dono da VA, se for o caso). O voo aberto não precisa ser cancelado.

Atualizado 2026-10-01: **Add a stop vira lista** — o combo no Dispatch só mostrava destino e peso. Cada hold do mesmo aeroporto aparece numa linha (rota, tipo, commodity, massa, nm, pay, prazo, quem postou) com **Add**.

Atualizado 2026-10-01: **Manifest lista os outros holds** — sintoma = Prepare abria o Manifest e o jogador voltava ao desk para o Add to flight; um hold de outro aeroporto continuava com Prepare ativo. Causa = o Manifest só conhecia o hold da rota, e o desk tratava origem diferente como um voo novo. Fix = no Manifest, holds do mesmo aeroporto e outro destino podem ser marcados e entram no Accept; no Dispatch o Add a stop também lista esses holds. Com um voo aberto, hold de outra origem fica **Open flight**, sem Prepare.

Atualizado 2026-10-01: **Hold do desk entra no voo aberto** — sintoma = o Scout manda o contrato pro desk, mas o segundo Accept recusava com “finish or cancel” e o menu Add a stop ficava vazio. Causa = o desk só sabia abrir um voo novo, e o avião já estava nesse voo. Fix = no desk, com o voo ainda `accepted` (antes do SimBrief), hold do mesmo origem e outro destino mostra **Add to flight**. Isso consome o hold, cria o contrato e põe em `throughLoads`. O avião continua no primeiro voo. Mesmo destino segue no primeiro Accept. Spec abaixo do parágrafo da trip.

Atualizado 2026-10-01: **Trip de carga, uma escala por OFP** — sintoma = o wide sobra espaço e o jogador quer levar contratos de destinos diferentes, escolhendo a ordem, uma perna de cada vez. Causa = um contrato era um voo, e inventar um segundo destino no mesmo OFP não cabe no SimBrief. Fix = `throughLoads` no voo atual e `throughHostId` nos seguintes (`addCargoStop`, teto de 3 escalas extras). O OFP da perna leva a soma; se não couber, o dispatch recusa em vez de cortar o contrato. No settle só essa escala paga e entrega. O próximo contrato vira o freight hold que já existia, no hub do pouso (mesmo dia de economia $0; o dia seguinte cobra a taxa de pátio sobre a carga que ainda segue, inclusive a das escalas posteriores). Charter, Jet-A, vazio e Payload Lab ficam de fora. Cancelar solta o vínculo: o contrato continua aceito onde já estava, e a carga de desk volta pelas regras de hoje.

Atualizado 2026-09-14. SP usa o mesmo molde MP (tabelas/comando; `saveEconomy` só no tick). GET Freights = inbound patch; Demand = demand_orders; dealer GET = blob. **PG:** light slice helpers in `career-store-pg-world.ts` (inbound/demand/ports/npcLive/aircraft pool) — no stub→full `saveEconomy`.

## Objetivo

Single-player mais rápido no parking brake **e** o mesmo formato de comando que MP vai usar: `company_id` + `world_id`, poucas linhas, idempotente.

MP **não** começa neste doc, mas o persist do SP **é** o formato MP: tabelas + comando, não um dump do planeta no clique. Sem isso, MP só serializa a lentidão.

Atualizado 2026-09-29: **Pulse grava só o lote sujo** — sintoma = cada tick reenviava ~28k lots (~1,2s) mesmo sem mudança. Causa = `syncLotsTableToPg` fazia orphan-delete + UPSERT do conjunto retido. Fix = no snapshot do pulse, `planLotSync` compara a assinatura das colunas gravadas e manda só upsert/delete desses ids. Sem baseline, e a cada 16 pulses, a tabela de lots volta a ser completa. No pulso de pouso esse 16º fica dentro do corte: não reescreve aeroporto, charter nem demand. Um `saveEconomy` normal ou `persistNpcLive` zera a baseline. O delta não apaga o resto da tabela, então uma reserva gravada depois do snapshot não some. A volta do planeta (formação de frete) não muda.

Atualizado 2026-09-29: **Um save por pulse** — sintoma = cada acordada pedia 8 ticks em 4 pedaços e cada pedaço fazia `saveEconomy` completo (~20s no log, `save` ≫ `tick`). Causa = `isCatchUp` sempre clonava o planeta depois do lock, mesmo com tick real 0. Fix = os pedaços do pulse passam `persistPulseSnapshot: false`; no fim, uma gravação só se `economyDirty` (tick, chegada, reparo de reserva, cancelamento que solta lote, concessão, seed). Falha dessa gravação repete no pulse seguinte. `POST /api/tick` não muda. v0.3.390 no VPS ainda gravava cinco vezes: o `else` do write tratava “não clonar” como `persistEconomyUnlocked` dentro do lock. O `else` agora só vale fora do catch-up.

## Dois cadeados (depois do comando)

| Lock | Dono | Exemplos |
|------|------|----------|
| `company` | uma empresa / um save de player hoje | missão, wallet, ledger, frota, WH, cargo-ops |
| `world` | mapa compartilhado | `airport_stock` do dest, shrink de lot, inbound_pending |

Hoje os dois estão em `worldLock` + `companyLock`. Acquire **world then company**. `updateOpenMission` só pega `company`. Settle precisa dos dois **só nas linhas que mudam**, não do planeta. RAM quente: usa o mundo em memória. RAM fria: `loadCommandWorldSlice` (SQL origin/dest + lots da missão) e `persistCommandWorldSlice` (patch, sem prune).

Não esperar o tick horário no clique. O mundo anda no timer (~60s).

`withCareerWrite` default: `catchUp !== true`. `persist: 'company'` = só `saveMissions` (e **só `companyLock`** quando não há `commandSlice*` / demand / listing / concessions). `commandSlice*` = patch origin/dest + lots.

## Duas filas (pulse vs comando) — 2026-09-21

**Sintoma:** Accept/`staging/commit` `lockWait` ~15s + `inLock` ~5s atrás de `economy-pulse … save=~34s`.

**Causa:** (1) pulse segurava `worldLock` durante o UPSERT PG do planeta; (2) no Postgres `persistCommandWorldSlice` era stub → `saveEconomy` full.

**Fix:** fatia real no PG (`persistCommandWorldSliceToPg`); tick sob lock + `saveEconomy(snapshot, { applyToRam:false })` fora do lock + `flushDirtyCommandLots`; Accept patcha RAM sob lock e faz UPSERT da fatia **depois** de soltar o lock; settle de companies no pulse isola fail de shell vazio por company.

**Revision:** lease holder (world-api) não passa expected tip — só `FOR UPDATE` + bump. CAS tip = defesa de peer/worker sem lease. Assim Accept/Dispatch/fuel/settle/ports/… não toastam `expected N, actual N+1` enquanto o pulse bumpa revision off-lock. Dispatch sem trim de cargo → `persist:'company'`. **Ship MP = deploy world-api**.

## Comando `leaveFreightAtHub`

Um contrato de carga `in_flight` pode parar num hub que não é a origem nem o destino. `POST /api/missions/leave-freight` (gateway encaminha pro world) devolve a mesma missão para `accepted`, troca `originIcao` pelo hub, grava `freightHold: { icao, sinceTick }`, estaciona a cauda com a carga ainda assigned e limpa os carimbos de voo. Sem crédito, sem estoque de WH, sem throughput de Port FBO, sem linha de logbook. Charter, Jet-A haul, vazio, deadhead e Payload Lab recusam. A taxa é a do pátio (`freight_hold`, $0.05/kg/dia de economia) no settle passivo da company, até o próximo `depart` ou o cancel. O botão **Leave freight here** só aparece no En route em solo, já no ar, longe da origem e do destino. O gate de settle do Watch (`destProximity`) não muda.

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
- **Pause/menu:** `airborneElapsedMs` só avança com sim “vivo” (`IS PAUSED` / slew congelam o chip + gate); wall `airborneAtMs` continua âncora de ETA/resume.

**Pause ESC does not freeze footer clock (2026-09-24):** sintoma = ESC pause no MSFS; chip `12m/59m` e % continuam subindo. Causa = Watch já tinha `isSimPlaybackFrozen(paused|slew)`, mas o Host live **hardcodava** `Paused = false` e **não** lia `IS PAUSED` no `SnapshotData`. Fix = double `IS PAUSED` no snapshot + DTO; Host rebuild no pack/release.

**Sticky IS PAUSED after Resume (2026-09-24, rev):** sintoma = chip preso (`22m/55m · 39%`) com Cruise sample ainda andando; logs `paused:true` + GS ~450. Premissa errada do cleanup 0.3.307 = “sticky pause era só desalinhamento Absolute Time no SnapshotData”. Absolute Time **no snapshot** realmente desalinha FLOAT64 (slew falso); mas `IS PAUSED` sticky **também é real** no MSFS 2024. Fix = Host snapshot só `IS PAUSED` (sem SLEW/ABSOLUTE); Watch lê `ABSOLUTE TIME` no flight-sample; **unfreeze sticky só por movimento ≥~0.015 nm** (não Absolute Time sozinho).

**ESC pause clock still runs (2026-09-25):** sintoma = ESC aberto, chip `Nm/Mm · %` sobe. Causa = override `paused_but_time_live` (Absolute Time ≥0.2s) — no MSFS 2024 Absolute Time **continua** no menu pause com avião parado. Fix = remover unfreeze por Absolute Time; sticky só limpa com motion; se Absolute Time **trava** no gap wall do Watch (≥0.4s) sem motion → `sim_time_stopped` mesmo com `IS PAUSED` false.

**PHASE Approach (2026-09-25):** `advanceFlightPhase` entra em `approach` com dest ≤ **~15 nm** (+ descent/level; sticky até ~18 nm). Rota curta perto do ARR = Approach esperado — não é settle.
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
7. ~~**GET `/api/ports`:**~~ `persist: 'portMarket'`.
8. ~~**GET Freights / Demand / dealer:**~~ inbound patch, demand_orders table, dealer blob. Warehouse stock abandon = company.
9. ~~**FBO hold/release + crew/bush/fuel/select-hub:**~~ lot slice via `commandSliceHoldId`; crew assign/bush/debug/ground-staff fire = company; select-hub = blob (`homeCountryId`).
10. ~~**Contract-pilot accept:**~~ `persist: 'npcLive'` (NPC + flights + dirty lots/inbound/airports; not port/demand rewrite).
11. ~~**Bush homologate + staging auto-dispatch:**~~ one hub airport patch; staging dispatch = mission slice.
12. ~~**GET health/NPC + Watch depart:**~~ GETs skip catch-up; Watch auto-depart/false-depart = mission slice.
13. ~~**Airport GET hydrate + bush Watch:**~~ terminal inventory hydrate skips catch-up; bush depart/settle = company only. Tick still full `saveEconomy` (`POST /api/init` removed 2026-09-14).
14. ~~**Company persist skip + ledger patch:**~~ identical `saveMissions` no-ops; ledger upsert + delete-not-in (no `DELETE FROM ledger` wipe). Dealer GET blob still calls `saveMissions` but skips SQL when unchanged.
15. ~~**Fleet/missions skip:**~~ `saveMissions` só reescreve frota, tabela de missões, `company_state`, stub ou ledger quando aquele slice mudou (ex. parking fee = wallet+ledger, sem `replaceFleet`).
16. ~~**Fleet/mission row patch:**~~ upsert + delete só das tails/missões dirty (assinatura por id); full rewrite se ≥80 mudanças, como lots.
17. ~~**Accept / Depart / Buy / Cancel comandos:**~~ idempotentes; Watch auto-depart usa `executeDepartFlight`.

## Outros comandos (mesmo molde)

| Comando | Hot | Não no comando |
|---------|-----|----------------|
| ~~`AcceptLot`~~ | lot reserved, missão `accepted`, inbound_pending, tail assign | spawn de lots novos |
| ~~`DepartFlight`~~ | status `in_flight`, fuel debit, airborne stamps | — |
| ~~`CancelMission`~~ | status cancel, release tail, lot devolve | — |
| ~~`BuyAircraft`~~ | wallet + instance `sold` + fleet row | rebalance pool mundial |

`executeAcceptLot` / `executeAcceptManifest` / `executeDepartFlight` / `executeBuyAircraft` / `executeCancelMission` em `career-persist-commands.ts`. Replay: mesmo lot na missão aberta; `in_flight` sem segundo Jet-A; mesmo casco (matrícula) na frota; cancel já `cancelled` não devolve o lote de novo. Buy/lease/sell: `persist: 'aircraftMarket'` (pool + company only; PG `persistAircraftPoolToPg` — not full economy). Slice de comando também persiste demand order / NPC live se a missão for Demand ou contract-pilot.

## Fora

- Não retunar `Dry` / `CARGO_FLOW_BALANCE`.
- Não misturar inject/SimConnect neste recorte.
- Não apagar `economy_json` stub até o hot path não hidratar mais o blob.

## Como validar a fatia 1–2

- Settle live: overlay Settling → debrief; save ainda consistente no reload (missão completed, wallet, dest stock, tail no dest).
- **UI (2026-09-05):** overlay `Settling…` arma no brake/`lastEvent=settle`; server **250ms** com `settling=true` antes do persist (poll consegue pintar); debrief imediato; toast só fallback.

**iFly idle false Settling overlay (2026-09-25):** sintoma = pouso no dest; overlay Settling eterno; missão ainda `in_flight`; log sem `settle begin`. Causa = UI `showSettleBusyOverlay` / optimistic armavam com `enginesRunning===false` (idle iFly) **sem** Watch ter settleado; World API às vezes `fetch failed` no write. Fix = auto-settle só com **parking brake**; overlay só brake / `settling` / `lastEvent=settle`; freeze sticky não bloqueia settle no solo com brake; log `settle begin/saved/failed`.

**iFly idle false settle + sticky Settling (2026-09-25):** sintoma = pouso 737 iFly sem parking brake / sem cutoff → overlay Settling; idle lia `enginesRunning=false`; reinício mantinha overlay; missão ainda `in_flight`. Causa = `isShutdownOrParked` + UI optimistic aceitavam engines-off sozinho; World API `fetch failed` no settle write. Fix = settle só com **parking brake** (GS baixo); overlay optimistic só brake / `settling` / `lastEvent=settle`.
- Log/tempo: `saveEconomy` no settle **sem** `DELETE FROM airports` (watch-debug ou timer no store).
- Teste unitário: segundo `SettleFlight` no mesmo `missionId` não duplica payout.
