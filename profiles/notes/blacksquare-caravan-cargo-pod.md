# Black Square Caravan Professional Cargo Pod — discovery

**In-sim title (example):** `Black Square Caravan Professional Cargo Pod N2500A`  
**Match title:** `Black Square Caravan Professional Cargo Pod`  
**ICAO / ATC model:** `C208`  
**Empty / MTOW:** 4237 / 8750 lb  
**Stations:** 15  
**CG observed:** ~17.6–18.9% MAC  

## SimConnect findings (2026-07-28)

### Fuel — do NOT use FUELSYSTEM

| Var | Readable | Writable | Notes |
|-----|----------|----------|-------|
| `FUELSYSTEM TANK QUANTITY:n` | yes (0) | no | capacity 0 — ignore |
| `FUEL TANK LEFT MAIN QUANTITY` | yes | **yes** (offset 0) | primary (~83.9 half) |
| `FUEL TANK RIGHT MAIN QUANTITY` | yes | **yes** (offset 0) | primary |
| `FUEL TANK LEFT/RIGHT AUX` | yes | **yes** (offset 0) | deferred v1 |
| `FUEL TOTAL QUANTITY` | yes (~168) | — | usable here (unlike A36TC) |
| `FUEL TOTAL CAPACITY` | ~335.6 gal | — | ⇒ ~167.8 gal/main |

Writetest: mains 83.9→35 matched; AUX 0→15 matched.

### Payload — SimConnect OK

Stations 1–15 writable, offset 0.  
`TOTAL PAYLOAD WEIGHT` timed out — do not use for verify.

## Homologated profile (`1.0.0`)

- `profiles/examples/blacksquare-caravan-professional-cargo-pod.json`
- Classic mains only; smoke 35→134 confirmed; apply 40/40 OK
- UI: confirm Mass & Balance follows SimVars (user reported success 2026-07-28)

## Career / OFP pack (`light_turboprop`)

- Roles: `profiles/ofp/blacksquare-caravan-cargo-pod.json`
- Class id: `light_turboprop` (UI: Light TP / Caravan)
- SimBrief: Default C208 — structural cargo ≈ **1704 kg** (`mzfw − oew`)
- Stations (1-based): crew 1–2; baggage 3–15 (cabin seats as cargo + cabin + pods)
- Live: classic tanks + classic stations/weights
- Gate: spawn Caravan → Load OFP fuel/payload → `npm run compare-ofp -- --simbrief-user YOUR_ALIAS`

## When to escalate to WASM

Only if Mass & Balance / EFB fuel UI does not follow classic SimVar writes.
