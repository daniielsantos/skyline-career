# Microsoft A321LR — discovery

**In-sim title (example):** `A321`  
**Match title:** `Microsoft A321LR`  
**ICAO (SimBrief type):** `A321`  
**Publisher:** `microsoft`  
**Stations:** 8  
**Profile:** `microsoft/microsoft-a321lr@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 2031.4 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 2031.4 | RIGHT_MAIN |
| `FUEL TANK CENTER QUANTITY` | 824 | CENTER |
| `FUEL TANK CENTER2 QUANTITY` | 824 | CENTER2 |

## Notes

- Load method: native-simbrief (no Skyline inject).
- Fuel/payload write plans intentionally empty — load via addon EFB/tablet.
- Use compare-ofp + Career Loaded vs Due for validation.

## Homologated

- `profiles/examples/microsoft-microsoft-a321lr.json`
- Family OFP: `profiles/ofp/microsoft-a321lr.json`
- Market SKU: `microsoft-a321lr` (`narrow_freighter`)

