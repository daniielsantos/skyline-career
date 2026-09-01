# Hub Stats + histórico econômico

Atualizado 2026-08-31: **Pulse lenses** — World/BR/US/Spoke; Spoke dead (0 lots) + Quiet N absolutos; sparklines seguem a lente.

Atualizado 2026-08-31: **Retenção samples 90d** — `HUB_ECONOMY_SAMPLE_RETENTION_DAYS=90`; Pulse toggle **90d**. Stats hub continua 7d/30d.

Atualizado 2026-08-31: **Pulse page denser** — spoke live + quiet; soft-fill/inbound; electronics spot; size mix GA/TP/Med/Nar/Wide; pay p10–p90 band; sparklines. Quiet = `activityScore < 8` (não zero lots).

Atualizado 2026-08-31: **Economy pulse = página dev** — Network history saiu da aba Stats; tab **Pulse** (`/pulse`, só Dev Mode) ao lado de Lab. Stats do hub = só ICAO (live + history local).

Atualizado 2026-08-31: **Stats empty / crash day-1** — fetch falhava em silêncio → “No stats…”; Network history race limpava pulse. Fix: erro visível; keep last pulse; payload pulse só BR/US (sem todos os países); render defensivo (`sizeMixLots`/`softFill`).

Atualizado 2026-08-31: aba **Stats** no terminal + samples diários em SQLite (schema **v7** → **v8**).

Atualizado 2026-08-31: UI — **Terminal inventory** (= stock Dry deste ICAO, não player WH); unidades via `weightSystem` ($/lb|kg, klb|t); History = **spot por commodity** (chips + SVG anotado, ≥2 samples); tabela com spot da commodity selecionada. Chart ≥2 samples.

Atualizado 2026-08-31: History table **4/page** + sort Day/Lots/Pay/Fill/Spot; chart **16.5rem** + viewBox alto (menos letterbox); labels no SVG só **High** (atual no header; range embaixo; tooltip nos dots).

Atualizado 2026-08-31: **Network history pulse** — agrega `hub_economy_samples` (mundo / BR·US / major·regional·spoke) por dia. API `GET /api/debug/hub-economy-history?days=7|30|90`. UI: tab **Pulse** (dev). Schema **v8** cols: country/tier/region, cargo stock/cap, inbound, lot counts, pay p10/p90.

## O quê

- **Terminal inventory:** fill % + spot do inventário do **hub** (`airport.inventory`) — mesmo tipo de dado que a aba Inventory do terminal, não o Warehouse do jogador.
- **Board outbound:** lots saindo + pay p50 + size mix + soft-fill + Jet-A; hub level/quiet no head.
- **Histórico (ICAO):** 1 amostra/dia/hub; toggle **7d / 30d**; tendência de **spotUsd por commodity**; tabela (lots / pay p50 / fill / spot / quiet).
- **Economy pulse (dev):** série diária global a partir das **mesmas** rows — tab **Pulse** (`/pulse`, Dev Mode). Stats do jogador não mostra o card de rede.
- **Não** fica em `economy_json` / só-RAM. Sem Recharts/d3 — SVG hand-rolled.

## Persistência

Tabela `hub_economy_samples` (`world_id`, `icao`, `day_index` PK). Retenção **90** dias (`HUB_ECONOMY_SAMPLE_RETENTION_DAYS`).

- DDL / I/O: [`packages/shared/src/career-store-v7.ts`](../../packages/shared/src/career-store-v7.ts) (`ensureV8HubSampleColumns`)
- Schema bump: `CAREER_STORE_SCHEMA_VERSION = '8'` em [`career-store.ts`](../../packages/shared/src/career-store.ts)
- Flush: `pendingHubEconomySamples` → upsert no `saveEconomy` (stripped do blob)

### Campos v8 (além do v7)

| Coluna | Uso |
|--------|-----|
| `country_id` / `region` / `hub_tier` | Bucket BR/US/spoke… |
| `cargo_stock_kg` / `cargo_capacity_kg` / `inbound_kg` | Soft-fill / pressão |
| `lots_*` (+ `kg_*`) | Size mix por count e kg |
| `pay_p10_usd` / `pay_p90_usd` | Dispersão do board |
| commodities `stockKg`/`capacityKg` | Spot + fill detalhado |

## Sampler

[`career-hub-economy-sample.ts`](../../packages/shared/src/career-hub-economy-sample.ts)

- `buildHubEconomySamples(world)` — um row por hub cargo (pula `bushTripOnly`)
- `maybeQueueHubEconomyDaySample(world)` no fim do tick quando `economyDayIndex` sobe (`tickEconomyFinish`)
- Size bands: GA ≤450 · TP ≤1704 · medium ≤10t · narrow ≤18 137 · resto wide

## Agregação

[`career-hub-economy-history-pulse.ts`](../../packages/shared/src/career-hub-economy-history-pulse.ts) → `aggregateHubEconomyHistoryPulse(samples)`.

## API / UI

- `GET /api/airport/:icao?part=stats` → `{ now, history, retentionDays }`
- `GET /api/debug/hub-economy-history?days=7|30|90` → pulse agregado
- Client: `fetchAirportStats` / `fetchHubEconomyHistory`
- Aba **Stats** → [`TerminalHubStatsPanel.tsx`](../../packages/career-ui/src/TerminalHubStatsPanel.tsx) (hub only; janelas 7d/30d)
- Dev **Pulse** → [`HubEconomyPulsePage.tsx`](../../packages/career-ui/src/HubEconomyPulsePage.tsx) + [`HubEconomyNetworkHistory.tsx`](../../packages/career-ui/src/HubEconomyNetworkHistory.tsx) (7d/30d/**90d**)

## Diagnóstico

Samples só aparecem após **day rollover + save**. Rows antigas (pré-v8) leem country/tier vazios/`spoke` até o próximo sample.
