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

## Paths

- `packages/shared/src/career-runways.ts`
- `packages/shared/src/data/career-runways.json`
- `packages/shared/scripts/repair-null-island-runways.mjs`
