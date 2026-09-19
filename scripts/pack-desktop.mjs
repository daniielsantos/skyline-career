#!/usr/bin/env node
/**
 * Assemble Skyline Career desktop runtime + Electron installer.
 *
 * Outputs:
 *   artifacts/skyline-runtime/   — Node app payload (API + UI + content seed)
 *   artifacts/skyline-host/      — SimBridgeHost Release (required; pack fails if rebuild fails)
 *   artifacts/skyline-desktop/   — NSIS + portable from electron-builder
 */
import { spawn } from 'node:child_process';
import {
  access,
  cp,
  mkdir,
  readdir,
  rm,
  writeFile,
  readFile,
  stat,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtimeOut = join(root, 'artifacts', 'skyline-runtime');
const hostOut = join(root, 'artifacts', 'skyline-host');
const updaterNmOut = join(root, 'artifacts', 'skyline-updater-nm');
const desktopPkg = join(root, 'packages', 'desktop');
const desktopRequire = createRequire(join(desktopPkg, 'package.json'));

function run(command, args, opts = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: opts.cwd ?? root,
      stdio: 'inherit',
      shell: opts.shell ?? false,
      windowsHide: true,
      env: { ...process.env, ...opts.env },
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolvePromise(undefined);
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
  });
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function dirSizeBytes(dir) {
  if (!(await exists(dir))) return 0;
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries = [];
    try {
      entries = await readdir(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(cur, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else {
        try {
          total += (await stat(full)).size;
        } catch {
          /* ignore */
        }
      }
    }
  }
  return total;
}

/** UI deps are Vite-bundled into career-ui/dist — not needed by the API process. */
const RUNTIME_UI_ONLY_MODULES = [
  'maplibre-gl',
  'react',
  'react-dom',
  'scheduler',
  'gl-matrix',
  'earcut',
  'pbf',
  'bidi-js',
  'potpack',
  'protocol-buffers-schema',
  'tinyqueue',
];

const RUNTIME_UI_ONLY_SCOPES = ['@maplibre', '@mapbox'];

/**
 * Replace workspace copies under node_modules/@msfs-compat with tiny stubs that
 * point at packages/*. afterPack used to `dereference: true` junctions and
 * doubled ~50MB of career-ui/shared into the installer.
 */
async function writeMsfsCompatStubs(runtimeRoot) {
  const scopeDir = join(runtimeRoot, 'node_modules', '@msfs-compat');
  await mkdir(scopeDir, { recursive: true });
  const names = ['shared', 'runtime', 'career-ui'];
  for (const name of names) {
    const pkgPath = join(runtimeRoot, 'packages', name);
    if (!(await exists(pkgPath))) continue;
    const dest = join(scopeDir, name);
    await rm(dest, { recursive: true, force: true });
    await mkdir(dest, { recursive: true });
    const main =
      name === 'career-ui'
        ? '../../../packages/career-ui/server/api.bundle.mjs'
        : `../../../packages/${name}/dist/index.js`;
    const pkg = {
      name: `@msfs-compat/${name}`,
      version: '0.1.0',
      private: true,
      type: 'module',
      main,
    };
    // main-only stub: Node `exports` may reject `../` paths outside the package root.
    await writeFile(join(dest, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
  }
  // Drop unused workspace packages from the scope (agent is bundled into the API).
  for (const stale of ['agent', 'catalog-api']) {
    await rm(join(scopeDir, stale), { recursive: true, force: true });
  }
}

async function stripPackedJunkFiles(rootDir) {
  if (!(await exists(rootDir))) return { removed: 0, bytes: 0 };
  let removed = 0;
  let bytes = 0;
  const stack = [rootDir];
  while (stack.length) {
    const cur = stack.pop();
    let entries = [];
    try {
      entries = await readdir(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(cur, entry.name);
      if (entry.isDirectory()) {
        // Drop maplibre/esbuild sourcemap-heavy trees already handled by module rm;
        // still walk remaining node_modules for *.map.
        stack.push(full);
        continue;
      }
      const name = entry.name;
      const drop =
        name.endsWith('.map') ||
        name.endsWith('.d.ts') ||
        /\.test\.[cm]?js$/i.test(name) ||
        /-dev\.(m?js|cjs)$/i.test(name);
      if (!drop) continue;
      try {
        bytes += (await stat(full)).size;
        await rm(full, { force: true });
        removed += 1;
      } catch {
        /* ignore */
      }
    }
  }
  return { removed, bytes };
}

async function slimRuntimePayload() {
  const before = await dirSizeBytes(runtimeOut);
  const nm = join(runtimeOut, 'node_modules');

  for (const name of RUNTIME_UI_ONLY_MODULES) {
    await rm(join(nm, name), { recursive: true, force: true });
  }
  for (const scope of RUNTIME_UI_ONLY_SCOPES) {
    await rm(join(nm, scope), { recursive: true, force: true });
  }

  await writeMsfsCompatStubs(runtimeOut);

  const junkPackages = await stripPackedJunkFiles(join(runtimeOut, 'packages'));
  const junkNm = await stripPackedJunkFiles(nm);
  // Drop server TypeScript sources — packaged boot uses api.bundle.mjs only.
  const serverDir = join(runtimeOut, 'packages', 'career-ui', 'server');
  if (await exists(serverDir)) {
    for (const name of await readdir(serverDir)) {
      if (name === 'api.bundle.mjs') continue;
      if (
        /\.test\.[cm]?[jt]sx?$/i.test(name) ||
        /\.[cm]?[jt]sx?$/i.test(name)
      ) {
        await rm(join(serverDir, name), { force: true });
      }
    }
  }
  // Agent TS is compiled into the API bundle — do not ship sources.
  await rm(join(runtimeOut, 'packages', 'agent'), {
    recursive: true,
    force: true,
  });

  const after = await dirSizeBytes(runtimeOut);
  const savedMb = ((before - after) / (1024 * 1024)).toFixed(1);
  console.log(
    `[pack:desktop] slim runtime ${savedMb} MB saved ` +
      `(stubs @msfs-compat, drop UI deps/tsx/agent src, strip ${junkPackages.removed + junkNm.removed} junk files)`,
  );
  console.log(
    `[pack:desktop] runtime size ${(after / (1024 * 1024)).toFixed(1)} MB`,
  );
}

/**
 * Build a complete flat electron-updater tree under artifacts/skyline-updater-nm.
 * Packaged main.mjs loads from resources/updater-nm (extraResources) — never
 * from app.asar, where electron-builder routinely drops transitive deps.
 */
async function materializeUpdaterNodeModules() {
  console.log('[pack:desktop] building artifacts/skyline-updater-nm…');

  const names = new Set();
  const queue = ['electron-updater'];
  while (queue.length) {
    const name = queue.shift();
    if (!name || names.has(name)) continue;
    names.add(name);
    let pkgJsonPath;
    try {
      pkgJsonPath = desktopRequire.resolve(`${name}/package.json`);
    } catch (err) {
      throw new Error(
        `Cannot resolve production module "${name}" from packages/desktop: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    const pkg = JSON.parse(await readFile(pkgJsonPath, 'utf8'));
    for (const dep of Object.keys(pkg.dependencies || {})) {
      queue.push(dep);
    }
  }

  await rm(updaterNmOut, { recursive: true, force: true });
  await mkdir(join(updaterNmOut, 'node_modules'), { recursive: true });
  await writeFile(
    join(updaterNmOut, 'package.json'),
    `${JSON.stringify(
      {
        name: 'skyline-updater-nm',
        private: true,
        description: 'Flat electron-updater tree for packaged Skyline Career',
      },
      null,
      2,
    )}\n`,
  );

  for (const name of [...names].sort()) {
    const pkgJsonPath = desktopRequire.resolve(`${name}/package.json`);
    const src = dirname(pkgJsonPath);
    const dest = join(updaterNmOut, 'node_modules', ...name.split('/'));
    await mkdir(dirname(dest), { recursive: true });
    await cp(src, dest, { recursive: true, dereference: true });
    await rm(join(dest, 'node_modules'), { recursive: true, force: true }).catch(
      () => {},
    );
  }
  console.log(
    `[pack:desktop] updater-nm modules (${names.size}): ${[...names].sort().join(', ')}`,
  );

  // Isolated probe — must not walk into the monorepo root node_modules.
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const probe = await mkdtemp(join(tmpdir(), 'skyline-updater-probe-'));
  try {
    await cp(updaterNmOut, probe, { recursive: true, dereference: true });
    const probeRequire = createRequire(join(probe, 'package.json'));
    probeRequire('electron-updater');
    console.log('[pack:desktop] updater-nm isolated require OK ✓');
  } catch (err) {
    throw new Error(
      `updater-nm tree incomplete (isolated require failed): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  } finally {
    await rm(probe, { recursive: true, force: true }).catch(() => {});
  }
}

async function writeRuntimePackageJson() {
  await writeFile(
    join(runtimeOut, 'package.json'),
    `${JSON.stringify(
      {
        name: 'skyline-career-runtime',
        version: '0.1.0',
        private: true,
        type: 'module',
        workspaces: ['packages/*'],
        engines: { node: '>=22.5' },
        dependencies: {},
      },
      null,
      2,
    )}\n`,
  );
}

async function writeWorkspacePackage(name, extra = {}) {
  const dest = join(runtimeOut, 'packages', name);
  await mkdir(dest, { recursive: true });
  await writeFile(
    join(dest, 'package.json'),
    `${JSON.stringify(
      {
        name: `@msfs-compat/${name}`,
        version: '0.1.0',
        private: true,
        type: 'module',
        ...extra,
      },
      null,
      2,
    )}\n`,
  );
}

async function assembleRuntime() {
  console.log('[pack:desktop] building TypeScript + Career UI…');
  await run('npm', ['run', 'build'], { shell: true });

  await rm(runtimeOut, { recursive: true, force: true });
  await mkdir(runtimeOut, { recursive: true });
  await writeRuntimePackageJson();

  // shared
  await writeWorkspacePackage('shared', {
    main: './dist/index.js',
    exports: { '.': { import: './dist/index.js' } },
    // Optional: only loaded when CAREER_PG / backend=postgres. Omit from
    // eager shared barrel so SP desktop boots without this package installed.
    optionalDependencies: { pg: '^8.14.1' },
  });
  await cp(
    join(root, 'packages', 'shared', 'dist'),
    join(runtimeOut, 'packages', 'shared', 'dist'),
    { recursive: true },
  );

  // runtime
  await writeWorkspacePackage('runtime', {
    main: './dist/index.js',
    exports: { '.': { import: './dist/index.js' } },
    dependencies: { '@msfs-compat/shared': '0.1.0' },
  });
  await cp(
    join(root, 'packages', 'runtime', 'dist'),
    join(runtimeOut, 'packages', 'runtime', 'dist'),
    { recursive: true },
  );

  // career-ui — server sources (bundled below) + Vite UI dist
  await writeWorkspacePackage('career-ui', {
    main: './server/api.bundle.mjs',
    dependencies: {
      '@msfs-compat/runtime': '0.1.0',
      '@msfs-compat/shared': '0.1.0',
    },
  });
  await cp(
    join(root, 'packages', 'career-ui', 'server'),
    join(runtimeOut, 'packages', 'career-ui', 'server'),
    {
      recursive: true,
      filter: (src) => !/\.test\.[cm]?[jt]sx?$/i.test(src),
    },
  );
  await cp(
    join(root, 'packages', 'career-ui', 'dist'),
    join(runtimeOut, 'packages', 'career-ui', 'dist'),
    { recursive: true },
  );

  await bundleCareerApi();

  // Seed content (no player saves) — hub MSFS overrides only (bush trips removed).
  await mkdir(join(runtimeOut, 'profiles', 'career'), { recursive: true });
  const ovSrc = join(root, 'profiles', 'career', 'msfs-hub-overrides.json');
  const ovShared = join(
    root,
    'packages',
    'shared',
    'src',
    'data',
    'msfs-hub-overrides.json',
  );
  const ovDest = join(runtimeOut, 'profiles', 'career', 'msfs-hub-overrides.json');
  if (await exists(ovSrc)) {
    await cp(ovSrc, ovDest);
  } else if (await exists(ovShared)) {
    await cp(ovShared, ovDest);
  }

  // Aircraft profiles (examples) + OFP roles packs (preflight / inject station maps)
  await cp(
    join(root, 'profiles', 'examples'),
    join(runtimeOut, 'profiles', 'examples'),
    { recursive: true },
  );
  const ofpSrc = join(root, 'profiles', 'ofp');
  if (!(await exists(ofpSrc))) {
    throw new Error('profiles/ofp missing — required for desktop preflight / inject');
  }
  await cp(ofpSrc, join(runtimeOut, 'profiles', 'ofp'), { recursive: true });
  const ofpGear = join(
    runtimeOut,
    'profiles',
    'ofp',
    'blacksquare-caravan-professional-gear.json',
  );
  if (!(await exists(ofpGear))) {
    throw new Error(
      'profiles/ofp copy incomplete — missing blacksquare-caravan-professional-gear.json',
    );
  }
  await mkdir(join(runtimeOut, 'profiles', 'cache'), { recursive: true });

  // README for the runtime payload
  await writeFile(
    join(runtimeOut, 'README.md'),
    `# Skyline Career runtime

This folder is the read-only app payload used by the Electron shell.
Player saves live under %AppData%\\\\Skyline Career\\\\career\\\\.
`,
  );

  console.log('[pack:desktop] npm install in runtime…');
  await run('npm', ['install', '--omit=dev'], {
    cwd: runtimeOut,
    shell: true,
  });

  const bundleOk = await exists(
    join(
      runtimeOut,
      'packages',
      'career-ui',
      'server',
      'api.bundle.mjs',
    ),
  );
  if (!bundleOk) {
    throw new Error(
      'skyline-runtime missing packages/career-ui/server/api.bundle.mjs — desktop API cannot start',
    );
  }
  console.log('[pack:desktop] runtime includes api.bundle.mjs ✓');
  await slimRuntimePayload();
}

/**
 * Compile career-ui server + agent TS into one ESM file so the packaged
 * desktop does not need tsx / agent sources at runtime.
 */
async function bundleCareerApi() {
  console.log('[pack:desktop] bundling career-ui server → api.bundle.mjs…');
  let esbuild;
  try {
    esbuild = await import('esbuild');
  } catch (err) {
    throw new Error(
      `esbuild required for pack slim phase 2: ${
        err instanceof Error ? err.message : String(err)
      }. Run npm install at repo root.`,
    );
  }
  const entry = join(root, 'packages', 'career-ui', 'server', 'api.ts');
  const outfile = join(
    runtimeOut,
    'packages',
    'career-ui',
    'server',
    'api.bundle.mjs',
  );
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outfile,
    // Keep workspace packages external — shipped as packages/*/dist.
    packages: 'external',
    logLevel: 'warning',
  });
  if (!(await exists(outfile))) {
    throw new Error(`esbuild did not write ${outfile}`);
  }
  const sizeMb = ((await stat(outfile)).size / (1024 * 1024)).toFixed(2);
  console.log(`[pack:desktop] api.bundle.mjs ${sizeMb} MB ✓`);
}

async function assembleHost() {
  await rm(hostOut, { recursive: true, force: true });
  await mkdir(hostOut, { recursive: true });

  const hostBin = join(
    root,
    'native',
    'SimBridgeHost',
    'bin',
    'Release',
    'net8.0-windows',
  );

  console.log('[pack:desktop] building SimBridgeHost…');
  try {
    await run('npm', ['run', 'build:native'], { shell: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `SimBridgeHost rebuild failed (${detail}). ` +
        'Close start:local / Skyline Career so SimBridgeHost.exe is unlocked, then retry. ' +
        'Refusing to pack a stale Host.',
    );
  }

  const hostExe = join(hostBin, 'SimBridgeHost.exe');
  const hostDll = join(hostBin, 'SimBridgeHost.dll');
  if (!(await exists(hostExe)) || !(await exists(hostDll))) {
    throw new Error(
      'SimBridgeHost rebuild did not produce exe + dll — refusing to pack.',
    );
  }

  const dll = await readFile(hostDll);
  if (!dll.toString('latin1').includes('ReadSimVarsAsync')) {
    throw new Error(
      'SimBridgeHost.dll is missing ReadSimVarsAsync after rebuild — refusing to pack a stale Host.',
    );
  }

  await cp(hostBin, hostOut, { recursive: true });
  console.log('[pack:desktop] SimBridgeHost copied →', hostOut);
}

async function buildElectron() {
  console.log('[pack:desktop] installing desktop deps…');
  // Install with hoisted layout, then flatten every production transitive dep
  // into packages/desktop/node_modules (electron-builder skips nested modules).
  await run(
    'npm',
    ['install', '--install-strategy=hoisted', '--no-workspaces', '--ignore-scripts'],
    { cwd: desktopPkg, shell: true },
  );
  await materializeUpdaterNodeModules();
  const outDir = join(root, 'artifacts', 'skyline-desktop');
  await mkdir(outDir, { recursive: true });
  // Remove previous tiny/broken Setup leftovers so we never ship a 185KB stub.
  try {
    for (const name of await readdir(outDir)) {
      if (!/^(SkylineCareer|Airframe).*\.(exe|yml|blockmap)$/i.test(name)) continue;
      const full = join(outDir, name);
      try {
        const { stat } = await import('node:fs/promises');
        const info = await stat(full);
        if (name.endsWith('.exe') && info.size < 5_000_000) {
          console.warn(
            `[pack:desktop] removing undersized artifact ${name} (${info.size} bytes)`,
          );
          await rm(full, { force: true });
        }
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* empty out dir */
  }

  console.log('[pack:desktop] electron-builder (NSIS, --publish never)…');
  // NSIS runs an unsigned stub to extract the uninstaller; Windows Defender /
  // a corrupt winCodeSign cache often yields `spawn UNKNOWN`. Clear leftovers
  // and retry once before failing the pack.
  const winCodeSignCache = join(
    process.env.LOCALAPPDATA || '',
    'electron-builder',
    'Cache',
    'winCodeSign',
  );
  if (winCodeSignCache && (await exists(winCodeSignCache))) {
    console.log('[pack:desktop] clearing electron-builder winCodeSign cache…');
    await rm(winCodeSignCache, { recursive: true, force: true });
  }
  for (const name of await readdir(outDir).catch(() => [])) {
    if (/^__uninstaller/i.test(name)) {
      await rm(join(outDir, name), { force: true }).catch(() => {});
    }
  }

  const candidates = [
    join(desktopPkg, 'node_modules', 'electron-builder', 'cli.js'),
    join(root, 'node_modules', 'electron-builder', 'cli.js'),
    join(
      root,
      'node_modules',
      'skyline-career-desktop',
      'node_modules',
      'electron-builder',
      'cli.js',
    ),
  ];
  let cli = null;
  for (const c of candidates) {
    if (await exists(c)) {
      cli = c;
      break;
    }
  }
  const builderEnv = {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
  };
  const args = ['--win', '--x64', '--publish', 'never'];

  async function runBuilder() {
    if (!cli) {
      await run('npx', ['electron-builder', ...args], {
        cwd: desktopPkg,
        shell: true,
        env: builderEnv,
      });
    } else {
      await run(process.execPath, [cli, ...args], {
        cwd: desktopPkg,
        shell: false,
        env: builderEnv,
      });
    }
  }

  try {
    await runBuilder();
  } catch (err) {
    // electron-builder prints `spawn UNKNOWN` to the console; our runner only
    // sees a non-zero exit code. Retry once after clearing the usual causes.
    console.warn(
      `[pack:desktop] electron-builder failed (${err instanceof Error ? err.message : String(err)}). Clearing cache and retrying once…`,
    );
    if (winCodeSignCache) {
      await rm(winCodeSignCache, { recursive: true, force: true }).catch(
        () => {},
      );
    }
    for (const name of await readdir(outDir).catch(() => [])) {
      if (/^__uninstaller/i.test(name) || /\.exe$/i.test(name)) {
        const full = join(outDir, name);
        try {
          const { stat } = await import('node:fs/promises');
          const info = await stat(full);
          if (/^__uninstaller/i.test(name) || info.size < 5_000_000) {
            await rm(full, { force: true });
          }
        } catch {
          /* ignore */
        }
      }
    }
    await runBuilder();
  }

  // Validate NSIS setup is a real installer, not a failed stub.
  const { stat } = await import('node:fs/promises');
  const names = await readdir(outDir);
  const desktopPkgJson = JSON.parse(
    await readFile(join(desktopPkg, 'package.json'), 'utf8'),
  );
  const expectedSetup = `Airframe-Setup-${desktopPkgJson.version}.exe`;
  const setup =
    names.find((n) => n.toLowerCase() === expectedSetup.toLowerCase()) ||
    names
      .filter((n) => /^(Airframe-Setup|SkylineCareer-Setup)-.*\.exe$/i.test(n))
      .sort()
      .at(-1);
  if (!setup) {
    throw new Error(
      'NSIS Setup exe missing after electron-builder. Check builder logs (spawn UNKNOWN / winCodeSign).',
    );
  }
  if (setup.toLowerCase() !== expectedSetup.toLowerCase()) {
    console.warn(
      `[pack:desktop] expected ${expectedSetup}, validating ${setup} instead`,
    );
  }
  const setupPath = join(outDir, setup);
  const setupSize = (await stat(setupPath)).size;
  if (setupSize < 20_000_000) {
    throw new Error(
      `NSIS Setup looks invalid (${setup} is ${setupSize} bytes). Refusing to treat it as a release artifact.`,
    );
  }
  console.log(
    `[pack:desktop] NSIS OK → ${setup} (${(setupSize / 1_000_000).toFixed(1)} MB)`,
  );
  if (names.some((n) => /^latest\.yml$/i.test(n))) {
    console.log('[pack:desktop] latest.yml present (for GitHub Releases auto-update)');
  } else {
    console.warn(
      '[pack:desktop] latest.yml missing — electron-updater needs it on the GitHub Release',
    );
  }
  const expectedBlockmap = `${setup}.blockmap`;
  const blockmapName = names.find(
    (n) => n.toLowerCase() === expectedBlockmap.toLowerCase(),
  );
  if (!blockmapName) {
    throw new Error(
      `Missing ${expectedBlockmap} after electron-builder (nsis.differentialPackage). electron-updater needs it for delta downloads.`,
    );
  }
  console.log(`[pack:desktop] blockmap OK → ${blockmapName}`);

  // Packaged app loads updater from resources/updater-nm (not asar).
  // Verify in an isolated temp dir — createRequire inside the repo can walk up
  // to the monorepo root node_modules and hide a stripped extraResources tree.
  const packedUpdaterNmDir = join(
    outDir,
    'win-unpacked',
    'resources',
    'updater-nm',
  );
  const packedUpdaterPkg = join(packedUpdaterNmDir, 'package.json');
  const packedUpdaterMod = join(
    packedUpdaterNmDir,
    'node_modules',
    'electron-updater',
    'package.json',
  );
  if (!(await exists(packedUpdaterPkg)) || !(await exists(packedUpdaterMod))) {
    throw new Error(
      `resources/updater-nm incomplete after pack (electron-builder strips node_modules from extraResources — afterPack must restore it)`,
    );
  }
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const probe = await mkdtemp(join(tmpdir(), 'skyline-pack-updater-'));
  try {
    await cp(packedUpdaterNmDir, probe, { recursive: true, dereference: true });
    const packedRequire = createRequire(join(probe, 'package.json'));
    packedRequire('electron-updater');
  } catch (err) {
    throw new Error(
      `packed resources/updater-nm cannot load electron-updater: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  } finally {
    await rm(probe, { recursive: true, force: true }).catch(() => {});
  }
  console.log('[pack:desktop] packed updater-nm electron-updater require OK ✓');

  // asar must NOT carry a broken stub of electron-updater.
  const asarPath = join(outDir, 'win-unpacked', 'resources', 'app.asar');
  if (await exists(asarPath)) {
    const req = createRequire(import.meta.url);
    let asar;
    try {
      asar = req(join(desktopPkg, 'node_modules', '@electron', 'asar'));
    } catch {
      try {
        asar = req('@electron/asar');
      } catch {
        asar = null;
      }
    }
    if (asar) {
      const list = asar.listPackage(asarPath).map(String);
      const hasUpdater = list.some((p) =>
        /node_modules[/\\]electron-updater([/\\]|$)/i.test(p),
      );
      if (hasUpdater) {
        throw new Error(
          'app.asar still contains electron-updater — keep it in devDependencies and exclude node_modules from build.files',
        );
      }
      console.log('[pack:desktop] app.asar has no electron-updater stub ✓');
    }
  }
}

async function main() {
  await mkdir(join(root, 'artifacts'), { recursive: true });
  await assembleRuntime();
  await assembleHost();
  await buildElectron();

  const outDir = join(root, 'artifacts', 'skyline-desktop');
  let listing = [];
  try {
    listing = await readdir(outDir);
  } catch {
    /* empty */
  }
  console.log(`[pack:desktop] OK → ${outDir}`);
  if (listing.length) console.log(`[pack:desktop] artifacts: ${listing.join(', ')}`);
}

main().catch((err) => {
  console.error('[pack:desktop] FAILED', err instanceof Error ? err.message : err);
  process.exit(1);
});
