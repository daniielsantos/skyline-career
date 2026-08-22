# 404 Titan Passengers — discovery

**In-sim title (example):** `404 Titan Passengers`  
**Match title:** `404 Titan Passengers`  
**ICAO (SimBrief type):** `C404`  
**Publisher:** `microsoft`  
**Stations:** 15  
**Profile:** `microsoft/404-titan-passengers@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 174 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 174 | RIGHT_MAIN |

## Notes

- Fuel via classic FUEL TANK * from writetest (LEFT_MAIN, RIGHT_MAIN).
- AUX deferred for v1.
- Payload stations from writetest: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15.
- Station maxLoad: placeholder until flight_model.cfg calibrate.
- Homologated with interactive wizard.
- Market family: `microsoft-404-titan` — pack
  `profiles/ofp/microsoft-404-titan-passengers.json` (15 stations); sibling cargo pack (4).

## Homologated

- `profiles/examples/microsoft-404-titan-passengers.json`
