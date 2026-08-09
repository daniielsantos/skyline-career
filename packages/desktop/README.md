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
npm run start -w skyline-career-desktop
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

The pack script also:

1. Builds `artifacts/skyline-updater-nm` — complete flat `electron-updater` dependency tree
2. Ships it as `resources/updater-nm` (not inside `app.asar` — electron-builder drops nested deps there)
3. `require('electron-updater')` against that tree before and after pack

If either require fails, the pack aborts and prints the missing module name.

### If NSIS fails with `spawn UNKNOWN`

electron-builder runs an unsigned temp installer to extract the uninstaller; Windows Defender (or a corrupt `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign`) often blocks that spawn.

```powershell
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign" -ErrorAction SilentlyContinue
# Close Skyline Career if it is running, then:
npm run pack:desktop
```

If it still fails, temporarily allow/exclude `artifacts\skyline-desktop` and the electron-builder Cache folder in Defender, then retry.

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

Unsigned builds hit Windows SmartScreen. In-app update opens the downloaded Setup so you can choose **More info → Run anyway** (silent `quitAndInstall` often fails with no recovery).

1. Install an older Setup (e.g. `v0.1.1`) on a clean machine / VM.
2. Publish a newer release (e.g. `v0.1.2`) with Setup + `latest.yml` as **Assets** (not in release notes).
3. Open the installed app → Settings → Updates → Download → **Restart to update** / **Install**.
4. Complete the Windows/SmartScreen + NSIS installer, then launch from Start Menu.
5. Confirm the new version and that profiles under `%AppData%\Skyline Career\` survived.

## Logs

`%AppData%\Skyline Career\logs\`

- `desktop.log`
- `career-api.log`
- `simbridge-host.log`
