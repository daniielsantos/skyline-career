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
5. ~~Phase 5 dual-tenant board/claim proof~~ — shipped 2026-09-13.
6. ~~Phase 6 client company context (dual-tab)~~ — shipped 2026-09-13.
7. ~~Phase 7 local Auth (account → company)~~ — shipped 2026-09-14 (`CAREER_AUTH=1`).
8. ~~Phase 8 fixed world (one shared SQL world; clients attach)~~ — shipped 2026-09-14 (`CAREER_WORLD_FIXED=1`).
9. Hosted Postgres lab — **shipped 2026-09-14** (`CAREER_PG=1` / tables + `career:world:pg` 24/7 worker). Schema **v15**: drops stub tables `economy_json` + `company_missions`; SoT = relational + `economy_meta.misc_json` / company tables. SP SQLite unchanged.

## Phase 8 notes (2026-09-14)

- **Product:** MP = **one world forever**. No “Create World” / multi-save on host or clients. SP keeps ProfileGate + `profiles.json` + `saves/<id>/`.
- **SoT:** `profiles/career/world/skyline.sqlite` — companies, lots, fleet, auth, clock all in **SQL tables**. No MP `profiles.json`. Env `CAREER_WORLD_FIXED` / `CAREER_AUTH` = process flags only.
- Host bootstrap (`bootstrapHeadlessWorldPulse`): `openCareerFixedWorldStore` → mkdir `world/` + open/create schema. Synthetic id `world`.
- Clients: skip ProfileGate; poll health until store open; Auth → company. Create/rename/delete/clear profile → **403** `world_fixed`.
- Company page: hide SAVE Rename/Delete when `worldFixed`. Settings: no Switch profile; Sign out re-prompts Auth only.
- SP `career:ui` unchanged (`worldFixed` off).
- **UX (same day):** hub picker after Auth reuses account display name — no second “Pilot name”; only home hub is required.
- **UX (same day):** Company chip read-only when Auth/fixed world (no dual-tab `+`/select). Topbar **World** = economy Day·HH:MM (primary) + label `next Ns` / `pulse due` from `lastBatchAtMs + MS_PER_TICK` (wall countdown). Not local timezone.
- **UX (same day):** Auth mode drops `?company=` from the URL — tenant lives in sessionStorage + `X-Skyline-Company-Id`. URL pin remains for non-Auth dual-tab lab only.

## Postgres lab (2026-09-14)

