# BN2 Islander - Passenger / Analogue / Tip Tanks — discovery

**In-sim title (example):** `BN2 Islander - Passenger / Analogue / Tip Tanks`  
**Match title:** `BN2 Islander - Passenger / Analogue / Tip Tanks`  
**ICAO (SimBrief type):** `BN2P`  
**Publisher:** `blackbox`  
**Stations:** 11  
**Profile:** `blackbox/bn2-islander-passenger-analogue-tip-tanks@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 65 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 65 | RIGHT_MAIN |
| `FUEL TANK LEFT AUX QUANTITY` | 27.5 | LEFT_AUX |
| `FUEL TANK RIGHT AUX QUANTITY` | 27.5 | RIGHT_AUX |

## Notes

- Fuel via classic FUEL TANK * (mains + tip AUX) — same layout as cargo tip-tanks. Homologation had only AUX; that capped inject ~tips and left L/R residual (Sim ~573 vs Due ~701).
- Payload stations from writetest: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11.
- Station maxLoad: placeholder until flight_model.cfg calibrate.
- Homologated with interactive wizard.

## Homologated

- `profiles/examples/blackbox-bn2-islander-passenger-analogue-tip-tanks.json`
