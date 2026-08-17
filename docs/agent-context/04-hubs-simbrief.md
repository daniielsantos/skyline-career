# Hubs / SimBrief allowlist

## Chile ICAO cleanup

- La Serena = **SCSE**
- Carriel Sur = **SCIE**
- Remap legado: `SCCD → SCIE`
- Removidos strips não-Dispatch: `SCSN`, `SCST`, `SCTC`
- CL hubs ~21

## South America seed (complete)

- Countries: BR/AR/CL + UY/PY/PE/BO/EC/CO/VE/GY/SR/GF
- Coastal ports: Montevideo, Callao, Guayaquil, Cartagena, Buenaventura, La Guaira, Georgetown, Paramaribo, Cayenne (BO/PY landlocked — no port)

## Central America seed (complete)

- Countries: PA/CR/NI/HN/GT/SV/BZ
- Coastal ports: Balboa, Limón, Corinto, Puerto Cortés, Acajutla, Puerto Quetzal, Belize City
- SV: only MSLP + MSSS (closed Santa Ana El Palmer omitted)

## Caribbean seed (complete, intl-first)

- Countries: CU/DO/HT/JM/BS/TT/BB/LC/GD/AG + **GP/MQ/CW/SX/AW**
- **Puerto Rico:** region `US-PR` under US (TJSJ…); domestic corridors to KMIA/KEWR — not a separate country
- **U.S. Virgin Islands:** region `US-VI` under US (TIST/TISX); domestic to KMIA + inter-island
- BB/GD/MQ/CW/SX/AW: single-major catalogs where island is tiny

## Europe seed (EU-1 Western core)

- Countries: **PT / ES / FR / GB / DE / NL / BE / IT**
- Hubs: **78** curated; multi-region road graphs for PT/ES/FR/GB/DE/IT
- World seed: **629** airports; **61** ports (Lisbon / Barcelona / Marseille / Southampton / Hamburg / Rotterdam / Antwerp / Naples)
- Intl: EU gateway ring + sparse Americas bridge (LPPT/LFPG/EGLL/EDDF/LEMD/LIRF ↔ SBGR/KMIA/KEWR)
- Fuel fleet: **85** trucks; NPC auto-scales (~979 @ 89 regions)
- Next: EU-2 Nordics + Alpes + IE

## SimBrief cargo allowlist

- `packages/shared/src/career-simbrief-airports.ts`
- Data: `data/simbrief-dispatch-airports.json` (regenerate after hub changes)
- Seed: `assertDispatchHubsAreSimBriefKnown()`
- Gen: `npm run generate:simbrief-dispatch` (from `packages/shared`) — syncs catalog→JSON; does **not** call SimBrief API. Confirm ICAOs in Dispatch before adding.

## Homologate / facilities MSFS

- Recusar facility MSFS se ident ≠ catalog **ou** distância **> 25 nm** (`msfsFacilityMatchesCareerHub`).
- Persistir só ICAOs do catalog; prune deny-list de overrides.
- `pruneOrphanCareerHubs` no migrate/boot (também dropa `npcFlights` órfãos).
- `remapRetiredCareerAirportIdents` aplica `CAREER_AIRPORT_ICAO_REMAP` (ex. MPPB→MPPA) **antes** do prune — evita `Unknown origin airport` no settle.
- NI spoke: **MNMR** Montelimar (MNCE Costa Esmeralda não está no scenery default).
- Override JSON limpo de `SCCD` / `SCSN` / `SCST` / `SCTC`.

## UI (sessão)

- Removido banner vermelho boot “Select a career profile first” (`isNeedsProfileMessage` em `App.tsx`).
- Near me: default off + toggle/clear; For me tooltip; tweaks Freights layout.
