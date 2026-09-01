# Open work / backlog curto

Atualizado 2026-09-01: **WorldTickService wired** — `LocalWorldTickService` em `createCareerApiServer`; pulse/login/catch-up chip via service; `nextPulseAtMs` no `/api/state`. Ver `14-mp-world-clock.md`.

Atualizado 2026-09-01: **Catch-up acelerado (SP)** — sintoma: login pós-offline demora minutos; Crew/Freights vazios enquanto pulse monopoliza lock 4–10s. Fix: login burst **12 batches** (`LOGIN_CATCH_UP_TICKS`); timer **8 batches / 15s**; pulse usa `ensureEconomyCaughtUpCooperative` + lock chunk **2** (`CATCH_UP_LOCK_CHUNK_TICKS`) com `setImmediate` entre chunks. Constantes: `career-clock.ts`; cooperative: `ensureEconomyCaughtUpCooperative` em `career-economy.ts`; pulse: `runBackgroundEconomyPulse` em `api.ts`.

Atualizado 2026-09-01: **Login lento / Freights loading** — `/api/state` ~8s cold SQLite; pulse + lock fila. Fix: `store-warm` pós login; `topUp`/`heal` só no catch-up (não em read); UI `careerStateReady` pinta wallet após state; Freights boot loader sem tabela/scroll fantasma.

Atualizado 2026-09-01: **Crew needed rota impossível (starter)** — sintoma: Light TP (YS-11) em KLAX→SCEL ~4850 nm com lift/fee. Causa: `contractPilotHasFlyableAirframe` só checava fuel/MTOW, não `maxRangeNm` do catálogo; floor starter podia pegar lot intl longo. Fix: gate de alcance em `listContractPilotPickAirframes` / `contractPilotLiftKg` + cap no `pickStarterFloorLot`.

Atualizado 2026-09-01: **Crew needed vazio pós-offline** — sintoma: tab Crew 0 linhas sem filtro. Causa: (1) `awaiting_pilot` sem `lots` correspondente (prune SQLite) → `listMarketLots` ignora; (2) catch-up deixa ~3800 NPC `in_flight` → floor US (10) não abre. Fix: `healAwaitingPilotBoardLots` + `topUpStarterContractPilotFloor` em `migrateEconomyWorld` / `ensureEconomyCaughtUp` (`career-npc.ts`).

Atualizado 2026-09-01: **Profile gate erro** — falha em `profiles/select` → banner `.error` fixo acima do painel (toast stack, dismiss ×), não some com overlay.

Atualizado 2026-09-01: **Login rápido** — `profiles/select` responde sem await; **12-batch login pulse** em background (stamp MSFS + cooperative catch-up); timer **8 batches / 15s**. Log `profile-select` + `economy-pulse ok/fail`.

Atualizado 2026-09-01: **Catch-up UX** — banner grande → ícone ⟳ no topbar (tooltip); drenagem **8 batches / 15s** (timer, simulação completa). Constantes: `CATCH_UP_TICKS_PER_PULSE` / `CATCH_UP_PULSE_MS` / `LOGIN_CATCH_UP_TICKS` em `career-clock.ts`.

