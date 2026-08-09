# TFDi Design MD-11F GE — discovery

**In-sim title (example):** `TFDi Design MD-11F GE`  
**Match title:** `TFDi Design MD-11F GE`  
**Market family:** TFDi MD-11F (`tfdi-md11f-family`) — PW4462 + GE only (engine preset)  
**Roles pack:** `profiles/ofp/tfdi-md11f.json`  
**ICAO (SimBrief type):** `MD1F`  
**Publisher:** `tfdi`  
**Stations:** 15  
**Profile:** `tfdi/tfdi-design-md-11f-ge@1.0.0`  
**Load method:** native-simbrief (EFB import; injectCapable=false)

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 8938 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 8938 | RIGHT_MAIN |
| `FUEL TANK CENTER QUANTITY` | 13000 | CENTER |
| `FUEL TANK CENTER2 QUANTITY` | 1642 | CENTER2 |
| `FUEL TANK LEFT AUX QUANTITY` | 1973 | LEFT_AUX |
| `FUEL TANK RIGHT AUX QUANTITY` | 1973 | RIGHT_AUX |
| `FUEL TANK LEFT TIP QUANTITY` | 884 | LEFT_TIP |
| `FUEL TANK RIGHT TIP QUANTITY` | 884 | RIGHT_TIP |

## Notes

- Load method: native-simbrief (no Skyline inject).
- Fuel/payload via TFDi EFB; Skyline monitors with tfdi-efb LVars + mass-balance.
- Shares Market SKU with PW4462 preset only (`TFDi Design MD-11F PW4462`).
- Publisher: tfdi.

## Homologated

- `profiles/examples/tfdi-tfdi-design-md-11f-ge.json`
