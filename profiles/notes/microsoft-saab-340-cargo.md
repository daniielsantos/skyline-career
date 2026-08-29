# Saab 340 Cargo — discovery

**In-sim title (example):** `340 Cargo - Empty`  
**Match title:** `Saab 340 Cargo`  
**ICAO (SimBrief type):** `SF34`  
**Publisher:** `microsoft`  
**Stations:** 6  
**Profile:** `microsoft/saab-340-cargo@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 360 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 360 | RIGHT_MAIN |

## Notes

- Fuel via classic FUEL TANK * from writetest (LEFT_MAIN, RIGHT_MAIN).
- AUX deferred for v1.
- Payload stations from writetest: 1, 2, 3, 4, 5, 6.
- Station maxLoad: S1/S2 crew **750**; S3–S6 bags **2000** each (Σ 8000 lb ≥ Market `maxCargoKg` 3514). Was placeholder 500 → inject Due capped at 2000 lb.
- Homologated with interactive wizard.

## Homologated

- `profiles/examples/microsoft-saab-340-cargo.json`
