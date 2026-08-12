# DHC-6-300 Twin Otter Wheels — discovery

**In-sim title (example):** `DHC-6-300 Twin Otter Wheels`  
**Match title:** `DHC-6-300 Twin Otter Wheels`  
**ICAO (SimBrief type):** `DHC6`  
**Publisher:** `microsoft`  
**Stations:** 11  
**Profile:** `microsoft/dhc-6-300-twin-otter-wheels@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK CENTER QUANTITY` | 181 | CENTER (forward fuselage) |
| `FUEL TANK CENTER2 QUANTITY` | 197 | CENTER2 (aft fuselage) |
| `FUEL TANK LEFT AUX QUANTITY` | 37 | LEFT_AUX (wing) |
| `FUEL TANK RIGHT AUX QUANTITY` | 37 | RIGHT_AUX (wing) |

Total usable: **452 US gal** ≈ **2,712 lb** / **1,231 kg** Jet-A (MSFS AOM).

## Notes

- Fuel via classic FUEL TANK * (CENTER, CENTER2, LEFT_AUX, RIGHT_AUX).
- Wing tanks (37 gal/side) were deferred in v1 and caused false `FUEL_OVER_CAPACITY`
  on ~500+ NM legs — restored from MSFS 2024 Twin Otter AOM.
- Payload stations from writetest: 1–11.
- Station maxLoad: placeholder until flight_model.cfg calibrate.
- Homologated with interactive wizard.

## Homologated

- `profiles/examples/microsoft-dhc-6-300-twin-otter-wheels.json`
