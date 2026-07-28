# Black Square Baron 58TC Professional — discovery

**In-sim title (example):** `Black Square Baron 58TC Professional N585RS`  
**Match title:** `Black Square Baron 58TC Professional`  
**ICAO:** `BE58` (live `atcModel` was localization token `ATCCOM.AC_MODEL_BE58.0.text`)  
**Empty / MTOW:** 3788 / 6200 lb  
**Stations:** 8  
**CG observed:** ~13.8–15.5% MAC  

## SimConnect findings (2026-07-28)

### Fuel — do NOT use FUELSYSTEM

| Var | Readable | Writable | Notes |
|-----|----------|----------|-------|
| `FUELSYSTEM TANK *` | yes (0) | no | ignore |
| `FUEL TANK LEFT/RIGHT MAIN` | yes | **yes** (offset 0) | ~101 gal each |
| `FUEL TANK LEFT/RIGHT AUX` | yes | **yes** (offset 0) | 0 at probe; deferred v1 |
| `FUEL TOTAL CAPACITY` | ~202 gal | — | |

### Payload — SimConnect OK

Stations 1–8 writable, offset 0.

## Homologated profile (`1.0.0`)

- `profiles/examples/blacksquare-baron-58tc-professional.json`
- Classic mains only; smoke 75→80; apply 40/40 + CG OK
