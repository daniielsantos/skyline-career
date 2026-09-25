# Hard constraints (não violar)

Acumulado das sessões Skyline Career / msfs-compat-layer.

## Produto / economia

- **Não** descapar crew pesado “só pra caber”.
- **Não** retunar `Dry` / `CARGO_FLOW_BALANCE` sem pedido explícito e medição.
- **Não** commitar dumps de pulse / logs de debug / artefatos de diagnóstico temporários.
- **Não** force-push em `main`/`master`.

## Desktop / teste

- Teste no desktop **instalado** costuma precisar de **release** (ou hot-swap consciente do Host).
- Install típico: `%LOCALAPPDATA%\Programs\Airframe Career` (legado: `…\Skyline Career`)
- Dados: `%APPDATA%\Airframe Career\career\` (1ª abertura copia de `%APPDATA%\Skyline Career\` se existir; pasta legado fica de backup)
- Host empacotado: `%LOCALAPPDATA%\Programs\Airframe Career\resources\host\` (ou legado Skyline)

## Twin Otter / fuel

- Wing outers = **LEFT_MAIN / RIGHT_MAIN** (37 gal), not `LEFT_AUX` / `RIGHT_AUX` (qty 0).
- Do **not** invent classic AUX writes on this airframe — wrong slot; older Host crashes were from bad vars.
- Detail: `docs/agent-context/02-twin-otter-fuel.md`.
- OFP acima da capacidade dos tanques: career inject deve **clamp** (`clampFuelToCapacity`), não forçar overflow.

## Market / homologação de airframe

- **Um SKU de Market por família** (`career-player-airframes.json`). Vidros Highline/Passenger/Stol/Freighter entram no **mesmo** pack (`matchTitles` / `matchTitlePattern`), não como typeIds separados no catálogo.
- Fingerprint: tokens `stol` e `highline` são variante — Stol não pode aliasar em Passenger.
- ATR 42/72 → classe **`light_turboprop`** (par Saab 340). **Não** `medium_piston` (só DC-3/DC-6). Preço de regionais sobe via curva de cargo/MSRP/lease em `career-aircraft-pricing.ts` (não reclass).
- Cessna 404 Titan → **`light_ga`**. Um SKU `microsoft-404-titan`; cargo + pax via `familyRolesPackRelPaths`. Preço sobe via curva MSRP/lease (não reclass TP).
- Corvalis C400: SimBrief ICAO real **COL4** não existe no airframe list → proxy **`SR2T`**. OFP pode imprimir **S22T** / **SR22T** (alias Intent→OFP).
- PMDG **738 BBJ2** fica **fora do Market** (`enabled: false`) até OEW bater com SimBrief Dual Class (empty live ~102.2 klb vs OEW ~93k).
- Arte dos cards: `docs/market-airframe-card-prompts.md` + `AIRFRAME_CARD_ART` em `AircraftCards.tsx`. Um PNG por SKU de Market, não por vidro.
- A340-300 iniBuilds: um SKU `inibuilds-a340-300`; SimBrief **Passenger / Preighter / VIP** (não Default). Freighter glass → Preighter. Fingerprint: freighter exige token cargo no título (mesmo `structuralHash` pax/VIP/EIS).
- 737 Max 8: um SKU `asobo-737-max-8-passengers` (Asobo + iFly MAX 8 / 8200); aliases `ifly-737-max-*`. Market “i” lista Asobo + iFly.
- A300-600 iniBuilds: um SKU `inibuilds-a300-600`; SimBrief **A300-600R GE / PW** (não Default). Freighter glass usa a mesma row do motor (SimBrief sem Preighter). Live title inference escolhe GE vs PW.
- L1011-500 iniBuilds: um SKU `inibuilds-l1011-500`; SimBrief **Regular / Pod Ferry** (não Default). Engine Pod glass → Pod Ferry. Lounge ≠ Standard via tokens `lounge`/`pod`.
- Contrail Falcon 50: `light_jet` inject via **FUELSYSTEM 1–6** + panel switch LVars off (EFB path); **engines off**. Não Accu-Sim qty LVars.
- Jets `pax_and_cargo`: **não** empilhar todo mismatch em `efbPaxWeightLb`. Causas distintas (pax lb EFB, slots SimConnect, hold &lt; bag, OEW Default≠glass, ghosts) — playbook: `docs/agent-context/12-pax-efb-due.md`. Ao fechar um diagnóstico, **atualizar esse `.md` no mesmo turno**.
- Homologação colaborativa: **não** implementar sem pedido. Esboço: `docs/agent-context/13-collaborative-homologation.md`. Formulário ≠ compra Hangar; captura ≠ listar Market.

## Watch / SimBridge / Crew Live

- **Watch/SimBridge são sagrados.** Não alterar probe/Preflight/Watch auto-start/pipe ownership “por causa do Live”. Live não pode virar segundo dono do SimBridge.
- Uplink Crew Live = **soft POST do sample do Watch** only (2026-09-22 shipped). Sem segundo pipe / probe / Preflight. Detail: `16-va-logistics.md` → “Sketch: soft Live uplink”.
- **Pipe hygiene (Watch, não Live):** depois do 1º Loaded vs Due, Preflight e probe **param** até Watch `running` (ou `in_flight`); Watch auto-start ~2s com LV. Reverter isso “junto com Live” quebra Ready→En route de novo.
- **Watch após Ready:** auto-start **não** exige aba Dispatch — sair pra Crew/Hangar com LV e decolar sem Watch deixava DISPATCHED (2026-09-25).
- **Watch depart + sticky pause:** `evaluateMissionFlightTransition` **deve** receber `prevSample` — sem isso, sticky `IS PAUSED` bloqueia En route enquanto o footer ainda mostra PHASE CLIMB (2026-09-25).
- **Watch auto-start + effect cancel:** com Loaded vs Due (ou `in_flight`), **não** `postWatchStop` só porque o effect remount cancelou o await — isso piscava MSFS↔SIMBRIDGE no open (2026-09-25).
- **Resume prep (MSFS restart @ origin):** manter `in_flight`; **não** reverter status. Unlock reinject + Loaded vs Due no En route quando `isResumePrepAtOrigin` (chão + sawAirborne + nearOrigin + !nearDest). `/api/load-ofp` aceita `in_flight`. Watch deve **amostrar LV no ramp também em `in_flight`** (não só `dispatched`) — senão cards ficam congelados pós-restart. Layout = tiles En route (não `preflight-load-grid`). Detail: `16-va-logistics.md`.
- **En route live fuel:** em `in_flight` airborne, Watch amostra **fuel-only** (~10s, `sampleLiveFuelLb`) — sem stations. Soft marks OFP dep; não flipar `ready` só por burn.
- **Settle overlay @ origin:** poll Watch **não** arma `settleOverlaySticky` com parking brake no DEP — exige `destProximity.ok` (mesmo gate do optimisticLandedSettle). Senão BACK AT DEPARTURE pisca Settling.
- **Accu-Sim dead-holds probe:** **não** rodar `probeFreighterBaggageStations` em `a2a-lvars` / `lvar-bridge` — lê classic mirrors e pode zerar cargo stations no resume inject.
- Preflight **não** deve gravar `ORIGIN_NOT_ON_GROUND` como `location.ok=false` quando airborne **dentro** do raio (parece “NOT AT ORIGIN” com 0.3 nm ≤ 12).
- Detail: `docs/agent-context/16-va-logistics.md` (Crew Live notes).

## Git / release

- Commit só quando o usuário pedir.
- Release desktop: `npm run release:desktop -- --bump patch --yes`
- Repo GitHub: `daniielsantos/skyline-career`
