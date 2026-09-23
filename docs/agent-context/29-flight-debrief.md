# Flight debrief sheet (Dispatch)

Glance layout inspired by other career addons: **three pillars first**, money/score second. No invented XP multipliers.

## Shipped (2026-09-23)

**Sintoma:** debrief espalhava runway + net + metrics + score bars sem um “hero glance” legível.

**Causa:** layout antigo priorizava diagrama + dl; time/landing/fuel não tinham badges.

**Fix:**
- `buildDebriefPillars` em `packages/career-ui/src/dispatch-flow.ts` → Landing / Time / Fuel
- Badges só a partir de dados reais (VS bands = `scoreLandingVsPoints`, on-time/lateTicks, residual vs uplift)
- `FlightDebrief.impactEnded` + `takeoffFuelKg` (uplift delivered/requested)
- UI: pilares → runway/stats; crash mostra nota factual e esconde scorecard de sucesso
- CSS: `.debrief-pillars` / `.debrief-pillar-*` (tons `--ok` / `--accent` / `--danger`, não neon clone)

## Pillar rules (labels only)

| Pillar | Badges |
|--------|--------|
| Landing | Butter ≤200 · Soft ≤250 · Firm ≤350 · Hard ≤450 · Rough ≤600 · Heavy; Off rwy; Impact |
| Time | On time · Late; Aborted on impact |
| Fuel | Low &lt;12% uplift · Normal · Heavy &gt;80%; Residual kg-only; — on impact |

## Não fazer

- Não copiar radar/XP% do outro addon
- Não retunar payout/score só por layout
- Briefing onboarding global (origin/board/map) = fora de escopo; My VA member brief = stepper em `VaMemberBriefCard` (ver `16-va-logistics.md`)

## Logbook list + detail (2026-09-23)

**Sintoma:** Logbook home + Crew eram listas densas (route + prose) sem glance de score/tempo nem reabrir o debrief.

**Causa:** UI monolítica em `App` / `VaPage`; dados settled já existiam na missão (`settledFlightScore`, runway, duration) mas só no sheet pós-settle.

**Fix:**
- Lista: `LogbookFlightCard` (OD + Time/Dist/Pay/Score) — home + My VA
- Detalhe: `LogbookFlightDetail` + `buildLogbookDebriefFromMission` → mesmos 3 pilares / runway / score
- Sem inventar trail/XP; active legs não abrem detail (só Dispatch)
- Pay: home = cut (`pilotPayoutUsd`); VA company = bruto rota
- Kind chip: Freights / Demand / Haul / Internal Haul / Bridge / Ferry / Charter / Contract (não mais “Normal”)

**Filtro Settled / Cancelled (2026-09-23):** default lista não-cancelados; toggle mostra só `cancelled`. Home + Crew.

Ver também `16-va-logistics.md` (My VA Logbook).
