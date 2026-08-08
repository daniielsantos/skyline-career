# Skyline Career — desktop

Electron shell around the local Career API + static UI.

## Player install

1. Download **`SkylineCareer-Setup-x.y.z.exe`** from [GitHub Releases](https://github.com/daniielsantos/skyline-career/releases).
2. Run the installer (Windows may warn — builds are **not code-signed** yet; choose More info → Run anyway).
3. Launch **Skyline Career** from the Start Menu / desktop shortcut.
4. Create a profile and play. Saves live under `%AppData%\Skyline Career\`.

### Prerequisites

- Windows x64
- [.NET 8 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/8.0) (for SimBridgeHost)
- MSFS 2024 loaded for Watch / live SimConnect

### In-app updates

Settings → **Updates** (desktop only):

1. App checks GitHub Releases on startup (silent).
2. Banner / card when a newer version exists → **Download** → **Restart to update**.
3. Player saves in AppData are kept across updates.

## Dev (from repo)

```powershell
npm run career:ui
npm run start -w @msfs-compat/desktop
```

## Pack installer

```powershell
npm run pack:desktop
```

Produces under `artifacts/skyline-desktop/`:

- `SkylineCareer-Setup-<version>.exe` — **real NSIS installer** (required)
- `latest.yml` — auto-update metadata for electron-updater
- `win-unpacked/` — debug folder

Pack **fails** if the Setup exe is missing or undersized (avoids shipping a broken stub).

## Publish a release (maintainers)

1. Bump `"version"` in [`package.json`](./package.json) (this is the app version electron-updater compares).
2. `npm run pack:desktop`
3. Create the GitHub release and upload artifacts:

```powershell
$ver = (Get-Content packages/desktop/package.json | ConvertFrom-Json).version
gh release create "v$ver" `
  --title "Skyline Career $ver" `
  --notes "Desktop install + auto-update." `
  "artifacts/skyline-desktop/SkylineCareer-Setup-$ver.exe" `
  "artifacts/skyline-desktop/latest.yml"
```

Also upload `*.exe.blockmap` if present (speeds differential downloads when enabled later).

### Smoke auto-update

1. Install `v0.1.0` Setup on a clean machine / VM.
2. Publish `v0.1.1` to GitHub Releases with Setup + `latest.yml`.
3. Open the installed `0.1.0` app → Settings → Updates should show **0.1.1** → Download → Restart.
4. Confirm version is `0.1.1` and profiles under `%AppData%\Skyline Career\` survived.

## Logs

`%AppData%\Skyline Career\logs\`

- `desktop.log`
- `career-api.log`
- `simbridge-host.log`
