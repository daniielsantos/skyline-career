# VA logistics — air bridge + desk automation

Atualizado 2026-09-20. **IH-2 multi-piloto shipped** — invite/roster (cap 8), board Internal Haul, settle fee-to-operator (VA debita pay → home do piloto), ranking 7d. Sem chat/crew. Spec abaixo + [24-port-fbo.md](./24-port-fbo.md).
**IH-1** pay + Port FBO desk auto-buy (VA Fase 1 solo) intactos. Loops A/B + tiers 1–3 **decididos**.
**Doc 2026-09-19:** dual-tenant membro; **member route cut shipped**; **ferry ops shipped** (Line crew + allowance NPC + overflow home); MX owner-only; **member progression home ladder shipped** (gates + settle XP).
**Doc 2026-09-20:** **VA org perks shipped** — Flight quality → tiers Proven/Reliable/Elite (−MX / −overflow ferry); UI My VA + directory/ranking. Buff concessão herdado = ainda backlog.
**Doc 2026-09-20 (b):** Prepare/Accept dual-tenant — Freights/Charter/Ports list **Yours+VA** tails; ferry modal só sob CTA; Base Dispatcher permanece home-only. Operator aircraft ≠ VA.
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
| Config `memberRouteCutPct` | sim | não | read-only (vê o %) |
| **Inspect / repair (MX)** | **sim** (debita wallet VA) | **não** | **não** |
| **Credit draw / repay** | **sim** | **não** | **não** |
| Voar IH / Freights com tail VA | sim | sim | sim |

**Nota Hangar / MX — DECIDIDO · shipped parcial:**

