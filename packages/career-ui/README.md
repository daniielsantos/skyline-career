# Skyline Career UI

Local freight board over the same save files as `npm run career`.

```bash
npm install
npm run career:ui
```

Opens:
- UI: http://127.0.0.1:5173
- API: http://127.0.0.1:8787

## What it does

- **Market** — list lots with distance/expiry, filters/sort/pagination; **Prepare flight** opens Staging (disabled while a flight is active)
- **Pilot** — register name + home hub on first open; profile page shows identity, wallet, fleet snapshot (XP / rank later). After Reset Brazil the market is empty until **+1 day** forms lots.
- **Hangar** — starter Caravan parked at your hub; ferry instantly (fee + Jet-A) or relocate by settling cargo. Staging only from the aircraft's current ICAO.
- **Staging** — always available: empty after settle/cancel, draft for multi-lot prep, or live ops (Dispatch, auto OFP confirm every 15s, Preflight, Watch, Depart/Settle, Cancel). One operational flight at a time. **Depart** buys Jet-A shortfall from the origin terminal into the aircraft tanks.
- **Terminal** — Inventory (incl. Jet-A), Contracts, Movements tabs; click any ICAO to inspect
- **Logbook** (Missions tab) — read-only history of settled, cancelled, and past flights
- **NPC fleet** — competing freighters airborne / turnaround / idle
- **+1 day** — optional manual advance (24h); economy also runs **1:1 with wall clock**
  (catch-up on load / while API is open)
- **Reset Brazil** — clear the prototype save and initialize 20 airports in
  South, Southeast and Northeast Brazil

Terminal inventory shows stock trend (rising/falling) and active regional events.
Economy save is schema v3 (`lastBatchAtMs`, continuous NPC ops, hourly market batches).

Set your SimBrief username on the Staging ops view (or `SIMBRIEF_USERNAME` env for the API).
**Preflight** and **Watch** need SimBridgeHost (`\\\\.\\pipe\\msfs-compat-simbridge`). Failed Preflight soft-blocks Depart / Watch auto-depart (confirm override available).
