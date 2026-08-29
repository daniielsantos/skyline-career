# [Beechcraft King Air 350i — discovery

**In-sim title (example):** `Beechcraft King Air`  
**Match title:** `[Beechcraft King Air 350i`  
**ICAO (SimBrief type):** `B350`  
**Publisher:** `asobo`  
**Stations:** 3  
**Profile:** `asobo/beechcraft-king-air-350i@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 190 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 190 | RIGHT_MAIN |
| `FUEL TANK LEFT AUX QUANTITY` | 79.5 | LEFT_AUX |
| `FUEL TANK RIGHT AUX QUANTITY` | 79.5 | RIGHT_AUX |

## Notes

- Fuel via classic FUEL TANK * from writetest (LEFT_MAIN, RIGHT_MAIN, LEFT_AUX, RIGHT_AUX).
- AUX/Aft tanks included.
- Payload stations from writetest: 1, 2, 3.
- Station maxLoad: S1/S2 **750** (crew + CG ballast), S3 **2500** (was placeholder 500 — blocked Accept/Due at 500 lb). Confirm with inject that SimConnect holds ~2.3–2.5 klb on S3; if the sim clamps lower, set maxLoad to the probed value.
- Homologated with interactive wizard.

## Homologated

- `profiles/examples/asobo-beechcraft-king-air-350i.json`
