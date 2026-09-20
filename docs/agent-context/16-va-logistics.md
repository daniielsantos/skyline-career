# VA logistics — air bridge + desk automation

Atualizado 2026-09-19. **IH-2 multi-piloto shipped** — invite/roster (cap 8), board Internal Haul, settle fee-to-operator (VA debita pay → home do piloto), ranking 7d. Sem chat/crew. Spec abaixo + [24-port-fbo.md](./24-port-fbo.md).
**IH-1** pay + Port FBO desk auto-buy (VA Fase 1 solo) intactos. Loops A/B + tiers 1–3 **decididos**.
**Doc 2026-09-19:** dual-tenant membro; **member route cut shipped**; **ferry ops shipped** (Line crew + allowance NPC + overflow home); MX owner-only; **member progression home ladder shipped** (gates + settle XP).
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

My VA tem **pelo menos duas leituras** do mesmo shell (Roster / Hangar / Ledger / Config). API já rejeita ações fora do role; UI deve **esconder** controles, não só falhar no click.

| Ação | Owner | Dispatcher | Pilot (membro) |
|--|--|--|--|
| Ver roster / hangar (frota VA) | sim | sim | sim (read; mutações Hangar = ver nota) |
| Ver Ledger (wallet + cashflow VA) | sim | sim | sim |
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
2. Hire dá **allowance** `K = max(4, min(2×memberCap, 2×parked))` empty NPC ferries/semana (retune 2026-09-20: piso 4, 2× parked; cap 16).
3. Reposition no allowance: **sem debit** VA; status `ferry` + ETA ticks; completa no catch-up/passive settle.
4. Acima do cap / sem hire → **overflow**: empty ferry **pago na home do piloto** (`va_line_crew_ferry`). Owner sem allowance: VA paga ferry instantâneo (comportamento solo).
5. Fire: severance 1 semana (`POST /api/va/line-crew` fire).
6. MX/hours no complete NPC: wear leve por nm.

**Non-goals v1:** ferry infinito grátis; misturar com Port FBO ground staff; IAP seat.

### Line crew tiers (Desk / Ops / Network) — **DECIDIDO design (2026-09-20) · not shipped**

v1 continua **um** hire flat. Próximo passo de produto (antes de polish de layout Config):

| Tier | Nome | Hire (VA) | $/semana | Allowance NPC/semana | Notas |
|--|--|--|--|--|--|
| **T1** | Desk | $2 500 (atual) | $1 800 | `max(4, min(16, 2×parked))` | Default ao hire |
| **T2** | Ops | +$4 000 upgrade | $3 200 | `max(8, min(24, 3×parked))` | Upgrade owner-only; fire volta a “sem crew” (não auto-downgrade) |
| **T3** | Network | +$7 500 from T2 | $5 500 | `max(12, min(32, 4×parked))` | Top; still overflow home beyond cap |

**Regras**
- Só **owner** upgrade/fire; salary no wallet VA; week key igual v1.
- Downgrade **não** no v2 — só fire (severance = 1× salary do tier atual) e re-hire T1.
- Overflow / owner instantâneo **inalterados**.
- UI Config: uma linha de tier + botão Upgrade / Fire (layout polish = turno separado).

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

### VA hangar aircraft reservation (2026-09-20)

**Sintoma / gap:** membros competiam first-come no mesmo casco; Hangar nao sinalizava hold.
**Causa:** fleet so tinha assign de missao; sem soft-hold por conta.
**Fix:** SQLite **v16** / PG **v27** 
eserved_by_account_id + 
eserved_at_ms; hard lock 4h TTL; 1 reserva/membro; reserve/release API; gate em assign/ferry; badge + Reserve/Release no Hangar VA.

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
- [x] **Chrome sticky home** — wallet/fleet do shell = home; My VA usa caches VA
- [x] **Roster presence** — online / last seen / flight na row
- [x] **VA aircraft reserve** — hard lock 4h TTL; 1/membro; Hangar badge
- [x] **VA home_country_id on publish** — derive from hub + backfill
- [x] **Ferry ops** — Line crew semanal + allowance NPC + overflow na home do piloto
- [x] **Line crew allowance retune** — piso 4, 2×parked, cap 16 (2026-09-20)
- [ ] **Line crew tiers** Desk/Ops/Network — design in 16; not shipped
- [x] **My VA Config layout polish** — Hiring / Line crew / Invites / Danger
- [x] **Member progression** — gates + settle XP na home do piloto (não ladder da VA)
- [x] **One VA per account** — block join/request while already in a listed VA
- [ ] Buff concessão herdada no porto home da VA (member-aware)
- [ ] Buff concessão herdado por membros (Tier 1)