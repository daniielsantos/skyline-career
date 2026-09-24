# Port FBO — chão, não ar

Atualizado 2026-09-20. **Phase 0–10 shipped** (lease-out/crew off; Port FBO desk+stevedore; Base perks; Scout bridge+Demand+Haul; Port shuttle). **IH-1 Internal Haul pay shipped**. **1ª Base free** + **Base Dispatcher seat** (hire) + unified **Search** (1 freight ou tour 2–4 legs) + **Active Tour** (Accept L2+, no multi-reserve).
**Doc 2026-09-20:** Base `playerFbos` sticky-home (VA tenant não pinta sidebar Base) + preserve `canBuyAtIcao` no poll `/api/state`.
Relacionado: [`08-economy.md`](./08-economy.md), [`16-va-logistics.md`](./16-va-logistics.md), [`23-port-xl-warehouse.md`](./23-port-xl-warehouse.md), [`10-aircraft-pool.md`](./10-aircraft-pool.md) (lease-out).

- **Base Dispatcher flexível por lot (2026-09-07):** `Any parked` = aeronaves realmente `parked`, mas **tamanho/tipo do lot não fixa classe**: aceita lift parcial (ex.: C680 em lot 20.000 kg) e deixa payload operacional/range/fuel/net/ferry decidirem. Removida exclusão automática de `last-mile` para não-GA, inclusive no rebind. Dev Mode agora abre Cargo/Class Ops também no `dispatch-tours` list (antes Market mostrava aberto e Dispatcher usava progresso real). Toast vazio explicita gates. Teste `lets a light jet take a profitable partial last-mile lot`; smoke save Daniel/SBMO passou com 5 sugestões.

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

**Persist claim (2026-09-12):** sintoma → Claim Santos OK na sessão, refresh → Vacant + Need $192.5k. Causa → `normalizeMissionsState` omitia `playerPortConcessions` no `saveMissions` (wallet debitava, JSON `[]`). Fix → preserve + heal ledger/index.

**UI Port FBO tab (2026-09-12):** Ports sections = Catalog | **Port FBO** | Warehouse | Demand. Scout + desk auto-buy + port stock on Port FBO; Catalog = map + listings BUY + discharge ETA.

**Port FBO quiet by state (2026-09-21):** Yours → Scout first (one ranked table + All/Haul/Demand/Bridge filter); Desk auto-buy in `<details>`; Port stock collapsed. Vacant/Held → one-line hint (Claim CTA stays in title). Less desk prose.

**Scout Hold amount picker (2026-09-22):** sintoma = Scout Hold reservava o kg inteiro da sugestão (esgotava WH → Demand sumia). Causa = confirm mandava `s.kg` sem UI. Fix = diálogo Hold com slider + presets 25/50/75/Max (floor 200 kg); API `kg` já existia.

**Scout empty + Haul fill (2026-09-21):** sintoma = Scout “No ideas” com stock no WH. Causas = (1) API list/confirm **não** passava `companyId` → gate Port FBO usava `local` e zerava desks auth; (2) Bridge precisa ≥2 WH; (3) Haul tinha hard-gate fill ≤40%. Fix principal = `companyId`. Desktop 0.3.197 chegou a usar só room ≥200 kg (erro de realismo: WH grande quase cheio ainda “cabe” 50 klb). **Revertido** para short-fill: dest fill ≤**40%** hard + `kg = min(free, room, need→55% fill)`.

**Scout Fill column (2026-09-21):** tabela unificada All/Haul/Demand/Bridge carregava `destFillPct` no merge mas não renderizava — coluna **Fill** de volta (Haul só; Demand/Bridge = —).

**Desk auto-buy / stevedore / shuttle companyId (2026-09-21):** sintoma = “Port FBO desk requires an active Port FBO” com Port FBO P1 yours na UI. Causa = `upsertPortAutoBuyOrder` (e stevedore/shuttle) default `local` enquanto concession é `co_*`. Fix = passar `companyId` do request. Ground staff **não** é gate de Scout/desk — só perk de preço/yard.

**Desk order save → “Held by another company” (2026-09-21):** sintoma = toast “desk order saved” + Port FBO some (Scout some); Hauls ainda vazio. Causa = (1) confusão UX: desk auto-buy ≠ Scout Hold (Hauls só lista holds); (2) `POST /api/ports/auto-buy` (e outros mutators Ports) devolvia `portSnapshot` **sem** `viewerCompanyId` → default `local` → status `held`. Fix = passar `viewerCompanyId` no snapshot de resposta. Refresh GET `/api/ports` já estava certo.

**Company network chrome Phase 1 (2026-09-21):** My VA Hauls + Ports FBO — inventário interativo FBO+WH (`VaCompanyNetwork` / `buildCompanyNetworkNodes`). Chips + mapa no Hauls; filtro de holds/Scout por nó (`All` = rede inteira). Ports mostra chips quando ≥2 assets (mapa Ports já existe). Sem retune economia.

