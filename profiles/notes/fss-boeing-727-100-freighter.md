# Boeing 727-100 Freighter — discovery

**In-sim title (example):** `Boeing 727-100 Freighter`  
**Match title:** `Boeing 727-100 Freighter`  
**ICAO (SimBrief type):** `B721`  
**Publisher:** `fss`  
**Stations:** 19  
**Profile:** `fss/boeing-727-100-freighter@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUELSYSTEM TANK QUANTITY:1` | 1793 | LEFT_MAIN |
| `FUELSYSTEM TANK QUANTITY:2` | 4094 | RIGHT_MAIN |
| `FUELSYSTEM TANK QUANTITY:3` | 1793 | TANK_3 |

## Notes

- Load method: native-simbrief (no Skyline inject).
- Fuel/payload write plans intentionally empty — load via addon EFB/tablet.
- Use compare-ofp + Career Loaded vs Due for validation.

## Homologated

- `profiles/examples/fss-boeing-727-100-freighter.json`
