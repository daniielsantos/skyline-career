# DHC-6-300 Twin Otter Wheels — discovery

**In-sim title (example):** `DHC-6-300 Twin Otter Wheels`  
**Match title:** `DHC-6-300 Twin Otter Wheels`  
**ICAO (SimBrief type):** `DHC6`  
**Publisher:** `microsoft`  
**Stations:** 11  
**Profile:** `microsoft/dhc-6-300-twin-otter-wheels@1.0.0`

## Fuel tanks

| Id | SimVar | Cap (gal) | EFB label |
|----|--------|-----------|-----------|
| CENTER | `FUEL TANK CENTER QUANTITY` | 181 | Center |
| CENTER2 | `FUEL TANK CENTER2 QUANTITY` | 197 | Center AFT |
| LEFT_MAIN | `FUEL TANK LEFT MAIN QUANTITY` | 37 | Left outer |
| RIGHT_MAIN | `FUEL TANK RIGHT MAIN QUANTITY` | 37 | Right outer |

Total: **452 US gal** ≈ **3,028 lb** / **1,374 kg** Jet-A.

Same wings as `FUELSYSTEM TANK QUANTITY:3` / `:4` (cap 37). **Do not** map them to
`LEFT_AUX` / `RIGHT_AUX` — those read 0 and ignore writes. (Older attempts to
write unregistered AUX vars killed the Host; AUX is the wrong slot here.)

Wing mains often stick ~13 gal (~89 lb) unusable floor. Inject uses
`redistributeAroundResidualFloors` so Due stays on OFP block fuel (floor kept
on wings, same qty pulled from fuselage). Payload writes can re-raise the floor
— post-payload fuel restore re-applies the plan.

## Notes

- Payload stations from writetest: 1–11.
- Station maxLoad: placeholder until flight_model.cfg calibrate.
- Homologated with interactive wizard.

## Homologated

- `profiles/examples/microsoft-dhc-6-300-twin-otter-wheels.json`
