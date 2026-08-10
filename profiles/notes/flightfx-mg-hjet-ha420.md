# mg hjet ha420 — discovery

**In-sim title (example):** `mg hjet ha420 [Preset Default]`  
**Match title:** `mg hjet ha420`  
**ICAO (SimBrief type):** `HDJT`  
**Publisher:** `flightfx`  
**Stations:** 9  
**Profile:** `flightfx/mg-hjet-ha420@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 93.5 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 93.5 | RIGHT_MAIN |
| `FUEL TANK CENTER QUANTITY` | 142.7 | CENTER |
| `FUEL TANK CENTER2 QUANTITY` | 135.9 | CENTER2 |

## Notes

- Fuel via classic slots: LEFT_MAIN, RIGHT_MAIN, CENTER, CENTER2.
- Payload stations 1–9 (PILOT/PAX/CARGO); cabin as baggage for Career.
- CG envelope calibrated-live (-5..15% MAC): CG PERCENT disagrees with SimVar FWD/AFT 20–31%.
- Load method: direct-injection; injectCapable: true.
- Smoke passed with all four fuel tanks targeted.

## Homologated

- `profiles/examples/flightfx-mg-hjet-ha420.json`
