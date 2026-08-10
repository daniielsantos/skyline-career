# FenixA320 CFM WF — discovery

**In-sim title (example):** `FenixA320 CFM WF`  
**Match title:** `FenixA320 CFM WF`  
**ICAO (SimBrief type):** `A320`  
**Publisher:** `fenix`  
**Stations:** 16  
**Profile:** `fenix/fenixa320-cfm-wf@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 2061 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 2061 | RIGHT_MAIN |
| `FUEL TANK CENTER QUANTITY` | 2180 | CENTER |
| `FUEL TANK LEFT AUX QUANTITY` | 200 | LEFT_AUX |
| `FUEL TANK RIGHT AUX QUANTITY` | 200 | RIGHT_AUX |

## Notes

- Load method: native-simbrief (no Skyline inject).
- Fuel/payload write plans intentionally empty — load via addon EFB/tablet.
- Use compare-ofp + Career Loaded vs Due for validation.

## Homologated

- `profiles/examples/fenix-fenixa320-cfm-wf.json`
- Family OFP: `profiles/ofp/fenix-a320.json`
- Market SKU: `fenix-a320` (`narrow_freighter`)

