# VA logistics — air bridge + desk automation

Atualizado 2026-09-22. **UI copy:** directory = **Airlines**, desk = **Crew**, personal = **Company** (rotas/API `/api/va*` e códigos `VA-` intactos).
Atualizado 2026-09-23. **IH-2 multi-piloto shipped** — invite/roster (cap 8), board Internal Haul, settle fee-to-operator (VA debita pay → home do piloto), ranking 7d (airline desk labor). Sem chat/crew. Spec abaixo + [24-port-fbo.md](./24-port-fbo.md).
**IH-1** pay + Port FBO desk auto-buy (VA Fase 1 solo) intactos. Loops A/B + tiers 1–3 **decididos**.
**Doc 2026-09-19:** dual-tenant membro; **member route cut shipped**; **ferry ops shipped** (Line crew + allowance NPC + overflow home); MX owner-only; **member progression home ladder shipped** (gates + settle XP).
**Doc 2026-09-20:** **VA org perks shipped** — Flight quality → tiers Proven/Reliable/Elite (−MX / −overflow ferry); UI My VA + directory/ranking. **Buff concessão herdado shipped 2026-09-21** (buy/ETA; desk exact operator). **2026-09-21 (g):** snapshot `status: yours` = exact operator only (não pintar FBO da VA na sidebar home).
**Doc 2026-09-22:** parking **$0** em `homeHubIcao` (Crew/Company HQ) para parked/MX; off-hub inalterado. Org perk de parking = backlog.
**Doc 2026-09-22 (b):** Pilot Move no chip enquanto Crew pinado → grava VA; chrome/roster leem home → volta ao ICAO antigo — **fix shipped** (travel sempre home).
**Doc 2026-09-22 (d):** Crew Roster **Live** — Watch uploads; OD + trail. **(e–o)** … **(p)** fase Live = mesma do footer SimBridge (não OFP compliance). **(x–y)** detach + pipe hygiene sem uplink. **Soft uplink Watch→VPS shipped** (tick sample only). **(af)** mid-cruise app reopen footer/AC/burn flick — Watch cancel-stop + probe boot race. **(ag)** concurrent `/watch/start` coalesce (log-confirmed). **(ah)** Live map pan jank — defer sync / no paint-on-trail.
**Doc 2026-09-22 (c):** sidebar tab highlight adiado por `await switchCompanyForVa` antes de `goToTab` (Crew→Airlines) — **fix** pinta tab no click; restore/refresh em background.
**Doc 2026-09-24:** Display names Title Case on write — account/company/pilot; rankings usam `display_name` (não login). Multi-palavra ok. Migrate one-shot SQLite/PG.
**Doc 2026-09-20 (b):** Prepare/Accept dual-tenant — Freights/Charter/Ports list **Yours+VA** tails; ferry modal só sob CTA; Base Dispatcher permanece home-only. Operator aircraft ≠ VA.
**Doc 2026-09-21 (d):** ~~Ports pin VA for members~~ — **superseded (f)**; sidebar Ports = home.
**Doc 2026-09-21 (e):** ~~Available personal WH under VA pin~~ — **superseded (f)**; no mix on one shelf.
**Doc 2026-09-21 (h):** My VA open — não await `/api/ports` no Roster (defer Hauls/Config); selectTab(`va`) não espera App refresh. Ports — aba Port FBO só com concession `yours`.
**Doc 2026-09-21 (i):** Hauls Company Network — intencional; payload leve em `GET /api/va/hauls` (sem `fetchPorts`/write); mapa ~20rem.
**Doc 2026-09-21 (j):** My VA Logbook load — `BusyBlock` (igual Ports/Roster), não `BusyStatus` inline.
**Doc 2026-09-21 (k):** My VA Hauls load — `BusyBlock` no lugar do texto “Loading hauls…”.
Relacionado: [15-business-model.md](./15-business-model.md), [14-mp-world-clock.md](./14-mp-world-clock.md), Ports/WH em `08-economy.md` + roadmap.

## Fantasia (uma frase)

VA (ou company solo) compra barato no porto → guarda no WH → **ponte aérea WH→WH** → realiza no Demand do destino. Desk pode ser humano ou **automação paga/comodidade** (nunca pay-to-win de mercado).

**Port XL / T4 (solo+VA):** WH **T4 Port Bonded** (45 t) só em pickup hubs fecha a fantasia oceânica → tronco; saída gorda = **Wide haul** a partir do WH (não Demand 90 t). Market XL enviesado em origins de porto. Ver [`23-port-xl-warehouse.md`](./23-port-xl-warehouse.md).

**Port FBO (solo first):** Phase 0–10 shipped — chão desk + Scout (bridge+Demand+Haul) + Port shuttle; Base = perks; **1ª Base free**; **Base Dispatcher seat** + fleet Market scout (single-leg). Spec: [`24-port-fbo.md`](./24-port-fbo.md).

---

## Membro dual-tenant (frota pessoal vs VA) — **DECIDIDO · shipped**

Entrar numa VA **não** funde tenants. Register já cria `co_<login>` (owner). Join só adiciona membership na company da VA.

| | Home company (owner) | VA company (pilot/dispatcher) |
|--|--|--|
| Wallet | Sua | Da VA |
| Frota | Seus cascos (buy/lease) | Hangar da VA |
| Market / Freights / Charter / Demand | Seu board (solo) | Com tail VA + cut % → home (**shipped**) |
| **Cargo Ops / Class Ops** | Ladder própria | **Gate + XP = home do piloto** (não herda unlock da VA) |
| Internal Haul board | — | Aceita hauls da VA |
| Pay de IH (cross-company) | **Credita aqui** (`pilotHomeCompanyId`) | **Debita** o pay do haul |

**Avião pessoal:** fica na home. Não “entra” na VA nem fica inutilizável — troca o seletor de company e voa solo. Em contexto VA, o Hangar mostra a frota da VA.

**Progressão (DECIDIDO · shipped):** membro só aceita commodities/classes que **a home dele** já liberou; settle de voos VA aplica `cargoOps`/`classOps` deltas na **home** (mesmo padrão do cut). Owner na própria VA = ladder da VA (é a home dele). Board Freights + `/api/state` leem a ladder home quando `companyId` ativo ≠ home.

**Non-goal (agora):** contractor com casco pessoal em missão da VA (ownership/MX/seguro) — outro desenho.

**Hauls hold author strip (2026-09-22):** sintoma = Open desk sem quem postou. Causa = `normalizePlayerWarehouseState` reescrevia holds e **dropava** `heldByAccountId` / `heldByAuto` / `pilotPayUsd` (todo `ensurePlayerWarehouses`). Fix = persistir esses campos no normalize; API já resolvia `heldByName`. Holds antigos sem stamp ficam sem nome — Hold de novo. Distância OD no board via `routeDistanceNm`.

**Hauls hold author + map route (2026-09-22):** sintoma = Open desk sem quem postou; mapa só rede FBO/WH. Causa = hold não gravava account; CompanyNetworkMap sem OD. Fix = `heldByAccountId` / `heldByAuto` no hold (Scout/Ports/manual + Auto-haul); `/api/va/hauls` resolve `heldByName` + coords; click na row seleciona e plota rota no mapa.

**Hauls Prepare + ferry Manifest (2026-09-22):** sintoma = Open desk só Accept com cauda parked no origin (“Need parked tail at …”). Causa = `*DispatchHold` exige `locationIcao === origin` (carga no WH) e a board filtrava só at-origin. Fix = espelhar Freights: picker = todas parked VA; off-origin → **Prepare** → `StagingDraft.deskHold` + Manifest (ferry Line crew CTA); **Accept & Dispatch** só at-origin chama o mesmo trio dispatch-hold. API gate intacto; Discard Manifest não cancela o hold.

**Hauls desk Accept skipped member cut (2026-09-23):** sintoma = Demand/Haul via Hauls Accept settled OK (VA ledger + logbook bruto) mas home cashflow sem `va_member_cut`; Logbook pessoal sem sufixo `cut`. Causa = `/api/demand/dispatch-hold` e `/api/warehouses/haul/dispatch-hold` só passavam `pilotAccountId` (bridge já usava `vaPilotMissionStamp`); sem `pilotHomeCompanyId` o settle trata como owner/ops e **não** fatia. Fix = stamp completo (`pilotHome` + `vaFlight`) no trio; `createDemandMission` / `createHaulMission` gravam os campos. Mesmo bug no **Ports → WH → DISPATCH** (e Hauls Accept): ambos chamam esses endpoints. **Mesmo stamp** também alimenta `settleMission({ progression })` write-back na home — sem `pilotHome`, Cargo Ops / Class Ops / lease Dry cleans iam pra company VA (membro via Hangar home = 0 cleans). Voo já settled **não** backfill automático — fatia + XP perdidos nessa perna.

**Hauls/Demand desk skipped Class Ops gate (2026-09-23):** sintoma = membro Accept/Prepare C680 Light jet no Hauls com Class Ops home ainda locked (0.8/20 h). Causa = `*/dispatch-hold` (haul/demand/bridge) **não** usavam `withProgressionGates` nem `assertClassOpsUnlocked` (Charter já tinha; accept* tinha gates mas shared não assertava class). Fix = assert class (+ cargo re-check) em accept/dispatch haul/bridge/demand; dispatch-hold APIs wrap home ladder via `resolvePilotProgressionOps` + `withProgressionGates`. Voo já ACCEPTED pode completar — gate só em novos accepts.

**Pilot career hours + settle “for you” (2026-09-23):** sintoma = membro não via cut/clean/hours no debrief; Hangar `0/8` sem explicar última perna; sem contador de horas de piloto (só hours no airframe / Class Ops). Fix = `pilotFlightHours` + `lastSettleOutcome` na home; settle aplica hours + hangar note; debrief bloco **For you** (pay line, note, +Xh); Class Ops no debrief só se ladder ainda aberta; card dismissível `VaMemberBriefCard` no My VA. Sem fórmula de reputação por hours.

**VA member brief → stepper (2026-09-23):** sintoma = `VaMemberBriefCard` era 4 bullets densos (wallets/cuts/home/hauls). Causa = first-join mental model espremido num wall. Fix = 4 slides (Wallets → Cuts → Progression → Jobs), dots + Next/Got it, mesmo `localStorage` dismiss; × fecha cedo. Page-help `?` Crew permanece o guide longo.

**Cuts chip unlabeled (2026-09-23):** sintoma = Airlines directory `Cuts 50% / 50%` e Config readonly sem dizer o quê é cada %. Causa = pair compacto sem labels. Fix = `Mkt N% · Desk N%` + `title` tooltip (`va-cuts-copy.ts`: market hire = Freights/Charter; desk = Demand/Haul; % do net → home).

**Cuts chip range (2026-09-23):** sintoma = `Mkt 50% · Desk 50%` confunde no directory. Fix = iguais → `50%`; diferentes → `10%–50%` (low–high); tooltip ainda explica Mkt vs Desk.

**Ranking empty / IH-only (2026-09-23):** sintoma = página Ranking “No Internal Haul stats yet” apesar de Demand/Wide haul settled. Causa = `vaRecordHaulStats` só em `internalHaul===true`; board Airlines/Pilots copy IH; Pilots card escondido quando vazio; company ranking sem filtro `va_listed`. Fix = gravar desk labor (`isVaAirlineLaborMission`) em company **listed**; ranking companies só `va_listed`; API resolve `pilotsCompanyId` (active listed ou membership); UI sempre mostra Airlines + Pilots com empty states; copy airline desk. Sem backfill de settles antigos. Fora desta fatia: world pilots, Freights market-hire board.

**Ranking global all VA flights (2026-09-23):** sintoma = Freights na airline não apareciam; “Pilots · this airline” confundia. Causa = gate só desk labor + board interno. Fix = `isVaRankingMission` (desk **ou** `vaFlight`); Pilots = agregação global 7d; UI Airlines/Pilots global; sem backfill; ranking interno VA adiado.

**Ranking COALESCE boolean/int + UI declutter (2026-09-23):** sintoma = Airlines card “COALESCE types boolean and integer cannot be matched” + Refresh enorme + essays. Causa = `vaCompanyRanking` PG usava `COALESCE(va_listed, 0)` mas coluna é `BOOLEAN`. Fix = `c.va_listed IS TRUE`; UI sem help walls / botão Refresh (retry só no erro; detalhe no `?`).

**Ranking tabs + Airlines cards (2026-09-24):** sintoma = Airlines/Pilots empilhados em listas magras. Fix = tabs Airlines | Pilots; rows no chrome `va-directory-card` (place + name + Distance/Flights/Quality/Perks).

**Airlines profile map slice (2026-09-23):** sintoma = directory só listava cards. Fix = click/View → `GET /api/va/profile/:id` + `VaAirlineProfilePanel` (stats + `CompanyNetworkMap`); `buildPublicAirlineNetworkNodes` = HQ pin + Port FBOs + WHs (stock redacted). Sem live flights / tiers Pilops. **Icons (2026-09-23):** HQ/FBO/WH glyphs sólidos (fill full, cutouts escuros) — não outline translúcido. Perfil: mapa `.va-airline-profile-network .va-company-network-map` ~38rem.

**Desk hold partial load (2026-09-22):** sintoma = hold wide (ex. 53 klb) > Citation ops cap → Accept all-or-nothing falhava. Causa = `*DispatchHold` só tirava o hold inteiro. Fix (opção 1) = `kg` opcional no trio haul/bridge/demand dispatch-hold; withdraw + pay pro-rata; remainder fica no Open desk. Manifest: slider `loadKg` ≤ min(hold, ops cap); commit manda `kg`; Discard ainda preserva hold completo.

**Manifest Load Max 4996 vs “5.0 klb” (2026-09-24):** sintoma = slider/input imperial para em ~4996 lb com label hold/load **5.0 klb**. Causa = economia em **kg**; `formatMass` arredonda 1 decimal (`2266 kg × 2.2046… ≈ 4996 lb` → `5.0 klb`); Max = `floor(kg)` do hold (não 5000 lb “redondo”). Não é cap cortando carga — Max já é 100% do hold. Mesma família do dust WH/`displayAmountToStoredKg` (24-port-fbo).

**Hauls Accept flick oversize (2026-09-22):** sintoma = Accept “flick” + erro ops cap (Citation vs ~53 klb) e botão continuava Accept. Causa = board não recebia `resolveMaxCargoKg` → `holdNeedsPartialLoad` nunca virava Prepare; Accept full-hold batia no server. Fix = passar cap do VaPage; CTA **Prepare** quando hold > ops cap (mesmo at-origin) → Manifest slider; picker = qual cauda VA voa / ferries.

**VA parallel cargo per pilot (2026-09-22):** sintoma = amigo não Accept enquanto outro membro tem missão na VA (fatiar hold / voar junto). Causa = gate `listActivePlayerMissions` company-wide em haul/bridge/demand + staging/commit + Charter. Fix = `listActivePlayerMissionsForPilot(pilotAccountId)` (legado sem stamp ainda bloqueia todos); Dispatch/Watch/Prepare usam só a missão do account logado.

**Hauls / Ports route dest markers (2026-09-22):** sintoma = plotar hold/transfer só desenhava a linha — destino fácil de perder no zoom. Causa = `CompanyNetworkMap` / `PortsMap` tinham line layer sem endpoint labels. Fix = markers DEP/ARR com ICAO (estilo Dispatch) nos ends da desk route / bridgeLegs. CI: `new Map` em PortsMap colidia com MapLibre `Map` → `globalThis.Map` (igual CompanyNetworkMap).