**Hauls Company Network slow + short map (2026-09-21):** sintoma = ~10s no Hauls + mapa ~11.5rem. Causa = `VaHaulsBoard` chamava `fetchPorts()` (`withCareerWrite` / portSnapshot) só para montar chips. Fix = `buildCompanyNetworkNodesFromState` no `GET /api/va/hauls` (missions + peek world); cliente só usa `companyNetwork`; CSS mapa `20rem` / min `18rem`.

**Company Network map stack + mass + glyphs (2026-09-21):** sintoma = porto e WH no mesmo pin; mass em t/kg com UI imperial; chips só texto. Causa = `ownedFbos` incluía nós FBO (já em `ports`); subtitle/`formatMassKg` metric hardcoded. Fix = mapa só WH remotos; FBO pin em lat/lon do porto; `weightSystem` + `formatMass` no detail/holds; ícones SVG FBO/WH (não foto).

**Company Network map per-node (2026-09-21):** sintoma = WH em pickup hub (ex. SBGR p/ Santos) sumia do mapa/chips; plot usava anchor/container do PortsMap. Causa = `hubsCoveredByFbo` omitia WH no nó; `pickupHubDetails` copiava coords do porto. Fix = um nó WH por ICAO; `CompanyNetworkMap` com mesmos glyphs dos chips; FBO no porto, WH no hub; feeder tracejado porto→WH.

**Scout empty after Hold (2026-09-22 b):** sintoma = Hold no Scout → “No open Demand matches…” + banner ainda “N Demand matches”. Causa = hold reserva free kg (Scout some) mas loop banner usava stock bruto; empty hint não mencionava holds. Fix = banner com free kg (−demandHolds); empty hint / UI citam desk holds → Hauls; toast VA aponta Hauls.

**Scout board gone after Hold (2026-09-22):** sintoma = Hold no Scout → tabela some (“No open Demand matches…”). Causa = confirm **não** mandava `companyId` (list sim) → re-list no tenant errado / `?? []` limpava arrays. Fix = `companyId` em bridge/demand/haul confirm + `applyScoutDesk` só troca arrays presentes + fallback `list`.

**Ports Demand tab chrome jump (2026-09-22):** sintoma = ao abrir Demand Board a shelf (tabs) sobe. Causa = CSS `:has(.ports-demand-board)` apertava `gap` / `panel-head` / `fbo-mode-switcher` margin. Fix = manter overflow hidden na board; spacing do chrome igual às outras abas.

**Desk / inbound UI stale until navigate (2026-09-22):** sintoma = desk `today 0` / In transit vazio até trocar de página, embora pulse já tivesse comprado. Causa = Ports só refetchava em `economyTick` (congelado no MP sem clock poll) + sem soft-poll. Fix = poll `/api/world/clock` + Ports refresh em `economyLastBatchAtMs` / tick (sem Scout) + soft-poll 20s enquanto Ports aberto.

**Map port selection snaps back (2026-09-22):** sintoma = clicar outro porto no mapa; após poucos segundos volta ao anterior (ex. Suape). Causa = soft-poll/pulse `refresh()` fechava `portId` stale (`null`) e fazia `setPortId(ports[0])`; fallback `port = find ?? ports[0]` também pintava o mapa errado. Fix = `setPortId` funcional (preserva seleção se ainda existir) + não fallback para `ports[0]` quando `portId` está set.

**Desk Warehouse “Pickup WH…” + sole WH (2026-09-22):** sintoma = dropdown Desk auto-buy mostra “Pickup WH…” e o único WH (ex. SBGR · T4) — opções redundantes. Causa = `<option value="">` placeholder sempre presente + lista filtrada por `port.pickupHubs` (só desk hub). Fix = `deskPickupWarehouses` + auto-select quando `length === 1`; omitir placeholder nesse caso.

**Member Ports empty Scout/WH (2026-09-21):** sintoma = membro vê Port FBO P1 / “Claim Port FBO first” e Warehouse “No warehouses”. Causa = chrome sticky-home: `GET /api/ports` herda `yours` via `alliedCompanyIds`, mas Scout/WH usam tenant **home** (`isPortOperator` exact + missions WH da home vazia). Fix = `selectTab('ports')` pinna VA (`switchCompanyForVa`) antes de montar Ports; sair de Ports restaura home (igual My VA), salvo Dispatch VA ativo.

**Member Available hid personal WH at VA hubs (2026-09-21):** sintoma = Available só listava SBKP (VA ainda sem WH); SBGR sumia porque a VA já tinha WH lá. Causa = filtro `!ownedHubSet` do tenant pinado. **Superseded:** misturar personal+VA no mesmo Ports não escala.

