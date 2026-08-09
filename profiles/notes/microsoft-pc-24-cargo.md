# PC-24 Cargo — discovery

**In-sim title (example):** `PC-24 Cargo - Empty`  
**Match title:** `PC-24 Cargo`  
**ICAO (SimBrief type):** `PC24`  
**Publisher:** `microsoft`  
**Stations:** 4  
**Profile:** `microsoft/pc-24-cargo@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 445 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 445 | RIGHT_MAIN |

## Notes

- Fuel via classic FUEL TANK * from writetest (LEFT_MAIN, RIGHT_MAIN).
- AUX deferred for v1.
- Payload stations from writetest: 1, 2, 3, 4.
- Station maxLoad: placeholder until flight_model.cfg calibrate.
- Homologated with interactive wizard.

## Homologated

- `profiles/examples/microsoft-pc-24-cargo.json`