**My VA chrome title = airline name (2026-09-22):** sintoma = “MY VA” no h1 + “LAMUSINE” no head do pane (herói duplicado). Causa = chrome `pageTitle` fixo + `va-my-title` com displayName. Fix = h1 = nome da VA (`onVaIdentity`); sidebar continua My VA; head do pane só meta (hub/seats/role/org).

**My VA chrome title flicker (2026-09-22):** sintoma = ao abrir My VA o h1 mostra “My VA” e depois troca pro nome. Causa = (1) unmount limpava `vaChromeTitle`; (2) `onVaIdentity(null)` antes do fetch (`listed` false). Fix = prefetch `/api/va/members` já grava o displayName; VaPage só notifica após `loaded`; null no chrome só leave/unlist / listed false pós-load.

**VA Ledger Credit beside wallet (2026-09-22):** hero em 3 colunas Wallet | Credit | Flight quality (empilha em viewport estreita).

**Hauls Open desk Cancel + layout (2026-09-22):** Hold = reserva de stock/Demand até Accept ou TTL. UI Hauls tinha Accept mas sem Cancel. Fix = Cancel (bridge/haul/demand cancel APIs + `companyId`); row em grid (rota+kind+meta | actions).

**Cancel Haul false “lot pruned” toast (2026-09-22):** sintoma = cancel missão Haul (via hold) → warn “shipment lot had already been pruned or reset”. Causa = `/api/cancel` só olha `world.lots`; Haul usa id sintético `whhaul_*` e no cancel `depositCargoToWarehouse` (hold já foi consumido no Accept — **não** recria Open desk). Fix = `returnedToWarehouse` + warning null pra Haul/Bridge/Demand; toast “cargo returned to warehouse at origin”.

**Desk hold TTL visible (2026-09-22):** sintoma = Open desk / WH holds sem countdown; só Demand no board mostrava expiry. Causa = `GET /api/va/hauls` omitia `expiresAtTick`; help dizia só Accept/Cancel. Fix = API + meta “Nh left” (urgente ≤2h); Manifest herda; Ports “left”; help cita TTL (Demand capped pelo order).

**Open desk column align (2026-09-22):** sintoma = meta em flex (`·`) desalinhava Mass/Dist/Pay entre rows; Expires sumia no print antigo. Fix = stats grid rotulado (Cargo/Mass/Dist/Pay/Expires/By) como Airlines; Expires sempre (Demand = hold capped pelo order).

**Hauls Active align + pilot (2026-09-22):** sintoma = Active desalinhado do Open desk (2 cols vs 3); sem piloto; colado no rodapé. Causa = `va-hauls-row-active` grid curto + Aircraft dentro dos stats; pane sem padding. Fix = mesmo grid 3 cols (route | stats | aircraft RO); stats = Cargo/Mass/Dist/Pay/Status/Pilot (`pilotName` no `/api/va/hauls`); padding-bottom no pane.
**Hauls Open↔Active column align (2026-09-22):** sintoma = Cargo/Mass/Dist/Pay/Expires|Status/By|Pilot ainda desalinhados entre as duas listas. Causa = 3ª track `auto` (Prepare+select largo no Open, só tail no Active) → `1fr` do meio diferente por row → 6 stats não batem. Fix = tracks fixas `10.75rem | 1fr | 20rem` + stats `repeat(6, minmax(0,1fr))`.
**Hauls actions fit (2026-09-22):** sintoma = select do avião truncava contra Prepare/Cancel. Causa = gaps largos (row 1.1rem / stats 0.75rem) + actions `20rem` + wrap. Fix = gaps menores; actions `24rem`; flex nowrap (select `1 1 auto`, botões `0 0 auto`).

**My VA pane height jump (2026-09-22):** sintoma = alternar Roster/Hangar/Hauls/Ports/… mudava a altura da página. Causa = só Ports forçava fill (`:has(.va-ports-pane)`); panes curtas shrink-wrap. Fix = `va-panel-shell` + `va-pane-body` preenchem `main-content` em todas as abas.

**Roster list stuck at bottom (2026-09-22):** sintoma = título Roster no topo, lista no terço inferior (gap enorme). Causa = `va-pane-card` com `flex:1` + `.settings-card` `display:grid` → `align-content:stretch` inflava as tracks. Fix = `align-content: start` no card do shell (conteúdo cola no topo; shell ainda preenche altura).

**VA directory BusyBlock (2026-09-22):** sintoma = abrir VAs mostrava toolbar vazia / “No VAs…” sem animação. Causa = fetch sem `loaded` gate. Fix = `BusyBlock` “Loading VAs…” (mesmo padrão My VA) até `fetchVaDirectory` resolver.

**Scout Hold amount picker (2026-09-22):** ver `24-port-fbo.md` — Hold no Scout abre slider + 25/50/75/Max em vez de reservar o suggestion kg inteiro.

**Airlines / Crew / Company copy (2026-09-22):** sintoma = “VA/VAs/My VA” soava estranho para crews pequenas. Causa = label legado Virtual Airline. Fix = UI only: sidebar/directory **Airlines**, desk **Crew** (h1 = nome da airline), **Company** inalterado; pickers **Airline** / **Yours**; ledger/wallet “company”; invites ainda `VA-XXXXXXXX`. Sem rename de rotas/API/`va_listed`.

**Crew clean layout (2026-09-22):** sintoma = Crew (Roster/abas) mais verbosa que Airlines directory. Causa = meta em prosa, `settings-card` + h3, presence “Last seen / On the ground”, help walls em Hangar/Config/Logbook. Fix = shell stats strip (HQ/Pilots/Role/Org/Hiring); roster rows estilo directory (Status/At/Role); cortar blurbs de abertura; subtitle App curto.

**Hangar AOG note / overhaul ETA (2026-09-22):** sintoma = Duke em engine OH (1d light GA) parecia “maintenance” sem countdown. Causa = badge só pintava `status`; nota OH sumia atrás do ferry UI; AOG Inspect confundido com timer. Fix = badge `engine OH · 18h left`; Where “Shop at”; AOG Inspect = “not timed”. **2026-09-22 (b):** nota prosa `Overhaul · Engine · … ready Day N` removida — badge basta. **2026-09-22 (c):** glyph chave no art do card quando `maintenance`.

**Ferry tanks untouched (2026-09-22):** sintoma = Hangar/Line-crew ferry top-up + burn → tanques chegavam vazios mesmo com Jet-A no preço. Causa = `executeFerry` enchia shortfall e queimava `fuelNeededKg`. Fix = não mutar `fuelKg`; hop Jet-A continua em `totalCostUsd` (serviço incluso); copy Journey/toast.

**Crew Ledger layout + tenant cashflow (2026-09-22):** sintoma = Money map / week·month·all time abaixo do hero; Recent 15/página. Validação = `/api/cashflow` já resume ledger da company do header (`loadMissions({ companyId })`); wallet da tela bate com all-time ± credit drawn. Fix = Money map + `CashflowSummaryGrid` acima do hero; `fetchCashflow({ companyId })` explícito no VaPage; Recent **10**/página.

**Ledger Day off-by-one (2026-09-24):** sintoma = settle no Day 83 (logbook/topbar) aparecia como Day **82** no Recent activity. Causa = `dayIndex = floor(tick/96)` 0-based na row; UI pintava o índice cru. Fix = `ledgerDisplayDay` = `dayIndex + 1` no `CashflowPanel` (Hangar + Crew Ledger). Storage/windows intactos.

**Est. burn on Ledger (2026-09-24):** sintoma = Cashflow/Ledger só mostra passado; jogador não via custo fixo futuro. Fix = `estimateCareerBurnUsdPerDay` … card **Forward burn** (total + runway + grid de linhas; sem tooltip/rodapé). Estimate no footprint atual (não fatura).

**Money map → dialog (2026-09-24):** sintoma = tabela de referência (Job/Pays/Pilot earns) ocupava o topo do Ledger e empurrava wallet/activity. Causa = referência sempre inline. Fix = `?` ao lado de Company wallet abre `VaMoneyMapDialog`; page guide aponta pro atalho.

**Board picker parked-only (2026-09-22):** sintoma = Duke da airline em maintenance aparecia no picker de Freights/Contracts (`… · maintenance`) mas sumia em Charter/Hauls/Manifest. Causa = `boardEstimateFleet` aceitava `parked|assigned|maintenance`; Charter/Hauls filtravam só `parked`. Fix = `isOpsAircraftBoardSelectable` = parked only; Freights/Contracts alinhados. MX fica no Hangar até repair.

**VA directory toolbar (2026-09-22):** sintoma = paragraph longo (“joining keeps… Port FBO…”) enchendo a toolbar. Fix = remover meta; Search à esquerda, Join code à direita.

**UX:** directory + Leave copy dizem que join mantém company/wallet/frota pessoais. **Uma VA por conta** — join/request bloqueados se já for membro (ou owner) de qualquer company `va_listed`; Leave (membro) ou Unlist (owner) libera.

---

## Perspectivas My VA (owner vs membro) — **DECIDIDO · UI parcial shipped**

My VA tem **pelo menos duas leituras** do mesmo shell (Roster / Hangar / Ledger / Logbook / Config). API já rejeita ações fora do role; UI deve **esconder** controles, não só falhar no click.

| Ação | Owner | Dispatcher | Pilot (membro) |
|--|--|--|--|
| Ver roster / hangar (frota VA) | sim | sim | sim (read; mutações Hangar = ver nota) |
| Ver Ledger (wallet + cashflow VA) | sim | sim | sim |
| Ver Logbook (voos da company + membro) | sim | sim | sim |
| Ver Flight quality (+ Owner ops no credit) | sim | sim | sim |
| Accept/reject join requests | sim | sim | não |
| Create invite | sim | sim | não |
| Kick / change role | sim | não | não |
| Open recruiting on/off | sim | não | read-only |
| Publish / rename / hub (Company card) | sim | não | não |
| Unlist VA | sim | não | não |
| Leave VA | — | sim | sim |
| Config `memberRouteCutPct` (market hire) | sim | não | read-only |
| Config `memberAirlineCutPct` (desk labor) | sim | não | read-only |
| **Inspect / repair (MX)** | **sim** (debita wallet VA) | **não** | **não** |
| **Engine / airframe overhaul** | **sim** (debita wallet VA) | **não** | **não** |
| **Credit draw / repay** | **sim** | **não** | **não** |
| Voar IH / Freights com tail VA | sim | sim | sim |
| Catalog buy (listing) | sim | sim | sim |
| Scout Hold | sim | sim | sim |
| Desk auto-buy / stevedore / shuttle / abandon | sim | sim | **não** |
| Claim / renew / upgrade Port FBO | **sim** | **não** | **não** |
| Buy / upgrade warehouse (VA) | **sim** | **não** | **não** |

**Nota Hangar / MX — DECIDIDO · shipped parcial:**

- **Inspect + repair** debitam o **wallet da VA** (company ativa = VA). Fora do net do cut.
- **Engine / airframe overhaul** (Hangar CAPEX): mesmo gate **owner-only** + API `POST /api/aircraft-market/overhaul`; debita wallet VA; aplica `mxCostMult`. Reseta horas ENG ou AF (não %).
- **Só owner** autoriza MX (UI + API `403` em `/api/aircraft-market/maintenance`, `/repair`, `/overhaul`). Dispatcher e pilot = sem botão / sem API.
- Sell / lease / unlist: também owner-only na UI quando company listada; ferry / travel / assign missão ficam para membros.
- Solo (company não listada como VA): comportamento Hangar inalterado.

**Nota Ledger — DECIDIDO · shipped:**

- Wallet da VA é a **mesma** company wallet do owner — membros não têm wallet separada na VA.
- Aba **Ledger** em My VA reusa o painel do Hangar Cashflow (`GET /api/cashflow` no tenant VA ativo).
- Credit draw/repay: owner-only (UI + API gate em `/api/credit/draw` e `/repay` quando `va_listed`).
- Membros veem saldo, credit status e recent activity; não mutam credit.

**Nota reputação VA — DECIDIDO · shipped:**

