# 404 Titan Cargo — discovery

**In-sim title (example):** `404 Titan Cargo - Empty`  
**Match title:** `404 Titan Cargo`  
**ICAO (SimBrief type):** `C404`  
**Publisher:** `microsoft`  
**Stations:** 4  
**Profile:** `microsoft/404-titan-cargo@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 174 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 174 | RIGHT_MAIN |

## Notes

- Fuel via classic FUEL TANK * from writetest (LEFT_MAIN, RIGHT_MAIN).
- AUX deferred for v1.
- Payload stations from writetest: 1, 2, 3, 4.
- Station maxLoad: placeholder until flight_model.cfg calibrate.
- Homologated with interactive wizard.
- Market family: `microsoft-404-titan` — pack
  `profiles/ofp/microsoft-404-titan-cargo.json` (4 stations); sibling passengers pack (15).

## Homologated

- `profiles/examples/microsoft-404-titan-cargo.json`
