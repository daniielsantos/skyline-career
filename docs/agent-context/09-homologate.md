# Homologar aeronave (player inject)

Objetivo: perfil em `profiles/examples/` que o Career resolve pelo título live e consegue **escrever** fuel + payload.

## Fluxo padrão

```powershell
npm run build
npm run build:native
npm run host:simconnect   # MSFS no avião, solo

node packages/agent/dist/cli.js writetest
node packages/agent/dist/cli.js draft-profile --calibrate
node packages/agent/dist/cli.js smoke --profile profiles/drafts\<arquivo>.json
# promover drafts → profiles/examples, semver 1.0.0, notes em profiles/notes/
```

## O que o perfil precisa

- `match.title` / `liveTitles` alinhados ao título MSFS
- Tanques com `readVar`/`writeVar` que o **writetest** confirmou (não inventar AUX/TIP)
- Stations com índices writáveis + `maxLoad` razoável
- `writePlan` + `verify` (offset de fuel via calibrate)
- `gating`: on ground; engines off se o airframe exigir para drenar tanques

## Armadilhas

- Vars de tanque **não registradas** → `UNRECOGNIZED_ID` → Host morto (ver Twin Otter AUX).
- Densidade: Jet-A ~6.7 vs avgas ~6.0 — OFP em lb / tanque em gal.
- Capacidade do hangar (`fuelCapacityKg`) deve bater com tanques homologados.
- Career inject: `clampFuelToCapacity` quando OFP > tanques.
- **`maxLoad` placeholder 500:** inject Due = Σ maxLoad. Wizard cascade: cfg (`station_load` >500) → **split SimBrief/useful-load** nas bag stations (S1/S2 ≥750). Sem probe de clamp live (MSFS quase sempre aceita qualquer peso). Market `maxCargoKg` via SimBrief **não** substitui maxLoad no inject (YS-11: 6×500 capava o avião).
- Stations **>16** (EMB-110 pax / Saab): Watch overflow batch; wizard avisa no discovery. Discovery/fingerprint/probe CLI cap = **48** (`PAYLOAD_STATION_DISCOVERY_MAX`; Saab COUNT≈37). Saab **Passenger**: S1–2 crew, S3–36 as `baggageStations` maxLoad 500 (não soft-max 300), S37 excluded; **`cg.policy: none`** (braços ruins + ballast estourava Due). Vidro **Cargo** continua freighter 6-station.
- Soft re-probe: holds que grudam e esvaziam (C408) saem do draft antes do promote.
- Force-include AUX com write falho: **não** (Host risk); remap para MAIN sticky.
- `maxCargoKg` com stations ainda em placeholder 500: wizard prefere SimBrief. Catálogo antigo: `npm run airframes:backfill-simbrief-cargo` / `-- --apply`.
- **Fingerprint structural igual ≠ mesmo vidro:** A340-300 pax/VIP/Freighter × EIS1/EIS2 partilham `structuralHash`. Resolve só com `liveTitles` / `titlesMatchForCatalog` — freighter não pode aceitar título sem `Freighter`/`Cargo` (bug: `A340-300 EIS1` → perfil Freighter EIS1).
- **C152 Manifest max 0 lb (2026-09-17):** starter C152 em hop curto mostrou `max 0.0 klb` / `Choose between 1 and 0 lb`. Não é endpoint travado — `/api/cargo-limit` (`light_ga`) consulta SimBrief; C152 usa proxy **C172**. OEW SimBrief C172 (~740–767 kg) + `resolveConservativeOpsWeights` `max(OEW)+min(MTOW)` vs MTOW catálogo **760** → useful ~0/− → `operationalMaxCargoKg: 0`. Audit live SimBrief proxies: **colapsam** C152, Arrow III, DR400; Norden colapsa mesmo com catálogo (useful 210 kg < 2-crew~154 + margin 50); Warrior/Dakota finos mas >0; Corvalis SR2T / DA50→DA42 / Commander→C182 OK. Fix: se mixed headroom ≤ crew+100 kg, cargo-limit usa OEW/MTOW/fuel do catálogo (SimBrief ainda manda em `maxCargoKg` / BN2 soft).
- **Manifest load stuck at 0 after aircraft switch (2026-09-17):** Duke shows “Choose between 1 and 992 lb” with Load=0 / pay $1; switching aircraft again “fixes” it. Cause: live `maxCargoKg` state from previous tail (C152 ops=0) still applied while Duke selected; `clampDraftToCapacity` only clamps **down** (`min(cargo, max)`), so 0 stays 0 after Duke limit arrives. Fix: bind cargo-limit to `aircraftId` + ignore stale fetches; clear ops cap on `changeStagingAircraft` and refill empty lines with `defaultStagingKg` when capacity becomes >0.

