# C-130J Long Configuration — discovery

**In-sim title (example):** `C-130J Long Configuration`  
**Match title:** `C-130J Long Configuration`  
**ICAO (SimBrief type):** `C130`  
**Publisher:** `blackbird`  
**Stations:** 13  
**Profile:** `blackbird/c-130j-long-configuration@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 1217 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 1217 | RIGHT_MAIN |
| `FUEL TANK LEFT AUX QUANTITY` | 910 | LEFT_AUX |
| `FUEL TANK RIGHT AUX QUANTITY` | 910 | RIGHT_AUX |
| `FUEL TANK LEFT TIP QUANTITY` | 1295 | LEFT_TIP |
| `FUEL TANK RIGHT TIP QUANTITY` | 1295 | RIGHT_TIP |

## Notes

- Fuel via classic FUEL TANK * from writetest (LEFT_MAIN, RIGHT_MAIN, LEFT_AUX, RIGHT_AUX, LEFT_TIP, RIGHT_TIP).
- AUX/Aft tanks included.
- Payload stations from writetest: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 17, 18.
- Station maxLoad: placeholder until flight_model.cfg calibrate.
- Homologated with interactive wizard.

## Homologated

- `profiles/examples/blackbird-c-130j-long-configuration.json`