- **Inspect + repair** debitam o **wallet da VA** (company ativa = VA). Fora do net do cut.
- **Só owner** autoriza MX (UI + API `403` em `/api/aircraft-market/maintenance` e `/repair`). Dispatcher e pilot = sem botão / sem API.
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
- **Org perks (shipped 2026-09-20):** `resolveVaOrgPerks` em `career-va-perks.ts` mapeia quality → tier Building / Proven (≥55, 3+) / Reliable (≥70, 8+) / Elite (≥85, 15+). Efeitos: `mxCostMult` (inspect/repair VA, stacks com Base FBO) + `ferryOverflowCostMult` (overflow Line-crew cobrado no home do piloto). **Sem** Jet-A global (Base/Port já cobrem combustível). UI: chip no head My VA + bloco sob Flight quality no Ledger; directory Perks; ranking `· Proven`. Não confundir com **buff de concessão herdado** (Port FBO P# no porto home — membros herdam buy/ETA/listings; ainda backlog).
- **Prepare Yours+VA (shipped 2026-09-20):** chrome sticky-home escondia frota VA em Freights/Charter/Ports. Fix: prefetch `/api/va/members` → `vaSessionFleet`; `ops-fleet.ts` merge Yours+VA nos pickers; ferry Journey **não** abre no Prepare (só CTA); Accept/`companyId` no tenant do tail + pin VA enquanto Dispatch ativo. **Operator aircraft** = NPC (não VA). **Base Dispatcher** = home-only (CAPEX pessoal).
- **Charter/Freights board VA (2026-09-20):** sintoma — Charter `Unknown aircraft acf_…` ao selecionar tail VA; Freights dropdown só home. Causa — `GET /api/charters` lia chrome home; `boardEstimateFleet` filtrava `fleet` home. Fix — query `companyId` no Fit + `resolveAircraftCompanyId`; Freights/Contracts picker usa `prepareOpsFleet` com prefixo VA/Yours.

**Nota dual-tenant wallet / companyId — DECIDIDO · shipped (2026-09-20):**

- Abrir My VA faz `switchCompanyForVa` e grava `?company=` da VA — necessário para hangar/ledger/mutações.
- **Chrome sticky = home:** topbar Company + Wallet + Hangar da sidebar leem sempre a **home**. Label do chip é sempre **Wallet** (nunca “VA wallet”). Sessão API pode estar na VA só dentro de My VA; `paintWallet`/`commitWallet` recusam pintar chrome se `active ≠ home` (mandam para `vaSessionWallet`).
- Qualquer tab **≠ My VA** (incl. VAs directory) restaura session home antes do refresh.
- Join por código **não** troca tenant — My VA é que abre a VA.

---

## Por que entrar numa VA? (valor)

### Shipped (IH-2)

1. **Board Internal Haul** — voar pontes WH→WH que a VA montou; pay interno → wallet home.
2. **Roster / roles** — pilot ou dispatcher; invite / request.
3. **Ranking 7d** — company + strip de pilots.
4. **Hangar da VA** — ver/usar cascos da company listada (mesmo wallet/frota do owner).

### Decidido no Tier 1, ainda não é o gancho principal do join

5. **Buff de concessão herdado** no porto home da VA (membros herdam) — **DECIDIDO** na tabela de prioridade; implementação member-aware = backlog.
6. Desk Fase 3 (auto-haul) — só com VA; depois.

### Contratos com avião da VA — **DECIDIDO (2026-09-19) · shipped**

Membro **pode** voar **Freights / Demand / Charter** (e empty ferry) com **tail da VA**, company ativa = VA.

| Contrato | Ops | Dinheiro do piloto |
|--|--|--|
| **Internal Haul** | VA: fuel da perna | Pay stamp IH → home (**shipped**; sem % extra) |
| **Freights / Demand / Charter** | VA: fuel da perna de receita | **`memberRouteCutPct` do lucro net** → home; resto na VA |
| **Empty ferry / Hangar reposition** | Ver **Ferry ops** abaixo | — |
| **Solo** (teu tail, company home) | Você | 100% você |

**Fatia (`memberRouteCutPct`):**

1. Owner configura o % (inteiro) = parte do **lucro da rota** que vai pro piloto (home) — Config My VA + `POST /api/va/route-cut`.
2. **Visível no directory** (`Pilot cut N%`) + Config My VA.
3. **Lucro** = no settle `max(0, payoutUsd − fuelDebitUsd)` desta missão. MX/inspeção e **empty ferry** fora do net por perna.
4. `pilotUsd = round(routeNet × pct / 100)` → credita home (`va_member_cut`); debita VA.
5. Faixa **10–50%**; default publish **30%**.
6. Owner voando o próprio VA: **sem cut** (`pilotHomeCompanyId` = ops).
7. IH **não** recebe esse % em cima do pay stamp.
8. Accept Freights/Demand/Charter **stamp** `pilotHomeCompanyId` / `pilotAccountId`.
9. **Logbook (2026-09-20):** tag **VA** quando `vaFlight` (accept sob company `va_listed`) ou Internal Haul. Pay mostrado = `pilotPayoutUsd` (fatia home / fee IH) quando stampado no settle; senão `payoutUsd` bruto da rota. Membro Freights com cut: UI sufixo `cut`. Histórico pré-stamp: na company VA listada o GET `/api/missions` força `vaFlight` (tag), mas pay antigo continua bruto até novo settle.
10. **Logbook merge home+VA (2026-09-20):** voos solo e VA vivem em arquivos de company distintos; `selectTab` restaura home → Logbook home-only ficava vazio se só voou VA. Fix: `loadMissionsMerged` busca home + VA (`fetchMissions({ companyId })`) e `mergeLogbookMissions` por id.
11. **Logbook merge still empty (2026-09-20):** `warmCareerBeforeEnter` não setava `homeCompanyId`; merge exigia `home && va` → nunca puxava VA. Fix: stamp home no warm; merge todo tenant extra ≠ active; `GET /api/missions?companyId=` como Charter.
12. **Logbook leaked other members’ VA flights (2026-09-20):** merge puxava o arquivo inteiro da company VA. Fix: `filterVaMissionsForPilot` (`pilotAccountId` / `pilotHomeCompanyId`; legacy unstamped só pro owner).
13. **My VA Logbook tab (2026-09-20):** histórico da company (todos os membros) em My VA → Logbook; chip com nome do piloto; pay = bruto da rota. Logbook sidebar continua pessoal.

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

**Pay do haul — DECIDIDO (híbrido) · shipped IH-1:**
- Sistema **sugere** pay (`quoteInternalHaulPayUsd`: floor + $/kg + $/nm)
- Dispatcher ajusta **dentro de banda** 80–150% (`clampInternalHaulPayUsd`)
- Debita **company** / credita **pilot** no settle (kind `internal_haul_pay`)
- Solo Owner+Pilot: mesmo `walletUsd`, duas linhas ledger (net 0 além de fuel/ops)
- Port shuttle **recusa** hold/missão com pay &gt; 0

**Roadmap pay / social:**
| Fatia | Escopo | Status |
|-------|--------|--------|
| **IH-1** | Quote + stamp + settle ±pay; UI Ports/Scout | **shipped** |
| **IH-2** | Schema members fino + board interno + accept outro piloto + ranking 7d | **shipped** |
| **IH-3** | Desk AI cria hauls (Fase 3) sob caps Owner | Depois de IH-2 |
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
| **1 — core** | Internal haul WH→WH; UI surplus/deficit; **buff de concessão herdado por membros da VA** no porto home | **DECIDIDO** |
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

**Next:** VA Fase 3 auto-haul (só com members). Market→WH redirect continua backlog ([`24`](./24-port-fbo.md)).

### Fase 3 — Desk AI cria hauls (VA)

**Status:** fechada como fase **só com VA/MP**; depois de Fase 1–2 estáveis.

| | |
|--|--|
| **O que** | Sob regras do Owner (spread min, OD allowlist, max hauls/dia, pay interno formula), o desk **cria** Internal Hauls automaticamente |
| **Quem voa** | Pilots humanos (board interno da VA); AI **não** completa a ponte sozinha |
| **Equilíbrio social** | AI desk compete com Dispatcher humano: humano sem cap apertado / assign nominal; AI com cap baixo — senão ninguém convida player desk |
| **Monetização** | VA pack / desk seat / Ops Autopilot — capacidade de automação, não vantagem de preço |
| **Não faz** | Aceitar Demand/Market NPC por conta própria além das regras; voar; snipar board global |

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

### My VA Ledger for members (2026-09-20)

**Sintoma / gap:** membros não viam wallet/ledger da VA (só o chrome do owner quando tenant ativo; sem aba dedicada).
**Causa:** wallet é a mesma company do owner, mas My VA só tinha Roster / Hangar / Config — Hangar Cashflow ficava escondido no Hangar pessoal ou exigia saber trocar de contexto.
**Fix:** aba **Ledger** em My VA reusa `HangarCashflowPanel` + `GET /api/cashflow`; credit draw/repay owner-only (UI + API).

### VA Ops rep + Flight quality (2026-09-20)

**Sintoma / gap:** settle já mostra flight score, mas VA não tinha reputação de org; Ops rep do credit só refletia ladder do owner e não aparecia como sinal público.
**Causa:** quality era efêmera no debrief; Cargo Ops XP de membros vai pra home (certo) e não alimenta um score de marca.
**Fix:** tabela `company_flight_quality_stats` (SQLite v15 / PG v26); settle em VA listed grava score+onTime; snapshot 7d em cashflow/members/directory/ranking; UI labels **Ops rep** vs **Flight quality** (sem dual-write de unlock).

### VA org perks from Flight quality (2026-09-20)

**Sintoma / gap:** Flight quality era só display — VA “boa” não ganhava efeito operacional; join value ainda dependia só de IH/cut.
**Causa:** sem tabela quality→perk; MX/ferry overflow não liam org score; UI sem chip.
**Fix:** `career-va-perks.ts` (Proven/Reliable/Elite); API members/cashflow/directory/ranking + MX `extraServiceMult` + ferry overflow mult; UI My VA head/Ledger + directory Perks + ranking. Sem Jet-A org (Base/Port). Buff concessão herdado continua backlog separado.

### Prepare hides VA fleet + auto ferry (2026-09-20)

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

### Line crew allowance ferry left Duke stuck / missing from Manifest (2026-09-20)

**Sintoma:** toast de sucesso (−$0), Duke não mudou de ICAO no Hangar VA; sumiu do picker Manifest.
**Causa:** allowance aplicava `npcArriveAtTick` → status `ferry` sem mover location; Manifest/Prepare só listam `parked`. ETA NPC + UI “Instant” incongruentes. Hangar VA vinha de `/api/va/members` (peek missions) sem finalizar hops.
**Fix:** allowance = hop instantâneo $0; `finalizeStuckNpcFerries` no `withCareerRead`/settle **e** no load de `/api/va/members` (+save); picker mostra `ferry` desabilitado se ainda houver. Ferry pago sempre foi instantâneo — o ETA era só o path Line crew (revertido).

### Line crew tiers Desk/Ops/Network (2026-09-20)

**Sintoma / gap:** Line crew era hire flat (Desk only); VAs grandes esgotavam allowance cedo sem path de escala.
**Causa:** um único salary/allowance; sem upgrade.
**Fix:** `vaLineCrew.tier` 1|2|3 no JSON (sem migrate); hire→Desk; `upgradeVaLineCrew` Ops/Network; fire→none com severance = salary do tier; allowance/salary por tabela; API `action=upgrade`; Config Upgrade/Fire; ledger `va_line_crew_upgrade`. Legacy hired sem tier = Desk.

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

### VA hangar aircraft reservation (2026-09-20)

**Sintoma / gap:** membros competiam first-come no mesmo casco; Hangar nao sinalizava hold.
**Causa:** fleet so tinha assign de missao; sem soft-hold por conta.
**Fix:** SQLite **v16** / PG **v27** `reserved_by_account_id` + `reserved_at_ms`; hard lock 4h TTL; 1 reserva/membro; reserve/release API; gate em assign/ferry; badge + Reserve/Release no Hangar VA.

### VA publish missing home_country_id (2026-09-20)

**Sintoma:** companies.home_country_id vazio na Lamusine (SBKP) enquanto hub estava setado; local stub tambem vazio.
**Causa:** publishCompanyAsVa / PG aPublish gravavam hub/name/listed sem derivar pais; select-hub sim escrevia country.
**Fix:** publish seta home_country_id via countryIdForHubIcao(hub); backfill idempotente no open (SQLite + PG) para hubs ja gravados.

## Checklist quando for implementar

- [x] InternalHaul pay (IH-1)
- [ ] UI surplus/tight por commodity no Ports / região
- [x] Fase 1 auto-buy
- [x] Fase 2 scout
- [x] IH-2 members + board interno + ranking 7d
- [ ] Fase 3 / IH-3: só com VA; caps AI vs humano Dispatcher
- [x] Testes IH-1 + VA invite/cap/cross-pay/ranking
- [x] Copy join / My VA: dual-tenant (frota home vs VA)
- [x] **memberRouteCutPct** — schema v14 + Config + directory + settle Freights/Demand/Charter (net após fuel)
- [x] Hangar VA: member read-only UI (sell/lease/MX; ferry ok) + **API gate MX + sell/list/unlist owner-only**
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
- [ ] Buff concessão herdado no porto home da VA (member-aware; Tier 1)