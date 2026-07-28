#!/usr/bin/env node
/**
 * Build a portable folder + zip under artifacts/skyline-portable.
 *
 * Includes compiled TS packages, example profiles, start scripts, and
 * (when available) the Release SimBridgeHost binaries.
 */
import { spawn } from 'node:child_process';
import { cp, mkdir, rm, writeFile, access, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'artifacts', 'skyline-portable');
const zipPath = join(root, 'artifacts', 'skyline-portable.zip');

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
      else reject(new Error(`${command} exited with ${code}`));
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

async function copyPackage(name) {
  const src = join(root, 'packages', name);
  const dest = join(outDir, 'packages', name);
  await mkdir(dest, { recursive: true });
  await cp(join(src, 'dist'), join(dest, 'dist'), { recursive: true });
}

async function zipWithPowerShell(sourceDir, destZip) {
  await rm(destZip, { force: true });
  await run(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${sourceDir}\\*' -DestinationPath '${destZip}' -Force`,
    ],
    { shell: true },
  );
}

async function main() {
  console.log('[pack] building TypeScript packages...');
  await run('npm', ['run', 'build'], { shell: true });

  let nativeOk = false;
  try {
    console.log('[pack] building native SimBridgeHost (optional)...');
    await run('npm', ['run', 'build:native'], { shell: true });
    nativeOk = true;
  } catch (error) {
    console.warn(
      '[pack] native build skipped/failed:',
      error instanceof Error ? error.message : error,
    );
  }

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  for (const pkg of ['shared', 'runtime', 'agent', 'catalog-api']) {
    await copyPackage(pkg);
  }

  await cp(join(root, 'profiles', 'examples'), join(outDir, 'profiles', 'examples'), {
    recursive: true,
  });
  await mkdir(join(outDir, 'profiles', 'cache'), { recursive: true });
  await mkdir(join(outDir, '.data', 'catalog'), { recursive: true });
  await mkdir(join(outDir, 'scripts'), { recursive: true });

  await cp(join(root, 'scripts', 'start-skyline.mjs'), join(outDir, 'scripts', 'start-skyline.mjs'));
  await cp(join(root, 'scripts', 'start-skyline.ps1'), join(outDir, 'start.ps1'));

  if (nativeOk) {
    const hostBin = join(
      root,
      'native',
      'SimBridgeHost',
      'bin',
      'Release',
      'net8.0-windows',
    );
    if (await exists(hostBin)) {
      await cp(hostBin, join(outDir, 'host'), { recursive: true });
    }
  }

  await writeFile(
    join(outDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'skyline-career-portable',
        version: '0.1.0',
        private: true,
        type: 'module',
        workspaces: ['packages/*'],
        scripts: {
          start: 'node scripts/start-skyline.mjs',
          'start:mock': 'node scripts/start-skyline.mjs --mode mock',
          'start:simconnect': 'node scripts/start-skyline.mjs --mode simconnect',
          agent: 'node packages/agent/dist/cli.js',
        },
        engines: { node: '>=20' },
        dependencies: { fastify: '^5.2.1' },
      },
      null,
      2,
    )}\n`,
  );

  await writeFile(
    join(outDir, 'packages/shared/package.json'),
    `${JSON.stringify(
      {
        name: '@msfs-compat/shared',
        version: '0.1.0',
        private: true,
        type: 'module',
        main: './dist/index.js',
        exports: { '.': { import: './dist/index.js' } },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(outDir, 'packages/runtime/package.json'),
    `${JSON.stringify(
      {
        name: '@msfs-compat/runtime',
        version: '0.1.0',
        private: true,
        type: 'module',
        main: './dist/index.js',
        exports: { '.': { import: './dist/index.js' } },
        dependencies: { '@msfs-compat/shared': '0.1.0' },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(outDir, 'packages/agent/package.json'),
    `${JSON.stringify(
      {
        name: '@msfs-compat/agent',
        version: '0.1.0',
        private: true,
        type: 'module',
        main: './dist/index.js',
        bin: { 'msfs-compat-agent': './dist/cli.js' },
        exports: { '.': { import: './dist/index.js' } },
        dependencies: {
          '@msfs-compat/runtime': '0.1.0',
          '@msfs-compat/shared': '0.1.0',
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(outDir, 'packages/catalog-api/package.json'),
    `${JSON.stringify(
      {
        name: '@msfs-compat/catalog-api',
        version: '0.1.0',
        private: true,
        type: 'module',
        main: './dist/index.js',
        bin: { 'msfs-compat-catalog': './dist/cli.js' },
        exports: { '.': { import: './dist/index.js' } },
        dependencies: {
          '@msfs-compat/shared': '0.1.0',
          fastify: '^5.2.1',
        },
      },
      null,
      2,
    )}\n`,
  );

  await writeFile(
    join(outDir, 'README.md'),
    `# Skyline Career — portable runtime

## Requirements
- Node.js 20+
- Live MSFS: .NET 8 + MSFS 2024 SDK (or use bundled \`host/\` if present)

## Setup (once)
\`\`\`powershell
cd skyline-portable
npm install
\`\`\`

## Start stack (one terminal)
\`\`\`powershell
.\\start.ps1
# or:
npm run start:simconnect
npm run start:mock
\`\`\`

## Agent (second terminal)
\`\`\`powershell
npm run agent -- fingerprint --register
npm run agent -- resolve
npm run agent -- apply-auto --fuel-left 20 --fuel-right 20
\`\`\`

Catalog: http://localhost:8080/health
`,
  );

  console.log('[pack] npm install in portable folder...');
  await run('npm', ['install', '--omit=dev'], { cwd: outDir, shell: true });

  console.log('[pack] creating zip...');
  await zipWithPowerShell(outDir, zipPath);

  const entries = await readdir(outDir);
  console.log(`[pack] OK → ${outDir}`);
  console.log(`[pack] zip → ${zipPath}`);
  console.log(`[pack] contents: ${entries.join(', ')}`);
}

main().catch((err) => {
  console.error('[pack] FAILED', err instanceof Error ? err.message : err);
  process.exit(1);
});
