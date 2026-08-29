# YS-11 — discovery

**In-sim title (example):** `YS-11`  
**Match title:** `YS-11`  
**ICAO (SimBrief type):** `YS11`  
**Publisher:** `inibuilds`  
**Stations:** 6  
**Profile:** `inibuilds/ys-11@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 230 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 359 | RIGHT_MAIN |
| `FUEL TANK LEFT AUX QUANTITY` | 700 | LEFT_AUX |
| `FUEL TANK RIGHT AUX QUANTITY` | 700 | RIGHT_AUX |

## Notes

- Fuel via classic FUEL TANK * from writetest (LEFT_MAIN, RIGHT_MAIN, LEFT_AUX, RIGHT_AUX).
- AUX/Aft tanks included.
- Payload stations from writetest: 1, 2, 3, 4, 5, 6.
- Station maxLoad: S1/S2=750 (crew ballast); S3–S6=4197 lb each (catalog maxCargoKg 7615 ≈ 16788 lb / 4 bags). Placeholder 500 capped inject Due.
- Fuel residual floors (writetest): LEFT_AUX ~6.2 gal, RIGHT_AUX ~6.2 gal — inject redistributeAroundResidualFloors keeps OFP total.
- Homologated with interactive wizard.

## Homologated

- `profiles/examples/inibuilds-ys-11.json`
