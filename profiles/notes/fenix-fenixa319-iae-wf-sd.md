# FenixA319 IAE WF SD — discovery

**In-sim title (example):** `FenixA319 IAE WF SD`  
**Match title:** `FenixA319 IAE WF SD`  
**ICAO (SimBrief type):** `A319`  
**Publisher:** `fenix`  
**Stations:** 16  
**Profile:** `fenix/fenixa319-iae-wf-sd@1.0.0`

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

- `profiles/examples/fenix-fenixa319-iae-wf-sd.json`
- Family OFP: `profiles/ofp/fenix-a319.json`
- Market SKU: `fenix-a319` (`narrow_freighter`)

