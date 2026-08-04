# Cessna C152 — discovery

**In-sim title (example):** `Cessna C152`  
**Match title:** `Cessna C152`  
**ICAO (SimBrief type):** `C172`  
**Publisher:** `asobo`  
**Stations:** 4  
**Profile:** `asobo/cessna-c152@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUELSYSTEM TANK QUANTITY:1` | 13 | LEFT_MAIN |
| `FUELSYSTEM TANK QUANTITY:2` | 13 | RIGHT_MAIN |

## Notes

- Fuel via FUELSYSTEM where capacity >= 5 (no classic writetest hits).
- AUX deferred for v1.
- Payload stations from writetest: 1, 2, 3, 4.
- Station maxLoad: placeholder until cfg or clamp.
- Homologated with interactive wizard.

## Homologated

- `profiles/examples/asobo-cessna-c152.json`