**Ports home vs My VA Ports (2026-09-21):** sidebar Ports = sempre **home** (sem pin VA). Company desk = **My VA → Ports** (`PortsPanel` embedded, shelf “Company”). Hauls “Open Ports desk” / Path CTA abrem o pane, não a sidebar. Dual-buy Available revertido.

**Home Ports false FBO + My VA Ports blank (2026-09-21):** sintoma = sidebar pintava Port FBO · P1 da VA (Lease) enquanto Scout pedia Claim; My VA → Ports preto. Causa = snapshot `yours` via allied benefits + CSS flex collapse no embed. Fix = `yours` exact operator; CSS `> .ports-panel` + embed min-height.

**Port FBO tab only when yours (2026-09-21):** aba Port FBO escondida sem concession exact; Claim/Details no Catalog. My VA Roster sem await `/api/ports`.

**Desk pickup único por porto — Phase B (2026-09-21):** sintoma = multi pickup (Santos SBGR+SBKP) confundia buy — listing em hub sem WH. Decisão = **um** `pickupHubs[]` por porto (ex. Santos só SBGR); listings/heal/auto-buy/UI alinhados. Hubs secundários removidos do catálogo (`CAREER_PORTS` + allowlist). Stevedore cross-hub no mesmo porto fica sem destinos (yard → Store no hub).

**Hauls CompanyNetworkMap crash (2026-09-21):** sintoma = UI error `canvasContextAttributes` ao abrir Hauls. Causa = MapLibre init/resize no embed antes do container ter tamanho ou após unmount (Strict Mode). Fix = defer init até `clientWidth/Height`, `aliveRef` + try/catch em resize/camera; My VA shell load = `BusyBlock` como Ports.

**CompanyNetworkMap typecheck + Hauls crash (2026-09-21):** CI `tsc` falhou e Hauls UI crashava `canvasContextAttributes`. Causa = `import { Map } from 'maplibre-gl'` sombreava `Map` nativo; `new Map()` no efeito dos feeders virava `new MapLibre()` sem options → lê `e.canvasContextAttributes` de `undefined`. Fix = `Map as MapLibreMap` + `new globalThis.Map` para o índice FBO. 0.3.203 ainda tinha o bug; ship em release seguinte.

**Company network map pin drift (2026-09-21):** sintoma = ícones escorregam ao pan e “voltam”. Causa = CSS `transform: scale()` no root do Marker (MapLibre usa `transform` para lat/lon). Fix = sem transform no root; highlight via filter/z-index.

**Hauls network camera (2026-09-21):** sintoma = selecionar chip fazia zoom out (fitBounds de toda a rede). Fix = câmera foca o nó selecionado (+ FBO/WH ligado); All = rede inteira.

**CompanyNetworkMap FBO focus zoom-out (2026-09-24):** sintoma = clicar chip/card FBO fazia zoom out. Causa = `fitBounds` no FBO + todos WH do porto (coords porto oceânico ≠ hub). Fix = câmera só no pin selecionado (`easeTo` ~9.25); rede inteira só sem seleção. Label embed “Company network · …” removida. *Atualização:* com FBO selecionado e corridor P1/P2, câmera volta a `fitBounds` no disco Demand (não no par FBO+WH).

**Demand corridor ring on Network map (2026-09-24):** sintoma = jogador não via o alcance Demand do Port FBO (P1 500 / P2 1800 / P3 open). Causa = mapa só pins + feeder; Scout Haul 1800 é outro sistema. Fix = `corridorRing` em `CompanyNetworkMap` (disco GeoJSON no hub de pickup); Ports passa ring ao selecionar FBO via `resolveUiPortCorridorLevel` + `corridorNmForLevel`; P3 sem ring; câmera `fitBounds` no disco (desk route ainda tem prioridade).

**Ports loop banner off (2026-09-24):** sintoma = card “Open Demand” + gap sob as tabs (Catalog/Network). Causa = `.ports-loop-slot` com min-height mesmo on-target. Fix = remover banner do chrome; tabs com altura fixa; conteúdo mais perto das tabs.

**Ports network IA (2026-09-24):** sintoma = Catalog / Port FBO / Warehouse / Demand + Available 239 não escala com N FBO/WH. Causa = abas planas + browse mundial no WH. Fix = tabs **Port catalog** + **Network**; Network = chips/`CompanyNetworkMap` + search ICAO; seleção FBO→Scout desk, WH→stock/Demand holds; Buy warehouse / Demand / Ground staff = CTAs (Available contextual no porto); sem This port/All hubs. Hauls continua board de holds. Spec UX em plano Ports layout scale.

**Company network fora do Port FBO (2026-09-21):** sintoma = chip SBRF no Ports esvazia Scout (filtro origem). Decisão = network chips + filtro ficam em **My VA → Hauls**; Port FBO é desk do porto (mapa Ports já mostra FBO/WH). Removido `VaCompanyNetwork` de `PortsPanel`.