- **SP:** SQLite saves unchanged.
- **MP:** `CAREER_DATABASE_URL` or `CAREER_PG=1` → `PostgresCareerStore`.
- Docker: containers `skyline-career-postgres` + `skyline-career-adminer` (http://127.0.0.1:8081). Volume `skyline_career_pg_data`.
- **DB secrets (2026-09-14):** `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` + `CAREER_DATABASE_URL` live in root **`.env`** (gitignored); compose substitutes them (lab default still `skyline` if unset). Adminer login = those Postgres creds. Rotate password → update `.env` **and** alter role / recreate volume (init only runs once).
- Run: `docker compose up -d` then `npm run career:host:pg` + `npm run career:client`.
- **PG world tables (wired):** `career-store-pg-world.ts` — hot slices (`lots` / `airports` / `airport_stock` / `inbound_pending` / `economy_meta`) + company (`company_state` / `fleet_aircraft` / `missions` / `ledger`) + world-ops (`npc_flights` / `economy_events` / `npcs` / `fuel_*` / `demand_orders` / `port_*`) + dealer pool (`aircraft_instances`) + charter (`charter_demand` / `charter_hubs` / `charter_offers`). Schema **v16**: `fleet_aircraft` promotes registration / hours / condition % / config / lease flags out of `payload_json` (backfill on open). Schema **v15**: economy SoT = relational tables + `economy_meta.misc_json`; stub tables `economy_json` + `company_missions` dropped. SP SQLite mirrors fleet columns via `ensureV3Ddl` ALTERs. Load hydrates via `emptyPgEconomyShell` + tables; BIGINT wall-clock ms truncated on write.
- **PG light persists (2026-09-14):** `persistInboundPending` / `persistDemandBoardTables` / `persistDemandOrder` / `persistPortMarketTables` / `persistPortListing` / `persistPortConcessionIndex` / `persistNpcLiveWorld` / `persistAircraftPool` write only their tables (no full `saveEconomy`). `persistNpcLive` = clock + hubs/stock + lots + inbound + NPCs + dealer pool. Pulse `settleWorldCompaniesPassiveFees` exists on Postgres (awaited in `applyCompanySessionSettlement`).
- **PG smoke isolation:** prefer `CAREER_DATABASE_URL_TEST` or `CAREER_PG_TEST=1` → `skyline_test`; refuse mutating lab `skyline` unless `CAREER_PG_ALLOW_LAB_MUTATION=1`. Create DB once: `CREATE DATABASE skyline_test;` as role `skyline`.
- **24/7 world worker (lab):** `npm run career:world:pg` — `career-world-worker-pg.ts` economy catch-up with Postgres advisory lock `87201401`. Company settlement on login. Pair with `CAREER_HEADLESS_PULSE=0` on `career:host:pg`. `--once` for one-shot/tests.
- **Diag 2026-09-14 — Charter sort → blank/freeze:** GET `/api/charters` called `withCareerWrite` + `tickCharterEconomy` with default full economy persist on every sort/filter. On PG that blocked the career lock for seconds and starved the UI. Fix: `withCareerRead` only (charter tick stays on economy pulse). UI: `AppErrorBoundary` so render crashes show Reload, not a black root.
- **Diag 2026-09-14 — Buy/lease ~5s:** `persist: 'blob'` → double full `saveEconomy` on PG. Fix: `persist: 'aircraftMarket'` → `persistAircraftPool` + `saveMissions` only.
- **Sim local / world host (2026-09-14):** production split wired.
  - `CAREER_API_MODE=full` — SP/lab all-in-one (store + Watch).
  - `CAREER_API_MODE=world` / `CAREER_DISABLE_SIM=1` — VPS economy API; `/api/watch|preflight|load-ofp|simbridge` → **501** `sim_on_client`. Fixed world store still opens when `CAREER_HEADLESS_PULSE=0` (worker owns ticks).
  - `CAREER_API_MODE=gateway` + `CAREER_WORLD_API_URL` — desktop: sim routes + **static UI** local; only `/api/*` (exceto sim) e `/worlds/*` proxied to world (Bearer + company). `/` nunca vai ao world (evita JSON `auth_required` no Electron). Health gateway espelha `authRequired`/`worldFixed` do world. Watch settle/depart via HTTP; gateway enriches `/api/settle` com telemetry local.
  - **Local prod sim:** `npm run career:stack:world` → postgres + `world-api:8787` + `world-worker`. Desktop shell defaults to **:8788** (`CAREER_WORLD_API_URL=http://127.0.0.1:8787` for gateway). Se Electron reclamar de `cli.js` / install: o start usa `packages/desktop/run-electron.mjs` (não o `.bin` aninhado); sem `packages/desktop/package-lock.json`. World exige Auth → register/login no AuthGate.
  - **Desktop SP|MP (2026-09-14):** packaged app first run shows PlayModeGate (Single Player vs Multiplayer + World URL). Choice → `%APPDATA%\Skyline Career\career\desktop-play.json`; API child restart. Settings → Change play mode. Process env `CAREER_WORLD_API_URL` still forces MP (lab `npm start`). Files: `packages/desktop/desktop-play-config.mjs`, `PlayModeGate.tsx`.
  - **No SP ⟳ catch-up chip on world:** `CAREER_API_MODE=world` omits `catchUp` from `/api/state` (worker owns backlog). Topbar **pulse due** still means `nextPulseAtMs` is past — worker lag, not “stay in Career”.
  - Scripts: `career:host:world` (Node world on host), `career:stack:world` (Docker). Adminer `:8081` for lab only.
  - Do **not** give desktop a Postgres password — HTTP only.
## Phase 7 notes (2026-09-14)

- **Local Auth** (no OAuth yet): `accounts` / `account_sessions` / `company_members` (schema v10).
- Session token → account → owned companies. `Authorization: Bearer` on `api()`.
- **Session hygiene (2026-09-14):** login/register = **one live Bearer per account** (`revokeAll` then insert). Expired rows purged on create/resolve (`expires_at_ms <= now`). `GET /api/auth/sessions` (Bearer) defaults to **`scope=mine`**; `?scope=all` only when `CAREER_AUTH_SESSIONS_LIST_ALL=1` (lab presence). `online` if `last_seen` within `AUTH_ONLINE_WINDOW_MS` (5 min). Response exposes `tokenHashPrefix` only (not the Bearer).
- **Auth rate limit (2026-09-14):** login/register share an in-memory per-IP sliding window (**20 / 15 min**); over → `429` `auth_rate_limited` + `Retry-After`. Not distributed across replicas.
- Env: `CAREER_AUTH=1` enforces; **host mode defaults on** (`dev.mjs --host`). SP `career:ui` stays off.
- HTTP: `GET /api/auth/status`, `POST /api/auth/register|login|logout`, `GET /api/auth/me`, `GET /api/auth/sessions`.
- Register creates company `co_<login>` + owner membership. Claim orphan via `claimCompanyId`.
- When required: company id cannot spoof rivals; `GET /api/companies` returns owned only; AuthGate after profile select.
- Chip `?company=` still works **within** owned set. OAuth later plugs into same membership table.
- Files: `packages/shared/src/career-auth.ts`, `career-store-v10.ts`; UI `AuthGate.tsx` + `career-auth-client.ts`; rate limit `server/auth-rate-limit.ts`.
- **UX (same day):** AuthGate form stacked (`auth-gate-form` + `pilot-field`) — bare labels were inline-wrapping.
- **UX (same day):** Profile gate shows **Sign out / another account** when a Bearer token is still in the tab — otherwise Continue skips AuthGate (looks like “cadastro sumiu”).
- **UX (same day):** Ctrl+R on AuthGate no longer flashes Freights / “Loading career…” — fixed-world boot keeps `profilesLoading` until Auth warm; stale Bearer cleared when `authenticated=false`; AuthGate renders before ProfileGate/main shell.
- **UX (same day):** After register, AuthGate stays until company `/api/state`; `hubSelected` starts false and main content waits on `careerStateReady` so Choose home hub is next (not Freights loading).
- **Product note:** SP = multi-save ProfileGate. MP = one forever world (`world/skyline.sqlite`) + Auth → company.

## Phase 6 notes (2026-09-13)

- Client company id: `?company=` (wins) + **sessionStorage** + in-memory chip sync — not `localStorage` (shared across tabs).
- Every `api()` call sends `X-Skyline-Company-Id` (`packages/career-ui/src/career-company-client.ts` + `api.ts`).
- Profile enter: `GET /api/companies` → ensure URL company exists → `POST /api/companies/session/open` → refresh.
- Topbar company select + **+** (new empty tenant); switch → updates `?company=` + session/open + full refresh.
- Host: `/api/state`, `/api/missions`, `/api/fleet`, `/api/hubs`, `/api/cashflow` load with per-request `companyId` (same mold as market/accept).
- **Fix (same day):** `/api/contract-pilot/options` + `/api/contract-pilot/accept` also take per-request `companyId` — without it, Labubu Accept saw Nothin’s active `msn_cp_*` (“Finish or cancel…”) via ambient `activeCompanyId`.
- **Fix (same day):** drop shared `localStorage` tenant — Tab A/B were thrashing each other’s header so Labubu painted Nothin’s Active Flight.
- **Validation (same day):** flight-loop host paths now take per-request `companyId`: cancel / dispatch / depart / settle / fuel / confirm-ofp / accept-ofp-cargo / preflight / load-ofp + `updateOpenMission`. Tests: `career-multitenant-isolation.test.ts`, `career-company-client.test.ts`.
- **Watch:** one `CareerWatchSession` per **desktop gateway** process (1 MSFS / 1 pipe). World host has no Watch (`CAREER_API_MODE=world`). Dual concurrent Watch on same PC is not a product goal.
- **Hangar/fleet (same day):** aircraft-market GET/buy/lease/sell/list/unlist/mx/repair/buyout/pay-lease/return-lease + select-hub + ferry-plan/ferry + empty-flight take per-request `companyId`.
- **Fix (same day):** `/api/airport/:icao` + `/api/fbo/*` used ambient `loadMissions()` → co_a Base tab flashed co_b’s “Need 2 owned aircraft for a second base” until ambient flipped; now header-scoped. UI clears `playerFbos`/airport on company switch.
- **Dual-tab playtest:** same profile/host; Tab A `?company=co_a`, Tab B `?company=co_b` (create via **+** or auto-ensure on first open). Accept on A → Freights on B omits lot; both clocks match.
- Default no/`local` → SP unchanged. No OAuth / Postgres / SSE.

### Multitenant checklist (human)

1. Open A `?company=co_a`, B `?company=co_b` (same save). Chips differ; URLs differ.
2. B must **not** show A’s Active Flight / wallet / fleet.
3. Accept Contract on A → offer gone on B.
4. Accept **other** Contract on B → succeeds (no “Finish or cancel msn of A”).
5. Cancel / Dispatch / Fuel on A only mutates A’s Dispatch.
6. Clocks match.
## Phase 5 notes (2026-09-13)

- Staging Freights path stamps/enforces claim: `commitStagedManifest` / `executeAcceptManifest` take `companyId`; `/api/staging/commit` → **409** `lot_claimed`.
- `listMarketLots({ viewerCompanyId })` hides lots claimed by another company (covers partial soft-hold remaining kg).
- Market / Accept / staging load-save take per-request `companyId` (header/body) so dual tenants do not thrash ambient `activeCompanyId`.
- Proof: `career-dual-tenant.test.ts` — same world tick, rival board omits lot, Accept/staging conflict.
- Still poll-only (no SSE); no polished dual-tab UI picker.

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
| **5** | shipped 2026-09-13 | Dual-tenant proof: staging claim + 409; market hides foreign `claimedByCompanyId`; per-request `companyId` on market/accept/staging; same tick + lot gone + conflict tests |
| **6** | shipped 2026-09-13 | Client company context: `X-Skyline-Company-Id` on every `api()`; `?company=` + localStorage; session/open on enter/switch; topbar switcher; state/missions/fleet scoped per request |
| **7** | shipped 2026-09-14 | Local Auth: account/session/members (schema v10); `CAREER_AUTH=1`; Bearer → owned company; AuthGate; host defaults on |
| **8** | shipped 2026-09-14 | Fixed world: `CAREER_WORLD_FIXED=1`; one `world/skyline.sqlite`; clients attach (no ProfileGate) |
| **B** | shipped 2026-09-13 | Dedicated host + client UIs: `career:host` / `career:client`; API bind `CAREER_UI_API_BIND`; Vite proxy `CAREER_UI_API_PROXY` |

## Phase B — dedicated host + clients (2026-09-13)

**Por quê:** dual-tab no mesmo Vite já prova sniping. “2 processos / 2 PCs” precisa de **um** Career API dono do save+tick; as UIs só falam com ele.

**Não** rode dois Career API com SQLite separado — lots divergem. `CAREER_WORLD_TICK=remote` só sincroniza **relógio** (Phase 4); market/state continuam locais nesse modo.

### Playtest (mesmo PC)

```bash
# Terminal 1 — world host (API only; CAREER_AUTH=1 + CAREER_WORLD_FIXED=1 by default)
npm run career:host
# First time: create/open a save once (headless resumes last-played / sole profile)

# Terminal 2 — UI A (proxy → host) — no ProfileGate; AuthGate → company
npm run career:client

# Terminal 3 — UI B
$env:CAREER_UI_PORT=5174; npm run career:client
```

Mesmo world no host. Cada UI **register/login** (companies distintas). Accept em A → lot some em B. Opt out: `$env:CAREER_AUTH='0'; $env:CAREER_WORLD_FIXED='0'; npm run career:host`.

### Dois PCs (LAN)

1. Host: `npm run career:host` (firewall liberar TCP 8787); ensure one save is open.
2. Client: `CAREER_UI_API_PROXY=http://<host-lan-ip>:8787 npm run career:client`
3. Register/login por jogador (sem escolher save).

### Env

| Var | Default | Uso |
|-----|---------|-----|
| `CAREER_DEV_ROLE` / `--host` `--ui` | `all` | host=API only; ui=Vite only; all=hoje |
| `CAREER_UI_API_BIND` | `127.0.0.1` (`0.0.0.0` no `--host`) | bind do API |
| `CAREER_UI_API_PROXY` | `http://127.0.0.1:8787` | target do proxy Vite |
| `CAREER_UI_API_PORT` / `CAREER_UI_PORT` | 8787 / 5173 | portas |
| `CAREER_AUTH` | off (`1` no `--host`) | Bearer session → owned company |
| `CAREER_WORLD_FIXED` | off (`1` no `--host`) | one shared `world/skyline.sqlite`; clients skip ProfileGate (**env only**) |
| `CAREER_WORLD_TICK=remote` | off | 2º **API** sem tick (não substitui host único p/ sniping) |

## Phase 5 notes (2026-09-13)

- Staging Freights path stamps/enforces claim: `commitStagedManifest` / `executeAcceptManifest` take `companyId`; `/api/staging/commit` → **409** `lot_claimed`.
- `listMarketLots({ viewerCompanyId })` hides lots claimed by another company (covers partial soft-hold remaining kg).
- Market / Accept / staging load-save take per-request `companyId` (header/body) so dual tenants do not thrash ambient `activeCompanyId`.
- Proof: `career-dual-tenant.test.ts` — same world tick, rival board omits lot, Accept/staging conflict.
- Still poll-only (no SSE); no polished dual-tab UI picker.

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
- Presença-only MP (“só vejo quem está online”) — north star continua company + shared world; **stub:** `GET /api/auth/sessions?scope=all` + `CAREER_AUTH_SESSIONS_LIST_ALL=1` + `online` window 5 min (`last_seen`)

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
- [x] Dois clients veem o mesmo `tick` + mesmo lot id desaparecer após accept (Phase 5 dual-tenant proof)
- [x] Dual-tab no mesmo host com companies distintas via header/`?company=` (Phase 6)
- [x] Reconnect não chama `tickEconomyN` no processo UI remoto (Phase 4)
- [x] Accept concorrente → exatamente um 200, resto 409 (Phase 3 unit + Phase 5 staging/board)
- [x] `offlineFeeSummary` usa delta de **world.tick** (Phase 0)
- [x] Admin/debug tick isolado de client remoto (`POST /api/world/pulse` + `/api/tick` → 403 on mp-remote)
