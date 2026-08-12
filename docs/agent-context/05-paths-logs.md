# Paths & logs (Windows — Daniel)

## App

| O quê | Path |
|-------|------|
| Install | `%LOCALAPPDATA%\Programs\Skyline Career` |
| Host binaries | `%LOCALAPPDATA%\Programs\Skyline Career\resources\host\` |
| Skyline pack (profiles etc.) | `%LOCALAPPDATA%\Programs\Skyline Career\resources\skyline\` |
| AppData / career | `%APPDATA%\Skyline Career\career\` |
| Host log | `%APPDATA%\Skyline Career\logs\simbridge-host.log` |
| Watch debug | `%APPDATA%\Skyline Career\career\watch-debug.log` |
| SQLite career | `%APPDATA%\Skyline Career\…` / `profiles/career/skyline.sqlite` (ver store) |

## Repo

| O quê | Path |
|-------|------|
| Workspace | `C:\Users\daniel\Documents\msfs-compat-layer` |
| Host project | `native/SimBridgeHost\` |
| Release script | `scripts/release-desktop.mjs` |
| Pack script | `scripts/pack-desktop.mjs` |
| Artifacts | `artifacts\skyline-desktop\` |
| Twin Otter profile | `profiles\examples\microsoft-dhc-6-300-twin-otter-wheels.json` |

## Pipe

- Default: `\\.\pipe\msfs-compat-simbridge`
- Env: `MSFS_COMPAT_PIPE`

## SDK

- Host espera `MSFS_SDK` (ex.: `C:\MSFS 2024 SDK`)
