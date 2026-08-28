# MP world clock — esboço server/client

Atualizado 2026-08-28. **Não é spec de implementação** — contrato alvo para quando MP existir.
Complementa: [08-economy.md](./08-economy.md), [11-persist-commands.md](./11-persist-commands.md),
`.cursor/rules/career-economy-roadmap.mdc` (*Company tenant contract*).

## Problema (SP hoje)

- Tick de economia (`world.tick`, batch **15 min** real) roda **no processo local** do Career API.
- Catch-up no load: `MAX_LOAD_CATCH_UP_TICKS = 1` (`packages/shared/src/career-clock.ts`).
- Timer ~60s com `catchUp: true` avança mais 1 tick/min **só enquanto a API está aberta**.
- Jogador offline / PC off → mundo **não** avança na mesma velocidade que o relógio real.
- Sintoma: board vazio depois de dormir; log `[career] catch-up capped at 1/37 ticks`.

Isso é aceitável em SP/dev. Em MP é inaceitável: competição exige **um relógio autoritativo por world**.

## Princípio MP

| | SP (hoje) | MP (alvo) |
|--|-----------|-----------|
| Quem simula o world | Cliente local (Career API) | **Server** (job por `world_id`) |
| Catch-up | Por sessão / load | **Nenhum** no client |
| Board / lots | Hidratado após catch-up local | **Snapshot** do server |
| Writes do jogador | Comandos locais | **Comandos** validados + idempotentes |
| Offline | Economia pausa (parcial) | Mundo **24/7**; company faz settlement no login |

**Manter** ticks discretos. **Eliminar** simulação de world no client.

## Dois relógios (centralizados no server)

Ambos já existem nas regras; MP só unifica a fonte da verdade.

### 1. Economy tick (`world.tick`)

- **1 tick = 15 min** wall (`MS_PER_TICK`, `TICKS_PER_DAY = 96`).
- Avança: `formLots`, NPC bids, idle pay, Demand TTL (48/72/96 ticks), port discharge,
  fuel haul batch, weather index, etc.
- **Único writer:** `tickEconomyN` / `tickEconomyCooperative` no server job.
- Persistir após cada pulse: `economy_meta.lastBatchAtMs`, `world.tick`, slices SQL (lots/NPC/stock).

### 2. Wall-clock (`nowMs` autoritativo)

- Crew hold `awaiting_pilot` (3–8 h freight; 0.5–1.5 h ferry).
- Crew rest / MX wall timers.
- Expiry de ofertas de lease/dealer quando aplicável.
- **Não** reimplementar no client: server compara `serverNowMs` vs `flight.awaitingPilotUntilMs`
  em `promoteAwaitingPilotsDue` no mesmo job (ou sub-step contínuo entre ticks).

```
┌─────────────────────────────────────────────────────────┐
│  World server (por world_id)                            │
│                                                         │
│  cron every 15m ──► tickEconomyCooperative(world, 1)    │
│       │                                                 │
│       ├──► settleNpcOpsDue / promoteAwaitingPilotsDue   │
│       │         (uses serverNowMs)                      │
│       └──► persist world slice                          │
│                                                         │
│  on company login ──► settleCompanyOfflineFees(         │
│                         company, world.tick delta)      │
└─────────────────────────────────────────────────────────┘
         ▲                              │
         │ GET /world/state             │ POST /commands/*
         │                              ▼
┌────────────────┐              ┌────────────────┐
│  Client UI     │              │  company row   │
│  (read-only    │              │  wallet/fleet/ │
│   sim state)   │              │  missions      │
└────────────────┘              └────────────────┘
```

## Contrato server

### World pulse job

- **Input:** `world_id`, optional `n` (default 1; cap diário para recovery ops).
- **Lock:** world lock exclusivo (mesmo conceito de [11-persist-commands.md](./11-persist-commands.md)).
- **Idempotente por batch boundary:** gravar `lastBatchAtMs` só após tick completo.
- **Recovery:** se server caiu 6 h, job de startup pode rodar `tickEconomyN` com cap
  `MAX_CATCH_UP_TICKS` (14 dias) — **só no server**, nunca no client.
- **Cooperative:** manter `setImmediate` entre países; MP não muda a regra, só o host.

### Company settlement (login / reconnect)

- **Não** simular ticks no client.
- Calcular `fromTick` / `toTick` = world atual vs último visto da company (`company.lastSeenTick`
  ou ledger watermark).
- Cobrar hangar / WH / salaries / lease soft-cap (mesmas regras de `career-offline-fees.ts`).
- Retornar `offlineFeeSummary` uma vez (banner UI) — já existe o hook em `/api/state`.

### Comandos (writes)

Reutilizar molde de [11-persist-commands.md](./11-persist-commands.md):

| Comando | Locks | Notas MP |
|---------|-------|----------|
| `AcceptLot` / `AcceptCrewOffer` | world → company | claim atômico; `409` se lot já `claimed_by_company_id` |
| `SettleFlight` | world (dest stock) + company | idempotente por `missionId` |
| `DispatchMission` | company | sem tick |
| `DemandHold` / `FlyNow` | world + company | TTL em ticks do **world atual** |