- **Owner ops** (credit) = `companyCredit.repScore` (média Cargo Ops da company). Em VA listada = ladder do owner nessa company; membros **não** dual-write unlock. Fórmula de limit **inalterada** — só copy honesta (`Owner ops` no credit block; strip do Ledger **não** promove Ops como reputação de marca).
- **Flight quality** = rolling 7d de settle `flightScore.pct` + `onTime` (`company_flight_quality_stats`). Composite `0.7*avg + 0.3*onTimePct` só com ≥3 settles — sinal de org (membros contribuem).
- Settle em company `va_listed` grava quality (Freights/Demand/Charter/IH com score). UI: My VA Ledger strip = Flight quality; directory/ranking chip Quality; credit = Owner ops.
- **Org perks (shipped 2026-09-20):** `resolveVaOrgPerks` em `career-va-perks.ts` mapeia quality → tier Building / Proven (≥55, 3+) / Reliable (≥70, 8+) / Elite (≥85, 15+). Efeitos: `mxCostMult` (inspect/repair/**overhaul** VA, stacks com Base FBO) + `ferryOverflowCostMult` (overflow Line-crew cobrado no home do piloto). **Sem** Jet-A global (Base/Port já cobrem combustível). UI: chip no head My VA + bloco sob Flight quality no Ledger; directory Perks; ranking `· Proven`. **Buff de concessão herdado (shipped 2026-09-21):** `hasPortOperatorBenefits` — membros herdam buy −10% / ETA nos portos onde a VA é operador; **status snapshot `yours` = exact operator only** (2026-09-21 g — sidebar home não pinta FBO da VA; desk em My VA → Ports). **Port desk roles (DECIDIDO · shipped 2026-09-21):** VA-listed → auto-buy / stevedore / shuttle / abandon = **owner|dispatcher** (`canMutateVaPortDeskOps`); Scout Hold + Catalog buy = pilot OK; claim/renew/upgrade FBO + buy/upgrade WH = **owner**. Solo sem gate.
- **Prepare Yours+VA (shipped 2026-09-20):** chrome sticky-home escondia frota VA em Freights/Charter/Ports. Fix: prefetch `/api/va/members` → `vaSessionFleet`; `ops-fleet.ts` merge Yours+VA nos pickers; ferry Journey **não** abre no Prepare (só CTA); Accept/`companyId` no tenant do tail + pin VA enquanto Dispatch ativo. **Operator aircraft** = NPC (não VA). **Base Dispatcher** = home-only (CAPEX pessoal).
- **Freights Prepare blocked with empty home + VA fleet (2026-09-21):** sintoma = membro sem avião próprio via **Need aircraft** em Your aircraft apesar da VA ter cascos. Causa = CTA usava `fleet.length === 0` (home only), não `boardEstimateFleet` (Yours+VA); auto-tab Operator disparava antes do prefetch VA. Fix = gate/copy no `boardEstimateFleet`/`prepareOpsFleet`; init Freights espera prefetch VA.

- **Charter/Freights board VA (2026-09-20):** sintoma — Charter `Unknown aircraft acf_…` ao selecionar tail VA; Freights dropdown só home. Causa — `GET /api/charters` lia chrome home; `boardEstimateFleet` filtrava `fleet` home. Fix — query `companyId` no Fit + `resolveAircraftCompanyId`; Freights/Contracts picker usa `prepareOpsFleet` com prefixo VA/Yours.
- **Charter Class Ops + Manifest Unknown aircraft (2026-09-20):** sintoma — membro sem light jet liberado ainda via Prepare em Citation C680 VA; Manifest `Unknown aircraft acf_…` com Fit READY. Causa — (1) Charter Fit/accept **não** usavam ladder home (`resolvePilotProgressionOps`), só Freights/staging; (2) `CharterManifest` refresh omitia `companyId` → tenant home sem o casco VA. Fix — `withCharterClassOpsGate` no Fit + `assertClassOpsUnlocked` no accept; Manifest passa `resolveOpsCompanyId`.

- **Roster row spacing (2026-09-21):** sintoma = card de membro com Online/Last seen/At ICAO/On the ground empilhados (gap 0.12rem). Fix = colunas Nome | presença | local | role; gap interno 0.28rem; padding do card maior. Mobile empilha presença e local.

**Nota dual-tenant wallet / companyId — DECIDIDO · shipped (2026-09-20):**

- Abrir My VA faz `switchCompanyForVa` e grava `?company=` da VA — necessário para hangar/ledger/mutações.
- **Chrome sticky = home:** topbar Company + Wallet + Hangar da sidebar leem sempre a **home**. Label do chip é sempre **Wallet** (nunca “VA wallet”). Sessão API pode estar na VA só dentro de My VA; `paintWallet`/`commitWallet` recusam pintar chrome se `active ≠ home` (mandam para `vaSessionWallet`).
- Qualquer tab **≠ My VA** (incl. VAs directory) restaura session home antes do refresh.
- Join por código **não** troca tenant — My VA é que abre a VA.

---

## Por que entrar numa VA? (valor)

### Ladder de pay (DECIDIDO · shipped 2026-09-21)

| Caminho | Pay |
|--|--|
| **Solo empire** (teu porto / WH / frota) | **100%** |
| **Airline desk** (Demand / Wide haul / IH fee) | `memberAirlineCutPct` default **50%** (clamp 40–60) — IH fee continua 100% da fee |
| **Market hire** (Freights / Charter no casco VA) | `memberRouteCutPct` default **30%** (clamp 10–50) |

Hard rule: airline cut **max 60** — nunca ≥ solo. Listar VA vazia **não** desbloqueia pay mágico; cliff = Port FBO + stock + frota. Hauls = board do desk (bridges + Demand + haul holds).

### Shipped (IH-2)

1. **Board Internal Haul** — voar pontes WH→WH que a VA montou; pay interno → wallet home.
2. **Roster / roles** — pilot ou dispatcher; invite / request.
3. **Ranking 7d** — Airlines + Pilots **global** (all Freights/Charter/Demand/Wide/IH on listed VAs).
4. **Hangar da VA** — ver/usar cascos da company listada (mesmo wallet/frota do owner).
5. **Airline labor cut** — Demand/Haul pagam melhor que Freights no mesmo casco VA.

### Decidido no Tier 1, ainda não é o gancho principal do join

6. **Buff de concessão herdado** no porto da VA (membros herdam buy/ETA) — **shipped 2026-09-21**
7. Desk Fase 3 (auto-haul) — só com VA; depois.

### Contratos com avião da VA — **DECIDIDO (2026-09-19) · shipped**

Membro **pode** voar **Freights / Demand / Charter** (e empty ferry) com **tail da VA**, company ativa = VA.

| Contrato | Ops | Dinheiro do piloto |
|--|--|--|
| **Internal Haul** | VA: fuel da perna | Pay stamp IH → home (**shipped**; sem % extra) |
| **Demand / Wide haul** (desk stock) | VA: fuel | **`memberAirlineCutPct`** do lucro net → home (default 50%, max 60) |
| **Freights / Charter** (market hire) | VA: fuel | **`memberRouteCutPct`** do lucro net → home (default 30%) |
| **Empty ferry / Hangar reposition** | Ver **Ferry ops** abaixo | — |
| **Solo** (teu tail, company home) | Você | 100% você |

**Market hire (`memberRouteCutPct`):**

1. Owner configura o % (inteiro) = parte do **lucro da rota** que vai pro piloto (home) — Config My VA + `POST /api/va/route-cut`.
2. **Visível no directory** (`Cuts N% / M%`) + Config My VA.
3. **Lucro** = no settle `max(0, payoutUsd − fuelDebitUsd)` desta missão. MX/inspeção e **empty ferry** fora do net por perna.
4. `pilotUsd = round(routeNet × pct / 100)` → credita home (`va_member_cut`); debita VA.
5. Faixa **10–50%**; default publish **30%**.
6. Owner voando o próprio VA: **sem cut** (`pilotHomeCompanyId` = ops).
7. IH **não** recebe esse % em cima do pay stamp.
8. Accept Freights/Demand/Charter **e** Hauls desk `*dispatch-hold` **stamp** `pilotHomeCompanyId` / `pilotAccountId` / `vaFlight`.

**Airline desk (`memberAirlineCutPct`) — shipped 2026-09-21:**

1. Owner configura via Config + `POST /api/va/airline-cut` (40–60, default 50).
2. Settle usa airline cut quando missão é Demand (`demandOrderId`) ou Wide haul (`warehouseHaul`); Freights/Charter ficam no route cut.
3. Solo empire continua 100% — airline cut nunca ≥ 100 (hard max 60).
4. Hauls board lista holds desk (bridge + Demand + haul).

9. **Logbook (2026-09-20):** tag **VA** quando `vaFlight` (accept sob company `va_listed`) ou Internal Haul. Pay mostrado = `pilotPayoutUsd` (fatia home / fee IH) quando stampado no settle; senão `payoutUsd` bruto da rota. Membro Freights com cut: UI sufixo `cut`. Histórico pré-stamp: na company VA listada o GET `/api/missions` força `vaFlight` (tag), mas pay antigo continua bruto até novo settle.
10. **Logbook merge home+VA (2026-09-20):** voos solo e VA vivem em arquivos de company distintos; `selectTab` restaura home → Logbook home-only ficava vazio se só voou VA. Fix: `loadMissionsMerged` busca home + VA (`fetchMissions({ companyId })`) e `mergeLogbookMissions` por id.
11. **Logbook merge still empty (2026-09-20):** `warmCareerBeforeEnter` não setava `homeCompanyId`; merge exigia `home && va` → nunca puxava VA. Fix: stamp home no warm; merge todo tenant extra ≠ active; `GET /api/missions?companyId=` como Charter.
12. **Logbook leaked other members’ VA flights (2026-09-20):** merge puxava o arquivo inteiro da company VA. Fix: `filterVaMissionsForPilot` (`pilotAccountId` / `pilotHomeCompanyId`; legacy unstamped só pro owner).
13. **My VA Logbook tab (2026-09-20):** histórico da company (todos os membros) em My VA → Logbook; chip com nome do piloto; pay = bruto da rota. Logbook sidebar continua pessoal.
14. **Logbook list + detail (2026-09-23):** cards compartilhados (`LogbookFlightCard` / `LogbookFlightDetail`) em home + Crew; click em settled/failed reabre pilares do debrief (`buildLogbookDebriefFromMission`). Sem trail inventado. Filtro Settled|Cancelled (default esconde cancelados). Spec: [`29-flight-debrief.md`](./29-flight-debrief.md).

### Charter board infinite loading (VA tail) — **shipped (2026-09-20)**

**Sintoma:** Charter com aircraft VA selecionado (ex. `VA · Duke B60`) fica em skeleton / “Loading charters” para sempre; `0 records`.
**Causa:** `CharterBoard` punha `props.resolveAircraftCompanyId` (arrow inline do App) nas deps do `useEffect` de fetch → cada re-render do App cancelava o timer e rearmava `setLoading(true)`.
**Fix:** depender do `charterCompanyId` string resolvido, não da identidade da função.

```
VA ──(+payout)──►  VA ──(−fuel missão)──►  VA ──(−pilotUsd)──► home
```

---

### Ferry ops (empty reposition) — **DECIDIDO (2026-09-19) · shipped**

Problema: 8 membros ferryando tails da VA com fuel no wallet da company = tragedy of the commons.

**Separar:**

| | Quem paga | Notas |
|--|--|--|
| **Fuel da perna de receita** (missão) | **VA** | Já no settle; entra no net do cut |
| **Empty ferry / Hangar reposition** | Line crew allowance **ou** overflow home | **Não** é missão de receita |

**Overhead semanal (“Line crew” / ferry desk)** — narrativa: staff da VA reposiciona cascos; **não** é ground staff de WH nem Crew needed do board.

1. Owner **hire** via Config My VA (`POST /api/va/line-crew` hire) — signing + salary/semana no wallet VA.
2. Hire dá **allowance** `K = max(4, min(2×memberCap, 2×parked))` empty ferries/semana (retune 2026-09-20: piso 4, 2× parked; cap 16).
3. Reposition no allowance: **sem debit** VA; hop **instantâneo** (mesmo UX do ferry pago). ETA NPC legado é finalizado no load/settle.
4. Acima do cap / sem hire → **overflow**: empty ferry **pago na home do piloto** (`va_line_crew_ferry`). Owner sem allowance: VA paga ferry instantâneo (comportamento solo).
5. Fire: severance 1 semana (`POST /api/va/line-crew` fire).
6. MX/hours no complete NPC: wear leve por nm.

**Non-goals v1:** ferry infinito grátis; misturar com Port FBO ground staff; IAP seat.

### Line crew tiers (Desk / Ops / Network) — **DECIDIDO design (2026-09-20) · shipped**

v1 flat hire replaced by tiers (JSON `vaLineCrew.tier`; no PG migrate):

| Tier | Nome | Hire (VA) | $/semana | Allowance NPC/semana | Notas |
|--|--|--|--|--|--|
| **T1** | Desk | $2 500 (hire) | $1 800 | `max(4, min(16, 2×parked))` | Default ao hire |
| **T2** | Ops | +$4 000 upgrade | $3 200 | `max(8, min(24, 3×parked))` | Upgrade owner-only; fire volta a “sem crew” (não auto-downgrade) |
| **T3** | Network | +$7 500 from T2 | $5 500 | `max(12, min(32, 4×parked))` | Top; still overflow home beyond cap |

**Regras**
- Só **owner** upgrade/fire; salary no wallet VA; week key igual v1.
- Downgrade **não** — só fire (severance = 1× salary do tier atual) e re-hire T1.
- Overflow / owner instantâneo **inalterados**.
- Upgrade mid-week **mantém** `usedThisWeek` (allowance sobe).
- UI Config: tier + Upgrade / Fire.
- Ledger kind `va_line_crew_upgrade`.

**Backlog UI:** ~~melhorar layout da página Config~~ — **shipped 2026-09-20** (seções Hiring / Line crew / Invites / Danger).

---

## Sustento da VA — **DECIDIDO parcial**

Ops de missão + IH pay + cut + **MX/inspect** = custo VA (shipped; MX só owner). Empty ferry = Line crew + overflow no piloto (**shipped**).

Ainda OPEN (não bloqueia cut nem ferry desk): rake no IH; salary dispatcher humano; cap hauls/dia.

---

## Loops de economia

### A) Ponte aérea WH → WH — **DECIDIDO · Tier 1 · IH-1 shipped**

1. Buy no porto origem → WH A  
2. Owner/Dispatcher cria **Internal Haul**: WH A → WH B, commodity, kg, pay interno (wallet da company) — omit pay → suggest; `$0` = unpaid bridge  
3. Pilot aceita → voa → settle credita WH B + paga o pilot (`internal_haul_pay`; solo = ±ledger net 0)  
4. Em B: Demand local (ou guarda stock)

Reusa missões / Watch / settle / WH. **Não** exige vender no porto. Solo pode ser Owner+Pilot no mesmo haul.

**Pay do haul — DECIDIDO (híbrido) · shipped IH-1 · market-anchored 2026-09-25:**
- Sistema **sugere** pay = `max(floor, legacy kg+nm, Market freight quote × 0.45)` via `quoteInternalHaulPayUsd` (sample = `quoteWarehouseHaulPayUsd` / `quoteFreightLotPay` — **só leitura**, sem retune de formação)
- Dispatcher / Auto-haul `payMult` ajusta **dentro de banda** 80–150% (`clampInternalHaulPayUsd`)
- Debita **company** / credita **pilot** no settle (kind `internal_haul_pay`)
- Solo Owner+Pilot: mesmo `walletUsd`, duas linhas ledger (net 0 além de fuel/ops)
- Port shuttle **recusa** hold/missão com pay &gt; 0

**Roadmap pay / social:**
| Fatia | Escopo | Status |
|-------|--------|--------|
| **IH-1** | Quote + stamp + settle ±pay; UI Ports/Scout | **shipped** |
| **IH-2** | Schema members fino + board interno + accept outro piloto + ranking 7d | **shipped** |
| **IH-3** | Desk AI cria hauls (Fase 3) sob caps Owner | **shipped v1** (2026-09-21) |
| **NPC** | Só shuttle/bridge unpaid | Phase 8 |

### B) Especialização regional legível — **DECIDIDO · motor da arbitragem / Tier 1**

Sinais de UI (surplus / tight), contraste porto vs hub spot, bias de produção **exposto**.  
Surplus **não** infinito: cap buy/dia + restock lento (discharge %) + concorrência.

**Realização da revenda:** WH → **Demand board** (já existe). Não é listar de volta no porto.

**UI (SP):** Ports mostra prosa `Hub pressure · ICAO commodity high|low` + **Demand desk** do porto focado (`portId` no pedido; chip Vacant/Operator; alcance **500 / 1800 / open**). Spawn world-side na bacia do porto (vago = T1). **Sem backhaul por settle** — volta = achar rota no corridor, ferry, ou outro rumo (MP-safe). Bias porto→porto e **desenho do raio no mapa** = **backlog / talvez futuro**.

### C) Revenda porto → porto (bolsa no terminal) — **CAI**

Não faz parte do produto. A fantasia “compra barato → WH → revende mais caro” = **A + B + Demand**, não consignação/spot entre portos.

### Prioridade

| Tier | Itens | Status |
|------|--------|--------|
| **1 — core** | Internal haul WH→WH; UI surplus/deficit; **buff de concessão herdado por membros da VA** no porto operador | **shipped** (inherit 2026-09-21) |
| **2 — VA** | Fee-to-operator; Dispatcher desk; pay haul híbrido; **cap membros / seats expansíveis** | **DECIDIDO** |
| **3 — MP maduro** | Contest de concessão; multi-port VA (gate duro, máx limitado) · *C porto→porto CAIU* | **DECIDIDO · adiado** |

---

## Automação de desk — **3 fases fechadas**

Princípio: **comodidade / tempo**, não poder. Mesmo board, mesmo preço, mesma fila de tick que o manual. Auto **não** snipa com latência privilegiada. Auto **não** voa — só desk. Piloto humano (ou futuro crew NPC) voa a ponte.

### Fase 1 — Auto-buy (limit order porto → WH)

**Status:** **shipped solo** (Port FBO Phase 2, 2026-09-06) — `career-port-auto-buy.ts` + tick + Ports desk UI.

| | |
|--|--|
| **O que** | Ordem persistente: commodity, porto (ou “home concession”), **max $/kg**, **max kg/dia**, WH destino, pause se wallet &lt; X |
| **Quando age** | No tick / quando listing spawna — mesma resolução que buy manual |
| **Staff** | Estender `procurement` **ou** hire dedicado `buyer`; salary in-game; grade afeta só confiabilidade / mild buff já existente — **não** preço mágico extra |
| **Solo** | Manual sempre disponível e completo |
| **Monetização** | Hire in-game primeiro; IAP/VA desk seat só depois (mais ordens / multi-porto) |
| **Não faz** | Comprar acima do max price; furar cap diário; pular fila de outros buyers no mesmo tick |

### Fase 2 — Scout sugere pontes

**Status:** **shipped solo** (Port FBO Phase 7/9/10, 2026-09-06) — `career-port-scout.ts` + Ports desk; confirm → bridge / Demand / Haul hold.

| | |
|--|--|
| **O que** | Desk lista WH→WH (room), WH→Demand (pay), WH→terminal short-fill (trunk pay) |
| **Ação** | Humano **confirma** → hold; player Dispatch / fly (shuttle só bridge) |
| **Staff** | Desk Port FBO (sem hire `scout` ainda) |
| **Caps** | Max 8 por lista; min 200 kg; Port FBO no origin; haul dest fill ≤40% / ≤1800 nm |
| **Não faz** | Criar haul sozinho sem confirm; voar Demand/Market/Haul via NPC |

**Next:** Market→WH redirect continua backlog ([`24`](./24-port-fbo.md)).

### Fase 3 — Desk AI cria hauls (VA) — **shipped IH-3 v1 (2026-09-21)**

**Status:** v1 shipped — owner opt-in Auto-haul desk; tick posts Scout WH→WH Internal Hauls.

| | |
|--|--|
| **O que** | Desk cria Internal Hauls automaticamente a partir de `listPortScoutBridgeSuggestions` |
| **Quem voa** | Pilots humanos (board Hauls); AI **não** voa |
| **Caps** | max 1–3/dia (default 2); max 3 open bridge holds; pay = market×0.45 suggest × mult (0.8–1.5, Config); wallet floor |
| **Gates** | `va_listed` + **≥2 members** + Port FBO (Scout) + enabled |
| **UI** | My VA Config → Auto-haul desk; Hauls board unchanged |
| **Não faz (v1)** | OD allowlist; Demand/Haul auto; IAP desk seat; snipar board global |

### Ordem de build (automação)

```
Fase 1 (auto-buy)  →  precisa Ports + WH (já existe)
Fase 2 (scout)     →  precisa Internal Haul (loop A) + UI pressão (loop B)
Fase 3 (auto-haul) →  precisa VA members + Fase 2 + caps sociais
```

---

## Regras duras (anti money-printer / anti P2W)

1. Auto age no **mesmo tick boundary** que ações manuais — sem foresight privado longo.  
2. Preço de buy = listing (+ buff de concession/`procurement` já documentado) — automação não inventa desconto.  
3. Caps: kg/dia, hauls/dia, ordens ativas, wallet floor.  
4. Surplus regional finito (restock porto + concorrência).  
5. Fricção da ponte: fuel, payload, tempo, WH cheio, Demand que precisa existir no destino.  
6. Monetização = **mais automação / seats**, nunca airframe, pay de lot, ou claim prioritário no Market.

## Non-goals (por agora)

- Chat / company crew Hangar
- Billing / seats IAP
- Bolsa P2P de commodities
- Dual currency no porto
- Fase C (porto→porto) — **CAI**; revenda = Demand
- AI pilot voando a ponte

### VA page split (2026-09-19)

**Sintoma:** uma página misturava directory + publish + My VA; companies sem publish apareciam como VA (`recruiting` default).
**Causa:** UI monólito; directory filtrava só recruiting, não “listada”.
**Fix:** `va_listed` (SQLite **v13** / PG **v23**). Sidebar **VAs** (cards) / **My VA** (roster) / **Ranking**. Publish em **Company → Become a VA**. Directory só `va_listed`. My VA tabs: Roster / Hangar (frota company) / Config (recruiting + invite).

**Config UI (2026-09-19):** recruiting era botão “Stop recruiting” grande (`settings-choice-btn`). Agora checkbox “Open recruiting” + row compacta Create invite / Edit listing.

**Invite code (2026-09-20):** sem TTL. Um código ativo por VA; Create/Renew invalida o anterior (`expires_at_ms = now`). Unlist ainda mata invites. Cap de roster é o gate real (maxUses alto). UI: carrega código ativo + **Renew invite**.

**Leave / Unlist (2026-09-19):** membro já tinha `POST /api/va/leave` (Roster); owner não podia “desfazer VA”. Fix: `vaUnpublish` / `POST /api/va/unpublish` → `va_listed=0`, recruiting off, remove non-owners, reject pending, expire invites. Config: **Unlist VA** (owner) / **Leave VA** (membro) com confirm. Leave devolve `homeCompanyId` + companies pra trocar de tenant.

**VA name reset to pilot (2026-09-19):** Save/select-hub escrevia `missions.pilotName` em `companies.display_name` (COALESCE), apagando Lamusine→Nothin. Fix: persist company state / select-hub só atualizam `home_hub_icao`; listing name só via `vaPublish`.

**Display names Title Case (2026-09-24):** sintoma = ranking/Airlines misturavam `Nothin` / `noname` / `NoNaMe` conforme o form. Causa = account/company/pilot gravavam o texto cru (só trim/collapse). Fix = `formatDisplayLabel` Title Case por palavra no write (`career-display-name.ts`) em register, ensureCompany, VA publish, `normalizePilotName`; multi-palavra ok; login continua `[a-z0-9_]`. One-shot migrate SQLite/PG (`display_name_titlecase_v1`). Rankings já usam `display_name`, não login.

**Pilot name sticky across register (2026-09-20):** Conta nova `nullable` mostrava Identity/who `Nothin`. Causa: `signupName` React não limpava no switch de sessão e `setSignupName(prev => prev || fromAuth)` preservava o draft; select-hub gravava isso em `pilotName` enquanto `companies.display_name` ficava correto. Fix: clear `signupName` no session paint; auth sempre sobrescreve draft; resolve do hub-picker prefer company; assemble alinha pilotName↔display_name em company pre-fleet não listada; seed register seta pilotName.

**Join invite “company not owned” + who=Nothin on VA (2026-09-20):** Join ok; `session/open` no PG exigia `role=owner` (SQLite aceita qualquer membership) → erro ao switch da VA. Sidebar usava `missions.pilotName` do tenant VA (= dono). Fix: PG `authAccountOwnsCompany` = membership; sidebar/Identity preferem `authAccountLabel`.

### VA pages + publish (2026-09-19)

**Sintoma:** Settings card VA zoado (directory+roster+hauls+ranking numa coluna); jogador não achava a página.
**Causa:** UI cravada em Settings; “criar VA” não existia como fluxo.
**Fix:** sidebar VA + Ranking; Settings card removido. Narrativa: company = tenant; VA = listada via publish.

### Desktop local Failed to start / Career API exit 1 (2026-09-19)

**Sintoma:** Airframe Career “Failed to start… Career API exited early (code 1). See career-api.log”.
**Causa:** em `api.ts`, `if` órfão duplicado em `/api/va/ranking` (bloco aberto sem corpo) — `try` do `handleRequest` fechava cedo e o `catch` virava `Unexpected "catch"` (TransformError).
**Fix:** remover o `if` duplicado; esbuild ESM do `api.ts` volta a passar. Reabrir o desktop local.

### VA directory + join requests (2026-09-19)

**Sintoma:** invite-only escondia VAs do world.
**Causa:** só código privado, sem lista/pedido.
**Fix:** directory + join requests; owner Accept/Reject; `recruiting` off remove da lista aberta (invite code privado intacto). Schema SQLite **v12** / PG **v22**.

### IH-2 — shipped (2026-09-19)

**Sintoma / gap:** solo Internal Haul only; sem convidar outro piloto.
**Causa:** members table existia (auth) mas sem invite/join, board, pay cross-company, ranking.
**Fix:** schema v11 / PG v21 company_invites + haul stats; career-va.ts; APIs /api/va/*; UI sidebar **VA** + **Ranking** (publish reusa company); settle pilotAccountId/pilotHomeCompanyId + credit home quando ≠ VA.

### Member route cut — shipped (2026-09-19)

**Sintoma / gap:** membro voava Freights/Demand/Charter com tail VA e 100% do payout ficava na VA (só IH pagava home).
**Causa:** sem `memberRouteCutPct`, sem stamp de home no accept de freights, settle sem cut.
**Fix:** SQLite v14 / PG companies.member_route_cut_pct; Config + directory chip; accept stamp `pilotHomeCompanyId`; settle `va_member_cut` (net = payout−fuel); hangar pilot mutationsLocked UI.

### Ferry ops + fleet owner gates — shipped (2026-09-19)

**Sintoma / gap:** empty ferry na VA debitava company → 8 membros podiam esvaziar wallet; membros podiam sell/MX.
**Causa:** ferry sempre no ops company; sem overhead/allowance; API fleet sem role check.
**Fix:** Line crew hire/salary (`va_line_crew_*`); allowance NPC `ferry`+ETA; overflow → home (`va_line_crew_ferry`); API owner-only MX/sell/list/unlist; Config UI.

### Member progression home ladder — shipped (2026-09-19)

**Sintoma / gap:** membro voando VA herdava unlock da VA (ou não progredia na home).
**Causa:** gates/XP usavam `cargoOps`/`classOps` da company ativa (= VA).
**Fix:** `resolvePilotProgressionOps` + `withProgressionGates`; market/accept/staging/demand/WH/state usam home; `settleMission({ progression })` + write-back home; teste isolation em `career-mission.test.ts`.

### Charter skipped Class Ops on VA (2026-09-20)

**Sintoma:** Prepare Charter com jet VA (ex. C680) mesmo sem light jet na home; Manifest `Unknown aircraft acf_*`.
**Causa:** board/accept Charter não passavam pela ladder home; refresh do Manifest lia chrome home sem `companyId`.
**Fix:** Fit gated com `withCharterClassOpsGate`; accept com `assertClassOpsUnlocked` + `withProgressionGates`; Manifest `fetchCharters({ companyId })`.

### One VA per account — shipped (2026-09-19)

**Sintoma / gap:** piloto podia join/request em várias VAs ao mesmo tempo.
**Causa:** invite + join request só checavam membership da company alvo.
**Fix:** `assertAccountCanJoinVa` / `vaListedMembership`; block invite+request+accept; directory UI desabilita quando já em VA.
### My VA Loading hung on /api/va/members (2026-09-19)

**Sintoma:** My VA fica em Loading… longo / indefinido.
**Causa:** GET `/api/va/members` fazia `withCareerRead` só para snapshot Line crew → lock world+company + `loadEconomy` atrás do pulse/cold start.
**Fix:** members lê Line crew com `companyLock` + `loadMissions` + `peekEconomyWorld().tick` (sem world lock); falha soft → `lineCrew: null`.

### My VA ~20s for members (2026-09-20)

**Sintoma:** abrir My VA demora ~20s (às vezes).
**Causa:** (1) `switchToCompanyId` bloqueava atrás de `switchCompany` = clear paint + full `/api/state` refresh; (2) Line crew ainda usava `companyLock` (fila atrás do pulse) para todo membro.
**Fix:** pintar roster antes do switch; `switchCompanyForVa` só session/open + fleet/wallet leve; Line crew só para owner e sem companyLock; reads em paralelo.

### Member Config shows Line crew as not hired (2026-09-20)

**Sintoma:** owner hired Line crew; member Config ainda dizia Not hired.
**Causa:** `/api/va/members` só montava `lineCrew` quando `role === 'owner'` (otimização antiga); UI tratava `null` como not hired.
**Fix:** snapshot Line crew para qualquer membro listado (mesmo load de missions do roster); hire/fire continua owner-only; null ≠ not hired na UI.

### My VA empty for members + YOURS badge (2026-09-20)

**Sintoma:** membro entra na VA mas My VA mostra Become a VA; directory marca YOURS na VA alheia; risco de pilotName = nome da VA.
**Causa:** My VA lia só company ativa (home solo); badge usava `memberOfVaCompanyId`; `assembleMissions` backfillava `pilotName` de `companies.display_name` inclusive `va_listed`.
**Fix:** `/api/va/members` resolve listed membership + `switchToCompanyId`; join code troca tenant; badge Yours=owner / Joined=member; backfill pilotName só se company não listada.

### My VA Ledger hero: Credit under wallet + quieter Flight quality (2026-09-22)

**Sintoma:** Credit lonjão sob Money map; Flight quality com prosa/ladder densa (T#, gates, window copy).
**Fix:** Credit sobe para o hero sob VA wallet (`hideCredit` no cashflow); quality = score + tier/perks + chips de nome + Next (gates no tooltip).

### My VA Ledger for members (2026-09-20)

**Sintoma / gap:** membros não viam wallet/ledger da VA (só o chrome do owner quando tenant ativo; sem aba dedicada).
**Causa:** wallet é a mesma company do owner, mas My VA só tinha Roster / Hangar / Config — Hangar Cashflow ficava escondido no Hangar pessoal ou exigia saber trocar de contexto.
**Fix:** aba **Ledger** em My VA reusa `HangarCashflowPanel` + `GET /api/cashflow`; credit draw/repay owner-only (UI + API).

### VA Ledger hero wallet stale after OH/MX (2026-09-21)

**Sintoma:** Engine overhaul debita na Recent activity e o chip WALLET do chrome atualiza, mas o card **VA wallet** no Ledger fica no valor pré-debit até sair/voltar da página.
**Causa:** Hangar OH/inspect/repair só chamavam `commitWallet` (estado chrome); o hero do Ledger prefere `vaSessionWallet` sticky, que não era atualizado. Cashflow snapshot também não refetchava.
**Fix:** `paintOpsMutationWallet` em App — se ops company = VA listada, `setVaSessionWallet` + bump `vaLedgerRefreshEpoch`; inspect/repair/OH passam a usá-lo (com `companyId` ops).

### Company ≈ VA vocabulary (2026-09-21)

**Sintoma:** Company e VA pareciam duas entidades (Identity Lamusine + “VA listing / VA name Lamusine”).
**Causa:** publish card brandava “Become a VA” / “VA name” como produto paralelo; dual-tenant real (home vs membership) misturava com o framing.
**Fix:** UX only — card = **Open for pilots** / **In the directory** (Public name); Identity **Directory: Published**; My VA empty → Publish from Company; page-help/nav tooltips. Sem merge de tenant nem fold My VA→Company.

### Port FBO desk auto-buy idle same day (2026-09-22)

**Sintoma:** desk order ativa, listing no preço, `today 0 kg` por muitos minutos.
**Causa:** settle `daysCrossed<=0` skipava auto-buy (só midnight); catch-up só active company.
**Fix:** `runDeskHygiene` no early path same-day. **Redeploy world-api.**

### Port FBO desk role gates (2026-09-21)

**Sintoma / gap:** qualquer membro em My VA → Ports podia auto-buy / stevedore / shuttle / claim (wallet VA).
**Decisão:** Scout Hold + Catalog buy = todos; desk ops = owner|dispatcher; CAPEX FBO/WH = owner.
**Fix:** `canMutateVaPortDeskOps` + `assertVaPortDeskOps` / `assertVaOwnerForFleetMutation` nas APIs; `vaMemberRole` no `PortsPanel`.


**Sintoma / gap:** Port FBO buy (−10%) / ETA só quando `companyId ===` operador; membros no chrome home não herdavam; buy/snapshot ainda hardcodavam `LOCAL_COMPANY_ID` (MP owner também perdia buff).
**Causa:** `isPortOperator` exact-match; desk mutations e pricing no mesmo gate; buy não recebia companyId do write tenant.
**Fix:** `hasPortOperatorBenefits` (+ `alliedCompanyIds` da `vaListedMembership`); buy/ETA usam benefits; desk (auto-buy/scout/shuttle/claim) continua exact `isPortOperator`. `buyPortListing` / auto-buy tick passam `companyId` real.
**Update 2026-09-21 (g):** snapshot `concession.status: yours` = **exact operator** only (não allied) — “yours” no home Ports pintava Lease/Upgrade/Scout como pessoais. My VA → Ports (tenant VA) continua yours.

### My VA open ~5s + hide Port FBO tab without claim (2026-09-21)

**Sintoma:** entrar em My VA demora ~5s no Roster; aba Port FBO aparece sem FBO (Claim/Scout inúteis).
**Causa:** `VaPage.refresh` await `GET /api/ports` (`withCareerWrite`) antes de `setLoaded`; selectTab(`va`) ainda await App refresh.
**Fix:** Roster pinta após `/api/va/members` (+ pin); Port FBO chip só em Hauls/Config via `loadPortFbo`. selectTab(`va`) fire-and-forget App refresh. Aba Port FBO só se existir concession `yours` (Claim/Details no Catalog).

### My VA Ports pane blank + home FBO false yours (2026-09-21)

**Sintoma:** (1) sidebar Ports mostra Port FBO · P1 / Lease no Santos da VA; Scout diz Claim first. (2) My VA → Ports = ecrã preto.
**Causa:** (1) `portSnapshot` usava `hasPortOperatorBenefits` para status yours. (2) `.ports-panel` `flex:1; overflow:hidden` dentro de My VA + `.main-content:has(.ports-panel)` apanhava o embed → altura 0.
**Fix:** status yours = `operatorExact`; CSS só `main-content:has(> .ports-panel)` + embed/`va-ports-pane` com min-height/scroll; `fetchPorts({ companyId })` no desk VA.

### My VA Hauls board (2026-09-21)

**Sintoma / gap:** Internal Haul para membros só via Ports WH holds; `GET /api/va/hauls` existia sem UI em My VA.
**Causa:** IH-2 shipou board API + Ports dispatch; My VA ficou Roster/Hangar/Ledger/Config.
**Fix:** aba **Hauls** — `fetchVaHauls` + Accept via `postWarehouseBridgeDispatchHold`; strip Port FBO/WH room do home hub; CTA Open Ports desk; Accept → staging.

### Hauls Company Network load (2026-09-21)

**Sintoma:** Company Network certo no Hauls, mas ~10s; mapa baixo.
**Causa:** segundo request `fetchPorts()` (write path) só para chips/mapa.
**Fix:** `companyNetwork` embutido em `GET /api/va/hauls` via `buildCompanyNetworkNodesFromState`; mapa `.va-company-network-map` 20rem.

### Company Network map stack + imperial + glyphs (2026-09-21)

**Sintoma:** FBO+WH no mesmo pin; Hauls em t com UI imperial; chips só texto.
**Causa:** mapa desenhava FBO em `ports` e de novo em `ownedFbos`; mass metric hardcoded.
**Fix:** `ownedFbos` só `kind===wh`; pin FBO = coords do porto; `weightSystem`/`formatMass`; ícones SVG nos chips.

### Path to Port FBO checklist (2026-09-21)

**Sintoma / gap:** VA fresca sem WH T3 / Port FBO — Hauls vazio parecia feature principal; cliff do owner sem escada; join pitch não dizia que Portos é fase 2.
**Causa:** fantasia porto→WH→IH shipou sem narrativa de bootstrap (Freights VA primeiro).
**Fix:** `VaPortPathCard` em Hauls + Config (WH / T3 / shipped / cash / claim); empty Hauls + directory/page-help honestos (cut+fleet early; FBO later).

### Hauls quiet after Port FBO (2026-09-21)

**Sintoma:** Lamusine com Santos P1 — Hauls ainda mostrava Path card “Unlocked”, blurb longo, CTA Ports ×2, empty copy de pré-FBO.
**Causa:** Path card tratava pós-claim como vitória narrada; header/empty não eram state-aware.
**Fix:** Path card `null` com FBO; Hauls só strip + 1 CTA; help/empty curtos (pós-FBO = “Post from Ports”).

### Config Next steps Port FBO stale (2026-09-21)

**Sintoma:** Owner com Santos P1 + WH T3 ainda via “Path to Port FBO · see Hauls…” unchecked no Config.
**Causa:** checklist item hardcoded sem ler concessão.
**Fix:** `fetchPorts` no refresh My VA; step `is-done` com nome/P#; próximo tip = stock WH → Scout/Auto-haul.

### IH-3 VA Auto-haul desk v1 (2026-09-21)

**Sintoma / gap:** Scout confirma à mão; Hauls vazio até owner postar; Fase 3 doc aberta.
**Causa:** automação desk parou em Fase 2 (suggest + confirm).
**Fix:** `vaAutoHaul` em company_state; `tickVaAutoHaul` no day settle (com auto-buy); gates listed+≥2 members; Config enable + max/day; pay suggest×mult; não voa.

### VA loop clarity — money map + Prepare chip (2026-09-21)

**Sintoma / gap:** dual-tenant (home Wallet vs VA Ledger, Hangar vs My VA Hangar, cut vs Jet-A) ainda era mental model; Prepare mostrava prefixo VA sem explicar cut.
**Causa:** feature shipou antes da narrativa UI.
**Fix:** Ledger **Money map**; Config **Next steps**; Hangar copy company vs chrome home; Freights/Contracts `board-va-ops-chip` com cut %; page-help My VA / Freights.

### VA Ops rep + Flight quality (2026-09-20)

**Sintoma / gap:** settle já mostra flight score, mas VA não tinha reputação de org; Ops rep do credit só refletia ladder do owner e não aparecia como sinal público.
**Causa:** quality era efêmera no debrief; Cargo Ops XP de membros vai pra home (certo) e não alimenta um score de marca.
**Fix:** tabela `company_flight_quality_stats` (SQLite v15 / PG v26); settle em VA listed grava score+onTime; snapshot 7d em cashflow/members/directory/ranking; UI labels **Ops rep** vs **Flight quality** (sem dual-write de unlock).

### VA parking / +Nd tick only bills one company (2026-09-21)

**Sintoma:** +7 day no My VA Ledger — wallet VA “não muda”; parking/dispatcher aparecem só em alguns dias (ex. D75 1d), às vezes **duplicados** (2× hangar / 2× Base Dispatcher no mesmo day).
**Causa:** (1) `POST /api/tick` debita fees só no `missions` do **companyId do request** (header sticky = home na maior parte do tempo) — **não** `allCompanies` como o pulse; frota VA não é cobrada nesse advance. (2) `/api/tick` cobra com `fromTick=world.tick−n` e **não** atualiza `lastSeenTick` → session/pulse settle depois pode **re-cobrar** a mesma janela (explica 2× no D75). Path correto de débito VA existe (`settleHangarParkingFees` / Base Dispatcher / Line crew → `applyWalletDelta` na company) e o Ledger D75 prova que, quando a VA é o tenant settleado, o $ sai da wallet VA.
**Fix (2026-09-21):** `/api/tick` avança world + higiene global; depois `applyCompanySessionSettlement({ allCompanies:true })` com `companySessionFromTick` + `lastSeenTick=toTick` (home e VA cada um na sua wallet). `settleCompanyPassiveFeesForTickRange` também cobre credit / port auto-buy / inbound WH / Base Dispatcher no passive sum. Sem Dry.

### Day stuck + repeated Day N fees after allCompanies tick (2026-09-21)

**Sintoma:** após 0.3.182, +3/+7 day “não sai” do dia (ex. Day 76); Ledger spam de Hangar parking + Base Dispatcher repetidos no **mesmo** day.
**Causa:** +Nd é chunked (~24 ticks × N). Cada chunk rodava `allCompanies` settle completo (port auto-buy / WH / todos os tenants). Se o settle debitava e depois throw/timeout **antes** de persistir `lastSeenTick`, o chunk seguinte re-cobrava o mesmo day — e o request travava o avanço na UI.
**Fix:** (1) `lastSeenTick` sempre persiste em `finally` após tentativa (SQLite + PG + fallback API). (2) `settleCompanyPassiveFeesForTickRange` early-out no mesmo economy day (sem hangar/salary/credit; só crew/ferry leves). (3) `/api/tick` só usa `allCompanies:true` quando `economyDayIndex` cruza; chunks intra-day settam só o tenant do request.

### POST /api/tick discarded on Postgres RAM isolate (2026-09-21)

**Sintoma:** ainda preso no Day 76 após 0.3.183/184 (MP / world PG); +Nd “não avança”; debug credit na VA funciona; Ledger cheio de fees D76 legados.
**Causa:** `withCareerWrite` faz `isolatePostgresWorldSnapshot` (clone) em **todo** write. `/api/tick` usa `catchUp:true` → muta o **clone**, depois `deferred.pulseSnapshot = peekEconomyWorld()` (RAM velha) e `saveEconomy(applyToRam:false)` **grava o tick antigo** e ainda copia o tip velho de volta pro RAM. O JSON da response lia o clone (tick novo) → UI mentia / refresh voltava. Pulse cooperative escapava porque o catch-up muta o RAM **antes** do isolate.
**Fix:** em `isCatchUp`, não isolar — mutar `peekEconomyWorld()`; snapshot deferred = `structuredClone(world)` pós-handler; `toTick` prefere `tickPayload.tick`. **Requer redeploy do world-api (VPS)**, não só desktop update.
### Debug +$5K on VA wallet but Ledger blank (2026-09-21)

**Sintoma:** Dev +$5K/+100K credita a VA (tenant pinado no My VA) mas Recent activity não mostra linha; wallet do hero às vezes não atualiza.
**Causa:** `applyWalletDelta` grava `kind=other` + note, mas `onDebugCreditWallet` só fazia `commitWallet` — Hangar/My VA Ledger mantêm snapshot próprio. Hero preferia `cashflow.walletUsd` stale sobre `props.walletUsd`.
**Fix:** após credit, `fetchCashflow` + bump `ledgerRefreshEpoch` no VaPage; hero usa `props.walletUsd`; label “Debug credit” quando note começa com Debug; `lastLedgerPersistKey` scoped por companyId.### Prepare hides VA fleet + auto ferry (2026-09-20)

**Sintoma:** membro clica Prepare no Freights → Ferry Journey do Aerostar pessoal; dropdown do Manifest sem tails da VA. Mesmo gap em Charter/Ports.
**Causa:** chrome sticky-home → `fleet` só home; `enterStaging`/`CharterManifest` abriam ferry modal no off-origin; Operator aircraft = NPC (não VA).
**Fix:** `ops-fleet.ts` + prefetch members fleet; pickers Yours/VA; sem auto-modal; Accept/ferry com `companyId` do tail; pin VA enquanto missão Dispatch ativa; Base Dispatcher home-only.

### Credit / Ledger UI sanitize (2026-09-20)

**Sintoma:** bloco Credit no Hangar e My VA Ledger com blurb longo (taxa %, collateral, sell-back) e Draw/Repay amontoados numa row.
**Causa:** copy de debug/economia vazava pro painel; layout era flex wrap de labels+botões.
**Fix:** blurb curto (fleet + Ops); métricas Limit/Drawn/Available/Ops (+ Day interest só se >0); Draw/Repay em duas colunas; strip enxuta.

### VA credit labels = Owner ops (2026-09-20)

**Sintoma:** Ops no Ledger/credit da VA lia como reputação de org, mas é ladder Cargo Ops do owner (membros não alimentam).
**Causa:** mesmo `companyCredit.repScore` do Hangar solo, sem dual-write de unlock na VA.
**Fix (copy only):** strip do Ledger = só Flight quality; credit block na VA = **Owner ops** + blurb; fórmula de limit inalterada.

### Chrome sticky home (2026-09-20)

**Sintoma:** entrar Ledger/Hangar My VA (membro) substituía wallet/frota do chrome pelo da VA; Hangar da sidebar misturava frota.
**Causa:** um único `wallet`/`fleet` + `switchCompanyForVa` pintava state da VA no shell.
**Fix:** caches `vaSessionWallet`/`vaSessionFleet`; paint de chrome só quando `state.companyId === home`; Hangar sidebar / leave My VA restaura home; My VA Hangar/Ledger usam caches VA.

### Sidebar wallet flicker on tab switch (2026-09-22)

**Sintoma:** ao alternar botões da sidebar, o card Wallet ($1,498) piscava para outro valor e voltava.
**Causa:** sticky `paintWallet`/`commitWallet` usava `active ≠ home`, mas `selectTab` restaura home *antes* de respostas late do My VA (`fetchCashflow` / `fetchVaMembers` / ops). Com `active === home` de novo, `onWallet(VA)` e `paintOpsMutationWallet` pintavam cash da VA no chrome; o soft `refresh` seguinte corrigia → flicker. Refresh overposto sem generation guard agravava.
**Fix:** (1) My VA `onWallet` e ops VA: dual-tenant (`home ≠ memberVa`) nunca `commitWallet` no chrome — gate estável, não `active`. (2) `paintWallet`/`commitWallet` aceitam `sourceCompanyId` e recusam source ≠ home. (3) `refreshGenRef` invalida paints in-flight no tenant switch + mid-refresh. (4) VaPage unmount bumpa gens de members/ledger.
**Nota:** label "nullable" / NULLABLE no chrome é o `displayName` da company (tenant de teste), não bug de null rendering.

### Chrome flicker on VAs directory (2026-09-20)

**Sintoma:** chip Wallet alternava valor (home ↔ VA) e Company virava Lamusine no My VA / NULLABLE na directory; join pinava sessão VA.
**Causa:** restore home só ao sair de My VA→outros; `paintWallet` ainda aceitava tenant VA; Company chip lia `activeCompanyId`; join chamava `switchCompany(VA)`.
**Fix:** restore home em **toda** tab ≠ `va`; `paintWallet`/`commitWallet` sticky; Company chip = home; join sem switch de tenant.

### My VA empty flash mid hangar switch (2026-09-20)

**Sintoma:** ao abrir Hangar da VA, ~10s de “Select a company first” antes dos aviões.
**Causa:** `onSwitchCompany` inline recriava `refresh` a cada render; switch era fire-and-forget; erro transitório fazia `setRole(null)` → empty state.
**Fix:** ref estável para switch/wallet; `await` do tenant switch com BusyStatus “Opening VA hangar…”; soft-fail não limpa shell VA já carregado.

### My VA slow open + reserve vanish (2026-09-20)

**Sintoma:** My VA ficava em “Opening VA hangar…” por muito tempo; Reserve sumia ao sair/voltar da página.
**Causa:** (1) UI bloqueava o shell inteiro em `tenantSwitching` enquanto `fetchState` da VA rodava — roster já estava pronto. (2) `normalizePlayerAircraft` reconstruía o casco **sem** `reservedByAccountId` / `reservedAtMs`, então todo `saveMissions`/`loadMissions` (normalize) apagava a reserva antes de gravar/devolver.
**Fix:** shell My VA pinta Roster/Config assim que members chegam; Hangar/Ledger mostram BusyStatus só no pane; normalize preserva reserved*; teste round-trip.

### My VA hangar still slow after shell paint (2026-09-20)

**Sintoma:** Roster/tabs ok, mas Hangar ficava em “Opening VA hangar…” — `switchCompanyForVa` ainda esperava `/api/state` (withCareerRead + world lock atrás do pulse).
**Causa:** doc já pedia fleet leve; código ainda fazia full state. Members já carregava missions da VA só para presence.
**Fix:** `/api/va/members` devolve `fleet` + `walletUsd` do mesmo load; VaPage pinta hangar antes do pin; `switchCompanyForVa` só `session/open` (sem fetchState); hangar spinner só se fleet ainda vazia.

### Owner reserve click no UI update (2026-09-20)

**Sintoma:** owner clica Reserve — sem loading/badge; outra conta já via a tag.
**Causa:** Hangar do owner ainda podia pintar chrome `fleet`; `onFleet` só atualizava `vaSessionFleet`; busy do botão era o App `busy`, não o da VaPage.
**Fix:** hangar local em VaPage + sync chrome/session no owner; `busy` no card; badge aceita reserve sem `reservedAtMs` (TTL só quando presente).

### My VA Ledger slow + chrome wallet overwritten (2026-09-20)

**Sintoma:** abrir Ledger demora (atrás do pulse); chrome Wallet / sidebar do membro viram o saldo da VA.
**Causa:** (1) `GET /api/cashflow` usava `withCareerRead` (economy lock + crew settle) e ainda `summarizeCashflow` → segundo `loadMissions`. (2) `loadLedger` chamava `onWallet(snap.walletUsd)`; dezenas de mutações usavam `setWallet` cru, bypassando sticky de `paintWallet`/`commitWallet`.
**Fix:** cashflow = `loadMissions(company)` + `peekEconomyWorld` + `summarizeCareerLedger` (sem lock); Ledger não empurra wallet pro chrome; todo paint de wallet no App passa por `commitWallet`/`paintWallet` (sticky `active ≠ home` → só `vaSessionWallet`).

### Chrome wallet override on VAs / My VA (ref lag) (2026-09-20)

**Sintoma:** membro entra em VAs ou My VA e o Wallet do chrome vira o da VA (Company chip continua a home).
**Causa:** `activeCompanyIdRef` só sincronizava no re-render; `switchCompanyForVa` atualizava state/URL/memory mas o sticky lia o ref velho. `onWallet`/`refresh` no mesmo tick pintavam VA→chrome (ou home→vaSession ao restaurar). `onFleet` dos members ainda rodava **antes** do pin.
**Fix:** setar `activeCompanyIdRef` sync no switch; sticky usa `getStoredCompanyId()`; fleet/wallet dos members só após o pin.

### Member Ledger empty then fills (2026-09-20)

**Sintoma:** membro no Ledger via wallet/credit da VA mas “No ledger yet”; depois as linhas aparecem.
**Causa:** `GET /api/cashflow` rodava ainda no tenant **home** (vazio) enquanto o switch para a VA estava em voo; resposta home pintava empty; refresh/VA fetch posterior corrigia. Wallet no header vinha de `props.walletUsd` (cache VA) mas `cashflow.recent` ficava do snap home.
**Fix:** não fetch ledger durante `tenantSwitching`; invalidar gen no switch; ignorar respostas stale de cashflow.

### My VA Ledger painted personal wallet (2026-09-20)

**Sintoma:** alt abre Ledger da VA e o chrome Wallet vira o saldo da VA; ao sair continua “errado”.
**Causa:** `switchCompanyForVa` pinava `?company=` na VA sem restaurar home; Ledger chamava `onWallet(snap.walletUsd)`; refresh pintava qualquer `/api/state` sem checar tenant.
**Fix:** restaurar home ao sair de My VA; Ledger sem paint no load; paint só se `state.companyId` bate com tenant esperado; label **VA wallet**; login re-pinna home.

### Member VA wallet flash home cash (2026-09-21)

**Sintoma:** membro abre Ledger — VA wallet mostra saldo home (~$310k) por alguns segundos, depois VA (~$139k).
**Causa:** `walletUsd={vaSessionWallet ?? wallet}` — cache VA null no 1º paint → fallback home.
**Fix:** membro (home ≠ VA) passa só `vaSessionWallet` (null ok); hero mostra `…` até members/cashflow; `loadLedger` aquece `onWallet(snap.walletUsd)` (App sticky → só vaSession).




### Roster Live track (OD + breadcrumb) (2026-09-22)

**Sintoma / gap:** Roster mostrava OD em voo mas sem mapa / breadcrumb (estilo Pilops).
**Causa:** Watch/SimBridge é local; world-api não tinha posição dos membros.
**Fix:** store in-memory `career-flight-track` (process-local, max ~8000 pts); `POST/GET /api/va/flight-track` (listed VA + membership); App Watch poll (~15s) posta lat/lon em ops da airline desde **engines on** (accepted/dispatched/in_flight); members enrich `live` (fresh ≤90s); Roster **Live** → `DispatchRouteMap` OD dashed + trail sólida + % progress. Soft-fail; reinício VPS zera tracks (OK para live-only).
**2026-09-22 (e):** sample também leva `phase` / `onGround` / `altFt` / `gsKt` do Watch (`altitudeFt` no `/api/watch/status`); snapshot refresha telemetria mesmo sem crescer a trilha (taxi/hold); Live meta = chip de fase + alt + GS; members `live` inclui os mesmos campos.
**2026-09-22 (f):** upload arma no **engines on** (missão accepted/dispatched/in_flight + Watch); latch até trocar missão / Watch parar; members `live` para qualquer missão ativa com track fresh; Roster **Live** já na missão assigned (mapa OD; telemetria após motores); soft-poll Roster 15s.
**2026-09-22 (g):** Live pane — sem busy-flicker no poll; OD do flight enquanto espera motores; copy “Waiting for engines…”.
**2026-09-22 (h):** ~~botão Live na coluna de actions~~ → **(k)** Live **inline** ao lado da rota At (mesma linha; sem esticar altura).
**2026-09-22 (i):** upload **não** depende só de `enginesRunning` — no ramp o spool override pode false-off; posta com Watch + missão VA. **(j)** também aceita chrome já pinado na airline (`activeCompany === va`) quando `resolveOpsCompanyId` ainda devolve home (vaSessionFleet lag) — era o caso típico no Preflight com “Engines running” e Live sem trilha.
**2026-09-22 (l):** sintoma = Live OD ok + “Waiting for Watch/position” sem trilha. Causa = upload ainda exigia `activeMission.id === status.missionId` + `resolveOpsCompanyId`/`activeCompany === va` — sticky-home + closure stale do poll Watch (vaSessionFleet) → `trackCompanyId` null; POST soft-fail. Fix = postar sempre que Watch running + `memberVa` + lat/lon (servidor valida missão na VA); POST/GET `flight-track` usam `companyId` explícito do body/query (não remap `companyIdFromRequest` → home).
**2026-09-22 (m):** mapa Live `.va-live-map` de `min(42vh, 22rem)` → `min(56vh, 32rem)` (min-height 16→22rem).
**2026-09-22 (n):** sintoma = Live “Waiting for position” com missão `dispatched` / motores no Preflight. Causa = Watch fica **off** até `loadVerification` (pipe do Preflight); upload só lia `/api/watch/status` → zero samples. Fix = `/api/preflight` devolve `live.position`; App posta track no poll de Preflight (mesmo throttle 15s); copy Live menciona flyer Watch/Preflight.
**2026-09-22 (o):** remove Close do pane Live (fecha pelo botão Live da row).
**2026-09-22 (p/q):** Live fase ≠ footer (airborne / “On ground · engines” vs TAXIING). Causa = Preflight inventava phase / OFP compliance. Fix = `reportVaCrewLive` só a partir do status SimBridge (Watch poll + probe com lat/lon + `phaseFromFlags`/taxi); labels = mapa do PHASE chip, sem coerce.
**2026-09-22 (r):** Ready→En route demorou ~2 min; footer `SIMBRIDGE`/`AIRBORNE` sem takeoff/climb. Causa = Preflight 5s + probe 8s seguravam o pipe após Loaded vs Due → Watch auto-start falhava (retry 15s). Sem Watch: fase coarse do probe (`airborne`) e sem auto-depart. Fix = parar **Preflight** depois do 1º LV (yield pipe); Watch retry 2s com LV. ~~(r também parava o probe)~~ → **(u)**.
**2026-09-22 (s):** Live mapa com risco azul continente + AC “travado”. Causa = crumb teleporte (probe/SimConnect ruim) entrava na trilha; LineString ligava lixo↔posição. Fix = `FLIGHT_TRACK_MAX_JUMP_NM` (75) reseta a trilha no salto.
**2026-09-22 (t):** Live POST/poll 15s→**5s** (alinhar Watch tick); trilha e fase menos “travadas”.
**2026-09-22 (u):** ~~probe leve continua no Ready até Watch~~ → **(v)**. Sintoma da (u) = Live Stale com SIMBRIDGE+DISPATCHED; causa real = Watch não subia (não o probe “faltando”).
**2026-09-22 (v):** sintoma = decolado ~2 min, stepper READY, footer **SIMBRIDGE** / **AIRBORNE** / **DISPATCHED**, copy “Take off when Watch is connected”. Causa = (u) devolveu o probe após LV → exclusive gate impede `POST /api/watch/start` → sem Watch = sem auto-depart = sem En route. Fix = probe yield de novo no Ready após 1º LV (Preflight já parava); Live volta pelo Watch assim que o footer virar MSFS. Trade-off: Ready pode Stale ~segundos até Watch bind — melhor que En route travado.
**2026-09-22 (w):** Live mapa — AC “parado” e ponta da tracejada “andando”. Causa = `plannedOd` desenhava OD fixa origem→dest (ferry layer); AC era só marker solto. Fix = tracejada **AC→dest** (remaining leg), atualizada no tick do marker; trilha sólida continua o breadcrumb.
**2026-09-22 (x):** **revert** de tudo que o Live tinha enxertado em Watch/SimBridge/Preflight/probe (uplink `reportVaCrewLive`, lat/lon extra no probe, `altitudeFt` no Watch status, Preflight yield pós-LV, probe yield pós-LV, Watch retry 2s com LV). Watch/pipe voltam ao comportamento pré–Crew Live (`d081d2f9^` / 0.3.224 era). Live UI/API/mapa podem ficar; **sem** telemetria do desktop até redesign explícito.
**2026-09-22 (y):** sintoma pós-(x) = decolado, footer **SIMBRIDGE**/AIRBORNE/DISPATCHED + banner **NOT AT ORIGIN** com “0.3 nm (need ≤12 nm)” (contraditório). Causa = (1) revert tirou yield Preflight/probe → Watch não sobe; (2) Preflight/CHECK airborne gravou `ORIGIN_NOT_ON_GROUND` como `location.ok=false`; UI usava texto de distância. Fix = restaurar yield pós-LV + Watch 2s (**sem** Live uplink); Preflight airborne-near → location OK; copy específica para `ORIGIN_NOT_ON_GROUND`.

### Sketch: soft Live uplink from Watch only (2026-09-22) — **shipped**

**Problema que o redesign resolve:** as iterações (n–w) fizeram Live competir pelo pipe (probe/Preflight/yield/reclaim) e quebraram Ready→En route. (x) detachou telemetria; (y) restaurou higiene de pipe **sem** uplink. Queremos Crew Live de novo **sem** segundo dono do SimBridge.

**Princípio (hard):** Live **nunca** abre pipe, **nunca** faz probe, **nunca** mexe em Preflight/Watch auto-start/yield. Só **reenvia** o sample que o Watch já leu. Se o POST falhar → Live Stale; o voo segue.

**Implementado (2026-09-22):** `createVaLiveUplink` + `WatchSession.softReportVaLiveTrack` após `advanceFlightPhase` no tick; gateway → `POST /api/va/flight-track` via `WorldApiClient` (auth background + `companyId` explícito no `POST /api/watch/start`); throttle 5s; timeout 2s; soft-fail. App passa `resolveOpsCompanyId` no Watch start. Sem probe/Preflight uplink.

**2026-09-22 (z):** Live meta ok mas AC sumia / ficava atrás do trail. Causa = (1) HTML marker sob DEP; (2) refresh de taxi gravava telemetria mas **mantinha lat/lon do crumb antigo** (`FLIGHT_TRACK_MIN_MOVE`) → linha crescia e AC ficava fixo. Fix = GeoJSON AC na ponta do trail; refresh in-place atualiza lat/lon; tip = sempre `trail[last]`.

**2026-09-22 (aa):** sintoma = En route Dispatch AC colado no origin (SBGR) com voo AIR / fuel live ok; Live map também parado. Causa = (z) passou a limpar AC em `setRouteLine`/`setRouteSegments`, e o paint re-roda a cada tick de `props.aircraft` → wipe vs live effect. En route **não** usa trail VPS — só `watch.position` local; deploy VPS sozinho não move esse AC. Fix = paint OFP/segments não zera mais o AC.

**2026-09-22 (ab):** sintoma = Live com **dois** AC (GeoJSON num crumb, HTML noutro); En route AC sumiu. Causa = (z) deixou HTML marker visual + layer canvas; paint (trail/aircraft) e live effect divergiam no tip. Fix = HTML só hit invisível pro popup; AC visível = só GeoJSON; paint não seta AC nem depende de `props.aircraft` — live effect é dono exclusivo.

**2026-09-22 (ac):** sintoma = Live ainda com label **AC** duplicado sob a bolinha. Causa = layer symbol `text-field: AC` + residual do HTML. Fix = só halo+dot GeoJSON; remove HTML marker e layer de label (strip legado se o mapa ainda tiver).

**2026-09-22 (ad):** sintoma = Live AC “fixado” (bolinha atrás do tip / tip não acompanha taxi). Causa = AC preferia `trail[last]`; crumb só refreshava lat/lon sob `MIN_MOVE && POST_MIN`; snapshot não tinha lat/lon próprio (só alt/GS). Origin/dest do mapa = OD do voo (já hub) — **AC não precisa de âncora fixa**. Fix = snapshot `lat`/`lon` a cada sample; in-place tip sempre que `moved < MIN_MOVE`; mapa prefere `aircraft` (sample) sobre crumb; linha cola no fix; members `live` lê snapshot.

**2026-09-22 (ae):** sintoma = bolinha no chão, sem linha azul, tracejado “andando” noutro tip. Causa = paint do mapa (sem `aircraft` nas deps) redesenhava ferry/trail enquanto o live effect movia o AC → **dois tips**; preferir `track.lat` sobre crumb podia deixar AC velho. Fix = `syncLiveTrackLayers` (um tip → AC + sólida + tracejado); paint com `plannedOd` **não** toca essas layers; tip = crumb last (in-place) com fallback aircraft.

**2026-09-23 (ah):** sintoma = pan no mapa Live “trava”. Causa = poll 5s recriava `trail` → paint effect (deps `trail`) apagava/recriava markers + `map.resize()` no meio do drag; sync live `setData` + great-circle competia com a interação. Fix = paint **sem** `trail` nas deps / sem resize no paint; ResizeObserver rAF + skip se `isMoving`; live sync defer se moving (flush `moveend`/`zoomend`) + fingerprint skip; VaPage `useMemo` trail/aircraft.

**2026-09-23 (ai):** sintoma = Live breadcrumb demora a “fixar” curva após decolar (reta origin→AC). Causa = `FLIGHT_TRACK_MIN_MOVE_NM` 0.35 + uplink 5s → poucos vértices no taxi/climb. Fix = limiar adaptativo: **0.12 nm** enquanto `points.length < 15`, depois 0.35 (não encurta cruzeiro / MAX_POINTS). Uplink 5s intacto.

**2026-09-24 (aj):** sintoma = Live “linha azul diminuindo” perto do dest (ex. loop SBCA) — trilha sólida some pela ponta de trás; tracejada laranja AC→ARR ok. Causa = `FLIGHT_TRACK_MAX_POINTS` **180** + `shift()` no overflow; spacing 0.35 nm ≈ **~63 nm** de breadcrumb. Em hold/circuito o budget enche com vértices densos → prune come o trecho de aproximação. **Não** é bug do mapa En route OFP (esse não usa `trail`/`plannedOd`). Fix = subir cap para **8000** (~11h @ 5s / ~2800 nm @ 0.35 nm); track some no clear quando missão deixa active / restart VPS.

**2026-09-22 (af):** sintoma = reopen app em cruzeiro → footer **MSFS↔SIMBRIDGE** flick, plot do avião aparece/some, burn `19m/137m · need 70%` some com o flick. Causa = (1) Watch auto-start effect remonta (deps `watch.running` / LV hydrate) no meio do `postWatchStart` → `cancelled` + `postWatchStop` matava a sessão que acabou de subir (stop/start storm no exclusive gate); (2) probe bootava **antes** de `activeMission` hidratar `in_flight` e competia pelo pipe; (3) UI zerava AC/`flightTime` no primeiro frame com `running=false`. Fix = em airborne resume **não** `postWatchStop` no cancel (só yield Preflight); probe também gateia em `missions.some(in_flight)`; sticky AC + burn/RECONNECTING no footer enquanto `in_flight`.

**2026-09-22 (ag):** log `watch-debug` no mesmo voo: **85** `[watch] start` / **0** `start skipped` / `stop — closing pipe under in-flight tick`. Causa = POST `/api/watch/start` concorrente (~pares 200ms); `running=true` só pós-open → 2º call via `stop()` em vez de idempotent. Fix = coalesce `startPromise` (join same mission); `startEpoch` aborta open tardio após `stop()`; UI `watchStartGateRef` compartilha um POST entre remounts do effect.

**Cobertura esperada (aceitar gaps):**

| Momento | Watch pipe | Live uplink |
|--|--|--|
| Inject / reinject | `stop()` — inject owns pipe | **sem sample** (Stale OK) |
| Preflight até 1º Loaded vs Due | Watch hold off | **sem sample** |
| Pós-LV, footer MSFS (solo + ar) | tick ~5s, `sampleLiveFlight` | soft POST |
| Pipe drop / inject active mid-tick | tick skip / reopen | sem POST até sample ok |

**API já existe (não redesenhar):** `POST/GET /api/va/flight-track` + store in-memory `career-flight-track` na VPS; gateway já proxya `/api/va/*` via `isGatewayProxiedPath`. UI Roster Live (GET-only) fica.

**Uplink preferido — server, após sample no tick**

1. Em `WatchSession.tick` (`watch-helpers.ts`), **depois** de `sampleLiveFlight` ok (lat/lon finitos), fire-and-forget soft POST — **fora** do `withSimBridgeExclusive`, **sem** `await` no caminho crítico (ou `void` + timeout curto ≤1–2s).
2. Body: `companyId` (ops VA da missão), `missionId`, `lat`, `lon`, `altFt`, `gsKt`, `phase`, `onGround` — mesmos campos que o endpoint já aceita.
3. Destino do POST: em `gateway` → `CAREER_WORLD_API_URL` (não gravar track na memória do desktop); em `full` lab → handler local ok.
4. Auth: token/session que o gateway já usa para proxy world (espelhar settle enrich / outros POSTs server→world). Sem sessão / sem VA listed / missão não-VA → no-op silencioso.
5. Soft-fail total: catch + log debug; **nunca** `throw` no tick; **nunca** `stop()` / reopen por falha de Live.
6. Throttle opcional: no máximo 1 POST / ~5s (alinhar tick); não enfileirar backlog se a rede atrasar.

**Não fazer (lições (n)–(w)):**

- Uplink a partir de Preflight ou probe SimBridge
- Segundo client NDJSON / yield pipe “pro Live”
- Mudar auto-start Watch, hold pós-LV, ou retry 2s “por causa do Live”
- Exigir `enginesRunning` pra armar upload (ramp false-off) — bastam Watch running + lat/lon + missão ativa VA
- Remap `companyId` via home sticky — sempre `companyId` explícito da missão/ops VA (lição **l**)

**Alternativa B (mais fina na UI, se A atrasar):** App soft-POST no poll de `/api/watch/status` quando `running` + `position` + `memberVa` — status **já** expõe `position` / `phase` / `onGround` / `groundSpeedKt`. Mesmas regras soft-fail. Desvantagem: depende do poll do App aberto; A sobe track mesmo com UI noutro tab se o processo Watch estiver vivo.

**Definição de pronto (quando implementar):**

1. Solo: após Loaded vs Due + Watch MSFS → Roster Live mostra posição (sem AC durante inject).
2. Ar: En route / auto-depart intactos; Live trail atualiza ~5s.
3. Rede VPS down → Live Stale; Watch/footer/inject OK.
4. **Zero** mudanças em probe/Preflight ownership além do que (y) já shipou.
5. Smoke: Ready→takeoff sem delay SIMBRIDGE; membro remoto vê track fresh ≤90s.

**Fora de escopo deste sketch:** persistir tracks além do process VPS; Live em solo pré-Watch; browser sem desktop Watch.

### Roster presence (online / flight / last seen) (2026-09-20)

**Sintoma:** Roster só mostrava nome + role — sem sinal de quem está online ou voando.
**Causa:** /api/va/members devolvia membership puro; UI não tinha coluna de status.
**Fix:** enrich members com uthListSessions → online/lastSeenAtMs (AUTH_ONLINE_WINDOW_MS) + melhor missão VA ativa do piloto (ccepted/dispatched/in_flight); row com Online/Offline + last seen + flight line; soft-poll 30s na aba Roster.

### Roster member hub (pilotIcao) (2026-09-20)

**Sintoma / gap:** Roster não mostrava onde cada membro está (hub).
**Causa:** pilotIcao vive na company **home** (chrome sticky); members API só lia missões da VA.
**Fix:** GET /api/va/members resolve aHomeCompanyId por membro (owner = VA), batch loadMissions por home única, devolve pilotIcao; UI At ICAO. Soft-fail se load falhar.

### Audit: VA-tail flight loop (2026-09-20)

**Verdict:** **ready with caveats** — Freights/Charter/Demand/Bridge/Haul + cut + reserve + tenant pin are wired; a few dual-tenant UI/API edges remain.

| Step | Expected | Status |
|--|--|--|
| Prepare picker | Yours+VA; hide reserved-by-other | PASS (`ops-fleet` + filter) |
| Accept / staging commit | `companyId` = VA; stamp `pilotHomeCompanyId`; auto-reserve; pin VA while Dispatch active | PASS |
| Charter accept | same | PASS |
| Ports Demand/Bridge/Haul | `resolveOpsCompanyId` on accept/dispatch | PASS |
| Ferry POST | `companyId` ops | PASS |
| Ferry plan GET | `companyId` for VA tail while chrome home | PASS in tree (needs ship) — was `Unknown aircraft` |
| Empty flight | VA tail + companyId | PASS (`companyId` + pin + vaSession paint) |
| Base Dispatcher | home-only | PASS (by design) |
| Settle pay | VA +payout −fuel −cut%; cut → home `va_member_cut` | PASS (`applySettleWalletDeltas` + second write) |
| Settle XP | cargo/class ops → home when dual-tenant | PASS |
| Settle UI | restore home after; don’t clobber home fleet | PASS (`vaSessionFleet` + home restore; Watch too) |
| Reserve | 1/member swap; 4h TTL; in-flight release blocked | PASS |
| Config cut | 10–50%, default 30%; directory visible | PASS |
| Owner on own VA | no cut (`pilotHome === ops`) | PASS |

**Severity gaps**
1. ~~**Empty flight**~~ **fixed** — `companyId` + pin VA + paint `vaSession*` (same pattern as ferry/Accept).
2. ~~**Settle `setFleet`**~~ **fixed** — VA settle paints `vaSessionFleet`; home chrome untouched; Watch auto-settle restores home before refresh.
3. ~~**postSettle** body `companyId`~~ **fixed** — ops company from mission aircraft / active pin.

**Not live-smoked here:** end-to-end member Freights settle wallet math on prod; two members racing same tail.

### Prepare VA fleet vanish after My VA (2026-09-20)

**Sintoma:** membro no Manifest só via "Yours"; Hangar My VA tinha cascos (sem reserve).
**Causa:** `switchCompanyForVa(home)` limpava `vaSessionFleet` ao sair do My VA; prefetch de `/api/va/members` não re-rodava — `opsFleet` ficava só home.
**Fix:** ao voltar home, manter `vaSessionFleet`/`vaSessionWallet` (chrome Hangar continua em `fleet`); prefetch também reage a `authSessionEpoch` / `homeCompanyId`.

### Prepare ferry journey Unknown aircraft (2026-09-20)

**Sintoma:** Manifest CTA Ferry to origin com tail VA → dialog `Unknown aircraft acf_…` (ex. Duke SBGL→SBSP).
**Causa:** `POST /api/fleet/ferry` já mandava `companyId` do opsFleet; `GET /api/fleet/ferry-plan` (FerryJourneyDialog) só usava header chrome = home → frota errada.
**Fix:** `fetchFerryPlan` + dialog aceitam `companyId`; handler lê query; Manifest/Charter/Hangar passam `resolveOpsCompanyId`.

### Ferry plan card hides who pays (2026-09-20)

**Sintoma:** VA com Line crew/allowance; card do ferry só mostrava o $ do hop — não dava para saber se saía do bolso do piloto ou da VA.
**Causa:** `GET /api/fleet/ferry-plan` devolvia `nextQuote` sem espelhar a lógica Line crew / overflow / company do `POST /ferry`.
**Fix:** `ferryBilling` no plan (`allowance` → $0 you + remaining; `overflow` → home wallet; `company` → VA wallet); Hangar meta + FerryJourneyDialog; toast `Line crew · $0` vs your wallet.

### Ferry plan + pilot travel quote queue behind pulse (2026-09-20)

**Sintoma:** planejar ferry / quote Travel do piloto lentos (às vezes dezenas de s).
**Causa:** `GET ferry-plan`, ferry `quoteOnly`, peek pré-write e pilot `quoteOnly` usavam `withCareerRead` → world lock atrás do pulse (~20s+).
**Fix:** `withCareerPeekRead` (peek economy + `loadMissions`, sem world lock / crew settle) nesses caminhos; write real continua em `withCareerWrite`.

### Pilot travel Dispatch origin chip (2026-09-24)

**Sintoma:** modal Travel só digitava ICAO; chips de frota só apareciam se aircraft parked longe do piloto.
**Causa:** `PilotTravelDialog` recebia só `fleetShortcuts` — sem origem do voo em planejamento.
**Fix:** `contextShortcuts` com origem do Staging / missão ativa (labels Dispatch origin / Mission origin); clique preenche dest + quote; frota continua abaixo sem duplicar ICAO.

### Line crew allowance ferry left Duke stuck / missing from Manifest (2026-09-20)

**Sintoma:** toast de sucesso (−$0), Duke não mudou de ICAO no Hangar VA; sumiu do picker Manifest.
**Causa:** allowance aplicava `npcArriveAtTick` → status `ferry` sem mover location; Manifest/Prepare só listam `parked`. ETA NPC + UI “Instant” incongruentes. Hangar VA vinha de `/api/va/members` (peek missions) sem finalizar hops.
**Fix:** allowance = hop instantâneo $0; `finalizeStuckNpcFerries` no `withCareerRead`/settle **e** no load de `/api/va/members` (+save); picker mostra `ferry` desabilitado se ainda houver. Ferry pago sempre foi instantâneo — o ETA era só o path Line crew (revertido).

### Line crew tiers Desk/Ops/Network (2026-09-20)

**Sintoma / gap:** Line crew era hire flat (Desk only); VAs grandes esgotavam allowance cedo sem path de escala.
**Causa:** um único salary/allowance; sem upgrade.
**Fix:** `vaLineCrew.tier` 1|2|3 no JSON (sem migrate); hire→Desk; `upgradeVaLineCrew` Ops/Network; fire→none com severance = salary do tier; allowance/salary por tabela; API `action=upgrade`; Config Upgrade/Fire; ledger `va_line_crew_upgrade`. Legacy hired sem tier = Desk.

### Sidebar selection lag leaving Crew (2026-09-22)

**Sintoma:** click Airlines (ou outra tab) com Crew/VA pinado — highlight demora / “trava” antes de mudar.
**Causa:** `selectTab` fazia `await switchCompanyForVa(home)` (session open de rede) **antes** de `goToTab`. O load do directory (`BusyBlock`) é depois e não explica o atraso do botão.
**Fix:** `goToTab(next)` síncrono no click; restore home + soft refresh em background (mesmo espírito do Crew que não bloqueia no App refresh).
**Audit outros botões:** Freights…Settings / Ranking / Logbook / Lab / Pulse / strips → todos `selectTab` (coberto). **Base** já pintava via `openAirport` optimistic; agora também restaura home em background ao sair do Crew. **Back** → Terminal: era `await fetchAirportView` antes de setar ICAO — alinhado a `openAirport` optimistic.

### Pilot Move chip reverts while on Crew (2026-09-22)

**Sintoma:** membro em Crew/Roster (ex. noname, home SBCT, At SBGL) Move chip → SBKP (HQ da VA); toast OK; depois chip + “At” + sidebar voltam a **SBGL**. Ledger da **company** mostrava `Pilot travel` (bug — VA debitada).
**Causa:** `pilotIcao` canônico fica na company **home** (chrome sticky; `GET /api/va/members` At = home). Abrir Crew faz `switchCompanyForVa` → header/`companyId` = VA. `POST /api/pilot/travel` usava esse tenant → gravava (e debitava) na **VA**. UI pintava SBKP; home ficava SBGL → soft-poll / paint home revertiam. `mirrorHomePilotIcaoOntoOps` apagava o SBKP fantasma na VA.
**Fix:** `resolvePilotTravelCompanyId` força `vaHomeCompanyId(actor)` no quote/write; client manda `companyId: home` + `commitWallet(..., { sourceCompanyId: home })` mesmo com VA pinada; Money map: Pilot travel → home wallet. Owner (home === VA) inalterado. Debits errados já no Ledger VA não são auto-estornados.

### VA Accept ignores home pilot after Travel (2026-09-20)

**Sintoma:** membro viaja para a origem (chip Pilot = SBJF); Accept de frete VA ainda diz Pilot is at SBKP, not SBJF.
**Causa:** Travel grava pilotIcao na **home**; Accept/assign roda no tenant **VA** com pilotIcao velho; chrome sticky mostra home.
**Fix:** mirrorHomePilotIcaoOntoOps em withCareerWrite / withCareerPeekRead — se home != ops, copia home.pilotIcao para missions da VA antes dos asserts de co-location.

### VA settle moves aircraft but not pilot (dual-tenant) (2026-09-20)

**Sintoma:** voo com tail VA; após settle o casco está no dest, mas “Pilot at …” fica no hub de origem.
**Causa:** `relocateAircraftOnSettle` faz `syncPilotIcaoTo` só no tenant **ops** (VA). Chrome sticky home lê `pilotIcao` da **home**; pós-settle a UI restaura home e sobrescreve com o ICAO antigo. XP já dual-write; pilot location não.
**Fix:** `/api/settle` após ops write, se `pilotHomeCompanyId ≠ ops` e não `crewOperated`, `syncPilotIcaoTo(home, dest)` no mesmo write-back da progression; response `pilotIcao` = dest.

### Prepare Accept Unknown aircraft + Yours label on VA Duke (2026-09-20)

**Sintoma:** Manifest mostra `Yours · Duke`; Aerostar some; Accept → `Unknown aircraft acf_…`.
**Causa:** resposta de ferry/commit VA pintava `setFleet` (chrome home) quando o merge home-first marcava o id como Yours → Accept usava company home.
**Fix:** `buildOpsFleet` prioriza ids da VA session; `resolveOpsCompanyId` consulta `vaSessionFleet`; `paintOpsMutationFleet` nunca grava frota VA em `fleet`; refresh home filtra ghosts VA.

### VA Duke Manifest max ~0.9 klb then jumps after Accept (2026-09-20)

**Sintoma:** Manifest cap 0.9 klb no Duke VA; pós-Accept barra vai 1.5 → 2.6 klb; Accept lento.
**Causa:** `refreshCargoLimit` / Dispatch só olhavam `fleet` home → sem `airframeTypeId` do Duke; `/api/cargo-limit` usava chrome home + vários `withCareerRead` (fila do pulse). Genérico `light_ga` ≈ fallback 450 kg / ~0.9 klb. Dispatch barra usava **structural** enquanto Manifest usa **ops** → 1.7 vs 2.6. Accept aguardava `switchCompanyForVa` antes do commit + peeks com world lock.
**Fix:** airframe + `companyId` via opsFleet; cargo-limit peek; Dispatch/Manifest barra = ops (+ nota structural); commit antes do pin VA; peeks do staging em `withCareerPeekRead`.

### Dispatch / Buy fuel ~15s (2026-09-20)

**Sintoma:** painel “FUEL PURCHASE REQUIRED” e botão **Buy fuel & continue** (~15s); mesma classe de lentidão em outros CTAs do Active Dispatch.

**Causa:** `/api/fuel/quote` e o prep de `/api/dispatch` usavam `withCareerRead` (world lock atrás do pulse). Client de fuel/Dispatch omitia `companyId` do tail VA e pintava `setFleet` no chrome home. Purchase/Depart/Cancel/etc. são writes — ainda entram na fila do world lock (inevitável se o pulse segura o cadeado); o ganho é tirar peeks da fila e acertar tenant.

**Fix:**
- Quote fuel + prep Dispatch → `withCareerPeekRead`
- Client: `companyId: resolveOpsCompanyId(aircraftId)` em quote/purchase, Dispatch, Confirm OFP, Accept OFP cargo, Cancel, Preflight, Load OFP, Depart
- Purchase/Depart: `paintOpsMutationFleet` (não `setFleet` cru)

**Audit Active Dispatch (botões / auto):**

| Ação | Tipo | Otimizável? | Estado |
|--|--|--|--|
| Auto / Retry fuel quote | peek | sim (era world lock) | **feito** |
| Buy fuel | write (stock Jet-A + wallet) | só companyId/paint; write ainda espera pulse | **feito** |
| Open SimBrief / Dispatch | prep era read locked + write | prep → peek; companyId | **feito** |
| Confirm / Load navlog (auto OFP) | SimBrief + company write | companyId (latência = rede SimBrief) | **feito** |
| Accept OFP cargo | SimBrief + world write | companyId | **feito** |
| Cancel / Abort | write | companyId | **feito** |
| Preflight / Load fuel+payload | SimBridge + mission write | companyId (latência = pipe) | **feito** |
| Depart | write | companyId + paint fleet | **feito** |
| Settle | write | já tinha companyId + paint | ok |
| Accept Manifest | write | medir fila vs trabalho antes de split de lock | **diag** `staging/commit` `lockWait` / `inLock` / `outside` — ver `14-mp-world-clock.md` |
| Crew dispatch / assign | write home Base | home-only by design | n/a |

### VA Ledger Member column (2026-09-20)

**Sintoma / gap:** Recent activity no My VA Ledger não mostra quem gerou Jet-A / travel / hire — vários membros compartilham o mesmo wallet.
**Causa:** `CareerLedgerEntry` não tinha actor; `applyWalletDelta` só gravava kind/note/missionId.
**Fix:**
- Schema SQLite **v18** / PG **v30**: `ledger.actor_account_id`
- Stamp em três camadas: `opts.actorAccountId` > ambient session (`enterLedgerActorAccountId` pós-auth) > `mission.pilotAccountId`
- Kinds de pulse (`LEDGER_SYSTEM_KINDS`: salary, parking, interest, storage, …) nunca stampam membro → UI **System**
- Watch tick limpa ambient (usa piloto da missão); pulse `catchUp` limpa ambient
- UI: coluna **Member** só no My VA Ledger (roster map)

**Audit applyWalletDelta:** todos os call sites passam pelo resolve acima — player HTTP herda session; System kinds ficam vazios de propósito; histórico pré-coluna = `—`.

### Watch world auto-settle debrief PAYOUT $0 (2026-09-20)

**Sintoma:** voo VA (SBSP→SBKP) com contract ~$1390; debrief mostrava Payout **$0**, Weather +$70, Fuel −$488, Net −$488.
**Causa:** path `worldMutations.settleFlight` (desktop→world) só retorna `boolean`; após settle o Watch montava `this.settlement` com **`payoutUsd: 0` hardcoded**, enquanto lia weather/score da missão settled. Wallet no server credita certo — bug de UI/status. Path local `withCareerWrite` já usava `result.settlement.payoutUsd`.
**Fix:** após world settle, preencher settlement de `snap.mission.payoutUsd` / `penaltyUsd` / `lateTicks` / `cargoKg` (mesmo espelho de `settlementFromSettledMission`).

**Pilot cut vs prejuízo:** `quoteMemberRouteCutUsd` usa `max(0, payout − fuel)` — **prejuízo não é repartido**. Fuel + payout ficam 100% no wallet da VA; membro só leva % do lucro positivo (owner na própria VA = sem cut).

### Prepare picker + Accept auto-reserve (2026-09-20)

**Sintoma / gap:** dois membros podiam escolher o mesmo casco VA no Manifest; reserve Hangar era opt-in.
**Causa:** picker `opsFleet` listava todo `parked` (incl. reserved alheio); Accept só fazia `assign` sem gravar hold.
**Fix:** Manifest/Ports/Charter filtram tails reserved por outro (owner ainda vê); `assignAircraftToMission` com `actorAccountId` chama `ensureAircraftReservedForActor` (refresh TTL / owner pode tomar hold). Sem auto-reserve enquanto só navega o Manifest.

### Hangar Range / Cruise / Burn em branco (2026-09-21)

**Sintoma:** card do Hangar (VA ou home) mostra Range, Cruise e Burn como `—`. O card do mesmo SKU em Airframes traz os números (ex. Duke 1,100 nm / 230 kt / 265 lb/h).

**Causa:** o Hangar já tem os três campos (`HangarAircraftCard`). Eles só preenchem se `hangarCatalogEntry` achar uma entrada. Essa entrada **não vem no avião**. É montada no client a partir do payload de `GET /api/aircraft-market`: catálogo de classe (tem range, não tem cruise/burn) + `airframePerf` (range/cruise/burn por `airframeTypeId`). O mapa de perf só inclui type ids das listings daquela resposta e da frota da company do request. O card de Airframes funciona porque a listing está dentro dessa resposta. Os três traços = nem a classe nem o type id desse casco estavam nesse cache.

**Fix:**
1. **Display.** `buildAirframePerfMapForUi` (catálogo + `airframePerfOverrides`) anexado em `/api/state` (`fleetPayload`), `/api/va/members` e `/api/aircraft-market`. Client faz merge no cache `airframePerf`; Hangar deixa de depender de ter aberto Airframes. Range `≤0` → `—`.
2. **Sample MP.** Watch passa `cruiseCommit` no `settleFlight` (gateway enrich + world-api client). `/api/settle` valida com `parseCruiseSampleCommit` e grava EMA via `applyCruiseSampleOverride` na company da missão. SP usa o mesmo helper. Range não sai do sample.

### VA hangar aircraft reservation (2026-09-20)

**Sintoma / gap:** membros competiam first-come no mesmo casco; Hangar nao sinalizava hold.
**Causa:** fleet so tinha assign de missao; sem soft-hold por conta.
**Fix:** SQLite **v16** / PG **v27** `reserved_by_account_id` + `reserved_at_ms`; hard lock 4h TTL; 1 reserva/membro; reserve/release API; gate em assign/ferry; badge + Reserve/Release no Hangar VA.

### Member Available hid personal WH at VA hubs (2026-09-21)

**Sintoma:** Available só oferecia hubs sem WH da VA (ex. SBKP); SBGR sumia se a VA já tinha WH — membro não comprava WH pessoal no mesmo hub.
**Causa:** filtro Available = `!ownedHubSet` do tenant pinado (VA). WH pessoal é company home independente.
**Fix (e → f):** misturar Buy personal no shelf da VA não escala. **Ports split:** sidebar Ports = home only; My VA → Ports = company desk. Dual-buy Available revertido.

### My VA Ports pane (2026-09-21)

**Sintoma / gap:** pin VA na sidebar Ports + Available híbrido = inventário mental (FBO/WH pessoal vs company na mesma página).
**Fix:** aba **Ports** em My VA (Roster/Hangar/Hauls/**Ports**/…); `PortsPanel` embedded + `logisticsCompanyId` VA; CTAs Hauls/Path → `setPane('ports')`. Sidebar Ports sem pin; sempre home.

### VA publish missing home_country_id (2026-09-20)

**Sintoma:** companies.home_country_id vazio na Lamusine (SBKP) enquanto hub estava setado; local stub tambem vazio.
**Causa:** publishCompanyAsVa / PG aPublish gravavam hub/name/listed sem derivar pais; select-hub sim escrevia country.
**Fix:** publish seta home_country_id via countryIdForHubIcao(hub); backfill idempotente no open (SQLite + PG) para hubs ja gravados.

## Checklist quando for implementar

- [x] InternalHaul pay (IH-1)
- [x] Fase 1 auto-buy
- [x] Fase 2 scout
- [x] IH-2 members + board interno + ranking 7d
- [x] **Ranking airline desk** — Demand/Wide/IH → haul_stats (listed); pilots board always on; listed-only companies (2026-09-23)
- [x] **Ranking global** — Freights/Charter/`vaFlight` + desk; Airlines + Pilots global 7d (2026-09-23)
- [x] Fase 3 / IH-3: VA auto-haul desk (Scout bridges, caps, ≥2 members) (2026-09-21)
- [ ] UI surplus/tight por commodity no Ports / região
- [ ] IH-3 extras: OD allowlist / pay fine-tune UI / Demand auto
- [x] Testes IH-1 + VA invite/cap/cross-pay/ranking
- [x] Copy join / My VA: dual-tenant (frota home vs VA)
- [x] **memberRouteCutPct** — schema v14 + Config + directory + settle Freights/Demand/Charter (net após fuel)
- [x] Hangar VA: member read-only UI (sell/lease/MX/overhaul; ferry ok) + **API gate MX + overhaul + sell/list/unlist owner-only**
- [x] **My VA Ledger** — wallet + cashflow para membros; credit draw/repay owner-only
- [x] **VA Flight quality + Ops rep surface** — settle score rolling; directory/ranking/ledger
- [x] **VA org perks** — quality → Proven/Reliable/Elite (−MX / −overflow ferry); UI My VA + directory/ranking
- [x] **Prepare Yours+VA** — Freights/Charter/Ports pickers; ferry CTA only; Base Dispatcher home-only
- [x] **Chrome sticky home** — wallet/fleet do shell = home; My VA usa caches VA
- [x] **Ledger cashflow light + wallet audit** — GET /api/cashflow sem world lock; setWallet→commitWallet sticky
- [x] **Ledger Member column** — actor_account_id (SQLite v18 / PG v30); ambient session + system kinds; My VA UI
- [x] **Watch world settle debrief payout** — ler payout/penalty da missão settled (não hardcode 0)
- [x] **Chrome wallet ref lag** — sync activeCompanyIdRef + getStoredCompanyId no sticky; fleet/wallet após pin
- [x] **Roster presence** — online / last seen / flight na row
- [x] **Roster Live track** — Watch → VPS in-memory; OD + trail no Crew Roster (+ phase/alt/GS)
- [x] **Roster member hub** — pilotIcao da home company (`At ICAO`)
- [x] **VA aircraft reserve** — hard lock 4h TTL; 1/membro; Hangar badge
- [x] **Prepare filter reserved + Accept auto-reserve** — picker esconde hold alheio; assign grava reserve
- [x] **Prepare VA fleet after My VA** — não limpar vaSessionFleet ao voltar home
- [x] **VA home_country_id on publish** — derive from hub + backfill
- [x] **Ferry ops** — Line crew semanal + allowance NPC + overflow na home do piloto
- [x] **Line crew allowance retune** — piso 4, 2×parked, cap 16 (2026-09-20)
- [x] **Line crew tiers** Desk/Ops/Network — hire Desk; upgrade Ops/Network; fire→none (severance = tier salary)
- [x] **VA settle dual-tenant pilotIcao** — sync home company to dest (chrome sticky)
- [x] **VA Accept dual-tenant pilotIcao** — mirror home onto ops before co-location assert
- [x] **Logbook merge home+VA** — dual fetch + merge by id (chrome sticky home)
- [x] **Logbook merge warm-enter** — stamp homeCompanyId; merge extras without requiring home; missions?companyId=
- [x] **Logbook VA per-pilot filter** — shared VA file filtered by pilotAccountId / pilotHomeCompanyId
- [x] **My VA Logbook** — company history + member chip; personal Logbook stays filtered
- [x] **Charter board infinite load** — deps on resolved companyId string, not resolver fn
- [x] **My VA Config layout polish** — Hiring / Line crew / Invites / Danger
- [x] **Member progression** — gates + settle XP na home do piloto (não ladder da VA)
- [x] **One VA per account** — block join/request while already in a listed VA
- [x] **VA loop clarity UI** — Money map + Config Next steps + Hangar hint + Freights VA chip (2026-09-21)
- [x] **Company ≈ VA vocabulary** — publish card as directory status; Identity Published; no tenant merge (2026-09-21)
- [x] **Buff concessão herdado** — hasPortOperatorBenefits buy/ETA; status yours exact only (2026-09-21 g)
- [x] **My VA Hauls board** — Internal Haul open/active + Accept + Port strip + Ports CTA (2026-09-21)
- [x] **Hauls Prepare + ferry Manifest** — off-origin Prepare → deskHold draft; Accept at-origin dispatch-hold (2026-09-22)
- [x] **Hauls desk Accept member cut stamp** — demand/haul dispatch-hold `vaPilotMissionStamp` (2026-09-23)
- [x] **Hauls/Demand Class Ops gate** — dispatch-hold + accept assert home ladder (2026-09-23)
- [x] **Desk hold partial load** — Manifest loadKg ≤ ops cap; *DispatchHold kg + remainder hold (2026-09-22)
- [x] **VA parallel cargo per pilot** — friends Accept together; gate by pilotAccountId (2026-09-22)
- [x] **Hauls hold author + map route** — heldByName on Open desk; click plots OD on Company Network map (2026-09-22)
- [x] **Path to Port FBO** — VaPortPathCard Hauls/Config + empty/join pitch (2026-09-21)
- [x] **Hauls quiet após FBO** — Path some pós-claim; copy curta (2026-09-21)
- [x] **IH-3 Auto-haul desk** — tick Scout bridges; Config opt-in; ≥2 members (2026-09-21)
- [x] **Ports dual-tenant WH UX** — ~~Available personal under VA pin~~ → **My VA Ports pane** + sidebar home-only (2026-09-21)