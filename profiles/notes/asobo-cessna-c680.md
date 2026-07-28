# Cessna C680 — discovery

**In-sim title (example):** `Cessna C680: HB-SOV`  
**Match title:** `Cessna C680`  
**ICAO (SimBrief type):** `C680`  
**Publisher:** `asobo`  
**Stations:** 16  
**Profile:** `asobo/cessna-c680@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUELSYSTEM TANK QUANTITY:1` | 850 | LEFT_MAIN |
| `FUELSYSTEM TANK QUANTITY:2` | 850 | RIGHT_MAIN |

## Notes

- Draft preferred FUELSYSTEM where capacity >= 5 (offset 0).
- Classic MAIN also writable; profile uses FUELSYSTEM.
- AUX deferred for v1.
- Stations: 16.
- ICAO `C680` (live ATC model was `C680+`).
- Vendor EFB Payload line may exclude pilot/crew counted in Basic Operating Weight; SimConnect `PAYLOAD STATION WEIGHT:*` sum is the source of truth for apply.
- Fuel and gross weight matched EFB during smoke (e.g. 9112 lb fuel @ 6.7 lb/gal).

## Homologated

- `profiles/examples/asobo-cessna-c680.json`
