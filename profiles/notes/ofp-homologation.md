# OFP aircraft homologation template

Use this for each MSFS airframe you want Skyline Career to gate on (OFP ↔ live).  
Reference family pack: `profiles/ofp/pmdg-738-pax.json` (PMDG 737-800 PAX — **SSW TC + BW TC**).

Each Career roles pack declares a preferred **load method**:

| Method | Who loads | Typical aircraft |
|--------|-----------|------------------|
| `native-simbrief` | Addon EFB/FMC Import SimBrief | PMDG, TFDi, ToLiss |
| `direct-injection` | Skyline SimVars (`injectCapable: true`) | Black Square Caravan |
| manual | Pilot Mass & Balance / EFB | Always available as fallback |

Career Preflight validates **Loaded vs Due** (fuel + payload). **CG is advisory** there; strict CG applies only on trusted inject envelopes.

---

## Track A — OFP monitor (`native-simbrief`)

No writable Skyline profile. Wizard early-exits on this path.

1. Scaffold roles pack (`npm run scaffold-ofp-roles -- --write` or family heuristic)
2. Set `loadMethod: "native-simbrief"` and `injectCapable: false`
3. Pilot: EFB/FMC **Load from SimBrief**
4. `npm run compare-ofp -- --simbrief-user YOUR_ALIAS` → pass / warn
5. Career Staging: **Validate Fuel and Payload** (no auto-inject)
6. Give the wizard the completed roles-pack path; it registers the model in
   the Aircraft Market under the suggested economic class (disable later with
   `career-airframe disable` if needed)

Do **not** run draft / calibrate / smoke write tests for this track.

---

## Track B — Writable inject (`direct-injection`)

Homologation wizard (`homologate`) after choosing load method 2:

1. Discovery + draft + calibrate (+ optional CG sweep) + smoke
2. Confirm `loadMethod: "direct-injection"` on the Career roles pack
3. Prefer CG from cfg/EFB; mark `envelopeSource` (`cfg` / `manual` / `live-sweep` / `calibrated-live`)
4. Promote example profile; set pack `injectCapable: true`
5. Confirm the suggested Skyline economic class; promote automatically upserts
   `packages/shared/src/data/career-player-airframes.json`
6. Career Staging auto-injects only when pack is direct-injection + injectCapable

To pull a model off the Aircraft Market without deleting the roles pack / OFP
homologation, set `"enabled": false` on that row (or run
`msfs-compat-agent career-airframe disable --type <typeId>`). Owned aircraft
keep flying; re-homologating or `career-airframe enable` puts it back on the
board.

On promote, the wizard offers to **write/merge** `profiles/ofp/*.json` automatically (or run offline):

```powershell
npm run draft-ofp-roles -- --profile profiles/examples/YOUR.json --write
```

Known families (Bonanza, C172 Classic/G1000, Commander 114/114TC, C208
Asobo+Black Square, PMDG, …) share one Aircraft Market SKU. Same-station
variants also merge into one OFP `matchTitles` pack; vendor forks keep
separate packs under `familyRolesPackRelPaths`.

### When is a new airframe a family vs a separate SKU?

| Same Market SKU (family) | Separate Market SKUs |
| --- | --- |
| Same stations / cargo layout (Classic vs G1000, Commander 114 vs 114TC) | Truly different airplanes / payload maps that should price separately |
| Vendor forks of the same economic type (Asobo vs Black Square C208) via `marketTypeId` + `familyRolesPackRelPaths` | Unrelated ICAOs |

**OFP pack merge** (one `matchTitles` file) requires identical station maps. Vendor forks keep **separate** roles packs but one Market card.

**Future homologations:** if the title matches an existing heuristic, promote is
automatic — titles merge into the family pack (or accumulate vendor pack paths)
and the Market row upserts in place. Creating a *new* family still needs one
manual step: add a heuristic in `scaffold-roles.ts` (`titlePattern`,
`familyPackRel` and/or `marketTypeId`, `marketLabel`, stations). After that,
every later variant is automatic.