**Ports WH map glyph = Hauls (2026-09-21):** pin WH no `PortsMap` e chips usam `companyNetworkIconSvg('wh')`. Redesign = galpão + porta de doca (sem grades/ribs); chips + Hauls + Ports compartilham o mesmo SVG.

**Company network glyphs outline (2026-09-23):** sintoma = chips FBO/WH “sólidos demais”. Fix = stroke + soft fill: FBO = pier + shed + yard crane; WH = hangar + dock bay; HQ = ring + star outline. Mesmo módulo chips/mapa.

**Company network feeder flicker (2026-09-23):** sintoma = rota tracejada porto/FBO→WH (perfil Airlines / Hauls) piscava sem parar. Causa = `CompanyNetworkMap` recriava source/layer GeoJSON a cada re-render do App (`nodes` novo por referência via `asNetworkNodes`). Fix = signature estável + `setData` em vez de remove/add; `useMemo` no profile panel.

**All ports table removed (2026-09-21):** tabela “All ports” no Catalog (sidebar + My VA Ports) removida — seleção fica no mapa / porto focado.

**Ports loop copy trim (2026-09-21):** banner/hints enxutos (só massa/hub/ETA/fee/match count); on-target Demand/catalog sem tutorial óbvio; inbound/yard hints curtos.

**Desk auto-buy inputs empty by default (2026-09-21):** Max $/kg, Max kg/day e Wallet floor abrem vazios (placeholders só); submit valida preço/massa; floor vazio = $0; limpa após save.

**Desk auto-buy weightSystem (2026-09-22):** labels Max $/lb|kg e mass/day seguem Settings; submit converte para $/kg + kg (economia). Summary da order também. **24 998 vs 25 000 lb:** esperado — `floor(lb→kg)` + `round(kg→lb)`; ~2 lb dust (sem snap de maxKg de WH).

**Desk auto-buy same-day skip (2026-09-22):** sintoma = order ativa `today 0 kg` com listing Supplies barata no Catalog por >15 min. Causa = `settleCompanyPassiveFeesForTickRange` early-out `daysCrossed<=0` (anti double-bill +Nd) **pulava** `tickPortAutoBuyOrders`; pulse só auto-buyava a company **active** no catch-up. VA/tenant não-active ficava até cruzar o dia. Fix = desk hygiene (auto-buy + auto-haul + inbound) também no path same-day. Precisa **redeploy world-api**.

**Desk auto-buy ≠ owner-only (2026-09-21):** ~~gate = `isPortOperator` only~~ → **DECIDIDO**: VA-listed → desk ops (auto-buy / stevedore / shuttle / abandon) = **owner|dispatcher**; Scout Hold + Catalog buy = qualquer membro; CAPEX (claim/renew/upgrade FBO, buy/upgrade WH) = **owner**. Solo/home sem gate. Helper `canMutateVaPortDeskOps`.

**Port FBO map + Scout route (2026-09-12):** Port FBO = `ports-main` (map left + panel right). Scout rows are tables; click selects haul/demand/bridge → `bridgeLegs` draws the route and `fitBounds`. Coords from scout payload (`originLat/Lon`, `destLat/Lon`) with hub fallback. Stage FBO taller (`~74vh` / 50rem) + Scout wraps sem `max-height` para reduzir scroll interno. Discharge ETA/kg moved to **Port catalog** strip (not FBO).

**Ports tab chrome (2026-09-13):** loop guidance always in fixed `ports-loop-slot` (banner off-target / hint on-target) so Catalog/FBO/Warehouse/Demand don’t jump vertically; Demand gets `ports-stage-title` like the other shelves.

**Demand loop banner (2026-09-13):** `derivePortsLoopStep` + `focusPortId` counts only the **focused port desk** (not world commodity matches). Copy: “N orders on this port Demand desk…”.

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

