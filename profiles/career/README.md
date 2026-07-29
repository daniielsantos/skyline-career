# Local career economy + missions

```bash
npm run career -- init
npm run career -- tick --n 24
npm run career -- market
npm run career -- accept --lot <id> [--kg n] [--aircraft narrow_freighter|wide_freighter]
npm run career -- missions
npm run career -- dispatch --mission <id> --simbrief-user YOUR_ALIAS
npm run career -- watch --mission <id>          # auto-depart / auto-settle from live MSFS
npm run career -- depart --mission <id>         # manual
npm run career -- settle --mission <id>         # manual
npm run career -- cancel --mission <id>
```

- `local-economy.json` — terminals, stocks, shipment lots (gitignored)
- `local-missions.json` — MissionIntent records + `walletUsd` (gitignored)

Loop: accept → dispatch (Intent→OFP) → load/compare → **watch** (or depart/settle) → wallet credit.

`career watch` polls SimBridge: wheels-up → depart; touchdown + engines off → settle.
Destination ICAO is not verified from the sim yet (no live airport read).
