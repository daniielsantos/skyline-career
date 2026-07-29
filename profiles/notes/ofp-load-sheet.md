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

**Homologating a new airframe?** See [`ofp-homologation.md`](./ofp-homologation.md).  
PMDG 737-800 PAX: `npm run scaffold-ofp-roles` then `compare-ofp` (auto roles — no `--roles` needed).

| SimBrief | OFP JSON | Live source | Notes |
|----------|----------|-------------|-------|
| **Block Fuel** | `loadSheet.blockFuel` (fills `fuel.total`) | PMDG `FUEL_Qty*` sum (lb) or classic gallons × 6.7 | Primary fuel check at gate |
| **Payload** | `loadSheet.payload` / `payload.total` | PMDG: pax + **EFB-derived** bags; else Σ stations | Classic cargo stations lie after EFB load |
| **Baggage** | `loadSheet.baggage` | PMDG: `L:ZFW_Lvar − empty − pax − crew − galley` | Needs `crewStations` + `serviceStations` |
| **Pass** | `loadSheet.passengerCount` | Estimated: Σ `passengerStations` ÷ avg weight | Seat stations still trustworthy |
| **Empty Weight** | `loadSheet.emptyWeight` | `EMPTY WEIGHT` | Warn only (OEW ≠ MSFS empty) |
| **Estimated ZFW** | `loadSheet.zfw` | PMDG `L:ZFW_Lvar` (EFB) | Matches SimBrief after Load from Simbrief |
| **Estimated TOW** | `loadSheet.tow` / ZFW+block | PMDG `L:GW_Lvar` vs **ZFW+block** | `est_tow` is post-taxi; GW is ramp |
| **Estimated LW** | `loadSheet.lw` | `L:LW_Lvar` (read, not hard-gated) | Optional later |
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

- Stations 1–4 carry pax zone weights; 5–6 cargo; 7–9 crew; 10–11 galley.
- After EFB **Load from Simbrief**, stations 5–6 are **inflated** (~×1.26 vs EFB cargo). Authority is WASM/EFB: `L:ZFW_Lvar`, `L:GW_Lvar`.
- Live baggage = `ZFW − empty − pax − crew − service` (roles include `crewStations` / `serviceStations`).
- SimBrief **Payload** = **pax+bags only** (not Σ all stations).
- SimBrief **Empty Weight** ≠ MSFS `EMPTY WEIGHT` (91300 lb) — **warn** only.
- Block fuel via PMDG SDK matched when loaded; EFB ZFW/GW match SimBrief `est_zfw` / `est_zfw+plan_ramp`.
