# LEARJET 35A CARGO — discovery

**In-sim title (example):** `LEARJET 35A CARGO`  
**Match title:** `LEARJET 35A CARGO`  
**ICAO (SimBrief type):** `LJ35`  
**Publisher:** `flysimware`  
**Stations:** 6  
**Profile:** `flysimware/learjet-35a-cargo@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 187.2 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 187.2 | RIGHT_MAIN |
| `FUEL TANK CENTER QUANTITY` | 200 | CENTER |
| `FUEL TANK LEFT AUX QUANTITY` | 178.5 | LEFT_AUX |
| `FUEL TANK RIGHT AUX QUANTITY` | 178.5 | RIGHT_AUX |

## Notes

- Fuel via classic FUEL TANK * from writetest (LEFT_MAIN, RIGHT_MAIN, CENTER, LEFT_AUX, RIGHT_AUX).
- AUX/Aft tanks included.
- Payload stations from writetest: 1, 2, 3, 4, 5, 6.
- Station maxLoad: placeholder until cfg or clamp.
- Homologated with interactive wizard.

## Homologated

- `profiles/examples/flysimware-learjet-35a-cargo.json`
