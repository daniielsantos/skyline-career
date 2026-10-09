# 737-600 PAX SC — discovery

**In-sim title (example):** `737-600 PAX SC`  
**Match title:** `737-600 PAX SC`  
**ICAO (SimBrief type):** `B736`  
**Publisher:** `pmdg`  
**Stations:** 31  
**Profile:** `pmdg/737-600-pax-sc@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 1288 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 1288 | RIGHT_MAIN |
| `FUEL TANK CENTER QUANTITY` | 4299 | CENTER |

## Notes

- Load method: native-simbrief (no Skyline inject).
- Fuel/payload write plans intentionally empty — load via addon EFB/tablet.
- Use compare-ofp + Career Loaded vs Due for validation.

## Homologated

- `profiles/examples/pmdg-737-600-pax-sc.json`