## Market SKU (família vs vidro)

Não criar um `typeId` de catálogo por Highline/Passenger/Stol. Um SKU + um (ou poucos) OFP pack(s):

| SKU | Classe | Pack / roles | SimBrief |
|-----|--------|----------------|----------|
| `microsoft-atr-72-600` | `light_turboprop` | `profiles/ofp/microsoft-atr-72-600.json` | AT76 |
| `microsoft-atr-42-600` | `light_turboprop` | `profiles/ofp/microsoft-atr-42-600.json` | AT46 |
| `microsoft-404-titan` | `light_ga` | cargo + passengers (`familyRolesPackRelPaths`) | (pack) |
| `microsoft-c400-corvalis` | `light_ga` | `profiles/ofp/microsoft-c400-corvalis.json` | **SR2T** (COL4 não existe no SimBrief) |
| `inibuilds-a330-200` | `wide_freighter` | `profiles/ofp/inibuilds-a330-200.json` (GE/RR/VIP) | **A332** `iniBuilds (MSFS) - A330-200 GE/RR` (not Default) |
| `inibuilds-a330-300` | `wide_freighter` | `profiles/ofp/inibuilds-a330-300.json` (GE/RR/VIP/P2F) | **A333** `iniBuilds (MSFS) - A330-300 GE/RR` (+ P2F rows) |
| `inibuilds-a340-300` | `wide_freighter` | pax + freighter + VIP packs (`familyRolesPackRelPaths`) | **A343** Passenger / Preighter / VIP (not Default; Freighter glass → Preighter) |
| `asobo-737-max-8-passengers` | `narrow_freighter` | `profiles/ofp/asobo-737-max-8-passengers.json` | **B38M** Default |
| `synaptic-a220-300` | `narrow_freighter` | `profiles/ofp/synaptic-a220-300.json` | **BCS3** `Synaptic / iniBuilds (MSFS) - A220-300` (not Default) |
| `skyward-cessna-c680` | `light_jet` | `profiles/ofp/skyward-cessna-c680.json` | **C680** `Skyward Simulations (MSFS) - C680 Sovereign+` (not Default); passenger **`inject_verified`** + `efbPaxWeightLb: 210` / S14–S16 ghosts omitted |
| `justflight-146-100` | `narrow_freighter` | `justflight-146-100` + Statesman family | **B461** JF MSFS (Statesman → CC2) |
| `justflight-146-200` | `narrow_freighter` | `justflight-146-200` + QC/QT freighter family | **B462** JF MSFS (QT → QC/QT) |
| `justflight-146-300` | `narrow_freighter` | `justflight-146-300` + QT freighter family | **B463** JF MSFS (QT → QT) |

Vidros: `profiles/examples/microsoft-atr-*-highline-*.json` etc. + `matchTitles` no pack. Alias de typeId legado → família em `LEGACY_AIRFRAME_ALIASES`.

Prompts de arte de card: `docs/market-airframe-card-prompts.md` (kit da classe, 16:9, PNG em `career-ui/public/airframes/`).

Jets de passageiro no Market (`loadLayout: pax_and_cargo`): Loaded vs Due vs tablet — **não** é o mesmo que inject writetest. Ver [`12-pax-efb-due.md`](./12-pax-efb-due.md).

Captura por jogador / fila de review (On Air–like): **não shipado**. Esboço em [`13-collaborative-homologation.md`](./13-collaborative-homologation.md).

## Hubs (aeroportos career)

Não é o mesmo que airframe. Seed + facilities MSFS ≤25 nm + ICAO catalog.  
Ver `04-hubs-simbrief.md` + `.cursor/rules/career-map-expansion.mdc`.
