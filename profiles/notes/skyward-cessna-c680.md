# Cessna C680 — discovery

**In-sim title (example):** `Cessna C680: HB-SOV`  
**Match title:** `Cessna C680`  
**ICAO (SimBrief type):** `C680`  
**Publisher:** `skyward`  
**Stations:** 16  
**Profile:** `skyward/cessna-c680@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 850 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 850 | RIGHT_MAIN |

## Notes

- Skyward Simulations Citation Sovereign+ (C680).
- Direct-injection via classic LEFT_MAIN/RIGHT_MAIN + 16 payload stations.
- CG envelope 18-40% source=manual (SimVar aft ~31% too tight vs live/sweep ~34%).
- Smoke passed after manual aft override.
- Homologated outside wizard (promote after smoke).

## Homologated

- `profiles/examples/skyward-cessna-c680.json`
