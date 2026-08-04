# A2A Piper Aerostar 600 — discovery

**In-sim title (example):** `A2A Piper Aerostar 600`  
**Match title:** `A2A Piper Aerostar 600`  
**ICAO (SimBrief type):** `AEST`  
**Publisher:** `a2a`  
**Stations:** 7  
**Profile:** `a2a/piper-aerostar-600@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 62 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 62 | RIGHT_MAIN |
| `FUEL TANK CENTER QUANTITY` | 41.5 | CENTER |

## Notes

- Drafted from vendor recipe a2a-accusim.
- Tablet/Accu-Sim owns load. Classic FUEL TANK / PAYLOAD STATION are mirrors; write Fuel*/Character* LVars and SeatNCharacter occupancy. Tank set varies (fuselage vs tip) — draft keeps only tanks with live capacity ≥ 5.
- Fuel strategy: lvar-bridge; tanks: LEFT_MAIN, RIGHT_MAIN, CENTER.
- See profiles/notes/a2a-accusim.md
- Homologated with interactive wizard (recipe lvar-bridge).

## Homologated

- `profiles/examples/a2a-piper-aerostar-600.json`
