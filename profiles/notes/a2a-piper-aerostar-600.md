# A2A Piper Aerostar 600 — discovery

**In-sim title:** `A2A Piper Aerostar 600`  
**Match title:** `A2A Piper Aerostar 600`  
**ICAO (SimBrief type):** `AEST`  
**Publisher:** `a2a`  
**Stations (SimConnect count):** 20 (host snapshot may only expose 14 weights)  
**Profile:** _(not promoted yet — needs `lvar-bridge`)_  

## Why `simconnect-direct` fails

Accu-Sim owns fuel and payload. Classic SimVars are **read-only mirrors**:

- `FUEL TANK LEFT/RIGHT MAIN QUANTITY`, `FUEL TANK CENTER QUANTITY` — readable
- `PAYLOAD STATION WEIGHT:*` — readable
- Writes to those SimVars are **silently ignored** (wizard writetest: value unchanged)

Fuel density live: **6.0 lb/gal** (avgas).

### Classic capacities (SimConnect)

| Tank | Capacity | Notes |
|------|----------|--------|
| Left main | 66.5 gal | wing |
| Right main | 66.5 gal | wing |
| Center | 44 gal | fuselage |
| **Total** | **177 gal** | ~174.5 usable per A2A manual |

## How we found the LVars

Package on disk: `D:\Community2024\a2a-aircraft-aerostar600`

1. Tablet UI: `html_ui/efb_ui/efb_apps/Aerostar600App/A2ATabletApp.js`  
   - Fuel page sets `FuelLeftWingTank` / `FuelRightWingTank` / `FuelFuselageTank` / `FuelPreset`
   - Payload uses `Character1Weight`…`Character6Weight`, `SeatNCharacter`, `BaggageWeight`, `PayloadWeight`
2. Panel/Accu-Sim XML under `SimObjects/Airplanes/aerostar600/common/panel/xml/` references the same `L:Fuel*Tank` names (often with `,gallons` in RPN).

Do **not** invent names — grep the Community package + confirm with `probe-lvars`.

## Working LVar map (verified live)

Bridge: SimConnect `L:` read/write (SU12+). Tooling: `npm run probe-lvars`.

| Role | LVar | Verified |
|------|------|----------|
| Left wing qty | `FuelLeftWingTank` | write → mirrors `FUEL TANK LEFT MAIN QUANTITY` |
| Right wing qty | `FuelRightWingTank` | write → mirrors RIGHT MAIN |
| Fuselage qty | `FuelFuselageTank` | write → mirrors CENTER |
| Wing capacity (usable) | `FuelWingTankCapacity` | ~62 gal (not 66.5 total) |
| Fuselage capacity (usable) | `FuelFuselageTankCapacity` | ~41.5 gal (not 44 total) |
| Preset | `FuelPreset` | 0/1/2 from tablet presets |
| Pilot / pax weights | `Character1Weight` … `Character6Weight` | Char1 write → `PAYLOAD STATION WEIGHT:1` |
| Seat occupancy | `Seat1Character` … | 1 = occupied, etc. |
| Baggage | `BaggageWeight` / `BaggageMax` | Max ~400 lb |
| Totals / CG | `PayloadWeight`, `TotalWeight`, `CoG`, `CoGpct`, … | read |

Example write test that stuck:

```text
✓ FuelLeftWingTank  62 → 30  (LEFT MAIN mirror 30)
✓ FuelRightWingTank 62 → 30
✓ FuelFuselageTank  41.5 → 20  (CENTER mirror 20)
✓ Character1Weight  170 → 180  (station 1 = 180)
```

## Homologation status

- **Cannot** finish `npm run homologate` yet: wizard gate still requires classic/FUELSYSTEM SimVar writes.
- **Can** build an `a2a/piper-aerostar-600` profile with:
  - `capabilities: ["simconnect", "lvar"]`
  - `fuel.strategy: "lvar-bridge"`
  - tanks: LEFT_MAIN / RIGHT_MAIN / CENTER → the three `Fuel*Tank` LVars
  - payload via Character/Baggage LVars (not raw station writeback alone)
- Next product work: extend wizard (or a one-shot promote) for Accu-Sim / `probe-lvars` → draft.

## Commands

```powershell
# restart host after native rebuild
npm run start:local

npm run probe-lvars
node packages/agent/dist/cli.js probe-lvars --preset a2a-aerostar --watch 60
node packages/agent/dist/cli.js probe-lvars --write FuelLeftWingTank=40 --write FuelFuselageTank=20
```

## Manual / product refs

- A2A Accu-Sim Aerostar 600 (tablet owns load)
- Usable fuel ~174.5 gal (42 fuselage + 66.25 each wing) per A2A docs
