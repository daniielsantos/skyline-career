import { spawn, spawnSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { homedir } from "node:os";

const require = createRequire(import.meta.url);
const electronRoot = path.dirname(require.resolve("electron/package.json"));
const pathFile = path.join(electronRoot, "path.txt");
const exeName = process.platform === "win32" ? "electron.exe" : "electron";
const exePath = path.join(electronRoot, "dist", exeName);

function electronReady() {
  return existsSync(pathFile) && existsSync(exePath);
}

function runInstallScript() {
  const env = { ...process.env };
  delete env.ELECTRON_SKIP_BINARY_DOWNLOAD;
  return spawnSync(process.execPath, [path.join(electronRoot, "install.js")], {
    stdio: "inherit",
    env,
    cwd: electronRoot,
  });
}

function tryExtractFromCache() {
  const cacheRoot = process.env.electron_config_cache
    || path.join(process.env.LOCALAPPDATA || path.join(homedir(), "AppData", "Local"), "electron", "Cache");
  if (!existsSync(cacheRoot)) return false;
  const version = require(path.join(electronRoot, "package.json")).version;
  const needle = `electron-v${version}-${process.platform}-${process.arch}.zip`;
  /** @type {string[]} */
  const stack = [cacheRoot];
  let zipPath = "";
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else if (ent.name === needle) {
        zipPath = full;
        break;
      }
    }
    if (zipPath) break;
  }
  if (!zipPath) return false;
  const dist = path.join(electronRoot, "dist");
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  const expand = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${dist.replace(/'/g, "''")}' -Force`],
    { stdio: "inherit" },
  );
  if (expand.status !== 0 || !existsSync(exePath)) return false;
  writeFileSync(pathFile, exeName);
  return true;
}

if (!electronReady()) {
  console.log("Electron binary missing; downloading/extracting…");
  runInstallScript();
  if (!electronReady() && !tryExtractFromCache()) {
    console.error(
      "Electron failed to install.\n" +
        "From repo root:\n" +
        "  Remove-Item -Recurse -Force node_modules\\electron\n" +
        "  npm install electron@35.7.5 -w skyline-career-desktop\n" +
        "Also unset ELECTRON_SKIP_BINARY_DOWNLOAD if set.\n" +
        "Do not keep packages/desktop/package-lock.json (breaks workspace .bin).",
    );
    process.exit(1);
  }
}

const electronPath = require("electron");
const child = spawn(electronPath, process.argv.slice(2), {
  stdio: "inherit",
  windowsHide: false,
});
child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});
