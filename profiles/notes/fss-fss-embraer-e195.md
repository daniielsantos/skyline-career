# FSS Embraer E195 — discovery

**In-sim title (example):** `FSS Embraer E195 AirLink`  
**Match title:** `FSS Embraer E195`  
**ICAO (SimBrief type):** `E195`  
**Publisher:** `fss`  
**Stations:** 6  
**Profile:** `fss/fss-embraer-e195@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUELSYSTEM TANK QUANTITY:1` | 2149 | LEFT_MAIN |
| `FUELSYSTEM TANK QUANTITY:2` | 2149 | RIGHT_MAIN |

## Notes

- Load method: native-simbrief (no Skyline inject).
- Fuel/payload write plans intentionally empty — load via addon EFB/tablet.
- Use compare-ofp + Career Loaded vs Due for validation.

## Homologated

- `profiles/examples/fss-fss-embraer-e195.json`
