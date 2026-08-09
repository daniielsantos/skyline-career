# C408 SkyCourier Cargo — discovery

**In-sim title (example):** `C408 SkyCourier Cargo - Loaded`  
**Match title:** `C408 SkyCourier Cargo`  
**ICAO (SimBrief type):** `C408`  
**Publisher:** `microsoft`  
**Stations:** 2  
**Profile:** `microsoft/c408-skycourier-cargo@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 360 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 360 | RIGHT_MAIN |

## Notes

- Fuel via classic FUEL TANK * from writetest (LEFT_MAIN, RIGHT_MAIN).
- AUX deferred for v1.
- Payload stations from writetest: 1, 2.
- Station maxLoad: placeholder until flight_model.cfg calibrate.
- Homologated with interactive wizard.

## Homologated

- `profiles/examples/microsoft-c408-skycourier-cargo.json`
