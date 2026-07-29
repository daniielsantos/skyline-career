# OFP / SimBrief load sheet → live monitoring

Skyline compares a planned OFP (manual JSON today; SimBrief API later) against live sim state. Write/load of fuel on PMDG is **out of scope** — the user loads via SimBrief/EFB/FMC; we only monitor.

## SimBrief fields (your load sheet)

| SimBrief | OFP JSON | Live source | Notes |
|----------|----------|-------------|-------|
| **Block Fuel** | `loadSheet.blockFuel` (fills `fuel.total`) | PMDG `FUEL_Qty*` sum (lb) or classic `FUEL TANK * QUANTITY` × 6.7 | Primary fuel check at gate |
| **Payload** | `loadSheet.payload` / `payload.total` | Σ `PAYLOAD STATION WEIGHT:n` | Aircraft-dependent station count |
| **Baggage** | `loadSheet.baggage` | Σ stations in `payload.stationRoles.baggageStations` | **Needs per-aircraft map** |
| **Pass** | `loadSheet.passengerCount` | Estimated: Σ `passengerStations` ÷ `averagePassengerWeight` | **No global pax-count SimVar** |
| **Empty Weight** | `loadSheet.emptyWeight` | `EMPTY WEIGHT` | Airframe check |
| **Estimated ZFW** | `loadSheet.zfw` | `TOTAL WEIGHT` − fuel (or empty + payload) | Derived |
| **Estimated TOW** | `loadSheet.tow` | `TOTAL WEIGHT` (gross) | Gate ≈ ZFW + block fuel |
| **Estimated LW** | `loadSheet.lw` | (not hard-checked in flight) | Optional later |
| **Enroute Burn** | `loadSheet.enrouteBurn` | Fuel drop vs baseline once airborne | Informational / career scoring |

Constant map also exported as `SIMBRIEF_LIVE_FIELD_MAP` from `@msfs-compat/shared`.

## Why Baggage / Pass need a station role map

MSFS exposes **weights per payload station**, not “163 passengers” or “baggage = 4066 kg” as first-class SimVars. Each aircraft assigns seats vs cargo to different station indices.

Example (illustrative — fill with real PMDG/Asobo station layout later):

```json
"payload": {
  "unit": "kg",
  "total": 18114,
  "stationRoles": {
    "passengerStations": [1, 2, 3, 4, 5, 6],
    "baggageStations": [10, 11],
    "averagePassengerWeight": 84
  }
}
```

Without `stationRoles`, `compare-ofp` still checks block fuel / payload / ZFW / TOW / empty, and emits **warn** `BAGGAGE_UNMAPPED` / `PAX_COUNT_UNMAPPED`.

## Sample matching a SimBrief KG load sheet

See [`profiles/ofp/manual-sample.json`](../ofp/manual-sample.json) (Block Fuel 5291, Pass 163, Baggage 4066, Payload 18114, …).

```bash
npm run compare-ofp -- --ofp profiles/ofp/manual-sample.json
npm run monitor-ofp -- --ofp profiles/ofp/manual-sample.json --lock --interval 5
```
