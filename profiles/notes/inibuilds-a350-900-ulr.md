# A350-900 ULR — discovery

**In-sim title (example):** `A350-900 ULR`  
**Match title:** `A350-900 ULR`  
**ICAO (SimBrief type):** `A359`  
**Publisher:** `inibuilds`  
**Stations:** 8  
**Profile:** `inibuilds/a350-900-ulr@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 7800 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 7800 | RIGHT_MAIN |
| `FUEL TANK CENTER QUANTITY` | 13702 | CENTER |
| `FUEL TANK CENTER2 QUANTITY` | 13702 | CENTER2 |

## Notes

- Load method: native-simbrief (no Skyline inject).
- Fuel/payload write plans intentionally empty — load via addon EFB/tablet.
- Use compare-ofp + Career Loaded vs Due for validation.

## Homologated

- `profiles/examples/inibuilds-a350-900-ulr.json`