Strict CG rollback on inject applies for trusted envelopes; `calibrated-live` is soft.

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

## 3. CG source + empirical sweep

Priority for the authorized envelope:

1. Manual override typed in the wizard (when you intentionally override)
2. **Live SimVars** `CG FWD LIMIT` / `CG AFT LIMIT` (same values as Mass & Balance tablet)
3. `flight_model.cfg` (`CG_forward_limit` / `CG_aft_limit` + station arms)

The homologate wizard searches `Community` / `Community2024` / `Official*` under `InstalledPackagesPath` from `UserCfg.opt` (no hardcoded PC paths). Pick a ranked candidate, paste a path, or skip. Streamed Marketplace aircraft may need DevMode VFS Projector + a pasted path.

4. Optional empirical station sweep (validates station write behavior; only seeds envelope when no better source exists)

`CG PERCENT` is the current CG position. Limits are for envelope validation on inject — they do not by themselves optimize cargo distribution.

Standalone equivalent:

```powershell
npm run agent -- calibrate --profile PATH `
  --flight-model PATH_TO\flight_model.cfg `
  --cg-sweep --cg-sweep-lb 200
```

Profiles record `cg.envelopeSource` (`simvar` | `cfg` | `manual` | `live-sweep` | `calibrated-live`), `cg.toleranceMac`, live observation, cfg path, and sweep metadata. Do not promote a `calibrated-live` profile without confirming the envelope.

At apply time, the runtime also re-reads live FWD/AFT limits when available, so a stale profile min/max is corrected by the sim.

---

## 4. Live sources (`liveSources` on the pack)

Homologated packs **declare** preferred live read paths. The reader only probes those sources (no PMDG/TFDi cascade on ToLiss, etc.).

Omit `liveSources` only while discovering a new airframe — then the discovery cascade runs.

| Signal | PMDG 738 | TFDi MD-11F | ToLiss A346 |
|--------|----------|-------------|-------------|
| Fuel | `pmdg-ng3` → `classic` | `tfdi-efb` → `mass-balance` | `mass-balance` → `classic` |
| ZFW / GW | `pmdg-efb-lvars` | `tfdi-efb-lvars` | `classic-weights` |
| Bags / payload | `pmdg-efb` → classic | `tfdi-efb` | `classic-stations` |
| Pax | Seat stations ÷ avg weight | n/a (freighter) | Seat stations ÷ OFP avg |

---

## 5. Gate test

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

## 6. Ship

- [ ] Pack under `profiles/ofp/` with `matchTitles` or `matchTitlePattern`
- [ ] `liveSources` declared (after live path is confirmed)
- [ ] Player airframe registered in the Career catalog (wizard does this automatically)
- [ ] Row in table below
- [ ] Commit

---

## Homologated packs

| Pack | MSFS titles / pattern | Load method | Live path | Status |
|------|----------------------|-------------|-----------|--------|
| `pmdg-738-pax.json` | `737-800 PAX *` (SSW TC, BW TC, …) | native-simbrief | `liveSources`: NG3 + EFB LVars | **family done** |
| `pmdg-738-bcf.json` | `737-800BCF *` (SSW / BW freighter) | native-simbrief | same PMDG `liveSources`; zones 1–6 cargo | **family done** |
| `tfdi-md11f.json` | `*MD-11F*` (TFDi PW/GE) | native-simbrief | TFDi EFB LVars (+ mass-balance fuel) | **done** |
| `toliss-a346.json` | `ToLiss A346 PRO *` (Pax) | native-simbrief | classic + mass-balance fuel | **done** (warn OK on EMPTY/ZFW/TOW) |
| `blacksquare-caravan-cargo-pod.json` | `Black Square Caravan Professional Cargo Pod *` | direct-injection | classic fuel + stations | **done** (gate: pass/warn EMPTY only) |
| `pmdg-738-ssw-tc.json` | legacy sample (prefer family pack) | native-simbrief | same PMDG `liveSources` | superseded by family |
