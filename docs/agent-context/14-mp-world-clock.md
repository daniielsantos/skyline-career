# MP world clock — esboço server/client

Atualizado 2026-09-13. **Não é spec de implementação** — contrato alvo para quando MP existir.
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

## WorldTickService (esboço de código)

Contrato TypeScript (shared):

- `packages/shared/src/career-world-tick-service.ts` — interface + helpers
  `worldClockFromEconomy`, `catchUpProgressFromEconomy`
- `packages/career-ui/server/local-world-tick-service.ts` — SP impl (**wired** em `createCareerApiServer`)

### Interface resumida

```typescript
interface WorldTickService {
  mode: 'sp-local' | 'mp-remote';
  getClock(worldId): Promise<WorldClockSnapshot>;
  advance(worldId, { n?, cooperative? }): Promise<WorldTickAdvanceResult>; // MP client: proibido
  getCatchUpProgress(worldId): Promise<WorldCatchUpProgress | null>; // SP only
  startBackgroundPulse(worldId): void; // SP timer; MP server cron
  stopBackgroundPulse(): void;
  openCompanySession({ companyId, lastSeenTick }): Promise<CompanySessionOpenResult>;
}
```

### Wiring SP (feito)

1. `createCareerApiServer` instancia `LocalWorldTickService` com deps (`runCatchUpWrite`, `beforeAdvance`, …).
2. `schedulePostLoginEconomyWork(worldTick)` → `startBackgroundPulse('local')`; clear/delete para o pulse.
3. `/api/state`: `worldTick.getCatchUpProgress` + `clockPayload` via `worldClockFromEconomy` (`nextPulseAtMs`).
4. GETs mantêm `skipCatchUp: true`.
5. **`lastSeenTick`** em `company_state` + `settleCompanyPassiveFeesForTickRange` após cada catch-up chunk (`applyCompanySessionSettlement`).

### Wiring SP (próximo)

1. ~~MP stub `RemoteWorldTickService` + SP HTTP clock/session~~ — Phase 1 shipped.
2. ~~Phase 2 headless pulse~~ — shipped (boot resume + `/api/world/pulse`).
3. ~~Phase 3 company registry + shared world_id~~ — shipped 2026-09-13 (no OAuth).
4. ~~Phase 4 remote client clock~~ — shipped 2026-09-13 (`CAREER_WORLD_TICK=remote`).
5. Hosted Postgres / multi-process world job — later.

## Phase 2 notes (2026-09-13)

- On `createCareerApiServer().listen()`, `bootstrapHeadlessWorldPulse` opens `profiles.json` **activeId** (last-played) and starts `LocalWorldTickService` pulse — world advances with **no browser/UI**.
- Opt out: `CAREER_HEADLESS_PULSE=0` (or `false` / `off`).
- `POST /api/world/pulse` `{ n?: 1..96 }` — explicit advance for ops/debug (needs profile loaded).
- Still one company per SP save DB; true shared world DB without a company session remains Phase 3.

## Phase 3 notes (2026-09-13)

- `packages/shared/src/career-companies.ts` — `ensureCompany` / `listCompaniesForWorld` / `resolveCompanyId` (no OAuth; caller supplies ids).
- Store: `getActiveCompanyId` / `setActiveCompanyId`; `loadMissions`/`saveMissions`/`ledger` take optional `companyId` (legacy `missions_json` stub only for `local`).
- Pulse catch-up: `applyCompanySessionSettlement({ allCompanies: true })` → `settleWorldCompaniesPassiveFees` bills every company on the world.
- HTTP: `GET|POST /api/companies`; Accept + session/open honor `X-Skyline-Company-Id` or body `companyId`.
- Dual-company Accept conflict covered in `career-companies.test.ts`.
- Auth/OAuth still non-goal; Phase 4 is remote client clock.

## Phase 4 notes (2026-09-13)

- `RemoteWorldTickService` live: fetches clock/session from host; `advance` throws; `getCatchUpProgress` always `null`.
- Env: `CAREER_WORLD_TICK=remote` + `CAREER_REMOTE_WORLD_URL=http://host:8787` (optional `CAREER_REMOTE_WORLD_PATH_STYLE=api|worlds`, `CAREER_REMOTE_COMPANY_ID`).
- Path styles: `api` → `/api/world/clock` + `/api/companies/session/open`; `worlds` → sketch paths.
- Host also serves aliases `GET /worlds/:worldId/clock` and `POST /companies/:companyId/session/open`.
- Remote client: no headless advance; `withCareerWrite` forces `skipCatchUp`; `POST /api/world/pulse` and `POST /api/tick` → **403** `client_cannot_advance`; background pulse only polls clock.
- SP default unchanged (`CAREER_WORLD_TICK` unset / `local`).

