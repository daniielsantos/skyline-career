# Vendor recipes

Recipes capture **how a developer's aircraft usually talk to SimConnect** — not a single profile for every airframe.

| Layer | Owns |
|-------|------|
| `profiles/vendors/*.json` | Strategy, detect hints, tank/LVar *patterns*, wizard fallback |
| `profiles/examples/*.json` | One aircraft: title, ICAO, fingerprint, capacities, exact writePlan |
| `profiles/notes/*.md` | Discovery narrative for that airframe |

## Rules

1. **Never apply a recipe alone** — runtime still loads an `AircraftProfile`.
2. Wizard may **draft from a recipe** when detect signals match (publisher + probes).
3. Per-airframe LVar names / tank counts can diverge; recipes list **candidates**, live probe confirms.
4. Existing examples stay valid without a `recipeId` field (optional later).

## Recipes (v0)

| Id | Publisher | Pattern |
|----|-----------|---------|
| `a2a-accusim` | `a2a` | Classic SimVars read-only; write via Accu-Sim LVars + `SeatNCharacter` |
| `blacksquare-classic` | `blacksquare` | FUELSYSTEM dead; classic `FUEL TANK *` writable |
| `asobo-default` | `asobo` | FUELSYSTEM or classic direct |

## Wired (agent)

- `loadVendorRecipes` / `scoreRecipesForLvarFallback` / `draftProfileFromVendorRecipe`
- Homologate: classic write fail → recipe `try-lvar-bridge` → LVar probe → draft → smoke → promote
- Classic / FUELSYSTEM paths unchanged when writetest succeeds
- Smoke lists **profile stations** only (LVars when write plan uses them)
- Accu-Sim family notes: `profiles/notes/a2a-accusim.md`

## Optional later

- `match.recipeId` on profiles for documentation only
