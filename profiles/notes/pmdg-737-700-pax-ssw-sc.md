# 737-700 PAX SSW SC — discovery

**In-sim title (example):** `737-700 PAX SSW SC`  
**Match title:** `737-700 PAX SSW SC`  
**ICAO (SimBrief type):** `B737`  
**Publisher:** `pmdg`  
**Stations:** 31  
**Profile:** `pmdg/737-700-pax-ssw-sc@1.0.0`

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

- `profiles/examples/pmdg-737-700-pax-ssw-sc.json`
