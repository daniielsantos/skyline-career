#!/usr/bin/env node
/**
 * Assemble Skyline Career desktop runtime + Electron installer.
 *
 * Outputs:
 *   artifacts/skyline-runtime/   — Node app payload (API + UI + content seed)
 *   artifacts/skyline-host/      — SimBridgeHost Release (optional)
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
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtimeOut = join(root, 'artifacts', 'skyline-runtime');
const hostOut = join(root, 'artifacts', 'skyline-host');
const desktopPkg = join(root, 'packages', 'desktop');

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
        dependencies: {
          tsx: '^4.19.3',
        },
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

  // agent — ship src (career-ui imports .ts) + dist for any JS consumers
  await writeWorkspacePackage('agent', {
    main: './dist/index.js',
    exports: { '.': { import: './dist/index.js' } },
    dependencies: {
      '@msfs-compat/runtime': '0.1.0',
      '@msfs-compat/shared': '0.1.0',
    },
  });
  await cp(
    join(root, 'packages', 'agent', 'src'),
    join(runtimeOut, 'packages', 'agent', 'src'),
    { recursive: true },
  );
  if (await exists(join(root, 'packages', 'agent', 'dist'))) {
    await cp(
      join(root, 'packages', 'agent', 'dist'),
      join(runtimeOut, 'packages', 'agent', 'dist'),
      { recursive: true },
    );
  }

  // career-ui — server sources + Vite UI dist + public already in dist
  const careerUiPkg = JSON.parse(
    await readFile(join(root, 'packages', 'career-ui', 'package.json'), 'utf8'),
  );
  await writeWorkspacePackage('career-ui', {
    main: './server/api.ts',
    dependencies: {
      '@msfs-compat/runtime': '0.1.0',
      '@msfs-compat/shared': '0.1.0',
      'maplibre-gl': careerUiPkg.dependencies['maplibre-gl'],
      react: careerUiPkg.dependencies.react,
      'react-dom': careerUiPkg.dependencies['react-dom'],
    },
  });
  await cp(
    join(root, 'packages', 'career-ui', 'server'),
    join(runtimeOut, 'packages', 'career-ui', 'server'),
    { recursive: true },
  );
  await cp(
    join(root, 'packages', 'career-ui', 'dist'),
    join(runtimeOut, 'packages', 'career-ui', 'dist'),
    { recursive: true },
  );

  // Seed content (no player saves)
  await mkdir(join(runtimeOut, 'profiles', 'career'), { recursive: true });
  const bushSrc = join(root, 'profiles', 'career', 'bush_PLN');
  if (await exists(bushSrc)) {
    await cp(bushSrc, join(runtimeOut, 'profiles', 'career', 'bush_PLN'), {
      recursive: true,
    });
  }
  const ovSrc = join(root, 'profiles', 'career', 'msfs-bush-hub-overrides.json');
  const ovShared = join(
    root,
    'packages',
    'shared',
    'src',
    'data',
    'msfs-bush-hub-overrides.json',
  );
  if (await exists(ovSrc)) {
    await cp(ovSrc, join(runtimeOut, 'profiles', 'career', 'msfs-bush-hub-overrides.json'));
  } else if (await exists(ovShared)) {
    await cp(
      ovShared,
      join(runtimeOut, 'profiles', 'career', 'msfs-bush-hub-overrides.json'),
    );
  }

  // Aircraft profiles for OFP inject / preflight
  await cp(
    join(root, 'profiles', 'examples'),
    join(runtimeOut, 'profiles', 'examples'),
    { recursive: true },
  );
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

  const tsxOk = await exists(
    join(runtimeOut, 'node_modules', 'tsx', 'dist', 'esm', 'index.mjs'),
  );
  if (!tsxOk) {
    throw new Error(
      'skyline-runtime missing node_modules/tsx after npm install — desktop API cannot start',
    );
  }
  console.log('[pack:desktop] runtime includes tsx ✓');
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

  try {
    console.log('[pack:desktop] building SimBridgeHost…');
    await run('npm', ['run', 'build:native'], { shell: true });
  } catch (error) {
    console.warn(
      '[pack:desktop] native rebuild skipped/failed (will use existing bin if present):',
      error instanceof Error ? error.message : error,
    );
  }

  if (await exists(join(hostBin, 'SimBridgeHost.exe'))) {
    await cp(hostBin, hostOut, { recursive: true });
    console.log('[pack:desktop] SimBridgeHost copied →', hostOut);
  } else {
    await writeFile(
      join(hostOut, 'README.txt'),
      'SimBridgeHost binaries were not available at pack time.\n',
    );
    console.warn('[pack:desktop] host placeholder written (Watch will be offline)');
  }
}

async function buildElectron() {
  console.log('[pack:desktop] installing desktop deps…');
  await run('npm', ['install'], { cwd: desktopPkg, shell: true });

  const outDir = join(root, 'artifacts', 'skyline-desktop');
  await mkdir(outDir, { recursive: true });
  // Remove previous tiny/broken Setup leftovers so we never ship a 185KB stub.
  try {
    for (const name of await readdir(outDir)) {
      if (!/^SkylineCareer.*\.(exe|yml|blockmap)$/i.test(name)) continue;
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
  const candidates = [
    join(desktopPkg, 'node_modules', 'electron-builder', 'cli.js'),
    join(root, 'node_modules', 'electron-builder', 'cli.js'),
    join(
      root,
      'node_modules',
      '@msfs-compat',
      'desktop',
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

  // Validate NSIS setup is a real installer, not a failed stub.
  const { stat } = await import('node:fs/promises');
  const names = await readdir(outDir);
  const setup = names.find((n) =>
    /^SkylineCareer-Setup-.*\.exe$/i.test(n),
  );
  if (!setup) {
    throw new Error(
      'NSIS Setup exe missing after electron-builder. Check builder logs (spawn UNKNOWN / winCodeSign).',
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
