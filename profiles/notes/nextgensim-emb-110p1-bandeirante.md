# NextGenSim EMB-110P1 Bandeirante — discovery

**In-sim title (example):** `NextGenSim EMB-110P1 Bandeirante`  
**Match title:** `NextGenSim EMB-110P1 Bandeirante`  
**ICAO (SimBrief type):** `E110`  
**Publisher:** `nextgensim`  
**Stations:** 20  
**Profile:** `nextgensim/emb-110p1-bandeirante@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUELSYSTEM TANK QUANTITY:1` | 227.19000244140625 | LEFT_MAIN |
| `FUELSYSTEM TANK QUANTITY:2` | 227.19000244140625 | RIGHT_MAIN |

## Notes

- Fuel via FUELSYSTEM where capacity >= 5 (no classic writetest hits).
- AUX deferred for v1.
- Payload stations from writetest: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20.
- Station maxLoad: placeholder until cfg or clamp.
- Homologated with interactive wizard.

## Homologated

- `profiles/examples/nextgensim-emb-110p1-bandeirante.json`