### MP client stub

```typescript
class RemoteWorldTickService implements WorldTickService {
  mode = 'mp-remote' as const;
  async getClock(worldId) { return fetch(`/api/world/clock?worldId=…`).then(r => r.json()); }
  async advance() { throw new Error('MP client cannot advance world'); }
  getCatchUpProgress() { return null; }
  startBackgroundPulse() { /* poll getClock on interval */ }
  stopBackgroundPulse() {}
  openCompanySession(opts) { return fetch(`/api/companies/session/open`, …); }
}
```

## Migração SP → MP (incremental)

**Contrato:** SP e MP usam o **mesmo** molde. SP = `N=1` company (`local`) no `world_id=local`. MP = N companies no mesmo world. Não manter dois simuladores.

| Phase | Status | O quê |
|-------|--------|-------|
| **0** | shipped | `WorldTickService` + `LocalWorldTickService`; pulse/login; `lastSeenTick` + offline fees; command slices; soft-hold L2+ |
| **1** | shipped 2026-09-13 | `claimedByCompanyId` on lots; Accept → `409 lot_claimed`; `GET /api/world/clock`; `POST /api/companies/session/open`; `RemoteWorldTickService` stub (client never `advance`) |
| **2** | shipped 2026-09-13 | Headless pulse: API `listen` resumes last-played profile + starts tick with **zero UI clients**; `POST /api/world/pulse`; opt-out `CAREER_HEADLESS_PULSE=0` |
| **3** | shipped 2026-09-13 | Company registry (`career-companies.ts`); N companies / `world_id`; store load/save/ledger scoped by `companyId`; Accept via `X-Skyline-Company-Id` / body; `GET|POST /api/companies`; pulse settle-all |
| **4** | shipped 2026-09-13 | Live `RemoteWorldTickService`; `CAREER_WORLD_TICK=remote` + `CAREER_REMOTE_WORLD_URL`; client never advances / never local catch-up; MP path aliases `/worlds/:id/clock` + `/companies/:id/session/open` |

1. ~~**Extrair** `WorldTickService`~~ — feito.
2. ~~SP local pulse via service~~ — feito.
3. Client reads `skipCatchUp: true` on GETs — feito; único catch-up no `WorldTickService`.
4. Persist: `economy_meta.lastBatchAtMs` — feito.
5. Postgres / leader cron por world — Phase 2+.

## Phase 1 notes (2026-09-13)

- `ShipmentLot.claimedByCompanyId` + SQL `lots.claimed_by_company_id` roundtrip.
- `reserveShipmentLot(..., { companyId })` / soft-hold stamps claim; full release clears.
- `executeAcceptLot` → `{ kind: 'conflict' }` → HTTP **409** `{ code: 'lot_claimed' }`.
- SP clock/session HTTP mirrors the MP sketch (`/api/world/clock`, `/api/companies/session/open`).
- `packages/career-ui/server/remote-world-tick-service.ts` — stub only.

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
| `WorldTickService` / `LocalWorldTickService` | `career-world-tick-service.ts`, `local-world-tick-service.ts` |
| Offline fee cap | `packages/shared/src/career-offline-fees.ts` |
| Crew hold wall-clock | `packages/shared/src/career-npc.ts` (`AWAITING_PILOT_*_HOURS`) |

## Checklist antes de shippar MP slice

- [x] `WorldTickService` / Local pulse (Phase 0)
- [x] Lot claim + Accept 409 (Phase 1)
- [x] Clock + company session HTTP mold (Phase 1)
- [x] World tick roda com zero clients conectados (Phase 2 — last-played profile resumed on API listen)
- [x] Company registry + N tenants / shared `world_id` (Phase 3 — no OAuth)
- [x] Remote client never advances / never local catch-up (Phase 4)
- [ ] Dois clients veem o mesmo `tick` + mesmo lot id desaparecer após accept (hosted dual-UI)
- [x] Reconnect não chama `tickEconomyN` no processo UI remoto (Phase 4)
- [x] Accept concorrente → exatamente um 200, resto 409 (Phase 3 unit + claim path; live dual-client later)
- [x] `offlineFeeSummary` usa delta de **world.tick** (Phase 0)
- [x] Admin/debug tick isolado de client remoto (`POST /api/world/pulse` + `/api/tick` → 403 on mp-remote)
