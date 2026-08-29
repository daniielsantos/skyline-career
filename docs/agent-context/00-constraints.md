# Hard constraints (não violar)

Acumulado das sessões Skyline Career / msfs-compat-layer.

## Produto / economia

- **Não** descapar crew pesado “só pra caber”.
- **Não** retunar `Dry` / `CARGO_FLOW_BALANCE` sem pedido explícito e medição.
- **Não** commitar dumps de pulse / logs de debug / artefatos de diagnóstico temporários.
- **Não** force-push em `main`/`master`.

## Desktop / teste

- Teste no desktop **instalado** costuma precisar de **release** (ou hot-swap consciente do Host).
- Install típico: `%LOCALAPPDATA%\Programs\Skyline Career`
- Dados: `%APPDATA%\Skyline Career\career\`
- Host empacotado: `%LOCALAPPDATA%\Programs\Skyline Career\resources\host\`

## Twin Otter / fuel

- **Não** mapear wing tanks como `LEFT_AUX` / `RIGHT_AUX` sem writetest live.
- Escrita AUX clássica → `UNRECOGNIZED_ID` → `ReceiveMessage 0xC00000B0` → Host morto / Watch `PIPE CLOSED`.
- OFP acima da capacidade dos tanques: career inject deve **clamp** (`clampFuelToCapacity`), não forçar overflow.

## Market / homologação de airframe

- **Um SKU de Market por família** (`career-player-airframes.json`). Vidros Highline/Passenger/Stol/Freighter entram no **mesmo** pack (`matchTitles` / `matchTitlePattern`), não como typeIds separados no catálogo.
- Fingerprint: tokens `stol` e `highline` são variante — Stol não pode aliasar em Passenger.
- ATR 42/72 → classe **`light_turboprop`** (par Saab 340). **Não** `medium_piston` (só DC-3/DC-6). Preço de regionais sobe via curva de cargo/MSRP/lease em `career-aircraft-pricing.ts` (não reclass).
- Cessna 404 Titan → **`light_ga`**. Um SKU `microsoft-404-titan`; cargo + pax via `familyRolesPackRelPaths`. Preço sobe via curva MSRP/lease (não reclass TP).
- Corvalis C400: SimBrief ICAO real **COL4** não existe no airframe list → proxy **`SR2T`**. OFP pode imprimir **S22T** / **SR22T** (alias Intent→OFP).
- PMDG **738 BBJ2** fica **fora do Market** (`enabled: false`) até OEW bater com SimBrief Dual Class (empty live ~102.2 klb vs OEW ~93k).
- Arte dos cards: `docs/market-airframe-card-prompts.md` + `AIRFRAME_CARD_ART` em `AircraftCards.tsx`. Um PNG por SKU de Market, não por vidro.
- Jets `pax_and_cargo`: **não** empilhar todo mismatch em `efbPaxWeightLb`. Três causas — peso/pax EFB, slots SimConnect a mais, hold &lt; bag OFP. Playbook: `docs/agent-context/12-pax-efb-due.md`.
- Homologação colaborativa: **não** implementar sem pedido. Esboço: `docs/agent-context/13-collaborative-homologation.md`. Formulário ≠ compra Hangar; captura ≠ listar Market.

## Git / release

- Commit só quando o usuário pedir.
- Release desktop: `npm run release:desktop -- --bump patch --yes`
- Repo GitHub: `daniielsantos/skyline-career`
