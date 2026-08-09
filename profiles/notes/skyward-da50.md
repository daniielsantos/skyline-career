# DA50 — discovery

**In-sim title (example):** `DA50 White`  
**Match title:** `DA50`  
**ICAO (SimBrief type):** `DA42`  
**Publisher:** `skyward`  
**Stations:** 6  
**Profile:** `skyward/da50@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 26 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 25.5 | RIGHT_MAIN |

## Notes

- Fuel via classic FUEL TANK * from writetest (LEFT_MAIN, RIGHT_MAIN).
- AUX deferred for v1.
- Payload stations from writetest: 1, 2, 3, 4, 5, 6.
- Station maxLoad: placeholder until flight_model.cfg calibrate.
- Homologated with interactive wizard.

## Homologated

- `profiles/examples/skyward-da50.json`
