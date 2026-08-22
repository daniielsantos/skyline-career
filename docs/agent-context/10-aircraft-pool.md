# Aircraft instance pool

Decisões travadas 2026-08-19. **F0–F6 shipped** in `@msfs-compat/shared`. F7 MP not yet. Saves: **wipe** recommended; pool lives on `world.aircraftInstances` in economy blob.

Código hoje: `career-aircraft-market.ts`, `career-aircraft-registration.ts`, `career-partition.ts`, `career-player-airframes.ts`.

---

## Regras travadas

**Instância** — cada avião tem `instanceId`, `airframeTypeId`, `registration` única no mundo, condition/horas, `locationIcao`, `owner` (dealer | player | npc).

**Cap por país** — `fator = clamp(hubs / 62, 0, 1.5)` (62 = BR histórico, **não** hubs atuais do BR). Sub-região (`BR-SE`) = localização, não cap.

**Cota igual por modelo (classe)** — slots da classe no mundo (e extras no país) repartidos **round-robin** entre SKUs `enabled`. C172 ≈ Duke em **contagem global**. Sem peso de popularidade.

**Piso / cota global por SKU (travado 2026-08-20)** — todo airframe `enabled` tem pelo menos `CLASS_GLOBAL_MIN_PER_SKU` instâncias no planeta (hoje: leves **1**, medium **2**, narrow/wide **3**). Se a soma dos caps de país for menor, o seed **infla** slots e espalha o overflow pelos países elegíveis. `ensureDealerSkuFloor` backfill em saves antigos sem wipe. Instâncias `sold` contam no piso (compra não respawna sozinha; restock = trade-in).

**Cobertura local (país grande)** — `hubCount >= floor(62×0.95)` **or** factor at POOL cap → **1 de cada** enabled SKU in that class (GA/TP/jet). BR (~60 hubs) qualifies.

**Heavies** — não forçar 16 narrow no BR. Cap por país continua pequeno; **mundo** garante 1 de cada SKU + cota igual no que sobrar.

**Âncora de classe (fator 1.0), depois `max(round(âncora×fator), cobertura)` nas leves:**

| Classe | Âncora | BR efetivo (1-de-cada) |
|--------|--------|-------------------------|
| GA | 12 | **~20** (incl. Titan + Corvalis; teste cap pode estar desatualizado em 18) |
| TP | 6 | **~17** (incl. ATR 42/72) |
| Light jet | 5 | **9** |
| Medium | 3 | 3 (2 SKUs + extra na fila) |
| Narrow | 2 | 2 |
| Wide | 1 | 1 |
| **BR total** | | **~48** |

Gates: TP ≥3 hubs; jet fator ≥0.35; medium ≥0.40; narrow ≥0.50; wide ≥0.80. Piso: 1 GA se o país tem ≥1 hub.

Novo SKU `enabled` sobe o piso de cobertura nos países grandes e dilui um pouco a cota mundial (mesmo total de slots ÷ mais modelos).

---

## Homologação / catálogo (novos aviões)

Fonte da verdade do SKU: `packages/shared/src/data/career-player-airframes.json` via wizard/agent (`career-player-airframe-catalog.ts`). Pool **nunca** hardcodeia lista de modelos — sempre `listCareerPlayerAirframes()` (só `enabled !== false`).

**Novo airframe homologado** (`typeId` novo ou re-`enabled`):

1. Wizard upsert no JSON (`aircraftClassId`, label, roles pack, perf…).
2. No próximo **load do mundo** ou tick de sync (`ensureAircraftPoolCatalogSync` + `ensureDealerSkuFloor`): detectar SKUs enabled **sem** nenhuma instância no mundo.
3. **Backfill incremental** (não regerar o mundo, não apagar instâncias existentes):
   - País grande (cap classe ≥ skuCount): **+1 instância dealer** desse `typeId` no país (BR, US, …).
   - Mundo: **piso ≥1** por SKU no maior país elegível da classe; extras seguem cota igual.
   - Matrícula nova (`career-aircraft-registration`), condition/horas roll, `basedIcao` no país (espalhamento regional).
4. Board passa a mostrar o modelo **sem wipe de save**.

**SKU desabilitado** (`enabled: false` ou removido do JSON):

- **Não** spawnar / restock novos.
- Instâncias **dealer** existentes: deixar vender até acabar (ou expirar listing); não repor após trade-in.
- **Frota player** + listings `player_sale` / `player_lease`: mantém; `findCareerPlayerAirframe` ainda resolve owned.
- Listings **generated** órfãos: limpar no sync (mesma ideia do `staleDisabledAirframe` de hoje).

**Renomear label / atualizar perf** — não mexe no pool; instâncias guardam `airframeTypeId`.

**Novo SKU dilui cota?** Política travada: **não rebalancear** instâncias já no mundo (sem delete). Só **adicionar** o mínimo (1 por país grande + parcela global se abaixo da cota igual). Opcional depois: extras round-robin só em **novos** slots de cap quando o mapa crescer.

**Versão de catálogo:** hash ordenado de `{typeId, enabled, aircraftClassId}` em `economy_meta` ou world row; se mudou → roda sync uma vez. Desktop: rebuild/restart carrega JSON novo (igual hoje).

**Alias / remigração (2026-08-21):** se o pool ainda tiver typeIds de vidro (ex. `microsoft-atr-72-600-highline-03`), `ensureAircraftPoolCatalogSync` chama `remigratePoolAirframeTypeIds` → SKU de família. `instanceToListing` emite `airframe.typeId` + `label` do catálogo. Sem isso o card mostra silhouette + typeId em UPPERCASE.

