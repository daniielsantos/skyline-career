# 777F — discovery

**In-sim title (example):** `777F`  
**Match title:** `777F`  
**ICAO (SimBrief type):** `B77F`  
**Publisher:** `pmdg`  
**Stations:** 16  
**Profile:** `pmdg/777f@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 10300 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 10300 | RIGHT_MAIN |
| `FUEL TANK CENTER QUANTITY` | 27290 | CENTER |
| `FUEL TANK CENTER2 QUANTITY` | 5625 | CENTER2 |

## Notes

- Load method: direct-injection (PMDG CDU FO TOTAL + ZFW) — experimental; EFB SimBrief fallback.
- **injectCapable:** `true` — Skyline CDU inject, same path as other PMDG 777 variants.
- SimBrief airframe: **PMDG (MSFS) - 766,800 MTOW** (not Default).
- **OFP ICAO quirk:** MSFS reports `atc_model`/SimBrief `icaocode` **B77L** on the 777F — Career accepts B77L for `pmdg-777f` missions (Dispatch type stays **B77F**).
- Use compare-ofp + Career Loaded vs Due for validation.

## Homologated

- `profiles/examples/pmdg-777f.json`
