# Black Square A36TC Bonanza Professional — discovery

**In-sim title (example):** `Black Square A36TC Bonanza Professional N5172C`  
**Match tip:** strip trailing registration / ATC ID; prefer prefix  
`Black Square A36TC Bonanza Professional`  
**ICAO / ATC model:** `BE36`  
**Empty / MTOW:** 2215 / 4030 lb  
**Stations:** 7  
**CG observed:** ~17.6% MAC  

## SimConnect findings (2026-07-28)

### Fuel — do NOT use FUELSYSTEM

| Var | Readable | Writable | Notes |
|-----|----------|----------|-------|
| `FUELSYSTEM TANK QUANTITY:n` | yes (always 0) | no | capacity 0 — ignore |
| `FUEL TANK LEFT MAIN QUANTITY` | yes | **yes** (offset 0) | primary |
| `FUEL TANK RIGHT MAIN QUANTITY` | yes | **yes** (offset 0) | primary |
| `FUEL TANK LEFT AUX QUANTITY` | yes | **yes** (offset 0) | tip/aux |
| `FUEL TANK RIGHT AUX QUANTITY` | yes | **yes** (offset 0) | tip/aux |
| `FUEL TOTAL QUANTITY` | unstable | avoid | snapshot showed 0 while mains had 20; probe later showed 55 |
| `FUEL TOTAL CAPACITY` | ~110 gal | — | usable for UI caps |

Writetest matched mains+aux with `writeOffsetHint: 0`.

**UI sync:** Mass & Balance follows classic SimVar writes (confirmed 37/37 mains). No WASM for v1.

### Payload — SimConnect OK

Stations 1–7 writable via `PAYLOAD STATION WEIGHT:n`, offset 0.  
`TOTAL PAYLOAD WEIGHT` timed out — do not use for verify.

## Homologated profile (`1.0.0`)

- `profiles/examples/blacksquare-a36tc-bonanza-professional.json`
- Strategy fuel: `simconnect-direct` — LEFT_MAIN / RIGHT_MAIN (tips deferred)
- Verify tank vars only (not `FUEL TOTAL QUANTITY`)
- Payload: `station-writeback`, stations 1–7
- Match title without registration suffix
- CG envelope 11–32% MAC

## When to escalate to WASM / LVar

Only if:

1. In-cockpit / EFB fuel quantity does not follow SimVar writes, or  
2. Fuel drains / logic fights the classic tanks after load.

Then inventory Black Square LVars (fuel qty / set targets) and wire `skyline-wasm-bridge`.