**Regra:** cliente envia intenção + `clientCommandId` (UUID); server valida contra **world.tick
e stock/lot no instante**.

## Contrato client

### O client **pode**

- Poll / SSE / WebSocket: `world.tick`, `continuousHours`, `nextPulseAtMs`, board pages.
- Enviar comandos; mostrar `409 Conflict` como “alguém pegou antes”.
- Exibir chips de mercado (`thin fleet`, `idle +12%`, `URGENT`) — derivados do snapshot server.

### O client **não pode**

- Chamar `tickEconomyN` localmente (remover timer 60s + `MAX_LOAD_CATCH_UP_TICKS` em build MP).
- Inferir stock/lot após accept sem confirmar resposta server.
- Avançar `awaiting_pilot` / NPC solo por conta própria.

### UI sugerida (transparência)

- Header: `Day N · HH:MM · World tick #12345`
- Chip: `Next market pulse · 8m` (derivado de `lastBatchAtMs + MS_PER_TICK - now`)
- Reconnect banner: “While you were away: world +37 ticks · fees $X” (não “catch-up 1/37”).

## API sketch (futuro)

```
GET  /worlds/:worldId/clock
     → { tick, continuousHours, lastBatchAtMs, nextPulseAtMs, serverNowMs }

GET  /worlds/:worldId/market?crew=…&page=…
     → board paginado (mesmos filtros de market-board-query; sem sim local)

POST /worlds/:worldId/commands/accept-lot
     { companyId, lotId, clientCommandId, … }

POST /companies/:companyId/session/open
     → { worldClock, offlineFeeSummary?, fleet, wallet, … }
```

SP local pode continuar mapeando isso para `127.0.0.1:8787` com `world_id = 'local'`.

## Fairness / edge cases

| Tema | Diretriz |
|------|----------|
| Sniping no boundary | Accept é transação SQL; primeiro commit ganha; ETag/`lot.version` opcional |
| Company nova no world maduro | Entra em board quente; piso crew starter por `homeCountryId` (+4/company, máx 40) |
| World Day 1 frio | Warm global: `ensureSeedMarketFormed` no **seed do world**, não por player |
| Região vazia | Shards ou “active regions” no job — fora de escopo v1; documentar depois |
| Debug time skip | `POST /api/tick` **só** admin/server; nunca client MP |
| Watch / SimBridge | Inalterado: physics local; settle é comando para server |

## Migração SP → MP (incremental)

1. **Extrair** `WorldTickService` interface: `advance(worldId, n)`, `getClock(worldId)`.
2. SP: implementação local = job 60s **sem** cap 1/tick quando flag `authoritativeWorld=true`
   (opcional dev); ou manter cap 1 no load mas timer server-side equivalente.
3. Client reads passam `skipCatchUp: true` sempre; único catch-up no `WorldTickService`.
4. Persist: `economy_meta` já tem `lastBatchAtMs` — usar como anchor cross-instance.
5. Postgres: mesmo schema `world_id`; um leader election / cron por world.

## Deprecar em MP

- `MAX_LOAD_CATCH_UP_TICKS` no client load path
- Log `[career] catch-up capped at …` no client (substituir por metric server-side)
- “Economia só anda com UI aberta”
- `withCareerWrite(() => undefined, { catchUp: true })` no timer do `api.ts` local —
  mover para `WorldTickService`

## Non-goals (v1 MP clock)

- Sim tempo real contínuo (sem batches)
- Rewind / replay de world
- Per-player time dilation
- Múltiplos worlds por company (uma company → um `world_id`)
- Presença-only MP (“só vejo quem está online”) — north star continua company + shared world

## Referências no código

| Constante / função | Arquivo |
|--------------------|---------|
| `MS_PER_TICK`, `MAX_LOAD_CATCH_UP_TICKS` | `packages/shared/src/career-clock.ts` |
| `catchUpEconomyWallClock` | `packages/shared/src/career-economy.ts` |
| Timer 60s + `catchUp: true` | `packages/career-ui/server/api.ts` |
| `tickEconomyCooperative` | `packages/shared/src/career-economy.ts` |
| Offline fee cap | `packages/shared/src/career-offline-fees.ts` |
| Crew hold wall-clock | `packages/shared/src/career-npc.ts` (`AWAITING_PILOT_*_HOURS`) |

## Checklist antes de shippar MP slice

- [ ] World tick roda com zero clients conectados
- [ ] Dois clients veem o mesmo `tick` + mesmo lot id desaparecer após accept
- [ ] Reconnect não chama `tickEconomyN` no processo UI
- [ ] Accept concorrente → exatamente um 200, resto 409
- [ ] `offlineFeeSummary` usa delta de **world.tick**, não ticks simulados localmente
- [ ] Admin/debug tick isolado de build release MP
