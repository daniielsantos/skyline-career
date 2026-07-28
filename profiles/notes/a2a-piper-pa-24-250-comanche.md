# A2A Piper PA-24-250 Comanche — discovery

**In-sim title (example):** `A2A Piper PA-24-250 Comanche`  
**Match title:** `A2A Piper PA-24-250 Comanche`  
**ICAO (SimBrief type):** `PA24`  
**Publisher:** `a2a`  
**Stations (profile):** 7 — Character1–6 + Baggage (LVars; EFB shows 4 seats)  
**Recipe:** `a2a-accusim`  
**Profile:** `a2a/piper-pa-24-250-comanche@1.0.0`

> Family quirks (tip vs fuselage, SeatNCharacter, ghost stations): see **`profiles/notes/a2a-accusim.md`**.

## Fuel tanks

| Id | Write LVar | Capacity | Classic mirror |
|----|------------|----------|----------------|
| `LEFT_MAIN` | `FuelLeftWingTank` | 30 gal | `FUEL TANK LEFT MAIN QUANTITY` |
| `RIGHT_MAIN` | `FuelRightWingTank` | 30 gal | `FUEL TANK RIGHT MAIN QUANTITY` |
| `LEFT_TIP` | `FuelLeftTipTank` | 15 gal | `FUEL TANK LEFT TIP QUANTITY` |
| `RIGHT_TIP` | `FuelRightTipTank` | 15 gal | `FUEL TANK RIGHT TIP QUANTITY` |

No fuselage/`CENTER` on this airframe. `FuelFuselageTank` may still be readable as an Accu-Sim ghost — draft skips it (capacity &lt; 5).

## Payload

| Station | Write LVars |
|---------|-------------|
| 1–6 | `CharacterNWeight` + `SeatNCharacter` |
| 7 | `BaggageWeight` |

```powershell
node packages/agent/dist/cli.js apply-auto `
  --fuel-left 24 --fuel-right 24 --fuel-left-tip 10 --fuel-right-tip 10 `
  --station 1=180 --station 2=50 --station 7=40
```

## Homologated

- `profiles/examples/a2a-piper-pa-24-250-comanche.json`
- Recipe: `profiles/vendors/a2a-accusim.json`
