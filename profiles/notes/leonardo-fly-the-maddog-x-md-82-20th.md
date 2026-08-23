# Fly The Maddog X MD-82 20th — discovery

**In-sim title:** `Fly The Maddog X MD-82 20th`  
**Match title:** `Fly The Maddog X MD-82 20th`  
**ICAO (SimBrief type):** `MD82`  
**Publisher:** `leonardo`  
**Stations:** 7  
**Profile:** `leonardo/fly-the-maddog-x-md-82-20th@1.0.0`  
**Load method:** native-simbrief (EFB import; injectCapable=false)  
**Market:** `leonardo-fly-the-maddog-x-md-82-20th` (`narrow_freighter`)  
**Roles pack:** `profiles/ofp/leonardo-fly-the-maddog-x-md-82-20th.json`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 1384 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 1384 | RIGHT_MAIN |
| `FUEL TANK CENTER QUANTITY` | 3074 | CENTER |

## Notes

- Career load path: Maddog EFB / SimBrief import (same as MD-83 / MD-88).
- SimBrief: MD82 `Leonardo Maddog (MSFS) - Y162 Config` (162 pax), not Default.
- Y162 payload cap is MZFW−OEW ≈ 40,793 lb (122,000 − 81,207). Catalog maxCargoKg 18506.
- Maddog EFB IMPORT can still overshoot MZFW (bags + FWD/AFT stacked) — CHECK ENTRIES; not a Skyline Due bug.
- Market `pax_and_cargo`. LOAD OFP fills pax (185 lb) + AFT bags only — leftover `cargo=` is manual in FWD/AFT. IMPORT FROM SIMBRIEF duplicates holds (do not use). CG is pilot/EFB; Watch matches payload only. S5 is config (~2543 lb), not OFP payload.
- Live: LOAD OFP + cargo manual, ZFW 122000 → Watch Sim 40,793 vs Due 40,792. Fuel ok. No `efbPaxWeightLb`.
- Classic SimVars may stick in probe, but family policy is native-simbrief.
- Monitor + validate with compare-ofp + Career Loaded vs Due.

## Homologated

- `profiles/examples/leonardo-fly-the-maddog-x-md-82-20th.json`
