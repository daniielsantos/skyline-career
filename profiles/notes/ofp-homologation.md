# OFP aircraft homologation template

Use this for each MSFS airframe you want Skyline Career to gate on (OFP ↔ live).  
Reference family pack: `profiles/ofp/pmdg-738-pax.json` (PMDG 737-800 PAX — **SSW TC + BW TC**).

Goal: after EFB/FMC **Load from Simbrief**, `compare-ofp` is **pass** or **warn only on EMPTY_WEIGHT**.

---

## Automated path (preferred)

When the live title matches a **known family** (today: any `737-800 PAX …`):

```powershell
npm run probe-payload-stations
npm run scaffold-ofp-roles          # shows if already covered / dry-run pack
npm run scaffold-ofp-roles -- --write   # only if a new family pack is needed

# After SimBrief OFP + EFB Load from Simbrief — no --roles needed:
npm run compare-ofp -- --simbrief-user YOUR_ALIAS
```

`compare-ofp` / `monitor-ofp` read the MSFS title and auto-pick `profiles/ofp/*.json` via `matchTitles` / `matchTitlePattern`.

You do **not** copy templates by hand for another PMDG 738 PAX cabin — same station roles.

---

## 0. Identity (manual / new vendor)

| Field | Value |
|-------|--------|
| MSFS title (from probe) | |
| ICAO | e.g. B738 |
| SimBrief variant used for OFP | e.g. PMDG Dual Class |
| Profile file | `profiles/ofp/<slug>.json` |
| Date / tester | |

---

## 1. Spawn + baseline probes

```powershell
npm run probe-payload-stations
npm run probe-pmdg-fuel          # PMDG NG3 only; skip if not PMDG
```

Record:

- [ ] `Aircraft:` title matches the pack
- [ ] `empty=` MSFS empty weight (lb)
- [ ] If present: `PMDG EFB LVars` ZFW / GW / LW

---

## 2. Map stations (only if scaffold has no heuristic)

Open `flight_model.cfg` → `station_load.N`.  
SimConnect `PAYLOAD STATION WEIGHT:n` is **1-based** (`station_load.0` → `:1`).

Fill `stationRoles` + optional `matchTitles` / `matchTitlePattern` so auto-resolve works next time.

---

## 3. Live sources

| Signal | PMDG 738 PAX | Generic fallback |
|--------|--------------|------------------|
| Fuel | NG3 Client Data | Classic gallons × density |
| ZFW / GW | `L:ZFW_Lvar` / `L:GW_Lvar` | `TOTAL WEIGHT − fuel` |
| Bags | EFB residual (ZFW − empty − pax − crew − service) | Σ baggageStations |
| Pax | Seat stations ÷ avg weight | — |

---

## 4. Gate test

1. SimBrief: matching variant → generate OFP  
2. EFB: **Load from Simbrief**  
3. `npm run compare-ofp -- --simbrief-user YOUR_ALIAS`

| Check | Expected |
|-------|----------|
| `Auto roles:` line | Pack matched |
| Fuel / bags / pax / ZFW / ramp TOW | No **fail** |
| `EMPTY_WEIGHT` | **warn** OK |
| Verdict | `pass` or `warn` only |

---

## 5. Ship

- [ ] Pack under `profiles/ofp/` with `matchTitles` or `matchTitlePattern`
- [ ] Row in table below
- [ ] Commit

---

## Homologated packs

| Pack | MSFS titles / pattern | Live path | Status |
|------|----------------------|-----------|--------|
| `pmdg-738-pax.json` | `737-800 PAX *` (SSW TC, BW TC, …) | NG3 fuel + EFB LVars + roles | **family done** |
| `pmdg-738-bcf.json` | `737-800BCF *` (SSW / BW freighter) | EFB LVars; zones 1–6 = cargo | **family done** |
| `tfdi-md11f.json` | `*MD-11F*` (TFDi PW/GE) | EFB `L:MD11_EFB_PAYLOAD_*` | **done** |
| `toliss-a346.json` | `ToLiss A346 PRO *` (Pax) | Classic stations 3–7 | **in progress** |
| `pmdg-738-ssw-tc.json` | legacy sample (prefer family pack) | same | superseded by family |
