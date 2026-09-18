# Airframe Career — desktop

Electron shell around the local Career API + static UI.

## Player install

1. Download **`Airframe-Setup-x.y.z.exe`** from [GitHub Releases](https://github.com/daniielsantos/skyline-career/releases).
2. Run the installer (Windows may warn — builds are **not code-signed** yet; choose More info → Run anyway). One-click Setup — no Next/Next wizard.
3. Launch **Airframe Career** from the Start Menu / desktop shortcut.
4. Create a profile and play. Saves live under `%AppData%\Skyline Career\` (legacy folder until migrator).

### Prerequisites

- Windows x64
- [.NET 8 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/8.0) (for SimBridgeHost)
- MSFS 2024 loaded for Watch / live SimConnect

### In-app updates

Settings → **Updates** (desktop only) or the topbar **Update** pill:

1. App checks GitHub Releases on startup (silent).
2. **Download** → **Install** closes the app, then starts the one-click Setup ~2s later (so NSIS does not race “app is still running”). Visible progress window (no `/S`).
3. If Windows warns (unsigned), choose **More info → Run anyway**; watch the installer until it finishes — Airframe should reopen.
4. Player saves in AppData are kept across updates.

Fully silent Cursor-style updates (no SmartScreen, no installer UI) need an Authenticode certificate — not enabled yet.

## Dev (from repo)

```powershell
npm run career:ui
npm run start -w skyline-career-desktop
```

## Icons

Windows Start Menu / taskbar / `.exe` icon come from [`build/icon.ico`](./build/icon.ico) (embedded in afterPack via `rcedit`). The window icon uses the same file from the asar.

After installing a build that changed the icon, Windows may keep a cached Electron atom — restart Explorer or sign out/in if the new icon does not show immediately.

## Pack installer

```powershell
npm run pack:desktop
```

Produces under `artifacts/skyline-desktop/`:

- `Airframe-Setup-<version>.exe` — **real NSIS installer** (required)
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
# Close Airframe Career if it is running, then:
npm run pack:desktop
```

If it still fails, temporarily allow/exclude `artifacts\skyline-desktop` and the electron-builder Cache folder in Defender, then retry.

## Publish a release (maintainers)

One command (pack + validate + GitHub release):

```powershell
# Use the version already in packages/desktop/package.json:
npm run release:desktop -- --yes

# Or bump first (patch/minor/major), pack, commit+push, then publish:
npm run release:desktop -- --bump patch --yes

# Pack + validate only (no GitHub upload):
npm run release:desktop -- --dry-run
```

Guardrails:

- Committed source; `--allow-dirty` permits only known untracked diagnostics/build output
- `gh` installed and authenticated
- Setup exe present and sized; `latest.yml` version must match `package.json`
- Refuses if tag/release `vX.Y.Z` already exists
- Refreshes remote tags and pins the release tag to the published HEAD commit

Assets uploaded: `Airframe-Setup-<ver>.exe`, `latest.yml`, and `.blockmap` when present. Release notes are generated from commits since the previous `v*` tag and include a smoke checklist.

### Manual fallback

```powershell
npm run pack:desktop
$ver = (Get-Content packages/desktop/package.json | ConvertFrom-Json).version
gh release create "v$ver" `
  --title "Airframe Career $ver" `
  --notes-file "artifacts/skyline-desktop/RELEASE_NOTES_$ver.md" `
  "artifacts/skyline-desktop/Airframe-Setup-$ver.exe" `
  "artifacts/skyline-desktop/latest.yml"
```

### Smoke auto-update

Unsigned builds hit Windows SmartScreen. In-app update opens the one-click Setup **visibly** (no `/S`) after you confirm so progress and SmartScreen stay on screen.

1. Install an older Setup (e.g. `v0.3.90`) on a clean machine / VM.
2. Publish a newer release (e.g. `v0.3.91+`) with Setup + `latest.yml` as **Assets** (not in release notes).
3. Open the installed app → topbar **Update** / Settings → Updates → Download → **Install**.
4. Clear SmartScreen if prompted; watch the installer finish and reopen (or use Start Menu).
5. Confirm the new version and that profiles under `%AppData%\Skyline Career\` survived.

## Logs

`%AppData%\Skyline Career\logs\`

- `desktop.log`
- `career-api.log`
- `simbridge-host.log`
