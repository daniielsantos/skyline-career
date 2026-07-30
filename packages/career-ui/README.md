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
- **Settings** — SimBrief username and metric/imperial weights (UI labels + SimBrief Dispatch units)
- **Staging** — always available: empty after settle/cancel, draft for multi-lot prep, or live ops (Dispatch, **Edit** cargo to change payload and re-dispatch, then automatic OFP confirm → persisted-fuel check/purchase → load into aircraft → Preflight → Watch; Depart/Settle/Cancel remain manual). One operational flight at a time.
- **Terminal** — Inventory (incl. Jet-A), Contracts, Movements tabs; click any ICAO to inspect
- **Logbook** (Missions tab) — read-only history of settled, cancelled, and past flights
- **NPC fleet** — competing freighters airborne / turnaround / idle
- **+1 day** — optional manual advance (24h); economy also runs **1:1 with wall clock**
  (catch-up on load / while API is open)
- **Reset Brazil** — clear the prototype save and initialize 20 airports in
  South, Southeast and Northeast Brazil

Terminal inventory shows stock trend (rising/falling) and active regional events.
Economy save is schema v3 (`lastBatchAtMs`, continuous NPC ops, hourly market batches).

Set your SimBrief username under **Settings** (or `SIMBRIEF_USERNAME` env for the API).
Weight system (metric kg/t or imperial lb/klb) also lives in Settings and is sent to SimBrief as `units=KGS|LBS` on Dispatch.
**Auto OFP load**, **Preflight**, and **Watch** need SimBridgeHost (`\\\\.\\pipe\\msfs-compat-simbridge`).
The Staging footer separates **SimBridge** (pipe up) from **Watch** (session started).
Failed Preflight soft-blocks Depart / Watch auto-depart (confirm override available) without claiming SimBridge is disconnected.
After OFP pass/warn, Career compares the aircraft's persisted tank with SimBrief block fuel. Any shortfall must be purchased in Staging (terminal stock/tanker pricing); sufficient fuel is authorized automatically. **Auto Load OFP** then writes block fuel + cargo stations into the live aircraft (homologated write profile required), re-runs Preflight, and starts Watch. Depart does not charge the same fuel again. On settle, the live MSFS residual fuel is stored back in the assigned fleet aircraft; offline/manual fallback retains the estimated-burn behavior.
