# A2A Accu-Sim — family quirks (Skyline)

Shared context for recipe `a2a-accusim` (`profiles/vendors/a2a-accusim.json`).  
Per-airframe details live under `profiles/notes/<airframe>.md` (e.g. Aerostar 600).

Names below come from Aerostar tablet / panel XML + live `probe-lvars`. Other Accu-Sim airframes may rename tanks or seat count — **probe before drafting**.

## Mental model

Accu-Sim (tablet / Mass & Balance) **owns** fuel and payload. Classic SimConnect vars are mostly **read-only mirrors**:

| Classic SimVar | Role on Accu-Sim |
|----------------|------------------|
| `FUEL TANK * QUANTITY` | Mirror of tablet tank LVars — **writes ignored** |
| `PAYLOAD STATION WEIGHT:n` | Partial / ghost layout — **do not trust full dump** |
| `TOTAL PAYLOAD WEIGHT` | Often includes ghost stations — **do not use for verify** |

**Write path:** `lvar-bridge` → Accu-Sim LVars listed below.

---

## LVar catalog

### Fuel — quantity (writable)

| LVar | Unit (typical) | What it does | Profile / verify |
|------|----------------|--------------|------------------|
| `FuelLeftWingTank` | gallons | Left wing usable fuel on tablet | → `LEFT_MAIN`; mirrors `FUEL TANK LEFT MAIN QUANTITY` |
| `FuelRightWingTank` | gallons | Right wing usable fuel | → `RIGHT_MAIN`; mirrors `FUEL TANK RIGHT MAIN QUANTITY` |
| `FuelFuselageTank` | gallons | Fuselage / center (Aerostar). **Ghost on Comanche** — LVar may read/write but `CENTER` cap=0 and classic mirror stays 0. Draft **skips** when capacity &lt; 5. | → `CENTER` only when live |
| `FuelLeftTipTank` | gallons | Left tip tank (Comanche). | → `LEFT_TIP`; mirrors `FUEL TANK LEFT TIP QUANTITY` |
| `FuelRightTipTank` | gallons | Right tip tank (Comanche). | → `RIGHT_TIP`; mirrors `FUEL TANK RIGHT TIP QUANTITY` |

Layouts seen so far:

| Airframe | Tanks |
|----------|--------|
| Aerostar 600 | wing L/R + fuselage (`CENTER`) |
| PA-24-250 Comanche | wing L/R + tip L/R (`LEFT_TIP` / `RIGHT_TIP`); **4 seats** (do not write Character5/6) |

Recipe lists **all** candidates; `draftProfileFromVendorRecipe` keeps only tanks with classic/usable capacity ≥ 5.

### Fuel — capacity / status (mostly read)

| LVar | What it does |
|------|----------------|
| `FuelWingTankCapacity` | Usable capacity **per wing** (Aerostar ~62; Comanche capacity LVar may be 0 — fall back to classic CAPACITY ~30). |
| `FuelFuselageTankCapacity` | Usable fuselage capacity (Aerostar ~41.5; unused/0 on tip-tank airframes). |
| `FuelTipTankCapacity` | Tip usable capacity when Accu-Sim exposes it (else classic `FUEL TANK LEFT/RIGHT TIP CAPACITY` ~15 on Comanche). |
| `FuelTotalTanksCapacity` | Sum of usable tank capacities (Comanche ~90 = 60 wing + 30 tip). |
| `FuelTotalPct` | Tablet “fuel % full” (can lag vs sum of bars). |
| `FuelPreset` | Tablet preset slider (LIGHT / MEDIUM / FULL style). Writing tanks usually updates UI; writing preset alone may reshuffle quantities. |
| `FuelEconomy` | Economy / burn-related tablet value (read; not used by Skyline apply). |
| `FuelTotalizerUsedFuel` | Totalizer used (read). |
| `FuelTotalizerRemainingFuel` | Totalizer remaining (read). |
| `FSfuel` | Accu-Sim ↔ FS fuel bridge flag/value (read; do not use for apply). |

Tablet fuel total % can briefly disagree with the sum of tank bars (UI lag / unusable) — trust tank quantity LVars + classic mirrors after settle.

### Payload — people (writable)

| LVar | What it does | Profile station (Aerostar) |
|------|----------------|----------------------------|
| `Character1Weight` | Pilot / seat 1 weight (lb) | `station_1` |
| `Character2Weight` | Seat 2 weight (lb) | `station_2` |
| `Character3Weight` | Seat 3 weight (lb) | `station_3` |
| `Character4Weight` | Seat 4 weight (lb) | `station_4` |
| `Character5Weight` | Seat 5 weight (lb) | `station_5` |
| `Character6Weight` | Seat 6 weight (lb) | `station_6` |

`Character1Weight` mirrors classic `PAYLOAD STATION WEIGHT:1` well enough for verify. Other Character weights may **not** show as classic stations 2–6.

### Payload — seat occupancy (writable, required for EFB paint)

| LVar | What it does |
|------|----------------|
| `Seat1Character` | Occupancy flag for seat 1 (0 empty / 1 occupied). Often already 1 (pilot). |
| `Seat2Character` … `Seat6Character` | Same for seats 2–6. **Without this, tablet stays empty even if `CharacterNWeight` is set.** |

Soft-bool in write plans (expr engine has no `?:`):

```text
SeatNCharacter = {station_N} / ({station_N} + 0.001)   // ~0 empty, ~1 when weight > 0
```

