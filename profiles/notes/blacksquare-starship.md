# Black Square Starship — discovery

**In-sim title (example):** `Black Square Starship N786BP`  
**Match title:** `Black Square Starship`  
**ICAO / ATC model:** `STAR`  
**Empty / MTOW:** 9955 / 14900 lb  
**Stations:** 10  
**CG observed:** ~-39 to -42% MAC (negative reference — normal for this airframe)

## SimConnect findings (2026-07-28)

### Fuel — do NOT use FUELSYSTEM

| Var | Readable | Writable | Notes |
|-----|----------|----------|-------|
| `FUELSYSTEM TANK *` | yes (0) | no | ignore |
| `FUEL TANK LEFT/RIGHT MAIN` | yes | **yes** (offset 0) | ~194.5 gal capacity each |
| `FUEL TANK LEFT/RIGHT AUX` | yes | **yes** (offset 0) | ~44 gal; deferred v1 |
| `FUEL TOTAL CAPACITY` | ~565 gal | — | |

### Payload — SimConnect OK

Stations 1–10 writable, offset 0.

### CG

`CG PERCENT` reports negative values. Calibrate must not clamp envelope to 0..100.

## Homologated profile (`1.1.0`)

- `profiles/examples/blacksquare-starship.json`
- **4 tanks:** Left/Right Main (194.5) + Left/Right Aft/AUX (88)
- CG envelope -55..-20 (negative % MAC)
- CLI: `--fuel-left-aux` / `--fuel-right-aux` (omit → 0)
