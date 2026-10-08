# FSS Embraer E170 — discovery

**In-sim title (example):** `FSS Embraer E170 Delta`  
**Match title:** `FSS Embraer E170`  
**ICAO (SimBrief type):** `E170`  
**Publisher:** `fss`  
**Stations:** 6  
**Profile:** `fss/fss-embraer-e170@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUELSYSTEM TANK QUANTITY:1` | 1546 | LEFT_MAIN |
| `FUELSYSTEM TANK QUANTITY:2` | 1546 | RIGHT_MAIN |

## Notes

- Load method: native-simbrief (no Skyline inject).
- Fuel/payload write plans intentionally empty — load via addon EFB/tablet.
- Use compare-ofp + Career Loaded vs Due for validation.

## Homologated

- `profiles/examples/fss-fss-embraer-e170.json`
