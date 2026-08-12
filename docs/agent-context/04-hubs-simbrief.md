# Hubs Chile / SimBrief allowlist

## Chile ICAO cleanup

- La Serena = **SCSE**
- Carriel Sur = **SCIE**
- Remap legado: `SCCD → SCIE`
- Removidos strips não-Dispatch: `SCSN`, `SCST`, `SCTC`
- CL hubs ~21; world airports catalog ~378 (números da sessão — revalidar no seed se mudar)

## SimBrief cargo allowlist

- `packages/shared/src/career-simbrief-airports.ts`
- Data: `data/simbrief-dispatch-airports.json` (~336 ICAOs)
- Seed: `assertDispatchHubsAreSimBriefKnown()`
- Gen: script `generate:simbrief-dispatch` (npm)

## Homologate / facilities MSFS

- Recusar facility MSFS se ident ≠ catalog **ou** distância **> 25 nm** (`msfsFacilityMatchesCareerHub`).
- Persistir só ICAOs do catalog; prune deny-list de overrides.
- `pruneOrphanCareerHubs` no migrate/boot.
- Override JSON limpo de `SCCD` / `SCSN` / `SCST` / `SCTC`.

## UI (sessão)

- Removido banner vermelho boot “Select a career profile first” (`isNeedsProfileMessage` em `App.tsx`).
- Near me: default off + toggle/clear; For me tooltip; tweaks Freights layout.
