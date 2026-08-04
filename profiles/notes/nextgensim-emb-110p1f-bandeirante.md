# NextGenSim EMB-110P1F Bandeirante — discovery

**In-sim title (example):** `NextGenSim EMB-110P1F Bandeirante`  
**Match title:** `NextGenSim EMB-110P1F Bandeirante`  
**ICAO (SimBrief type):** `E110`  
**Publisher:** `nextgensim`  
**Stations:** 7  
**Profile:** `nextgensim/emb-110p1f-bandeirante@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 227.2 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 227.2 | RIGHT_MAIN |

## Weights (Market / Staging)

| | lb | kg |
|--|----|----|
| OEW (live EMPTY WEIGHT) | 7500 | 3402 |
| MTOW (live) | 13250 | 6010 |
| Max cargo (S3–S7 × 500 lb) | 2500 | 1134 |
| Fuel capacity (454.4 gal × 6.7 lb/gal) | 3044 | 1381 |

## Notes

- Fuel via classic FUEL TANK * from writetest (LEFT_MAIN, RIGHT_MAIN).
- AUX deferred for v1.
- Payload stations from writetest: 1, 2, 3, 4, 5, 6, 7 (crew 1–2, baggage 3–7).
- Homologated with interactive wizard.

## Homologated

- `profiles/examples/nextgensim-emb-110p1f-bandeirante.json`
