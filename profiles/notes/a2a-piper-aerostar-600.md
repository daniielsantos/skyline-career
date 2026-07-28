# A2A Piper Aerostar 600 — discovery

**In-sim title:** `A2A Piper Aerostar 600`  
**Match title:** `A2A Piper Aerostar 600`  
**ICAO (SimBrief type):** `AEST`  
**Publisher:** `a2a`  
**Stations (profile):** 7 (Character1–6 + Baggage via LVars)  
**Profile:** `a2a/piper-aerostar-600@1.0.0`  
**Fuel strategy:** `lvar-bridge`

## Why `simconnect-direct` fails

Accu-Sim owns fuel and payload. Classic SimVars are **read-only mirrors**:

- `FUEL TANK LEFT/RIGHT MAIN QUANTITY`, `FUEL TANK CENTER QUANTITY` — readable
- `PAYLOAD STATION WEIGHT:*` — readable
- Writes to those SimVars are **silently ignored**

Fuel density live: **6.0 lb/gal** (avgas).

### Classic capacities (SimConnect totals)

| Tank | Capacity | Notes |
|------|----------|--------|
| Left main | 66.5 gal | wing |
| Right main | 66.5 gal | wing |
| Center | 44 gal | fuselage |
| **Total** | **177 gal** | ~174.5 usable per A2A manual |

Profile uses **usable** capacities from LVars (~62 / 62 / 41.5).

## How we found the LVars

Package: `D:\Community2024\a2a-aircraft-aerostar600`

1. Tablet: `html_ui/efb_ui/efb_apps/Aerostar600App/A2ATabletApp.js` sets `FuelLeftWingTank` / `FuelRightWingTank` / `FuelFuselageTank` / `FuelPreset` and Character/Baggage weights.
2. Panel XML under `SimObjects/Airplanes/aerostar600/common/panel/xml/` references the same `L:Fuel*Tank` names.
3. Confirmed with `npm run probe-lvars` (read + write + SimVar mirrors).

## Working LVar map

| Role | LVar | Mirror / notes |
|------|------|----------------|
| Left wing qty | `FuelLeftWingTank` | → `FUEL TANK LEFT MAIN QUANTITY` |
| Right wing qty | `FuelRightWingTank` | → `FUEL TANK RIGHT MAIN QUANTITY` |
| Fuselage qty | `FuelFuselageTank` | → `FUEL TANK CENTER QUANTITY` |
| Wing capacity (usable) | `FuelWingTankCapacity` | ~62 gal |
| Fuselage capacity (usable) | `FuelFuselageTankCapacity` | ~41.5 gal |
| Pilot / pax | `Character1Weight`…`Character6Weight` | Char1 → station 1 |
| Baggage | `BaggageWeight` | max ~400 (`BaggageMax`) |

## Homologation

Wizard path when classic writetest fails:

1. Probe Accu-Sim LVars  
2. LVar write smoke on `FuelLeftWingTank`  
3. Draft via `draftA2aAerostarProfile` (`lvar-bridge`)  
4. Calibrate (LVar probes, offset usually 0)  
5. Promote → `profiles/examples/a2a-piper-aerostar-600.json`

```powershell
npm run start:local   # after native rebuild
npm run homologate    # on Aerostar — choose Accu-Sim / lvar-bridge when offered
npm run probe-lvars
node packages/agent/dist/cli.js apply-auto --fuel-left 30 --fuel-right 30 --fuel-center 20 --station 1=180
```

## Homologated

- `profiles/examples/a2a-piper-aerostar-600.json`
