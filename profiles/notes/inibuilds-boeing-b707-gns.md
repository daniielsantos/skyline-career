# Boeing B707 GNS — discovery

**In-sim title (example):** `Boeing B707 GNS`  
**Match title:** `Boeing B707 GNS`  
**ICAO (SimBrief type):** `B703`  
**Publisher:** `inibuilds`  
**Stations:** 8 (S3 unused)  
**Profile:** `inibuilds/boeing-b707-gns@1.0.0`  
**Load:** EFB `pax_and_cargo` — live max pax from SimBrief `airframe_passengers` (catalog `maxPaxSeats` optional fallback)

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

## Payload / CG (live)

- **Pure cargo OFP** piles S6–S8 → CG ~4% (out of 16–35).
- **Full pax** (114 seats) loads **S5** (cabin) → CG ~29% OK.
- **`pax_and_cargo` dispatch:** SimBrief payload = pax×175 + pax×55 bag + `cargo`. Prefill reserves **230 lb/seat**, remainder as freight.
- Intent compare treats baggage + (pax × 175 lb) as mission freight.
- Catálogo `maxCargoKg`: **29 329** ≈ (65 000 − 340 crew) lb CG-limited mix.
- Roles: crew 1–2 · passenger 4–5 · baggage 6–8 · S3 unused.
- Note: MSFS Mass & Balance seat grid showed **114/114**; SimBrief Full/`airframe_passengers` is the Dispatch source of truth (catalog `maxPaxSeats` is offline fallback only).

## Notes

- Fuel via classic FUEL TANK * from writetest.
- SimBrief MZFW−OEW overstates balanceable load.
- Homologated with interactive wizard.

## Homologated

- `profiles/examples/inibuilds-boeing-b707-gns.json`
