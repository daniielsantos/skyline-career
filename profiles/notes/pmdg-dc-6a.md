# DC-6A — discovery

**In-sim title (example):** `DC-6A`  
**Match title:** `DC-6A`  
**ICAO (SimBrief type):** `DC6`  
**Publisher:** `pmdg`  
**Stations:** 12  
**Profile:** `pmdg/dc-6a@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 719 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 719 | RIGHT_MAIN |
| `FUEL TANK CENTER QUANTITY` | 762 | CENTER |
| `FUEL TANK CENTER2 QUANTITY` | 762 | CENTER2 |
| `FUEL TANK LEFT AUX QUANTITY` | 580 | LEFT_AUX |
| `FUEL TANK RIGHT AUX QUANTITY` | 580 | RIGHT_AUX |
| `FUEL TANK LEFT TIP QUANTITY` | 695 | LEFT_TIP |
| `FUEL TANK RIGHT TIP QUANTITY` | 695 | RIGHT_TIP |

## Notes

- Load method: native-simbrief (no Skyline inject).
- Fuel/payload write plans intentionally empty — load via addon EFB/tablet.
- Use compare-ofp + Career Loaded vs Due for validation.

## Homologated

- `profiles/examples/pmdg-dc-6a.json`
