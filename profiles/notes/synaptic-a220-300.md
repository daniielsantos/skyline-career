# A220-300 — discovery

**In-sim title (example):** `A220-300`  
**Match title:** `A220-300`  
**ICAO (SimBrief type):** `BCS3`  
**Publisher:** `synaptic`  
**Stations:** 6  
**Profile:** `synaptic/a220-300@1.0.0`  
**Market SKU:** `synaptic-a220-300` (`narrow_freighter`, `pax_and_cargo`)  
**SimBrief airframe:** `Synaptic / iniBuilds (MSFS) - A220-300` (not Default)

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 1004 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 1004 | RIGHT_MAIN |
| `FUEL TANK CENTER QUANTITY` | 3748 | CENTER |

## Notes

- Load method: native-simbrief (no Skyline inject).
- Fuel/payload write plans intentionally empty — load via addon EFB/tablet.
- Use compare-ofp + Career Loaded vs Due for validation.
- OFP pack: `profiles/ofp/synaptic-a220-300.json`
- Card art: `a220-300.png` (prompt in `docs/market-airframe-card-prompts.md`)

## Homologated

- `profiles/examples/synaptic-a220-300.json`
