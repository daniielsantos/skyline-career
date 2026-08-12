# Robin DR400 — discovery

**In-sim title:** `Robin DR400`  
**Match title:** `Robin DR400`  
**ICAO (Doc 8643):** `DR40`  
**SimBrief OFP proxy:** `C172` (no dedicated DR40 airframe)  
**Publisher:** `asobo`  
**Stations:** 3  
**Profile:** `asobo/robin-dr400@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK CENTER QUANTITY` | 29 | CENTER |

## Notes

- Live ATCCOM strings (`ATCCOM.AC_MODEL_DR40…`) are localization keys — catalog ICAO stays `DR40`.
- Fingerprint may drift if tank/station sampling changes; catalog resolve falls back by title.
- Full tanks ≈ 29 gal × ~6.0 lb/gal avgas ≈ 174 lb; OFP above that clamps.
- Fuel writePlan settle delay is 400 ms (keep short — inject ramps fuel in 4 rounds).

## Homologated

- `profiles/examples/asobo-robin-dr400.json`
