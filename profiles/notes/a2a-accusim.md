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
| `FuelFuselageTank` | gallons | Fuselage / center tank on tablet | → `CENTER`; mirrors `FUEL TANK CENTER QUANTITY` |

### Fuel — capacity / status (mostly read)

| LVar | What it does |
|------|----------------|
| `FuelWingTankCapacity` | Usable capacity **per wing** (Aerostar ~62 gal). Prefer over classic CAPACITY when drafting. |
| `FuelFuselageTankCapacity` | Usable fuselage capacity (Aerostar ~41.5 gal). |
| `FuelTotalTanksCapacity` | Sum of usable tank capacities. |
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

---

## Write-plan pattern

```text
FuelLeftWingTank   = {LEFT_MAIN}
FuelRightWingTank  = {RIGHT_MAIN}
FuelFuselageTank   = {CENTER}

CharacterNWeight   = {station_N}
SeatNCharacter     = {station_N} / ({station_N} + 0.001)
BaggageWeight      = {station_7}          # Aerostar baggage index
```

### Pitfalls we already hit

1. Weight without occupancy → seats 2–6 invisible on EFB.
2. Classic dump `1=180 … 9=13.7 10=13.7` → ghost stations; smoke must use **profile stations** / LVars.
3. Verify only on `PAYLOAD STATION WEIGHT:1` does not prove seats/baggage UI — always check tablet.
4. Baggage is **`BaggageWeight`**, not a classic `PAYLOAD STATION WEIGHT` index that matches the orange BAGGAGE box.

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
```

## Known airframes

| Profile | Notes |
|---------|--------|
| `a2a/piper-aerostar-600` | `profiles/notes/a2a-piper-aerostar-600.md` |
