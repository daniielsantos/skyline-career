# Contrail Falcon 50 — discovery

**In-sim title (example):** `Contrail Falcon 50`  
**Match title:** `Contrail Falcon 50`  
**ICAO (SimBrief type):** `FA50`  
**Publisher:** `contrail`  
**Stations:** 15  
**Profile:** `contrail/contrail-falcon-50@1.1.1`

## Fuel tanks (EFB / FUELSYSTEM)

| FS # | EFB label | Cap (gal) | Profile id |
|------|-----------|-----------|------------|
| 1 | Left Wing | 559 | LEFT_AUX |
| 2 | Center Wing | 410 | CENTER |
| 3 | Right Wing | 559 | RIGHT_AUX |
| 4 | Left Feeder | 210 | LEFT_MAIN |
| 5 | Center Feeder | 367 | CENTER2 |
| 6 | Right Feeder | 210 | RIGHT_MAIN |

Total usable ≈ 2315 gal (~15.5k lb Jet-A).

## Inject path

Classic MAIN/AUX writetest looked “partial” because Contrail **rebalances** while fuel-panel switches are on. The LiteEFB `applyFuelWeight` writes `FUELSYSTEM TANK QUANTITY:1–6` then `ensureTankSwitchesOff` on:

- `L:CTL_FA50_FUEL_PANEL_LH_WING_SW`
- `L:CTL_FA50_FUEL_PANEL_RH_WING_SW`
- `L:CTL_FA50_FUEL_PANEL_CENTER_SW`
- `L:CTL_FA50_FUEL_PANEL_REAR_SW`

Skyline mirrors that (not Accu-Sim qty LVars like Aerostar).

**Smoke (2026-09-23):** 1ª tentativa engines **on** → `FUEL_VERIFY_FAILED` (GW ok, FS:1/2 ~20 gal under, tol 3%). Fix @1.1.1: `requireEnginesOff`, dual write + settle 2s, tol 8%. **2ª tentativa engines off → fuel/payload/CG success.**

## SimBrief

- Type **FA50**
- Row: `Contrail (MSFS) - Falcon 50B` (not Default)

## Notes

- Payload stations 1–15 writetest sticky.
- Market class: `light_jet`.
- Smoke with **engines off**, parking brake on.

## Homologated

- `profiles/examples/contrail-contrail-falcon-50.json`