Atualizado 2026-09-01: **Desktop 0.3.50** shipped — pause-aware airborne clock; cruise burn lb/h; Pulse/Stats v8; formLotsIntl perf; pricing balance. Installer: [v0.3.50](https://github.com/daniielsantos/skyline-career/releases/tag/v0.3.50).

Atualizado 2026-08-31: **Hub Stats network pulse** — schema **v8** (country/tier/stock/inbound/lot counts/pay bands); `GET /api/debug/hub-economy-history`; card Network history na aba Stats. Ver `19-hub-stats.md`.

Atualizado 2026-08-31: **Light jet buy/lease** — MSRP **750k** (era 1.05M) + lease **2.3%/wk** (era 1.9%). Lear @ 1.4t/800nm ~**4.8 voos/sem** · buy ~**214**. **Light TP (ATR72)** já estava no alvo (~1.23/sem · buy ~58) — sem retune. Testes playbook earnings. UI mirror sync GA/TP/jet rates.

Atualizado 2026-08-31: **Medium piston buy/lease anti-snowball** — MSRP **1.8M** + lease **2.0%/wk** (era 1.2M / 1.35%). DC-6 @ 10t/1200nm ~**1.3 voos/sem** · buy ~**66**. Playbook: `18-aircraft-pricing-balance.md`.

Atualizado 2026-08-31: **Hub Stats shipped** — aba Stats no terminal + `hub_economy_samples` (schema v7); sampler no day boundary; 7d/30d. Ver `19-hub-stats.md`.

Atualizado 2026-08-30: **OFP FAIL falso ATR curto** — Payload=missão (3757) partido em bag+pax EFB; Intent lia só bag. Fix `ofpFreightTowardMissionKg(+missionCargoKg)`.

Atualizado 2026-08-31: **Class Ops não persistia** — `class_ops_json` em `company_state` (migrate + read/write). Sintoma: horas/cleans GA/TP crew (ex. ATR) ficavam 0/20 · 0/6 após settle/reload; Cargo Ops ok. Settle/Watch agora expõe `classOpsDeltas` no debrief.

Atualizado 2026-08-31: **Wide buy/lease anti-snowball** — MSRP **14M** + lease **1.5%/wk**; lease dealer × horas. MD-11 fair ~**$187k/wk** · depósito ~**$750k**; ~**1.4 voos/sem** @ 90t/3500nm. Playbook: `18-aircraft-pricing-balance.md`.

Atualizado 2026-08-31: **Narrow buy/lease anti-snowball** — MSRP **2.8M** + lease **2.4%/wk**; lease dealer × horas (`resolveDealerLeaseWeeklyUsd`). Playbook earnings-based: `18-aircraft-pricing-balance.md`.

Atualizado 2026-08-30: **Crew fee GA/TP (progressão)** — **10.0 / 10.75 $/nm** só por distância (sem piso starter); min global **$75**. Alvo ~**30 voos** @ ~185 nm → C172 ~$55k. Pay espalha 163 nm ≈ **$1.6k** · 230 nm ≈ **$2.3k**. Ferry inalterado. Sem `CARGO_FLOW_BALANCE`.

Atualizado 2026-08-30: **Crew fee GA/TP bump** — piso **1.85 / 2.05 $/nm** (era 1.4 / 1.65); min contract **$75** (era $50). Ainda abaixo ferry Hangar (~2.13 / 2.5). Sem `CARGO_FLOW_BALANCE`.

Atualizado 2026-08-30: **Demand /porto 4→6** — `DEMAND_ORDERS_PER_PORT_BASE=6` (+1 P2+); hub dest ainda 2. Country/global inalterados. Rebuild + 1 tick para encher mesas.

Atualizado 2026-08-30: **Crew board Freight/Net** — coluna Net em crew = **—** (não mostra lote do operador). Pay = fee. Sort Net em crew = fee. Sem inventar freight via fee÷0.3 (piso $/nm descasava).

Atualizado 2026-08-30: **Crew fee Light GA/TP** — ainda **30%** do frete, mas piso **$/nm** (`light_ga` 1.4 · `light_turboprop` 1.65) para haul longo com pay fino não pagar menos que ferry curto. Abaixo do ferry Hangar (~2.1–2.5 $/nm). Sem `CARGO_FLOW_BALANCE`.

Atualizado 2026-08-30: **Pulse tick 2680 `Dans` (~DAY 28)** — pós +7d + quotas/regionals: spoke BR **93%** / US **98%** (Dry/LM ok). **Regional BR/US 100%** live+Dry+LM (era 15%/69%). Demand US **57** open (quota ~67); desks **15/16** com board (só HNL 0). Board **7.5k**; GA **46%** / med sweet **15%**; general fill ~85%. Majors US 67% live (Pacific/CHI/DEN quiet). Sem `CARGO_FLOW_BALANCE`. Diag: `economy-pulse-day28-dans-diag.json` + hub-tiers.

Atualizado 2026-08-30: **Demand quota + regional LM** — global cap **640→1280**, target/país **6→12**, split **port-weighted** (+ rotação de desks). skipAll last-mile também para dead **regionals** (budget 8). Rebuild + 1–2d. Sem `CARGO_FLOW_BALANCE`.

Atualizado 2026-08-30: **US Demand desks vazios** — não é falta de hub. Quota por país ~**3–4** open (`globalCap/nCountries`, target 6) com **16** portos US; MIA/EWR/HOU/SJU comem os slots (iteração `CAREER_PORTS`). 10/16 US com **0** open (LAX/SEA/CHI…). Dest fill&lt;25% existe (electronics etc.). Próximo: quota proporcional a portos/hubs ou round-robin por porto. Sem Dry retune.

Atualizado 2026-08-30: **Regionals pós-unlock (tick ~1912)** — spokes OK; **regionals fracos**: BR live **15%** (3/20), US **69%** mas **0** Dry/last-mile em regionals. deadEligible **17/20 BR** + **12/39 US** (stock ~88–93%). Unlock só cobre dead **spoke** sob skipAll — regionals/majors ainda cortados. Majors BR 100% live (pouco Dry GA). Sem `CARGO_FLOW_BALANCE`. Diag: `economy-hub-tiers-post-unlock.json`.

Atualizado 2026-08-30: **Pulse tick 1896 pós-unlock (~DAY 20 / +2d)** — spoke live **BR 33%→97%**, **US 16%→98%**; liveSpokeDry/Lm quase = live. Board **7.4k**; general **1.6k→2.0k**, supplies **0.5k→1.0k**. SBPV agora last-mile spoke↔spoke (SBIH/SBCZ/SBAT…), **0** SBEG no sample recente. BR open spoke↔spoke **~140** (era ~26). Size: GA **44%** (↑ last-mile), med sweet **~15%** (era ~3%). Unlock OK; GA↑ é trade-off esperado. Sem `CARGO_FLOW_BALANCE`. Diag: `economy-spoke-vitality-post-unlock.json`.

Atualizado 2026-08-30: **A220-300 Market** — SKU `synaptic-a220-300` (`narrow_freighter`, native-simbrief); SimBrief **BCS3** airframe `Synaptic / iniBuilds (MSFS) - A220-300`. Pack `profiles/ofp/synaptic-a220-300.json`. Card PNG em `packages/career-ui/public/airframes/a220-300.png`.

Atualizado 2026-08-30: **Spoke last-mile unlock** — (1) sob `skipAll`, vitality dead-spoke ainda forma até **12** GA Dry/país×SKU (não sobe soft cap); (2) sort dest de spoke: OD diversity → feeder (spoke/regional) antes de major → fill/nm → cw. Sem `CARGO_FLOW_BALANCE`. Rebuild + 1–2d; esperar Dry no spoke + menos SBPV→só-SBEG.

Atualizado 2026-08-30: **Spoke vitality tick 1702 (~DAY 18)** — BR live spoke **32.9%** (24/73; era 35.6% @1510), US **16.3%** (31/190; era 15.3%). **0** live spoke com Dry / last-mile Dry em BR e US — “live” = só non-Dry. deadEligible ainda **~90% BR / ~97% US** (stock ok). Poucos contratos no spoke ≠ falta de hub próximo (SBPV tem vizinhos ≤600 nm); = formation Dry (skipAll/quota + bias corredor). Sem `CARGO_FLOW_BALANCE`.

Atualizado 2026-08-30: **SBPV→SBEG only (DAY ~18)** — spoke↔spoke **existe** (BR open ~26 spoke↔spoke vs ~6 spoke→major). SBPV histórico só SBEG/SBKP; last-mile sort **cw primeiro** + corredor `SBEG↔SBPV` **1.4** + formCap **2** → Manaus come os slots antes de SBJI/SBMY/… (cw=1). Bulk soft feeder spoke↔spoke morre sob Dry sat (surplus∧shortage). Próximo slice opcional: diversificar dest last-mile de spoke (não sempre major com cw>1). Diag: `_diag-sbpv.mjs`.

Atualizado 2026-08-30: **Last-mile dest = só absRoom** — removido gate de fill% (0.92 ainda bloqueava BR/US a ~93%). Dest elegível se `cap−stock ≥ 180`; sort ainda prefere fill baixo. Spokes cheios passam a poder listar Dry.

Atualizado 2026-08-30: **Pulse tick 1510 pós-absRoom (~15.7d)** — BR live **32%→42%**, US **22%→25%**; board **5.6k→6.6k**; general lots **~0.6k→1.5k** (maioria **fora** BR/US). Last-mile **global** ok (incl. hops 93%→92% fill = absRoom). **BR/US ainda ~0 last-mile Dry** no board (general avail BR=8/US=4) → próximo bloqueio: **skipAll / quota Dry** em países densificados, não dest room. Medium sweet ~3%.

Atualizado 2026-08-30: **Last-mile dest sob Dry sat** — `LAST_MILE_MAX_DEST_FILL` 0.62→**0.92**; dest usa **absRoom** (`cap−stock`) ≥180 em vez de soft `roomKg` 58%; qty no absRoom; sort prefer fill baixo. Bulk inalterado. **Fuel Jet-A não gateia formLots** (só terminal/logística). Rebuild + re-pulse Dans.

Atualizado 2026-08-30: **Spoke vitality postmortem (tick ~1318)** — rebuild OK; slice **não** era stock vazio. BR/US dead spokes **~86–98% eligible** (Dry fill p50 ~85–88%, dezenas de t) mas **0** lots last-mile Dry com origem spoke. Root: Dry saturado → `roomKg`/dest fill≤0.62 sem sink → last-mile não forma. Próximo: dest-side last-mile (room absoluto / dest fill) ou feeder spoke non-Dry — ainda sem `CARGO_FLOW_BALANCE`. Diag: `_diag-spoke-vitality.mjs` / `economy-spoke-vitality-day13.json`.

Atualizado 2026-08-30: **Pulse tick 1222 `Dans` (~12.7d / “dia 13”)** — pós +2d: BR live **50%→32%**, US **26%→22%** (dead spoke 160→169). Board ~5.6k estável, pay p50 ~$4k, size mix ok (GA~25%, TP~29%, med sweet ~3%). Spoke vitality **não reverteu** a queda (confirmar rebuild do career server). Sem Dry retune. Próximo: diagnosticar se last-mile Dry nem chega no spoke (stock/skipAll) ou precisa de feeder non-Dry / flow.

Atualizado 2026-08-30: **Spoke vitality / densify** — last-mile spoke open/form **2**, fill≥**0.14**, stock share **0.55**; até **16** spokes mortos/tick (rotação) antes de major/regional; soft feeder ~**52%**. Sem Dry/`CARGO_FLOW_BALANCE`. Re-pulse Dans após 1–2d (US live vs ~26%).

Atualizado 2026-08-30: **Pulse tick 1029 `Dans` (~10.7d)** — BR live **50%** (era ~74% day7); US live **26%** (era ~70%), dead spoke **160**. Board **5.6k**, pay p50 **~$4k**. Size mix melhorou (GA≤450 **61%→25%**, TP **7%→30%**); medium sweet ainda **~3.5%**. general fill **~85%**. Sem retune Dry. Próximo: spoke vitality / densify. Canvas `economy-pulse-day11-dans`; JSON `economy-pulse-plus3d-dans-diag.json` + `economy-pulse-timeline-dans.json`.

Atualizado 2026-08-31: **Pulse lenses** World/BR/US/Spoke + dead/quiet absolutos. Ver `19-hub-stats.md`.

Atualizado 2026-08-31: **hub_economy_samples retenção 90d** + Pulse **90d**. Ver `19-hub-stats.md`.

Atualizado 2026-08-31: **Pulse denser** — spoke live/quiet, soft-fill, inbound, electronics, size mix, pay band, sparklines. Quiet = activityScore &lt; 8.

Atualizado 2026-08-31: **Economy pulse → tab Pulse (dev)** — Network history saiu da Stats; `/pulse` só com Dev Mode (junto do Lab). Ver `19-hub-stats.md`.

Atualizado 2026-08-31: **Stats UI day-1** — “No stats…” / Network vazio: fetch falhava em silêncio + pulse JSON com todos os países. Erro visível; keep pulse; aggregate só BR/US; render defensivo. Ver `19-hub-stats.md`.

Atualizado 2026-08-31: **formLotsIntl micro-opts** — +Nd lento = scan 561×SKU×2. Candidate lanes (só OD com surplus∩shortage), dirs unrolled, `precomputedLaneSat`, caps in-place, defer `routeDistanceNm`, hoist `skipAll`. Paridade `intl-hot-path` (12 ticks). Sem Dry/`CARGO_FLOW_BALANCE`.

Atualizado 2026-08-30: **formLotsIntl hot-path** — lane inbound index (`laneSatOf`/`destInboundOf`); cw pré-computado; sets surplus/shortage antes do scan 561×2; skip se `min(surplus,room) < FEEDER_LTL_MIN_KG`; `break` em `skipAll`. Paridade RNG (intl cw≥2, sem spoke rng). Teste `intl-hot-path`. Sem sample lanes / Dry.

Atualizado 2026-08-31: **Hub Stats UX** — Terminal inventory (= hub Dry stock); History spot **por commodity** (chips + SVG anotado, ≥2 samples); unidades via `weightSystem`. Ver `19-hub-stats.md`.

Atualizado 2026-08-31: **Tick advance UI** — chunk ≤24 (progress a cada ~¼ dia; +1d = 4 POSTs). Botão mostra `…Ns` enquanto o 1º chunk roda (antes 0/96 parecia travado). Hot = `formLotsIntl`, não Hub Stats (1 sample/day boundary).

Atualizado 2026-08-31: **Tick advance UI chunks** — `onTick` agora 1 POST/dia (`chunkSize` ≤96; +7d = 7×96). Antes chunk=8 → +1d 12 saves / +7d 84. Física/`CARGO_FLOW_BALANCE` intactos; settle já cobre range/lease while. Progress toast por dia no +7d.

Atualizado 2026-08-30: **Tick perf fast-forward** — bench: ~1.8s/tick quente; hot = `formLotsIntl` (561 lanes). `tickEconomyNCooperative(n>1)` usa sync (sem setImmediate/país). Cache `countryByIcao` no airport lookup. Intl loop pré-normaliza lanes. `POST /api/tick` opcional `{profile:true}` → `tickWallMs` + `tickProfile`. Sem mudar física/Dry.

Atualizado 2026-08-30: **Hold-to-viable GA board** — não é só last-mile: todos os paths GA (machinery LTL, INTL scrap, etc.). ≥180 kg + pay floor; **INTL nunca posta GA-band** (espera feeder ≥500). Feeder thin também respeita trip floor (intl mais alto). `prune`/`shrink`/`listMarketLots` no mesmo gate. Sem `CARGO_FLOW_BALANCE`.

Atualizado 2026-08-30: **formLots size + spoke feeders (global)** — `sizeSmallLotKg` exportado: spoke OD não é mais 100% GA (GA chance ~16–32%; feeder LTL desde `FEEDER_LTL_MIN_KG` 500). `LARGE_LOT_MIN_KG=2200` fecha gap 2–4 t. Spoke tier `flowMult` 0.55→0.68, maxLots/maxSmall 2→3; filler spoke↔regional ~52% (era ~38%). Last-mile: spoke open/form caps **2**; spoke fill≥**0.14**. Smoke seed: bulk GA ~25%, med ~14%, spoke live origin ~92%. Testes last-mile: park NPCs (clear `npcs=[]` reseeds). Sem retune `CARGO_FLOW_BALANCE`.

Atualizado 2026-08-30: **Micro-lot scraps (SBPV→SBEG $17 / 5 kg / 411 nm)** — resto pós-partial delivery abaixo de `SMALL_LOT_MIN_KG` (80) voltava `available` com pay pro-rata. Fix: `shrinkLotAfterDelivery(world)` + `pruneUnbookableMarketScraps` no expire/pós-NPC; Market esconde avail &lt; 80. UI 0.0 klb = arredondamento de ~5 kg.

Atualizado 2026-08-30: **Day ~7 pulse `Dans` (tick 578)** — BR live **74%** (spoke fill ~25%); US live **70%** estável vs +2d, dead spoke ~65. Board ~7.3k, pay p50 ~$727. NPC util ~40% / ready ~11%. Ação feita: micro-lots. Ainda aberto então: US spoke diluição, medium size mix (Hub Stats shipped 2026-08-31).

Atualizado 2026-08-30: **Hub Stats + economy samples** — **shipped** (2026-08-31): aba Stats + SQLite v7. Ver `19-hub-stats.md`.

Atualizado 2026-08-30: **Class board (Dans tick ~274)** — API viable ~96–100% em todas as classes (partial+range). **61% leftovers ≤450 kg**. Sweet 25–100% cap: GA ~49%, TP/LJ ~27–31% (kg p50 ainda ~450), **medium ~2.3%**, narrow ~12%, wide ~17%. Degrau fraco = medium / TP-full. JSON `economy-class-board-dans.json`; canvas `economy-class-board-dans.canvas.tsx`.

Atualizado 2026-08-30: **Cold→warm +2d `Dans` (tick 1→194)** — BR live estável ~80%. **US live 89%→70%**, dead spoke **17→66** (diluição densify). Board **2.7k→8.1k**; electronics **0→2.3k** lots (~$34k p50); **general fill ~83%** (Dry sat). Não retunar `CARGO_FLOW_BALANCE` ainda — recheck +7d. Canvas: `economy-cold-vs-warm2d-dans.canvas.tsx`; JSON `economy-pulse-cold-vs-warm2d.json`.

Atualizado 2026-08-30: **Cold pulse `Dans` (tick 1)** — BR live **81%** / US cargo-net **89%** (excl. 32 bushTripOnly); dead mostly spoke. Pay board p50 **$322** (loads ~450 kg) vs perishables p50 **~$5k**; electronics/machinery **0** lots no frio. Fill M/R/S ~45%. Não retunar ainda — repetir após 1–2 dias de economia. Artefato: `profiles/career/economy-pulse-cold-dans-diag.json`.

Atualizado 2026-08-30: **Network Find hub** — combobox ICAO/nome no painel Network; `HubNetworkMap` `focusIcao`/`focusToken` faz `easeTo` no hub (anel azul); limpar o filtro volta ao fitBounds da rede. Home continua `is-home`.

Atualizado 2026-08-30: **BR densify ICAO fix** — Carajás é **SBCJ** (não SBCI; SBCI = Carolina/MA no MSFS, ~168 nm off).

Atualizado 2026-08-30: **BR densify → ~95 rede** — +35 hubs comerciais SB* (MSFS+SimBrief) via `career-br-hubs-densify.ts` (SE/S/NE/N/CO). Seed **1281** airports; ports **224**. Sem bush novo.

Atualizado 2026-08-30: **US continental densify → ~230 rede** — +108 hubs comerciais (MSFS+SimBrief) em MW/SC/SE/NE/W/MT via `career-us-hubs-densify.ts`. Seed **1246** airports; ports **224** inalterado. Fuel producers regionais adicionados (MSP/STL/DTW/MEM/EWR/…).

Atualizado 2026-08-30: **US inland ports** — St. Louis / Memphis / Chicago / Pittsburgh / Duluth (rio→Golfo ou Great Lakes→Seaway). Hubs **KPIT** + **KDLH** novos; pickups KSTL/KMEM/KORD/KPIT/KDLH. Seed **1138** airports / **224** ports (superseded counts by densify acima).

Atualizado 2026-08-30: **Mapa Ports — desenhar raio do corridor** — backlog / talvez futuro. Círculo/anel ~500/1800 nm a partir dos pickup hubs do porto focado (esclarece mesa vazia vs bacia). Não implementar agora.

Atualizado 2026-08-30: **Bias porto→porto** — **backlog / talvez futuro**. Mesa por `portId` + raio já shipped; não implementar agora.

Atualizado 2026-08-30: **demand_orders.port_id migrate** — saves antigos sem coluna: `ensureV5Ddl` criava índice `port_id` *antes* do ALTER → abortava com `no such column: port_id`. Fix: índice só depois do ALTER. Não precisa de save novo.

Atualizado 2026-08-30: **Demand per-port desk** — `DemandOrder.portId` obrigatório em pedidos novos; mesa = spawn na bacia do porto (vago = T1/500 nm); UI filtra por `portId` + chip Vacant/Operator; Accept/Hold exige WH nos pickups do porto + raio do player. Legacy open sem `portId` expira no ensure. Sem NPC fulfill; bias porto→porto fora deste slice.

Atualizado 2026-08-30: **Sem backhaul spawn** — após Demand settle, não enviesar o board para “volta para casa” (manipula mercado; estranho no MP). Loop ida→ferry/outro rumo ou achar rota de volta no corridor. Highlight/scout de volta = só se for lente company-local no futuro; não soft-spawn.

Atualizado 2026-08-30: **Demand corridor-only v1** — **superseded by per-port desk**. Era lente no pool global; agora pedido pertence ao porto.

Atualizado 2026-08-29: **Demand corridor perf** — `ensureDemandOrders` não chama mais `hubDistanceNm` (rebuild ferry coords) por hub×aeroporto; pré-computa sets com `distanceNm` + `CAREER_HUB_COORDS`. Sintoma: open profile / Ports travava em “Loading career…”.

Atualizado 2026-08-29: **Ports slice 3 — Demand port corridor** — UI `Port corridor` count+CTA no catálogo + filtro no Demand; spawn prioriza dests perto de pickup hub em surplus; operator +1 soft slot no catchment. Player-only fulfill. **Superseded by corridor-only v1 (2026-08-30).** Hire desk bugs já shipped (`3e61bd5`) — notas “uncommitted” abaixo estão obsoletas.

Atualizado 2026-08-29: **Ports slice 2 (idle/discharge)** — snapshot sempre emite `inbound` (clock mesmo com totalKg 0); faixa `Next discharge` sempre visível no catálogo; empty board curto; sem ETA duplicado em Port stock.

Atualizado 2026-08-29: **Ports buy modal** — surplus acima do free WH vai para **yard hold** (taxa/dia); só o que cabe entra em inbound. UI: input estilo `cargo-amount` (sem spinner nativo), presets Fill WH / 50% / Max, split WH vs yard na confirmação.

Atualizado 2026-08-29: **Ports loop guidance slice 1** (career-ui) — `wait_inbound` quando WH vazio mas transfer em trânsito (não cair em `buy_port`); banner CTA após Store aponta Demand; hint na aba Demand + empty copy (tick). Ver `ports-loop-guidance.ts`. (CTA “All destinations” removido no corridor-only v1.)

Atualizado 2026-08-29: Desktop **0.3.49** shipped — classes validadas, Market ~80 famílias (A340, etc.), Comanche maxLoad 500, MD-11F Due clamp, A330/A340 SimBrief rows. Installer: [v0.3.49](https://github.com/daniielsantos/skyline-career/releases/tag/v0.3.49). Próximo: economia que “respira” no solo (não frota).

Atualizado 2026-08-29: **Todas as classes econômicas validadas** em live (inject / OFP / leituras). Catálogo Market ~80 famílias. Comanche Character maxLoad 500 (cap 300 → Sim~600 vs Due 800).

Atualizado 2026-08-29: **iniBuilds A340-300** no Market (`inibuilds-a340-300`) — packs pax/freighter/VIP; SimBrief Passenger/Preighter/VIP; card `a340-300.png` linkado.

Atualizado 2026-08-29: **light_ga** validado em live (inject/OFP/engines). Sessão endureceu engines sticky (Host/GPH/pós-inject), Corvalis `SR2T`↔`S22T`/`SR22T`, BN2 SimBrief/fuel/caps, cancel modal limpa. Proxies SimBrief leves → cargo under por MTOW é esperado (**Accept OFP cargo**).

Atualizado 2026-08-27: Loaded vs Due — **GA freighter** (`careerFreighterLivePayloadLb`: bags only) separado de Wide/Narrow `pax_and_cargo`. Watch resolve roles do pack (não `lastOfpCheck`). Inject stamp pós-write = bags, não soma com crew.

Atualizado 2026-08-25: Desktop **0.3.48** shipped — PMDG 777-200ER/LR/300ER Skyline CDU inject + pax. Validar inject live FO CDU no 300ER.

Atualizado 2026-08-24: esboço homologação colaborativa em `13-collaborative-homologation.md` (não implementar agora). Cards Market/Hangar têm **i** de add-on (`airframe-addons.ts`).

Atualizado 2026-08-24: Ports Warehouse recorte por hub (This port / All hubs); Demand vs Transfer holds; mapa feeder vs WH-WH.

Atualizado 2026-08-24: WH air bridge (WH→WH Hold/Fly now, no payout; dest WH + yard overflow). Demand holds unchanged.

Atualizado 2026-08-24: Demand warehouse holds — pledge WH kg + claim board remaining without a flight; Dispatch later; TTL by WH tier.

Atualizado 2026-08-23: MM68 (Mina Hércules, GPS) saiu do catálogo — remap MMCU. Demand Board não posta em bush / bushTripOnly (SimBrief OFP). FAA locals US Activities continuam no PLN.

Atualizado 2026-08-23: Demand Board filtra por WH (default My warehouses) — dest só se domestic ou par intl allowlisted a partir daquele hub.

Atualizado 2026-08-23: Demand Board cap escala com países (192–640, ~6/país); wanted até 12 t / 8 t. Pedidos já abertos só mudam no expire/trim.

Atualizado 2026-08-23: Maddog 82 verde (LOAD OFP → trim MZFW → INSTANT LOAD). 83/88 mesmo ritual; MZFW da row Y162 pode mudar.

Atualizado 2026-08-23: Watch pax_and_cargo Sim = soma − `crewStations` (Maddog S6/S7). Maddog EFB vs OFP ainda por medir.

Atualizado 2026-08-23: Fenix A319/A320/A321 usam `simconnectEmptyPayloadBiasLb` (EFB vazio); **sem** `efbPaxWeightLb` — o 192/196/200 empilhava em cima do bias.

Atualizado 2026-08-22: `formLots` extraído por país (bulk → last-mile → intl). Replay intacto; sem workers ainda. [`08-economy.md`](./08-economy.md).

Atualizado 2026-08-22: F7 start — dealer pool em tabela `aircraft_instances` (schema v6), matrícula única. Sem N companies.

Atualizado 2026-08-21: Market ATR 42/72, Titan, Corvalis em `main` (`62b8ea9`). BBJ2 parked. Airport tab / A2A / dual-client IPC inalterados.

**Shipped (uncommitted):** port restock is a daily inbound discharge on the economy tick (not on opening Ports). Listings spawn from yard stock only. Ports UI shows next discharge ETA. Concession P2 enlarges yard cap; renew lease scales with 7-day throughput (no extra buy discount).

## Validar (manual)

- [ ] **PMDG 738 BCF live inject:** solo, FO CDU ligado, Preflight → Inject;
  não tocar no CDU; Due fuel ≈ TOTAL; ZFW = SimBrief est_zfw; MAIN/FWD/AFT auto
- [ ] **PMDG 738 PAX:** Due = SimBrief payload; Watch Sim = S1–S6 only (sem
  crew S7–S9 / galley); Open SimBrief acdata 175/55; Preflight → Inject (FO CDU)
- [ ] **PMDG 738 BBJ2:** Market off até OEW Dual Class ≈ empty live (~102.2 klb); não reativar sem medir
- [ ] **ATR 72 Highline no Market:** após restart, cards Highline devem ser “ATR 72-600” + PNG (não typeId cru)
- [ ] **Novos SKUs no desktop instalado:** precisa rebuild/release — JSON do catálogo não hot-swap no installer antigo
- [ ] Watch CG card: após editar EFB, `% MAC` atualiza (não congela no Validate); Loaded vs Due não trava
- [x] Footer Phase taxi: Accu-Sim COMBUSTION=0 não prende em "On ground"; taxi por GS ≥5 kt (`taxi_out`)
- [ ] Preflight longe do origin → **NOT AT ORIGIN** + status line; Watch não auto-decola; spawn no hub certo limpa o card sem novo Validate
- [ ] Aerostar inject: Sim ≈ Due sem flick 672/535→751 (densidade resolveFuelDensity na pintura); tablet PAYLOAD = Due
- [ ] Aerostar schematic: Character* + BaggageWeight, não só S1/S7 clássicos
- [ ] Contract-pilot inject: não exige fuelAuthorizedOfpId (Accept OFP não trava Preflight/inject)

- [ ] Hot-swap Host novo (`resources/host`) — log `timeout storm` / `unrecognized_id storm` + `connect() will reopen`
- [ ] Watch solo: um pedido `readSimVars` (não 16 stations em série)
- [ ] Watch no ar: tick de cruise ~5s no TIMEOUT (não ~45s); next tick `force: true`
- [ ] Cruise burn: sample **antes** do weather ambient (wx TIMEOUT não pula o chip); TAS no flight batch; fallback se combustion flags zeram flow
- [ ] Cruise sample 180s: VS 400 fpm / TAS 10% / flow 20% / alt 1200 ft — não zerar em bump mínimo; spike BURN **upward** (ghost Eng2+) não reseta; **corte de velocidade/flow reinicia** a janela (não congela)
- [ ] Watch: TIMEOUT não fica em loop com pipe “up”; após backoff, sample volta
- [ ] Reinject no solo após editar EFB: matching profile → fuel/cargo sem freeze em “Reading live aircraft…”
- [ ] Caravan: leftover do Due divide L/R da fileira (não 192 num assento e 100 no outro)
- [ ] Install < 0.3.17: warning atual; Node não piora sem `sessionHealthy`
- [ ] Host antigo sem `readSimVars`: fallback sequential ainda throw no 1º TIMEOUT
- [ ] Idle no solo + editar EFB: schematic **não** colapsa para só Crew (S1/S2)
- [ ] Depois de um TIMEOUT, o tick seguinte faz disconnect+connect
  e volta a detectar mudança de payload (não gruda no mapa anterior)
- [ ] Black Square Accu-Sim: cargo no tablet (Pax/pods) **não** aparece nas
  stations clássicas — esperado, não é bug de detect via layout



## Possível próximo engenharia

1. ~~**FBO spot inventory**~~ — removido (wipe stock); Warehouses nos hubs de pickup + Demand Board.
2. ~~**Ports (Santos / Paranaguá)**~~ — buy → pickup / auto-WH; Store in WH; Demand Board fulfill (não Fly to FBO spot).
3. ~~**Port dynamic price + WH lots**~~ — listing price = hub spot × frac + jitter/clamp (frozen at spawn); warehouse deposits keep separate cost lots (±3% merge band).

3b. ~~**Port concession v1**~~ — inventory restock + reactive price; claim/renew lease; operator buffs; 1/company; gates T3+25k shipped.
3c. ~~**Port P2/P3 + specials market**~~ — P2 yard + **P3 cadence** shipped (11% restock, +slot, ETA 0.78, lease ×1.4). Specials / regional share still backlog.
4. ~~**Company tenant contract (doc)**~~ — roadmap + `08-economy`: company vs world vs pilot; sem schema members ainda.
4b. ~~**Schema v4 world tables**~~ — `worlds` / `economy_meta` / `airports` / `airport_stock` + `world_id`; terminal SQL; tick in-memory.
4c. ~~**Schema v5 world ops tables**~~ — `npcs` / `fuel_trucks` / `fuel_hauls` / `demand_orders` / `port_listings` / `port_inventories` / `port_concessions` keyed by `world_id` (`local` in SP); stripped from `economy_json`. Tick still in-memory. Player WH/concessions stay on `company_state`. Next: Postgres / members (not now).
5. ~~**Ground staff (Ports/WH)**~~ — shipped **0.3.47**: inbound + hire + grades + all 5 perks; WH T1/T2/T3.
   - ~~**Hire desk false-full**~~ — shipped `3e61bd5`: skip empty same-day pool; UI `slotsFree` fallback; `GET /api/ports` nests `groundStaff` + persist `portMarket`.
   - ~~**Hire Unknown candidate**~~ — shipped `3e61bd5`: IDs hub+day+slot; persist company on portMarket; Hire rerolls only on miss.
6. ~~**América do Sul completa (seed)**~~ — UY/PY/PE/BO/EC/CO/VE/GY/SR/GF + BR/AR/CL; ports costeiros; SimBrief allowlist regenerada.
7. ~~**América Central completa (seed)**~~ — PA/CR/NI/HN/GT/SV/BZ; ports costeiros; lanes MX/US/CO.
8. ~~**Caribe (seed, intl-first)**~~ — CU/DO/HT/JM/BS/TT/BB/LC/GD/AG; ring + KMIA/MMUN/CO/VE.
9. ~~**Dependências caribenhas**~~ — GP/MQ/CW + US-PR (região US); ports + lanes.
10. **Tick perf (formLots jobs + cooperative)** — Bulk buffer + merge por país. `tickEconomyCooperative` / `POST /api/tick` cedem o event loop entre países (`setImmediate`); cadeado de write continua. Testes e `tickEconomyN` (catch-up load) seguem síncronos. Gate: coop 1 tick = sync. Sem Dry.
11. ~~**Leftovers SX/AW/VI**~~ — SX/AW light countries + US-VI region; ports Philipsburg / Oranjestad / Charlotte Amalie; seed **551**.
12. ~~**EU-1 Western core**~~ — PT/ES/FR/GB/DE/NL/BE/IT; seed **629**; ports EU; fuel trucks 85; Americas bridge lanes.
13. ~~**EU-2 Nordics + Alps + IE**~~ — IE/DK/NO/SE/FI/CH/AT; seed **672**; ports **66**; fuel trucks **100**.
14. ~~**EU-3 Central-East + Baltics**~~ — PL/CZ/SK/HU/EE/LV/LT; seed **706**; ports **70**; fuel trucks **115**.
15. ~~**EU-4 Balkans**~~ — HR/SI/RO/BG/GR/RS; seed **734**; ports **74**; fuel trucks **130**.
16. ~~**EU-5 Iceland**~~ — IS; seed **738**; ports **75**; fuel trucks **134**.
17. ~~**EU-6 W. Balkans**~~ — BA/ME/AL/MK; seed **748**; ports **77**; fuel trucks **140**.
18. ~~**EU-7 East**~~ — TR/UA; seed **762**; ports **80**; fuel trucks **148**.
19. ~~**EU-8 Europe gaps**~~ — BY/MD/GE/AM/AZ/LU/MT/CY/XK; seed **778**; ports **84**; fuel trucks **158**. Homolog: UBBG/UDSG; UGKO dropped (no stock MSFS).
20. ~~**MENA-1 Mediterranean face**~~ — MA/DZ/TN/EG/IL; seed **803**; ports **89**; fuel trucks **175**. ICAO: HEBA/GMFF/LLER. Homolog: `npm run career-hubs -- missing` after rebuild.
21. ~~**MENA-2 Gulf**~~ — SA/AE/QA/BH/KW/OM; seed **827**; ports **97**; fuel trucks **195**. ICAO: OTHH/OMDB/OERK/OETF/OKKK. Homolog after rebuild.
22. ~~**MENA-3 North Gulf**~~ — IQ/IR; seed **841**; ports **99**; fuel trucks **215**. ICAO: ORBI/ORMM/OIIE; Bandar Abbas **OIKB** (not OIBA); Kerman **OIKK**. Homolog after rebuild.
23. ~~**MENA-4 Levant-east**~~ — JO/LB/SY; seed **848**; ports **102**; fuel trucks **230**. ICAO: OJAI/OLBA/OSDI. Homolog after rebuild.
24. ~~**MENA-5 Maghreb/Nile gap**~~ — LY/SD; seed **854**; ports **104**; fuel trucks **245**. ICAO: HLLM (not HLLT)/HLLB/HSSK (not HSSS)/HSPN. Homolog after rebuild.
25. ~~**MENA-6 Yemen**~~ — YE; seed **858**; ports **106**; fuel trucks **255**. ICAO: OYSN/OYAA. Homolog after rebuild.
26. ~~**Asia-1 Pakistan**~~ — PK; seed **864**; ports **107**; fuel trucks **265**. ICAO: OPIS (not OPRN)/OPKC. Homolog after rebuild.
27. ~~**Asia-2 India west**~~ — IN; seed **872**; ports **108**; fuel trucks **275**. ICAO: VIDP (not VIDD)/VABB/VOGO (not VOGA). Homolog after rebuild.
28. ~~**Asia-3 India south/east**~~ — IN; seed **880**; ports **110**; fuel trucks **285**. ICAO: VOBL (not VOBG)/VOMM/VOHS (not VOHY)/VECC. Homolog after rebuild.
29. ~~**Asia-4 Sri Lanka**~~ — LK; seed **884**; ports **111**; fuel trucks **295**. ICAO: VCBI (not VCCC-as-major)/VCRI. Homolog after rebuild.
30. ~~**Asia-5 Central Asia west**~~ — KZ/UZ/TM; seed **894**; ports **113**; fuel trucks **320**. ICAO: UTTT (not UTNN-as-major)/UTAK (not UTBK). Homolog after rebuild.
31. ~~**Asia-6 Central Asia east**~~ — TJ/KG; seed **899**; ports **113**; fuel trucks **340**. ICAO: UCFM (not UAFM)/UCFO (not UAFO); UTDK dropped (no stock MSFS). Homolog after rebuild.
32. ~~**Asia-7 Afghanistan**~~ — AF; seed **903**; ports **113**; fuel trucks **350**. ICAO: OAKB (not OAIX). Homolog after rebuild.
33. ~~**Asia-8 Nepal / Bangladesh**~~ — NP/BD; seed **910**; ports **114**; fuel trucks **365**. ICAO: VNKT/VNPK (not VNPR)/VGHS (not VGZR). Homolog after rebuild.
34. ~~**Asia-9 Bhutan / Myanmar**~~ — BT/MM; seed **916**; ports **115**; fuel trucks **380**. ICAO: VQPR/VYYY (not Mexico MM*). Homolog after rebuild.
35. ~~**Asia-10 Thailand**~~ — TH; seed **924**; ports **117**; fuel trucks **395**. ICAO: VTBS (not VTBD-as-major)/VTBU/VTSP. Homolog after rebuild.
36. ~~**Asia-11 Vietnam / Malaysia / Singapore**~~ — VN/MY/SG; seed **934**; ports **121**; fuel trucks **420**. ICAO: VVNB/VVTS (not VVGL/VVLT)/WMKK/WSSS. Homolog after rebuild.
37. ~~**Asia-12 Indonesia / East Malaysia / Philippines**~~ — ID/PH + MY-E/MY-K; seed **948**; ports **128**; fuel trucks **470**. ICAO: WIII (not WIHH)/WIMM (not WIMK)/RPLL/RPMY (not RPML). Homolog after rebuild.
38. ~~**Asia-13 China / Japan / Korea**~~ — CN/JP/KR; seed **962**; ports **134**; fuel trucks **525**. ICAO: ZBAA (not ZBAD-as-major)/ZSPD (not ZSSS-as-major)/RJAA (not RJTT-as-major)/RKSI (not RKSS). Homolog after rebuild.
39. ~~**Asia-14 Taiwan / Australia / New Zealand**~~ — TW/AU/NZ; seed **974**; ports **141**; fuel trucks **565**. ICAO: RCTP (not RCSS-as-major)/YSSY (not YSBK)/YMML (not YMEN)/NZAA (not NZWN). Homolog after rebuild.
40. ~~**Asia-15 China inland / Pacific hinge**~~ — CN inland + US-HI/FJ/PG/NC; seed **984**; ports **147**; fuel trucks **585**. ICAO: ZLXY (not ZLSN)/ZPPP/ZYTL/PHNL/NFFN/AYPY/NWWW (not NWWM). Homolog after rebuild.
41. ~~**Asia-16 Guam / Polynesia / Micronesia**~~ — US-GU/US-AS + PF/PW/WS/TO; seed **990**; ports **153**; fuel trucks **615**. ICAO: PGUM (not PGUA)/NTAA/PTRO/NSTU/NSFA/NFTF (not NFTV). Homolog after rebuild.
42. ~~**Asia-17 Vanuatu / Solomon / Cook / Kiribati**~~ — VU/SB/CK/KI; seed **994**; ports **157**; fuel trucks **635**. ICAO: NVVV (not NVSS)/AGGH (not AGGM)/NCRG (not NCAI)/NGTA (not PLCH). Homolog after rebuild.
43. Homologar wing tanks Twin Otter com vars corretas + writetest (só se quiser range completo).
44. Dual-client IPC — **só** se freeze Watch+inject ainda aparecer no 0.3.24+.
45. ~~**Asia-18 Saipan (PGSN / US-MP)**~~ — US-MP; seed **995** / **158** ports / **640** trucks. Homolog after rebuild.
46. ~~**Asia-19 Kiritimati (PLCH / KI-L)**~~ — KI-L; seed **996** / **159** ports / **645** trucks.
47. ~~**Asia-20 Vava'u (NFTV / TO-V)**~~ — TO-V; seed **997** / **160** ports / **650** trucks.
48. ~~**Asia-21 Santo (NVSS / VU-S)**~~ — VU-S; seed **998** / **161** ports / **655** trucks.
49. ~~**Asia-22 Munda (AGGM / SB-W)**~~ — SB-W; seed **999** / **162** ports / **660** trucks.
50. ~~**Asia-23 Aitutaki (NCAI / CK-N)**~~ — CK-N; seed **1000** / **163** ports / **665** trucks.
51. ~~**Asia-24 Bora Bora (NTTB / PF-L)**~~ — PF-L; seed **1001** / **164** ports / **670** trucks.
52. ~~**Asia-25 Asau (NSAU / WS-S)**~~ — WS-S; seed **1002** / **165** ports / **675** trucks. **Map seed complete.**
53. ~~**Asia-26 Angaur (ANG / PW-A)**~~ — PW-A; seed **1003** / **166** ports / **680** trucks.
54. ~~**Asia-27 Darwin (YPDN / AU-NT)**~~ — AU-NT; seed **1004** / **167** ports / **685** trucks.
55. ~~**Asia-28 Brunei (WBSB / BN-C)**~~ — BN; seed **1005** / **168** ports / **690** trucks.
56. ~~**Asia-29 Hobart (YMHB / AU-T)**~~ — AU-T; seed **1006** / **169** ports / **695** trucks.
57. ~~**Asia-30 Wellington (NZWN / NZ-W)**~~ — NZ-W; seed **1007** / **170** ports / **700** trucks.
58. ~~**Asia-31 Taiwan south (RCMQ / RCNN)**~~ — TW-C + TW-S; seed **1009** / **170** ports / **710** trucks.
59. ~~**Asia-32 China gap (ZSQD / ZWWW)**~~ — CN-E + CN-W; seed **1011** / **171** ports / **720** trucks. **Pacific/Asia map complete.**
60. ~~**RU-1 Russia core**~~ — RU; seed **1021** / **174** ports / **750** trucks. ICAO: UUEE/UUDD/ULLI/UNNT/UHWW/**URRP** (not URRR). Homolog after rebuild.
61. ~~**RU-2 Russia gaps**~~ — +8 hubs (ULMM/UMKK/UNKL/UIII/UEEE/UHMM/UHPP/URSS); seed **1029** / **176** ports / **765** trucks. Homolog after rebuild.
62. ~~**CN-2 China densify**~~ — +16 hubs (ZYTX/ZYCC/ZYHB/ZBHH/ZSHC/ZSNJ/ZHCC/ZSNB/ZSFZ/ZGHA/ZGNN/ZJHK/ZJSY/ZUGY/ZLLL/ZLIC); seed **1045** / **178** ports / **780** trucks. Skip ZBTJ/ZUTF. Homolog after rebuild.
63. ~~**RU-3 Russia densify**~~ — +22 hubs to **40** RU; seed **1067** / **180** ports / **800** trucks. Skip URRR. Homolog after rebuild.
64. ~~**AF-1 Sub-Saharan core**~~ — NG/GH/SN/CI/KE/ET/ZA/TZ/AO/CM; seed **1084** / **191** ports / **880** trucks. ICAO: DNMM/HKJK/FAOR/GOOY/FALE/FNLU. Homolog after rebuild.
65. ~~**AF-2 Sub-Saharan densify**~~ — UG/RW/MZ/NA/BW + DNKN/DGSI; seed **1093** / **194** ports / **920** trucks. ICAO: HUEN/HRYR/FQMA/**FQBR**/FYWH/FBSK. Homolog after rebuild.
66. ~~**AF-3 Sub-Saharan leftovers**~~ — ZM/ZW/MW/CD + GOTT; seed **1101** / **195** ports / **960** trucks. ICAO: FLKK (not FLLS), FVHA (not FVRG), FVBU, FWKI, FWCL, FZAA (not FZAB), FZQA, GOTT (not GOTB). Homolog after rebuild.
67. ~~**AF-4 Central Africa / Congo basin**~~ — CG/GA/GQ/CF/TD/BI + FZIC; seed **1110** / **199** ports / **1005** trucks. ICAO: FCBB/FCPP/FOOL/FOOG/FGSL/FEFF/FTTJ/HBBA/FZIC (not FZIA). Homolog after rebuild.
68. ~~**AF-5 West Africa leftovers**~~ — BJ/TG/BF/ML/NE/GN/SL/LR/GM/GW/CV/ST; seed **1122** / **208** ports / **1065** trucks. ICAO: DBBB/DXXX (not DXNG)/DFFD/GABS (not GAGO)/DRRN/GUCY/GFLL/GLRB (not GLMR)/GBYD/GGOV/GVAC/FPST. Island hops GVAC–GOOY, FPST–FOOL/FGSL. Homolog after rebuild.
69. ~~**AF-6 leftovers**~~ — MR/MG/MU/SC/KM/LS/SZ; seed **1130** / **213** ports / **1105** trucks. ICAO: GQNO (not GQNN)/FMMI/FMMT/FIMP (not FIMR)/FSIA (not FSPP)/FMCH/FXMM/FDSK (not FDMS). Island hops FMMI–FIMP–FSIA–FMCH plus GQNO–GOOY / FMMI–FQMA / FXMM–FAOR / FDSK–FAOR. Homolog after rebuild.
70. ~~**AF-7 Horn of Africa**~~ — SO/DJ/ER/SS; seed **1134** / **216** ports / **1125** trucks. ICAO: HCMM/HDAM/HHAS/HJJJ (not HSSJ). Hops HCMM–HKJK/HDAM, HDAM–HAAB/HHAS, HHAS–HAAB, HJJJ–HUEN/HSSK/HKJK. Homolog after rebuild.
71. ~~**EU-1 Macaronesia densify**~~ — LPMA / LPPD / GCLP (not LPPS / LPLA / GCTS); seed **1137** / **219** ports / **1140** trucks. Isolated **PT-M** / **PT-A** / **ES-CN**. Island hops LPMA–GCLP, LPPD–GCLP, GCLP–GMMN, LPMA–GMMN, GCLP–GQNO, GCLP–GVAC. Homolog after rebuild.
72. ~~**Pacific island-neighbor gap**~~ — Nadi **NFFN**–Port Vila **NVVV** / Nouméa **NWWW** (Fiji was AU/NZ-only). Lanes >= **399**.
73. **Next:** MR GQPP / DRC FZNA / EG FGBT / CV GVNP / FLSK if homolog proves stock. Africa country coverage complete except those densify leftovers.
74. **Aircraft instance pool** — **F0–F6 shipped**. **F7 (tabela):** `aircraft_instances` + unique registration; blob vazio. MP N companies ainda não. Doc: `10-aircraft-pool.md`.

## Feito (shipped 0.3.47)

- **Ground staff:** hire desk per WH; Ace→Green grades; logistics / yard / procurement / demand_desk / wh_ops.
- **WH caps:** T1/T2/T3 = 5/10/15 klb; Ports Ground staff shelf compact (fixed head + scroll body).



## Feito (shipped 0.3.31)

- **SAVN hub:** catálogo AR tinha SAVN = Neuquén (~180 nm). Corrigido → San Antonio Oeste; **SAZN** = Neuquén. Migrate stamps lat/lon/name no load.



## Feito (shipped 0.3.42)

- **EN ROUTE live load:** side panel scroll em monitor baixo; tanks LCR numa linha
centralizados; stations 5/coluna iguais; escala fluido + labels legíveis em tile estreito.



## Feito (shipped 0.3.41)

- **Brand Horizon:** accent `#f0a35a` + `BrandMark` (skyline bars + wordmark).
- **Cruise burn:** filtra motores fantasma; outlier de flow não zera a janela.
- **EN ROUTE live load:** tiles iguais Fuel/Payload/CG; stations = altura dos tanks; rail CG mais fino; header centrado de novo.



## Feito (shipped 0.3.40)

- **EN ROUTE:** Aircraft/Origin full-width alinhados; Cancel flight com estilo display + header 2-col.



## Feito (shipped 0.3.39)

- **EN ROUTE blank:** `height:0` no painel sem pai flex — `.staging-panel` agora flex-fill sob `.main-content`.



## Feito (shipped 0.3.38)

- **EN ROUTE side:** OFP / Cargo / live-load no mesmo `dispatch-enroute-block`; títulos e grids na mesma coluna esquerda.



## Feito (shipped 0.3.37)

- **Route header:** sem chips OD duplicados; hubs só com cor no texto da OFP.
- **EN ROUTE:** side panel compactado sem scrollbar.



## Feito (shipped 0.3.36)

- **Route header:** hubs origem/destino coloridos na string OFP; labels navlog removidas; technical details colapsados por padrão.



## Feito (shipped 0.3.35)

- **EN ROUTE layout v2:** briefing cards no topo; Cargo com nome; Live load no fim; ROUTE no header do mapa; technical details colapsados por padrão.
- **Watch footer:** fora da área de scroll; cruise burn via `formatFuelFlow` + `weightSystem` (imperial → lb/h). Interno sempre kg/h → `airframePerfOverrides` no settle.
- **Airborne clock:** pause/slew/menu (`IS PAUSED`) congela `airborneElapsedMs` (chip + settle gate); ver `tickAirbornePlaybackClock` / `11-persist-commands.md`.



## Feito (shipped 0.3.34)

- **EN ROUTE polish:** capacity cards mesclados na seção Cargo; live load = preflight (schematics sempre visíveis); OFP ainda colapsado.



## Feito (shipped 0.3.33)

- **Dispatch EN ROUTE cockpit:** grid mapa (~60%) + status/live-load (~40%); OFP em `<details>`; mobile stack ~40vh.



## Feito (local, sem release)

- **Airport tab:** field plate + MapLibre Hybrid satellite + runways beside the map. `MAPTILER_KEY` via `GET /api/map/satellite-style` (do not commit the key; SDK unused — MapLibre 5 vs UI 6 whitescreen).
- **Contracts map:** taller canvas (`min(50vh, 34rem)`).
- **Market board:** debounce ICAO typing; skip unfiltered bootstrap `/api/market` when the board owns the fetch.
- **Bush trips board off:** `BUSH_TRIPS_BOARD_ENABLED=false` (shared + UI flag) — aba Freights→Bush trips escondida; Accept API 503; abandon/active ainda ok.
- **Demand warehouse holds:** pledge WH kg + decrement world `remainingKg` without a flight; Dispatch = today’s Fly now; TTL T1/T2/T3 48/72/96 ticks; cancel/expire restores remaining. Several holds OK; one active Demand mission.
- **Demand Edit cargo:** reduzir devolve kg à WH + restaura `remainingKg` do pedido; aumentar retira da WH (UI `demandEditMaxKg`).
- **Ports yard lock:** buy split (free→WH / rest→yard); partial Store; Abandon oversized yard (no refund). T1 WH = **5 klb** (2268 kg); T2/T3 = 10/15 klb.
- **WH T2 hybrid upgrade:** unlock after `WAREHOUSE_T2_SHIPPED_KG` (10t) Demand Board settle from that WH + CAPEX; capacity 5t→12t.
- **Max cargo (missão):** online → SimBrief (`mzfw−oew` estrutural; `maxcargo` só se ≥½ estrutural / freighter). Catálogo JSON = fallback offline/API down (não short-circuit). Prefill light_ga ainda `manualpayload`.
- **Accept OFP cargo** também em **contract-pilot** (ex.: Blue Ridge + BN2): botão + CTA primário; trim escala pilot fee / gross.
- **BN2 Market:** um SKU `blackbox-bn2-islander-cargo-tip-tanks` (Cargo Tip Tanks + SpecialOps family).
- Defs SimConnect reusadas para batches Watch/inject idênticos (cache no Host).
- Watch backoff 8s→15s em queda do MSFS; UI `Simulator closed — retry in Ns`.
- A2A Accu-Sim: liveSource `a2a-lvars` (PayloadWeight / Fuel* / Character*) no pack Aerostar/Comanche. Sem `if (a2a)` no fill.
- Aerostar fill: se CG já passou FWD com só crew, colocar Due na metade aft (não cortar cargo). Envelope calibrado −15…15.
- CG card: pinta envelope do perfil (calibrated-live), não SimVar FWD/AFT 0–100. Watch soft-refresh de `liveMac` (cap ~1.2s); envelope pinned do Validate.
- Post-inject A2A: gate `PAYLOAD_NOT_APPLIED` lê `a2a-lvars` (não classic/MB); working plan sozinho não finge sucesso. Profile verify → `L:Character1Weight` + `L:BaggageWeight`.
- Preflight origin proximity: live MSFS ≤12 nm do `originIcao` (mesmo raio do settle); `location.ok=false` → headline **NOT AT ORIGIN** (antes do voo), step fica em load, Watch **não** auto-decola. No solo o Watch relê distância e libera o latch ao chegar no hub (sem novo Validate). Após wheels-up com latch limpo, card Origin **congela** (não fica vermelho com ORIGIN_NOT_ON_GROUND).
- Accu-Sim: **CTRL+E após inject** pode zerar Seat 1 / `Character1Weight` no EFB; start manual mantém. Não é write do Watch. Notas em `a2a-accusim.md` / Comanche / Aerostar. Comanche writePlan sem Character5/6.



## Não fazer sem pedido

- Retune economy Dry / CARGO_FLOW_BALANCE
- Uncap heavy crew
- Reintroduzir AUX writes
- Commit de pulse dumps



## Handoff para chat novo

Mensagem sugerida:

> Continua Skyline Career. Lê `@docs/agent-context/project-overview.md`, `@docs/agent-context/README.md` e `@docs/agent-context/00-constraints.md`. Desktop shipped **0.3.47**; `main` @ **62b8ea9** tem Market ATR/Titan/Corvalis + BBJ2 off. Problema atual: …

### Market homologation (2026-08-21) — feito em `main`

- SKUs: `microsoft-atr-72-600`, `microsoft-atr-42-600`, `microsoft-404-titan`, `microsoft-c400-corvalis`.
- Família ATR: um pack OFP + `matchTitlePattern`; fingerprint `stol`/`highline`.
- Titan: um Market SKU, dois packs (cargo/passengers).
- Corvalis SimBrief **SR2T**.
- Aliases Highline → família + remigração do dealer pool + arte em `AIRFRAME_CARD_ART`.
- Prompts: `docs/market-airframe-card-prompts.md`.
- BBJ2: `1a46e13` — `enabled: false` (OEW).

### UI boot (2026-08-20)

- Após selecionar perfil, o 1º `refresh()` é **scoped** à aba restaurada (`liveRefreshScope`) — Dispatch não espera Market/Airframes (~10s).
- `careerReady` state: Dispatch mostra “Loading dispatch…”; wallet sidebar/topbar mostra `…` até o boot terminar.
- `/api/state` pinta wallet/fleet/pilot **antes** do `Promise.all` das fetches scoped.

### B707 GNS payload (2026-08-20)

- Stations 1–8 OK; S3 unused; caps from CG-ok EFB mix (S5–S8 holds).
- Teto prático ~**65000** lb payload (CG ≈16% FWD); acima disso sai do envelope.
- Catálogo `maxCargoKg` **→ 29329**.
- **Inject desligado** (`injectCapable: false`) — load via EFB import.
- Roles: crew 1–2, passenger 4–5, baggage 6–8 (`pax_and_cargo`).
- **Dispatch:** `loadLayout: pax_and_cargo` — max pax from SimBrief; reserve **230 lb/seat** (175+55 bagwgt) before `cargo=`.
- Preflight Due: OFP **payload** (not baggage-only); no GA soft-cap; **no crew floor** on top of EFB sheet (S1/S2 already in station sum).
- Fuel Ready: taxi slack = max(150 lb, **1% of Due**, **SimBrief OFP taxi**) when present; UI tol = max(50, 3% Due).
- Payload Ready: tol = max(75 lb, **0.2% of Due**) — EFB station rounding (~92 lb on 64k) no longer fails.

### Next — hybrid payload on larger airframes

- Most **narrow / wide** catalog types are passenger airframes that still lift some freight (`pax_and_cargo`).
- Map station roles + `maxPaxSeats` / SimBrief live max pax per type (B707 pattern), not pure freighter.
- EFB path likely for many; inject only where proven.

### Pilot travel (2026-08-21)

- Topbar **Pilot** metric opens `PilotTravelDialog` (hub combobox + fleet ICAO chips).
- Hangar card: ferry/empty only; keep **Travel here** when pilot away.
- Confirm of cost must render above travel overlay (close picker on Go; confirm z-index 120).

### Confirm / busy UX (2026-08-21)

- Root cause of “every confirm feels slow”: `run()` held global `busy` through full `refresh()` (market+missions+NPC…), and many actions also `await refresh()` inside the lock (double).
- Fix: unlock `busy` as soon as the mutation paints; sync boards after. Ferry matches. Travel quote no longer sets global busy.

### Scoped mutation sync (2026-08-21)

- `run({ sync })`: default **no** post-mutation refresh — trust response paint.
- `sync: 'full'` only for tick / reset world / select hub.
- Scoped slices: `{ market }` (lots claimed/released), `{ missions }`, `{ aircraftMarket }`, `{ airport }` (parts/Jet-A when terminal open).
- Ferry: paint-only (no refresh).

