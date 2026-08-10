# A320neo V2 — discovery

**In-sim title (example):** `A320neo V2`  
**Match title:** `A320neo V2`  
**ICAO (SimBrief type):** `A20N`  
**Publisher:** `microsoft`  
**Stations:** 8  
**Profile:** `microsoft/a320neo-v2@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 1814.7 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 1814.7 | RIGHT_MAIN |
| `FUEL TANK CENTER QUANTITY` | 2182 | CENTER |
| `FUEL TANK LEFT AUX QUANTITY` | 228.4 | LEFT_AUX |
| `FUEL TANK RIGHT AUX QUANTITY` | 228.4 | RIGHT_AUX |

## Notes

- Load method: native-simbrief (no Skyline inject).
- Fuel/payload write plans intentionally empty — load via addon EFB/tablet.
- Use compare-ofp + Career Loaded vs Due for validation.

## Homologated

- `profiles/examples/microsoft-a320neo-v2.json`
- Family OFP: `profiles/ofp/microsoft-a320neo-v2.json`
- Market SKU: `microsoft-a320neo-v2` (`narrow_freighter`)

