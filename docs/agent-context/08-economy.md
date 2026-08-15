# Economia (ponteiro)

Não duplicar o roadmap aqui — a fonte da verdade é:

**`.cursor/rules/career-economy-roadmap.mdc`**

## Em poucas linhas

- Tick = **15 min** wall-clock (`TICKS_PER_DAY = 96`). Física de voo/MX em horas reais.
- Lots / Market / NPC / fuel trucks / hub levels / aircraft market / wear / ledger / SQLite store.
- Partição por país (`homeCountryId` / região `XX-YY` → país `XX`).
- Freights domésticos por país; intl só via `CAREER_INTERNATIONAL_LANES`.
- Soft-field **bush** hubs: Market não forma freight nesses ODs — usam **bush trips**.
- **Warehouses** (pickup hubs SBGR/SBKP/SBCT): CAPEX + capacity + storage; port buy **split** free→WH / rest→yard; **partial Store**; **Abandon** yard (no refund) for oversized lots; **lotes por custo** (±3% merge band); **T1→T2 hybrid upgrade** (lifetime Demand Board shipped kg + CAPEX).
- **Demand Board:** NPC buy-orders quando stock do hub está baixo; accept → missão WH→dest; settle = payout + fill terminal (não FBO spot) + credit `lifetimeShippedKg` na WH de origem. **Edit cargo** (`replaceDemandMissionCargo`): reduzir devolve kg à WH + `remainingKg`; aumentar retira da WH / consome remaining.
- **FBO spot:** removido (stock wipe on load); FBO = bonded holds only.
- **Ports:** Santos + Paranaguá — buy → WH/yard → Store/Abandon; preço de listing **dinâmico no spawn** (hub spot × 0.48 + jitter/clamp); yard hold fee diária; sem Fly-to-FBO-spot.

## Expandir mapa / país / hub

**`.cursor/rules/career-map-expansion.mdc`** — checklist obrigatório (seed hubs, fuel producers, corridors, REGION_NEIGHBORS, UI labels, tests, migrate coverage).

Sessão recente Chile/SimBrief: `04-hubs-simbrief.md`.
