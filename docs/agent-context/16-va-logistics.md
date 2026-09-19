# VA logistics — air bridge + desk automation

Atualizado 2026-09-19. **IH-2 multi-piloto shipped** — invite/roster (cap 8), board Internal Haul, settle fee-to-operator, ranking 7d. Sem chat/crew. Spec abaixo + [24-port-fbo.md](./24-port-fbo.md).
**IH-1** pay + Port FBO desk auto-buy (VA Fase 1 solo) intactos. Loops A/B + tiers 1–3 **decididos**.
Relacionado: [15-business-model.md](./15-business-model.md), [14-mp-world-clock.md](./14-mp-world-clock.md), Ports/WH em `08-economy.md` + roadmap.

## Fantasia (uma frase)

VA (ou company solo) compra barato no porto → guarda no WH → **ponte aérea WH→WH** → realiza no Demand do destino. Desk pode ser humano ou **automação paga/comodidade** (nunca pay-to-win de mercado).

**Port XL / T4 (solo+VA):** WH **T4 Port Bonded** (45 t) só em pickup hubs fecha a fantasia oceânica → tronco; saída gorda = **Wide haul** a partir do WH (não Demand 90 t). Market XL enviesado em origins de porto. Ver [`23-port-xl-warehouse.md`](./23-port-xl-warehouse.md).

**Port FBO (solo first):** Phase 0–10 shipped — chão desk + Scout (bridge+Demand+Haul) + Port shuttle; Base = perks; **1ª Base free**; **Base Dispatcher seat** + fleet Market scout (single-leg). Spec: [`24-port-fbo.md`](./24-port-fbo.md).

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
**Fix:** `va_listed` (SQLite **v13** / PG **v23**). Sidebar **VAs** (cards) / **My VA** (roster) / **Ranking**. Publish em **Company → Become a VA**. Directory só `va_listed`.

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

## Checklist quando for implementar

- [x] InternalHaul pay (IH-1)
- [ ] UI surplus/tight por commodity no Ports / região
- [x] Fase 1 auto-buy
- [x] Fase 2 scout
- [x] IH-2 members + board interno + ranking 7d
- [ ] Fase 3 / IH-3: só com VA; caps AI vs humano Dispatcher
- [x] Testes IH-1 + VA invite/cap/cross-pay/ranking