- `listPortScoutHaulSuggestions` / `confirmPortScoutHaul` → `holdWarehouseHaul` (trunk pay; dest fill ≤40%; kg capped to need→55% fill; ≤1800 nm).
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
- **UI Base:** sem barra/capacidade bonded (legado); T# + perks parking/Jet-A ficam como subtítulo sob o h2 **Base** (não soltos acima do Dispatcher). Holds grandfather só se ainda existirem na save.
- **Base Charter Search table parity (2026-09-19):** mesma moldura do Freight Search — `is-selected`, Dist/Ferry com `nm`/`—`, Pay/Net via `boardMoneyLabel`/`boardNetClassName`, ferry tag `describeTourFerry`, Accept em `td.actions`. Coluna Pax permanece (só Charter).
- **Base perk line float (2026-09-19):** sintoma = `T1 · −15% parking · −5% Jet-A/MRO` parecia solto no meio do panel. Causa = segundo `panel-head` acima do Dispatcher. Fix: subtítulo do h2 Base.
- **Base Buy T1 missing after VA (2026-09-20):** sintoma = Base em SBCT sem **Buy T1 · Free**; ou copy “Unlock Cargo Ops Value… second base” / “No Base at this hub” apesar da home sem Base. Causa = (1) `/api/state` da VA pintava `playerFbos` no chrome (não era `isHomeState`) → frota FBO da VA; (2) poll home usava snapshot global sem `canBuyAtIcao` e apagava o affordance do GET airport. Fix: `setPlayerFbos` só em home state; merge preserva `canBuyAtIcao`/`buyAtIcaoReason` se ownership não mudou; empty hint fallback “First base must be at home hub …”.
- **Base sidebar → home with second-base copy (2026-09-21):** sintoma = clique Base abre SBCT (home) com “Unlock Cargo Ops Value… second base” e painel vazio. Causa = client `playerFbos` ainda vazio → `openFboBoard` cai na home; company já tem 1 Base noutro hub; chip de troca só aparecia com **2+** bases. Fix: após hydrate, redirect para hub owned; chip com 1 Base fora do hub atual; empty copy “Your Base is at …”.

### Base Dispatcher seat + Search — shipped

- `career-base-dispatcher.ts`: **1 seat / Base** (ground desk, not flying crew). Hire pool / fire severance / daily salary (`base_dispatcher_*` ledger). Persist inside `player_fbos_json` (`dispatchers`, hire pools).
- Perks via skill: fleet scout mode, max suggestions 6–12, milder ferry $/nm penalty. Sem hire = **manual** desk (aircraft already @ lot origin, max 3).
- `career-base-dispatch-scout.ts`: legacy/API rank de single lots; a UI da Base usa o Search unificado abaixo.
- `POST /api/base/dispatcher` (`list` | `refresh` | `hire` | `fire`); UI desk na aba Base.
- **2026-09-06 persist bug:** hire gravava `dispatchers` em `player_fbos_json`, mas `normalizeMissionsState` / `readCompanyStateScalars` só reidratavam `fbos`+`holds` → reload apagava o seat (ledger `base_dispatcher_hire` ficava). Fix: preservar `dispatchers` + hire pools no load.
- **Map:** selecionar linha do Search traça OD/tour no `FboRouteMapCard` abaixo.
- **Base Charter Origin shared with Freight (2026-09-18):** Base→Charters locked origin to dispatchTourOrigin (Freight Search) and fell back to Base ICAO when empty — board field disabled, felt like Freights-only control. Fix: separate `baseCharterOrigin`; empty = any (no Base lock); typed ICAO still exact filter.
- **Base Charter Search 1–2 legs (2026-09-18):** Base→Charters was an embedded `CharterBoard` (sidebar board clone), not Freight-style multi-leg Search. Fix: `career-base-dispatch-charter-tour` + `POST /api/base/dispatch-charters` (`list`/`prepare`/`status`/`drop`/`bind-leg`); UI filters Aircraft/Legs(1–2)/Origin/Min–Max nm/Max ferry/Return/Leave Base; Accept L1 → Manifest (+ `charterActiveTour` when 2 legs); Accept L2 after L1 settle (no lot soft-hold). Persist `playerFbos.charterActiveTour`.
- **Charter tour Exp + quiet Search (2026-09-18):** Active Charter tour panel shows live **Exp** per leg (`charterExpiryLabel` / expired); Search filters+table hide while tour is active (Finish/Drop to Search again).
- **Tour UI declutter + mutual exclusion (2026-09-18):** Dropped Tour/Charter-tour titles, soft-hold/acf lede noise, ferry chips and Status column on active panels. Freight↔Charter tours are exclusive (server prepare/start + UI tab lock + Accept guards); Search quiet while either tour is active.
- **Base Desk tab (2026-09-18):** Hired Dispatcher card moved off Freight/Charter into **Desk** lane (hire/fire/candidates). Ops tabs show a compact name·grade chip → Desk. Hire jumps to Freight.
- **Desk not a product tab (2026-09-18):** Removed Desk from Freight|Charter lane (felt like a third product). Dispatcher opens via chip (`Hire Dispatcher` / `Name · grade`); Desk no longer falls through to Charter Search filters.
- **Dispatcher compact header (2026-09-18):** Chip/Desk mode removed. Hired seat sits in Base header (portrait + name/grade + $/day + Fire); Hire expands a candidate strip under the header.
- **Tour Accept stays on Base (2026-09-18):** Search Accept L1 (2+ legs) only `prepare`s Active Tour and stays on Base; Manifest opens from Active Tour Continue/Accept L1 (Freight + Charter). 1-leg Search still goes straight to Manifest.
- **Charter Continue ferry CTA (2026-09-18):** Charter Active Tour only showed Accept when aircraft already at origin — off-origin had no button (Freight has Continue·Ferry). Fix: same Continue CTA + Manifest ferry; status fetch when snap lacks `resumeHint`.
- **Hire Dispatcher ~30s on MP (2026-09-18):** Hire/Fire ran listBaseDispatchScoutSuggestions (no hub filter → all world.lots × fleet) inside withCareerWrite under the career lock; UI waited on that HTTP. Client never used suggestions from the response. Fix: return dispatcher+policy only; Search loads tours on demand.
- **Dispatcher desk empty on MP (2026-09-18):** Base showed “No Dispatcher candidates yet” / Refresh no-op while FBO T1 was owned. Cause: `/api/base/dispatcher` (+ scout/tours) loaded missions without per-request `companyId` — same ambient-tenant pitfall as Charter Fit. Fix: pass `companyIdFromRequest` on list/refresh/hire/fire and Base dispatch scout/tours. **MP needs VPS rebuild**.
- **Buy Base UI stuck (2026-09-13):** Claim T1 while already on Base tab left desk as “No candidates” / “Search for freights” (hire pool never loaded — `useEffect` deps were only section/ICAO). Fix: seed Dispatcher pool on `/api/fbo/buy`, return `dispatcher`+`policy`, client sets state; re-list when ownership boolean flips; empty copy + Refresh candidates.
- **Freight filters locked after hire (2026-09-13):** sintoma → Origin/Min/Max/Search greyed forever after Base+Dispatcher. Causa → desk `useEffect` depended on `playerFbos.fbos` array identity; state poll replaced it every tick → `dispatchScoutLoading` stuck true → `disabled={busy || dispatchDeskBusy}`. Fix → deps on stable `ownsBaseAtAirport` boolean; Search filters/Accept use `dispatchTourBusy` only (hire/fire keep `dispatchHireBusy`).
- **Dispatcher perk on cards (2026-09-13):** hire/seat cards show `perkHint` (`Fleet scout · up to N · ferry-tolerant|balanced|strict ferry Search`). Grade → more suggestions + milder internal ferry score (not a wallet fee; old `−$/nm` copy confused players).

