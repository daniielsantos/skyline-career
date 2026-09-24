# iFly 737-MAX8 (189Seats) — discovery

**In-sim title (example):** `iFly 737-MAX8 (189Seats)`  
**Match title:** `iFly 737-MAX8 (189Seats)`  
**ICAO (SimBrief type):** `B38M`  
**Publisher:** `ifly`  
**Stations:** 11  
**Profile:** `ifly/ifly-737-max8-189seats@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 1273 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 1273 | RIGHT_MAIN |
| `FUEL TANK CENTER QUANTITY` | 4274 | CENTER |

## Notes

- Load method: native-simbrief (no Skyline inject).
- Fuel/payload write plans intentionally empty — load via addon EFB/tablet.
- Use compare-ofp + Career Loaded vs Due for validation.

## Homologated

- `profiles/examples/ifly-ifly-737-max8-189seats.json`
- Market SKU: `asobo-737-max-8-passengers` (family pack `profiles/ofp/ifly-737-max-8.json`); SimBrief seat row via live title.
