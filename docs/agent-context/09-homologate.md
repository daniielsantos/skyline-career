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

## Hubs (aeroportos career)

Não é o mesmo que airframe. Seed + facilities MSFS ≤25 nm + ICAO catalog.  
Ver `04-hubs-simbrief.md` + `.cursor/rules/career-map-expansion.mdc`.
