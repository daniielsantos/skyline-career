# FSReborn Phenom 300E — discovery

**In-sim title (example):** `FSReborn Phenom 300E Manchester Interior`  
**Match title:** `FSReborn Phenom 300E`  
**ICAO (SimBrief type):** `E55P`  
**Publisher:** `fsreborn`  
**Stations:** 11  
**Profile:** `fsreborn/phenom-300e@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUELSYSTEM TANK QUANTITY:1` | 406.79998779296875 | LEFT_MAIN |
| `FUELSYSTEM TANK QUANTITY:2` | 406.79998779296875 | RIGHT_MAIN |

## Notes

- Draft preferred FUELSYSTEM where capacity >= 5.
- Classic MAIN writetest failed without offset; calibrate found `+3.7` on FUELSYSTEM qty.
- AUX deferred for v1.
- Stations: 11.
- Cabin/livery suffixes (e.g. `Manchester Interior`) are stripped from match title so all paints share one profile.
- ICAO `E55P` confirmed for catalog / future SimBrief OFP integration.

## Homologated

- `profiles/examples/fsreborn-phenom-300e.json`
