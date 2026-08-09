# C750 — discovery

**In-sim title (example):** `C750 - Livery 1`  
**Match title:** `C750`  
**ICAO (SimBrief type):** `C750`  
**Publisher:** `flightfx`  
**Stations:** 12  
**Profile:** `flightfx/c750@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 521 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 521 | RIGHT_MAIN |
| `FUEL TANK CENTER QUANTITY` | 888 | CENTER |

## Notes

- Fuel via classic FUEL TANK * from writetest (LEFT_MAIN, RIGHT_MAIN, CENTER).
- AUX deferred for v1.
- Payload stations from writetest: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12.
- Station maxLoad: placeholder until flight_model.cfg calibrate.
- Homologated with interactive wizard.

## Homologated

- `profiles/examples/flightfx-c750.json`
