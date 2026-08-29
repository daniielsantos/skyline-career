# Saab 340 Passenger — discovery

**In-sim title (example):** `340 Passenger`  
**Match title:** `Saab 340 Passenger`  
**ICAO (SimBrief type):** `SF34`  
**Publisher:** `carenado`  
**Stations:** 36 used (SDK COUNT=37)  
**Profile:** `carenado/saab-340-passenger@1.1.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 360 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 360 | RIGHT_MAIN |

## Payload map (EFB probe 2026-08-29)

| EFB | SimConnect |
|-----|------------|
| Seats 100% | **S1–S36** = 200 lb each |
| Cargo only | no classic station change |
| Empty | S1–S36 = 0; **S37 stays 300** (excluded) |

- **S1–S2** → crew  
- **S3–S36** → `baggageStations` (cabin seats used as freight holds; `maxLoad` **500** lb)  
- **S37** → out of profile (sticky / not a seat)  
- No classic baggage holds — mapped as freighter bags so inject is **not** capped by GA seat soft-max 300.  
- Shared Market SKU with **Cargo** glass (`microsoft-saab-340-cargo`) — catalog stays freighter so Cargo inject unchanged.
- **`cg.policy: none`** — station arms broken for heavy cabin freight (MAC goes more FWD when loading “aft” indexes). Equal-fill to Due only; no CG ballast (ballast was pushing Sim above Due).

## Homologated

- `profiles/examples/carenado-saab-340-passenger.json`
- `profiles/ofp/carenado-saab-340-passenger.json`