**Testes F0+:** homologar GA fictício `enabled` → sync adiciona 1 no BR sem alterar contagem de C172 existente; `enabled: false` → restock off, owned intacto.

---

| | Listar | Dealer |
|--|--------|--------|
| Cash | Na compra (NPC/MP) | **50% fair** na hora |
| Instância | Mesma matrícula no board | Some; restock **outro** do mesmo SKU no **mesmo país** |
| Expire (7d) | Volta parked | — |

UI: fair / dealer 50% / ask. Ask clamp ~0.5–2.0× fair.

**NPC compra listing (Option B, travado)** — cash = ask do player; **mesma** instância (matrícula/horas) vai para **dealer pool** do país e volta ao Market. **Não** vira frota NPC permanente. **Não** restock +1 extra (cap estável). Chance por ask÷fair (≤0.9 alto … ≥1.2 quase 0). Min **1 dia** no board antes do NPC olhar.

**Lease out** — player escolhe `weeklyUsd` (campo legacy `monthlyUsd`) + `termMonths` 1–3 (listagem 0.6–1.8× catálogo). NPC só aceita faixa ~0.7–1.3× + termo 1–3. Cobrança / renda **semanal**. Depósito **4 semanas**. Delay 1–4 dias. 1 listing lease player por vez. Expire → parked.

**NPC** — compra/lease de **player listing** por preço vs `fairValue`. Dealer stock gerado não some no mesmo loop.

**Spawn** — espalhar slots do país pelos hubs (SE mais, Norte não zero). Restock perto de onde vendeu.

**Board SP** — default país do save. Filtro região / near me depois. Importar outro país + ferry = fase posterior.

---

## Roadmap (fatias)

Não misturar MP, ferry internacional e lease flexível na primeira fatia. Playtest no BR após F1+F2.

### F0 — Contrato + testes de alocação (sem UI) ✅

- `career-aircraft-pool.ts`: cap, seed, catalog sync, instance→listing.
- Tests: `career-aircraft-pool.test.ts`.

### F1 — Seed + Market lê o pool (SP) ✅

- `ensureWorldAircraftPool` on first `ensureAircraftMarket`; instances on `world.aircraftInstances`.
- Board = dealer instances **do país do save** + player listings; **no** daily `generateAircraftMarketListings`.
- Buy/lease marks instance `sold`; NPC demand **player listings only**.
- `migrateEconomyWorld` preserves `aircraftInstances` / catalog hash.

**Done when:** mundo novo, Market BR mostra 1 de cada GA/TP/jet, comprar tira **essa** unidade do board.

### F2 — Venda split (50% vs listar) ✅

- `sellPlayerAircraft` = dealer **50%** fair; restock same SKU/country (`restockDealerAirframe`), delay 0–2 days (`availableAtTick`).
- `listAircraftForSale` = player ask (0.5–2.0× fair); aircraft stays `listed`; no cash.
- Expire 7d / unlist → parked. Hangar: **List on Market** + **Dealer · $**.
- NPC demand ignores `player_sale` until F3.

**Done when:** trade-in some a matrícula e nasce outro do modelo; listar não paga na hora.

### F3 — NPC compra listing (Option B) ✅

- Score: ask vs fair (≤0.9 alto, ~1.0 médio, ≥1.2 quase 0). Min 1 dia no board.
- NPC compra → cash seller; **same** airframe → dealer pool (registration/hours intact). No NPC fleet, no +1 restock.
- Lease listings still use lease-out path separately.

**Done when:** listing a ~fair some em poucos dias; listing 1.5× fair fica até expirar.

### F4 — Lease flexível ✅

- Player lists `monthlyUsd` (0.6–1.8× catalog) + `termMonths` (1–24). Deposit = 2× monthly.
- NPC only takes 0.7–1.3× monthly and 3–18 months; needs idle same-class lessee.
- Hangar dialog: monthly + term.

**Done when:** listar $ e meses; NPC recusa absurdo; aceite gera deposit + monthly.

### F5 — Geografia no board ✅

- Seed: first GA per country covers each sub-region; remaining/restock weighted by `sqrt(hubs)` so SE is larger but North is not zero.
- Board filters: country / this region / near me (400 nm).
- Optional browse of another country’s dealer stock, or **Worldwide** (all dealer pool instances).
- Country picker: full English names + type-to-filter combobox.

**Done when:** player no Norte vê GA seeded fora do SE (BR-N gets ≥1 GA).

### F6 — Import / ferry ✅

- Buy **or lease** foreign dealer stock: aircraft stays at `basedIcao`, or tick **Import to home** (fee = $/nm × class + handling, cap 45k).
- Ledger `aircraft_import`. At lease **term end** or **early return**, ferry fee if airframe is not at `lease.startIcao`.
- Self-ferry from Hangar unchanged for owned airframes abroad.

**Done when:** BR player browses CL, buys C172 abroad or imports to home hub.

### F7 — Multiplayer (depois de SP estável)

- Mesma tabela, server-authoritative, `SELECT FOR UPDATE`, unique `registration`.
- Buyer humano no lugar (ou além) do NPC.

---

## Fora de escopo até pedido

- Migrate de saves antigos.
- Popularidade por modelo.
- Cap por `BR-SE`.
- Retune Dry / CARGO_FLOW_BALANCE.
- Dealer 50% **e** o mesmo casco continuar no board.

## Ordem de código sugerida

`F0 → F1 → F2 → F3` (loop jogável de compra/venda). `F4` em seguida. `F5` geography. `F6` import. `F7` depois de playtest BR.