Do **not** write Character5/6 on four-seat airframes (Comanche).

### CTRL+E / auto-start (Accu-Sim)

After Skyline OFP inject, **CTRL+E** (MSFS auto-start engines) can wipe tablet payload — especially `Character1Weight` / Seat 1 (green seat, blank lb on the EFB; Preflight S1 → 0). **Manual engine start keeps the injected load.**

- Not a Skyline Watch rewrite: Watch does not write Character*/payload on engines-on (only airborne MX fuel drain on classic tanks).
- Reproduced on Comanche: inject → CTRL+E → S1 gone; inject → manual start → S1 stays.
- Workaround for the pilot: start engines with the checklist / switches, not CTRL+E, after inject (or re-inject / re-set seats on the tablet if CTRL+E was used).

### Payload — baggage (writable)

| LVar | What it does | Profile station (Aerostar) |
|------|----------------|----------------------------|
| `BaggageWeight` | Baggage compartment weight (lb) — **this is the LVar to set baggage** | `station_7` |
| `BaggageMax` | Max baggage from Accu-Sim (lb). Use when drafting `maxLoad`. | read-only for apply |
| `MaxBaggage` | Alternate / tablet max baggage label (may match POH/UI ~240 lb on Aerostar; probe both). | read |

Smoke only fills the first three profile stations (seats), so baggage stays 0 unless you pass `--station 7=…`.

### Weights / CG (mostly read — tablet mirrors)

| LVar | What it does |
|------|----------------|
| `PayloadWeight` | Tablet payload total (people + baggage; not ghost SimConnect stations). |
| `PayloadWeightPct` | Payload as % of useful load. |
| `TotalWeight` / `GrossWeightLbs` | Current gross weight (lb). |
| `EmptyWeightLbs` | Empty weight (lb). |
| `CoG` | CG position (tablet units, often inches). |
| `CoGpct` | CG as % / normalized. |
| `CoGmin` / `CoGmax` | Forward / aft limits (same units as `CoG`). |

Do **not** drive apply from these; use them for sanity checks vs EFB.

**Live-read (Preflight/Watch/post-inject):** pack `liveSources` `a2a-lvars` reads `PayloadWeight`, `Fuel*` (gallons→lb), `Character1–6Weight`, `SeatNCharacter`, `BaggageWeight`. Schematic follows occupancy (Character* linger after the tablet empties a seat). Career inject verify uses the same reader — not classic `PAYLOAD STATION WEIGHT` / mass-balance. Same pattern as TFDi EFB — not a publisher `if` in inject fill.

---

## Write-plan pattern

```text
FuelLeftWingTank   = {LEFT_MAIN}
FuelRightWingTank  = {RIGHT_MAIN}
FuelFuselageTank   = {CENTER}          # Aerostar only when capacity ≥ 5
FuelLeftTipTank    = {LEFT_TIP}        # Comanche tip layout
FuelRightTipTank   = {RIGHT_TIP}

CharacterNWeight   = {station_N}
SeatNCharacter     = {station_N} / ({station_N} + 0.001)
BaggageWeight      = {station_7}          # baggage station index on drafted profiles
```

### Pitfalls we already hit

1. Weight without occupancy → seats 2–6 invisible on EFB.
2. Classic dump `1=180 … 9=13.7 10=13.7` → ghost stations; smoke must use **profile stations** / LVars.
3. Verify only on `PAYLOAD STATION WEIGHT:1` does not prove seats/baggage UI — use `L:Character*` / `L:BaggageWeight` (and career `a2a-lvars` post-inject gate).
4. Baggage is **`BaggageWeight`**, not a classic `PAYLOAD STATION WEIGHT` index that matches the orange BAGGAGE box.
5. Do not assume every Accu-Sim airframe has a fuselage tank — Comanche uses tip tanks; a readable `FuelFuselageTank` without CENTER capacity is a **ghost**.
6. **CTRL+E after inject** can clear Seat 1 / `Character1Weight` on the EFB. Use manual engine start (or re-inject). See “CTRL+E / auto-start” above.

---

## Homologate wizard behaviour

- Classic writetest fails → load `profiles/vendors` → score recipes with `onClassicWriteFail: try-lvar-bridge` → LVar write probe → `draftProfileFromVendorRecipe`.
- Smoke payload targets = **first stations on the profile** (180 / 50 / 25), not magic indices 1/3/5.
- Black Square / FUELSYSTEM / classic writetest-OK paths are unchanged.

## Probe / apply

```powershell
npm run start:local
npm run probe-lvars
node packages/agent/dist/cli.js probe-lvars --preset a2a-aerostar `
  --write FuelLeftWingTank=40 `
  --write Character1Weight=180 --write Seat1Character=1 `
  --write BaggageWeight=40
node packages/agent/dist/cli.js apply-auto `
  --fuel-left 30 --fuel-right 30 --fuel-center 20 `
  --station 1=180 --station 2=50 --station 7=40
# Comanche tips (no center):
#   --fuel-left 24 --fuel-right 24 --fuel-left-tip 10 --fuel-right-tip 10
```

## Known airframes

| Profile | Notes |
|---------|--------|
| `a2a/piper-aerostar-600` | `profiles/notes/a2a-piper-aerostar-600.md` — wing + fuselage |
| `a2a/piper-pa-24-250-comanche` | wing + tip (`FuelLeftTipTank` / `FuelRightTipTank`) |
