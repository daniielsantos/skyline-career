# MSFS Compat Layer / Skyline Career

Compatibility layer for automatic fuel/payload control across MSFS aircraft.  
GitHub: [daniielsantos/skyline-career](https://github.com/daniielsantos/skyline-career)

[![CI](https://github.com/daniielsantos/skyline-career/actions/workflows/ci.yml/badge.svg)](https://github.com/daniielsantos/skyline-career/actions/workflows/ci.yml)

## Architecture (Phase 3)

```
[MSFS / Mock]
      ↕
[SimBridgeHost]  C# (preferred) or Node mock-host
      ↕ Named Pipe NDJSON
[NamedPipeSimBridge / Agent CLI]
      ↕ fingerprint + resolve
[Catalog API]  Fastify file-backed (/v1)
      ↕
[profiles/examples + profiles/cache + .data/catalog]
```

Local fallback still works without the catalog (title/ICAO match on `profiles/examples`).

## Quick start

```powershell
npm install
npm run build
npm run build:native
npm run smoke
```

### One-command local stack

```powershell
# Terminal A — catalog + SimConnect host together
npm run start:local
# or without MSFS:
npm run start:local:mock

# Terminal B — agent
node packages/agent/dist/cli.js fingerprint --register
node packages/agent/dist/cli.js resolve
```

PowerShell shortcut: `.\scripts\start-skyline.ps1` (or `-Mode mock`).

### Portable zip

```powershell
npm run pack:portable
# → artifacts/skyline-portable/ and artifacts/skyline-portable.zip
```

Unzip, `npm install`, then `.\start.ps1` or `npm run start:simconnect`.

### Catalog API (Phase 3)

```powershell
# Terminal A — catalog
npm run catalog:serve

# Optional: backfill fingerprints on example profiles
npm run fingerprints:backfill

# Sync documents into profiles/cache
node packages/agent/dist/cli.js sync-catalog
```

Health: `http://localhost:8080/health`  
Manifest: `http://localhost:8080/v1/profiles/manifest`

### Real SimConnect (MSFS 2024)

1. Start MSFS 2024 and load an aircraft.
2. Terminal A: `npm run start:local`
3. Terminal B:

```powershell
node packages/agent/dist/cli.js fingerprint --register
node packages/agent/dist/cli.js resolve
node packages/agent/dist/cli.js apply-auto --fuel-left 20 --fuel-right 20
```

See `native/SimBridgeHost/README.md` for host details.

### Homologate a new default aircraft

```powershell
node packages/agent/dist/cli.js draft-profile --calibrate
node packages/agent/dist/cli.js smoke --profile .\profiles\drafts\<draft>.json
# Promote to profiles/examples (semver 1.0.0), then:
npm run fingerprints:backfill
# Restart catalog:serve to re-index
```

## Packages

| Path | Role |
|------|------|
| `packages/shared` | Fingerprint, signing, profile/API types |
| `packages/runtime` | ProfileEngine, strategies, gating |
| `packages/agent` | NamedPipe IPC client + CLI + catalog client/cache |
| `packages/catalog-api` | Fastify catalog (`/v1` resolve/manifest/document) |
| `native/SimBridgeHost` | C# Named Pipe server + mock/SimConnect clients |
| `profiles/` | Declarative aircraft profiles + local cache |
| `contracts/` | OpenAPI + IPC protocol |
| `database/` | PostgreSQL schema (not wired in Phase 3) |

## IPC

Protocol: `contracts/ipc/protocol.md`  
Pipe default: `\\.\pipe\msfs-compat-simbridge`

## Env

| Variable | Default |
|----------|---------|
| `MSFS_COMPAT_CATALOG_URL` | `http://localhost:8080/v1` |
| `MSFS_COMPAT_PIPE` | default pipe name |
| `CATALOG_SIGNING_KEY` | `dev-local-key` |
| `PORT` / `PROFILES_DIR` / `DATA_DIR` | catalog-api listen + paths |

## CI

GitHub Actions (`.github/workflows/ci.yml`):

- **Ubuntu:** `npm run build`, typecheck, validate profiles, catalog API smoke
- **Windows:** agent smoke against Node mock-host (Named Pipes; no MSFS SDK)

Local equivalent:

```powershell
npm run ci
npm run smoke
```
