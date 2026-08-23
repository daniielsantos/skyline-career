# Microsoft A321LR — discovery

**In-sim title (example):** `A321`  
**Match title:** `Microsoft A321LR`  
**ICAO (SimBrief type):** `A321`  
**Publisher:** `microsoft`  
**Stations:** 8  
**Profile:** `microsoft/microsoft-a321lr@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 2031.4 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 2031.4 | RIGHT_MAIN |
| `FUEL TANK CENTER QUANTITY` | 824 | CENTER |
| `FUEL TANK CENTER2 QUANTITY` | 824 | CENTER2 |

## Notes

- Load method: native-simbrief (no Skyline inject). Payload: aircraft EFB APPLY LOAD.
- **Fuel:** iniBuilds A321LR EFB APPLY does **not** write FOB (SU5 bug; A320neo V2 is fine). **Confirmed live:** default MSFS Weight and Balance slider updates Watch Sim. Aircraft EFB APPLY is payload-only until iniBuilds fixes it — no Skyline inject. Do not invent AUX writes.
- Watch Sim fuel follows `FUEL TOTAL QUANTITY WEIGHT` / gross−empty−payload. If that number does not move, the sim mass did not move.

## Homologated

- `profiles/examples/microsoft-microsoft-a321lr.json`
- Family OFP: `profiles/ofp/microsoft-a321lr.json`
- Market SKU: `microsoft-a321lr` (`narrow_freighter`)