### Base Dispatcher Search — shipped (single + tour)

- `career-base-dispatch-tour.ts`: lists **1 real Market lot** or chains **2–4 lots** (region lens, ferry between legs ≤**200 nm** default / UI **Max ferry** filter, soft return Base/origin). Cap = Dispatcher scout `policy.max` (6–12 by skill; hard ceiling **12**). Requires hired Dispatcher (`policy.mode === 'fleet'`).
- **Tour/Charter desk cap vs perk (2026-09-19):** Search truncava em **8** (`BASE_DISPATCH_TOUR_MAX`) e ignorava `policy.max` — ACE “up to 11” mostrava 8. Fix: `maxTours = min(12, policy.max)` em freight + charter Search (igual Scout).
- **Legs cap (2026-09-07):** Search UI + `BASE_DISPATCH_TOUR_LEGS_MAX` = **4** (was 3).
- **Unified single-leg UI (2026-09-07):** removeu botão/tabela **Scan**; filtro Legs = **1/2/3/4**. Legs 1 abre Manifest normal e não cria Active Tour; Return fica oculto. Legs 2–4 mantêm Active Tour.
- **Origin vazio (2026-09-07):** UI envia o ICAO da Base (igual ao placeholder). Antes o server caía silenciosamente na localização do avião — ex. campo parecia SBKP, mas buscava desde SBCT.
- Filters (desk): aircraft, legs, origin ICAO, min/max nm, max ferry; Return só em 2–4 legs. UI button **Search** (busca no board — não soft-spawn).
- **Empty Min nm** → tour floors (`BASE_DISPATCH_TOUR_MIN_NM`, light_jet **120**), **not** Scout’s 400 — otherwise BR-SE Citation chains almost never match.
- **Region lens:** 1ª perna usa region do **Origin** (fallback Base); pernas seguintes sem lock de region (só ferry ≤ Max ferry, default 200 nm, cap 800) — evita matar cadeias SBSP(`BR-SE`)→SBCT(`BR-S`).
- Confirm → **leg 1 only** via `confirmBaseDispatchScout` / `executeAcceptLot` + **persist Active Tour** (`playerFbos.activeTour`) when `tourLegs` ≥ 2.
- API `POST /api/base/dispatch-tours` (`list` | `confirm` | `status` | `accept-leg` | `drop`); UI Search + tour table + **Active Tour** panel.
- **Active Tour (2026-09-06):** no hard-reserve of L2+. After L1 settle + aircraft at next origin → **Accept L2** (rebind same OD if lot gone). Sidebar “Active tour · Continue → Base”. Persist via `player_fbos_json` (same pitfall as dispatchers — keep on normalize/load).
- **Cargo Ops gate (2026-09-07):** Scout/Tour Search + rebind skip locked commodities (e.g. Perishables before Time unlock) — Accept no longer surfaces “Perishables is locked” from a suggested row.
- **Manifest redirect (2026-09-07):** Accept L1/L2 opens **Manifest** (staging) to pick aircraft parked at origin (same gate as Freights). `Accept & Dispatch` then `attach` / `bind-leg` Active Tour — no immediate `confirm` accept.
- **Active Tour persist (2026-09-07):** Accept into Manifest calls `prepare` → writes `playerFbos.activeTour` immediately (legs `planned`). Refresh/rebuild no longer wipes the tour. Sync auto-binds L1 when a matching mission is in flight; Manifest cancel uses `drop-unbound`.
- **prepare bug (2026-09-07):** API passava `tourLegs` mas `prepareActiveTour` espera `legs` → “Active Tour needs at least 2 legs” no Accept. Fix: `legs: body.tourLegs`. Route column mostra tag **Ferry N nm** quando `totalFerryNm > 0`.
- **UI Base (2026-09-07):** cortou prosa/labels de tutorial — header só **Base** + tier/perks; Dispatcher card limpo; Freights sem lede; filters sem caixa “explicativa”.
- **Tour quality + Dispatch UX (2026-09-07):** `tourPassesQualityGate` — net>0, ferry ≤85% cargo nm, net/ferry ≥ $6/nm; sort tie-break less ferry then net. Mid-flight: sidebar Active flight shows `Tour Lx/y · next OD`; En route uses quiet `base-tour-flight-context` rail (leg chips + next/last + Base), not green `.banner.ok`.
- **Max ferry filter (2026-09-07):** Search default **200 nm** between legs (was 180); desk field **Max ferry** (40–800); first-leg reposition still allows 2× that value.
- **Max ferry UX (2026-09-19):** regra 2× intacta. Copy no campo (tooltip: entre pernas; 1º hop até 2×). `describeTourFerry` label multi-hop `Ferry · 120+68`; coluna Ferry usa o mesmo label + tooltip de hops. Freights + Charters.
- **Search nm/ferry per-leg labels (2026-09-19):** sintoma = Max nm 3000 com Dist 3731 parecia filtro quebrado. Causa = filtro é **por perna**; Dist/Ferry são **totais**. Fix UI: `Min/Max nm/leg`, `Max ferry/hop` + tooltips; headers Dist/Ferry explicam soma.
- **Active Tour map plot (2026-09-19):** sintoma = após Accept L1 o mapa Base só mostrava o pin da Base (“Select a charter”). Causa = `FboRouteMapCard` lia só `selectedCharterTourId` / Search. Fix: `baseDispatchMapTour` prefere `charterActiveTour` / `activeTour` legs (rota completa + ferry dashed).
- **Return / ferry tag (2026-09-07):** End at Base/origin sem fallback open-end. Tag curta `Ferry · 188 nm`; hover mostra `L2 SBCT→SBKP 188 nm`.
- **Tour orphan pós-cancel (2026-09-07):** cancel synca Active Tour; `resumeState` ready/blocked/stranded + `resumeHint`. Toast, sidebar Resume/Drop, banner no Dispatch vazio e no painel Base.
- **Accept flicker (2026-09-07):** `/api/state` `playerFbos.activeTour` é snapshot cru (sem `canAcceptNextLeg`) e sobrescrevia a view do Refresh → Accept sumia. Fix: não overwrite view rica; soft-match de missão só live (não settled) pra não marcar L2 `done` com L1 `planned`.
- **Resume tour card (2026-09-07):** Discard Manifest **mantém** o Active Tour (Drop limpa). Clique no card: Manifest se staging; Flight plan se missão aceita; Base após cancel Manifest/flight.
- **Tour Manifest lot gone (2026-09-07):** `marketLotFromTourLeg` inflava `availableKg` com liftKg → UI 2.7 klb, Accept `0 kg available`. Fix: board free kg only; Accept + route-lot hydrate rebind same-OD se lot esvaziou pós-Search.
- **bind-leg after rebind (2026-09-07):** `setPendingActiveTour(fn)` guardava a *função* no ref → `legIndex` undefined → `missionId and legIndex required`. Fix: resolver functional update no wrapper; attach aceita OD match pós-rebind.
- **Tour vanish after L1 settle (2026-09-07):** L1 rebind same-OD stole L2's `lotId` → both legs shared one `missionId` → settle marked both `done` → `status: completed` → Base empty. Fix: rebind/client alternate exclude sibling lotIds; sync repairs duplicate mission/lot claims and re-opens false completes; settle syncs Active Tour.
- **Off-origin Manifest (2026-09-07):** combo lists all parked fleet (`@ hub` / `ferry from`); Ferry → `FerryJourneyDialog` to lot origin; Accept blocked until airframe arrives.
- **Market Prepare off-origin (2026-09-07):** `Prepare` no Freights/Terminal não redireciona mais ao Hangar. Cria o Manifest com a aeronave parked selecionada (fallback qualquer parked), abre `FerryJourneyDialog` ali e mantém `Accept & Dispatch` bloqueado até chegar à origem — mesmo fluxo do Base Dispatcher.
- **Contracts Ferry CTA removed (2026-09-23):** botão `Ferry to {terminal}` ao lado do picker de Aircraft em Airport → Contracts era atalho pro Hangar; redundante com Prepare → Manifest → Ferry. Removido (Hangar / Move / Manifest intactos).
- **Terminal Contracts aircraft picker parity (2026-09-20):** Freight tinha o dropdown acima de Freight|Charter; Charter embutia outro picker dentro do `CharterBoard` (mudava de lugar). Fix: picker compartilhado no `panel-head`; CharterBoard em modo controlado (`aircraftId` + `hideAircraftPicker`). Loading infinito do Charter (deps no resolver fn) já corrigido em 0.3.167 — Terminal usa o mesmo path.
- **Route label:** inclui hop de ferry (`SBKP→SBCT→SBFL→SBCT`), não só dests de carga (`SBKP→SBCT→SBCT`) — alinha tabela/header com o mapa.
- **Return filter:** “End at origin/Base” — last **cargo** dest must equal target (não acrescenta ferry home). Sem cadeias que voltem → **lista vazia** + toast (sem fallback open-end).
- **Perf (2026-09-06):** Search was O(lots × branching × econ) — now economics **once**/lot, index by origin, ferry only for nearby origins.
- Map: selected tour draws **cargo legs solid** + **ferry dashed**; headline = cargo routeLabel + ferry nm (2 legs ≠ 2 map segments when reposition needed).

