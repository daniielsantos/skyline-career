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
| `FUELSYSTEM TANK QUANTITY:1` | 227.19000244140625 | LEFT_MAIN |
| `FUELSYSTEM TANK QUANTITY:2` | 227.19000244140625 | RIGHT_MAIN |

## Notes

- Fuel via FUELSYSTEM where capacity >= 5 (no classic writetest hits).
- AUX deferred for v1.
- Payload stations from writetest: 1, 2, 3, 4, 5, 6, 7.
- Station maxLoad: 750 lb per station (SimBrief/in-sim headroom; cfg has no per-station cap).
- Homologated with interactive wizard.

## Homologated

- `profiles/examples/nextgensim-emb-110p1f-bandeirante.json`
