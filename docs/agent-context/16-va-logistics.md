# VA logistics — air bridge + desk automation

Atualizado 2026-08-30. **Esboço de produto** — loops A/B + tiers 1–3 **decididos** na revisão ponto a ponto; não implementar schema/members/billing até existir slice MP/VA.
Relacionado: [15-business-model.md](./15-business-model.md), [14-mp-world-clock.md](./14-mp-world-clock.md), Ports/WH em `08-economy.md` + roadmap.

## Fantasia (uma frase)

VA (ou company solo) compra barato no porto → guarda no WH → **ponte aérea WH→WH** → realiza no Demand do destino. Desk pode ser humano ou **automação paga/comodidade** (nunca pay-to-win de mercado).

**Port XL / T4 (solo+VA):** WH **T4 Port Bonded** (45 t) só em pickup hubs fecha a fantasia oceânica → tronco; saída gorda = **Wide haul** a partir do WH (não Demand 90 t). Market XL enviesado em origins de porto. Ver [`23-port-xl-warehouse.md`](./23-port-xl-warehouse.md).

## Loops de economia

### A) Ponte aérea WH → WH — **DECIDIDO · Tier 1**

1. Buy no porto origem → WH A  
2. Owner/Dispatcher cria **Internal Haul**: WH A → WH B, commodity, kg, pay interno (wallet da company)  
3. Pilot aceita → voa → settle credita WH B + paga o pilot  
4. Em B: Demand local (ou guarda stock)

Reusa missões / Watch / settle / WH. **Não** exige vender no porto. Solo pode ser Owner+Pilot no mesmo haul.

**Pay do haul — DECIDIDO (híbrido):**
- Sistema **sugere** pay (distância × kg × taxa + floor &gt; 0)
- Dispatcher ajusta **dentro de banda** (ex. 80–150% do sugerido)
- Debita **wallet da company/VA**; credita o **pilot** no settle
- Solo Owner+Pilot: accounting interno (custo real = ops/fuel/tempo)

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

**Status:** fechada como MVP de automação.

| | |
|--|--|
| **O que** | Ordem persistente: commodity, porto (ou “home concession”), **max $/kg**, **max kg/dia**, WH destino, pause se wallet &lt; X |
| **Quando age** | No tick / quando listing spawna — mesma resolução que buy manual |
| **Staff** | Estender `procurement` **ou** hire dedicado `buyer`; salary in-game; grade afeta só confiabilidade / mild buff já existente — **não** preço mágico extra |
| **Solo** | Manual sempre disponível e completo |
| **Monetização** | Hire in-game primeiro; IAP/VA desk seat só depois (mais ordens / multi-porto) |
| **Não faz** | Comprar acima do max price; furar cap diário; pular fila de outros buyers no mesmo tick |

### Fase 2 — Scout sugere pontes

**Status:** fechada; depende de A (internal haul) + sinais B (surplus/deficit).

| | |
|--|--|
| **O que** | Desk lista oportunidades: “WH A → WH B · machinery · spread ~+X% · kg disponível” |
| **Ação** | Player / Dispatcher humano **confirma** → cria Internal Haul (não auto-cria nesta fase) |
| **Staff** | Novo perk/role `scout` (não misturar com `demand_desk`) |
| **Caps** | N sugestões/dia; spread mínimo configurável; ignora rotas sem WH B / sem capacidade |
| **Monetização** | Hire in-game; VA tools / seat = mais filtros, multi-região |
| **Não faz** | Criar haul sozinho; reservar stock sem confirmação; priorizar lots NPC do board público |

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

- Schema `members` / invites / billing  
- Bolsa P2P de commodities  
- Dual currency no porto  
- Fase C (porto→porto) — **CAI**; revenda = Demand
- AI pilot voando a ponte  

## Checklist quando for implementar

- [ ] `InternalHaul` como missão company-scoped (settle: WH A −kg → WH B +kg + payout pilot)  
- [ ] UI surplus/tight por commodity no Ports / região  
- [ ] Fase 1: tabela/ordens auto-buy + tick executor  
- [ ] Fase 2: scout report → confirm → haul  
- [ ] Fase 3: só com VA; caps AI vs humano Dispatcher  
- [ ] Testes: auto não compra acima do max; dois buyers no mesmo tick justos  
