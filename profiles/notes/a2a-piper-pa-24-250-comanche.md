# A2A Piper PA-24-250 Comanche — discovery

**In-sim title (example):** `A2A Piper PA-24-250 Comanche`  
**Match title:** `A2A Piper PA-24-250 Comanche`  
**ICAO (SimBrief type):** `PA24`  
**Publisher:** `a2a`  
**Stations:** 7  
**Profile:** `a2a/piper-pa-24-250-comanche@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 30 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 30 | RIGHT_MAIN |
| `FUEL TANK LEFT TIP QUANTITY` | 15 | LEFT_TIP |
| `FUEL TANK RIGHT TIP QUANTITY` | 15 | RIGHT_TIP |

## Notes

- Drafted from vendor recipe a2a-accusim.
- Tablet/Accu-Sim owns load. Classic FUEL TANK / PAYLOAD STATION are mirrors; write Fuel*/Character* LVars and SeatNCharacter occupancy. Tank set varies (fuselage vs tip) — draft keeps only tanks with live capacity ≥ 5.
- Fuel strategy: lvar-bridge; tanks: LEFT_MAIN, RIGHT_MAIN, LEFT_TIP, RIGHT_TIP.
- See profiles/notes/a2a-accusim.md
- Homologated with interactive wizard (recipe lvar-bridge).
- CG: `calibrated-live` −10…30% MAC (empty ~−4.5). Do **not** use SimVar FWD/AFT 0–100. Four-seat cabin: stations 1–4 + baggage 7 (no Character5/6). Tablet `Max. baggage` 200 lb.
- Post-inject verify: Accu-Sim LVars (`a2a-lvars`); profile checks `L:Character1Weight` + `L:BaggageWeight`.

## Homologated

- `profiles/examples/a2a-piper-pa-24-250-comanche.json`
