# Just Flight 146-200QC RAF CMk3 — discovery

**In-sim title (example):** `Just Flight 146-200QC RAF CMk3`  
**Match title:** `Just Flight 146-200QC RAF CMk3`  
**ICAO (SimBrief type):** `B462`  
**Publisher:** `justflight`  
**Stations:** 16  
**Profile:** `justflight/just-flight-146-200qc-raf-cmk3@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 1219 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 1219 | RIGHT_MAIN |
| `FUEL TANK CENTER QUANTITY` | 661 | CENTER |
| `FUEL TANK LEFT AUX QUANTITY` | 155 | LEFT_AUX |
| `FUEL TANK RIGHT AUX QUANTITY` | 155 | RIGHT_AUX |

## Notes

- Load method: native-simbrief (no Skyline inject).
- Fuel/payload write plans intentionally empty — load via addon EFB/tablet.
- Use compare-ofp + Career Loaded vs Due for validation.

- Market SKU: justflight-146-200 (QC freighter family; SimBrief B462; pack profiles/ofp/justflight-146-200-freighter.json)
- EFB Side+FWD+AFT ↔ SimConnect **S3–S12** (mesmo mapa 300QT). Indexes sticky/ghost acima fora do Live vs Due.

## Homologated

- `profiles/examples/justflight-just-flight-146-200qc-raf-cmk3.json`
