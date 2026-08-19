# Boeing B707 GNS — discovery

**In-sim title (example):** `Boeing B707 GNS`  
**Match title:** `Boeing B707 GNS`  
**ICAO (SimBrief type):** `B703`  
**Publisher:** `inibuilds`  
**Stations:** 8  
**Profile:** `inibuilds/boeing-b707-gns@1.0.0`

## Fuel tanks

| Var | Capacity | Id |
|-----|----------|----|
| `FUEL TANK LEFT MAIN QUANTITY` | 4069 | LEFT_MAIN |
| `FUEL TANK RIGHT MAIN QUANTITY` | 4069 | RIGHT_MAIN |
| `FUEL TANK CENTER QUANTITY` | 10193 | CENTER |
| `FUEL TANK LEFT AUX QUANTITY` | 2323 | LEFT_AUX |
| `FUEL TANK RIGHT AUX QUANTITY` | 2323 | RIGHT_AUX |
| `FUEL TANK LEFT TIP QUANTITY` | 439 | LEFT_TIP |
| `FUEL TANK RIGHT TIP QUANTITY` | 439 | RIGHT_TIP |

## Notes

- Fuel via classic FUEL TANK * from writetest (LEFT_MAIN, RIGHT_MAIN, CENTER, LEFT_AUX, RIGHT_AUX, LEFT_TIP, RIGHT_TIP).
- AUX/Aft tanks included.
- Payload stations from writetest: 1, 2, 3, 4, 5, 6, 7, 8.
- Station maxLoad: placeholder until flight_model.cfg calibrate.
- Homologated with interactive wizard.

## Homologated

- `profiles/examples/inibuilds-boeing-b707-gns.json`
