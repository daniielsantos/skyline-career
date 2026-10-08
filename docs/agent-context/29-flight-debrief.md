# Flight debrief sheet (Dispatch)

## FPM positivo num pouso normal (2026-10-04) — KLAX→CYZR +184 Butter

**Sintoma:** debrief em pé, na pista, Butter `+184 fpm`. Antes o FPM do pouso aparecia negativo.

**Causa:** o número antigo era a VS do mundo no primeiro `SIM ON GROUND` (descida = negativo) e pegava a rampa, não o toque. O debrief agora mostra só `PLANE TOUCHDOWN NORMAL VELOCITY` (ft/s × 60), com o sinal que o MSFS devolve. Neste settle o latch veio positivo (~3 ft/s → +184 fpm). A nota usa o módulo: +184 e −184 são Butter (até 200), por isso Landing 26/26. O +654 invertido do SVSE é o mesmo latch, não um sinal de “subida”. Não inverter no app — o SDK não define o positivo como descida.

## FPM positivo no settle invertido (2026-10-04) — KMIA→SVSE +654

**Sintoma:** acidente no pouso, settle de cabeça para baixo, pilar Landing `Heavy · +654 fpm`. Parece taxa de subida.

**Causa:** o número é `PLANE TOUCHDOWN NORMAL VELOCITY`, não a VS do mundo. A nota usa o módulo: +654 e −654 são Heavy (acima de 600). Não inverter o latch. O KLAX→CYZR +184 (Butter, avião em pé) mostra que o positivo não é exclusivo do settle invertido.

## FPM do pouso (2026-10-04) — KMIA→MGGT −755 e Heavy com G cheio

**Sintoma:** pilar Landing `Heavy · −755 fpm`, barra Landing 14/26 (os 12 pontos de VS zerados), Entire flight 28/28. O G do toque ficou na faixa cheia, incompatível com um impacto de 755 ft/min.

**Causa:** no primeiro `SIM ON GROUND` o Watch gravava `lastAirborneVsFpm`. Num jato em rampa de 3° isso é ~700–800 ft/min de aproximação, não o toque. O latch `PLANE TOUCHDOWN NORMAL VELOCITY` (ft/s × 60) só entrava se esse campo ainda estivesse vazio, então o settle nunca o lia.

**Fix:** a taxa do debrief e do score é só o latch, e só quando a posição travada é deste pouso (≤ 0,45 nm). Valor acima de 80 é tratado como ft/min já convertido. A VS da aproximação não preenche. Se o latch não chegar, o pilar fica sem amostra em vez de marcar Heavy.

O resto do card aplica o que mede: envelope 4+4+4+4+6+6 = 28 (banco, pitch, G, IAS &lt; 250 abaixo de 10 000 ft, sem overspeed, sem stall); taxi 1+1 (GS no táxi, não na corrida); landing 12 VS + 10 G + 2 bounces + 1 trem + 1 flap. O score não corta o frete. O bônus de tempo no dinheiro é weather ops, separado da nota.


Glance layout inspired by other career addons: **three pillars first**, money/score second. No invented XP multipliers.

## Settle double spinner (2026-09-24)

**Sintoma:** no settle Watch apareciam **duas** animações “Settling flight…” (card principal + outra atrás no painel Dispatch).

**Causa:** overlay global `settle-busy-overlay` em `App.tsx` **e** inline `dispatch-settle-busy` em `DispatchActivePanel` quando `watch.settling`.

**Fix:** remover o inline + CSS `.dispatch-settle-busy`; fica só o overlay global (debrief opens next).

## OFP and Cargo columns (2026-09-30)

**Sintoma:** no En route, Distance/Cruise/Block/Air/Payload não alinham com Load/Contract/Deadline/Capacity left.

**Causa:** cada faixa usava `auto-fit` e contava as próprias células (5 vs 4), então a largura de cada coluna divergia.

**Fix:** as duas faixas compartilham `--enroute-metric-cols` (o maior dos dois) e a faixa mais curta ganha células vazias. Abaixo de 760px continua em 2 colunas.

## Charter Class Ops on settle (2026-09-24)

**Sintoma:** Class Ops no Hangar não mudava após Charter; debrief sem `classOpsDeltas` em perna pax.

**Causa:** `settleMission` devolvia cedo no path `missionType === 'charter'` sem `applyClassOpsOnSettle`.

**Fix:** Charter settle aplica Class Ops (horas + clean) na classe do avião; **não** Cargo Ops. Debrief / Hangar / home ladder (VA member bag) passam a receber deltas.

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
| Fuel | Low &lt;12% of bought · Normal · Heavy &gt;80% of bought; detail = `left · bought N kg` (uplift = Jet-A purchased at origin, often a top-up); Residual kg-only; — on impact |

## Fuel pillar copy (2026-09-23)

**Sintoma:** debrief `352% of uplift · 1957 kg left` — jargão “uplift” + % sobre compra pequena (tanque já cheio) parecia absurdo.

**Causa:** % = residual ÷ `fuelUplift.deliveredKg` (kg **comprados**), não ÷ combustível total na decolagem.

**Fix:** detail `1957 kg left · bought 556 kg`; badges Low/Normal/Heavy inalterados (ainda vs kg comprados).

## Não fazer

- Não copiar radar/XP% do outro addon
- Não retunar payout/score só por layout
- **Score vs OnAir (2026-10-03):** não acrescentar beacon/strobo, luzes de taxi, “ligar o tracking com motor off”, flap/gear overspeed, nem IAS fixa no pouso. O % corta 5% do pay de electronics abaixo de 70 e trava clean de Cargo/Class Ops. Luzes e overspeed de flap/trem mentem por addon; IAS sem Vapp do OFP pune o C172 e o widebody com o mesmo número. IAS no toque já é amostrada e não entra na nota — deixar assim.
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
