# BN2 Islander - SpecialOps / Analogue — discovery

**In-sim title (example):** `BN2 Islander - SpecialOps / Analogue`  
**Match title:** `BN2 Islander - SpecialOps / Analogue`  
**ICAO (SimBrief type):** `BN2P`  
**Publisher:** `blackbox`  
**Stations:** 4  
**Profile:** `blackbox/bn2-islander-specialops-analogue@1.0.0`

## Fuel tanks

| Var | Capacity | Id | Writetest |
|-----|----------|----|-----------|
| `FUEL TANK LEFT MAIN QUANTITY` | 65 | LEFT_MAIN | ✓ (+3.5 gal offset) |
| `FUEL TANK RIGHT MAIN QUANTITY` | 65 | RIGHT_MAIN | ~ partial (vendor rebalance) |
| `FUEL TANK LEFT AUX QUANTITY` | 27.5 | LEFT_AUX | ✓ (+0.8 gal offset) |
| `FUEL TANK RIGHT AUX QUANTITY` | 27.5 | RIGHT_AUX | ✓ (+0.8 gal offset) |

Total live cap ≈ **185 gal / 1110 lb**.

## Notes

- Fuel via classic FUEL TANK * (v1.1.0: both MAINs + both AUX).
- RIGHT_MAIN may settle off-target after write — verify tol wider.
- Payload stations from writetest: 1, 2, 3, 4.
- Roles: crew S1–S2 (pilot/copilot); baggage S3–S4 (freighter cargo).
- Station maxLoad: placeholder until flight_model.cfg calibrate.
- Homologated with interactive wizard.

## Homologated

- `profiles/examples/blackbox-bn2-islander-specialops-analogue.json`
