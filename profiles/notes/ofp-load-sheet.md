# OFP / SimBrief load sheet → live monitoring

Skyline compares the **latest SimBrief OFP** (or a manual JSON) against live sim state. Write/load of fuel on PMDG is **out of scope** — the user loads via SimBrief/EFB/FMC; we only monitor.

## Fetch from SimBrief (preferred)

```bash
# Navigraph Alias from SimBrief Account Settings
npm run compare-ofp -- --simbrief-user YOUR_ALIAS --roles profiles/ofp/pmdg-738-ssw-tc.json

# or Pilot ID
npm run compare-ofp -- --simbrief-userid 123456 --roles profiles/ofp/pmdg-738-ssw-tc.json

# env defaults: SIMBRIEF_USERNAME / SIMBRIEF_USERID
```

Uses `https://www.simbrief.com/api/xml.fetcher.php?…&json=v2` (latest OFP only — call on user action, do not poll).

| SimBrief JSON | OFP field |
|---------------|-----------|
| `fuel.plan_ramp` | Block Fuel |
| `fuel.enroute_burn` | Enroute Burn |
| `weights.payload` | Payload |
| `weights.cargo` (≈ bag_count × bag_weight) | Baggage **total** |
| `weights.bag_weight` | Average **per bag** (not used as total) |
| `weights.pax_count` | Pass |
| `weights.pax_weight` | Avg passenger weight |

## Career loop (product)

```text
Flight type / mission params (pax, bags/cargo, …)
        │
        ▼
  Generate OFP via SimBrief  ──►  block fuel + ZFW/TOW computed
        │
        ▼
  User loads aircraft (EFB/FMC) to match OFP
        │
        ▼
  Skyline fetch OFP + compare-ofp / monitor-ofp
        │
        ▼
  pass / warn / fail  (career gate)
```

Today: **fetch + compare** is live. **Generate** OFP from career params (SimBrief dispatch API) is the next build step.

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

## Example: PMDG 737-800 SSW TC

From `flight_model.cfg` (`station_load.N` → SimConnect `PAYLOAD STATION WEIGHT:N+1`):

| SimVar | Name | Role |
|--------|------|------|
| 1–4 | PaxZone1–4 | **passenger** (cfg seat caps 16+45+55+47 = **163**) |
| 5–6 | Fwd Cargo / Aft Cargo | **baggage** |
| 7–8 | Pilot / Copilot | crew (not SimBrief Pass) |
| 9 | Instructor | crew |
| 10–11 | fwd_gly / aft_gly | galley |
| 12+ | Point* | unused anchors |

Sample OFP with roles: [`profiles/ofp/pmdg-738-ssw-tc.json`](../ofp/pmdg-738-ssw-tc.json)

```bash
npm run probe-payload-stations
npm run compare-ofp -- --ofp profiles/ofp/pmdg-738-ssw-tc.json
```

Live homologation confirmed on **737-800 PAX SSW TC**:

- Stations 1–4 carry pax zone weights; 5–6 cargo; 7–8 crew (~190 lb); 10–11 galley.
- SimBrief **Payload** must be compared to **pax+bags only** (not Σ all stations).
- SimBrief **Empty Weight** ≠ MSFS `EMPTY WEIGHT` (91300 lb on this airframe) — compare is **warn** only.
- Block fuel via PMDG SDK matched sample (5291 kg) when loaded.
