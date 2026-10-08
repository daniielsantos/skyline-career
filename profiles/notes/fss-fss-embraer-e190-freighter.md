# FSS Embraer E190 Freighter — discovery

**In-sim title (example):** `FSS Embraer E190 Freighter - DHL`  
**Match title:** `FSS Embraer E190 Freighter`  
**ICAO (SimBrief type):** `E190`  
**Publisher:** `fss`  
**Stations:** 6  
**Profile:** `fss/fss-embraer-e190-freighter@1.0.0`

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

- `profiles/examples/fss-fss-embraer-e190-freighter.json`
