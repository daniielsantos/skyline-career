# ATR 72-600 Highline 02 — discovery

**In-sim title (example):** `ATR 72-600 Highline 02`  
**Match title:** `ATR 72-600 Highline 02`  
**ICAO (SimBrief type):** `AT76`  
**Publisher:** `microsoft`  
**Stations:** 11  
**Profile:** `microsoft/atr-72-600-highline-02@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 757 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 757 | RIGHT_MAIN |

## Notes

- Fuel via classic FUEL TANK * from writetest (LEFT_MAIN, RIGHT_MAIN).
- AUX deferred for v1.
- Payload stations from writetest: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11.
- Station maxLoad: placeholder until flight_model.cfg calibrate.
- Homologated with interactive wizard.
- Market family: `microsoft-atr-72-600` — pack `profiles/ofp/microsoft-atr-72-600.json`
  (Highline 01–04 · Passenger · Freighter; same stations).

## Homologated

- `profiles/examples/microsoft-atr-72-600-highline-02.json`
