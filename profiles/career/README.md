# Local career economy + missions

```bash
npm run career -- init
npm run career -- tick --n 24
npm run career -- market
npm run career -- accept --lot <id> [--kg n] [--aircraft narrow_freighter|wide_freighter]
npm run career -- missions
npm run career -- dispatch --mission <id> --simbrief-user YOUR_ALIAS
npm run career -- depart --mission <id>
npm run career -- settle --mission <id>
npm run career -- cancel --mission <id>
```

- `local-economy.json` — terminals, stocks, shipment lots (gitignored)
- `local-missions.json` — MissionIntent records + `walletUsd` (gitignored)

Loop: accept → dispatch (Intent→OFP) → load/compare → depart → settle (stock move + pay/penalty).
