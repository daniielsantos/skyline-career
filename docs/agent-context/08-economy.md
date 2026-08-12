# Economia (ponteiro)

Não duplicar o roadmap aqui — a fonte da verdade é:

**`.cursor/rules/career-economy-roadmap.mdc`**

## Em poucas linhas

- Tick = **15 min** wall-clock (`TICKS_PER_DAY = 96`). Física de voo/MX em horas reais.
- Lots / Market / NPC / fuel trucks / hub levels / aircraft market / wear / ledger / SQLite store.
- Partição por país (`homeCountryId` / região `XX-YY` → país `XX`).
- Freights domésticos por país; intl só via `CAREER_INTERNATIONAL_LANES`.
- Soft-field **bush** hubs: Market não forma freight nesses ODs — usam **bush trips**.

## Expandir mapa / país / hub

**`.cursor/rules/career-map-expansion.mdc`** — checklist obrigatório (seed hubs, fuel producers, corridors, REGION_NEIGHBORS, UI labels, tests, migrate coverage).

Sessão recente Chile/SimBrief: `04-hubs-simbrief.md`.
