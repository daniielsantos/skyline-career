# Hub Stats + histórico econômico

Atualizado 2026-08-31: aba **Stats** no terminal + samples diários em SQLite (schema **v7**).

Atualizado 2026-08-31: UI — **Terminal inventory** (= stock Dry deste ICAO, não player WH); unidades via `weightSystem` ($/lb|kg, klb|t); History = **spot por commodity** (chips + SVG anotado, sem lib de chart); tabela com spot da commodity selecionada. Chart ≥2 samples.

Atualizado 2026-08-31: History table **4/page** + sort Day/Lots/Pay/Fill/Spot; chart **16.5rem** + viewBox alto (menos letterbox); labels no SVG só **High** (atual no header; range embaixo; tooltip nos dots).

## O quê

- **Terminal inventory:** fill % + spot do inventário do **hub** (`airport.inventory`) — mesmo tipo de dado que a aba Inventory do terminal, não o Warehouse do jogador.
- **Board outbound:** lots saindo + pay p50 + size mix + soft-fill + Jet-A; hub level/quiet no head.
- **Histórico:** 1 amostra/dia/hub; toggle **7d / 30d**; tendência de **spotUsd por commodity** (samples já trazem `{id,fill,spotUsd}`); tabela (lots / pay p50 / fill / spot / quiet).
- **Não** fica em `economy_json` / só-RAM. Sem Recharts/d3 — SVG hand-rolled.

## Persistência

Tabela `hub_economy_samples` (`world_id`, `icao`, `day_index` PK). Retenção **30** dias (`HUB_ECONOMY_SAMPLE_RETENTION_DAYS`).

- DDL / I/O: [`packages/shared/src/career-store-v7.ts`](../../packages/shared/src/career-store-v7.ts)
- Schema bump: `CAREER_STORE_SCHEMA_VERSION = '7'` em [`career-store.ts`](../../packages/shared/src/career-store.ts)
- Flush: `pendingHubEconomySamples` → upsert no `saveEconomy` (stripped do blob)

## Sampler

[`career-hub-economy-sample.ts`](../../packages/shared/src/career-hub-economy-sample.ts)

- `buildHubEconomySamples(world)` — um row por hub cargo (pula `bushTripOnly`)
- `maybeQueueHubEconomyDaySample(world)` no fim do tick quando `economyDayIndex` sobe (`tickEconomyFinish`)
- Size bands: GA ≤450 · TP ≤1704 · medium ≤10t · narrow ≤18 137 · resto wide

## API / UI

- `GET /api/airport/:icao?part=stats` → `{ now, history, retentionDays }`
- Client: `fetchAirportStats`
- Aba terminal **Stats** → [`TerminalHubStatsPanel.tsx`](../../packages/career-ui/src/TerminalHubStatsPanel.tsx) (`weightSystem` do Settings)

## Diagnóstico

A mesma tabela serve pulses/diff globais depois (não neste ship). Samples só aparecem após **day rollover + save**.
