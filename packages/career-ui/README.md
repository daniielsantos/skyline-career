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

- **Market** — list lots with distance/expiry, filters/sort/pagination, freighter class filter; **Prepare flight** opens Staging
- **Staging** — build a same-route multi-lot manifest, pick aircraft, adjust payload, then **Accept & Dispatch**
- **Terminal** — click any ICAO to inspect stock (tonnes), surplus/shortage, and related contracts
- **Missions** — Dispatch (SimBrief), Confirm OFP (paper), **Preflight** (OFP↔live load), **Watch**, Depart/Settle, Cancel
- **NPC fleet** — competing freighters airborne / turnaround / idle
- **+1 day** — optional manual advance (24h); economy also runs **1:1 with wall clock**
  (catch-up on load / while API is open)
- **Reset Brazil** — clear the prototype save and initialize 20 airports in
  South, Southeast and Northeast Brazil

Terminal inventory shows stock trend (rising/falling) and active regional events.
Economy save is schema v3 (`lastBatchAtMs`, continuous NPC ops, hourly market batches).

Set your SimBrief username on the Missions tab (or `SIMBRIEF_USERNAME` env for the API).
**Preflight** and **Watch** need SimBridgeHost (`\\\\.\\pipe\\msfs-compat-simbridge`). Failed Preflight soft-blocks Depart / Watch auto-depart (confirm override available).