### Base Dispatcher — backlog

- ~~Soft-hold curto em L2+~~ **shipped 2026-09-13:** next planned leg only; `reservedKg` + TTL **4 ticks**; prepare / sync renew; Drop/expire/Accept release; world `tourLotSoftHolds` + leg meta (MP-shaped).
- ~~Preferência “sai da Base ICAO”~~ **shipped 2026-09-13:** desk **Leave Base** Prefer/Off (default Prefer); score-boost first-leg `origin === hub` (neighbors still eligible).
- Clareza multi-Base (hire/scout por hub) quando 2ª Base existir.
- Não reabrir company Hangar crew fly (`COMPANY_CREW_ENABLED = false`).

### Soft-hold L2+ + Leave Base (2026-09-13)

- **Soft-hold:** `BASE_TOUR_SOFT_HOLD_TTL_TICKS = 4` (~1h). Only the **next** unaccepted planned leg (prepare → L2; after L1 settle → L3). Uses `reserveShipmentLot` / `releaseShipmentReservation`; Accept releases soft then hard-reserves (no double-count). UI: Tour lede `L# soft-hold Nt`.
- **Leave Base:** `preferLeaveBase` (default true) on `listBaseDispatchTours` + Freights filter. Boost Base-origin first legs; mild neighbor penalty — not a hard ICAO filter.
- Paths: `career-base-dispatch-tour.ts`, `types/career-economy.ts` (`TourLotSoftHold`), API `preferLeaveBase` + command-slice persist on prepare/drop/status.

