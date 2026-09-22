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

### Away banner on brand-new account (2026-09-20)

**Sintoma:** ao criar conta nova (ainda no Choose Home Hub) aparecia `Away ~N economy days · passive fees charged for 7 days ($0…)`.
**Causa:** (1) `last_seen_tick` default 0 → settle herdava o gap offline do world SP; (2) `settleAllCompaniesPassiveFees` devolvia `preferred ?? first` e podia vazar banner de outra company; (3) `buildOfflineFeeSummary` emitia banner só por `capped` mesmo com debit $0.
**Fix:** seed `lastSeenTick = world.tick` no register/ensure company; banner só da company ativa; summary null quando debit $0 e sem soft lease.

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
9. Hosted Postgres lab — **shipped 2026-09-14** (`CAREER_PG=1`; single-writer `world-api` owns HTTP + 24/7 pulse). Schema **v15**: drops stub tables `economy_json` + `company_missions`; SoT = relational + `economy_meta.misc_json` / company tables. SP SQLite unchanged.

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
- Docker: containers `skyline-career-postgres` + (lab) `skyline-career-adminer` (http://127.0.0.1:8081). Volume `skyline_career_pg_data`.
- **Compose overlays (2026-09-14):** base `docker-compose.yml` = Postgres **sem** publish. **Lab** `docker-compose.lab.yml` → `127.0.0.1:5432` + Adminer `:8081` + world `:8787`. **Prod** `docker-compose.prod.yml` → world `127.0.0.1:8787` only (sem Adminer/DB ports). `npm run career:stack:world` = lab; `--prod` = VPS-safe; `--prod --tls` = + **Caddy** (`deploy/Caddyfile`, profile `tls`, `CAREER_WORLD_HOST` + DNS + :80/:443 → Let's Encrypt; alias legado `SKYLINE_WORLD_HOST`). Desktop: `CAREER_WORLD_API_URL=https://<host>`.
- **World healthcheck zombies (2026-09-18):** VPS `htop` mostrava dezenas de `node -e fetch(/api/health)` em estado **Z**. Causa: compose `CMD-SHELL` + spawn Node a cada 10s sem reap limpo. Fix: imagem instala `curl`; healthcheck `CMD curl -sf http://127.0.0.1:8787/api/health` (interval 15s). Precisa rebuild GHCR + pull/redeploy na VPS (compose sozinho em imagem antiga falha sem curl).
- **VPS boot diag (2026-09-15):** `world-api` unhealthy com `ERR_MODULE_NOT_FOUND … @msfs-compat/runtime/dist/index.js` — `Dockerfile.world` só compilava `shared`, embora `career-ui/server/ofp-load-helpers.ts` importe `runtime`. Fix: build `shared` **e** `runtime` na imagem antes de iniciar a API.
- **VPS reboot diag (2026-09-16):** Docker restart policy started `world-api` + `world-worker` concurrently (daemon restart does not honor Compose `depends_on` ordering); both opened/migrated PG, API lost a `40P01 deadlock detected`, returned once, and stayed `store:null` / `needsProfile:true` until manual API restart. Fix: shared `career-postgres-retry.ts` treats deadlock/recovery/connect failures as transient; fixed-world API open retries 12×/1s. Worker reuses the same helper.
- **Pi 4 staging diag (2026-09-16):** first `POST /api/fleet/select-hub` through Cloudflare Tunnel returned an HTML timeout (`Unexpected token '<'`) while `world-api` used one full CPU core persisting the global world on microSD. Cause: hub selection used `persist:'blob'` → full `saveEconomy` + dealer pool + company; Cloudflare timed out while the backend still committed (`npcFleetTarget:3839`, BR, 421 lanes). Fix: PG MP persists only the selected company and its own hub/country (does not mutate global `home_country_id`); SP JSON/SQLite keeps `syncHomeCountryFromHub` + full save. Client JSON parsing turns proxy HTML/524 into an actionable timeout message.
- **MP login/board slow on Pi (2026-09-16):** `loadEconomyUnlocked()` still ran legacy `syncHomeCountryFromHub` on every read; a different ambient company country could set `dirty` and trigger full `saveEconomy` before `/api/market`. Fix: `homeCountryPersistence` treats Postgres or fixed-world SQLite as shared (company-only hub persist; reads never sync global country); non-fixed SQLite/JSON SP keeps global country + full-save behavior.
- **Prod empty-world guard (2026-09-16):** `docker-compose.prod.yml` defaults `CAREER_WORLD_ALLOW_SEED=0` for API + worker. PG startup accepts any existing `economy_meta`/airports/lots/NPC row, but refuses a completely empty world instead of auto-seeding; fixed-world health is HTTP 503 while opening/failed, so Compose dependencies cannot mistake `store:null` for healthy. First bootstrap only: explicitly set `=1`, seed/verify, return to `=0`, recreate services. SP and non-prod defaults remain auto-create.
- **Pi 4 reboot proof (2026-09-16):** microSD staging reboot restored Postgres healthy + API healthy + worker in ~44s; existing volume passed the seed guard. Tailscale SSH returned. `smartmontools.service` alone failed because the Pi has no SMART-capable disk (microSD); disable/reset that unit until an SSD is installed.
- **World CI/CD amd64-only (2026-09-17):** `World deploy` builda só `linux/amd64` (Pi / arm64 + QEMU removidos; sem job `deploy-staging`). CI verde em `main` publica `sha-<commit>` + `main`. **Release builda de novo** (não espera sibling `workflow_run`) — o wait/retag congelava quando o CI do bump era cancelado por push seguinte (nota agent-context). **2026-09-18:** `workflow_run` no SHA já tagueado `v*` **skipa** o rebuild (release já buildou+deployou). Setup: `deploy/README.md`.
- **World CI/CD (2026-09-16):** imagem GHCR multiarch `linux/amd64,linux/arm64` + Pi staging opcional por `workflow_dispatch target=staging` (retirado em 2026-09-17). Release wait/retag + exit 255 (v0.3.69 registry race; v0.3.70 SIGPIPE no `awk`/`pipefail` — parser consome toda a saída). Hosts pull-only; `deploy-world.sh` single-writer + app rollback; produção `pg_dump` 14d. Setup: `deploy/README.md`.
- **World image slim (2026-09-16):** `Dockerfile.world` agora é multi-stage. A fase builder mantém o install/build do monorepo; a imagem publicada leva só Node slim, runtime lock dedicado (`pg` + `tsx`), `shared/runtime` compilados, fontes estritamente necessárias de API/agent, worker e seed career. Electron, Vite, Catalog API e toolchain não entram na camada final. Primeiro deploy Pi passou em ~3 min: imagem ativa caiu de **1.96 GB / 604 MB content** para **398 MB / 92.2 MB content**; API e worker usam digest `34ee1e8afd04`, health PG/fixed-world verde.
- **Pi build-cache cleanup (2026-09-16):** `docker builder prune -af` removeu **5.223 GB** de cache inativo (build cache 26 → 0), sem tocar 3 containers ativos, 6 imagens ou 2 volumes. Hosts são pull-only; comando e ressalva contra `docker system prune --volumes` em `deploy/README.md`.
- **MP stale snapshot diag (2026-09-16):** após separar API/worker, o atalho `PostgresCareerStore.loadEconomy({ maxCatchUpTicks: 0 })` devolve `this.ram` indefinidamente no processo API. Prova no Pi: `/api/world/clock` serviu tick **23** enquanto o worker PG já repetia tick **24**; logo o board pode ficar stale e uma escrita ampla baseada nesse objeto pode sobrescrever estado mais novo. Antes de otimizar o board, o cache PG precisa de revisão monotônica/invalidação cross-process, hydrate transacional consistente e writes com conflito/escopo no banco. O board também faz trabalho O(lots × NPC/flight scans): 11.411 lots deixaram `world-api` em ~101% de um core enquanto worker/Postgres estavam ociosos.
- **MP revision/snapshot fix (2026-09-16):** schema PG v17 adiciona `economy_meta.revision` BIGINT (mantido como `bigint` no Node, sem perda por `number`). Cada persist economy amplo ou por slice trava/compara a revisão e incrementa no mesmo transaction; stale writer lança `PgEconomyRevisionConflictError` e invalida RAM em vez de sobrescrever. API faz probe barato da revisão, hydrate completo em `REPEATABLE READ READ ONLY` quando mudou e usa clone isolado por request; worker recarrega e tenta o pulse novamente em conflito. Reads de airport também passam pelo refresh cross-process. CI PG abre dois stores e prova refresh + rejeição do stale writer.
- **MP board CPU fix (2026-09-16):** `listMarketLots` constrói uma vez por request os mapas `lotId→activeFlight`, `npcId→NPC` e `region→ready capacity`; `listNpcActivity` usa `lotId→lot`, e `listRegionMarketPressure` agrupa NPCs em uma passada. Mantém prioridade/semântica antiga (primeiro awaiting-pilot antes do primeiro in-flight) sem scans cruzados. Complexidade principal cai de O(lots × (flights + NPCs)) para O(lots + flights + NPCs); paginação/sorts globais continuam semanticamente iguais. Benchmark local pós-fix: 7.984 lots + 3.839 NPCs + 2.064 flights → `listMarketLots` em ~284 ms; medição real no Pi ainda depende de deploy.
- **Pi post-fix perf diag (2026-09-16):** storage é microSD `mmcblk0` 29.8 GB; root/Docker estão no mesmo `ext4` (`rw,relatime`) — formato/mount corretos. Sob board, `vmstat 1` mostrou I/O wait saltando de 1–2% para **34%/67%** (`b=4`), enquanto API ~87% CPU, PG ~57% e worker ~36%; logo é gargalo misto CPU + random I/O da microSD, não undervoltage (`get_throttled=0x0`) nem RAM. SSD USB 3/UASP em ext4, movendo Docker/Postgres para ele, é a próxima melhoria material.
- **Pi 4 CPU (2026-09-16):** `arm_boost=1` já dava 1.8 GHz; staging passou a `arm_freq=2000`, `over_voltage=6`. `stress-ng --cpu 4 --cpu-method matrixprod --verify -t 15m` passou 4/4, zero failures, 88.311 bogo ops, temperatura abaixo de 45 °C (idle ~31 °C); pós-teste `get_throttled=0x0` e kernel sem undervoltage/throttle/segfault/hardware error. Manter soak 24–48h; OC não resolve I/O wait da microSD.
- **Worker CAS crash diag/fix (2026-09-16):** sob escrita concorrente contínua, três `PgEconomyRevisionConflictError` corretos esgotavam o retry e encerravam o worker; Docker reiniciava o container. Além disso, refresh cross-process repetia probes/auto-repair de seed/backfill/misc e podia alimentar write ping-pong. Fix local: auto-repair PG só no cold-open; refresh de revisão fica read-only. Após três conflitos, worker recarrega o snapshot, adia aquele pulse e continua vivo (não salva stale nem encerra). Precisa commit/deploy e soak no Pi.
- **Crew board remaining cost (2026-09-16):** UI mostrar 141 Crew não significa query de 141: `/api/market` ainda lista/mapeia ~21.171 lots globais e só `queryMarketBoardPage` aplica `crew=crew`, sort e page. Durante o build do hotfix, o runtime antigo ainda somava hydrate PG completo por revision ping-pong na microSD, chegando a minutos. Reavaliar após deploy; follow-up correto se necessário é antecipar o filtro Crew/Aircraft logo após claim lookup, antes de pressure/economics/map, preservando total/sort globais do subconjunto.
- **Cloudflare Tunnel/network diag (2026-09-16):** não é a causa dos minutos em steady state. Dez probes deram API direta 3,6–10,6 ms, via tunnel 156–232 ms no Pi e 97–139 ms no desktop após warm-up; DNS ~3–14 ms, borda `GRU`, quatro conexões QUIC saudáveis em `gru14/17/19`, RTT 14–21 ms. IPv4/IPv6 tiveram 0% loss (20 probes cada), Wi‑Fi atual ~−50 dBm. O incidente das 17:47 foi comprovadamente `wlan0: Lost carrier` + leases DHCP v4/v6 removidos, não rota Cloudflare: afetou QUIC, Tailscale, IPv4 e IPv6; DHCP voltou em ~4 s e as quatro conexões do tunnel em ~14 s. Priorizar Ethernet para staging estável; trocar QUIC por HTTP/2 não evita perda de carrier. `context canceled` anterior no `/api/market` também pode ser client abort de uma request lenta no origin.
- **Ports GET revision conflict (2026-09-16):** `/api/ports` é um GET materializador: `portSnapshot` pode refill/expire listings e sincronizar concessions. `persist:'portMarket'` gravava listings+inventory em uma revisão e concessions em outra; o worker podia entrar entre ambas, fazendo `expected 113, actual 114` subir como HTTP 500/blank page. Fix: Postgres persiste listings+inventory+concessions numa única transaction/CAS. Não há retry por endpoint no desenho final; conflito agora denuncia violação do lease single-writer.
- **Single-writer simplification (2026-09-16):** revisão global evitou stale overwrite, mas API+worker independentes criaram conflitos falsos, retries por endpoint e risco de commits parciais. Arquitetura normal agora tem um escritor: `world-api` com `CAREER_HEADLESS_PULSE=1` atende comandos e roda o relógio 24/7 sob o mesmo `withCareerLock`; Postgres revision fica só como defesa. `world-worker` permanece apenas no profile explícito `legacy-worker`, nunca junto ao API normal. Health expõe `worldWriter:"api"`; deploy para/remove container legado antes de promover a API e rollback usa API antigo também com pulse ligado.
- **DB access without public :5432:** (1) SSH tunnel to loopback publish: `ssh -N -L 5432:127.0.0.1:5432 user@vps` then DBeaver → `127.0.0.1:5432`; (2) Tailscale/WireGuard. Never publish `0.0.0.0:5432` / Adminer on a VPS.
- **PG size/persist measure (2026-09-19):** pedido de medir table size + custo do full-replace no pulse. Agent host **sem** chave deploy (`Permission denied` em `world.playairframe.com`). Clock público ok (`tick` vivo). Próximo: rodar o SQL no VPS (compose exec postgres) ou liberar SSH/deploy key no agent.
- **Pulse wall times from VPS logs (2026-09-19):** `economy-pulse ok ticks=8` normalmente **~22–29s** (~2.7–3.6s/tick); outliers **~556–570s** (~70s/tick). `psql` no host falhou com `role "root"` porque `$POSTGRES_USER`/`$POSTGRES_DB` estavam vazios no shell — usar `skyline` (compose default) ou `set -a; source .env; set +a`. Store warm ~4.6s. Ainda falta row/size dump das tabelas quentes.
- **PG row counts prod (2026-09-19):** `lots` **33336**, `charter_offers` **9264**, `charter_demand` **16736**, `airport_stock` **13769**, `npcs` **3839**, `charter_hubs` **1967**, `aircraft_instances` **834**. Size query precisa `c.relname` (ambiguous). Pulse ainda full-replace DELETE+INSERT nessas fatias — com 33k lots + 9k charter offers o I/O por tick é material; outliers ~70s/tick ainda precisam de profile (tick vs persist).
- **PG size + status prod (2026-09-19):** `lots` **150 MB** (90+60 idx); `hub_economy_samples` **71 MB** / 70k; `charter_demand` **41 MB**; `charter_offers` **21 MB**. Charter: **available 2492 / expired 6772** (~73% morto ainda reescrito no full-replace). Lots: available 16358 / expired 10814 / delivered 5495 / in_transit 642 / reserved 27. **Causa:** `pruneDeadLots` tratava delivered com `expiresAtTick` futuro como vivo; charter keep expired **2d** por `createdAtTick`. **Fix:** drop `delivered`/`completed`/`cancelled` na hora; expired só ~48 ticks; PG `lotTableRows`/`charterOfferTableRows` filtram com `shouldRetain*`. Re-medir counts + pulse ms após deploy. Sem Dry.
- **PG lots/charter UPSERT Wave 1 (2026-09-19):** sintoma = pulse ainda `DELETE all + INSERT` nas fatias quentes (~3s/tick, outliers ~70s). Causa = full-replace reescrevia WAL/índices mesmo com skip-dead no INSERT. Fix = `syncLotsTableToPg` / `syncCharterOffersTableToPg`: orphan-delete `NOT (id = ANY(retained))` + chunked `ON CONFLICT DO UPDATE … WHERE … IS DISTINCT FROM` (no-op skip). Wired em `persistEconomyTablesToPg` + `persistNpcLiveToPg`. Demand/hubs charter ainda wipe. Telemetry: `CAREER_PG_PERSIST_TIMING=1` (não está no compose — overlay local + `--pull never` + `CAREER_WORLD_IMAGE` pinado; `:main` no GHCR dá `denied` sem login). Testes retain parity: `career-store-pg-lots-sync.test.ts`.
- **PG UPSERT measure prod (2026-09-19):** `CAREER_PG_PERSIST_TIMING=1` no VPS. Regime: `lots` **~1.20–1.35s** (`deleted` 0–2, `upserted` ~28.3k); `charter_offers` **~195–230ms** (`deleted` 0, `upserted` 4732). Catch-up `economy-pulse ok ticks=12` **47406ms** (~**3.95s/tick**). Conclusão: orphan-delete ok; charter bem mais magro vs 9k baseline; lots ainda paga UPSERT de ~28k rows/tick (DISTINCT FROM evita rewrite no-op, mas o round-trip INSERT continua). Pulse wall ainda ~4s/tick → resto = wipe demand/hubs/airports/stock + lógica. Wave 2 só se quiser cortar isso.
- **Pulse spike diag logs (2026-09-19):** sintoma UI “não sai do lugar” / `World API unreachable: fetch failed` no +3/+7 day; `docker ps` healthy; **não** OOM (`RestartCount=0`). Log VPS: um `economy-pulse ok ticks=8` em **~635 s** vs regime **~22–50 s**. Causa do stuck = writer ocupado; fase quente era opaca (wall total). Fix: log passa a `lockWait=` `tick=` `save=` `settle=` `lots=` (prefixo `SLOW` se wall ≥60s) em [`local-world-tick-service.ts`](../../packages/career-ui/server/local-world-tick-service.ts). Interpretar próximo spike: save≫tick → PG persist; tick≫save → formLots/npc; lockWait≫ → fila UI vs pulse. Sem Dry.
- **Accept lockWait diag (2026-09-21):** sintoma = Accept Manifest lento; hipótese = fila do world lock vs trabalho do comando. Medição (não muda comportamento): `POST /api/staging/commit` loga `[career] staging/commit <wall>ms lockWait=… inLock=… outside=…` (`fail` se o write lança). `lockWait` = tempo na fila do `worldLock`+`companyLock` (commit + dispatch + read final). `inLock` = tempo segurando o lock. `outside` = resto do request (peeks, OFP, JSON). Ler no processo que segura o lock: world-api em MP (deploy do host), API local em SP. `lockWait` dominante → split de fila vale; `inLock` dominante → o próprio Accept é pesado; `outside` dominante → não é o lock. Validação que não toca o lock e acaba em &lt;50ms não loga.
- **Pulse holds lock during PG save (2026-09-21 map):** sintoma = Accept/`staging/commit` enfileira atrás do pulse mesmo com peeks fora do lock. Causa = `LocalWorldTickService.runCatchUpWrite` → `withCareerWrite({ catchUp:true })` segura `worldLock`+`companyLock` por tick **e** `persistEconomyUnlocked`/`saveEconomy` (`persistEconomyTablesToPg` + `syncLotsTableToPg` de ~28k rows); settle é um segundo `withCareerLock` depois. `saveEconomy` só precisa de snapshot de rows (serializa `lotRows` antes do await), mas soltar o lock em volta do full save atual **não** é seguro: orphan-delete + UPSERT do snapshot stale reescreve `status`/`reserved_kg` que o Accept mudou no mesmo `lots[]`, e o callback `this.ram = toSave` clobber. Docs `11` descrevem dois cadeados + slice; **não** há desenho shipped de “persist off-lock”. Caminho mínimo seguro: (1) tick + publish `ram` sob lock; (2) freeze payload / dirty-lot ids do chunk; (3) soltar lock e persistir PG off-lock **só** dirty (nunca retained-set stale); (4) Accept sob lock com `persistCommandWorldSlice` **real** no PG (hoje é stub → `saveEconomy` full em `career-store-postgres.ts`) + merge/CAS se o pulse ainda estiver gravando. Sem dois writers mutando o mesmo `lots` array ao vivo.
- **Two-queue pulse vs comando (2026-09-21):** sintoma = Accept `lockWait≈15s` / `inLock≈5s` com pulse `save≈34s`. Causa = worldLock durante UPSERT do planeta + stub PG de `persistCommandWorldSlice` (= full save). Fix = (1) `persistCommandWorldSliceToPg` (lots/icaos/inbound só); (2) catch-up: tick sob lock, `saveEconomy(snapshot,{applyToRam:false})` + `flushDirtyCommandLots` fora; (3) Accept: `applyCommandWorldSliceToRam` sob lock, UPSERT da fatia após unlock; (4) `persist:'company'` sem slice → só `companyLock`; (5) settle passive fees try/catch por company. Verificar após **deploy world-api**: Accept durante pulse → `lockWait` na ordem do tick (~2s), `inLock` ≪ 5s. Wave 2 (não UPSERT 28k) continua fora.
- **Pulse settle `fleet_aircraft_pkey` (2026-09-21):** sintoma = `economy-pulse fail … settle=…ms: duplicate key value violates unique constraint "fleet_aircraft_pkey"`; pulses seguintes ok. Causa = `persistMissionsTablesToPg` faz `DELETE FROM fleet_aircraft WHERE company_id=$1` + `INSERT` plain; PK de `fleet_aircraft` é **só `id` (global)**, não `(company_id,id)`. Colisão = (a) dois `id` iguais no `state.fleet` da mesma company, ou (b) company B tenta inserir um `id` que ainda é row de company A (RAM/hydrate errada / dual-tenant copy). Não é o UPSERT de lots. Query `GROUP BY id HAVING COUNT…` vazia **é esperada** após fail (TX rollback — PG nunca ficou sujo). Pós try/catch por company: o pulse **skip** essa tenant. **Harden:** `sanitizeFleetForPersist` dedupe (last wins) + skip ids ainda owned por outra company (log `fleet persist deduped|skipped foreign`); wired em PG `persistMissionsTablesToPg` e SQLite `replaceFleetAircraft` (evita ON CONFLICT roubar casco). Root-cause do RAM errado = follow-up.
- **Open SimBrief revision conflict pós two-queue (2026-09-21):** sintoma = toast `Postgres economy revision conflict: expected N, actual N+1` ao clicar Open SimBrief (Dispatch flight_plan). Causa = `/api/dispatch` fazia `commandSlice` + CAS tip enquanto o pulse off-lock já tinha bumpado `economy_meta.revision`; tip em RAM ficava stale por desenho nas duas filas. Soft-retry/`skipCas` pontual = workaround. **Fix sólido:** (1) lease holder (`hasWorldWriterLease`) **nunca** passa expected tip — só `FOR UPDATE` + bump (`persistRevisioned`); CAS tip fica só para peer/worker sem lease; (2) `/api/dispatch` sem trim de cargo → `persist:'company'` (não precisa tocar economy). Todos os light persists (Accept, fuel, settle, ports, demand, aircraftMarket, …) herdam (1).
- **Spoke feeder open-count O(n²) stall (2026-09-19):** root cause do pulse “infinito” pós densify+`formLotsSpokeFeeder`: `countOpenFeederBandFrom` full-scan lots por spoke×SKU. Fix: índice 1×/tick. Deploy world-api required.
- **PG size/counts pós Wave1+prune (2026-09-19):** vs baseline (lots **150 MB** / delivered **5495**; charter_offers **21 MB** / expired **6772**). Agora: `lots` **73 MB** (heap 12 / idx 60) — available 16545 / expired 11125 / in_transit 636 / reserved 38 (**0 delivered**); `charter_offers` **5.8 MB** — available 2395 / expired 2337; `charter_demand` **65 MB** (subiu vs 41); `hub_economy_samples` **82 MB** (agora a maior). Prune+UPSERT OK; índices de lots ainda inchados (60 MB); próximo custo = samples + demand wipe, não lots/charter.
- **DB secrets (2026-09-14):** `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` + `CAREER_DATABASE_URL` live in root **`.env`** (gitignored); compose substitutes them (lab default still `skyline` if unset). Adminer login = those Postgres creds. Rotate password → update `.env` **and** alter role / recreate volume (init only runs once).
- Run (lab): `npm run db:up` then `npm run career:host:pg` + `npm run career:client`. VPS world: `npm run career:stack:world -- --prod`.
- **PG world tables (wired):** `career-store-pg-world.ts` — hot slices (`lots` / `airports` / `airport_stock` / `inbound_pending` / `economy_meta`) + company (`company_state` / `fleet_aircraft` / `missions` / `ledger`) + world-ops (`npc_flights` / `economy_events` / `npcs` / `fuel_*` / `demand_orders` / `port_*`) + dealer pool (`aircraft_instances`) + charter (`charter_demand` / `charter_hubs` / `charter_offers`). Schema **v16**: `fleet_aircraft` promotes registration / hours / condition % / config / lease flags out of `payload_json` (backfill on open). Schema **v15**: economy SoT = relational tables + `economy_meta.misc_json`; stub tables `economy_json` + `company_missions` dropped. SP SQLite mirrors fleet columns via `ensureV3Ddl` ALTERs. Load hydrates via `emptyPgEconomyShell` + tables; BIGINT wall-clock ms truncated on write.
- **PG light persists (2026-09-14):** `persistInboundPending` / `persistDemandBoardTables` / `persistDemandOrder` / `persistPortMarketTables` / `persistPortListing` / `persistPortConcessionIndex` / `persistNpcLiveWorld` / `persistAircraftPool` write only their tables (no full `saveEconomy`). `persistNpcLive` = clock + hubs/stock + lots + inbound + NPCs + dealer pool. Pulse `settleWorldCompaniesPassiveFees` exists on Postgres (awaited in `applyCompanySessionSettlement`).
- **PG smoke isolation:** prefer `CAREER_DATABASE_URL_TEST` or `CAREER_PG_TEST=1` → `skyline_test`; refuse mutating lab `skyline` unless `CAREER_PG_ALLOW_LAB_MUTATION=1`. Create DB once: `CREATE DATABASE skyline_test;` as role `skyline`.
- **Legacy worker only:** `npm run career:world:pg` / `career-world-worker-pg.ts` continuam para diagnóstico e testes. Não rodar ao lado do world API normal; Compose exige profile explícito `legacy-worker`.
- **Diag 2026-09-14 — Charter sort → blank/freeze:** GET `/api/charters` called `withCareerWrite` + `tickCharterEconomy` with default full economy persist on every sort/filter. On PG that blocked the career lock for seconds and starved the UI. Fix: `withCareerRead` only (charter tick stays on economy pulse). UI: `AppErrorBoundary` so render crashes show Reload, not a black root.
- **Diag 2026-09-14 — Buy/lease ~5s:** `persist: 'blob'` → double full `saveEconomy` on PG. Fix: `persist: 'aircraftMarket'` → `persistAircraftPool` + `saveMissions` only.
- **Sim local / world host (2026-09-14):** production split wired.
  - `CAREER_API_MODE=full` — SP/lab all-in-one (store + Watch).
  - `CAREER_API_MODE=world` / `CAREER_DISABLE_SIM=1` — VPS economy API e escritor único do relógio (`CAREER_HEADLESS_PULSE=1`); `/api/watch|preflight|load-ofp|simbridge` → **501** `sim_on_client`.
  - `CAREER_API_MODE=gateway` + `CAREER_WORLD_API_URL` — desktop: sim routes + **static UI** local; only `/api/*` (exceto sim) e `/worlds/*` proxied to world (Bearer + company). `/` nunca vai ao world (evita JSON `auth_required` no Electron). Health gateway espelha `authRequired`/`worldFixed` do world. Watch settle/depart via HTTP; gateway enriches `/api/settle` com telemetry local.
  - **Local prod sim:** `npm run career:stack:world` → postgres + single-writer `world-api:8787`. Desktop shell defaults to **:8788** (`CAREER_WORLD_API_URL=http://127.0.0.1:8787` for gateway). Se Electron reclamar de `cli.js` / install: o start usa `packages/desktop/run-electron.mjs` (não o `.bin` aninhado); sem `packages/desktop/package-lock.json`. World exige Auth → register/login no AuthGate.
  - **Desktop SP|MP (2026-09-14):** packaged app first run shows PlayModeGate (Single Player vs Multiplayer + World URL). Choice → `%APPDATA%\Skyline Career\career\desktop-play.json`; API child restart. Settings → Change play mode. Process env `CAREER_WORLD_API_URL` still forces MP (lab `npm start`). Files: `packages/desktop/desktop-play-config.mjs`, `PlayModeGate.tsx`.
  - **No SP ⟳ catch-up chip on world:** `CAREER_API_MODE=world` omits `catchUp` from `/api/state` (worker owns backlog). Topbar **pulse due** still means `nextPulseAtMs` is past — worker lag / catch-up drain, not “stay in Career”.
  - **Pulse due stuck minutes while logs ok (2026-09-22):** sintoma = chip `World · pulse due` por vários min com `economy-pulse ok` no world-api; Day·HH:MM parece parado. Causa = (1) MP omite `catchUp` de `/api/state`; (2) UI só fazia poll de `lastBatchAtMs` no effect gated por `catchUpBanner` → **nunca** em world mode; (3) live refresh só em Fleet/Market — Ports/VA deixavam o clock congelado pós-login enquanto `displayNowMs` andava → label due eterna. Fix = poll sempre `GET /api/world/clock` (peek, sem write lock) a cada 10s quando career ready. Countdown `next Ns` volta quando `lastBatchAtMs` refresca e o backlog de parede zera.
  - Scripts: `career:host:world` (Node world on host), `career:stack:world` (Docker lab), `career:stack:world -- --prod` (VPS: no DB publish), `--prod --tls` (Caddy + Let's Encrypt). Adminer only on lab overlay (`127.0.0.1:8081`).
  - Do **not** give desktop a Postgres password — HTTP only.
## Phase 7 notes (2026-09-14)

- **Local Auth** (no OAuth yet): `accounts` / `account_sessions` / `company_members` (schema v10).
- Session token → account → owned companies. `Authorization: Bearer` on `api()`.
- **Session hygiene (2026-09-14):** login/register = **one live Bearer per account** (`revokeAll` then insert). Expired rows purged on create/resolve (`expires_at_ms <= now`). `GET /api/auth/sessions` (Bearer) defaults to **`scope=mine`**; `?scope=all` only when `CAREER_AUTH_SESSIONS_LIST_ALL=1` (lab presence). `online` if `last_seen` within `AUTH_ONLINE_WINDOW_MS` (5 min). Response exposes `tokenHashPrefix` only (not the Bearer).
- **Auth rate limit (2026-09-14):** login/register share an in-memory per-IP sliding window (**20 / 15 min**); over → `429` `auth_rate_limited` + `Retry-After`. Not distributed across replicas.
- **Auth medium harden (2026-09-14):** `CAREER_AUTH_REGISTER=0` closes register; `CAREER_AUTH_INVITE` requires matching `inviteCode`; `claimCompanyId` needs `CAREER_AUTH_ALLOW_CLAIM=1`. `/api/map/satellite-style` not public (Bearer when auth on). Gateway keeps map **local** (loads repo `.env`); world-api gets `MAPTILER_KEY` from compose. Remember me default **off** → sessionStorage.
- **Prod invite wiring (2026-09-15):** root `.env` auth policy is passed explicitly into `world-api` by `docker-compose.yml` (`CAREER_AUTH_REGISTER`, `CAREER_AUTH_INVITE`, `CAREER_AUTH_ALLOW_CLAIM`, `CAREER_AUTH_SESSIONS_LIST_ALL`). Private beta: register `1` + long random invite; public launch may leave invite empty; fully closed signup uses register `0`. Recreate `world-api` after changing `.env`. **Verified 2026-09-17:** `GET /api/auth/status` on `world.playairframe.com` → `inviteRequired:true`, `registerEnabled:true`.
- **One-time access keys (2026-09-20):** `CAREER_AUTH_ACCESS_KEYS=1` requires a single-use product key on register (PG `access_keys` / SQLite v17). Mint: `npm run career:access-keys -- mint --count N --out keys.csv` (needs `CAREER_DATABASE_URL`). Staff bypass: keep `CAREER_AUTH_INVITE` matching until cutover, then clear it. AuthGate shows **Product key**. SP desktop stays ungated. Compose passes `CAREER_AUTH_ACCESS_KEYS`. Cutover: deploy → mint batch → flip env → recreate world-api. Existing accounts login unchanged.
- **Diag 2026-09-15 — MP restart stuck “Listening for host”:** fixed-world boot fetched authenticated `/api/career/profiles` before AuthGate had a Bearer; `401` was mislabeled as world-not-ready and left the gate stuck although `/api/health` was healthy. Fix: synthesize the fixed `World` profile directly from health, then run AuthGate; AuthGate now awaits post-login warm and renders its error instead of fire-and-forget.
- **Diag 2026-09-20 — “Authentication required” banner after account switch:** presence poll during AuthGate sent no Bearer; 401 with `tokenUsed=null` cleared the new login token / left a sticky error. Fix: ignore no-Bearer 401 when a session exists; pause presence on AuthGate; clear error on login success; don’t surface auth 401 banners while token is present.
- **Diag 2026-09-20 — AuthGate “Authentication required” right after logout:** in-flight polls 401’d after `clearAuthToken`; `shouldSurfaceApiError` still painted auth 401 when token was null. Fix: never surface auth-required as a banner (AuthGate is the UX); clear `error` on logout / AUTH_REQUIRED_EVENT; AuthGate only gets filtered errors. Remember me copy clarifies login name only — passwords are never stored (browser password manager can still fill).
- **Diag 2026-09-20 — deploy mid-login stuck forever:** poll only ran on boot `needsProfile`; `attachFixedWorld` failure set `worldWaiting` with no retry. Fix: dedicated `worldWaiting` effect polls health+attach every 2s; boot health failures also enter Listening instead of a dead ProfileGate; copy says it retries.
- **Diag 2026-09-15 — HTTPS world login “Failed to fetch”:** Caddy compressed JSON; Node `fetch` in the desktop gateway transparently decoded the body but `gateway-proxy.ts` forwarded stale `Content-Encoding: gzip`, so Chromium attempted a second decode (`ERR_CONTENT_DECODING_FAILED`). Fix: request upstream `Accept-Encoding: identity`, always strip decoded `content-encoding`/`content-length`, regression test `gateway-proxy.test.ts`.
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
- **Charter board (2026-09-18):** `GET /api/charters` + `POST /api/charters/accept` also take per-request `companyId` — without it, Fit showed `Unknown aircraft` for tails that Hangar listed (ambient world `activeCompanyId`).
- **Base Dispatcher desk (2026-09-18):** `/api/base/dispatcher` + dispatch-scout/tours take per-request `companyId` — without it, owned Base showed empty hire pool (“No Dispatcher candidates yet”).
- **CompanyId audit (2026-09-18):** script `scripts/audit-companyid-endpoints.mjs`. Patched remaining HIGH company-scoped desks that still used ambient missions: Ports (list/buy/auto-buy/concession/scout/shuttle/stevedore/deposit/pickup), Warehouses (list/buy/upgrade/stock/bridge/haul), Demand board, Ground staff hire/fire, Crew fire, Credit draw/repay, Pilot travel, Cargo-limit fleet lookups. Flight-loop paths (accept/cancel/dispatch/depart/settle/OFP) were already header-scoped; leftover inject fleet read on `/api/load-ofp` fixed. **MP needs VPS rebuild.** Re-run audit before shipping more MP desks.
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

## Client update kill switch (ops)

App still opens; **Prepare / Accept / Fly now** refuse until desktop ≥ `minClientVersion`. The same topbar updater chip shows (**Update X.Y.Z**) while force is on (and nudges electron-updater); board CTAs read **Update app**.

Policy lives on typed `economy_meta` columns (schema **v29**; no longer `misc_json`):

| Column | Type | Default |
| --- | --- | --- |
| `force_client_update` | boolean | false |
| `min_client_version` | text | `'0.0.0'` |

**Ops-owned.** Economy upsert inserts defaults on first world row only; later persists **do not** `SET` these columns (avoids tick/save wiping a live SQL flip from stale RAM). Health + accept gates always `SELECT` the columns.

**Enable** (prod Postgres; replace version with the fixed build):

```sql
UPDATE economy_meta
SET force_client_update = true,
    min_client_version = '0.3.105'
WHERE world_id = 'local';
```

Then verify: `curl -fsS https://world.playairframe.com/api/health | jq .clientUpdatePolicy` → `forceUpdate: true`.

World API reads the columns live on `/api/health` and on accept paths → **426** `client_update_required`. Desktop sends `X-Skyline-Client-Version`.

**Until that persist fix is deployed:** stop world-api → run the `UPDATE` → start world-api (load hydrates RAM). A live `UPDATE` while the API is up gets clobbered on the next economy save.

**Gated surfaces** (CTA **Update app** + topbar **Update** chip → download/Settings; Hold at WH stays allowed):

| Surface | API |
| --- | --- |
| Freights Prepare / Manifest commit | `POST /api/accept`, `/api/staging/commit` |
| Terminal Contracts / contract pilot | `POST /api/accept`, contract-pilot accept |
| Charter board / manifest | `POST /api/charters/accept` |
| Ports Demand Fly now / dispatch-hold | `POST /api/demand/accept`, `/api/demand/dispatch-hold` |
| Ports Bridge / Haul Fly now (+ dispatch-hold) | `POST /api/warehouses/bridge|haul/accept`, `…/dispatch-hold` |
| Ports shuttle launch | `POST /api/ports/shuttle` |
| Base Dispatcher Accept / prepare / accept-leg | `POST /api/base/dispatch-tours|dispatch-charters` (`prepare`, `accept-leg`, `confirm`) |

**Not gated:** login, browse boards, Hangar, Hold at WH, Watch settle of an already-accepted mission.

**Disable** after soak:

```sql
UPDATE economy_meta
SET force_client_update = false,
    min_client_version = '0.0.0'
WHERE world_id = 'local';
```

Do **not** use day-to-day.

### misc_json leftovers → v29

Former `economy_meta.misc_json` bag is emptied. Promoted:

| Former key | Target |
| --- | --- |
| `clientUpdatePolicy` | `force_client_update`, `min_client_version` |
| `version` | `economy_version` |
| `aircraftPoolCatalogHash` | `aircraft_pool_catalog_hash` |
| `flow` | `flow_stats` JSONB |
| `internationalLanes` | table `international_lanes` |
| `portInboundShips` | table `port_inbound_ships` |
| `tourLotSoftHolds` | table `tour_lot_soft_holds` |
| `regionalRecovery` | table `regional_recovery` |
| `presenceLog` | table `presence_events` |

`misc_json` remains as `{}` for rare future leftovers. SP SQLite unchanged (still inside `economy_json`).
