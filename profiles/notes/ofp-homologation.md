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

## 3. Live sources (`liveSources` on the pack)

Homologated packs **declare** preferred live read paths. The reader only probes those sources (no PMDG/TFDi cascade on ToLiss, etc.).

Omit `liveSources` only while discovering a new airframe — then the discovery cascade runs.

| Signal | PMDG 738 | TFDi MD-11F | ToLiss A346 |
|--------|----------|-------------|-------------|
| Fuel | `pmdg-ng3` → `classic` | `tfdi-efb` → `mass-balance` | `mass-balance` → `classic` |
| ZFW / GW | `pmdg-efb-lvars` | `tfdi-efb-lvars` | `classic-weights` |
| Bags / payload | `pmdg-efb` → classic | `tfdi-efb` | `classic-stations` |
| Pax | Seat stations ÷ avg weight | n/a (freighter) | Seat stations ÷ OFP avg |

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
- [ ] `liveSources` declared (after live path is confirmed)
- [ ] Row in table below
- [ ] Commit

---

## Homologated packs

| Pack | MSFS titles / pattern | Live path | Status |
|------|----------------------|-----------|--------|
| `pmdg-738-pax.json` | `737-800 PAX *` (SSW TC, BW TC, …) | `liveSources`: NG3 + EFB LVars | **family done** |
| `pmdg-738-bcf.json` | `737-800BCF *` (SSW / BW freighter) | same PMDG `liveSources`; zones 1–6 cargo | **family done** |
| `tfdi-md11f.json` | `*MD-11F*` (TFDi PW/GE) | TFDi EFB LVars (+ mass-balance fuel) | **done** |
| `toliss-a346.json` | `ToLiss A346 PRO *` (Pax) | classic + mass-balance fuel | **done** (warn OK on EMPTY/ZFW/TOW) |
| `blacksquare-caravan-cargo-pod.json` | `Black Square Caravan Professional Cargo Pod *` | classic fuel + stations | **done** (gate: pass/warn EMPTY only) |
| `pmdg-738-ssw-tc.json` | legacy sample (prefer family pack) | same PMDG `liveSources` | superseded by family |
