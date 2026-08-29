# 737 Max 8 Passengers — discovery

**In-sim title (example):** `737 Max 8 Passengers`  
**Match title:** `737 Max 8 Passengers`  
**ICAO (SimBrief type):** `B38M`  
**Publisher:** `asobo`  
**Stations:** 7  
**Profile:** `asobo/737-max-8-passengers@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUELSYSTEM TANK QUANTITY:1` | 4274 | LEFT_MAIN |
| `FUELSYSTEM TANK QUANTITY:2` | 1273 | RIGHT_MAIN |
| `FUELSYSTEM TANK QUANTITY:3` | 1273 | TANK_3 |

## Notes

- Load method: native-simbrief (no Skyline inject).
- Fuel/payload write plans intentionally empty — load via addon EFB/tablet.
- Use compare-ofp + Career Loaded vs Due for validation.

## Homologated

- `profiles/examples/asobo-737-max-8-passengers.json`
