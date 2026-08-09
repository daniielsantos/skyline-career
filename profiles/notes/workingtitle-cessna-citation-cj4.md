# Cessna Citation CJ4 — discovery

**In-sim title (example):** `Cessna Citation CJ4`  
**Match title:** `Cessna Citation CJ4`  
**ICAO (SimBrief type):** `C25C`  
**Publisher:** `workingtitle`  
**Stations:** 6  
**Profile:** `workingtitle/cessna-citation-cj4@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 434.9 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 434.9 | RIGHT_MAIN |

## Notes

- Fuel via classic FUEL TANK * from writetest (LEFT_MAIN, RIGHT_MAIN).
- AUX deferred for v1.
- Payload stations from writetest: 1, 2, 3, 4, 5, 6.
- Station maxLoad: placeholder until flight_model.cfg calibrate.
- Homologated with interactive wizard.
- **S5 (BAGGAGE 01)** is a ghost for inject: weight sticks briefly then drops. Roles pack marks it `service`; cargo uses S3/S4/S6 then overflows onto crew seats (hard max) so ~2000 lb still fits.

## Homologated

- `profiles/examples/workingtitle-cessna-citation-cj4.json`
- Roles: `profiles/ofp/workingtitle-cessna-citation-cj4.json`
