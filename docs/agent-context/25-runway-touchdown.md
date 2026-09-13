# Runway touchdown / debrief

## Sintoma (2026-09-06)

Settle debrief em **SBCH**: `RWY 11 · 0 m past THR · 5860752 m left · OFF runway` com dot fora da strip — player pousou na **29** na pista.

## Causa

`career-runways.json` tinha o strip SBCH (e ~179 outros hubs) com **`lat: 0, lon: 0`, `headingTrueDeg: 0`** (Null Island).

Origem: `merge-missing-career-runways.mjs` fazia `Number("") === 0` nos ends vazios do OurAirports → centro válido falso → projeção do touchdown real vs (0,0) = milhões de metros laterais. Label “11” vinha do `ident` primary; heading 0 não alinhava approach 29.

## Fix

- Script `packages/shared/scripts/repair-null-island-runways.mjs` (`npm run repair:runways:null-island -w @msfs-compat/shared`) — rebuild OA + hub fallback; **0** null-island restantes.
- `num("")` → undefined em `generate-career-runways.mjs` + `merge-missing-career-runways.mjs`; rejeita Null Island.
- Runtime: `isUsableRunwayCenter` filtra 0,0 em `getAirportRunways`.
- Teste: SBCH center real + approach 29 on pavement.

## Sintoma (2026-09-12) — “OFF runway” com pouso na pista (SBKG e outros)

Debrief `431 m past THR · 158 m right · OFF runway` com landing score cheio. Repetia em hubs cujo heading do catálogo era **ident×10** (magnético).

## Causa sistêmica

`merge-missing` preenchia strips sem ends OA com `headingTrueDeg = runwayNumber × 10` (**magnético**). Projeção de touchdown precisa de **true**. Δheading ≈ declinação local (SBKG ~25°) → lateral falsa ≈ pastThr × sin(Δ).

## Fix definitivo (não só SBKG)

1. **Catalog repair:** `npm run repair:runways:magnetic -w @msfs-compat/shared`
   - OA LE→HE bearing quando ends existem
   - senão stub ident×10 → mag→true via WMM (`geomagnetism`)
   - 2026-09-12: **37** geo + **207** declinação corrigidos; SBKG = 125°
2. **merge-missing / generate:** não gravar ident×10 cru; convert WMM; preferir geometry OA.
3. **Runtime:** `bestRunwayProjection` + `isLikelyMagneticHeadingStub` — se heading da aeronave no touchdown existir, prefere esse eixo (stubs remanescentes / crab).

## Paths

- `packages/shared/src/career-runways.ts`
- `packages/shared/src/data/career-runways.json`
- `packages/shared/scripts/repair-null-island-runways.mjs`
- `packages/shared/scripts/repair-magnetic-runway-headings.mjs`
- `packages/shared/scripts/generate-career-runways.mjs`
- `packages/shared/scripts/merge-missing-career-runways.mjs`
