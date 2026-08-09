# C408 SkyCourier Passenger — discovery

**In-sim title (example):** `C408 SkyCourier Passenger`  
**Match title:** `C408 SkyCourier Passenger`  
**ICAO (SimBrief type):** `C408`  
**Publisher:** `microsoft`  
**Stations:** 7  
**Profile:** `microsoft/c408-skycourier-passenger@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 360 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 360 | RIGHT_MAIN |

## Notes

- Fuel via classic FUEL TANK * from writetest (LEFT_MAIN, RIGHT_MAIN).
- AUX deferred for v1.
- Payload stations from writetest: 1, 2, 3, 4, 5, 6, 7.
- Station maxLoad: placeholder until flight_model.cfg calibrate.
- Homologated with interactive wizard.

## Homologated

- `profiles/examples/microsoft-c408-skycourier-passenger.json`
