# FenixA320 CFM SL — discovery

**In-sim title (example):** `FenixA320 CFM SL`  
**Match title:** `FenixA320 CFM SL`  
**ICAO (SimBrief type):** `A320`  
**Publisher:** `fenix`  
**Stations:** 16  
**Profile:** `fenix/fenixa320-cfm-sl@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 2000 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 2000 | RIGHT_MAIN |
| `FUEL TANK CENTER QUANTITY` | 2180 | CENTER |
| `FUEL TANK LEFT AUX QUANTITY` | 50 | LEFT_AUX |
| `FUEL TANK RIGHT AUX QUANTITY` | 50 | RIGHT_AUX |

## Notes

- Load method: native-simbrief (no Skyline inject).
- Fuel/payload write plans intentionally empty — load via addon EFB/tablet.
- Use compare-ofp + Career Loaded vs Due for validation.

## Homologated

- `profiles/examples/fenix-fenixa320-cfm-sl.json`
- Family OFP: `profiles/ofp/fenix-a320.json`
- Market SKU: `fenix-a320` (`narrow_freighter`)