### Tour ferry CTA (2026-09-07)

- **Não** botão Ferry separado na tabela do Tour — Manifest já tem `Ferry to {origin}`.
- Next leg `blocked` (acf off-origin): CTA **Continue · Ferry to ICAO** → Manifest; se acf parked off-origin, abre `FerryJourneyDialog` na hora. At origin: **Accept Ln**. Stranded: sem CTA.

### Phase 3 — shipped

- `career-port-stevedore.ts`: quote / start / list destinations; fee `0.03 + 0.0004*nm` $/kg; ETA = inbound ticks + min(4, ceil(nm/50)).
- Gates: active Port FBO; cross-hub only (same hub → Store); dest ∈ port `pickupHubs`; clamp to inbound free; wallet ≥ fee.
- Persist: `WarehouseInboundTransfer` + optional `source: 'stevedore'`; settle via existing `settleWarehouseInboundTransfers`.
- Ledger `port_drayage` (“Port stevedore”); API `POST /api/ports/stevedore`; yard UI **Truck → {ICAO}**.
- **Yard row CSS (2026-09-12):** `display:flex` on `<td class="ports-pickup-actions">` clipped row background before Abandon — flex moved to inner div. Hint when WH exists at another pickup hub but no Port FBO: `· or Port FBO → Truck {ICAO}` (Santos SBGR yard + SBKP WH).

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
