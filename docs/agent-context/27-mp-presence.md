# MP presence + contested scarcity

Atualizado 2026-09-19.

## Goal

Companies on the shared world must **feel** each other without chat or a lore campaign.
Order: presence UI → online chip → aircraft pool F7 claim.

## Shipped (this wave)

### Presence

- `GET /api/world/presence` — `online` companies (auth sessions × memberships), `portsHeld`, `recent` ring (≤30).
- Topbar **Online** chip (MP/auth) — hover shows last 5 presence lines.
- Port FBO chip: `Port FBO · P# · CompanyName` when `held` / you (via `companyDisplayName` on port snapshot).
- Lot Accept / staging **409** `lot_claimed` includes `claimedByCompanyDisplayName` and a named error string.
- Presence events pushed on lot accept, Port FBO claim, aircraft buy (`career-presence.ts` → `world.presenceLog`, PG `misc_json`).

### Contested index fix

- `syncWorldPortConcessions` **merges** by company (no longer replaces the whole world index with one tenant). Claim/renew/upgrade pass `companyId`.

### Aircraft pool F7

- `markDealerInstanceSold(..., { companyId })` stamps `ownerCompanyId` (idempotent same company).
- Buy/lease: DB `claimAircraftInstance` (PG `FOR UPDATE` / SQLite `BEGIN IMMEDIATE`) **before** wallet; release on fail; HTTP **409** `aircraft_claimed`.
- PG schema **v20** `owner_company_id` on `aircraft_instances`.

## Non-goals (this wave)

- Chat / VA multi-seat / company crew reopen / ranking seasons.

## Verify

1. Two MP companies: A claims Port FBO → B sees name on Ports chip + presence recent.
2. A accepts a lot B soft-held → B gets `Lot claimed by <A name>`.
3. Dual buy same listing → one 200, one 409 `aircraft_claimed`.
4. Topbar Online ≥1 when a second session is live.
