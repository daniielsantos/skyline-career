# 737-700 BBJ SSW — discovery

**In-sim title (example):** `737-700 BBJ SSW`  
**Match title:** `737-700 BBJ SSW`  
**ICAO (SimBrief type):** `BBJ1`  
**Publisher:** `pmdg`  
**Stations:** 31  
**Profile:** `pmdg/737-700-bbj-ssw@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 1288 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 1288 | RIGHT_MAIN |
| `FUEL TANK CENTER QUANTITY` | 4299 | CENTER |
| `FUEL TANK CENTER2 QUANTITY` | 1563 | CENTER2 |

## Notes

- Load method: native-simbrief (no Skyline inject).
- Fuel/payload write plans intentionally empty — load via addon EFB/tablet.
- Use compare-ofp + Career Loaded vs Due for validation.

## Homologated

- `profiles/examples/pmdg-737-700-bbj-ssw.json`
