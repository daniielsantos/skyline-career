/**
 * electron-builder strips node_modules from extraResources by default.
 * Copy skyline-runtime/node_modules into the packaged app after pack.
 */
const { cp, access, mkdir } = require('node:fs/promises');
const { join } = require('node:path');

exports.default = async function afterPack(context) {
  const root = join(__dirname, '..', '..');
  const src = join(root, 'artifacts', 'skyline-runtime', 'node_modules');
  const dest = join(
    context.appOutDir,
    'resources',
    'skyline',
    'node_modules',
  );

  try {
    await access(src);
  } catch {
    throw new Error(
      `[afterPack] missing ${src} — run pack-desktop assembleRuntime first`,
    );
  }

  await mkdir(join(dest, '..'), { recursive: true });
  console.log(`[afterPack] copying node_modules → ${dest}`);
  // Workspace installs use symlinks; Windows pack needs real files.
  await cp(src, dest, { recursive: true, force: true, dereference: true });

  try {
    await access(join(dest, 'tsx', 'dist', 'esm', 'index.mjs'));
  } catch {
    throw new Error('[afterPack] tsx missing after copy — aborting pack');
  }
  console.log('[afterPack] tsx present ✓');
};
