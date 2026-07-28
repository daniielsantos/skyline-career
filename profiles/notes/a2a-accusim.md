# A2A Accu-Sim — family quirks (Skyline)

Shared context for recipe `a2a-accusim` (`profiles/vendors/a2a-accusim.json`).  
Per-airframe details live under `profiles/notes/<airframe>.md` (e.g. Aerostar 600).

## Mental model

Accu-Sim (tablet / Mass & Balance) **owns** fuel and payload. Classic SimConnect vars are mostly **read-only mirrors**:

| Classic SimVar | Role on Accu-Sim |
|----------------|------------------|
| `FUEL TANK * QUANTITY` | Mirror of tablet tank LVars — **writes ignored** |
| `PAYLOAD STATION WEIGHT:n` | Partial / ghost layout — **do not trust full dump** |
| `TOTAL PAYLOAD WEIGHT` | Often includes ghost stations — **do not use for verify** |

**Write path:** `lvar-bridge` → Accu-Sim LVars (`Fuel*`, `Character*`, `Seat*Character`, `Baggage*`).

## Fuel LVars (Aerostar pattern — probe per airframe)

| LVar | Profile tank | Classic verify mirror |
|------|--------------|------------------------|
| `FuelLeftWingTank` | `LEFT_MAIN` | `FUEL TANK LEFT MAIN QUANTITY` |
| `FuelRightWingTank` | `RIGHT_MAIN` | `FUEL TANK RIGHT MAIN QUANTITY` |
| `FuelFuselageTank` | `CENTER` | `FUEL TANK CENTER QUANTITY` |
| `FuelWingTankCapacity` / `FuelFuselageTankCapacity` | usable caps | prefer over classic CAPACITY when present |

Tablet fuel total % can briefly disagree with the sum of tank bars (UI lag / unusable) — trust tank LVars + classic mirrors after settle.

## Payload / seats — critical

1. **Weight:** `Character1Weight` … `CharacterNWeight`, plus `BaggageWeight` / `BaggageMax`.
2. **Occupancy:** `SeatNCharacter` must be set for the tablet to **paint** seats 2–N.
   - Seat 1 (pilot) is usually already occupied → weight-only often looks fine on seat 1.
   - Writing `Character3Weight=50` **without** `Seat3Character` → EFB stays empty on that seat (this bit us in homologation smoke).
3. Write-plan pattern (expr engine is arithmetic-only → soft bool):

```text
CharacterNWeight  = {station_N}
SeatNCharacter    = {station_N} / ({station_N} + 0.001)   // ~0 empty, ~1 occupied
BaggageWeight     = {station_baggage}
```

4. **Ghost classic stations:** snapshot may show e.g. `9=13.7 10=13.7` while tablet payload is only Character/Baggage. Wizard smoke must sum **profile stations** (and prefer LVar reads), never `TOTAL PAYLOAD WEIGHT` / full 1–16 dump.

5. **Verify:** checking only `PAYLOAD STATION WEIGHT:1` is enough for “pilot stuck” smoke; it does **not** prove seats 2–N appear on the EFB — always glance at the tablet.

## Homologate wizard behaviour

- Classic writetest fails → load `profiles/vendors` → score recipes with `onClassicWriteFail: try-lvar-bridge` → LVar write probe → `draftProfileFromVendorRecipe`.
- Smoke payload targets = **first stations on the profile** (180 / 50 / 25), not magic indices 1/3/5.
- Black Square / FUELSYSTEM / classic writetest-OK paths are unchanged.

## Probe / apply

```powershell
npm run start:local
npm run probe-lvars
node packages/agent/dist/cli.js probe-lvars --preset a2a-aerostar --write FuelLeftWingTank=40 --write Character1Weight=180 --write Seat1Character=1
node packages/agent/dist/cli.js apply-auto --fuel-left 30 --fuel-right 30 --fuel-center 20 --station 1=180 --station 2=50
```

## Known airframes

| Profile | Notes |
|---------|--------|
| `a2a/piper-aerostar-600` | `profiles/notes/a2a-piper-aerostar-600.md` |
