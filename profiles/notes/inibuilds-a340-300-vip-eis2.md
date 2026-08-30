# A340-300 VIP EIS2 — discovery

**In-sim title (example):** `A340-300 VIP EIS2`  
**Match title:** `A340-300 VIP EIS2`  
**ICAO (SimBrief type):** `A343`  
**Publisher:** `inibuilds`  
**Stations:** 13  
**Profile:** `inibuilds/a340-300-vip-eis2@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 11301 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 11301 | RIGHT_MAIN |
| `FUEL TANK CENTER QUANTITY` | 5580 | CENTER |
| `FUEL TANK CENTER2 QUANTITY` | 5580 | CENTER2 |
| `FUEL TANK LEFT AUX QUANTITY` | 964 | LEFT_AUX |
| `FUEL TANK RIGHT AUX QUANTITY` | 964 | RIGHT_AUX |

## Notes

- Load method: native-simbrief (no Skyline inject).
- Fuel/payload write plans intentionally empty — load via addon EFB/tablet.
- Use compare-ofp + Career Loaded vs Due for validation.

## Homologated

- `profiles/examples/inibuilds-a340-300-vip-eis2.json`
