# carenado aircraft ct210n STD — discovery

**In-sim title (example):** `carenado-aircraft-ct210n [STD]`  
**Match title:** `carenado aircraft ct210n STD`  
**ICAO (SimBrief type):** `BT36`  
**Publisher:** `carenado`  
**Stations:** 7  
**Profile:** `carenado/carenado-aircraft-ct210n-std@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 45 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 45 | RIGHT_MAIN |

## Notes

- Fuel via classic FUEL TANK * from writetest (LEFT_MAIN, RIGHT_MAIN).
- AUX deferred for v1.
- Payload stations from writetest: 1, 2, 3, 4, 5, 6, 7.
- Station maxLoad: cargo-split S1=750,S2=750,S3=500,S4=500,S5=500,S6=500,S7=500 (ceiling 1814 lb) (simbrief mzfw-oew)
- Fuel residual floors (writetest): LEFT_MAIN ~1.5 gal, RIGHT_MAIN ~1.5 gal — inject redistributeAroundResidualFloors keeps OFP total.
- Homologated with interactive wizard.

## Homologated

- `profiles/examples/carenado-carenado-aircraft-ct210n-std.json`
