# SimBridgeHost

Native Windows host that exposes SimConnect to the TypeScript runtime over a
Named Pipe using NDJSON.

## Prerequisites

- [.NET 8+ SDK](https://dotnet.microsoft.com/download)
- [MSFS 2024 SDK](https://docs.flightsimulator.com/msfs2024/html/1_Introduction/SDK_Overview.htm) installed at `C:\MSFS 2024 SDK`
  - Required files:
    - `SimConnect SDK\lib\managed\Microsoft.FlightSimulator.SimConnect.dll`
    - `SimConnect SDK\lib\SimConnect.dll`

Override SDK path with env `MSFS_SDK` or `--sdk <path>`.

## Quick start

### Mock (no MSFS)

```powershell
dotnet run --project native/SimBridgeHost -c Release -- --mode mock
```

### Real SimConnect (MSFS 2024 must be running)

1. Start **MSFS 2024** and load any aircraft (World Map → Ready to Fly).
2. In a terminal:

```powershell
npm run host:simconnect
```

3. In another terminal:

```powershell
node packages/agent/dist/cli.js live
node packages/agent/dist/cli.js smoke --profile profiles/examples/asobo-c172-skyhawk.json
```

## Modes

| Mode | Description |
|------|-------------|
| `mock` | In-memory C172-like state. Default for CI/dev. |
| `simconnect` | Real MSFS 2024 via managed SimConnect. |

## Pipe

Default: `\\.\pipe\msfs-compat-simbridge`

```powershell
$env:MSFS_COMPAT_PIPE = "msfs-compat-dev"
dotnet run --project native/SimBridgeHost -c Release -- --mode mock --pipe msfs-compat-dev
```

## What works in simconnect mode (Phase 2.1)

- `connect` / `disconnect` / `ping` / `status`
- `readSimVar` / `writeSimVar` (FLOAT64)
- `readLVar` / `writeLVar` via SimConnect `L:` prefix (MSFS SU12+)
- `snapshot` (fuel, payload, CG, ground/engine/brake, sim rate)
- `getAircraftIdentity` (TITLE, ATC MODEL/TYPE/ID)
- `triggerEvent` (mapped client events)

## Not yet (needs WASM bridge)

- `triggerHVar`
- Enumerating *all* LVars present in the aircraft (must probe known names)
