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

## Market SKU (família vs vidro)

Não criar um `typeId` de catálogo por Highline/Passenger/Stol. Um SKU + um (ou poucos) OFP pack(s):

| SKU | Classe | Pack / roles | SimBrief |
|-----|--------|----------------|----------|
| `microsoft-atr-72-600` | `light_turboprop` | `profiles/ofp/microsoft-atr-72-600.json` | AT76 |
| `microsoft-atr-42-600` | `light_turboprop` | `profiles/ofp/microsoft-atr-42-600.json` | AT46 |
| `microsoft-404-titan` | `light_ga` | cargo + passengers (`familyRolesPackRelPaths`) | (pack) |
| `microsoft-c400-corvalis` | `light_ga` | `profiles/ofp/microsoft-c400-corvalis.json` | **SR2T** (COL4 não existe no SimBrief) |
| `inibuilds-a330-200` | `wide_freighter` | `profiles/ofp/inibuilds-a330-200.json` (GE/RR/VIP) | **A332** Default |
| `inibuilds-a330-300` | `wide_freighter` | `profiles/ofp/inibuilds-a330-300.json` (GE/RR/VIP/P2F) | **A333** Default |
| `asobo-737-max-8-passengers` | `narrow_freighter` | `profiles/ofp/asobo-737-max-8-passengers.json` | **B38M** Default |

Vidros: `profiles/examples/microsoft-atr-*-highline-*.json` etc. + `matchTitles` no pack. Alias de typeId legado → família em `LEGACY_AIRFRAME_ALIASES`.

Prompts de arte de card: `docs/market-airframe-card-prompts.md` (kit da classe, 16:9, PNG em `career-ui/public/airframes/`).

Jets de passageiro no Market (`loadLayout: pax_and_cargo`): Loaded vs Due vs tablet — **não** é o mesmo que inject writetest. Ver [`12-pax-efb-due.md`](./12-pax-efb-due.md).

Captura por jogador / fila de review (On Air–like): **não shipado**. Esboço em [`13-collaborative-homologation.md`](./13-collaborative-homologation.md).

## Hubs (aeroportos career)

Não é o mesmo que airframe. Seed + facilities MSFS ≤25 nm + ICAO catalog.  
Ver `04-hubs-simbrief.md` + `.cursor/rules/career-map-expansion.mdc`.
