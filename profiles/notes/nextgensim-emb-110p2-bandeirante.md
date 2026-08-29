# NextGenSim EMB-110P2 Bandeirante — discovery

**In-sim title (example):** `NextGenSim EMB-110P2 Bandeirante`  
**Match title:** `NextGenSim EMB-110P2 Bandeirante`  
**ICAO (SimBrief type):** `E110`  
**Publisher:** `nextgensim`  
**Stations:** 20  
**Profile:** `nextgensim/emb-110p2-bandeirante@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUELSYSTEM TANK QUANTITY:1` | 227.19000244140625 | LEFT_MAIN |
| `FUELSYSTEM TANK QUANTITY:2` | 227.19000244140625 | RIGHT_MAIN |

## Notes

- Fuel via FUELSYSTEM where capacity >= 5 (no classic writetest hits).
- AUX deferred for v1.
- Payload stations from writetest: 1–20.
- Station maxLoad: 750 lb per station (SimBrief/in-sim headroom; cfg has no per-station cap).
- Watch must read S17–S20 via overflow batch (classic first batch stops at 16) — otherwise Sim under-reads ~800 lb vs Due.
- Homologated with interactive wizard.

## Homologated

- `profiles/examples/nextgensim-emb-110p2-bandeirante.json`
