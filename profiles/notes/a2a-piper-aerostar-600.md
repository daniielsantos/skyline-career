# A2A Piper Aerostar 600 — discovery

**In-sim title (example):** `A2A Piper Aerostar 600`  
**Match title:** `A2A Piper Aerostar 600`  
**ICAO (SimBrief type):** `AEST`  
**Publisher:** `a2a`  
**Stations (profile):** 7 — Character1–6 + Baggage (LVars)  
**Recipe:** `a2a-accusim`  
**Profile:** `a2a/piper-aerostar-600@1.0.0`

> Family quirks (ghost stations, `SeatNCharacter`, wizard smoke): see **`profiles/notes/a2a-accusim.md`**.

## Fuel tanks

| Id | Write LVar | Capacity (usable) | Classic mirror |
|----|------------|-------------------|----------------|
| `LEFT_MAIN` | `FuelLeftWingTank` | ~62 gal (`FuelWingTankCapacity`) | `FUEL TANK LEFT MAIN QUANTITY` |
| `RIGHT_MAIN` | `FuelRightWingTank` | ~62 gal | `FUEL TANK RIGHT MAIN QUANTITY` |
| `CENTER` | `FuelFuselageTank` | ~41.5 gal (`FuelFuselageTankCapacity`) | `FUEL TANK CENTER QUANTITY` |

Wing tanks total ~124 gal usable; fuselage ~41.5. Classic QUANTITY writes are ignored (Accu-Sim).

## Payload

| Station | Write LVars | Notes |
|---------|-------------|--------|
| 1–6 | `CharacterNWeight` + `SeatNCharacter` | EFB seat paint needs occupancy |
| 7 | `BaggageWeight` | max ~`BaggageMax` (tablet also shows max baggage ~240 lb on this airframe) |

## Homologation path

1. Classic writetest fails → recipe match `a2a-accusim`
2. LVar write probe (e.g. `FuelLeftWingTank`)
3. `draftProfileFromVendorRecipe` → `lvar-bridge` (+ `SeatNCharacter` soft-bool steps)
4. Smoke / tablet check → promote

```powershell
npm run start:local
npm run homologate
node packages/agent/dist/cli.js apply-auto --fuel-left 30 --fuel-right 30 --fuel-center 20 --station 1=180 --station 2=50 --station 3=25
```

## Package / sources

- Community package (example): `a2a-aircraft-aerostar600`
- Tablet: `html_ui/.../Aerostar600App/A2ATabletApp.js` (Fuel* / Character* / Seat*)

## Homologated

- `profiles/examples/a2a-piper-aerostar-600.json`
- Recipe: `profiles/vendors/a2a-accusim.json`
