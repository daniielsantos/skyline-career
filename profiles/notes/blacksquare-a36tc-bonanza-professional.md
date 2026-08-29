# Black Square A36TC Bonanza Professional — discovery

**In-sim title (example):** `Black Square A36TC Bonanza Professional N5172C`  
**Match title:** `Black Square A36TC Bonanza Professional`  
**ICAO (SimBrief type):** `BT36`  
**Publisher:** `blacksquare`  
**Stations:** 7  
**Profile:** `blacksquare/a36tc-bonanza-professional@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 40 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 40 | RIGHT_MAIN |
| `FUEL TANK LEFT TIP QUANTITY` | 15 | LEFT_TIP |
| `FUEL TANK RIGHT TIP QUANTITY` | 15 | RIGHT_TIP |

## Notes

- Fuel via classic FUEL TANK * from writetest (LEFT_MAIN, RIGHT_MAIN, LEFT_TIP, RIGHT_TIP).
- AUX deferred for v1.
- Payload stations from writetest: 1, 2, 3, 4, 5, 6, 7.
- Station maxLoad: pilot/copilot **750** (forward ballast when CG aft); S3–S7 **500**.
- No nose baggage — heavy mid-cabin cargo tips the nose. Inject CG: `calibrated-live` **maxMac 28** (sweep ~28.5; simvar aft 32 still tip-up on ramp).
- Homologated with interactive wizard.

## Homologated

- `profiles/examples/blacksquare-a36tc-bonanza-professional.json`
