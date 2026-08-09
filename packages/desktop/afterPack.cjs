/**
 * electron-builder strips node_modules from extraResources by default.
 * Re-copy skyline-runtime + updater-nm trees after pack.
 */
const { cp, access, mkdir, readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { createRequire } = require('node:module');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');

async function mustExist(path, label) {
  try {
    await access(path);
  } catch {
    throw new Error(`[afterPack] missing ${label}: ${path}`);
  }
}

exports.default = async function afterPack(context) {
  const root = join(__dirname, '..', '..');
  const resources = join(context.appOutDir, 'resources');

  // --- Career API runtime node_modules (tsx, etc.) ---
  const skylineSrc = join(root, 'artifacts', 'skyline-runtime', 'node_modules');
  const skylineDest = join(resources, 'skyline', 'node_modules');
  await mustExist(skylineSrc, 'skyline-runtime/node_modules');
  await mkdir(join(skylineDest, '..'), { recursive: true });
  console.log(`[afterPack] copying skyline node_modules → ${skylineDest}`);
  await cp(skylineSrc, skylineDest, {
    recursive: true,
    force: true,
    dereference: true,
  });
  await mustExist(
    join(skylineDest, 'tsx', 'dist', 'esm', 'index.mjs'),
    'tsx after copy',
  );
  console.log('[afterPack] skyline tsx present ✓');

  // --- electron-updater flat tree (stripped from extraResources otherwise) ---
  const updaterSrc = join(root, 'artifacts', 'skyline-updater-nm');
  const updaterDest = join(resources, 'updater-nm');
  await mustExist(
    join(updaterSrc, 'node_modules', 'electron-updater', 'package.json'),
    'skyline-updater-nm/node_modules/electron-updater',
  );
  await mkdir(updaterDest, { recursive: true });
  console.log(`[afterPack] copying updater-nm → ${updaterDest}`);
  await cp(updaterSrc, updaterDest, {
    recursive: true,
    force: true,
    dereference: true,
  });
  await mustExist(
    join(updaterDest, 'node_modules', 'electron-updater', 'package.json'),
    'updater-nm/electron-updater after copy',
  );

  // Require from a temp copy outside the monorepo so Node cannot walk up to
  // the workspace root node_modules and fake a green check.
  const probe = await mkdtemp(join(tmpdir(), 'skyline-afterpack-updater-'));
  try {
    await cp(updaterDest, probe, { recursive: true, dereference: true });
    const probeRequire = createRequire(join(probe, 'package.json'));
    probeRequire('electron-updater');
    // Touch package.json so we keep a clear failure mode if empty.
    await readFile(join(probe, 'package.json'), 'utf8');
  } catch (err) {
    throw new Error(
      `[afterPack] updater-nm cannot load electron-updater: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  } finally {
    await rm(probe, { recursive: true, force: true }).catch(() => {});
  }
  console.log('[afterPack] updater-nm electron-updater require OK ✓');
};
