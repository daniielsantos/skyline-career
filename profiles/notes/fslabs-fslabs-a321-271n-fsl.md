# FSLabs A321-271N - FSL — discovery

**In-sim title (example):** `FSLabs A321-271N - FSL (SN-FSL)`  
**Match title:** `FSLabs A321-271N - FSL`  
**ICAO (SimBrief type):** `A21N`  
**Publisher:** `fslabs`  
**Stations:** 24  
**Profile:** `fslabs/fslabs-a321-271n-fsl@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 2102.1 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 2102.1 | RIGHT_MAIN |
| `FUEL TANK CENTER QUANTITY` | 2228.2 | CENTER |
| `FUEL TANK CENTER2 QUANTITY` | 2228.2 | CENTER2 |
| `FUEL TANK LEFT AUX QUANTITY` | 812 | LEFT_AUX |
| `FUEL TANK RIGHT AUX QUANTITY` | 812 | RIGHT_AUX |

## Notes

- Load method: native-simbrief (no Skyline inject).
- Fuel/payload write plans intentionally empty — load via addon EFB/tablet.
- Use compare-ofp + Career Loaded vs Due for validation.

## Homologated

- `profiles/examples/fslabs-fslabs-a321-271n-fsl.json`
