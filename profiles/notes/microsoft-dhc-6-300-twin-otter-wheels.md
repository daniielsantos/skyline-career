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

Total written by Skyline: **378 US gal** ≈ **2,268 lb** / **1,029 kg** Jet-A.

AOM also lists optional wing tanks (37 gal/side). Do **not** map them to classic
`LEFT_AUX`/`RIGHT_AUX` without a live writetest — writing unregistered tank
SimVars triggered SimConnect `UNRECOGNIZED_ID` and killed the Host
(`ReceiveMessage error: 0xC00000B0`). Re-homologate wing tanks with the correct
vars before enabling long-range inject.

## Notes

- Fuel via classic FUEL TANK * (CENTER, CENTER2 only for now).
- Payload stations from writetest: 1–11.
- Station maxLoad: placeholder until flight_model.cfg calibrate.
- Homologated with interactive wizard.

## Homologated

- `profiles/examples/microsoft-dhc-6-300-twin-otter-wheels.json`
