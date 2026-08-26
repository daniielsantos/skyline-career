# 777-200ER GE — discovery

**In-sim title (example):** `777-200ER GE`  
**Match title:** `777-200ER GE`  
**ICAO (SimBrief type):** `B772`  
**Publisher:** `pmdg`  
**Stations:** 16  
**Profile:** `pmdg/777-200er-ge@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 9560 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 9560 | RIGHT_MAIN |
| `FUEL TANK CENTER QUANTITY` | 26100 | CENTER |
| `FUEL TANK CENTER2 QUANTITY` | 5625 | CENTER2 |

## Notes

- Load method: native-simbrief (no Skyline inject).
- Fuel/payload write plans intentionally empty — load via addon EFB/tablet.
- Use compare-ofp + Career Loaded vs Due for validation.

## Homologated

- `profiles/examples/pmdg-777-200er-ge.json`
- Family OFP: `profiles/ofp/pmdg-777.json` (shared with 777F / 200LR / 300ER)
- Market SKU: `pmdg-777-200er` (`wide_freighter`, SimBrief `B772` — GE row)
- **loadLayout:** `pax_and_cargo` — 294 seats; SimBrief hold cap ~85,140 lb; cabin first (175+55 lb/seat)
- **injectCapable:** `true` — Skyline CDU inject (FO TOTAL + ZFW), same path as PMDG 738 PAX/BCF
- OFP pack: `profiles/ofp/pmdg-777-pax.json`
