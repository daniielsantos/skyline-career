# ToLiss A346 PRO Preset Pax — discovery

**In-sim title (example):** `ToLiss A346 PRO [Preset Pax]`  
**Match title:** `ToLiss A346 PRO Preset Pax`  
**ICAO (SimBrief type):** `A346`  
**Publisher:** `toliss`  
**Stations:** 7  
**Profile:** `toliss/toliss-a346-pro-preset-pax@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUELSYSTEM TANK QUANTITY:1` | 14521 | LEFT_MAIN |
| `FUELSYSTEM TANK QUANTITY:2` | 9182 | RIGHT_MAIN |
| `FUELSYSTEM TANK QUANTITY:3` | 9182 | TANK_3 |
| `FUELSYSTEM TANK QUANTITY:4` | 6472 | TANK_4 |
| `FUELSYSTEM TANK QUANTITY:5` | 6472 | TANK_5 |
| `FUELSYSTEM TANK QUANTITY:6` | 1624 | TANK_6 |
| `FUELSYSTEM TANK QUANTITY:7` | 1624 | TANK_7 |
| `FUELSYSTEM TANK QUANTITY:8` | 2084 | TANK_8 |

## Notes

- CG envelope is **−20 to 50% MAC** (ToLiss). The wizard pin was 0–50, so a live CG of about −19.8% painted outside the band. The card reads `CG PERCENT`; only the limits changed.
- Load method: native-simbrief (no Skyline inject).
- Fuel/payload write plans intentionally empty — load via addon EFB/tablet.
- Use compare-ofp + Career Loaded vs Due for validation.

## Homologated

- `profiles/examples/toliss-toliss-a346-pro-preset-pax.json`
