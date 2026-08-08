# Skyline Career — desktop

Electron shell around the local Career API + static UI.

## Dev (from repo)

```powershell
# Terminal A — API + Vite as usual
npm run career:ui

# Or packaged-style API serving Vite dist:
npm run build -w @msfs-compat/career-ui
$env:SKYLINE_UI_DIST = "$PWD\packages\career-ui\dist"
node --import tsx packages/career-ui/server/api.ts
```

```powershell
# Terminal B — Electron window pointing at a running API (optional)
npm run start -w @msfs-compat/desktop
```

In unpackaged Electron, `main.mjs` treats the **repo root** as `SKYLINE_REPO_ROOT` and writes saves under Electron `userData` (`%AppData%\Skyline Career\career`).

## Pack installer

```powershell
npm run pack:desktop
```

Produces:

- `artifacts/skyline-runtime/` — API payload + UI + bush PLN seed + example profiles
- `artifacts/skyline-host/` — SimBridgeHost (or placeholder)
- `artifacts/skyline-desktop/SkylineCareer-*-portable.exe` — single-file portable app
- `artifacts/skyline-desktop/win-unpacked/` — unpacked folder (same contents; useful for debugging)

Optional NSIS setup can be enabled in `packages/desktop/package.json` (`win.target: nsis`); on some Windows hosts NSIS packaging fails with `spawn UNKNOWN` — portable + `dir` are the supported defaults.

## Smoke checklist (clean PC / fresh userData)

1. Run `SkylineCareer-*-portable.exe` (or `win-unpacked/Skyline Career.exe`).
2. Window opens (no terminal).
3. Profile gate → **Create** a profile → enter career.
4. Register pilot / hub; open Freights or Bush trips.
5. Settings → Dev mode **Off** (default): no +15 min / +$100k / Reset / Dispatch Advanced cheats.
6. With MSFS running: SimBridge status connected; Watch can start on a mission.
7. Create a **second** profile; confirm wallet/fleet are isolated.
8. Quit and relaunch — profile list persists under `%AppData%\Skyline Career\`.

Logs: `%AppData%\Skyline Career\logs\career-api.log`

Packaged runtime (API-only) can also be smoke-tested without Electron by pointing `SKYLINE_*` env vars at `artifacts/skyline-runtime` — see `scripts/pack-desktop.mjs` layout.
