# FenixA321 CFM WF SC — discovery

**In-sim title (example):** `FenixA321 CFM WF SC`  
**Match title:** `FenixA321 CFM WF SC`  
**ICAO (SimBrief type):** `A321`  
**Publisher:** `fenix`  
**Stations:** 16  
**Profile:** `fenix/fenixa321-cfm-wf-sc@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 2000 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 2000 | RIGHT_MAIN |
| `FUEL TANK CENTER QUANTITY` | 2120 | CENTER |
| `FUEL TANK CENTER2 QUANTITY` | 773 | CENTER2 |
| `FUEL TANK LEFT AUX QUANTITY` | 50 | LEFT_AUX |
| `FUEL TANK RIGHT AUX QUANTITY` | 50 | RIGHT_AUX |

## Notes

- Load method: native-simbrief (no Skyline inject).
- Fuel/payload write plans intentionally empty — load via addon EFB/tablet.
- Use compare-ofp + Career Loaded vs Due for validation.

## Homologated

- `profiles/examples/fenix-fenixa321-cfm-wf-sc.json`
- Family OFP: `profiles/ofp/fenix-a321.json`
- Market SKU: `fenix-a321` (`narrow_freighter`)

