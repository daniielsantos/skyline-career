# Cessna C680 — discovery

**In-sim title (example):** `Cessna C680: HB-SOV`  
**Match title:** `Cessna C680`  
**ICAO (SimBrief type):** `C680`  
**Publisher:** `skyward`  
**Stations:** 16  
**Profile:** `skyward/cessna-c680@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 850 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 850 | RIGHT_MAIN |

## Notes

- Skyward Simulations Citation Sovereign+ (C680).
- SimBrief airframe: `Skyward Simulations (MSFS) - C680 Sovereign+` (not Default) — OEW ~18691 lb on that row.
- Direct-injection via classic LEFT_MAIN/RIGHT_MAIN + 16 payload stations.
- **Station roles (2026-09-12):** S1–S2 crew, S3–S12 cabin, **S13 cargo bay**; **S14–S16 Import ghosts** omitted from Live (EFB Payload matches cabin+S13; Import still writes junk into 14–16).
- **Charter:** passenger config **`inject_verified`** — Skyline Inject OK (seeds N×`efbPaxWeightLb` 210 + bags on S13). EFB Import still usable; ghosts ignored on Live.
- **Catalog:** `efbPaxWeightLb: 210`. Units **LB**.
- CG envelope 18-40% source=manual (SimVar aft ~31% too tight vs live/sweep ~34%).
- Smoke passed after manual aft override.
- Homologated outside wizard (promote after smoke).

## Homologated

- `profiles/examples/skyward-cessna-c680.json`
- Pack + catalog: `profiles/ofp/skyward-cessna-c680.json`, `skyward-cessna-c680` in `career-player-airframes.json`
