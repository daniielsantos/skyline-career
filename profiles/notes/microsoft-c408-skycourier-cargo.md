# C408 SkyCourier Cargo — discovery

**In-sim title (example):** `C408 SkyCourier Cargo - Empty`  
**Match title:** `C408 SkyCourier Cargo - Empty`  
**ICAO (SimBrief type):** `C408`  
**Publisher:** `microsoft`  
**Stations:** 5 (cargo write: **S3 only**)  
**Profile:** `microsoft/c408-skycourier-cargo@1.0.0`

**Not supported:** `C408 SkyCourier Cargo - Loaded` — that livery only exposes S1–S2 crew. Spawn **Empty** for inject.

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 360 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 360 | RIGHT_MAIN |

## Notes

- Fuel via classic FUEL TANK * from writetest (LEFT_MAIN, RIGHT_MAIN).
- AUX deferred for v1.
- Payload stations from writetest: 1, 2, 3, 4, 5 (use **Cargo - Empty** livery — Loaded only exposed crew).
- S1–S2 crew; **S3** is the only sticky cargo hold. **S4/S5** accept profile indexes but SimConnect writes do not stick → `baggageStations: [3]`, `maxLoad` 0 on S4/S5.
- S3 `maxLoad` 2500; live may sit lower — pack/S3-only + mid-fill sticky clamp; catalog `maxCargoKg` **1055** for Passenger S5.
- Inject: pre-fill **writability** probe only (batch 150 lb — no per-station clamp; airframes often accept any weight). Mid-fill ghost prune remains. Log: `baggage writability probe` / `dead stations pruned` in `profiles/career/watch-debug.log`.
- Homologated with interactive wizard.

## Homologated

- `profiles/examples/microsoft-c408-skycourier-cargo.json`
