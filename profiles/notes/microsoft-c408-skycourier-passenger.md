# C408 SkyCourier Passenger — discovery

**In-sim title (example):** `C408 SkyCourier Passenger`  
**Match title:** `C408 SkyCourier Passenger`  
**ICAO (SimBrief type):** `C408`  
**Publisher:** `microsoft`  
**Stations:** 7  
**Profile:** `microsoft/c408-skycourier-passenger@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 360 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 360 | RIGHT_MAIN |

## Notes

- Fuel via classic FUEL TANK * from writetest (LEFT_MAIN, RIGHT_MAIN).
- AUX deferred for v1.
- Payload stations from writetest: 1, 2, 3, 4, 5, 6, 7.
- Station maxLoad: placeholder until flight_model.cfg calibrate.
- Homologated with interactive wizard.
- Carenado EFB map (tablet 100% / CG in envelope):
  - **Seats** tab → S1+S2 crew (170+170) + **S3** (750 lb) + **S4** (2100 lb) = 3190 lb, CG ~15% MAC
  - **Cargo** tab → **S5** wing-box hold (~2325 lb), CG ~17% MAC
  - **S6 / S7** are unused. SimConnect writes there pull CG to −10% MAC.
- Career cargo (pax=0) injects **S5 only**; S3/S4 stay empty.
- SKU `maxCargoKg` **1055** (~2325 lb) — Passenger hold; Cargo Empty relies on probe/Accept when S3 clamps lower.

## Homologated

- `profiles/examples/microsoft-c408-skycourier-passenger.json`
