# BN2 Islander - Cargo / Analogue / Tip Tanks — discovery

**In-sim title (example):** `BN2 Islander - Cargo / Analogue / Tip Tanks`  
**Match title:** `BN2 Islander - Cargo / Analogue / Tip Tanks`  
**ICAO (SimBrief type):** `BN2P`  
**Publisher:** `blackbox`  
**Stations:** 4  
**Profile:** `blackbox/bn2-islander-cargo-analogue-tip-tanks@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 65 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 65 | RIGHT_MAIN |
| `FUEL TANK LEFT AUX QUANTITY` | 27.5 | LEFT_AUX |
| `FUEL TANK RIGHT AUX QUANTITY` | 27.5 | RIGHT_AUX |

## Notes

- Fuel via classic FUEL TANK * from writetest (LEFT_MAIN, RIGHT_MAIN, LEFT_AUX, RIGHT_AUX).
- AUX/Aft tanks included.
- Payload stations from writetest: 1, 2, 3, 4.
- Station maxLoad: placeholder until flight_model.cfg calibrate.
- Homologated with interactive wizard.

## Homologated

- `profiles/examples/blackbox-bn2-islander-cargo-analogue-tip-tanks.json`
