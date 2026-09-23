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
